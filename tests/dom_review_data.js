// (v11.6.0) Exact labels from the dashboard's own review data. The page hook (src/page-hook.js) sees the dashboard's
// GET .../annotation-review and its add / remove requests; the auditor then knows each reviewer label's title exactly,
// even when two labels share a colour (where reading the colour can only say "unsure").
// All data below is synthetic; no document links or tokens are involved. Run: node tests/dom_review_data.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-hook.js'), 'utf8');

// Person Name and Person Username get the SAME colour: by colour alone the check cannot tell them apart.
const BLUE = [22, 119, 255];
const PAL = { 'Person Name': BLUE, 'Person Username': BLUE, 'IP Address': [92, 219, 211], 'Business Name': [19, 194, 194], 'Email Address': [56, 158, 13] };
const IDS = { 'Person Name': 'id-person', 'Person Username': 'id-username', 'IP Address': 'id-ip', 'Business Name': 'id-business', 'Email Address': 'id-email' };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const markStyle = (label) => { const [r, g, b] = PAL[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18);`; };
const LINES = ['Hi Rahul Sharma, welcome aboard.', 'Ping @rahul_92 on chat', 'Check the logs today.'];
const TASK = 'https://api.peaktalent.ai/api/v1/tasks/test-task/annotation-review';

let pass = 0, fail = 0;
const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };
const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));

async function page(annotations) {
  const dom = new JSDOM(`<!doctype html><body><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${LINES.map(l => `<div>${l}</div>`).join('')}</div><div id="right">${LINES.map(l => `<div>${l}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () { if (this === Lp) return box(40, 100, 600, 700); if (this === Rp) return box(720, 100, 600, 700); if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20); return box(0, 0, 0, 0); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  // the dashboard's API, faked: the review data, and saving new annotations
  const requests = [];
  w.fetch = async (url, init) => {
    requests.push(String(url));
    if (String(url) === TASK) {
      return new Response(JSON.stringify({
        task_id: 'test-task',
        left_document: { name: 'left' }, right_document: { name: 'right' },
        labels: Object.entries(IDS).map(([title, id]) => ({ id, slug: id, title, color: '#000000' })),
        left_annotations: [], right_annotations: annotations,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url) === TASK + '/annotations') return new Response(JSON.stringify({ created: 1, ids: ['new-1'] }), { status: 201 });
    return new Response('{}', { status: 404 });
  };
  w.eval(hook);                       // the hook is in place before the dashboard loads its data
  await w.fetch(TASK);                // the dashboard loads the review
  w.__PT_TEST__ = true; w.eval(src);  // the auditor starts
  await settle();
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
  const state = (m) => ({ mark: m.getAttribute('data-ptc'), your: m.getAttribute('data-ptc-your'), expected: m.getAttribute('data-ptc-expected') });
  return { w, annotate, state, requests, close: () => w.__pt_cleanup && w.__pt_cleanup() };
}

(async () => {
  // 1. the review data reaches the auditor; no extra request is made
  {
    const p = await page([{ id: 'a1', label_id: 'id-person', start: 3, end: 15, text: 'Rahul Sharma' }]);
    const rd = p.w.__PT__.reviewData();
    check(rd.ready && rd.labels === 5 && rd.annotations === 1, 'the review data is received (5 labels, 1 annotation)', rd);
    check(p.requests.length === 1, 'the auditor makes no request of its own', p.requests);
    p.close();
  }
  // 2. a shared colour: the review data says Person Name -> the label is judged as Person Name (correct), not "unsure"
  {
    const p = await page([{ id: 'a1', label_id: 'id-person', start: 3, end: 15, text: 'Rahul Sharma' }]);
    const m = await p.annotate('Rahul Sharma', 'Person Name');
    const st = p.state(m);
    check(st.mark === 'ok' && st.your === 'Person Name', 'shared colour + review data: the exact label is used (Person Name, correct)', st);
    p.close();
  }
  // 3. the same colour, but the review data says Person Username on a person's name -> a real mistake
  {
    const p = await page([{ id: 'a1', label_id: 'id-username', start: 3, end: 15, text: 'Rahul Sharma' }]);
    const m = await p.annotate('Rahul Sharma', 'Person Username');
    const st = p.state(m);
    check(st.mark === 'wrong' && st.your === 'Person Username', 'shared colour + review data: Person Username on a name is a mistake', st);
    p.close();
  }
  // 4. an IP Address label on "the" (seen in a real review) is a mistake
  {
    const p = await page([{ id: 'a2', label_id: 'id-ip', start: 63, end: 66, text: 'the' }]);
    const m = await p.annotate('the', 'IP Address');
    check(p.state(m).mark === 'wrong', 'an IP Address label on "the" is a mistake', p.state(m));
    p.close();
  }
  // 5. a label saved after the page loaded (the dashboard's POST .../annotations) is read exactly too
  {
    const p = await page([]);
    await p.w.fetch(TASK + '/annotations', { method: 'POST', body: JSON.stringify({ spans: [{ label_id: 'id-username', start: 38, end: 47, text: '@rahul_92' }] }) });
    await settle(300);
    const m = await p.annotate('@rahul_92', 'Person Username');
    const st = p.state(m);
    check(st.mark === 'ok' && st.your === 'Person Username', 'a newly saved label is read exactly (Person Username on @rahul_92)', st);
    p.close();
  }
  // 6. no review data at all: the colour is read as before (the shared colour gives "unsure", never a guess)
  {
    const p = await page([]);
    const m = await p.annotate('Rahul Sharma', 'Person Name');
    const st = p.state(m);
    check(st.mark === 'ok' || st.mark === 'unsure', 'without review data the colour is used as before', st);
    p.close();
  }
  // 7. privacy: the hook keeps no document links
  {
    const p = await page([]);
    const kept = JSON.stringify(p.w.__ptReviewData || {});
    check(!/url|amz|token/i.test(kept), 'the hook keeps only labels and spans (no links, no tokens)', kept.slice(0, 200));
    p.close();
  }
  console.log(`\n${pass}/${pass + fail} review-data checks passed`);
  process.exit(fail ? 1 : 0);
})();
