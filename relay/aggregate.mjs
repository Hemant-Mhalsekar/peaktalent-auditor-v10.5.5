// PeakTalent Auditor - nightly aggregation (runs as a GitHub Action in the private data repo). v11.8.0
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

export function emptyTotals() { return { version: 1, labels: {}, texts: {}, missed: {}, batches: 0 }; }

const addId = (arr, id, max) => { if (!arr.includes(id)) { arr.push(id); if (arr.length > max) arr.shift(); } };

// Add one batch ({ client, events }) to the totals.
export function addBatch(totals, batch) {
  if (!batch || !Array.isArray(batch.events) || typeof batch.client !== "string") return totals;
  for (const e of batch.events) {
    if (!e || typeof e.l !== "string") continue;
    if (e.k === "s" && (e.v === "a" || e.v === "r")) {
      const o = totals.labels[e.l] || (totals.labels[e.l] = { a: 0, r: 0 });
      o[e.v]++;
    } else if (e.k === "t" && /^[0-9a-f]{16}$/.test(e.h || "") && (e.v === "a" || e.v === "r")) {
      const key = e.l + "|" + e.h;
      const o = totals.texts[key] || (totals.texts[key] = { a: 0, r: 0, clients: [] });
      o[e.v]++;
      addId(o.clients, batch.client, RULES.keepIds);
    } else if (e.k === "m" && /^[0-9a-f]{16}$/.test(e.h || "") && /^[0-9a-f]{16}$/.test(e.task || "")) {
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
  return { version: 1, built, labels: totals.labels, hidden, learned };
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
  for (const f of files) {
    try { addBatch(totals, JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) { bad++; }
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
  return { files: files.length, bad, labels: Object.keys(bundle.labels).length,
    hidden: Object.values(bundle.hidden).reduce((n, a) => n + a.length, 0), learned: Object.values(bundle.learned).reduce((n, a) => n + a.length, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run(process.argv[2] || process.cwd());
  console.log(`processed ${r.files} batches (${r.bad} unreadable): ${r.labels} labels scored, ${r.hidden} texts hidden, ${r.learned} terms learned`);
}
