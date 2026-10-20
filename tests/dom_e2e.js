// (v11.4.14) End-to-end on a page with the 13 label chips the live dashboard shows: every kind of value is suggested AND
// highlighted on the page with the right label (no e-mail was ever highlighted before 11.4.14, and no suite caught it), then
// every value is labeled correctly (nothing flagged) and a few wrongly (each flagged). Run: node tests/dom_e2e.js [file]
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Contact Number': [250, 140, 22],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const markStyle = (label) => { const [r, g, b] = PAL[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));`; };
const L = [
  'Employee record',
  'Name: Rahul Sharma',
  'DOB: 05-11-1988',
  'Mobile: +91 98450 12345',
  'Office: 080-2345 6789',
  'US desk: +1 (415) 732-0198',
  'Email: rahul.sharma@northwind-demo.com',
  'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087',
  'Lives at 221B Baker Street, Apt 4, London NW1 6XE',
  'Profile: https://www.linkedin.com/in/rahul-sharma-92',
  'Payslip: https://hr.acmecorp-demo.io/payslips/2024-03.pdf',
  'Logo: https://cdn.acmecorp-demo.io/static/logo.png',
  'Server 192.168.10.25 is down',
  'Ping @rahul_92 on chat',
  'Username: kavya_n',
  'PAN: ABCPE1234F',
  'SSN: 123-45-6789',
  'Passport Number: J8369854',
  'Account Number: 50100234567891',
  'IBAN GB29NWBK60161331926819',
  'IFSC: HDFC0001234',
  'Card: 4111 1111 1111 1111',
  'Vehicle: KA 05 MN 4321',
  'GITHUB_TOKEN=ghp_1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ12',
  'DATABASE_URL=postgres://admin:S3cretPass@db.acme-demo.io:5432/prod',
  'She works at Tata Consultancy Services in Pune.',
  'The Council Member approved it.',
  'Meeting on 12 March 2025',
  '"@babel/helper-plugin-utils": "^7.12.13"',
  '"@babel/helper-plugin-utils": "^7.18.10"',
  'Docs: https://docs.acmecorp-demo.io/guides/inst',
  'allation-steps for details',
  'Mail priya.raghavan@northwind-',
  'demo.com today',
  '"integrity": "sha512-',
  'u7stbOuYjaPezCuLj29hNW1v64M2Md2qupEKP1fHc7WdOA3DgLh37suiSrZYY7haUB7i',
  'BeQZ9P1uiRF359do3g==",',
  'login: kavya.nair',
  'Find me @priya@mastodon.social',
  'Budget: https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0',
  "Sean O'Brien called; ping srinadh about it",
  'Temp reg TS 09 TR 2024 1234',
  'Rahul (9845012346) called about Order #9845012399',
  'Shipping details',
  'Street: 14 Linking Road',
  'City: Mumbai',
  'ZIP: 400050',
  'Thanks',
  'Pincode: 560099',
  'Thanks again',
  '#45, 2nd Cross, Indiranagar, Bengaluru - 560038',
];
const R = L.map(l => l.replace('Council Member', 'Council Beagenhydra').replace('12 March 2025', '19 April 2025'));
const EXPECT = [
  ['Rahul Sharma', 'Person Name'], ['05-11-1988', 'Date'], ['+91 98450 12345', 'Contact Number'], ['080-2345 6789', 'Contact Number'],
  ['+1 (415) 732-0198', 'Contact Number'], ['rahul.sharma@northwind-demo.com', 'Email Address'],
  ['Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address'], ['221B Baker Street, Apt 4, London NW1 6XE', 'Address'],
  ['https://www.linkedin.com/in/rahul-sharma-92', 'URL/Link'], ['https://hr.acmecorp-demo.io/payslips/2024-03.pdf', 'URL/Link'],
  ['192.168.10.25', 'IP Address'], ['@rahul_92', 'Person Username'], ['kavya_n', 'Person Username'], ['ABCPE1234F', 'Credentials'],
  ['123-45-6789', 'Credentials'], ['J8369854', 'Credentials'], ['50100234567891', 'Account Number'], ['GB29NWBK60161331926819', 'Account Number'],
  ['HDFC0001234', 'Credentials'], ['4111 1111 1111 1111', 'Credentials'], ['KA 05 MN 4321', 'Vehicle Number Plate'],
  ['ghp_1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ12', 'Credentials'], ['S3cretPass', 'Credentials'], ['Tata Consultancy Services', 'Business Name'],
  ['Beagenhydra', 'Overscrubbed'], ['19 April', 'Overscrubbed'],
  ['https://docs.acmecorp-demo.io/guides/inst', 'URL/Link'], ['allation-steps', 'URL/Link'],
  ['priya.raghavan@northwind-', 'Email Address'], ['demo.com', 'Email Address'],
  ['u7stbOuYjaPezCuLj29hNW1v64M2Md2qupEKP1fHc7WdOA3DgLh37suiSrZYY7haUB7i', 'Credentials'], ['BeQZ9P1uiRF359do3g==', 'Credentials'],
  ['kavya.nair', 'Person Username'], ['@priya@mastodon.social', 'Person Username'],
  ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0', 'URL/Link'],
  ["Sean O'Brien", 'Person Name'], ['srinadh', 'Person Name'],
  ['TS 09 TR 2024 1234', 'Vehicle Number Plate'], ['9845012346', 'Contact Number'], ['Rahul', 'Person Name'],   // a later mention of "Rahul Sharma"
  // (v11.7.2) separate address fields: the ZIP is part of the address (no Postal Code chip on this page)
  ['14 Linking Road', 'Address'], ['Mumbai', 'Address'], ['400050', 'Address'], ['#45, 2nd Cross, Indiranagar, Bengaluru - 560038', 'Address'],
];
const MUST_NOT = ['560099', '9845012399', 'https://cdn.acmecorp-demo.io/static/logo.png', '12.13', '18.10', 'postgres://admin:S3cretPass@db.acme-demo.io:5432/prod'];
(async () => {
  const dom = new JSDOM(`<!doctype html><body><div>${chips}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${L.map(l => `<div>${esc(l)}</div>`).join('')}</div><div id="right">${R.map(l => `<div>${esc(l)}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () { if (this === Lp) return box(40, 100, 600, 700); if (this === Rp) return box(720, 100, 600, 700); if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20); return box(0, 0, 0, 0); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const errs = []; w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = (...a) => errs.push(a.join(' '));
  w.__PT_TEST__ = true; w.eval(src);
  await new Promise(r => setTimeout(r, 1500));
  const tags = Array.from(Rp.querySelectorAll('span.pt-tag')).map(t => [t.textContent, t.getAttribute('data-label')]);
  let bad = 0;
  for (const [txt, lab] of EXPECT) { const hit = tags.find(([x]) => x === txt); if (!hit || hit[1] !== lab) { bad++; console.log('✗ MISSING/WRONG', JSON.stringify(txt), 'want', lab, 'got', hit ? hit[1] : 'nothing'); } }
  for (const txt of MUST_NOT) if (tags.some(([x]) => x === txt)) { bad++; console.log('✗ SHOULD NOT TAG', txt, JSON.stringify(tags.filter(([x]) => x === txt))); }
  const extra = tags.filter(([x]) => !EXPECT.some(([t]) => t === x));
  console.log('extra tags:', JSON.stringify(extra));
  console.log('status:', (w.document.getElementById('pt-status-text') || {}).textContent);
  const realErrs = errs.filter(x => !/getContext|not implemented/i.test(x));
  if (realErrs.length) { bad++; console.log('✗ console errors:', realErrs.slice(0, 5)); }
  console.log(`${EXPECT.length + MUST_NOT.length - bad}/${EXPECT.length + MUST_NOT.length} e2e checks`);
  // --- mistake check: label every value correctly, then some wrongly
  const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
  const annotate = async (word, label) => {
    const nodes = [], starts = []; let all = '';
    const walker = w.document.createTreeWalker(Rp, w.NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { nodes.push(n); starts.push(all.length); all += n.nodeValue; }
    let pos = -1, from = 0;
    while ((pos = all.indexOf(word, from)) >= 0) { const inMark = nodes.some((nd, k) => starts[k] <= pos && pos < starts[k] + nd.nodeValue.length && nd.parentElement.closest('mark')); if (!inMark) break; from = pos + 1; }
    if (pos < 0) throw new Error('word not found: ' + word);
    const at = (p) => { let k = 0; while (k + 1 < nodes.length && starts[k + 1] <= p) k++; return [nodes[k], p - starts[k]]; };
    const [sn, so] = at(pos), [en, eo] = at(pos + word.length - 1);
    const rg = w.document.createRange(); rg.setStart(sn, so); rg.setEnd(en, eo + 1);
    const tag = sn === en && sn.parentElement.classList.contains('pt-tag') && sn.parentElement.textContent === word ? sn.parentElement : null;
    if (tag) { rg.setStartBefore(tag); rg.setEndAfter(tag); }
    const m = w.document.createElement('mark'); m.setAttribute('role', 'button'); m.setAttribute('tabindex', '0'); m.setAttribute('style', markStyle(label));
    m.appendChild(rg.extractContents()); rg.insertNode(m); return m;
  };
  const marks = [];
  for (const [txt, lab] of EXPECT) marks.push([txt, lab, await annotate(txt, lab)]);
  await settle(1500);
  let mb = 0;
  for (const [txt, lab, m] of marks) { const st = m.getAttribute('data-ptc'); if (st !== 'ok') { mb++; console.log('✗ CORRECT LABEL NOT OK', JSON.stringify(txt), lab, '->', st, m.getAttribute('data-ptc-expected'), '|', (m.getAttribute('data-ptc-why') || '').slice(0, 90)); } }
  console.log('status after correct labels:', (w.document.getElementById('pt-status-text') || {}).textContent);
  console.log(`${marks.length - mb}/${marks.length} correct labels accepted`);
  // wrong labels
  const WRONG = [['https://cdn.acmecorp-demo.io/static/logo.png', 'URL/Link'], ['Pune', 'Address'], ['Employee', 'Person Name'], ['9845012399', 'Contact Number']];
  let wb = 0;
  for (const [txt, lab] of WRONG) { const m = await annotate(txt, lab); await settle(900); const st = m.getAttribute('data-ptc'); if (st !== 'wrong') { wb++; console.log('✗ WRONG LABEL NOT FLAGGED', txt, lab, '->', st); } }
  console.log(`${WRONG.length - wb}/${WRONG.length} wrong labels flagged`);
  console.log('status after wrong labels:', (w.document.getElementById('pt-status-text') || {}).textContent);
  w.__pt_cleanup && w.__pt_cleanup();
  const failed = bad + mb + wb;
  console.log(failed ? `\n${failed} end-to-end checks FAILED` : `\nall end-to-end checks passed`);
  process.exit(failed ? 1 : 0);
})();
