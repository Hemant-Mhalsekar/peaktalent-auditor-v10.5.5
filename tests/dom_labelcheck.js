// Real-DOM tests (need jsdom) for the LABEL CHECK (v11.0.0), using the live dashboard's own label markup as reported
// by its Diagnose panel: <mark role="button"> with a translucent background + gradient underline, colours from the
// label chips at the top. Every label is tested: correct label -> no mark; wrong label -> red mark naming the
// CORRECT label. Also: re-check after every annotation, label change, label removal, and that the document text
// is never modified.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Contact Number': [250, 140, 22],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const LABELS = Object.keys(PAL);
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const markStyle = (label) => { const [r, g, b] = PAL[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));`; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function page(leftLines, rightLines) {
  const dom = new JSDOM(`<!doctype html><body><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${leftLines.map(l => `<div>${esc(l)}</div>`).join('')}</div><div id="right">${rightLines.map(l => `<div>${esc(l)}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () {
    if (this === Lp) return box(40, 100, 600, 700);
    if (this === Rp) return box(720, 100, 600, 700);
    if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20);
    return box(0, 0, 0, 0);
  };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.__PT_TEST__ = true; w.eval(src);
  const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
  await settle();
  // the reviewer labels `word` with `label` the way the platform does (wraps the plain text in a <mark>)
  const annotate = async (word, label, inside = false) => {
    // find the word in the document text (it may be split by the auditor's own suggestion spans) and wrap it
    const nodes = [], starts = []; let all = '';
    const walker = w.document.createTreeWalker(Rp, w.NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { nodes.push(n); starts.push(all.length); all += n.nodeValue; }
    let pos = -1, from = 0;
    while ((pos = all.indexOf(word, from)) >= 0) {
      const inMark = nodes.some((nd, k) => starts[k] <= pos && pos < starts[k] + nd.nodeValue.length && nd.parentElement.closest('mark'));
      if (!inMark) break; from = pos + 1;
    }
    if (pos < 0) throw new Error('word not found: ' + word);
    const at = (p) => { let k = 0; while (k + 1 < nodes.length && starts[k + 1] <= p) k++; return [nodes[k], p - starts[k]]; };
    const [sn, so] = at(pos), [en, eo] = at(pos + word.length - 1);
    const rg = w.document.createRange(); rg.setStart(sn, so); rg.setEnd(en, eo + 1);
    // the word is exactly one of the auditor's suggestion spans: label the whole span (as an editor re-render would)
    const tag = sn === en && sn.parentElement.classList.contains('pt-tag') && sn.parentElement.textContent === word ? sn.parentElement : null;
    if (tag && !inside) { rg.setStartBefore(tag); rg.setEndAfter(tag); }
    // expand to our whole suggestion span when the word is exactly its text
    const m = w.document.createElement('mark');
    m.setAttribute('role', 'button'); m.setAttribute('tabindex', '0'); m.setAttribute('style', markStyle(label));
    m.appendChild(rg.extractContents());
    rg.insertNode(m);
    await settle();
    return m;
  };
  const state = (m) => ({ mark: m.getAttribute('data-ptc'), your: m.getAttribute('data-ptc-your'), expected: m.getAttribute('data-ptc-expected'), why: m.getAttribute('data-ptc-why') });
  const status = () => (w.document.getElementById('pt-status-text') || {}).textContent || '';
  return { w, Rp, annotate, state, status, settle, close: () => w.__pt_cleanup() };
}

const cases = [];   // [name, left, right, word, correctLabel ('' = must stay unlabeled), wrongLabelToTry]
const same = (name, line, word, label, wrongTry) => cases.push([name, [line], [line], word, label, wrongTry]);
const diff = (name, l, r, word, label, wrongTry) => cases.push([name, [l], [r], word, label, wrongTry]);
// one case per label (identical value on both sides)
same('Account Number', 'Account Number: 50100234567891', '50100234567891', 'Account Number', 'Contact Number');
same('Address', 'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address', 'Business Name');
same('Business Name', 'She works at Infosys Limited in Pune.', 'Infosys Limited', 'Business Name', 'Person Name');
same('Contact Number', 'Mobile: +91 98450 12345', '+91 98450 12345', 'Contact Number', 'Account Number');
same('Credentials', 'PAN: ABCDE1234F', 'ABCDE1234F', 'Credentials', 'Vehicle Number Plate');
same('Date', 'DOB: 05-11-1988', '05-11-1988', 'Date', 'Credentials');
same('Email Address', 'Mail priya.raghavan@northwind-demo.com today', 'priya.raghavan@northwind-demo.com', 'Email Address', 'URL/Link');
same('IP Address', 'Server 192.168.10.25 is down', '192.168.10.25', 'IP Address', 'Contact Number');
diff('Overscrubbed', 'The Council Member approved it.', 'The Council Beagenhydra approved it.', 'Beagenhydra', 'Overscrubbed', 'Date');
same('Person Name', 'Hi Rahul Sharma, welcome aboard.', 'Rahul Sharma', 'Person Name', 'Business Name');
same('URL/Link', 'Docs: https://docs.acmecorp-demo.io/setup', 'https://docs.acmecorp-demo.io/setup', 'URL/Link', 'Email Address');
same('Person Username', 'Ping @rahul_92 on Slack', '@rahul_92', 'Person Username', 'Person Name');
same('Vehicle Number Plate', 'Vehicle: KA 05 MN 4321', 'KA 05 MN 4321', 'Vehicle Number Plate', 'Credentials');
// text that must stay unlabeled: any label is wrong, correct = "No label"
same('unchanged word ("exclusive")', 'Deliver at least 3-5 exclusive/original stories per month.', 'exclusive', '', 'Date');
same('unchanged JSON key', '"dependencies": {', 'dependencies', '', 'Overscrubbed');
diff('scrubbed person name', 'I met Furkan at the airport.', 'I met Dalvorin at the airport.', 'Dalvorin', '', 'Overscrubbed');
diff('scrubbed company', 'She joined Accenture in 2019.', 'She joined Velmoratech in 2019.', 'Velmoratech', '', 'Business Name');
diff('scrubbed phone', 'Call 9876543210 today', 'Call 9123456780 today', '9123456780', '', 'Contact Number');
same('statement date (not DOB)', 'Statement Date: 12-01-2026', '12-01-2026', '', 'Date');
same('city alone', 'Location: Bengaluru', 'Bengaluru', '', 'Address');
same('http link', 'Old: http://legacy.acmecorp-demo.io', 'http://legacy.acmecorp-demo.io', '', 'URL/Link');
same('language', 'Languages: English, Bengali, Hindi', 'Bengali', '', 'Person Name');

(async () => {
  let pass = 0, fail = 0;
  const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '\u2713 ' : '\u2717 ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };

  for (const [name, L, R, word, correct, wrongTry] of cases) {
    if (correct) {
      const p = await page(L, R);
      const m = await p.annotate(word, correct);
      const s = p.state(m);
      check(s.mark !== 'wrong' && !/Mistake/.test(p.status()), `${name}: correct label "${correct}" -> no mistake`, s);
      p.close();
    }
    const p2 = await page(L, R);
    const m2 = await p2.annotate(word, wrongTry);
    const s2 = p2.state(m2);
    const want = correct || 'No label';
    check(s2.mark === 'wrong' && s2.your === wrongTry && (s2.expected || '').startsWith(want) && /1 Mistake/.test(p2.status()),
      `${name}: labeled "${wrongTry}" -> mistake, correct label shown as "${want}"`, s2);
    p2.close();
  }

  // The reported case: should be Overscrubbed, labeled Date -> "Date -> Overscrubbed".
  {
    const p = await page(['Publish a minimum of three news stories per day.'], ['Publish a minimum of three news ionoryorb per day.']);
    const m = await p.annotate('ionoryorb', 'Date');
    const s = p.state(m);
    check(s.mark === 'wrong' && s.your === 'Date' && s.expected === 'Overscrubbed', 'reported case: Overscrubbed word labeled Date -> "Date \u2192 Overscrubbed"', s);
    // the reviewer fixes it: label changed to Overscrubbed (style swap only) -> mistake disappears
    m.setAttribute('style', markStyle('Overscrubbed'));
    await p.settle();
    check(p.state(m).mark === 'ok' && !/Mistake/.test(p.status()), 'after changing the label to Overscrubbed the mistake disappears', p.state(m));
    // the reviewer changes it to Person Name -> flagged again
    m.setAttribute('style', markStyle('Person Name'));
    await p.settle();
    check(p.state(m).mark === 'wrong' && p.state(m).expected === 'Overscrubbed', 'changing it again to Person Name -> flagged again', p.state(m));
    // the reviewer removes the label -> no mark left anywhere
    const parent = m.parentNode; while (m.firstChild) parent.insertBefore(m.firstChild, m); m.remove();
    await p.settle();
    check(!p.w.document.querySelector('[data-ptc="wrong"]') && !/Mistake/.test(p.status()), 'removing the label clears the mistake', p.status());
    p.close();
  }

  // An editor that wraps the selection INSIDE the auditor's suggestion span is handled the same way.
  {
    const p = await page(['Publish a minimum of three news stories per day.'], ['Publish a minimum of three news ionoryorb per day.']);
    const m = await p.annotate('ionoryorb', 'Date', true);
    const s = p.state(m);
    check(s.mark === 'wrong' && s.expected === 'Overscrubbed', 'label drawn inside the suggestion span is checked too', s);
    p.close();
  }

  // Partial label: Overscrubbed covering unchanged text too.
  {
    const p = await page(['| Total Transfer-Ins/VDRs for the year | 0 |'], ['| Total Galeonorb-Ins/VDRs for the year | 0 |']);
    const m = await p.annotate('Galeonorb-Ins/VDRs', 'Overscrubbed');
    const s = p.state(m);
    check(s.mark === 'wrong' && /Galeonorb/.test(s.expected || ''), 'Overscrubbed label covering unchanged text -> "label only Galeonorb"', s);
    p.close();
  }

  // Several labels at once + the mistake list + the document text is never changed.
  {
    const L = ['The Council Member approved it.', 'Hi Rahul Sharma, welcome aboard.', 'Deliver exclusive stories.'];
    const R = ['The Council Beagenhydra approved it.', 'Hi Rahul Sharma, welcome aboard.', 'Deliver exclusive stories.'];
    const p = await page(L, R);
    const before = p.Rp.textContent;
    await p.annotate('Beagenhydra', 'Overscrubbed');
    await p.annotate('Rahul Sharma', 'Person Name');
    await p.annotate('exclusive', 'Date');
    check(p.w.document.querySelectorAll('[data-ptc="wrong"]').length === 1 && /1 Mistake/.test(p.status()), 'three labels, one wrong -> exactly 1 mistake', p.status());
    check(p.Rp.textContent === before, 'the document text is never modified by the check', '');
    const st = p.w.document.getElementById('pt-status-text');
    st.click();
    const list = p.w.document.getElementById('ptc-list');
    check(list && !list.hidden && /exclusive/.test(list.textContent) && /Date/.test(list.textContent) && /No label/.test(list.textContent), 'clicking the mistake count opens the list with word, your label and the correct label', list && list.textContent);
    p.close();
  }

  console.log(`\n${pass}/${pass + fail} label-check checks passed`);
  process.exit(fail ? 1 : 0);
})();
