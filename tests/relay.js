// (v11.8.0) The team relay (relay/worker.js) and the nightly aggregation (relay/aggregate.mjs), with GitHub replaced by a stub.
// Checks: only hashed, well-formed batches are stored; the team key is required; the bundle follows the team rules.
// Run: node tests/relay.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-relay-'));
const asModule = (file) => { const out = path.join(tmp, path.basename(file).replace(/\.m?js$/, '.mjs')); fs.copyFileSync(file, out); return import(pathToFileURL(out).href); };

(async () => {
  const worker = await asModule(path.join(__dirname, '..', 'relay', 'worker.js'));
  const agg = await asModule(path.join(__dirname, '..', 'relay', 'aggregate.mjs'));
  const env = { GITHUB_TOKEN: 'test-token', GITHUB_REPO: 'owner/data', TEAM_KEY: 'k'.repeat(32) };
  const stored = [];
  globalThis.fetch = async (url, init = {}) => {
    stored.push({ url: String(url), method: init.method, body: init.body });
    if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify({ version: 1, built: 'x', labels: { 'Person Name': { a: 3, r: 1 } }, hidden: {}, learned: {} }), { status: 200 });
    return new Response('{}', { status: 201 });
  };
  const call = (method, p, body, key = env.TEAM_KEY) => worker.default.fetch(new Request('https://relay.test' + p, { method, headers: key ? { 'X-Team-Key': key, 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env, {});
  const H = 'a1b2c3d4e5f60718', T = '0011223344556677';
  const good = { client: 'c0ffee00c0ffee00', version: '11.8.0', events: [{ k: 's', l: 'Person Name', v: 'a' }, { k: 't', l: 'Person Name', h: H, v: 'r' }, { k: 'm', l: 'Business Name', h: H, task: T }] };

  check((await call('GET', '/', undefined, null)).status === 200, 'health check answers without a key');
  check((await call('POST', '/events', good, null)).status === 401, 'no team key -> refused');
  check((await call('POST', '/events', good, 'wrong'.padEnd(32, 'x'))).status === 401, 'wrong team key -> refused');
  stored.length = 0;
  const ok = await call('POST', '/events', good);
  check(ok.status === 200 && stored.length === 1 && /\/repos\/owner\/data\/contents\/events\/\d{4}-\d{2}-\d{2}\/c0ffee00c0ffee00-\d+-[0-9a-f]+\.json$/.test(stored[0].url) && stored[0].method === 'PUT', 'a valid batch is stored as one new file in events/<day>/', stored[0]);
  const saved = JSON.parse(Buffer.from(JSON.parse(stored[0].body).content, 'base64').toString());
  check(JSON.stringify(saved) === JSON.stringify(good), 'the stored file is exactly the batch');
  // text, extra fields or bad hashes are refused: no document text can reach the repo
  const bad = (name, events, extra = {}) => cases.push([name, Object.assign({}, good, { events }, extra)]);
  const cases = [];
  bad('raw text in an event', [{ k: 't', l: 'Person Name', h: H, v: 'a', text: 'Rahul Sharma' }]);
  bad('text instead of a hash', [{ k: 't', l: 'Person Name', h: 'Rahul Sharma', v: 'a' }]);
  bad('unknown label', [{ k: 's', l: 'Secret Stuff', v: 'a' }]);
  bad('unknown kind', [{ k: 'x', l: 'Person Name', v: 'a' }]);
  bad('extra batch field', good.events, { doc: 'hello' });
  bad('no events', []);
  bad('too many events', Array.from({ length: 1001 }, () => ({ k: 's', l: 'Person Name', v: 'a' })));
  for (const [name, b] of cases) { stored.length = 0; const r = await call('POST', '/events', b); check(r.status === 400 && stored.length === 0, 'refused: ' + name, r.status); }
  check((await call('POST', '/events', 'not json')).status === 400, 'refused: not JSON');
  const bundle = await call('GET', '/bundle');
  check(bundle.status === 200 && (await bundle.json()).labels['Person Name'].a === 3, 'GET /bundle returns the team bundle');
  check((await call('GET', '/bundle', undefined, null)).status === 401, 'GET /bundle needs the team key');

  // ---------------- aggregation ----------------
  const totals = agg.emptyTotals();
  const ev = (client, events) => agg.addBatch(totals, { client, version: '11.8.0', events });
  // label scores
  ev('c1', [{ k: 's', l: 'Person Name', v: 'a' }, { k: 's', l: 'Person Name', v: 'r' }]);
  ev('c2', [{ k: 's', l: 'Person Name', v: 'a' }]);
  // a text rejected 5 times by 2 reviewers, never accepted -> hidden
  for (let i = 0; i < 3; i++) ev('c1', [{ k: 't', l: 'Business Name', h: '1111111111111111', v: 'r' }]);
  for (let i = 0; i < 2; i++) ev('c2', [{ k: 't', l: 'Business Name', h: '1111111111111111', v: 'r' }]);
  // rejected 5 times by ONE reviewer -> not hidden
  for (let i = 0; i < 5; i++) ev('c3', [{ k: 't', l: 'Business Name', h: '2222222222222222', v: 'r' }]);
  // a term labeled by 3 reviewers on 2 tasks -> learned; by 2 reviewers -> not yet
  ev('c1', [{ k: 'm', l: 'Person Name', h: '3333333333333333', task: 'aaaaaaaaaaaaaaaa' }]);
  ev('c2', [{ k: 'm', l: 'Person Name', h: '3333333333333333', task: 'bbbbbbbbbbbbbbbb' }]);
  ev('c3', [{ k: 'm', l: 'Person Name', h: '3333333333333333', task: 'bbbbbbbbbbbbbbbb' }]);
  ev('c1', [{ k: 'm', l: 'Person Name', h: '4444444444444444', task: 'aaaaaaaaaaaaaaaa' }]);
  ev('c2', [{ k: 'm', l: 'Person Name', h: '4444444444444444', task: 'bbbbbbbbbbbbbbbb' }]);
  const b = agg.buildBundle(totals, 'test');
  check(b.labels['Person Name'].a === 2 && b.labels['Person Name'].r === 1, 'label scores are summed over the team', b.labels);
  check((b.hidden['Business Name'] || []).join() === '1111111111111111', 'hidden: 5 rejections by 2+ reviewers, never accepted (one reviewer alone is not enough)', b.hidden);
  check((b.learned['Person Name'] || []).join() === '3333333333333333', 'learned: 3+ reviewers on 2+ tasks (2 reviewers are not enough)', b.learned);
  check(!JSON.stringify(b).match(/c1|c2|c3|aaaa/), 'the bundle holds no reviewer or task ids');

  // run() on a repo folder: batch files are consumed, totals kept, bundle written
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-data-'));
  fs.mkdirSync(path.join(repo, 'events', '2026-10-22'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'events', '2026-10-22', 'c1-1.json'), JSON.stringify({ client: 'c1', version: '11.8.0', events: [{ k: 's', l: 'Address', v: 'a' }] }));
  fs.writeFileSync(path.join(repo, 'events', '2026-10-22', 'c2-1.json'), '{ broken');
  const r1 = agg.run(repo);
  check(r1.files === 2 && r1.bad === 1 && !fs.existsSync(path.join(repo, 'events', '2026-10-22')), 'run(): every batch file is consumed (an unreadable one is skipped)', r1);
  fs.mkdirSync(path.join(repo, 'events', '2026-10-23'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'events', '2026-10-23', 'c1-2.json'), JSON.stringify({ client: 'c1', version: '11.8.0', events: [{ k: 's', l: 'Address', v: 'a' }] }));
  agg.run(repo);
  const out = JSON.parse(fs.readFileSync(path.join(repo, 'shared', 'bundle.json'), 'utf8'));
  check(out.labels.Address.a === 2, 'run(): totals carry over from night to night', out.labels);

  // (v11.8.2) accuracy: per-label accepted / rejected / missed, per day, reviewers as a number; REPORT.md
  {
    const t2 = agg.emptyTotals();
    agg.addBatch(t2, { client: 'c1', version: '11.8.2', events: [{ k: 's', l: 'Person Name', v: 'a' }, { k: 's', l: 'Person Name', v: 'a' }, { k: 's', l: 'Person Name', v: 'a' }, { k: 's', l: 'Person Name', v: 'r' }, { k: 'm', l: 'Person Name', h: '5555555555555555', task: 'aaaaaaaaaaaaaaaa' }] }, '2026-10-22');
    agg.addBatch(t2, { client: 'c2', version: '11.8.2', events: [{ k: 's', l: 'Email Address', v: 'a' }] }, '2026-10-23');
    const b2 = agg.buildBundle(t2, '2026-10-23T15:31:00Z');
    const pn = b2.stats.labels['Person Name'];
    check(pn.a === 3 && pn.r === 1 && pn.m === 1 && b2.stats.reviewers === 2, 'stats: accepted, rejected and missed per label; the number of reviewers', b2.stats);
    check(b2.stats.days['2026-10-22'].reviewers === 1 && b2.stats.days['2026-10-23'].a === 1, 'stats: per day, by the day the batch was stored', b2.stats.days);
    const acc = agg.accuracyOf(pn);
    check(acc.precision === 0.75 && acc.coverage === 0.75, 'precision = a/(a+r), coverage = a/(a+m)', acc);
    check(!JSON.stringify(b2.stats).match(/c1|c2|aaaa|5555/), 'stats hold no reviewer ids, tasks or hashes');
    const md = agg.reportMarkdown(b2);
    check(/\*\*2 reviewers\*\*/.test(md) && /\| Person Name \| 3 \| 1 \| 1 \| 75% \| 75% \|/.test(md) && /\| 2026-10-22 \| 1 \|/.test(md), 'REPORT.md: totals, per label and per day', md.slice(0, 400));
    // totals written by v11.8.0 (no stats yet) keep working
    const repo2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-data-'));
    fs.mkdirSync(path.join(repo2, 'state'), { recursive: true });
    fs.writeFileSync(path.join(repo2, 'state', 'totals.json'), JSON.stringify({ version: 1, labels: {}, texts: {}, missed: {}, batches: 0 }));
    fs.mkdirSync(path.join(repo2, 'events', '2026-10-22'), { recursive: true });
    fs.writeFileSync(path.join(repo2, 'events', '2026-10-22', 'c1-1.json'), JSON.stringify({ client: 'c1', version: '11.8.0', events: [{ k: 's', l: 'URL/Link', v: 'a' }] }));
    agg.run(repo2);
    const out2 = JSON.parse(fs.readFileSync(path.join(repo2, 'shared', 'bundle.json'), 'utf8'));
    check(out2.stats.labels['URL/Link'].a === 1 && fs.existsSync(path.join(repo2, 'REPORT.md')), 'old totals are upgraded; REPORT.md is written', out2.stats);
  }
  // (v11.12.0) receipts: who runs which version and which team bundle
  {
    const seen = { client: 'c0ffee00c0ffee00', version: '11.12.0', bundle: '2026-10-23T10:02:11.000Z' };
    stored.length = 0;
    const r = await call('POST', '/seen', seen);
    check(r.status === 200 && stored.length === 1 && /\/contents\/seen\/\d{4}-\d{2}-\d{2}\/c0ffee00c0ffee00-\d+\.json$/.test(stored[0].url), 'a receipt is stored as one file in seen/<day>/', stored[0] && stored[0].url);
    const rec = stored[0] && JSON.parse(Buffer.from(JSON.parse(stored[0].body).content, 'base64').toString());
    check(rec && rec.client === seen.client && rec.version === '11.12.0' && rec.bundle === seen.bundle && /^\d{4}-\d{2}-\d{2}T/.test(rec.at) && Object.keys(rec).length === 4, 'the receipt holds the id, version, bundle date and the time', rec);
    check((await call('POST', '/seen', Object.assign({}, seen, { bundle: null }))).status === 200, 'a receipt without a bundle yet is fine');
    for (const [name, b] of [['no key', null], ['extra field', Object.assign({}, seen, { name: 'Asha' })], ['text as bundle date', Object.assign({}, seen, { bundle: 'Rahul Sharma' })], ['bad client', Object.assign({}, seen, { client: 'Asha' })]]) {
      stored.length = 0;
      const res = name === 'no key' ? await call('POST', '/seen', seen, null) : await call('POST', '/seen', b);
      check(res.status >= 400 && stored.length === 0, 'receipt refused: ' + name, res.status);
    }
    // aggregation: the latest receipt per reviewer, also the version from event batches; the table in REPORT.md
    const repo3 = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-data-'));
    fs.mkdirSync(path.join(repo3, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(repo3, 'shared', 'bundle.json'), JSON.stringify({ version: 1, built: '2026-10-23T10:02:00.000Z', labels: {}, hidden: {}, learned: {} }));
    const put = (dir, name, obj) => { fs.mkdirSync(path.join(repo3, dir, '2026-10-23'), { recursive: true }); fs.writeFileSync(path.join(repo3, dir, '2026-10-23', name), JSON.stringify(obj)); };
    put('seen', 'aaaaaaaaaaaaaaaa-1.json', { client: 'aaaaaaaaaaaaaaaa', version: '11.11.2', bundle: '2026-10-22T15:31:00.000Z', at: '2026-10-23T06:00:00.000Z' });
    put('seen', 'aaaaaaaaaaaaaaaa-2.json', { client: 'aaaaaaaaaaaaaaaa', version: '11.12.0', bundle: '2026-10-23T10:02:00.000Z', at: '2026-10-23T11:00:00.000Z' });
    put('seen', 'bbbbbbbbbbbbbbbb-1.json', { client: 'bbbbbbbbbbbbbbbb', version: '11.12.0', bundle: '2026-10-22T15:31:00.000Z', at: '2026-10-23T12:00:00.000Z' });
    put('events', 'cccccccccccccccc-1.json', { client: 'cccccccccccccccc', version: '11.11.0', events: [{ k: 's', l: 'Address', v: 'a' }] });
    agg.run(repo3, Date.parse('2026-10-23T15:31:00Z'));
    const t3 = JSON.parse(fs.readFileSync(path.join(repo3, 'state', 'totals.json'), 'utf8'));
    check(t3.clients.aaaaaaaaaaaaaaaa.version === '11.12.0' && t3.clients.aaaaaaaaaaaaaaaa.bundle === '2026-10-23T10:02:00.000Z', 'totals keep the latest receipt per reviewer', t3.clients);
    check(t3.clients.cccccccccccccccc.version === '11.11.0' && !fs.existsSync(path.join(repo3, 'seen', '2026-10-23')), 'a reviewer who only sent events is known by version; receipt files are consumed', t3.clients);
    const md3 = fs.readFileSync(path.join(repo3, 'REPORT.md'), 'utf8');
    check(/## Who is up to date/.test(md3) && /\| aaaaaaaa \| 11\.12\.0 \|[^\n]*\| up to date \|/.test(md3), 'REPORT.md: a reviewer on the latest version and bundle is up to date', md3.slice(md3.indexOf('## Who')));
    check(/\| bbbbbbbb \| 11\.12\.0 \|[^\n]*old team bundle/.test(md3) && /\| cccccccc \| 11\.11\.0 \|[^\n]*old extension/.test(md3), 'REPORT.md: an old bundle and an old extension are named', md3.slice(md3.indexOf('## Who')));
    const b3 = JSON.parse(fs.readFileSync(path.join(repo3, 'shared', 'bundle.json'), 'utf8'));
    check(b3.stats.team && b3.stats.team.reviewers === 3 && b3.stats.team.upToDate === 1 && b3.stats.team.latestVersion === '11.12.0' && !JSON.stringify(b3).includes('aaaaaaaa'), 'the bundle carries the counts only, no ids', b3.stats.team);
  }
  console.log(`\n${pass}/${pass + fail} relay checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
