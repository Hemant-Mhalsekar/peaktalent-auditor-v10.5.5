// (v11.8.0) Team sync. Part 1: the background worker (src/background.js) with chrome.* and the network stubbed.
// Part 2: the engine on a review page: it sends only HASHED events, uses the team bundle (scores, hidden texts, learned
// terms) and never touches the network. Every value is synthetic. Run: node tests/dom_sync.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-hook.js'), 'utf8');

let pass = 0, fail = 0;
const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };
const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
const TEAM = { relay: 'https://relay.test', key: 'k'.repeat(48), salt: 's'.repeat(48) };

// ---------------- part 1: background ----------------
function background({ team = TEAM, net = 'ok' } = {}) {
  const store = {}, listeners = { msg: [], alarm: [], installed: [], startup: [] }, sent = [], alarms = {};
  const chrome = {
    storage: { local: { get: (k, cb) => { const o = {}; for (const x of [].concat(k)) if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); cb(o); }, set: (o, cb) => { Object.assign(store, JSON.parse(JSON.stringify(o))); cb && cb(); } } },
    alarms: { create: (n, o) => { alarms[n] = o; }, onAlarm: { addListener: f => listeners.alarm.push(f) } },
    runtime: { getManifest: () => ({ version: '11.8.0' }), onMessage: { addListener: f => listeners.msg.push(f) }, onInstalled: { addListener: f => listeners.installed.push(f) }, onStartup: { addListener: f => listeners.startup.push(f) } },
  };
  const fetch = async (url, init = {}) => {
    sent.push({ url, init });
    if (net === 'down') throw new Error('offline');
    if (String(url).endsWith('/bundle')) return { ok: true, status: 200, json: async () => ({ version: 1, built: '2026-10-22T20:30:00Z', labels: { 'Person Name': { a: 30, r: 2 } }, hidden: {}, learned: { 'Business Name': ['00112233aabbccdd'] } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const ctx = { chrome, fetch, crypto: require('crypto').webcrypto, console, setTimeout, Date, JSON, Math, Uint8Array, Array, Object, Promise, String, Number,
    importScripts: () => { if (!team) throw new Error('no file'); ctx.self.PT_TEAM = team; } };
  ctx.self = ctx;
  vm.createContext(ctx); vm.runInContext(bgSrc, ctx);
  const ask = (msg) => new Promise(r => { const ret = listeners.msg[0](msg, {}, r); if (ret !== true) r(undefined); });
  return { store, sent, alarms, ask, listeners, ctx };
}

// ---------------- part 2: the engine on a page ----------------
const PAL = { 'Person Name': [22, 119, 255], 'Business Name': [19, 194, 194], 'Email Address': [56, 158, 13] };
const IDS = { 'Person Name': 'id-person', 'Business Name': 'id-business', 'Email Address': 'id-email' };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const LINES = ['Hi Rahul Sharma, welcome aboard.', 'We deploy with Zorblax every week.', 'Check the logs today.'];
async function page({ storage = {}, task = 't1', path: urlPath = '/review', right = [] } = {}) {
  const TASK = `https://api.peaktalent.ai/api/v1/tasks/${task}/annotation-review`;
  const dom = new JSDOM(`<!doctype html><body><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${LINES.map(l => `<div>${l}</div>`).join('')}</div><div id="right">${LINES.map(l => `<div>${l}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai' + urlPath, pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () { if (this === Lp) return box(40, 100, 600, 700); if (this === Rp) return box(720, 100, 600, 700); if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20); return box(0, 0, 0, 0); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const messages = [], net = [];
  const store = Object.assign({}, storage);
  w.chrome = {
    storage: { local: { get: (k, cb) => { const o = {}; for (const x of [].concat(k)) if (x in store) o[x] = store[x]; setTimeout(() => cb(o), 5); }, set: (o, cb) => { Object.assign(store, o); cb && cb(); } }, onChanged: { addListener: () => {} } },
    runtime: { id: 'test', sendMessage: (m, cb) => { messages.push(m); cb && cb({ ok: true }); }, onMessage: { addListener: () => {}, removeListener: () => {} } },
  };
  w.fetch = async (url) => {
    net.push(String(url));
    if (String(url) === TASK) return new Response(JSON.stringify({ task_id: task, labels: Object.entries(IDS).map(([title, id]) => ({ id, slug: id, title, color: '#000' })), left_annotations: [], right_annotations: right }), { status: 200 });
    if (/\/api\/v1\/(?:submissions|reviews\/[^/]+\/approve)$/.test(String(url))) return new Response('{}', { status: 201 });
    if (String(url).startsWith(TASK + '/annotations/')) return new Response('{}', { status: 200 });
    if (String(url) === TASK + '/annotations') return new Response(JSON.stringify({ ids: ['n1'] }), { status: 201 });
    return new Response('{}', { status: 404 });
  };
  w.eval(hook);
  await w.fetch(TASK);
  w.__PT_TEST__ = true; w.eval(src);
  await settle();
  const save = async (text, label) => { await w.fetch(TASK + '/annotations', { method: 'POST', body: JSON.stringify({ spans: [{ label_id: IDS[label], start: 0, end: text.length, text }] }) }); await settle(300); };
  const tags = (text) => Array.from(Rp.querySelectorAll('.pt-tag')).filter(t => t.textContent === text);
  const remove = async (id) => { await w.fetch(TASK + '/annotations/' + id, { method: 'DELETE' }); await settle(300); };
  const finish = async (l2) => { await w.fetch(l2 ? 'https://api.peaktalent.ai/api/v1/reviews/r9/approve' : 'https://api.peaktalent.ai/api/v1/submissions', { method: 'POST', body: '{}' }); await settle(3500); };
  // the reviewer's label drawn the way the dashboard does (a <mark> in the label's colour), for the label check
  const mark = async (word, label) => {
    const [r, g, b] = PAL[label];
    const div = Array.from(Rp.querySelectorAll('div')).find(d => d.textContent.includes(word));
    div.innerHTML = div.innerHTML.replace(word, `<mark role="button" style="background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));">${word}</mark>`);
    await settle(900);
  };
  const events = () => messages.filter(m => m.action === 'pt-sync-events').flatMap(m => m.events);
  return { w, save, remove, finish, mark, events, tags, messages, net, close: () => w.__pt_cleanup && w.__pt_cleanup() };
}

(async () => {
  // background: configured
  {
    const b = background();
    await settle(50);
    check(b.store.pt_team_salt === TEAM.salt && /^[0-9a-f]{16}$/.test(b.store.pt_sync_client) && b.store.pt_sync_enabled === true, 'setup: the page gets the salt (not the key), a random client id, sync on', { salt: !!b.store.pt_team_salt, client: b.store.pt_sync_client });
    check(!JSON.stringify(b.store).includes(TEAM.key), 'the team key is never written to storage');
    check(b.alarms['pt-flush'] && b.alarms['pt-flush'].periodInMinutes === 15 && b.alarms['pt-bundle'], 'alarms: sending every 15 minutes, bundle check hourly', b.alarms);
    const r = await b.ask({ action: 'pt-sync-events', events: [{ k: 's', l: 'Person Name', v: 'a' }, { k: 't', l: 'Person Name', h: '0123456789abcdef', v: 'a', text: 'Rahul' }] });
    check(r.queued === 1 && b.store.pt_sync_queue.length === 1, 'an event carrying text is dropped before it is queued', r);
    b.listeners.alarm[0]({ name: 'pt-flush' }); await settle(50);
    const post = b.sent.find(x => x.url === 'https://relay.test/events');
    check(post && post.init.headers['X-Team-Key'] === TEAM.key && JSON.parse(post.init.body).events.length === 1 && b.store.pt_sync_queue.length === 0, 'flush: one POST with the team key, the queue is emptied', post && post.init.body);
    const st = await b.ask({ action: 'pt-sync-now' });
    check(st.teamTerms === 1 && b.store.pt_team_bundle && b.store.pt_team_bundle.data.labels['Person Name'].a === 30, 'the team bundle is fetched and kept', st);
    // (v11.12.0) a receipt after the bundle download: id, version, bundle date (nothing else)
    const seen = b.sent.filter(x => x.url === 'https://relay.test/seen');
    const body = seen.length && JSON.parse(seen[seen.length - 1].init.body);
    check(body && body.client === b.store.pt_sync_client && body.version === '11.8.0' && body.bundle === '2026-10-22T20:30:00Z' && Object.keys(body).length === 3 && seen[0].init.headers['X-Team-Key'] === TEAM.key, 'a receipt is sent after the bundle download', body);
    check(st.client === b.store.pt_sync_client, 'the status shows the reviewer their own id', st.client);
    b.store.pt_team_bundle.data.built = new Date().toISOString(); b.store.pt_team_bundle.fetched = Date.now();   // a fresh bundle: the hourly check fetches nothing
    const n0 = b.sent.filter(x => x.url === 'https://relay.test/seen').length;
    b.listeners.alarm[0]({ name: 'pt-bundle' }); await settle(50);
    check(b.sent.filter(x => x.url === 'https://relay.test/seen').length === n0, 'no second receipt within 6 hours');
    b.store.pt_sync_state.lastReceipt = Date.now() - 7 * 3600e3;
    b.listeners.alarm[0]({ name: 'pt-bundle' }); await settle(50);
    check(b.sent.filter(x => x.url === 'https://relay.test/seen').length === n0 + 1, 'after 6 hours the hourly check sends a receipt again');
    const off = await b.ask({ action: 'pt-sync-toggle', on: false });
    await b.ask({ action: 'pt-sync-events', events: [{ k: 's', l: 'Person Name', v: 'a' }] });
    check(off.enabled === false && (b.store.pt_sync_queue || []).length === 0, 'switched off: nothing is queued or sent', off);
  }
  // background: offline keeps the queue; no team config means no network at all
  {
    const b = background({ net: 'down' });
    await settle(50);
    await b.ask({ action: 'pt-sync-events', events: [{ k: 's', l: 'Person Name', v: 'r' }] });
    const st = await b.ask({ action: 'pt-sync-now' });
    check(st.queued === 1 && /offline/.test(st.lastError || ''), 'offline: the events wait in the queue', st);
    // a later successful bundle download clears the old error (the popup showed "bundle failed (500)" after it had worked)
    const b2 = background();
    await settle(50);
    b2.store.pt_sync_state = { lastError: 'bundle failed (500)' };
    const s3 = await b2.ask({ action: 'pt-sync-now' });
    check(!s3.lastError && s3.bundleFetched, 'a successful bundle download clears an old error', s3);
    // (v11.8.1) the bundle is fetched after each build (15:30 and 21:00 IST), not just once a day
    {
      const D = (iso) => Date.parse(iso);
      const at = (built, fetched) => ({ fetched: D(fetched), data: { built } });
      const nb = b2.ctx.needsBundle;
      check(nb(null, D('2026-10-23T06:00:00Z')) === true, 'no bundle yet -> fetch');
      check(nb(at('2026-10-22T15:31:00Z', '2026-10-23T05:40:00Z'), D('2026-10-23T08:00:00Z')) === false, 'morning, bundle from last night -> no fetch');
      check(nb(at('2026-10-22T15:31:00Z', '2026-10-23T09:00:00Z'), D('2026-10-23T10:20:00Z')) === true, 'after the 15:30 IST build -> fetch');
      check(nb(at('2026-10-23T10:02:00Z', '2026-10-23T10:20:00Z'), D('2026-10-23T11:20:00Z')) === false, 'already have the 15:30 IST bundle -> no fetch');
      check(nb(at('2026-10-23T10:02:00Z', '2026-10-23T11:00:00Z'), D('2026-10-23T15:50:00Z')) === true, 'after the 21:00 IST build -> fetch');
      check(nb(at('2026-10-22T15:31:00Z', '2026-10-23T10:20:00Z'), D('2026-10-23T11:20:00Z')) === true, 'the build was late (old bundle came back) -> keep trying');
    }
    const n = background({ team: null });
    await settle(50);
    const s2 = await n.ask({ action: 'pt-sync-now' });
    check(s2.configured === false && n.sent.length === 0 && !n.store.pt_team_salt, 'without team-config.js: sync is off and nothing is sent', s2);
  }

  // engine: hashed events only
  {
    const p = await page({ storage: { pt_team_salt: TEAM.salt, pt_sync_enabled: true } });
    await p.save('Rahul Sharma', 'Person Name');      // the suggestion accepted
    await p.save('Zorblax', 'Business Name');         // not suggested: a missed term
    await settle(3500);
    const events = p.messages.filter(m => m.action === 'pt-sync-events').flatMap(m => m.events);
    const all = JSON.stringify(events);
    check(events.some(e => e.k === 's' && e.l === 'Person Name' && e.v === 'a') && events.some(e => e.k === 't' && /^[0-9a-f]{16}$/.test(e.h)) && events.some(e => e.k === 'm' && e.l === 'Business Name' && /^[0-9a-f]{16}$/.test(e.task)), 'decisions are sent as hashed events', events);
    check(!/rahul|sharma|zorblax|t1/i.test(all), 'no document text and no task id leaves the page', all);
    check(p.net.every(u => u.startsWith('https://api.peaktalent.ai/')), 'the page itself makes no network request', p.net);
    p.close();
  }
  // engine: the team bundle is used
  {
    const p0 = await page({ storage: { pt_team_salt: TEAM.salt } });
    const hZ = p0.w.__PT__.teamHash('Zorblax'), hR = p0.w.__PT__.teamHash('Rahul Sharma');
    p0.close();
    const bundle = { fetched: Date.now(), data: { version: 1, built: 'x', labels: { 'Person Name': { a: 2, r: 40 } }, hidden: {}, learned: { 'Business Name': [hZ] } } };
    const p = await page({ storage: { pt_team_salt: TEAM.salt, pt_team_bundle: bundle } });
    const z = p.tags('Zorblax')[0];
    check(z && z.getAttribute('data-label') === 'Business Name' && /learned from the team/.test(z.title), 'a term the team learned is suggested', z && z.title);
    const r = p.tags('Rahul Sharma')[0];
    check(r && r.classList.contains('pt-low'), 'a label the team mostly rejects is faded', r && r.className);
    p.close();
    const p2 = await page({ storage: { pt_team_salt: TEAM.salt, pt_team_bundle: { fetched: Date.now(), data: { version: 1, labels: {}, hidden: { 'Person Name': [hR] }, learned: {} } } } });
    check(p2.tags('Rahul Sharma').length === 0, 'a text the team rejects is no longer suggested', p2.tags('Rahul Sharma').length);
    p2.close();
    const p3 = await page({ storage: { pt_team_salt: TEAM.salt, pt_sync_enabled: false } });
    await p3.save('Rahul Sharma', 'Person Name'); await settle(3500);
    check(!p3.messages.some(m => m.action === 'pt-sync-events'), 'sync switched off: nothing is sent', p3.messages);
    p3.close();
  }
  // (v11.13.0) L1 / L2 learning
  {
    // L1: a suggestion left without a label is "ignored" at Submit; a label the check marks wrong is a rule break
    const p = await page({ storage: { pt_team_salt: TEAM.salt }, path: '/tasks/t1' });
    await p.mark('today', 'Person Name');
    await p.save('Zorblax', 'Business Name');
    await p.finish(false);
    const ev = p.events();
    const ign = ev.filter(e => e.k === 'i');
    check(ign.some(e => e.l === 'Person Name' && /^[0-9a-f]{16}$/.test(e.h) && /^[0-9a-f]{16}$/.test(e.task) && e.st === '1'), 'L1 submit: the unlabeled suggestion (Rahul Sharma) is sent as ignored', ev);
    check(!ign.some(e => e.l === 'Business Name'), 'L1 submit: a labeled text is not ignored', ign);
    check(ev.some(e => e.k === 'w' && e.l === 'Person Name' && e.st === '1'), 'L1 submit: a label the check marks wrong is sent as a rule break', ev.filter(e => e.k === 'w'));
    check(ev.filter(e => e.k === 'm' || e.k === 's' || e.k === 't').every(e => e.st === '1'), 'L1: every event carries the stage', ev);
    check(!/rahul|sharma|zorblax|today|t1/i.test(JSON.stringify(ev)), 'L1: no text and no task id leaves the page', JSON.stringify(ev));
    const n = ev.length;
    await p.finish(false);
    check(p.events().length === n, 'a second Submit of the same file sends nothing again');
    p.close();
  }
  {
    // (v11.14.0) the same finished L1 file, kept on this computer for "My examples": what you used instead, unlabeled, marked wrong
    const p = await page({ storage: {}, path: '/tasks/t7' });
    await p.mark('today', 'Person Name');
    await p.save('Rahul Sharma', 'Business Name');      // the suggestion (Person Name) rejected: another label used
    await p.finish(false);
    const L = p.w.__PT__.learning();
    const rej = L.texts['Person Name\u0001Rahul Sharma'];
    check(rej && rej.r === 1 && rej.to === 'Business Name', 'kept locally: a rejected suggestion with the label used instead', L.texts);
    check(L.wrong['Person Name\u0001today'] && L.wrong['Person Name\u0001today'].n === 1 && L.wrong['Person Name\u0001today'].expected, 'kept locally: a label the check marked wrong, with the correction', L.wrong);
    p.close();
    const p2 = await page({ storage: {}, path: '/tasks/t8' });
    await p2.finish(false);
    const L2 = p2.w.__PT__.learning();
    check(L2.ignored['Person Name\u0001Rahul Sharma'] && L2.ignored['Person Name\u0001Rahul Sharma'].n === 1, 'kept locally (no team sync needed): a suggestion left unlabeled at Submit', L2.ignored);
    p2.close();
  }
  {
    // L2: removing L1's label -> x, adding one -> y; Approve sends no ignored events
    const p = await page({ storage: { pt_team_salt: TEAM.salt }, path: '/internal-review', right: [{ id: 'a1', label_id: 'id-person', start: 3, end: 15, text: 'Rahul Sharma' }] });
    await p.remove('a1');
    await p.save('Zorblax', 'Business Name');
    await p.finish(true);
    const ev = p.events();
    check(ev.some(e => e.k === 'x' && e.l === 'Person Name' && e.st === '2' && /^[0-9a-f]{16}$/.test(e.task)), 'L2: removing a label L1 made is sent as an L2 removal', ev);
    check(ev.some(e => e.k === 'y' && e.l === 'Business Name' && e.st === '2'), 'L2: adding a label L1 did not make is sent as an L2 addition', ev);
    check(!ev.some(e => e.k === 'i') && ev.every(e => e.st === '2'), 'L2: Approve sends no ignored events; every event is stage 2', ev);
    p.close();
  }
  {
    // on another page (no stage) and on L1, nothing is sent as an L2 vote
    const p = await page({ storage: { pt_team_salt: TEAM.salt }, path: '/tasks/t2', right: [{ id: 'a1', label_id: 'id-person', start: 3, end: 15, text: 'Rahul Sharma' }] });
    await p.remove('a1'); await settle(3500);
    check(!p.events().some(e => e.k === 'x' || e.k === 'y'), 'L1: removing your own label is not an L2 vote', p.events());
    p.close();
  }
  // speed: hashing a long page for team terms stays fast
  {
    const p = await page({ storage: { pt_team_salt: TEAM.salt } });
    const t0 = Date.now(); let n = 0;
    for (let i = 0; i < 100000; i++) n += p.w.__PT__.teamHash('word ' + i).length;
    const ms = Date.now() - t0;
    check(ms < 1500, `100,000 phrase hashes in ${ms} ms`, ms);
    p.close();
  }
  // (v11.8.2) the accuracy report page: team numbers from the bundle, your own from local learning
  {
    const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'accuracy.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'extension', 'accuracy.js'), 'utf8');
    const dom = new JSDOM(html.replace('<script src="accuracy.js"></script>', ''), { runScripts: 'outside-only', url: 'chrome-extension://test/accuracy.html' });
    const w = dom.window;
    const stats = { labels: { 'Person Name': { a: 90, r: 10, m: 30 }, 'Email Address': { a: 50, r: 0, m: 0 } }, days: { '2026-10-22': { a: 140, r: 10, m: 30, reviewers: 4 } }, reviewers: 4, team: { reviewers: 6, active: 5, upToDate: 4, latestVersion: '11.12.0' } };
    const storage = { pt_team_bundle: { fetched: Date.now(), data: { version: 1, built: '2026-10-22T15:31:00Z', labels: {}, hidden: {}, learned: {}, stats } },
      pt_learning_v1: { labels: { 'Person Name': { a: 9, r: 1 } }, texts: {}, missed: { 'Person Name\u0001x': { tasks: ['a'] } } } };
    w.chrome = { storage: { local: { get: (k, cb) => cb(storage) } }, runtime: { getManifest: () => ({ version: '11.8.2' }), sendMessage: (m, cb) => cb && cb({ ok: true }) } };
    w.eval(js);
    await settle(100);
    const q = (id) => w.document.getElementById(id).textContent;
    check(q('c-prec') === '93%' && q('c-cov') === '82%' && q('c-dec') === '180' && q('c-who') === '4', 'report (team): precision 140/150, coverage 140/170, decisions, reviewers', [q('c-prec'), q('c-cov'), q('c-dec'), q('c-who')]);
    check(q('c-who-h') === '4 of 6 up to date (v11.12.0)', 'report (team): how many reviewers run the latest version and bundle', q('c-who-h'));
    check(w.document.querySelectorAll('#rows tr').length === 3 && w.document.querySelectorAll('#days tr').length === 1, 'report: a row per label plus the total, a row per day');
    w.document.getElementById('tab-me').click();
    check(q('c-prec') === '90%' && q('c-cov') === '90%' && !w.document.getElementById('small').hidden, 'report (you): your own numbers, with the small-sample warning', [q('c-prec'), q('c-cov')]);
  }
  // (v11.14.0) the My examples page: four lists from the local store, filters, copy as text; nothing is sent
  {
    const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'examples.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'extension', 'examples.js'), 'utf8');
    const dom = new JSDOM(html.replace('<script src="examples.js"></script>', ''), { runScripts: 'outside-only', url: 'chrome-extension://test/examples.html' });
    const w = dom.window;
    const learning = {
      labels: {}, texts: { 'Person Name\u0001Learn More': { a: 0, r: 3, to: '', t: 2 }, 'Person Name\u0001Asha Rao': { a: 4, r: 0, t: 1 }, 'Business Name\u0001Kafka': { a: 0, r: 1, to: 'Person Username', t: 3 } },
      missed: { 'Business Name\u0001Zorblax Labs': { tasks: ['a', 'b'], t: 4 } },
      ignored: { 'Person Username\u0001@echo': { n: 2, t: 5 } },
      wrong: { 'IP Address\u00010.0.0.0': { n: 1, expected: 'No label', t: 6 } },
    };
    let sent = 0;
    w.chrome = { storage: { local: { get: (k, cb) => cb({ pt_learning_v1: learning }) } }, runtime: { getManifest: () => ({ version: '11.14.0' }), sendMessage: () => { sent++; } } };
    w.fetch = () => { sent++; return Promise.reject(new Error('no network')); };
    w.eval(js);
    await settle(100);
    const rows = (id) => Array.from(w.document.querySelectorAll('#' + id + ' tr')).map(tr => Array.from(tr.children).map(td => td.textContent));
    const rej = rows('rej');
    check(rej.length === 2 && rej[0][0] === 'Learn More' && rej[0][2] === '(removed)' && rej[0][3] === '3' && rej[1][2] === 'Person Username', 'examples: rejected suggestions (most rejected first, with what you used); accepted-only texts are not listed', rej);
    check(rows('mis')[0].join('|') === 'Zorblax Labs|Business Name|2' && rows('ign')[0].join('|') === '@echo|Person Username|2' && rows('wro')[0].join('|') === '0.0.0.0|IP Address|No label|1', 'examples: missed, unlabeled and marked-wrong lists', [rows('mis'), rows('ign'), rows('wro')]);
    w.document.getElementById('label').value = 'Person Name'; w.document.getElementById('label').dispatchEvent(new w.Event('change'));
    check(rows('rej').length === 1 && rows('mis')[0][0] === 'Nothing here yet.', 'examples: the label filter', rows('rej'));
    w.document.getElementById('label').value = ''; w.document.getElementById('q').value = 'kaf'; w.document.getElementById('q').dispatchEvent(new w.Event('input'));
    check(rows('rej').length === 1 && rows('rej')[0][0] === 'Kafka', 'examples: the search box', rows('rej'));
    w.document.getElementById('q').value = ''; w.document.getElementById('q').dispatchEvent(new w.Event('input'));
    const txt = w.__ptExamples.asText();
    check(/## Suggestions I rejected\ntext\tsuggested\tI used\trejected\taccepted\nLearn More\tPerson Name\t\(removed\)\t3\t0/.test(txt) && /0\.0\.0\.0\tIP Address\tNo label\t1/.test(txt), 'examples: "Copy as text" gives tab-separated lists', txt);
    check(sent === 0, 'examples: the page sends nothing anywhere');
  }
  console.log(`\n${pass}/${pass + fail} sync checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
