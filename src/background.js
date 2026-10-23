// PeakTalent Auditor - team sync (extension background service worker). v11.12.0
// All network traffic of the extension happens here, never on the review page: the page only hands over small batches of
// HASHED learning events, and reads the team bundle from extension storage. Nothing here can slow the page down.
//
// team-config.js (next to this file, NOT in git - the extension repo is public) sets:
//   self.PT_TEAM = { relay: "https://...workers.dev", key: "<team key>", salt: "<hash salt>" }
// Without it, team sync is off and the extension works exactly as before.
try { importScripts("team-config.js"); } catch (e) { /* no team config: sync off */ }

const TEAM = (self.PT_TEAM && /^https:\/\//.test(self.PT_TEAM.relay || "") && self.PT_TEAM.key && self.PT_TEAM.salt) ? self.PT_TEAM : null;
const Q = "pt_sync_queue", ST = "pt_sync_state", BUNDLE = "pt_team_bundle", ON = "pt_sync_enabled", SALT = "pt_team_salt", CLIENT = "pt_sync_client";
const MAX_QUEUE = 5000, BATCH = 1000, FLUSH_AT = 300, FLUSH_MIN = 15, BUNDLE_HOURS = 24, RECEIPT_HOURS = 6;
// (v11.8.1) the team works 11:00-20:30 IST; the team bundle is built at 15:30 and 21:00 IST (10:00 and 15:30 UTC)
const BUILD_SLOTS_UTC = [[10, 0], [15, 30]];
// The latest build time that has passed (with 10 minutes for the job to finish), as a timestamp.
function lastBuildSlot(now) {
  const d = new Date(now);
  let best = 0;
  for (let back = 0; back <= 1; back++) for (const [h, m] of BUILD_SLOTS_UTC) {
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, h, m) + 10 * 60e3;
    if (t <= now && t > best) best = t;
  }
  return best;
}
// Download the bundle when there is none, when a build has happened since ours was built (tried for 6 hours, as
// GitHub may start the job late), or when ours is more than a day old.
function needsBundle(stored, now) {
  if (!stored || !stored.data) return true;
  const slot = lastBuildSlot(now);
  const built = Date.parse(stored.data.built || "") || 0;
  if (built < slot - 10 * 60e3 && now - slot < 6 * 3600e3) return true;
  return now - (stored.fetched || 0) > BUNDLE_HOURS * 3600e3;
}

const get = (keys) => new Promise(r => chrome.storage.local.get(keys, v => r(v || {})));
const set = (obj) => new Promise(r => chrome.storage.local.set(obj, () => r()));
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");

async function setup() {
  const s = await get([CLIENT, ON]);
  const patch = {};
  if (!s[CLIENT]) patch[CLIENT] = hex(8);                    // a random id: says nothing about the reviewer
  if (s[ON] === undefined) patch[ON] = true;
  patch[SALT] = TEAM ? TEAM.salt : null;                      // the page hashes with it; the key never leaves this file
  await set(patch);
  try {
    chrome.alarms.create("pt-flush", { periodInMinutes: FLUSH_MIN });
    chrome.alarms.create("pt-bundle", { periodInMinutes: 60, delayInMinutes: 1 });
  } catch (e) {}
}

async function state(patch) { const s = (await get([ST]))[ST] || {}; if (patch) { Object.assign(s, patch); await set({ [ST]: s }); } return s; }

async function enqueue(events) {
  const ok = (events || []).filter(e => e && typeof e === "object" && typeof e.k === "string" && typeof e.l === "string" && !("text" in e)).slice(0, BATCH);
  if (!ok.length) return 0;
  const s = await get([Q, ON]);
  if (s[ON] === false) return 0;
  const q = (s[Q] || []).concat(ok).slice(-MAX_QUEUE);
  await set({ [Q]: q });
  if (q.length >= FLUSH_AT) flush();
  return ok.length;
}

let flushing = false;
async function flush() {
  if (!TEAM || flushing) return;
  flushing = true;
  try {
    const s = await get([Q, ON, CLIENT]);
    const q = s[Q] || [];
    if (s[ON] === false || !q.length) return;
    const events = q.slice(0, BATCH);
    const res = await fetch(TEAM.relay.replace(/\/+$/, "") + "/events", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Team-Key": TEAM.key },
      body: JSON.stringify({ client: s[CLIENT], version: chrome.runtime.getManifest().version, events }),
    });
    if (!res.ok) { await state({ lastError: "send failed (" + res.status + ")", lastErrorAt: Date.now() }); return; }
    const now = (await get([Q]))[Q] || [];
    await set({ [Q]: now.slice(events.length) });
    await state({ lastSent: Date.now(), sentTotal: ((await state()).sentTotal || 0) + events.length, lastError: null });
  } catch (e) {
    await state({ lastError: "offline or relay unreachable", lastErrorAt: Date.now() });
  } finally { flushing = false; }
}

function validBundle(b) {
  return b && typeof b === "object" && b.labels && typeof b.labels === "object" && b.hidden && typeof b.hidden === "object" && b.learned && typeof b.learned === "object";
}
async function fetchBundle(force) {
  if (!TEAM) return;
  const s = await get([BUNDLE, ON]);
  if (s[ON] === false) return;
  if (!force && !needsBundle(s[BUNDLE], Date.now())) return;
  try {
    const res = await fetch(TEAM.relay.replace(/\/+$/, "") + "/bundle", { headers: { "X-Team-Key": TEAM.key } });
    if (!res.ok) { await state({ lastError: "bundle failed (" + res.status + ")", lastErrorAt: Date.now() }); return; }
    const data = await res.json();
    if (!validBundle(data)) return;
    await set({ [BUNDLE]: { fetched: Date.now(), data } });
    await state({ lastError: null });   // an older error is no longer true
    await sendReceipt(true);
  } catch (e) {
    await state({ lastError: "offline or relay unreachable", lastErrorAt: Date.now() });
  }
}

// (v11.12.0) A RECEIPT tells the team which extension version and team bundle this reviewer runs: the random id, the
// version and the bundle's build time - nothing else. Sent after each bundle download and at least every 6 hours.
async function sendReceipt(force) {
  if (!TEAM) return;
  const s = await get([BUNDLE, ON, CLIENT]);
  if (s[ON] === false || !s[CLIENT]) return;
  const st = await state();
  if (!force && Date.now() - (st.lastReceipt || 0) < RECEIPT_HOURS * 3600e3) return;
  try {
    const b = s[BUNDLE] && s[BUNDLE].data;
    const res = await fetch(TEAM.relay.replace(/\/+$/, "") + "/seen", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Team-Key": TEAM.key },
      body: JSON.stringify({ client: s[CLIENT], version: chrome.runtime.getManifest().version, bundle: (b && typeof b.built === "string" && /^\d{4}-/.test(b.built)) ? b.built : null }),
    });
    if (res.ok) await state({ lastReceipt: Date.now() });
  } catch (e) { /* tried again at the next hourly check */ }
}

async function status() {
  const s = await get([Q, ON, BUNDLE, ST, CLIENT]);
  const b = s[BUNDLE] && s[BUNDLE].data;
  const st = s[ST] || {};
  return {
    client: s[CLIENT] || null, configured: !!TEAM, enabled: s[ON] !== false, queued: (s[Q] || []).length, lastSent: st.lastSent || null, sentTotal: st.sentTotal || 0,
    lastError: st.lastError || null, bundleBuilt: b ? b.built : null, bundleFetched: s[BUNDLE] ? s[BUNDLE].fetched : null,
    teamTerms: b ? Object.values(b.learned).reduce((n, a) => n + a.length, 0) : 0,
    teamHidden: b ? Object.values(b.hidden).reduce((n, a) => n + a.length, 0) : 0,
  };
}

chrome.runtime.onInstalled.addListener(() => { setup().then(() => fetchBundle(true)); });
chrome.runtime.onStartup.addListener(() => { setup().then(() => fetchBundle(false)); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "pt-flush") flush(); else if (a.name === "pt-bundle") fetchBundle(false).then(() => sendReceipt(false)); });
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string" || !msg.action.startsWith("pt-sync")) return false;
  (async () => {
    if (msg.action === "pt-sync-events") return { ok: true, queued: await enqueue(msg.events) };
    if (msg.action === "pt-sync-status") return Object.assign({ ok: true }, await status());
    if (msg.action === "pt-sync-toggle") { await set({ [ON]: !!msg.on }); if (!msg.on) await set({ [Q]: [] }); else fetchBundle(true); return Object.assign({ ok: true }, await status()); }
    if (msg.action === "pt-sync-now") { await flush(); await fetchBundle(true); return Object.assign({ ok: true }, await status()); }
    return { ok: false };
  })().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;   // answered asynchronously
});
setup();
