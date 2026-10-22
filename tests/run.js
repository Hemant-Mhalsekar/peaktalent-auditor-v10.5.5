// Regression suite: node tests/run.js  (exit code 1 on any failure)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./harness');
const F = require('./fixtures');

const eng = loadEngine();
const E = eng.api;
if (!E) { console.error('Engine test hook (window.__PT__) not found'); process.exit(2); }

const run = (l, r) => E.extractDynamicTargets({ innerText: l, textContent: l }, { innerText: r, textContent: r });
const has = (ts, text, label) => ts.some(t => t.text === text && (!label || t.label === label));
const labelsOf = (ts, text) => ts.filter(t => t.text === text).map(t => t.label);

const results = [];
function test(suite, name, fn) {
  try { fn(); results.push({ suite, name, ok: true }); }
  catch (e) { results.push({ suite, name, ok: false, msg: e.message }); }
}
const yes = (ts, text, label) => assert.ok(has(ts, text, label), `expected "${text}" as ${label}; got ${JSON.stringify(labelsOf(ts, text))}`);
const no = (ts, text, label) => assert.ok(!has(ts, text, label), `"${text}" must NOT be ${label || 'labeled'}`);

// ---------- Suite: 15 credential categories (value only) ----------
{
  const ts = run(F.creds, F.creds);
  const vals = ['HDFC0001234', 'ABCDE1234F', 'sk-proj-1234567890abcdef12345678', 'superSecretPassword123', '1234 5678 9012', '987654321098',
    'DL14 20110012345', 'WBF1234567', '4532 1234 5678 9012', '789', '11/28', 'payuser@okhdfcbank', '0x3a7b1c4e9d0f2a5b8c6e1d4f7a0b3c5e',
    'c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a', '0123456789abcdef0123456789abcdef01234567', 'vpc-0a1b2c3d4e5f67890', 'card_1J4iOz2eZvKYlo2CSm3W4w8G',
    '111122223333', 'ANPAEXAMPLEID2345678'];
  for (const v of vals) test('Credentials', `value ${v}`, () => yes(ts, v, 'Credentials'));
  for (const k of ['_account_id', 'account_id', 'PolicyId', 'password', 'cvv', 'expiry']) test('Credentials', `key ${k} not labeled`, () => no(ts, k));
}

// ---------- Suite: AWS IAM JSONL (partial overscrub + value-only) ----------
{
  const ts = run(F.p158.left, F.p158.right);
  test('AWS IAM', 'hydragenzen isolated', () => { yes(ts, 'hydragenzen', 'Overscrubbed'); no(ts, 'hydragenzen-10-17'); });
  test('AWS IAM', 'terovawren isolated', () => { yes(ts, 'terovawren', 'Overscrubbed'); no(ts, 'ap-terovawren-2'); });
  test('AWS IAM', 'beaexbright isolated', () => { yes(ts, 'beaexbright', 'Overscrubbed'); no(ts, 'job-beaexbright'); });
  test('AWS IAM', 'magonecl overscrubbed', () => yes(ts, 'magonecl', 'Overscrubbed'));
  test('AWS IAM', 'account value labeled', () => yes(ts, '111122223333', 'Credentials'));
  test('AWS IAM', 'IAM id labeled', () => yes(ts, 'ANPAEXAMPLEID2345678', 'Credentials'));
  test('AWS IAM', 'keys not labeled', () => { no(ts, '_account_id'); no(ts, 'PolicyId'); });
}

// ---------- Suite: IDs, logins, node ids ----------
{
  const ts = run(F.git.left, F.git.right);
  test('System IDs', 'changed login not labeled', () => assert.ok(!ts.some(t => t.text.includes('cassian'))));
  test('System IDs', 'node_id not labeled', () => assert.ok(!ts.some(t => t.text.includes('SFX'))));
  test('System IDs', 'numeric id not labeled', () => no(ts, '922222222'));
}

test('Credentials', 'bank UTR behind its key', () => { const d = 'UTR No: CB0111264256 received'; yes(run(d, d), 'CB0111264256', 'Credentials'); });
test('Clean docs', 'identical cost table -> 0 targets', () => assert.strictEqual(run(F.costIdentical, F.costIdentical).length, 0));

// ---------- Suite: Overscrubbed (form) ----------
{
  const ts = run(F.hbar.left, F.hbar.right);
  for (const w of ['POLCORENOV', 'COBTECHFLUX', 'Nexixion', 'verorydelt', 'brightifyhel', 'Vexynenim', 'Fluxtechsol', 'Beatechaur', 'coborywren'])
    test('Overscrubbed form', `${w}`, () => yes(ts, w, 'Overscrubbed'));
  test('Overscrubbed form', 'placeholder "C Corporation" is not a Business Name', () => no(ts, 'C Corporation'));
}

// ---------- Suite: Business names ----------
for (const verb of ['working at', 'resigning from', 'experience at', 'hired by']) {
  const f = F.letter(verb.startsWith('experience') ? 'at' : verb);
  const fx = { left: f.left.replace('experience at', 'experience at'), right: f.right };
  const ts = run(fx.left, fx.right);
  test('Business', `scrubbed company after "${verb}" not Overscrubbed`, () => no(ts, 'Solvanta', 'Overscrubbed'));
}
test('Business', '"join Monday" is not business context', () => assert.strictEqual(E.isTokenInBusinessContext('Monday', "Please join Monday's call"), false));
test('Business', '"left Bengaluru" is not business context', () => assert.strictEqual(E.isTokenInBusinessContext('Bengaluru', 'I left Bengaluru last week'), false));
test('Business', '"resigning from X" is business context', () => assert.strictEqual(E.isTokenInBusinessContext('Vansun', 'I am resigning from Vansun'), true));
test('Business', '"hired by X" is business context', () => assert.strictEqual(E.isTokenInBusinessContext('Vansun', 'I was hired by Vansun'), true));
{
  const ts = run(F.copyright.left, F.copyright.right);
  test('Business', 'scrubbed copyright holder not Overscrubbed', () => no(ts, 'Voltumcas'));
  test('Business', 'voltgenhydra overscrubbed', () => yes(ts, 'voltgenhydra', 'Overscrubbed'));
}
{
  const ts = run(F.vendors.left, F.vendors.right);
  test('Business', 'identical vendor FIGMA labeled', () => yes(ts, 'FIGMA', 'Business Name'));
  test('Business', 'identical vendor SLACK labeled', () => yes(ts, 'SLACK', 'Business Name'));
  for (const w of ['BEAYNECAS', 'Auravecryo', 'HELIXZEPH']) test('Business', `scrubbed vendor ${w} not labeled`, () => assert.ok(!ts.some(t => t.text.includes(w))));
}
test('Business', 'word inside an identical URL is not a Business Name', () => {
  const ts = run(F.urlBiz.left, F.urlBiz.right); no(ts, 'github', 'Business Name');
});

// ---------- Suite: Context guards ----------
test('Context', '"spin" does not disable overscrub detection', () => yes(run(F.spin.left, F.spin.right), 'zorvanex', 'Overscrubbed'));
{
  const ts = run(F.settings.left, F.settings.right);
  test('Context', 'renamed config key API_KEY -> overscrubbed', () => yes(ts, 'BRYENA_STELWICK', 'Overscrubbed'));
  test('Context', 'scrubbed password value not labeled', () => no(ts, 'gjcefi358@'));
  test('Context', 'identical https URL labeled', () => yes(ts, 'https://docs.djangoproject.com/en/3.1/ref/settings/', 'URL/Link'));
}
{
  const ts = run(F.hexo.left, F.hexo.right);
  test('Context', 'github inside URL not Business Name', () => no(ts, 'github', 'Business Name'));
  test('Context', 'helgennex overscrubbed', () => yes(ts, 'helgennex', 'Overscrubbed'));
  test('Context', 'scrubbed self-introduced name not labeled', () => no(ts, 'Haralnyxys'));
}

// ---------- Suite: Identity invariance ----------
test('Identity', 'scrubbed DOB not labeled', () => assert.strictEqual(run(F.dobScrubbed.left, F.dobScrubbed.right).filter(t => t.label === 'Date').length, 0));
test('Identity', 'identical DOB labeled Date', () => yes(run(F.dobSame.left, F.dobSame.right), '12/04/1990', 'Date'));
test('Identity', 'scrubbed @handle not labeled', () => assert.strictEqual(run(F.handleScrubbed.left, F.handleScrubbed.right).filter(t => t.label === 'Person Username').length, 0));
test('Identity', 'identical @handle labeled', () => yes(run(F.handleSame.left, F.handleSame.right), '@kiran_demo92', 'Person Username'));
{
  const ts = run(F.jira.left, F.jira.right);
  for (const w of ['Halinvalivo', 'Nyxenorvance', 'Rysavxanith Caverpelira', 'Rysavxanith', 'Glenormara Branevwispis', 'Glenormara'])
    test('Identity', `scrubbed person ${w} not labeled`, () => no(ts, w));
  test('Identity', 'fluxixpol (offline) overscrubbed', () => yes(ts, 'fluxixpol', 'Overscrubbed'));
}
{
  const ts = run(F.authors.left, F.authors.right);
  test('Identity', 'scrubbed emails not labeled', () => assert.ok(!ts.some(t => /jadexlum/.test(t.text))));
}
{
  const ts = run(F.multiword.left, F.multiword.right);
  test('Overscrubbed form', 'multi-word: quenecalrin', () => yes(ts, 'quenecalrin', 'Overscrubbed'));
  test('Overscrubbed form', 'multi-word: feraldalyn', () => yes(ts, 'feraldalyn', 'Overscrubbed'));
}
{
  const ts = run(F.greeting.left, F.greeting.right);
  test('Person', 'greeting word not part of name', () => { no(ts, 'Hi Rahul Sharma'); yes(ts, 'Rahul Sharma', 'Person Name'); });
  test('Person', 'identical phone labeled', () => yes(ts, '9876543210', 'Indian Mobile Number'));
}


// ---------- Suite: Mixed real-world shapes ----------
{
  const ts = run(F.support.left, F.support.right);
  test('Mixed', 'Fluxenorb (Solution) overscrubbed', () => yes(ts, 'Fluxenorb', 'Overscrubbed'));
  test('Mixed', 'nexpathkry (timeline) overscrubbed', () => yes(ts, 'nexpathkry', 'Overscrubbed'));
  test('Mixed', 'velavesyn (product) overscrubbed', () => yes(ts, 'velavesyn', 'Overscrubbed'));
  test('Mixed', 'Orberaced (lone word "Analytics") overscrubbed', () => yes(ts, 'Orberaced', 'Overscrubbed'));
  for (const w of ['Kesaraviel', 'Glenaszaneaglenormara', 'Branevwispis']) test('Mixed', `scrubbed agent name ${w} not labeled`, () => assert.ok(!ts.some(t => t.text.includes(w))));
  test('Mixed', 'changed phone not labeled', () => assert.ok(!ts.some(t => t.text.includes('9800000'))));
}
{
  const ts = run(F.agreement.left, F.agreement.right);
  test('Mixed', 'identical company alias labeled Business Name', () => yes(ts, 'Brightpath', 'Business Name'));
  test('Mixed', 'scrubbed company name not Overscrubbed', () => no(ts, 'Olivantis', 'Overscrubbed'));
  test('Mixed', 'scrubbed address parts not labeled', () => assert.ok(!ts.some(t => /Yewstone/.test(t.text))));
}
test('Mixed', 'generic verb replaced (Provide -> Galearwren) is Overscrubbed', () => yes(run('Provide a brief overview of the project.', 'Galearwren a brief overview of the project.'), 'Galearwren', 'Overscrubbed'));
test('Mixed', 'prose: "applicant" does not make Beagenhydra a name', () => yes(run(F.prose.left, F.prose.right), 'Beagenhydra', 'Overscrubbed'));
{
  const ts = run(F.medical.left, F.medical.right);
  test('Mixed', 'bank is not a Business Name', () => { no(ts, 'AXIS BANK'); no(ts, 'Bank Name'); });
  test('Mixed', 'valid plate labeled', () => yes(ts, 'MH 12 AB 1234', 'Vehicle Number Plate'));
  test('Mixed', 'invalid state plate not labeled', () => no(ts, 'UT 28 EZ 6570'));
  test('Mixed', 'single city not Address', () => no(ts, 'Bengaluru', 'Address'));
  test('Mixed', 'complete address labeled', () => yes(ts, '12, MG Road, Pune 411001', 'Address'));
  test('Mixed', 'address label excludes the table header cell', () => assert.ok(!ts.some(t => t.label === 'Address' && t.text.includes('|'))));
  test('Mixed', 'no duplicate targets', () => assert.strictEqual(new Set(ts.map(t => t.text)).size, ts.length));
}


// ---------- Suite: Real tasks (slides, match doc, spreadsheet) ----------
{
  const ts = run(F.slides.left, F.slides.right);
  test('Real tasks', 'scrubbed name heading (Tarvik -> Arcorahale) not labeled', () => assert.ok(!ts.some(t => /Arcorahale/.test(t.text))));
  test('Real tasks', 'scrubbed name heading (Lumi S -> Galonbryea S) not labeled', () => assert.ok(!ts.some(t => /Galonbryea/.test(t.text))));
  test('Real tasks', 'unchanged name heading (Ezequiel) labeled Person Name', () => yes(ts, 'Ezequiel', 'Person Name'));
}
{
  const ts = run(F.matchDoc.left, F.matchDoc.right);
  test('Real tasks', 'identical password after "Password -" is Credentials', () => yes(ts, 'deliverydesk2@admin123!', 'Credentials'));
  test('Real tasks', 'changed username email not labeled', () => assert.ok(!ts.some(t => /hesonverane|orbynelyr/.test(t.text))));
  test('Real tasks', 'changed dashboard URL not labeled', () => assert.ok(!ts.some(t => /nexartor/.test(t.text))));
  test('Real tasks', 'Kickoff -> Voltorygri overscrubbed', () => yes(ts, 'Voltorygri', 'Overscrubbed'));
  test('Real tasks', 'Chance R -> Yelanando N overscrubbed', () => assert.ok(ts.some(t => /Yelanando/.test(t.text) && t.label === 'Overscrubbed')));
  test('Real tasks', 'nothing labeled Person Name', () => assert.ok(!ts.some(t => t.label === 'Person Name'), JSON.stringify(ts.filter(t => t.label === 'Person Name'))));
}
{
  const ts = run(F.streams.left, F.streams.right);
  test('Real tasks', 'month "June" is not a Person Name', () => no(ts, 'June'));
  test('Real tasks', 'match titles ("X vs Y") are not Person Names', () => assert.ok(!ts.some(t => / vs /.test(t.text)), JSON.stringify(ts.filter(t => / vs /.test(t.text)))));
  test('Real tasks', 'no Person Name anywhere in the sports sheet', () => assert.ok(!ts.some(t => t.label === 'Person Name'), JSON.stringify(ts.filter(t => t.label === 'Person Name'))));
  test('Real tasks', 'Verosnim overscrubbed', () => yes(ts, 'Verosnim', 'Overscrubbed'));
  // (v11.9.0) user rule: a replaced place (a country, here a team) is correct redaction
  for (const w of ['Soloraopt', 'Beaiakry']) test('Real tasks', `${w} (a replaced country) not labeled`, () => no(ts, w));
}

// ---------- Suite: Credentials identical vs changed (all types) ----------
for (const sep of ['-', ':']) {
  const m = F.credMatrix(sep);
  const ts = run(m.left, m.right);
  for (const [k, same, other] of F.credRows) {
    test('Credential rule', `${k} "${sep}" identical -> Credentials`, () => yes(ts, same, 'Credentials'));
    test('Credential rule', `${k} "${sep}" changed -> no label`, () => assert.ok(!ts.some(t => t.text.includes(other) || other.includes(t.text) && t.text.length > 3), JSON.stringify(ts.filter(t => other.includes(t.text)))));
  }
}


// ---------- Suite: Credentials in source code (no false positives) ----------
{
  const CM = require('./fixture_codemirror');
  const ts = run(CM.left, CM.right);
  test('Code', '"token: function(stream, state)" is not a credential', () => assert.ok(!ts.some(t => t.label === 'Credentials'), JSON.stringify(ts)));
  test('Code', 'changed licence URL gets no label', () => assert.ok(!ts.some(t => /beaisdelt/.test(t.text))));
  const code = [
    'const token = getToken(req);',
    '  password: hashPassword(input),',
    '  apiKey: config.apiKey,',
    '"password": "${DB_PASSWORD}",',
    'PASSWORD = os.environ["DB_PASSWORD"]',
    '  token: tokenFromHeader,',
    'secret_key = settings.SECRET_KEY',
    'if (state.token === null) return;',
  ].join('\n');
  const tc = run(code, code);
  test('Code', 'code references / function calls / env placeholders are never Credentials', () => assert.ok(!tc.some(t => t.label === 'Credentials'), JSON.stringify(tc)));
  const real = ['"password": "Tr0ub4dor&3",', 'api_key = "sk-live-9fA2kQ7xZ1pL3mN8"', 'TOKEN=ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('\n');
  const tr = run(real, real);
  test('Code', 'quoted password literal identical -> Credentials', () => yes(tr, 'Tr0ub4dor&3', 'Credentials'));
  test('Code', 'API key literal identical -> Credentials', () => yes(tr, 'sk-live-9fA2kQ7xZ1pL3mN8', 'Credentials'));
  { const d = 'Password - P@ss(123)!'; test('Code', 'real password with brackets still -> Credentials', () => yes(run(d, d), 'P@ss(123)!', 'Credentials')); }
  test('Code', 'GitHub token identical -> Credentials', () => yes(tr, 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'Credentials'));
}


// ---------- Suite: PDF statement rows ----------
{
  const ts = run(F.statement.left, F.statement.right);
  test('Statement', 'Transfer -> Galeonorb inside a table row is Overscrubbed (only the changed part)', () => { yes(ts, 'Galeonorb', 'Overscrubbed'); no(ts, 'Galeonorb-Ins/VDRs'); });
  const L = '| Total Transfer-Ins/VDRs for the year [ 2025 ] | 0 | 0 |', R = '| Total Galeonorb-Ins/VDRs for the year [ 2025 ] | 0 | 0 |';
  test('Statement', 'same row as first table cell (vendor-table shape) is still Overscrubbed', () => yes(run(L, R), 'Galeonorb', 'Overscrubbed'));
}


// ---------- Suite: Attendee list (names scrubbed, some parts kept) ----------
{
  const ts = run(F.attendees.left, F.attendees.right);
  test('Attendees', 'scrubbed names in a list are never Overscrubbed', () => assert.ok(!ts.some(t => t.label === 'Overscrubbed'), JSON.stringify(ts.filter(t => t.label === 'Overscrubbed'))));
  for (const w of ['Kalvari', 'Kiran', 'Velkar', 'Desmon', 'Sathe']) test('Attendees', `kept name part ${w} -> Person Name`, () => yes(ts, w, 'Person Name'));
  test('Attendees', 'markup <u> is never part of a label', () => assert.ok(!ts.some(t => /<\/?u>/.test(t.text))));
}


{
  const ts = run(F.attendees2.left, F.attendees2.right);
  test('Attendees', 'list with ~~strike~~ markup: no Overscrubbed', () => assert.ok(!ts.some(t => t.label === 'Overscrubbed'), JSON.stringify(ts.filter(t => t.label === 'Overscrubbed'))));
  test('Attendees', 'kept first name (Nirav) -> Person Name', () => yes(ts, 'Nirav', 'Person Name'));
  test('Attendees', 'kept surname (Mohkari) -> Person Name', () => yes(ts, 'Mohkari', 'Person Name'));
  test('Attendees', 'scrubbed team name in title gets no label', () => assert.ok(!ts.some(t => /Kalavdarwen/.test(t.text))));
}


{
  const ts = run(F.transcript.left, F.transcript.right);
  test('Attendees', 'transcript: scrubbed speaker names (**Name:**) get no label', () => assert.ok(!ts.some(t => /Orvisravira|Karilvaris|Quilolrin|Serlodora|Kalavdarwen|Vergenast/.test(t.text)), JSON.stringify(ts)));
  test('Attendees', 'transcript: information -> helentjad is Overscrubbed', () => yes(ts, 'helentjad', 'Overscrubbed'));
}


// ---------- Suite: Addresses (scrubbed -> nothing, identical complete -> Address) ----------
{
  const ts = run(F.invoiceAddr.left, F.invoiceAddr.right);
  test('Address rule', 'scrubbed street (Plot no. 13 ... -> 937 Garnthwaite Road) gets no label', () => assert.ok(!ts.some(t => /Garnthwaite|Road/.test(t.text)), JSON.stringify(ts)));
  test('Address rule', 'identical fragment of a scrubbed address (Sector 127, Noida) is not Address', () => assert.ok(!ts.some(t => t.label === 'Address'), JSON.stringify(ts)));
  test('Address rule', 'scrubbed address gives no Overscrubbed at all', () => assert.ok(!ts.some(t => t.label === 'Overscrubbed' && /Sector|Noida|Pradesh|India/.test(t.text))));
  const s = run(F.sameAddr.left, F.sameAddr.right);
  test('Address rule', 'identical complete one-line address -> Address', () => yes(s, 'Plot no. 13, Near Shanti Mandir, Sector 127, Noida, Uttar Pradesh 201304', 'Address'));
  const M = 'Northwind Ltd\nPlot no. 13, Near Shanti Mandir,\nSector 127,  Noida,\n Uttar Pradesh 201304\nIndia\nThanks';
  const m = run(M, M);
  test('Address rule', 'identical complete multi-line address -> every line labeled Address', () => { for (const l of ['Plot no. 13, Near Shanti Mandir', 'Sector 127,  Noida', 'Uttar Pradesh 201304', 'India']) yes(m, l, 'Address'); });
}


{
  const ts = run(F.invoiceBill.left, F.invoiceBill.right);
  test('Address rule', 'scrubbed multi-line "Bill To" address gets no label (Fernthwaite Street, Zanworth Road, Cryoosvolt)', () => assert.ok(!ts.some(t => /Fernthwaite|Zanworth|Street|Road|Cryoosvolt|Garnthwaite/.test(t.text)), JSON.stringify(ts)));
  test('Address rule', 'changed GSTIN is not Overscrubbed', () => no(ts, '17GSPPN8790HUZX'));
  test('Address rule', 'scrubbed company name gets no label', () => assert.ok(!ts.some(t => /PINAVEZEN/.test(t.text))));
}


// ---------- Suite: Robustness (never crash, whatever the document contains) ----------
{
  const weird = ['', '\n', '((([[[', '\\$^*+?', '\u0000\u200b', 'é ü 中文 العربية 🎯', '<script>x</script>', '**~~__',
    'a'.repeat(20000), 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(3000), 'Password -', 'Plot no.'];
  let crashes = [];
  for (const a of weird) for (const b of weird) {
    try { run(a, b); } catch (e) { crashes.push(JSON.stringify(a).slice(0, 20) + ' / ' + JSON.stringify(b).slice(0, 20) + ': ' + e.message.slice(0, 80)); }
  }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const docs = [F.statement, F.attendees, F.attendees2, F.transcript, F.invoiceAddr, F.invoiceBill, F.review].filter(Boolean);
  for (let i = 0; i < 40; i++) {
    const d = docs[(rnd() * docs.length) | 0];
    const mutate = (s) => s.split(/(\s+)/).map(w => { const r = rnd(); return r < 0.08 ? weird[(rnd() * weird.length) | 0] : r < 0.15 ? w.split('').reverse().join('') : w; }).join('');
    try { const ts = run(mutate(d.left), mutate(d.right)); for (const t of ts) if (!t.text || !t.label) throw new Error('malformed target'); }
    catch (e) { crashes.push('mutation ' + i + ': ' + e.message.slice(0, 80)); }
  }
  test('Robustness', 'odd characters, huge tokens, base64 blobs and random edits never crash the audit', () => assert.deepStrictEqual(crashes, []));
}

// ---------- Suite: Format validators ----------
const fmt = [
  ['isDateFormat', '9876543210', false], ['isDateFormat', '1700000000', true], ['isDateFormat', '12/04/1990', true],
  ['isIpAddressFormat', '192.168.1.1', true], ['isIpAddressFormat', '2001:db8::1', true], ['isIpAddressFormat', 'fe80::1ff:fe23:4567:890a', true],
  ['isIpAddressFormat', '00:1A:2B:3C:4D:5E', false],
  ['isVehiclePlateFormat', 'MH 12 AB 1234', true], ['isVehiclePlateFormat', 'DL 3C AB 1234', true], ['isVehiclePlateFormat', 'OR 02 AB 1234', true],
  ['isVehiclePlateFormat', '22 BH 1234 AA', true], ['isVehiclePlateFormat', 'UT 28 EZ 6570', false], ['isVehiclePlateFormat', 'RV 05 KP 6908', false],
  ['isCredentialsFormat', '378282246310005', true], ['isCredentialsFormat', '4111111111111111', true], ['isCredentialsFormat', '4111111111111112', false],
  ['isCredentialsFormat', 'EMP-12345', false], ['isCredentialsFormat', 'HDFC0001234', true],
];
for (const [fn, v, exp] of fmt) test('Formats', `${fn}(${v}) === ${exp}`, () => assert.strictEqual(!!E[fn](v), exp));

// ---------- Suite: Privacy ----------
test('Privacy', 'no network requests while scanning', () => {
  run(F.vendors.left, F.vendors.right); run(F.letter('working at').left, F.letter('working at').right);
  assert.deepStrictEqual(eng.network, []);
});

// ---------- Suite: Runtime safety ----------
test('Runtime', 'startup cleanup only targets the tool\'s own spans', () => {
  assert.ok(eng.selectors.includes('span.pt-tag'));
  assert.ok(!eng.selectors.some(s => /\[class\*='pt-'\]|mark\[data-label\]/.test(s)), 'must not query [class*=pt-] or mark[data-label]');
});
test('Runtime', 're-running the script does not stack listeners', () => {
  const e2 = loadEngine();
  const before = e2.listeners.length;
  e2.runAgain(); e2.runAgain();
  assert.strictEqual(e2.listeners.length, before);
});
test('Runtime', 're-running does not stack history.pushState wrappers', () => {
  const e2 = loadEngine();
  const wrapped1 = e2.history.pushState;
  e2.runAgain();
  e2.win.__pt_cleanup();
  assert.strictEqual(e2.history.pushState, e2.origPush);
  assert.notStrictEqual(wrapped1, e2.origPush);
});
test('Runtime', 'version is exposed', () => assert.match(E.VERSION, /^\d+\.\d+\.\d+$/));

test('Privacy', 'engine source contains no network APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts'])
    assert.ok(!src.includes(api), `found ${api}`);
});

test('Runtime', 'engine source is pure ASCII (no garbled icons when a tool reads it as Latin-1)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const bad = [...src].findIndex(ch => ch.charCodeAt(0) > 127);
  assert.strictEqual(bad, -1, 'non-ASCII character at offset ' + bad);
});

// ---------- Suite: Real task (annual review form) ----------
{
  const ts = run(F.review.left, F.review.right);
  for (const w of ['Cryooryarc', 'cederacob', 'griixsyn', 'wrenixquan', 'ironenmer'])
    test('Review form', `${w} overscrubbed`, () => yes(ts, w, 'Overscrubbed'));
  test('Review form', 'scrubbed name in "Reviewer Name:" field not labeled', () => assert.ok(!ts.some(t => /Malivdelane/.test(t.text))));
  test('Review form', 'scrubbed name in "Name of the Reviewee:" field not labeled', () => assert.ok(!ts.some(t => /Vercorevel|Gleninwen/.test(t.text))));
  test('Review form', '"More" in a sentence is not a Person Name', () => no(ts, 'More'));
  test('Review form', 'words in a key-value table are not treated as a name column', () => no(ts, 'clients'));
}
test('Person', 'ambiguous given name still works next to a surname', () => yes(run('Owner: Rahul More', 'Owner: Rahul More'), 'Rahul More', 'Person Name'));

// ---------- Suite: Performance budget (the 10.4.1 engine took 45 s / 3 min / crashed on these) ----------
{
  const time = (fn) => { const t = Date.now(); fn(); return Date.now() - t; };
  const big = F.big(1500);   // ~140 KB, ~25,000 tokens, many changed lines
  test('Performance', '140 KB document analysed in under 6 s', () => {
    const ms = time(() => run(big.left, big.right));
    assert.ok(ms < 6000, ms + ' ms');
  });
  test('Performance', 're-audit of the same text is cached (under 50 ms)', () => {
    const ms = time(() => run(big.left, big.right));
    assert.ok(ms < 50, ms + ' ms');
  });
  const items = []; for (let i = 0; i < 6000; i++) items.push(`{"id":${i},"name":"item${i}","region":"ap-northeast-2","note":"quality check passed"}`);
  const L = '[' + items.join(',') + ']';
  const R = L.replace(/northeast/g, (m, o) => (o % 7 === 0 ? 'terovawren' : m));
  test('Performance', '500 KB single-line JSON analysed in under 8 s and still finds overscrubs', () => {
    let ts; const ms = time(() => { ts = run(L, R); });
    assert.ok(ms < 8000, ms + ' ms');
    yes(ts, 'terovawren', 'Overscrubbed');
  });
}

// ---------- Report ----------
const failed = results.filter(r => !r.ok);
const bySuite = {};
for (const r of results) { (bySuite[r.suite] ||= { pass: 0, fail: 0 }); bySuite[r.suite][r.ok ? 'pass' : 'fail']++; }
for (const [s, c] of Object.entries(bySuite)) console.log(`${c.fail ? '✗' : '✓'} ${s}: ${c.pass}/${c.pass + c.fail}`);
for (const f of failed) console.log(`   FAIL [${f.suite}] ${f.name}\n        ${f.msg}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
const out = { generated: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, suites: bySuite };
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 2));
process.exit(failed.length ? 1 : 0);
