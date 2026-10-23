// (v11.8.2) Accuracy report: the team's numbers (from the team bundle) and your own (from your local learning), per label.
// Reads extension storage only; "Sync now" asks the background worker to fetch the newest team bundle.
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (x, y) => (y ? Math.round(100 * x / y) : null);
const MIN_RELIABLE = 50;   // fewer decisions than this: the numbers are shown with a warning

function get(keys) { return new Promise(r => { try { chrome.storage.local.get(keys, v => r(v || {})); } catch (e) { r({}); } }); }
function bg(msg) { return new Promise(r => { try { chrome.runtime.sendMessage(msg, (x) => { void chrome.runtime.lastError; r(x || null); }); } catch (e) { r(null); } }); }

// Your own numbers: accepted / rejected per label, missed = labels you added without a suggestion (one per task)
function mine(learning) {
  const labels = {};
  const lab = (l) => labels[l] || (labels[l] = { a: 0, r: 0, m: 0 });
  if (learning && learning.labels) for (const [l, o] of Object.entries(learning.labels)) { lab(l).a += o.a | 0; lab(l).r += o.r | 0; }
  if (learning && learning.missed) for (const [k, o] of Object.entries(learning.missed)) { const l = k.split("\u0001")[0]; lab(l).m += (o && Array.isArray(o.tasks)) ? o.tasks.length : 0; }
  return { labels, days: null, reviewers: 1 };
}

function meter(p) {
  if (p === null) return '<span class="muted">-</span>';
  const cls = p >= 85 ? "good" : p >= 60 ? "mid" : "low";
  const span = document.createElement("span");
  span.className = "meter";
  span.innerHTML = `<span>${p}%</span><i><b class="${cls}" style="width:${p}%"></b></i>`;
  return span.outerHTML;
}
function cell(tr, html) { const td = document.createElement("td"); td.innerHTML = html; tr.appendChild(td); }
function textCell(tr, text) { const td = document.createElement("td"); td.textContent = text; tr.appendChild(td); }

let view = "team", data = { team: null, me: null, built: null, fetched: null };

function render() {
  const s = view === "team" ? data.team : data.me;
  const rows = $("rows"); rows.textContent = "";
  const days = $("days"); days.textContent = "";
  const entries = s ? Object.entries(s.labels).sort((x, y) => (y[1].a + y[1].r + y[1].m) - (x[1].a + x[1].r + x[1].m)) : [];
  const t = entries.reduce((o, [, v]) => ({ a: o.a + v.a, r: o.r + v.r, m: o.m + v.m }), { a: 0, r: 0, m: 0 });
  const dec = t.a + t.r + t.m;
  const pp = pct(t.a, t.a + t.r), cv = pct(t.a, t.a + t.m);
  $("c-prec").textContent = pp === null ? "-" : pp + "%";
  $("c-cov").textContent = cv === null ? "-" : cv + "%";
  $("c-dec").textContent = fmt(dec);
  // the fourth card: how many reviewers (team) or the labels you used (you)
  $("c-who-k").textContent = view === "team" ? "Reviewers" : "Labels used";
  $("c-who").textContent = view === "team" ? fmt(s ? s.reviewers : 0) : fmt(entries.length);
  $("c-who-h").textContent = view === "team" ? (s && s.team ? `${s.team.upToDate} of ${s.team.reviewers} up to date (v${s.team.latestVersion})` : "in the team data") : "on this computer";

  const small = $("small");
  if (!s || dec === 0) {
    small.hidden = false;
    small.textContent = view === "team"
      ? (data.team ? "No team decisions in the bundle yet. Numbers appear after reviewers work with the extension and the team bundle is built (15:30 and 21:00 IST, or by hand in the data repo)." : "No team bundle yet: team sync is off or has not synced. Click Sync now.")
      : "No decisions on this computer yet: review a task with the extension and save some labels.";
  } else if (dec < MIN_RELIABLE) {
    small.hidden = false;
    small.textContent = `Only ${dec} decisions so far: the numbers will move a lot until there are a few hundred. Treat them as an early indication.`;
  } else small.hidden = true;

  if (entries.length) {
    const tr = document.createElement("tr"); tr.className = "total";
    textCell(tr, "All labels"); textCell(tr, fmt(t.a)); textCell(tr, fmt(t.r)); textCell(tr, fmt(t.m)); cell(tr, meter(pp)); cell(tr, meter(cv));
    rows.appendChild(tr);
  }
  for (const [l, v] of entries) {
    const tr = document.createElement("tr");
    textCell(tr, l); textCell(tr, fmt(v.a)); textCell(tr, fmt(v.r)); textCell(tr, fmt(v.m));
    cell(tr, meter(pct(v.a, v.a + v.r))); cell(tr, meter(pct(v.a, v.a + v.m)));
    rows.appendChild(tr);
  }
  const ds = s && s.days ? Object.entries(s.days).sort().reverse() : [];
  $("days-sec").hidden = !ds.length;
  for (const [day, d] of ds) {
    const tr = document.createElement("tr");
    textCell(tr, day); textCell(tr, fmt(d.reviewers)); textCell(tr, fmt(d.a)); textCell(tr, fmt(d.r)); textCell(tr, fmt(d.m));
    cell(tr, meter(pct(d.a, d.a + d.r))); cell(tr, meter(pct(d.a, d.a + d.m)));
    days.appendChild(tr);
  }
  const built = data.built ? new Date(data.built).toLocaleString() : null;
  $("sub").textContent = view === "team"
    ? (built ? `Team data built ${built}` + (data.fetched ? ` · downloaded ${new Date(data.fetched).toLocaleString()}` : "") : "No team bundle yet")
    : "Your own decisions, on this computer";
  $("foot").textContent = "PeakTalent Auditor v" + chrome.runtime.getManifest().version + " · counts and hashes only, no document text";
  $("tab-team").classList.toggle("on", view === "team"); $("tab-me").classList.toggle("on", view === "me");
}

async function load() {
  const s = await get(["pt_team_bundle", "pt_learning_v1"]);
  const b = s.pt_team_bundle;
  data.team = b && b.data ? (b.data.stats || { labels: {}, days: {}, reviewers: 0 }) : null;
  data.built = b && b.data ? b.data.built : null;
  data.fetched = b ? b.fetched : null;
  data.me = mine(s.pt_learning_v1);
  render();
}

$("tab-team").addEventListener("click", () => { view = "team"; render(); });
$("tab-me").addEventListener("click", () => { view = "me"; render(); });
$("sync").addEventListener("click", async () => {
  $("sync").disabled = true; $("sync").textContent = "Syncing…";
  await bg({ action: "pt-sync-now" });
  await load();
  $("sync").disabled = false; $("sync").textContent = "Sync now";
});
load();
