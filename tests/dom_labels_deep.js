// Real-DOM mistake check for EVERY label (needs jsdom). For each label: the reviewer applies the correct label
// (no red outline expected) and a wrong label (red outline expected). Plus: labeling text that must stay blank.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const LABELS = ['Account Number', 'Address', 'Business Name', 'Contact Number', 'Credentials', 'Date', 'Email Address', 'IP Address', 'Overscrubbed', 'Person Name', 'URL/Link', 'Person Username', 'Vehicle Number Plate'];
const toolbar = LABELS.map(l => `<span>${l}</span>`).join('');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function audit(leftLines, rightLines, token, label) {
  const dom = new JSDOM(`<!doctype html><body><div>${toolbar}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${leftLines.map(l => `<p>${esc(l)}</p>`).join('')}</div><div id="right">${rightLines.map(l => `<p>${esc(l)}</p>`).join('')}</div></body>`,
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
  const settle = () => new Promise(r => setTimeout(r, 700));
  await settle();
  // Platform-style label: coloured span with data-label, wrapped around the text (and around our suggestion if any).
  const p = Array.from(R.querySelectorAll('p')).find(x => x.textContent.includes(token));
  const html = p.innerHTML;
  const tokHtml = esc(token);
  const re = new RegExp('<span class="pt-tag[^>]*>' + tokHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>|' + tokHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  p.innerHTML = html.replace(re, (m) => `<span data-test-ann style="background-color: rgb(240, 240, 240);" data-label="${label}">${m}</span>`);
  await settle();
  const ann = R.querySelector('[data-test-ann]');
  const r = { wrong: !!ann && ann.getAttribute('data-pt-wrong') === 'true', msg: ann && ann.getAttribute('data-error-msg') };
  w.__pt_cleanup && w.__pt_cleanup();
  return r;
}

// [label, left lines, right lines, token, wrong label to try]
const S = (l) => [l, l];
const cases = [
  ['Account Number', ...S(['Account Number: 50100234567891']), '50100234567891', 'Contact Number'],
  ['Address', ...S(['Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087']), 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Business Name'],
  ['Business Name', ...S(['She works at Infosys Limited in Pune.']), 'Infosys Limited', 'Person Name'],
  ['Contact Number', ...S(['Mobile: +91 98450 12345']), '+91 98450 12345', 'Account Number'],
  ['Credentials', ...S(['PAN: ABCDE1234F']), 'ABCDE1234F', 'Account Number'],
  ['Date', ...S(['DOB: 05-11-1988']), '05-11-1988', 'Credentials'],
  ['Email Address', ...S(['Mail priya.raghavan@northwind-demo.com today']), 'priya.raghavan@northwind-demo.com', 'URL/Link'],
  ['IP Address', ...S(['Server 192.168.10.25 is down']), '192.168.10.25', 'Contact Number'],
  ['Overscrubbed', ['The Council Member approved it.'], ['The Council Beagenhydra approved it.'], 'Beagenhydra', 'Person Name'],
  ['Person Name', ...S(['Hi Rahul Sharma, welcome aboard.']), 'Rahul Sharma', 'Business Name'],
  ['URL/Link', ...S(['Docs: https://docs.acmecorp-demo.io/setup']), 'https://docs.acmecorp-demo.io/setup', 'Email Address'],
  ['Person Username', ...S(['Ping @rahul_92 on Slack']), '@rahul_92', 'Person Name'],
  ['Vehicle Number Plate', ...S(['Vehicle: KA 05 MN 4321']), 'KA 05 MN 4321', 'Credentials'],
];
// Text that must stay blank: any label on it is a mistake.
const blanks = [
  ['scrubbed name labeled Person Name', ['I met Furkan at the airport.'], ['I met Dalvorin at the airport.'], 'Dalvorin', 'Person Name'],
  ['scrubbed name labeled Overscrubbed', ['I met Furkan at the airport.'], ['I met Dalvorin at the airport.'], 'Dalvorin', 'Overscrubbed'],
  ['statement date labeled Date', ...S(['Statement Date: 12-01-2026']), '12-01-2026', 'Date'],
  ['city labeled Address', ...S(['Location: Bengaluru']), 'Bengaluru', 'Address'],
  ['bank labeled Business Name', ...S(['Bank: AXIS BANK']), 'AXIS BANK', 'Business Name'],
  ['invalid plate labeled Vehicle', ...S(['Plate: UT 28 EZ 6570']), 'UT 28 EZ 6570', 'Vehicle Number Plate'],
  ['http link labeled URL', ...S(['Old: http://legacy.acmecorp-demo.io']), 'http://legacy.acmecorp-demo.io', 'URL/Link'],
];

(async () => {
  let pass = 0, fail = 0;
  const report = (ok, name, extra) => { if (ok) pass++; else fail++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' - ' + extra)); };
  for (const [label, l, r, tok, wrongLabel] of cases) {
    const good = await audit(l, r, tok, label);
    report(!good.wrong, `${label}: correct label -> no outline`, good.msg);
    const bad = await audit(l, r, tok, wrongLabel);
    report(bad.wrong, `${label}: labeled "${wrongLabel}" instead -> red outline`, JSON.stringify(bad));
  }
  for (const [name, l, r, tok, label] of blanks) {
    const res = await audit(l, r, tok, label);
    report(res.wrong, `${name} -> red outline`, JSON.stringify(res));
  }
  console.log(`\n${pass}/${pass + fail} per-label mistake checks passed`);
  process.exit(fail ? 1 : 0);
})();
