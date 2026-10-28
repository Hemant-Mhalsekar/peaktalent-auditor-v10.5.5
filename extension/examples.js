// (v11.14.0) My examples: the reviewer's own rejected suggestions, missed labels, unlabeled suggestions and rule breaks,
// read from the local learning store. Nothing on this page is sent anywhere; "Copy as text" puts it on the clipboard.
const $ = (id) => document.getElementById(id);
const MAX_ROWS = 300;
const get = (keys) => new Promise(r => { try { chrome.storage.local.get(keys, v => r(v || {})); } catch (e) { r({}); } });
const split = (k) => { const i = k.indexOf("\u0001"); return i < 0 ? [k, ""] : [k.slice(0, i), k.slice(i + 1)]; };

// the four lists, newest / most frequent first
function lists(learning) {
  const L = learning || {};
  const rej = Object.entries(L.texts || {}).filter(([, o]) => o && o.r > 0).map(([k, o]) => { const [label, text] = split(k); return { text, label, to: o.to === undefined ? null : o.to, r: o.r | 0, a: o.a | 0, t: o.t || 0 }; })
    .sort((x, y) => y.r - x.r || y.t - x.t);
  const mis = Object.entries(L.missed || {}).map(([k, o]) => { const [label, text] = split(k); return { text, label, n: (o && Array.isArray(o.tasks)) ? o.tasks.length : 0, t: (o && o.t) || 0 }; })
    .filter(x => x.n > 0).sort((x, y) => y.n - x.n || y.t - x.t);
  const ign = Object.entries(L.ignored || {}).map(([k, o]) => { const [label, text] = split(k); return { text, label, n: (o && o.n) | 0, t: (o && o.t) || 0 }; })
    .sort((x, y) => y.n - x.n || y.t - x.t);
  const wro = Object.entries(L.wrong || {}).map(([k, o]) => { const [label, text] = split(k); return { text, label, expected: (o && o.expected) || "", n: (o && o.n) | 0, t: (o && o.t) || 0 }; })
    .sort((x, y) => y.n - x.n || y.t - x.t);
  return { rej, mis, ign, wro };
}

let all = { rej: [], mis: [], ign: [], wro: [] };
const used = (x) => x.to === null ? "-" : x.to === "" ? "(removed)" : x.to;
const COLS = {
  rej: (x) => [x.text, x.label, used(x), x.r, x.a],
  mis: (x) => [x.text, x.label, x.n],
  ign: (x) => [x.text, x.label, x.n],
  wro: (x) => [x.text, x.label, x.expected, x.n],
};
function filtered(rows) {
  const lab = $("label").value, q = $("q").value.trim().toLowerCase();
  return rows.filter(x => (!lab || x.label === lab) && (!q || x.text.toLowerCase().includes(q)));
}
function render() {
  for (const part of Object.keys(COLS)) {
    const rows = filtered(all[part]);
    const body = $(part); body.textContent = "";
    $("n-" + part).textContent = "(" + rows.length + ")";
    if (!rows.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.className = "empty"; td.textContent = "Nothing here yet."; tr.appendChild(td); body.appendChild(tr); continue; }
    for (const x of rows.slice(0, MAX_ROWS)) {
      const tr = document.createElement("tr");
      COLS[part](x).forEach((v, i) => { const td = document.createElement("td"); td.textContent = String(v); if (i === 0) td.className = "t"; else if (typeof v === "string") td.className = "l"; tr.appendChild(td); });
      body.appendChild(tr);
    }
    if (rows.length > MAX_ROWS) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.className = "more"; td.textContent = `Showing ${MAX_ROWS} of ${rows.length}. Use the label filter or search to narrow it down.`; tr.appendChild(td); body.appendChild(tr); }
  }
}
// plain text for a chat message: one block per list, tab-separated
function asText() {
  const head = { rej: "Suggestions I rejected\ttext\tsuggested\tI used\trejected\taccepted", mis: "Labels the auditor missed\ttext\tmy label\tfiles",
    ign: "Suggestions I left unlabeled\ttext\tsuggested\tfiles", wro: "Labels the check marked wrong\ttext\tmy label\tcheck says\ttimes" };
  const out = [];
  for (const part of Object.keys(COLS)) {
    const rows = filtered(all[part]);
    if (!rows.length) continue;
    out.push("## " + head[part].split("\t")[0], head[part].split("\t").slice(1).join("\t"));
    for (const x of rows.slice(0, MAX_ROWS)) out.push(COLS[part](x).map(v => String(v).replace(/[\t\r\n]+/g, " ")).join("\t"));
    out.push("");
  }
  return out.join("\n") || "No examples yet.";
}
async function copy() {
  const text = asText();
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (x) {} ta.remove(); }
  $("copy").textContent = "Copied"; setTimeout(() => { $("copy").textContent = "Copy as text"; }, 1500);
  return text;
}

async function load() {
  const s = await get(["pt_learning_v1"]);
  all = lists(s.pt_learning_v1);
  const labels = new Set([...all.rej, ...all.mis, ...all.ign, ...all.wro].map(x => x.label));
  const sel = $("label");
  for (const l of [...labels].sort()) { const o = document.createElement("option"); o.value = l; o.textContent = l; sel.appendChild(o); }
  const n = all.rej.length + all.mis.length + all.ign.length + all.wro.length;
  $("sub").textContent = n ? `${n} examples from your reviews` : "No examples yet: they appear as you review files with the auditor on.";
  let v = ""; try { v = chrome.runtime.getManifest().version; } catch (e) {}
  $("foot").textContent = v ? "PeakTalent Auditor v" + v : "";
  render();
}
$("label").addEventListener("change", render);
$("q").addEventListener("input", render);
$("copy").addEventListener("click", copy);
window.__ptExamples = { lists, asText, copy, load };
load();
