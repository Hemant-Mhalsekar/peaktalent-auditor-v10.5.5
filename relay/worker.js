// PeakTalent Auditor - team relay (Cloudflare Worker, free plan). v11.13.0
//
// The extensions of all reviewers send their learning here, already HASHED (no document text ever leaves a reviewer's
// browser). The relay checks every batch and stores it in the private data repo on GitHub; it also hands out the team
// bundle that the nightly GitHub Action builds. The GitHub token stays here, as a Cloudflare secret.
//
// Settings (Cloudflare -> the worker -> Settings -> Variables and Secrets):
//   GITHUB_TOKEN  (secret)  fine-grained token: only the data repo, Contents read/write
//   GITHUB_REPO   (text)    "owner/repo" of the private data repo
//   TEAM_KEY      (secret)  the key in every reviewer's extension (team-config.js); requests without it are refused
//
// Endpoints:
//   GET  /         health check
//   POST /events   { client, version, events: [...] }  -> events/YYYY-MM-DD/<client>-<time>.json in the data repo
//   POST /seen     { client, version, bundle }  -> seen/YYYY-MM-DD/<client>-<time>.json (v11.12.0: who runs which
//                  extension version and which team bundle; shown in REPORT.md)
//   GET  /bundle   the team bundle (shared/bundle.json), cached for 10 minutes

export const LABELS = [
  "Account Number", "Address", "Business Name", "Contact Number", "Credentials", "Date", "Email Address", "IP Address",
  "Overscrubbed", "Person Name", "URL/Link", "Person Username", "Vehicle Number Plate",
  // the newer label set (same engine)
  "Indian Mobile Number", "International Phone Number", "Postal Code", "Indonesian Postal Code", "Brazilian CEP",
];
const HASH = /^[0-9a-f]{16}$/;
const MAX_BODY = 256 * 1024;
const MAX_EVENTS = 1000;

// One event, checked field by field. Anything else (above all: any text) makes the whole batch invalid.
// Kinds: s = a label accepted / rejected; t = the same for one text; m = a text labeled that was not suggested;
// (v11.13.0) i = a suggestion left without a label when L1 submitted; w = a label the rule check marks wrong;
// x = L2 removed / changed a label L1 made; y = L2 added a label L1 did not make. "st" = the stage: "1" (L1) or "2" (L2).
export function validEvent(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const keys = Object.keys(e);
  if (!LABELS.includes(e.l)) return false;
  if (e.st !== undefined && e.st !== "1" && e.st !== "2") return false;
  if (e.k === "s") return keys.every(k => ["k", "l", "v", "st"].includes(k)) && (e.v === "a" || e.v === "r");
  if (e.k === "t") return keys.every(k => ["k", "l", "h", "v", "st"].includes(k)) && HASH.test(e.h) && (e.v === "a" || e.v === "r");
  if (["m", "i", "w", "x", "y"].includes(e.k)) return keys.every(k => ["k", "l", "h", "task", "st"].includes(k)) && HASH.test(e.h) && HASH.test(e.task);
  return false;
}
export function validBatch(b) {
  return !!b && typeof b === "object" && /^[0-9a-f]{16,40}$/.test(b.client || "") && /^\d+\.\d+\.\d+$/.test(b.version || "") &&
    Array.isArray(b.events) && b.events.length > 0 && b.events.length <= MAX_EVENTS && b.events.every(validEvent) &&
    Object.keys(b).every(k => ["client", "version", "events"].includes(k));
}

// (v11.12.0) a receipt: the random reviewer id, the extension version and the build time of the bundle it holds
export function validSeen(b) {
  return !!b && typeof b === "object" && !Array.isArray(b) && /^[0-9a-f]{16,40}$/.test(b.client || "") && /^\d+\.\d+\.\d+$/.test(b.version || "") &&
    (b.bundle === null || (typeof b.bundle === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(b.bundle))) &&
    Object.keys(b).every(k => ["client", "version", "bundle"].includes(k));
}

function sameKey(a, b) {   // constant-time comparison
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !b) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json" }, extra) });
const b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); };

async function github(env, method, path, body) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": method === "GET" ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "User-Agent": "pt-auditor-relay", "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) return new Response("PeakTalent relay ok", { status: 200 });
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.TEAM_KEY) return json({ error: "relay not configured" }, 500);
    if (!sameKey(request.headers.get("X-Team-Key") || "", env.TEAM_KEY)) return json({ error: "unauthorized" }, 401);

    if (request.method === "POST" && url.pathname === "/events") {
      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > MAX_BODY) return json({ error: "too large" }, 413);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: "too large" }, 413);
      let batch;
      try { batch = JSON.parse(text); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!validBatch(batch)) return json({ error: "invalid batch" }, 400);
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const path = `events/${day}/${batch.client}-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}.json`;
      const res = await github(env, "PUT", path, { message: `events ${day} (${batch.events.length})`, content: b64(JSON.stringify(batch)) });
      if (!res.ok) return json({ error: "storage failed", status: res.status }, 502);
      return json({ ok: true, stored: batch.events.length });
    }

    if (request.method === "POST" && url.pathname === "/seen") {
      const text = await request.text();
      if (text.length > 1024) return json({ error: "too large" }, 413);
      let b;
      try { b = JSON.parse(text); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!validSeen(b)) return json({ error: "invalid receipt" }, 400);
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const rec = { client: b.client, version: b.version, bundle: b.bundle, at: now.toISOString() };
      const res = await github(env, "PUT", `seen/${day}/${b.client}-${now.getTime()}.json`, { message: `seen ${day}`, content: b64(JSON.stringify(rec)) });
      if (!res.ok) return json({ error: "storage failed", status: res.status }, 502);
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/bundle") {
      const cache = typeof caches !== "undefined" ? caches.default : null;
      const cacheKey = new Request(url.origin + "/bundle-cache");
      if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }
      const res = await github(env, "GET", "shared/bundle.json");
      if (res.status === 404) return json({ version: 1, built: null, labels: {}, hidden: {}, learned: {} });
      if (!res.ok) return json({ error: "storage failed", status: res.status }, 502);
      const out = new Response(await res.text(), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "max-age=600" } });
      if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }
    return json({ error: "not found" }, 404);
  },
};
