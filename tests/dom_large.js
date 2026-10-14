// Real-DOM check of long documents (needs jsdom): a full audit run must stay fast and follow scrolling.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const F = require('./fixtures');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const big = F.big(6000);                         // ~560 KB per side
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const toPs = (t) => t.split('\n').map(l => '<p>' + esc(l) + '</p>').join('');
const labels = ['Account Number', 'Address', 'Business Name', 'Contact Number', 'Credentials', 'Date', 'Email Address', 'Overscrubbed', 'Person Name', 'URL/Link'].map(l => `<span>${l}</span>`).join('');
const dom = new JSDOM(`<!doctype html><body><div class="toolbar">${labels}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
  <div id="left" class="document">${toPs(big.left)}</div><div id="right" class="document">${toPs(big.right)}</div></body>`,
  { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
const w = dom.window;
Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
let scrollTop = 0;
const LINE_H = 20;
const leftEl = w.document.getElementById('left'), rightEl = w.document.getElementById('right');
const indexOf = new Map();
for (const pane of [leftEl, rightEl]) Array.from(pane.children).forEach((p, i) => indexOf.set(p, i));
w.Element.prototype.getBoundingClientRect = function () {
  const R = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  if (this === leftEl) return R(40, 100, 600, 780);
  if (this === rightEl) return R(720, 100, 600, 780);
  if (indexOf.has(this)) { const x = this.parentElement === leftEl ? 40 : 720; return R(x, 100 + indexOf.get(this) * LINE_H - scrollTop, 600, LINE_H); }
  return R(0, 0, 0, 0);
};
let net = 0; w.fetch = () => { net++; return Promise.reject(new Error('blocked')); };
w.__PT_TEST__ = true;
w.eval(src);

const rightPs = Array.from(rightEl.children);
const tagsIn = (from, to) => rightPs.slice(from, to).reduce((n, p) => n + p.getElementsByClassName('pt-tag').length, 0);
// A full audit run: the first call may only show "Analysing..." and schedule the real run, so drain timers.
async function audit() {
  w.__pt_rescan();
  await new Promise(r => setTimeout(r, 120));
  return w.__PT__.stats();
}
(async () => {
  const checks = [];
  const s1 = await audit();
  const visibleTags1 = tagsIn(0, 40), farTags1 = tagsIn(4000, 6000);
  checks.push(['viewport mode is used for a 560 KB document', () => assert.ok(s1.viewport && s1.viewport.total >= 6000)]);
  checks.push(['first audit finishes in under 10 s even in the slow jsdom test browser', () => assert.ok(s1.lastRunMs < 10000, s1.lastRunMs + ' ms')]);
  checks.push(['suggestions appear in the visible part', () => assert.ok(visibleTags1 > 0)]);
  checks.push(['far-away parts are not processed yet', () => assert.strictEqual(farTags1, 0)]);
  scrollTop = 4500 * LINE_H;
  const s2 = await audit();
  const visibleTags2 = tagsIn(4500, 4540);
  checks.push(['after scrolling, the new visible part is audited', () => { assert.ok(s2.viewport.ra <= 4500 && s2.viewport.rb >= 4540, JSON.stringify(s2.viewport)); assert.ok(visibleTags2 > 0); }]);
  checks.push(['no network requests', () => assert.strictEqual(net, 0)]);

  let failed = 0;
  for (const [name, fn] of checks) { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '-', e.message); } }
  console.log(`(engine time: first run ${s1.lastRunMs} ms, after scroll ${s2.lastRunMs} ms)`);
  w.__pt_cleanup && w.__pt_cleanup();
  console.log(`\n${checks.length - failed}/${checks.length} large-document DOM checks passed`);
  process.exit(failed ? 1 : 0);
})();
