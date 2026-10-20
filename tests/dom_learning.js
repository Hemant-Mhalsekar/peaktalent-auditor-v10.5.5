// (v11.7.0) Learning from reviewers. The reviewer's own saves (seen by the page hook) score the auditor's suggestions:
// accepted / rejected per label and per exact text, texts rejected 3+ times stop being suggested, a label reviewers
// mostly reject is faded, and text reviewers label on 2 different tasks is suggested. Nothing changes the label check.
// All data below is synthetic. Run: node tests/dom_learning.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-hook.js'), 'utf8');

const PAL = { 'Person Name': [22, 119, 255], 'Person Username': [47, 84, 235], 'Business Name': [19, 194, 194], 'Email Address': [56, 158, 13] };
const IDS = { 'Person Name': 'id-person', 'Person Username': 'id-username', 'Business Name': 'id-business', 'Email Address': 'id-email' };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const markStyle = (label) => { const [r, g, b] = PAL[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18);`; };
const LINES = ['Hi Rahul Sharma, welcome aboard.', 'We deploy with Zorblax every week.', 'Check the logs today.'];
const KEY = 'pt_learning_v1';

let pass = 0, fail = 0;
const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };
const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));

// One review task page. `store` is the saved learning carried over from earlier tasks (as the browser would keep it).
async function page({ task = 'task-1', store = null, chromeStore = null } = {}) {
  const TASK = `https://api.peaktalent.ai/api/v1/tasks/${task}/annotation-review`;
  const dom = new JSDOM(`<!doctype html><body><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${LINES.map(l => `<div>${l}</div>`).join('')}</div><div id="right">${LINES.map(l => `<div>${l}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true, virtualConsole: new (require('jsdom').VirtualConsole)() });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () { if (this === Lp) return box(40, 100, 600, 700); if (this === Rp) return box(720, 100, 600, 700); if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20); return box(0, 0, 0, 0); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (store) w.localStorage.setItem(KEY, store);
  if (chromeStore) w.chrome = { storage: { local: chromeStore } };
  w.fetch = async (url) => {
    if (String(url) === TASK) {
      return new Response(JSON.stringify({ task_id: task, labels: Object.entries(IDS).map(([title, id]) => ({ id, slug: id, title, color: '#000000' })), left_annotations: [], right_annotations: [] }), { status: 200 });
    }
    if (String(url) === TASK + '/annotations') return new Response(JSON.stringify({ created: 1, ids: ['n' + Math.random()] }), { status: 201 });
    if (String(url).startsWith(TASK + '/annotations/')) return new Response('{}', { status: 200 });
    return new Response('{}', { status: 404 });
  };
  w.eval(hook);
  await w.fetch(TASK);
  w.__PT_TEST__ = true; w.eval(src);
  await settle();
  const save = async (text, label) => { await w.fetch(TASK + '/annotations', { method: 'POST', body: JSON.stringify({ spans: [{ label_id: IDS[label], start: 0, end: text.length, text }] }) }); await settle(300); };
  const tags = (text) => Array.from(Rp.querySelectorAll('.pt-tag')).filter(t => t.textContent === text);
  const annotate = async (word, label) => {
    const walker = w.document.createTreeWalker(Rp, w.NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) {
      const i = n.nodeValue.indexOf(word);
      if (i < 0 || n.parentElement.closest('mark')) continue;
      const rg = w.document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + word.length);
      const tag = n.parentElement.classList.contains('pt-tag') && n.parentElement.textContent === word ? n.parentElement : null;
      if (tag) { rg.setStartBefore(tag); rg.setEndAfter(tag); }
      const m = w.document.createElement('mark'); m.setAttribute('style', markStyle(label));
      m.appendChild(rg.extractContents()); rg.insertNode(m);
      await settle();
      return m;
    }
    throw new Error('not found: ' + word);
  };
  const kept = () => { w.__PT__.learnFlush(); return w.localStorage.getItem(KEY); };
  return { w, save, tags, annotate, kept, close: () => w.__pt_cleanup && w.__pt_cleanup() };
}

(async () => {
  // 0. the engine suggests "Rahul Sharma" as Person Name and nothing for "Zorblax" (the starting point of the tests below)
  {
    const p = await page();
    check(p.tags('Rahul Sharma').length === 1 && p.tags('Rahul Sharma')[0].getAttribute('data-label') === 'Person Name', 'start: Rahul Sharma is suggested as Person Name', p.tags('Rahul Sharma').map(t => t.getAttribute('data-label')));
    check(p.tags('Zorblax').length === 0, 'start: Zorblax is not suggested', p.tags('Zorblax').length);
    check(p.w.__PT__.learnSummary().decisions === 0, 'start: nothing learned yet', p.w.__PT__.learnSummary());
    p.close();
  }
  // 1. accepted: the reviewer saves the suggested label on the suggested text (counted once per task)
  {
    const p = await page();
    await p.save('Rahul Sharma', 'Person Name');
    await p.save('Rahul Sharma', 'Person Name');
    const l = p.w.__PT__.learning();
    check(l.labels['Person Name'] && l.labels['Person Name'].a === 1 && l.labels['Person Name'].r === 0, 'accepted: Person Name +1 (once per task)', l.labels);
    check(l.texts['Person Name\u0001Rahul Sharma'] && l.texts['Person Name\u0001Rahul Sharma'].a === 1, 'accepted: the exact text is counted', l.texts);
    p.close();
  }
  // 2. rejected on 3 tasks -> no longer suggested with that label; the label check is unchanged
  {
    let store = null;
    for (const task of ['t1', 't2', 't3']) {
      const p = await page({ task, store });
      await p.save('Rahul Sharma', 'Person Username');   // the reviewer used another label: the suggestion is rejected
      store = p.kept(); p.close();
    }
    const l = JSON.parse(store);
    check(l.texts['Person Name\u0001Rahul Sharma'].r === 3 && l.labels['Person Name'].r === 3, 'rejected on 3 tasks: counted 3 times', l.texts);
    const p = await page({ task: 't4', store });
    const labels = p.tags('Rahul Sharma').map(t => t.getAttribute('data-label'));
    check(!labels.includes('Person Name'), 'a text rejected 3 times is no longer suggested with that label', labels);
    check(labels.join() === 'Person Username' && /learned from reviewers/.test(p.tags('Rahul Sharma')[0].title), 'the label reviewers used instead (on 2+ tasks) is suggested', labels);
    check(p.w.__PT__.learnSummary().hiddenTexts === 1, 'summary: 1 text no longer suggested', p.w.__PT__.learnSummary());
    const m = await p.annotate('Rahul Sharma', 'Person Username');
    check(m.getAttribute('data-ptc') === 'wrong', 'the label check still flags Person Username on a name (learning never changes it)', m.getAttribute('data-ptc'));
    p.close();
  }
  // 3. one acceptance keeps the text suggested, whatever the rejections
  {
    const store = JSON.stringify({ labels: {}, texts: { 'Person Name\u0001Rahul Sharma': { a: 1, r: 9 } }, missed: {} });
    const p = await page({ store });
    check(p.tags('Rahul Sharma').length === 1, 'a text accepted once is still suggested', p.tags('Rahul Sharma').length);
    p.close();
  }
  // 4. a label reviewers mostly reject (20+ decisions, under 30% accepted) is faded, not hidden
  {
    const store = JSON.stringify({ labels: { 'Person Name': { a: 4, r: 20 } }, texts: {}, missed: {} });
    const p = await page({ store });
    const t = p.tags('Rahul Sharma')[0];
    check(t && t.classList.contains('pt-low') && /low confidence/.test(t.title), 'a low-confidence label is shown faded with a note', t && { cls: t.className, title: t.title });
    p.close();
    const p2 = await page({ store: JSON.stringify({ labels: { 'Person Name': { a: 4, r: 12 } }, texts: {}, missed: {} }) });
    check(p2.tags('Rahul Sharma')[0] && !p2.tags('Rahul Sharma')[0].classList.contains('pt-low'), 'under 20 decisions: not faded yet', p2.tags('Rahul Sharma')[0] && p2.tags('Rahul Sharma')[0].className);
    p2.close();
  }
  // 5. missed: text the reviewer labels without a suggestion is suggested after the same label on 2 different tasks
  {
    const p1 = await page({ task: 'm1' });
    await p1.save('Zorblax', 'Business Name');
    await p1.save('Zorblax', 'Business Name');
    const s1 = p1.kept(); p1.close();
    const p2 = await page({ task: 'm1', store: s1 });   // the same task opened again: still 1 task
    check(p2.tags('Zorblax').length === 0, 'labeled on 1 task: not suggested yet', p2.tags('Zorblax').length);
    p2.close();
    const p3 = await page({ task: 'm2', store: s1 });
    await p3.save('Zorblax', 'Business Name');
    const s3 = p3.kept(); p3.close();
    const p4 = await page({ task: 'm3', store: s3 });
    const t = p4.tags('Zorblax')[0];
    check(t && t.getAttribute('data-label') === 'Business Name' && /learned from reviewers/.test(t.title), 'labeled on 2 tasks: suggested as Business Name (learned)', t && { label: t.getAttribute('data-label'), title: t.title });
    check(p4.w.__PT__.learnSummary().learnedTerms === 1, 'summary: 1 learned term', p4.w.__PT__.learnSummary());
    // deleting the label takes it back on that task
    const learned = p4.w.__PT__.learning();
    check(learned.missed['Business Name\u0001Zorblax'].tasks.join() === 'm1,m2', 'the learned term remembers only task ids', learned.missed);
    p4.close();
  }
  // 6. a learned term needs the label's chip on the page
  {
    const store = JSON.stringify({ labels: {}, texts: {}, missed: { 'Vehicle Number Plate\u0001Zorblax': { tasks: ['a', 'b'], cls: 'pt-learned' } } });
    const p = await page({ store });
    check(p.tags('Zorblax').length === 0, 'a learned term for a label without a chip on the page is not suggested', p.tags('Zorblax').length);
    p.close();
  }
  // 7. reset and export
  {
    const p = await page();
    await p.save('Rahul Sharma', 'Person Name');
    const exp = JSON.parse(p.w.__PT__.learnExport());
    check(exp.learning && exp.learning.labels['Person Name'].a === 1 && exp.version, 'export gives the scores as JSON', exp);
    p.w.__PT__.learnReset();
    check(p.w.__PT__.learnSummary().decisions === 0 && JSON.parse(p.kept()).labels && !Object.keys(JSON.parse(p.kept()).labels).length, 'reset clears everything', p.kept());
    p.close();
  }
  // 8. the extension keeps it in chrome.storage.local, not in the page's localStorage
  {
    let saved = null;
    const seed = { labels: { 'Person Name': { a: 4, r: 20 } }, texts: {}, missed: {} };
    const chromeStore = { get: (k, cb) => setTimeout(() => cb({ [k]: seed }), 10), set: (o) => { saved = o; } };
    const p = await page({ chromeStore });
    await settle(300);
    const t = p.tags('Rahul Sharma')[0];
    check(t && t.classList.contains('pt-low'), 'extension: the saved learning is loaded from chrome.storage.local', t && t.className);
    await p.save('Rahul Sharma', 'Person Name');
    await settle(500);
    check(saved && saved[KEY] && saved[KEY].labels['Person Name'].a === 5, 'extension: saved to chrome.storage.local', saved);
    check(p.w.localStorage.getItem(KEY) === null, 'extension: nothing in the page\'s localStorage', p.w.localStorage.getItem(KEY));
    p.close();
  }
  console.log(`\n${pass}/${pass + fail} learning checks passed`);
  process.exit(fail ? 1 : 0);
})();
