// PeakTalent Auditor - team aggregation (runs as a GitHub Action in the private data repo, at 15:30 and 21:00 IST). v11.8.2
//
// Reads the hashed event batches the relay stored in events/, adds them to the running totals in state/totals.json,
// writes the team bundle shared/bundle.json that every extension downloads, and removes the processed batch files.
// Only hashes and counts are handled here: there is no document text anywhere in the data repo.
//
// Team rules (the same as each reviewer's local learning, but across the team):
//   - label scores: accepted / rejected per label, summed over everyone;
//   - hidden: a text rejected 5+ times by 2+ reviewers and never accepted is no longer suggested with that label;
//   - learned: a text reviewers labeled without a suggestion, by 3+ reviewers on 2+ tasks, is suggested to everyone.
// Usage: node aggregate.mjs [repoDir]
import fs from "fs";
import path from "path";

export const RULES = { hideRejects: 5, hideClients: 2, learnClients: 3, learnTasks: 2, keepIds: 50 };

export function emptyTotals() { return { version: 1, labels: {}, texts: {}, missed: {}, batches: 0, stats: emptyStats() }; }
// (v11.8.2) accuracy: per label accepted (a) / rejected (r) / missed (m), per day, and how many reviewers took part
function emptyStats() { return { labels: {}, days: {}, reviewers: [] }; }
const today = () => new Date().toISOString().slice(0, 10);

const addId = (arr, id, max) => { if (!arr.includes(id)) { arr.push(id); if (arr.length > max) arr.shift(); } };

// Add one batch ({ client, events }) to the totals; `day` is the day it was stored (YYYY-MM-DD).
export function addBatch(totals, batch, day = today()) {
  if (!batch || !Array.isArray(batch.events) || typeof batch.client !== "string") return totals;
  const st = totals.stats || (totals.stats = emptyStats());
  const d = st.days[day] || (st.days[day] = { a: 0, r: 0, m: 0, reviewers: [] });
  addId(d.reviewers, batch.client, 500);
  addId(st.reviewers, batch.client, 5000);
  const lab = (l) => st.labels[l] || (st.labels[l] = { a: 0, r: 0, m: 0 });
  for (const e of batch.events) {
    if (!e || typeof e.l !== "string") continue;
    if (e.k === "s" && (e.v === "a" || e.v === "r")) {
      const o = totals.labels[e.l] || (totals.labels[e.l] = { a: 0, r: 0 });
      o[e.v]++;
      lab(e.l)[e.v]++; d[e.v]++;
    } else if (e.k === "t" && /^[0-9a-f]{16}$/.test(e.h || "") && (e.v === "a" || e.v === "r")) {
      const key = e.l + "|" + e.h;
      const o = totals.texts[key] || (totals.texts[key] = { a: 0, r: 0, clients: [] });
      o[e.v]++;
      addId(o.clients, batch.client, RULES.keepIds);
    } else if (e.k === "m" && /^[0-9a-f]{16}$/.test(e.h || "") && /^[0-9a-f]{16}$/.test(e.task || "")) {
      lab(e.l).m++; d.m++;
      const key = e.l + "|" + e.h;
      const o = totals.missed[key] || (totals.missed[key] = { clients: [], tasks: [] });
      addId(o.clients, batch.client, RULES.keepIds);
      addId(o.tasks, e.task, RULES.keepIds);
    }
  }
  totals.batches++;
  return totals;
}

// The bundle every extension downloads: label scores, hidden texts and learned terms (hashes only).
export function buildBundle(totals, built = new Date().toISOString()) {
  const hidden = {}, learned = {};
  for (const [key, o] of Object.entries(totals.texts)) {
    if (o.a === 0 && o.r >= RULES.hideRejects && o.clients.length >= RULES.hideClients) {
      const [l, h] = key.split("|"); (hidden[l] || (hidden[l] = [])).push(h);
    }
  }
  for (const [key, o] of Object.entries(totals.missed)) {
    if (o.clients.length >= RULES.learnClients && o.tasks.length >= RULES.learnTasks) {
      const [l, h] = key.split("|");
      const t = totals.texts[key];
      if (t && t.a === 0 && t.r >= RULES.hideRejects) continue;   // the team rejects it with this label
      (learned[l] || (learned[l] = [])).push(h);
    }
  }
  for (const m of [hidden, learned]) for (const l of Object.keys(m)) m[l].sort();
  return { version: 1, built, labels: totals.labels, hidden, learned, stats: publicStats(totals) };
}

// (v11.8.2) The accuracy numbers in the bundle: counts only (reviewers as a number, never their ids), the last 30 days.
export function publicStats(totals) {
  const st = totals.stats || emptyStats();
  const days = {};
  for (const day of Object.keys(st.days).sort().slice(-30)) { const d = st.days[day]; days[day] = { a: d.a, r: d.r, m: d.m, reviewers: d.reviewers.length }; }
  const labels = {};
  for (const [l, o] of Object.entries(st.labels)) labels[l] = { a: o.a, r: o.r, m: o.m };
  return { labels, days, reviewers: st.reviewers.length };
}
const pct = (x, y) => (y ? Math.round(100 * x / y) + "%" : "-");
// Precision: of the suggestions reviewers acted on, how many were right. Coverage: of the labels reviewers saved, how many
// had been suggested.
export function accuracyOf(o) { return { precision: o.a + o.r ? o.a / (o.a + o.r) : null, coverage: o.a + o.m ? o.a / (o.a + o.m) : null }; }

// (v11.8.2) REPORT.md: the accuracy report, shown by GitHub as a page in the data repo.
export function reportMarkdown(bundle) {
  const s = bundle.stats || { labels: {}, days: {}, reviewers: 0 };
  const rows = Object.entries(s.labels).sort((x, y) => (y[1].a + y[1].r + y[1].m) - (x[1].a + x[1].r + x[1].m));
  const tot = rows.reduce((t, [, o]) => ({ a: t.a + o.a, r: t.r + o.r, m: t.m + o.m }), { a: 0, r: 0, m: 0 });
  const when = bundle.built ? new Date(bundle.built).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "-";
  const out = [];
  out.push("# PeakTalent Auditor - accuracy report", "");
  out.push(`Built ${when} from the team's reviews: **${s.reviewers} reviewers**, **${tot.a + tot.r + tot.m} decisions**.`, "");
  out.push("| | Accepted | Rejected | Missed | Precision | Coverage |", "|---|---:|---:|---:|---:|---:|");
  out.push(`| **All labels** | ${tot.a} | ${tot.r} | ${tot.m} | **${pct(tot.a, tot.a + tot.r)}** | **${pct(tot.a, tot.a + tot.m)}** |`);
  for (const [l, o] of rows) out.push(`| ${l} | ${o.a} | ${o.r} | ${o.m} | ${pct(o.a, o.a + o.r)} | ${pct(o.a, o.a + o.m)} |`);
  out.push("", "## By day", "", "| Day | Reviewers | Accepted | Rejected | Missed | Precision | Coverage |", "|---|---:|---:|---:|---:|---:|---:|");
  for (const [day, d] of Object.entries(s.days).sort().reverse()) out.push(`| ${day} | ${d.reviewers} | ${d.a} | ${d.r} | ${d.m} | ${pct(d.a, d.a + d.r)} | ${pct(d.a, d.a + d.m)} |`);
  out.push("", "## What the numbers mean", "",
    "- **Accepted**: a reviewer saved the label the auditor suggested, on the suggested text.",
    "- **Rejected**: a reviewer saved another label on a suggested text, or removed the suggested label.",
    "- **Missed**: a reviewer labeled text the auditor had not suggested.",
    "- **Precision** = accepted / (accepted + rejected): how often a suggestion the reviewer acted on was right.",
    "- **Coverage** = accepted / (accepted + missed): how many of the reviewers' labels the auditor had suggested.",
    "- Suggestions a reviewer simply ignored are not counted; each text counts once per reviewer and task. No document text is stored: only counts and hashes.", "");
  return out.join("\n");
}

function listEventFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const day of fs.readdirSync(dir).sort()) {
    const d = path.join(dir, day);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).sort()) if (f.endsWith(".json")) out.push(path.join(d, f));
  }
  return out;
}

export function run(repoDir) {
  const statePath = path.join(repoDir, "state", "totals.json");
  const totals = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : emptyTotals();
  const files = listEventFiles(path.join(repoDir, "events"));
  let bad = 0;
  if (!totals.stats) totals.stats = emptyStats();   // totals written by v11.8.0/11.8.1
  for (const f of files) {
    try { addBatch(totals, JSON.parse(fs.readFileSync(f, "utf8")), path.basename(path.dirname(f))); } catch (e) { bad++; }
    fs.unlinkSync(f);
  }
  for (const day of fs.existsSync(path.join(repoDir, "events")) ? fs.readdirSync(path.join(repoDir, "events")) : []) {
    const d = path.join(repoDir, "events", day);
    try { if (fs.statSync(d).isDirectory() && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch (e) {}
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(totals));
  fs.mkdirSync(path.join(repoDir, "shared"), { recursive: true });
  const bundle = buildBundle(totals);
  fs.writeFileSync(path.join(repoDir, "shared", "bundle.json"), JSON.stringify(bundle));
  fs.writeFileSync(path.join(repoDir, "REPORT.md"), reportMarkdown(bundle));
  return { files: files.length, bad, labels: Object.keys(bundle.labels).length,
    hidden: Object.values(bundle.hidden).reduce((n, a) => n + a.length, 0), learned: Object.values(bundle.learned).reduce((n, a) => n + a.length, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run(process.argv[2] || process.cwd());
  console.log(`processed ${r.files} batches (${r.bad} unreadable): ${r.labels} labels scored, ${r.hidden} texts hidden, ${r.learned} terms learned`);
}
