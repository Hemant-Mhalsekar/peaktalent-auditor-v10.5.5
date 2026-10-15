// Optional real-DOM test (needs jsdom):  npm install && npm run test:dom
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body>
  <div class="prompt-box receipt-x">Prompt area must survive</div>
  <mark data-label="Person Name">Platform annotation must survive</mark>
  <div id="right"><p>Contact Rahul Sharma at 9876543210 about the zorvanex.</p></div>
</body>`, { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review' });
const w = dom.window;
w.__PT_TEST__ = true;
let net = 0; w.fetch = () => { net++; return Promise.reject(new Error('blocked')); };

w.eval(src); w.eval(src);
const right = w.document.getElementById('right');
const n = w.__PT__.applyAllTargetsInSinglePass(right, [
  { text: 'Rahul Sharma', label: 'Person Name', cls: 'pt-person', priority: 85 },
  { text: '9876543210', label: 'Contact Number', cls: 'pt-contact', priority: 95 },
  { text: 'zorvanex', label: 'Overscrubbed', cls: 'pt-overscrub', priority: 65 },
]);
const checks = [
  ['three spans tagged', () => assert.strictEqual(n, 3)],
  ['page elements with "pt-" in a class survive start-up', () => assert.ok(w.document.querySelector('.prompt-box'))],
  ['platform <mark> annotations survive start-up', () => assert.ok(w.document.querySelector('mark[data-label]'))],
  ['tagging does not change the visible text', () => assert.ok(right.textContent.includes('Contact Rahul Sharma at 9876543210 about the zorvanex.'))],
  ['only one floating bar and one style tag after two loads', () => {
    assert.strictEqual(w.document.querySelectorAll('#pt-floating-bar').length, 1);
    assert.strictEqual(w.document.querySelectorAll('#pt-precision-styles').length, 1);
  }],
  ['reloading unwraps the tool\'s own spans', () => { w.eval(src); assert.strictEqual(w.document.querySelectorAll('span.pt-tag').length, 0); }],
  ['no network requests', () => assert.strictEqual(net, 0)],
];
// (v11.3.5) links on the page: sentence punctuation after a link, and a link that is only the start of a longer one
{
  const tagText = (html, texts) => {
    const box = w.document.createElement('div');
    box.innerHTML = html;
    w.document.body.appendChild(box);
    w.__PT__.applyAllTargetsInSinglePass(box, texts.map(t => ({ text: t, label: 'URL/Link', cls: 'pt-url', priority: 85 })));
    const out = Array.from(box.querySelectorAll('span.pt-tag')).map(s => s.textContent);
    box.remove();
    return out;
  };
  const L = 'https://acmecorp-demo.io/policy';
  checks.push(
    ['link followed by a full stop is tagged', () => assert.deepStrictEqual(tagText('<p>Read ' + L + '.</p>', [L]), [L])],
    ['link followed by a comma is tagged', () => assert.deepStrictEqual(tagText('<p>See ' + L + ', then go</p>', [L]), [L])],
    ['a link that is only the start of a longer link is not tagged', () => assert.deepStrictEqual(tagText('<p>Get ' + L + '.html now</p>', [L]), [])],
    ['a link with its own brackets is tagged whole', () => assert.deepStrictEqual(tagText('<p>Film https://en.wikipedia.org/wiki/Heat_(film) ok</p>', ['https://en.wikipedia.org/wiki/Heat_(film)']), ['https://en.wikipedia.org/wiki/Heat_(film)'])],
    ['each line of a wrapped link is tagged', () => assert.deepStrictEqual(tagText('<div>Open https://acmecorp-demo.io/very/long/</div><div>path/to/page now</div>', ['https://acmecorp-demo.io/very/long/', 'path/to/page']), ['https://acmecorp-demo.io/very/long/', 'path/to/page'])],
  );
}
let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '-', e.message); }
}
w.__pt_cleanup && w.__pt_cleanup();
console.log(`\n${checks.length - failed}/${checks.length} DOM checks passed`);
process.exit(failed ? 1 : 0);
