// Real-DOM tests (need jsdom) for the LABEL CHECK (v11.0.0), using the live dashboard's own label markup as reported
// by its Diagnose panel: <mark role="button"> with a translucent background + gradient underline, colours from the
// label chips at the top. Every label is tested: correct label -> no mark; wrong label -> red mark naming the
// CORRECT label. Also: re-check after every annotation, label change, label removal, and that the document text
// is never modified.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Indian Mobile Number': [250, 140, 22], 'International Phone Number': [0, 150, 80], 'Postal Code': [120, 40, 40],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const LABELS = Object.keys(PAL);
const chipsFor = (P) => Object.entries(P).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const chips = chipsFor(PAL);
const markStyle = (label, P = PAL) => { const [r, g, b] = P[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));`; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function page(leftLines, rightLines, P = PAL) {
  const dom = new JSDOM(`<!doctype html><body><div>${chipsFor(P)}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
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
    m.setAttribute('role', 'button'); m.setAttribute('tabindex', '0'); m.setAttribute('style', markStyle(label, P));
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
same('Account Number', 'Account Number: 50100234567891', '50100234567891', 'Account Number', 'Indian Mobile Number');
same('Address', 'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address', 'Business Name');
same('Business Name', 'She works at Infosys Limited in Pune.', 'Infosys Limited', 'Business Name', 'Person Name');
same('Indian Mobile Number', 'Mobile: +91 98450 12345', '+91 98450 12345', 'Indian Mobile Number', 'Account Number');
// (v11.4.0) Contact group of the new label set
same('International Phone Number', 'US desk: +1 (415) 732-0198', '+1 (415) 732-0198', 'International Phone Number', 'Indian Mobile Number');
same('Indian landline', 'Office: 080-2345 6789', '080-2345 6789', 'International Phone Number', 'Indian Mobile Number');
same('Postal Code', 'Pincode: 560087', '560087', 'Postal Code', 'Address');
same('partial address', 'Meet at MG Road tomorrow', 'MG Road', 'Address', 'Postal Code');
same('Credentials', 'PAN: ABCDE1234F', 'ABCDE1234F', 'Credentials', 'Vehicle Number Plate');
same('Date', 'DOB: 05-11-1988', '05-11-1988', 'Date', 'Credentials');
same('Email Address', 'Mail priya.raghavan@northwind-demo.com today', 'priya.raghavan@northwind-demo.com', 'Email Address', 'URL/Link');
same('IP Address', 'Server 192.168.10.25 is down', '192.168.10.25', 'IP Address', 'Indian Mobile Number');
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
diff('scrubbed phone', 'Call 9876543210 today', 'Call 9123456780 today', '9123456780', '', 'Indian Mobile Number');
// (v11.5.2) Vehicle Number Plate
same('plate with dots', 'Reg KA.05.MN.4321 noted', 'KA.05.MN.4321', 'Vehicle Number Plate', 'Credentials');
same('temporary plate', 'Temp reg TS 09 TR 2024 1234', 'TS 09 TR 2024 1234', 'Vehicle Number Plate', 'Credentials');
same('foreign plate behind a key', 'Licence plate: 7ABC123', '7ABC123', 'Vehicle Number Plate', 'Credentials');
diff('plate replaced by a word', 'Car: KA 05 MN 4321', 'Car: hello', 'hello', 'Overscrubbed', 'Vehicle Number Plate');
// (v11.5.1) Person Name
same("name with an apostrophe", "Sean O'Brien called", "Sean O'Brien", 'Person Name', 'Business Name');
same('name with accents', 'José García signed the form', 'José García', 'Person Name', 'Business Name');
same('lower-case name after ping', 'ping srinadh about it', 'srinadh', 'Person Name', 'Business Name');
same('surname first', 'Sharma, Rahul (Employee ID 42)', 'Sharma, Rahul', 'Person Name', 'Business Name');
diff('name replaced by a word', 'Signed: Pooja Hegde', 'Signed: hello', 'hello', 'Overscrubbed', 'Person Name');
// (v11.5.0) Business Name
same('platform used as a tool', 'Ping @rahul_92 on Slack', 'Slack', '', 'Business Name');
same('platform as an employer', 'She works at LinkedIn in Bengaluru.', 'LinkedIn', 'Business Name', 'Person Name');
same('hospital', 'Admitted at Apollo Hospitals, Chennai', 'Apollo Hospitals', 'Business Name', 'Address');
same('company with Inc.', 'Contract with Initech Inc. signed', 'Initech Inc.', 'Business Name', 'Person Name');
same('ordinary word in a company slot', 'Vendor: Internal', 'Internal', '', 'Business Name');
diff('company replaced by a word', 'Vendor: Zentrix Analytics Pvt Ltd', 'Vendor: hello', 'hello', 'Overscrubbed', 'Business Name');
// (v11.4.10) Financial
same('IBAN', 'IBAN GB29NWBK60161331926819', 'GB29NWBK60161331926819', 'Account Number', 'Credentials');
same('routing number', 'Routing Number: 021000021', '021000021', 'Credentials', 'Account Number');
same('Amex card', 'Amex 3782 822463 10005', '3782 822463 10005', 'Credentials', 'Account Number');
same('Bitcoin wallet', 'Send to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'Credentials', 'URL/Link');
same('account behind Account #', 'Account #: 000123456789', '000123456789', 'Account Number', 'Indian Mobile Number');
// (v11.4.9) Date of birth
same('DOB month first', 'Birth Date: November 5, 1988', 'November 5, 1988', 'Date', 'Credentials');
same('DOB Indonesian key', 'Tanggal Lahir: 21-09-1996', '21-09-1996', 'Date', 'Credentials');
same('DOB month and year only', 'DOB: Sept 1996', 'Sept 1996', '', 'Date');
same('date of death', 'Date of Death: 03-02-2020', '03-02-2020', '', 'Date');
diff('DOB replaced by a word', 'DOB: 05-11-1988', 'DOB: velmora', 'velmora', 'Overscrubbed', 'Date');
// (v11.4.8) Credentials
same('SSN', 'SSN: 123-45-6789', '123-45-6789', 'Credentials', 'Date');
same('passport', 'Passport Number: J8369854', 'J8369854', 'Credentials', 'Vehicle Number Plate');
same('bearer token', 'Authorization: Bearer abc123def456ghi789jkl012', 'abc123def456ghi789jkl012', 'Credentials', 'Person Username');
same('password inside a connection URL', 'DATABASE_URL=postgres://admin:S3cretPass@db.acme-demo.io:5432/prod', 'S3cretPass', 'Credentials', 'Overscrubbed');
same('placeholder secret', 'api_key: YOUR_API_KEY_HERE', 'YOUR_API_KEY_HERE', '', 'Credentials');
// (v11.4.7) Address
same('UK address, whole line', 'Visit 10 Downing Street, London SW1A 2AA', '10 Downing Street, London SW1A 2AA', 'Address', 'Person Name');
same('PO box', 'Mail to P.O. Box 1234, Dubai, UAE', 'P.O. Box 1234, Dubai, UAE', 'Address', 'Credentials');
same('place inside an address', 'Door No. 12/3, Anna Salai, Chennai 600002', 'Anna Salai', '', 'Person Name');
diff('address replaced by a word', 'Ship to 12, MG Road, Pune 411001 today', 'Ship to hello today', 'hello', 'Overscrubbed', 'Address');
// (v11.4.6) Person Username
same('capitalised handle', 'Follow @RahulVerma on X', '@RahulVerma', 'Person Username', 'Person Name');
same('hyphen handle', 'Assigned to @rahul-verma today', '@rahul-verma', 'Person Username', 'Credentials');
same('group mention', 'Heads up @channel deploy is done', '@channel', '', 'Person Username');
same('python decorator', '@dataclass', '@dataclass', '', 'Person Username');
same('username behind a key', 'Username: rahul_92', 'rahul_92', 'Person Username', 'Credentials');
same('generic account', 'user: Master', 'Master', '', 'Person Username');
diff('handle replaced by a word', 'Ping @rahul_92 on chat', 'Ping hello on chat', 'hello', 'Overscrubbed', 'Person Username');
// (v11.4.5) IP Address
same('IPv6 with a :: in the middle', 'Link fe80::1ff:fe23:4567:890a up', 'fe80::1ff:fe23:4567:890a', 'IP Address', 'Credentials');
same('IP before a full stop', 'Ping 8.8.8.8.', '8.8.8.8', 'IP Address', 'Date');
same('version number after which "build"', 'pkg 10.2.0.15 build', '10.2.0.15', '', 'IP Address');
diff('word replaced by an IP', 'Server alpha is down', 'Server 10.1.2.3 is down', '10.1.2.3', 'Overscrubbed', 'IP Address');
// (v11.4.4) Overscrubbed rules
diff('number replaced by a word', 'Order 12345 shipped', 'Order hello shipped', 'hello', 'Overscrubbed', 'Date');
diff('number replaced by a number', 'Order 12345 shipped', 'Order 00000 shipped', '00000', '', 'Overscrubbed');
diff('changed ordinary date', 'Meeting on 12 March 2025', 'Meeting on 19 April 2025', '19 April', 'Overscrubbed', 'Date');
diff('changed date of birth', 'DOB: 05-11-1988', 'DOB: 17-02-1991', '17-02-1991', '', 'Overscrubbed');
diff('changed part of a code name', 'def calculate_total(items):', 'def calculate_zelvor(items):', 'zelvor', 'Overscrubbed', 'Credentials');
diff('changed camelCase part', 'const getUserProfile = 1;', 'const getUserVelmora = 1;', 'Velmora', 'Overscrubbed', 'Person Name');
same('statement date (not DOB)', 'Statement Date: 12-01-2026', '12-01-2026', '', 'Date');
same('city alone', 'Location: Bengaluru', 'Bengaluru', '', 'Address');
same('link to a file (v11.4.1)', 'Logo: https://cdn.acmecorp-demo.io/static/logo.png', 'https://cdn.acmecorp-demo.io/static/logo.png', '', 'URL/Link');
same('placeholder e-mail (v11.4.3)', 'Mail priya@example.com today', 'priya@example.com', '', 'Email Address');
same('test@ on a real domain (v11.4.3)', 'Mail test@acmecorp-demo.io today', 'test@acmecorp-demo.io', 'Email Address', 'URL/Link');
same('asset file name (v11.4.3)', 'Logo icon@2x.png here', 'icon@2x.png', '', 'Email Address');
same("apostrophe e-mail (v11.4.3)", "Mail sean.o'brien@initech-demo.com today", "sean.o'brien@initech-demo.com", 'Email Address', 'Person Name');
same('link to a document (v11.4.2)', 'Payslip: https://hr.acmecorp-demo.io/payslips/2024-03.pdf', 'https://hr.acmecorp-demo.io/payslips/2024-03.pdf', 'URL/Link', 'Date');
same('Google Sheets link (v11.4.2)', 'Budget: https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'URL/Link', 'Credentials');
same('link to a script (v11.4.1)', 'Load https://cdn.acmecorp-demo.io/app/main.js first', 'https://cdn.acmecorp-demo.io/app/main.js', '', 'URL/Link');
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

  // Reported case: README "# Droom Chat" - the reviewer labels "Droom" (identical) as Business Name twice. The pane
  // header contains the file name and a light-blue "Annotate here" chip; neither is a label.
  {
    const p = await page(['# Droom Chat', '', 'Chat Plugin for Droom'], ['# Droom Chat', '', 'Chat Plugin for Droom']);
    const hdr = p.w.document.createElement('div');
    const [r, g, b] = PAL['Person Name'];
    hdr.innerHTML = `<span>right.md-d146149f</span><span style="background-color: rgba(${r}, ${g}, ${b}, 0.12); color: rgb(${r}, ${g}, ${b}); border-radius: 6px">Annotate here</span>`
      // the same title row as on a .gitkeep file, with an icon inside the chip
      + `<div><span>right.gitkeep-03956dc6</span><a style="background-color: rgba(${r}, ${g}, ${b}, 0.12); color: rgb(${r}, ${g}, ${b})"><i>\u270E</i> Annotate here</a></div>`;
    p.Rp.insertBefore(hdr, p.Rp.firstChild);
    await p.settle();
    await p.annotate('Droom', 'Business Name');
    await p.annotate('Droom', 'Business Name');
    const chip = Array.from(p.Rp.querySelectorAll('span')).find(s => s.textContent === 'Annotate here');
    const chip2 = p.Rp.querySelector('a');
    check(!chip.getAttribute('data-ptc') && !chip2.getAttribute('data-ptc') && !p.w.document.querySelector('[data-ptc="wrong"]') && !/Mistake/.test(p.status()),
      'pane header ("Annotate here" chip, file name) is never judged; correct Business Name labels -> no mistake', { chip: chip.getAttribute('data-ptc'), status: p.status() });
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

  // (v11.3.5) The mistake check must never fail silently: a label that could not be checked (judge crashed, colour unreadable)
  // is counted and shown, so "0 mistakes" can be told apart from "nothing could be checked".
  {
    const ALL_CLEAR = /^\uD83C\uDFAF \d+ to Annotate$/;
    // makes the judge crash for the text "ZQX" only: Map.get('ZQX') throws, but only when called from judgeLabel (the engine's other
    // code, and every other label, are untouched)
    const breakJudge = (w) => { const G = w.Map.prototype.get; w.Map.prototype.get = function (k) { if (k === 'ZQX' && /judgeLabel/.test(new w.Error().stack || '')) throw new Error('boom-test'); return G.call(this, k); }; };
    const stats = (p) => p.w.__PT__.labelStats() || {};
    const notChecked = (s) => (s.errors || 0) + (s.unread || 0);

    // Test A: judge crashes for one label -> not a mistake, counted as an error, bar says "not checked", not the all-clear
    {
      const p = await page(['Code ZQX here'], ['Code ZQX here']);
      breakJudge(p.w);
      const m = await p.annotate('ZQX', 'Person Name');
      const s = stats(p);
      check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), 'A: a crashed label check is not flagged as a mistake', p.state(m));
      check(s.errors === 1 && /boom-test/.test(s.lastError || ''), 'A: stats.errors == 1 and stats.lastError is kept', s);
      check(/0 mistakes, 1 not checked/.test(p.status()) && !ALL_CLEAR.test(p.status()), 'A: bar says "0 mistakes, 1 not checked", not the all-clear', p.status());
      check(/errors: 1/.test(p.w.document.getElementById('pt-status-text').title) && /unread: 0/.test(p.w.document.getElementById('pt-status-text').title), 'A: the tooltip lists the counts', p.w.document.getElementById('pt-status-text').title);
      p.close();
    }
    // Test B: a <mark> whose colour cannot be read and that is not in the dialog memory (next to one readable, correct label)
    const unread = (m) => { for (const a of Array.from(m.attributes)) m.removeAttribute(a.name); m.setAttribute('style', 'background-color: transparent;'); };   // nothing the check can read
    {
      const p = await page(['Code ZQX here, Hi Rahul Sharma.'], ['Code ZQX here, Hi Rahul Sharma.']);
      await p.annotate('Rahul Sharma', 'Person Name');
      unread(await p.annotate('ZQX', 'Person Name'));
      await p.settle();
      const s = stats(p);
      check(s.unread === 1 && s.skipped && s.skipped.unread === 1, 'B: an unreadable <mark> is counted (stats.unread, stats.skipped.unread)', s);
      check(/0 mistakes, 1 not checked/.test(p.status()) && !ALL_CLEAR.test(p.status()), 'B: bar says "0 mistakes, 1 not checked"', p.status());
      p.close();
    }
    // the existing "labels not readable" hint still shows when NO label could be read at all
    {
      const p = await page(['Code ZQX here'], ['Code ZQX here']);
      unread(await p.annotate('ZQX', 'Person Name'));
      await p.settle();
      check(/labels not readable/.test(p.status()) && !ALL_CLEAR.test(p.status()) && stats(p).unread === 1, 'B2: no label readable -> the "labels not readable" hint is kept', p.status());
      p.close();
    }
    // Test C: everything readable and correct -> nothing not checked, normal state
    {
      const p = await page(['Hi Rahul Sharma, welcome aboard.'], ['Hi Rahul Sharma, welcome aboard.']);
      await p.annotate('Rahul Sharma', 'Person Name');
      const s = stats(p);
      check(notChecked(s) === 0 && s.checked === 1 && ALL_CLEAR.test(p.status()), 'C: all labels readable and correct -> notChecked == 0, normal bar', { s, status: p.status() });
      p.close();
    }
    // Test D: one real mistake plus one crash
    {
      const p = await page(['Deliver exclusive stories. Code ZQX here'], ['Deliver exclusive stories. Code ZQX here']);
      breakJudge(p.w);
      await p.annotate('exclusive', 'Date');
      await p.annotate('ZQX', 'Person Name');
      const s = stats(p);
      check(s.errors === 1 && /1 Mistake \(\+1 not checked\)/.test(p.status()), 'D: one mistake + one crash -> "1 Mistake (+1 not checked)"', { s, status: p.status() });
      p.close();
    }
    // too short / too long labels are counted separately and do not count as "not checked"
    {
      const p = await page(['Code Q here'], ['Code Q here']);
      await p.annotate('Q', 'Person Name');
      const s = stats(p);
      check(s.skipped && s.skipped.tooShort === 1 && notChecked(s) === 0, 'a one-character label is counted in skipped.tooShort, not in "not checked"', s);
      p.close();
    }
  }

  // (v11.3.6) Labels that share a colour are never guessed. Email Address and Person Name get the SAME colour here, in both chip
  // orders. The check judges every candidate: all wrong -> a real mistake; mixed -> "unsure" (counted as not checked); a label
  // the dialog told us about resolves the tie.
  {
    const stats = (p) => p.w.__PT__.labelStats() || {};
    const sharedPal = (emailFirst) => {
      const blue = PAL['Person Name'], P = {};
      for (const n of (emailFirst ? ['Email Address', 'Person Name'] : ['Person Name', 'Email Address'])) P[n] = blue;
      for (const n of Object.keys(PAL)) if (!(n in P)) P[n] = PAL[n];
      return P;
    };
    const ORDERS = [['Email first', true], ['Person Name first', false]];
    const EMAIL = 'priya.raghavan@northwind-demo.com';
    const sameLine = ['Mail ' + EMAIL + ' today'];
    const notCheckedAll = (s) => (s.errors || 0) + (s.unread || 0) + (s.ambiguous || 0);
    const dialogApply = async (p, word, label) => {
      const d = p.w.document.createElement('div');
      d.setAttribute('role', 'dialog');
      d.innerHTML = `<div>Change label for</div><div>\u201C${word}\u201D</div><div class="label-select"><span>${label}</span></div><button>Remove</button><button>Cancel</button><button>\u2713 Apply</button>`;
      p.w.document.body.appendChild(d);
      await p.settle(50);
      d.querySelectorAll('button')[2].dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
      d.remove();
      await p.settle(900);
    };
    const seenStates = {};
    for (const [name, emailFirst] of ORDERS) {
      const P = sharedPal(emailFirst);
      // Test 1: an e-mail labeled Person Name, shared colour -> unsure, not ok, not a normal mistake
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Person Name');
        const s = stats(p), st = p.state(m);
        seenStates[name] = { mark: st.mark, your: st.your, expected: st.expected, ambiguous: s.ambiguous };
        check(st.mark === 'unsure' && (s.ambiguous | 0) === 1 && notCheckedAll(s) >= 1 && !/Mistake/.test(p.status()) && /not checked/.test(p.status()),
          `T1 (${name}): e-mail labeled Person Name on a shared colour -> "unsure", counted as not checked, not a mistake`, { st, s, status: p.status() });
        check(/Colour is shared by Email Address and Person Name/.test(st.why || '') && st.your === 'Email Address / Person Name', `T1 (${name}): the badge names both labels and the why-text explains it`, st);
        p.close();
      }
      // Test 2: a real person name labeled Person Name -> never "wrong"
      {
        const line = ['Hi Rahul Sharma, welcome aboard.'];
        const p = await page(line, line, P);
        const m = await p.annotate('Rahul Sharma', 'Person Name');
        check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), `T2 (${name}): real person name on a shared colour -> no false mistake`, { st: p.state(m), status: p.status() });
        p.close();
      }
      // Test 3: a real e-mail labeled Email Address -> never "wrong"
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Email Address');
        check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), `T3 (${name}): real e-mail labeled Email Address on a shared colour -> no false mistake`, { st: p.state(m), status: p.status() });
        p.close();
      }
      // Test 4: a replaced value: both candidate labels are wrong -> a real mistake
      for (const lab of ['Person Name', 'Email Address']) {
        const p = await page(['The Council Member approved it.'], ['The Council Beagenhydra approved it.'], P);
        const m = await p.annotate('Beagenhydra', lab);
        const st = p.state(m);
        check(st.mark === 'wrong' && st.expected === 'Overscrubbed' && /1 Mistake/.test(p.status()) && /shared/i.test(st.why || ''),
          `T4 (${name}): replaced value labeled "${lab}" on a shared colour -> a real mistake (both candidates wrong)`, { st, status: p.status() });
        p.close();
      }
      // Test 5: the label dialog resolves the tie
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Person Name');
        await dialogApply(p, EMAIL, 'Person Name');
        const st = p.state(m);
        check(st.mark === 'wrong' && st.your === 'Person Name' && st.expected === 'Email Address' && /1 Mistake/.test(p.status()),
          `T5 (${name}): the dialog says Person Name -> tie resolved, judged as a normal mistake (e-mail -> Email Address)`, { st, status: p.status() });
        p.close();
      }
    }
    check(JSON.stringify(seenStates['Email first']) === JSON.stringify(seenStates['Person Name first']), 'T1: the result is identical in both chip orders', seenStates);
    // Test 6: a palette without ties behaves as before (and nothing is counted as ambiguous)
    {
      const p = await page(sameLine, sameLine);
      const m = await p.annotate(EMAIL, 'Person Name');
      const st = p.state(m), s = stats(p);
      check(st.mark === 'wrong' && st.expected === 'Email Address' && (s.ambiguous | 0) === 0 && /1 Mistake/.test(p.status()), 'T6: no tie -> e-mail labeled Person Name is a normal mistake, ambiguous == 0', { st, s });
      p.close();
    }
  }

  // (v11.5.4) a company name inside a code tag ("@OnJunoAPI") labeled Business Name is accepted, as reviewers are told to label it
  {
    const line = ['@OnJunoAPI', 'Scenario: Get Externally Linked Accounts'];
    const p = await page(line, line);
    const m = await p.annotate('Juno', 'Business Name', true);
    const st = p.state(m);
    check(st.mark !== 'wrong', 'Business Name on "Juno" inside "@OnJunoAPI" is not a mistake', st);
    p.close();
  }

  // (v11.7.1) Credentials, second review: the check uses the same rules as the suggestions
  {
    const CR = [
      // [line, labeled text, label, expected verdict ('wrong' + expected label, or 'ok'), name]
      ['Password: Tr0ub4dor&3', 'Password', 'Credentials', ['wrong', 'No label'], 'a key name that is also a label name ("Password") is checked'],
      ['Ship to Address: 12 MG Road', 'Address', 'Person Name', ['wrong', 'No label'], 'the word "Address" labeled in the document is checked, not taken for a label chip'],
      ['Password: Tr0ub4dor&3', 'Password: Tr0ub4dor&3', 'Credentials', ['wrong', 'Credentials: Tr0ub4dor&3'], 'key + value labeled -> only the value'],
      ['Authorization: Bearer abc123XYZ789tokenValue456', 'Bearer abc123XYZ789tokenValue456', 'Credentials', ['ok'], '"Bearer" + token is accepted (the token is labeled)'],
      ['const key = process.env.API_KEY;', 'process.env.API_KEY', 'Credentials', ['wrong', 'No label'], 'code reference labeled Credentials is a mistake'],
      ['"id": "26527fe0-1b3c-4d5e-8f9a-0b1c2d3e4f5a"', '26527fe0-1b3c-4d5e-8f9a-0b1c2d3e4f5a', 'Credentials', ['wrong', 'No label'], 'a plain object id is not a credential'],
      ['invocation_id: c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a', 'c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a', 'Credentials', ['ok'], 'an invocation id is a credential'],
      ['Order ID: ORD-2024-778812', 'ORD-2024-778812', 'Credentials', ['wrong', 'No label'], 'an order id is not a credential'],
      ['Room 4821 is free', '4821', 'Credentials', ['wrong', 'No label'], 'a bare 4-digit number is not a credential'],
      ['PIN: 4821', '4821', 'Credentials', ['ok'], 'a 4-digit PIN is a credential'],
      ['PIN: 411001', '411001', 'Credentials', ['wrong', 'No label'], 'six digits after PIN is a postal PIN code, not a credential'],
      ['OTP code 482913 expires', '482913', 'Credentials', ['ok'], 'an OTP in a sentence is a credential'],
    ];
    for (const [line, word, label, [want, exp], name] of CR) {
      const p = await page([line], [line]);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = want === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'Credentials review: ' + name, st);
      p.close();
    }
  }

  // (v11.7.2) Address, second review: the whole address, without its key; never a part of a changed address or code
  {
    const AD = [
      // [left line, right line, labeled text, label, expected ('ok' or the expected label), name]
      ['Ship to: 12, MG Road, Pune 411001', null, 'Ship to: 12, MG Road, Pune 411001', 'Address', 'Address: 12, MG Road, Pune 411001', 'the key in front is not part of the address'],
      ['Ship to 12, MG Road, Pune 411001', null, 'MG Road', 'Address', 'Address: 12, MG Road, Pune 411001', 'a part of a full address -> label the whole address'],
      ['Plot 9, Sector 127, Noida 201301', 'Plot 4, Sector 127, Noida 201301', 'Sector 127, Noida 201301', 'Address', 'No label', 'the unchanged part of a changed address gets no label'],
      ['12, MG Road, Pune 411001', '12, MG Road, Pune 422002', '12, MG Road', 'Address', 'No label', 'an address whose PIN changed gets no label'],
      ['const street = "MG Road";', null, 'MG Road', 'Address', 'No label', 'a street name in code is not an address'],
      ['Bureau: 12 Rue de Rivoli, 75001 Paris', null, '12 Rue de Rivoli, 75001 Paris', 'Address', 'ok', 'a French address is an address'],
      ['Office: 1-1-2 Oshiage, Sumida-ku, Tokyo 131-0045', null, '1-1-2 Oshiage, Sumida-ku, Tokyo 131-0045', 'Address', 'ok', 'a Japanese address is an address'],
      ['Near City Mall', null, 'Near City Mall', 'Address', 'No label', 'a landmark alone is not an address'],
      ['Bengaluru PIN 560001', null, 'Bengaluru PIN 560001', 'Address', 'No label', 'a city + PIN without a street is not an address'],
    ];
    for (const [l, r, word, label, exp, name] of AD) {
      const p = await page([l], [r || l]);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = exp === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'Address review: ' + name, st);
      p.close();
    }
  }

  // (v11.7.3) Email Address, second review: exactly the e-mail, never a part of a handle or a connection URL
  {
    const EMC = [
      // [left line, right line, labeled text, label, expected ('ok' or the expected label), name]
      ['<a href="mailto:priya@acme-demo.io">Write</a>', null, 'mailto:priya@acme-demo.io', 'Email Address', 'Email Address: priya@acme-demo.io', 'mailto: is not part of the e-mail'],
      ['From: Rahul <rahul@infosys.com>', null, '<rahul@infosys.com>', 'Email Address', 'Email Address: rahul@infosys.com', 'the < > are not part of the e-mail'],
      ['Mail rahul.sharma@infosys.com', null, 'rahul.sharma', 'Email Address', 'Email Address: rahul.sharma@infosys.com', 'only the name part labeled -> the whole e-mail'],
      ['Find me @priya@mastodon.social', null, 'priya@mastodon.social', 'Email Address', 'Person Username: @priya@mastodon.social', 'a part of a fediverse handle -> the whole handle'],
      ['DATABASE_URL=postgres://admin:S3cret99@db.acme-demo.io/app', null, 'S3cret99@db.acme-demo.io', 'Email Address', 'Credentials: S3cret99', 'a piece of a connection URL is not an e-mail'],
      ['Mail rahul.sharma@infosys.com', null, 'rahul.sharma', 'Person Name', 'Email Address: rahul.sharma@infosys.com', 'a name inside an e-mail -> label the whole e-mail'],
      ['Mail rahul@infosys.com', null, 'infosys', 'Business Name', 'Email Address: rahul@infosys.com', 'a company inside an e-mail -> label the whole e-mail'],
      ['Mail josé@empresa.com.br', null, 'josé@empresa.com.br', 'Email Address', 'ok', 'an e-mail with an accent is an e-mail'],
      ['Mail name@company.com', null, 'name@company.com', 'Email Address', 'No label', 'a template address is not personal data'],
      ['Mail support', 'Mail rahul@infosys.com', 'rahul@infosys.com', 'Overscrubbed', 'ok', 'a word replaced by an e-mail is Overscrubbed'],
    ];
    for (const [l, r, word, label, exp, name] of EMC) {
      const p = await page([l], [r || l]);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = exp === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'Email review: ' + name, st);
      p.close();
    }
  }

  // (v11.7.4) Person Username, second review: the correction names the username; code, bots and ids are not usernames
  {
    const UC = [
      // [left lines, right lines, labeled text, label, expected ('ok' or the expected label), name]
      [['Ping @rahul_92 on chat'], null, 'rahul_92', 'Person Username', 'Person Username: @rahul_92', 'a handle without its @ -> the handle with @'],
      [['Assigned to @rahul_92.'], null, '@rahul_92.', 'Person Username', 'Person Username: @rahul_92', 'a handle with the full stop -> without it'],
      [['Username: rahul_92'], null, 'Username: rahul_92', 'Person Username', 'Person Username: rahul_92', 'key + username -> only the username'],
      [['SELECT @UserId FROM users'], null, '@UserId', 'Person Username', 'No label', 'a SQL variable is not a username'],
      [['=SUM(@Table1)'], null, '@Table1', 'Person Username', 'No label', 'a spreadsheet reference is not a username'],
      [['@dependabot rebase'], null, '@dependabot', 'Person Username', 'No label', 'a bot is not a person'],
      [['<@U024BE7LH> said hi'], null, '@U024BE7LH', 'Person Username', 'No label', 'a user id is not a username'],
      [['name,username', 'Rahul,rahul_92'], null, 'rahul_92', 'Person Username', 'ok', 'a value in a Username column is a username'],
      [['Saved to /home/rahul/projects/app'], null, 'rahul', 'Person Username', 'ok', 'a username in a home folder path'],
      [['Ping team'], ['Ping @rahul_92'], '@rahul_92', 'Overscrubbed', 'ok', 'a word replaced by a handle is Overscrubbed'],
    ];
    for (const [l, r, word, label, exp, name] of UC) {
      const p = await page(l, r || l);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = exp === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'Username review: ' + name, st);
      p.close();
    }
  }

  // (v11.7.5) URL/Link, second review: exactly the link; placeholders, IP hosts and words inside a link
  {
    const LU = 'https://portal.acme-demo.io/users/1042/profile';
    const UL = [
      // [left lines, right lines, labeled text, label, expected ('ok' or the expected label), name]
      [['See ' + LU + '.'], null, LU + '.', 'URL/Link', 'URL/Link: ' + LU, 'the full stop after a link is not part of it'],
      [['(see ' + LU + ')'], null, LU + ')', 'URL/Link', 'URL/Link: ' + LU, 'the closing bracket is not part of the link'],
      [['See ' + LU + ' now'], null, 'portal.acme-demo.io', 'URL/Link', 'URL/Link: ' + LU, 'a part of a link -> the whole link'],
      [['[profile](' + LU + ')'], null, '[profile](' + LU + ')', 'URL/Link', 'URL/Link: ' + LU, 'a whole Markdown link -> only the URL'],
      [['https://your-domain.com/callback'], null, 'https://your-domain.com/callback', 'URL/Link', 'No label', 'a template link is not labeled'],
      [['https://example.com/path'], null, 'https://example.com/path', 'URL/Link', 'No label', 'an example link is not labeled'],
      [['https://10.0.0.5/admin'], null, 'https://10.0.0.5/admin', 'URL/Link', 'IP Address: 10.0.0.5', 'a link to an IP address -> the IP address'],
      [['https://10.0.0.5/admin'], null, '10.0.0.5', 'IP Address', 'ok', 'the IP address of such a link is an IP Address'],
      [['See https://github.com/acme/app'], null, 'github', 'Business Name', 'URL/Link: https://github.com/acme/app', 'a company name inside a link -> the link'],
      [['See https://www.linkedin.com/in/rahul-sharma-92'], null, 'rahul-sharma', 'Person Name', 'URL/Link: https://www.linkedin.com/in/rahul-sharma-92', 'a name inside a link -> the link'],
      [['HTTPS://PORTAL.ACME-DEMO.IO/USERS'], null, 'HTTPS://PORTAL.ACME-DEMO.IO/USERS', 'URL/Link', 'ok', 'an upper-case link is a link'],
      [['See here'], ['See ' + LU], LU, 'Overscrubbed', 'ok', 'a word replaced by a link is Overscrubbed'],
    ];
    for (const [l, r, word, label, exp, name] of UL) {
      const p = await page(l, r || l);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = exp === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'URL review: ' + name, st);
      p.close();
    }
  }

  // (v11.7.6) Account Number, second review: the correction names the number; ids, amounts and times are not accounts
  {
    const AC = [
      [['Account Number: 50100234567891'], null, 'Account Number: 50100234567891', 'Account Number', 'Account Number: 50100234567891', 'key + number -> only the number'],
      [['Account: 5010 0234 5678 91'], null, '5010 0234', 'Account Number', 'Account Number: 5010 0234 5678 91', 'a part of a spaced number -> the whole number'],
      [['IBAN: GB29 NWBK 6016 1331 9268 19'], null, 'GB29 NWBK', 'Account Number', 'Account Number: GB29 NWBK 6016 1331 9268 19', 'a part of an IBAN -> the whole IBAN'],
      [['Order No: 50100234567891'], null, '50100234567891', 'Account Number', 'No label', 'an order number is not an account'],
      [['Amount: 50100234567891'], null, '50100234567891', 'Account Number', 'No label', 'an amount is not an account'],
      [['created_at: 1697800000000'], null, '1697800000000', 'Account Number', 'No label', 'a timestamp is not an account'],
      [['Customer ID: 50100234567'], null, '50100234567', 'Account Number', 'No label', 'a customer id is not an account'],
      [['Account Number: 50100234567891'], null, '50100234567891', 'Account Number', 'ok', 'an account number is an Account Number'],
      [['Account: savings'], ['Account: 50100234567891'], '50100234567891', 'Overscrubbed', 'ok', 'a word replaced by an account number is Overscrubbed'],
    ];
    for (const [l, r, word, label, exp, name] of AC) {
      const p = await page(l, r || l);
      const m = await p.annotate(word, label);
      const st = p.state(m);
      const ok = exp === 'ok' ? st.mark === 'ok' : (st.mark === 'wrong' && st.expected === exp);
      check(ok, 'Account review: ' + name, st);
      p.close();
    }
  }

  // (v11.4.8) a whole connection URL labeled Credentials: only the password should be
  {
    const line = ['DATABASE_URL=postgres://admin:S3cretPass@db.acme-demo.io:5432/prod'];
    const p = await page(line, line);
    const m = await p.annotate('postgres://admin:S3cretPass@db.acme-demo.io:5432/prod', 'Credentials');
    const st = p.state(m);
    check(st.mark === 'wrong' && st.expected === 'Credentials: S3cretPass', 'whole connection URL labeled -> mistake, only the password', st);
    p.close();
  }

  // (v11.4.1) Suggestions follow the label chips on the page. The old dashboard (13 chips) gets the old labels.
  {
    const OLD = Object.assign({}, PAL);
    OLD['Contact Number'] = OLD['Indian Mobile Number'];
    for (const k of ['Indian Mobile Number', 'International Phone Number', 'Postal Code']) delete OLD[k];
    const NEW = Object.assign({}, PAL, { 'Contact Number': [250, 140, 22] });
    const tags = (p) => Array.from(p.Rp.querySelectorAll('span.pt-tag')).map(t => [t.textContent, t.getAttribute('data-label')]);
    const doc = ['Call 9876543210 today', 'Office: 080-2345 6789', 'Pincode: 560087'];
    {
      const p = await page(doc, doc, OLD);
      const t = tags(p);
      check(t.some(([x, l]) => x === '9876543210' && l === 'Contact Number') && t.some(([x, l]) => x === '080-2345 6789' && l === 'Contact Number'),
        'old chips: phones are suggested as Contact Number', t);
      check(!t.some(([x]) => x === '560087'), 'old chips: a postal code is not suggested', t);
      const m = await p.annotate('9876543210', 'Contact Number', true);
      check(p.state(m).mark === 'ok' && !/Mistake/.test(p.status()), 'old chips: a phone labeled Contact Number is correct', { st: p.state(m), status: p.status() });
      p.close();
    }
    {
      const p = await page(doc, doc, OLD);
      const m = await p.annotate('560087', 'Address');
      check(p.state(m).mark === 'wrong' && p.state(m).expected === 'No label', 'old chips: a PIN labeled Address -> mistake, no label (Postal Code is not on the page)', p.state(m));
      p.close();
    }
    {
      const p = await page(doc, doc, NEW);
      const t = tags(p);
      check(t.some(([x, l]) => x === '9876543210' && l === 'Indian Mobile Number') && t.some(([x, l]) => x === '080-2345 6789' && l === 'International Phone Number') &&
        t.some(([x, l]) => x === '560087' && l === 'Postal Code'), 'new chips: Indian Mobile Number, International Phone Number and Postal Code are suggested', t);
      p.close();
    }
  }

  console.log(`\n${pass}/${pass + fail} label-check checks passed`);
  process.exit(fail ? 1 : 0);
})();
