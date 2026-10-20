// Account Number, second review on the 13-chip page (v11.7.6). Indian and US data. Every value is synthetic.
// Run: node tests/account.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const A = 'Account Number', OVER = 'Overscrubbed', C = 'Credentials';
const cases = [];
const yes = (doc, text, lab = A, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = A) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- account numbers ----------------
yes('Account Number: 50100234567891', '50100234567891');
yes('Account No 50100234567891', '50100234567891');
yes('A/c No.: 012345678901', '012345678901');
yes('Account #: 000123456789', '000123456789');
yes('Account: 5010 0234 5678 91', '5010 0234 5678 91');
yes('Bank account 1234567890123', '1234567890123');
yes('Please credit to account 50100234567891 today', '50100234567891');
yes('{"account_number": "50100234567891"}', '50100234567891');
yes('name,account_number,ifsc\nRahul,50100234567891,HDFC0001234', '50100234567891');
yes('Checking account: 000123456789', '000123456789');
yes('IBAN GB29NWBK60161331926819', 'GB29NWBK60161331926819');

// ---------------- not account numbers ----------------
notAs('Mobile: 9845012345', '9845012345');
no('Order No: 50100234567891', '50100234567891');
no('Amount: 50100234567891', '50100234567891');
no('created_at: 1697800000000', '1697800000000');
no('Customer ID: 50100234567', '50100234567');            // user rule C
no('Account: XXXX XXXX 5678', 'XXXX XXXX 5678');
no('Sort code 20-00-00', '20-00-00');                     // user rule A: Indian and US data only
yes('IFSC: HDFC0001234', 'HDFC0001234', C);
yes('Routing: 021000021', '021000021', C);

// ---------------- changed ----------------
no('Account Number: 50100234567891', '50100299999999', 'Account Number: 50100299999999');
yes('Account Number: 50100234567891', 'hidden', OVER, 'Account Number: hidden');
yes('Account: savings', '50100234567891', OVER, 'Account: 50100234567891');     // user rule D
yes('Transfer to the joint account', '50100234567891', OVER, 'Transfer to the 50100234567891 account');

// ---------------- run ----------------
let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text);
  let ok, got = hit ? hit.label : '(none)';
  if (c.kind === 'yes') ok = !!hit && hit.label === c.lab;
  else if (c.kind === 'no') ok = !hit;
  else ok = !hit || hit.label !== c.lab;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)} -> got ${got}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 160)}]`); }
}
console.log(`\n${pass}/${pass + fail} account checks passed`);
process.exit(fail ? 1 : 0);
