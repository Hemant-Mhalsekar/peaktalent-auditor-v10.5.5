// Real-DOM check (needs jsdom): the CHROME EXTENSION build (extension/content.js) with a chrome.runtime stub, as it runs
// in Chrome. The label check must flag a wrong label, and the popup's status / diagnostics messages must answer.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Contact Number': [250, 140, 22],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const [r, g, b] = PAL.Date;
(async () => {
  // the review screen is a modal: everything sits inside role="dialog" (as on the live dashboard)
  const dom = new JSDOM(`<!doctype html><body><div role="dialog" aria-modal="true"><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.xlsx-1</span><span>right.xlsx-1</span></div>
    <div id="left"><div>Deliver at least 3-5 exclusive/original stories per month.</div></div>
    <div id="right"><div>Deliver at least 3-5 <mark role="button" style="background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));">exclusive</mark>/original stories per month.</div></div></div></body>`,
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
  let listener = null;
  w.chrome = { runtime: { id: 'test-extension', onMessage: { addListener: (f) => { listener = f; }, removeListener: () => {} } } };
  w.eval(src);
  await new Promise(res => setTimeout(res, 900));
  const m = Rp.querySelector('mark');
  const ask = (msg) => new Promise(res => listener(msg, {}, res));
  const status = await ask({ action: 'status' });
  const diag = await ask({ action: 'diagnostics' });
  const checks = [
    ['extension build inside a role="dialog" review modal: wrong label ("exclusive" as Date) is flagged', m.getAttribute('data-ptc') === 'wrong' && m.getAttribute('data-ptc-your') === 'Date'],
    ['extension build: popup status reports the mistake', status && status.onReviewScreen && status.mistakes === 1],
    ['extension build: popup "Copy diagnostics" returns a report', diag && /diagnostics/.test(diag.text) && /browser extension/.test(diag.text) && /label check/.test(diag.text)],
  ];
  let fail = 0;
  for (const [n, ok] of checks) { if (!ok) fail++; console.log((ok ? '\u2713 ' : '\u2717 ') + n); }
  console.log(`${checks.length - fail}/${checks.length} extension checks passed`);
  w.__pt_cleanup && w.__pt_cleanup();
  process.exit(fail ? 1 : 0);
})();
