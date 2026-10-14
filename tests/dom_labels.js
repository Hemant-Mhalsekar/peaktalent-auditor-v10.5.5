// Real-DOM check of the MISTAKE CHECK for every label (needs jsdom).
// For each label: the reviewer applies the RIGHT label -> no red outline; a WRONG label -> red outline.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const LABELS = ['Account Number', 'Address', 'Business Name', 'Contact Number', 'Credentials', 'Date', 'Email Address', 'IP Address', 'Overscrubbed', 'Person Name', 'URL/Link', 'Person Username', 'Vehicle Number Plate'];
const toolbar = LABELS.map(l => `<span>${l}</span>`).join('');

// [name, left line, right line, text to label, correct label, a wrong label]
const CASES = [
  ['account', 'Account Number: 50100234567891', 'Account Number: 50100234567891', '50100234567891', 'Account Number', 'Contact Number'],
  ['address', 'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address', 'Person Name'],
  ['business', 'Vendor: Zentrix Analytics Pvt Ltd', 'Vendor: Zentrix Analytics Pvt Ltd', 'Zentrix Analytics Pvt Ltd', 'Business Name', 'Person Name'],
  ['contact', 'Call 9876543210 today', 'Call 9876543210 today', '9876543210', 'Contact Number', 'Account Number'],
  ['credentials', 'PAN: ABCDE1234F', 'PAN: ABCDE1234F', 'ABCDE1234F', 'Credentials', 'Vehicle Number Plate'],
  ['date', 'DOB: 05-11-1988', 'DOB: 05-11-1988', '05-11-1988', 'Date', 'Credentials'],
  ['email', 'Mail priya.raghavan@northwind-demo.com now', 'Mail priya.raghavan@northwind-demo.com now', 'priya.raghavan@northwind-demo.com', 'Email Address', 'URL/Link'],
  ['ip', 'Server 192.168.10.25 is down', 'Server 192.168.10.25 is down', '192.168.10.25', 'IP Address', 'Contact Number'],
  ['overscrub', 'The Council Member approved it.', 'The Council Beagenhydra approved it.', 'Beagenhydra', 'Overscrubbed', 'Person Name'],
  ['person', 'Signed: Pooja Hegde', 'Signed: Pooja Hegde', 'Pooja Hegde', 'Person Name', 'Business Name'],
  ['url', 'Docs: https://docs.acmecorp-demo.io/setup', 'Docs: https://docs.acmecorp-demo.io/setup', 'https://docs.acmecorp-demo.io/setup', 'URL/Link', 'Email Address'],
  ['username', 'Ping @rahul_92 on Slack', 'Ping @rahul_92 on Slack', '@rahul_92', 'Person Username', 'Email Address'],
  ['plate', 'Car: KA 05 MN 4321', 'Car: KA 05 MN 4321', 'KA 05 MN 4321', 'Vehicle Number Plate', 'Credentials'],
  // Things that must NOT be labeled at all: any label is a mistake.
  ['scrubbed name', 'I met Furkan at the airport.', 'I met Dalvorin at the airport.', 'Dalvorin', null, 'Person Name'],
  ['statement date', 'Statement Date: 12-01-2026', 'Statement Date: 12-01-2026', '12-01-2026', null, 'Date'],
  ['scrubbed company', 'She joined Accenture in 2019.', 'She joined Velmoratech in 2019.', 'Velmoratech', null, 'Overscrubbed'],
];

async function audit(leftLine, rightLine, text, label) {
  const dom = new JSDOM(`<!doctype html><body><div>${toolbar}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left"><p>${leftLine}</p><p>filler line one</p></div><div id="right"><p>${rightLine}</p><p>filler line one</p></div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const L = w.document.getElementById('left'), R = w.document.getElementById('right');
  w.Element.prototype.getBoundingClientRect = function () {
    const b = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
    if (this === L) return b(40, 100, 600, 700);
    if (this === R) return b(720, 100, 600, 700);
    if (R.contains(this) || L.contains(this)) return b(this.closest('#left') ? 40 : 720, 120, 300, 20);
    return b(0, 0, 0, 0);
  };
  w.__PT_TEST__ = true;
  w.eval(src);
  const settle = () => new Promise(r => setTimeout(r, 700));
  await settle();
  // The platform wraps the selected text in an annotation span carrying the label.
  const p = R.querySelector('p');
  const plain = p.textContent;
  const i = plain.indexOf(text);
  p.innerHTML = '';
  p.appendChild(w.document.createTextNode(plain.slice(0, i)));
  const ann = w.document.createElement('span');
  ann.setAttribute('data-label', label); ann.setAttribute('data-test-ann', '');
  ann.setAttribute('style', 'background-color: rgb(240, 240, 240);');
  ann.textContent = text;
  p.appendChild(ann);
  p.appendChild(w.document.createTextNode(plain.slice(i + text.length)));
  await settle();
  const wrong = ann.getAttribute('data-pt-wrong') === 'true';
  const msg = ann.getAttribute('data-error-msg') || '';
  w.__pt_cleanup && w.__pt_cleanup();
  return { wrong, msg };
}

(async () => {
  let pass = 0, fail = 0;
  for (const [name, l, r, text, good, bad] of CASES) {
    if (good) {
      const a = await audit(l, r, text, good);
      if (!a.wrong) pass++; else { fail++; console.log(`✗ ${name}: correct label "${good}" was flagged - ${a.msg}`); }
    }
    const b = await audit(l, r, text, bad);
    if (b.wrong) pass++; else { fail++; console.log(`✗ ${name}: wrong label "${bad}" on "${text}" was NOT flagged`); }
  }
  console.log(`\n${pass}/${pass + fail} per-label mistake-check DOM checks passed`);
  process.exit(fail ? 1 : 0);
})();
