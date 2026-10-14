// Real-DOM check of the mistake check (needs jsdom): a label applied by the reviewer is audited,
// a correct one hides the suggestion, a wrong one gets the red mistake outline.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');

const left = ['| Total Transfer-Ins/VDRs for the year [ 2025 ] | 0 | 0 |', '| Interest details N/A | 0 | 0 |', 'Statement for Kunal Rao'];
const right = ['| Total Galeonorb-Ins/VDRs for the year [ 2025 ] | 0 | 0 |', '| Interest details N/A | 0 | 0 |', 'Statement for Kunal Rao'];
const labels = ['Account Number', 'Address', 'Business Name', 'Contact Number', 'Credentials', 'Date', 'Email Address', 'Overscrubbed', 'Person Name', 'URL/Link'].map(l => `<span>${l}</span>`).join('');

async function scenario(applyLabel) {
  const dom = new JSDOM(`<!doctype html><body><div class="toolbar">${labels}<span>Reference · read-only</span><span>Annotate here</span><span>left.pdf-1</span><span>right.pdf-1</span></div>
    <div id="left" class="document">${left.map(l => `<p>${l}</p>`).join('')}</div><div id="right" class="document">${right.map(l => `<p>${l}</p>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const L = w.document.getElementById('left'), R = w.document.getElementById('right');
  w.Element.prototype.getBoundingClientRect = function () {
    const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
    if (this === L) return box(40, 100, 600, 700);
    if (this === R) return box(720, 100, 600, 700);
    if (R.contains(this) || L.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20);
    return box(0, 0, 0, 0);
  };
  w.__PT_TEST__ = true;
  w.eval(src);
  const settle = () => new Promise(r => setTimeout(r, 900));
  await settle();
  const before = R.querySelectorAll('span.pt-tag').length;
  // The reviewer applies a label: the platform wraps the word in a coloured span (no class, inline style only).
  const p = R.querySelector('p');
  p.innerHTML = p.innerHTML.replace(/<span class="pt-tag[^>]*>(Galeonorb)<\/span>|Galeonorb/, (m) => applyLabel('Galeonorb'));
  await settle();
  const ann = R.querySelector('[data-test-ann]');
  const res = { before, wrong: ann && ann.getAttribute('data-pt-wrong') === 'true', msg: ann && ann.getAttribute('data-error-msg'), suggestionsInside: ann ? ann.querySelectorAll('.pt-tag').length : -1 };
  w.__pt_cleanup && w.__pt_cleanup();
  return res;
}

(async () => {
  const checks = [];
  const okLabel = await scenario(t => `<span data-test-ann style="background-color: rgb(255, 241, 240); border-bottom: 2px dashed rgb(255, 120, 117);" data-label="Overscrubbed">${t}</span>`);
  checks.push(['the overscrub is suggested before labeling', () => assert.ok(okLabel.before > 0)]);
  checks.push(['correct label (Overscrubbed): no mistake outline', () => assert.ok(!okLabel.wrong, okLabel.msg)]);
  checks.push(['correct label: no duplicate suggestion inside it', () => assert.strictEqual(okLabel.suggestionsInside, 0)]);
  const badLabel = await scenario(t => `<span data-test-ann style="background-color: rgb(230, 247, 255);" data-label="Person Name">${t}</span>`);
  checks.push(['wrong label (Person Name on an overscrub): red mistake outline appears', () => assert.ok(badLabel.wrong, JSON.stringify(badLabel))]);
  let failed = 0;
  for (const [name, fn] of checks) { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '-', e.message); } }
  console.log(`\n${checks.length - failed}/${checks.length} mistake-check DOM checks passed`);
  process.exit(failed ? 1 : 0);
})();
