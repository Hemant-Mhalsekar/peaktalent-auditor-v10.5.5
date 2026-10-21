// Date (date of birth only), second review on the 13-chip page (v11.7.8). Every value is synthetic. Run: node tests/dob.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const D = 'Date', OVER = 'Overscrubbed';
const cases = [];
const yes = (doc, text, lab = D, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });

// ---------------- dates of birth ----------------
yes('DOB: 05-11-1988', '05-11-1988');
yes('date_of_birth: 1988-11-05', '1988-11-05');
yes('Born on 5th November, 1988', '5th November, 1988');
yes('Birthday: November 5, 1988', 'November 5, 1988');
yes('DOB: 05-Nov-1988', '05-Nov-1988');
yes('DOB: 05/11/88', '05/11/88');                             // user rule A
yes('Child DOB: 05-11-2015', '05-11-2015');                   // user rule B
yes("Father's DOB: 12-04-1960", '12-04-1960');
yes('| Name | DOB |\n| Rahul | 05-11-1988 |', '05-11-1988');
// upper-case month names (passports, forms)
yes('Date of birth: 05 NOV 1988', '05 NOV 1988');
yes('DOB: 05-NOV-1988', '05-NOV-1988');
yes('Date of Birth / Date de naissance: 05 NOV 1988', '05 NOV 1988');
yes('BIRTHDAY: NOVEMBER 5, 1988', 'NOVEMBER 5, 1988');
// with a time: only the date (user rule D)
yes('dob: 1988-11-05T00:00:00Z', '1988-11-05');
yes('"birthDate": "1988-11-05T00:00:00.000Z"', '1988-11-05');
yes('DOB: 1988-11-05 00:00:00', '1988-11-05');
no('dob: 1988-11-05T00:00:00Z', '1988-11-05T00:00:00Z');

// ---------------- not dates of birth ----------------
no('Meeting on 12 March 2025', '12 March 2025');
no('Invoice Date: 12-01-2026', '12-01-2026');
no('created: 2024-03-01T10:00:00Z', '2024-03-01');
no('DOB: Sept 1996', 'Sept 1996');
no('Date of death: 05-11-2020', '05-11-2020');
no('Date of Joining: 05-11-2015', '05-11-2015');

// ---------------- changed ----------------
no('DOB: 05-11-1988', '12-04-1990', 'DOB: 12-04-1990');
yes('DOB: 05-11-1988', 'unknown', OVER, 'DOB: unknown');
yes('DOB: unknown', '05-11-1988', OVER, 'DOB: 05-11-1988');            // user rule C
yes('Date of Birth: not provided', '5th November, 1988', OVER, 'Date of Birth: 5th November, 1988');

// ---------------- run ----------------
let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text);
  let ok, got = hit ? hit.label : '(none)';
  if (c.kind === 'yes') ok = !!hit && hit.label === c.lab;
  else ok = !hit;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)} -> got ${got}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 160)}]`); }
}
console.log(`\n${pass}/${pass + fail} dob checks passed`);
process.exit(fail ? 1 : 0);
