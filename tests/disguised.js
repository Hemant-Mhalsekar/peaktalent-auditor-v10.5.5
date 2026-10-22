// (v11.10.0) Disguised values, taken over from the team's v13 fork: values written with spaces between the characters,
// with non-Latin digits, or split over two lines are read as the value they are, and labeled as written.
// Every value is synthetic. Run: node tests/disguised.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });
const norm = (l) => (l === 'International Phone Number' || l === 'Indian Mobile Number') ? 'Contact Number' : l;

const cases = [];
const yes = (l, r, text, lab) => cases.push({ kind: 'yes', l, r, text, lab });
const no = (l, r, text) => cases.push({ kind: 'no', l, r, text });
const same = (doc) => [doc, doc];

// ---------------- spaced characters ----------------
yes(...same('Mobile: 9 8 4 5 0 1 2 3 4 5'), '9 8 4 5 0 1 2 3 4 5', 'Contact Number');
no(...same('Mobile: 9 8 4 5 0 1 2 3 4 5'), '9 8 4 5 0 1 2 3');
yes(...same('Aadhaar: 2 3 4 5 6 7 8 9 0 1 2 3'), '2 3 4 5 6 7 8 9 0 1 2 3', 'Credentials');
yes(...same('PAN: A B C P E 1 2 3 4 F'), 'A B C P E 1 2 3 4 F', 'Credentials');
no('Mobile: 9 8 4 5 0 1 2 3 4 5', 'Mobile: 9 8 7 6 5 4 3 2 1 0', '9 8 7 6 5 4 3 2 1 0');   // replaced: no label, no pieces
no('Mobile: 9 8 4 5 0 1 2 3 4 5', 'Mobile: 9 8 7 6 5 4 3 2 1 0', '5 4 3 2');
no(...same('Rate it a b c d on the form'), 'a b c d');                                        // letters only: not a value

// ---------------- non-Latin digits ----------------
yes(...same('Mobile: ९८४५०१२३४५'), '९८४५०१२३४५', 'Contact Number');   // Devanagari
yes(...same('Aadhaar: २३४५ ६७८९ ०१२३'), '२३४५ ६७८९ ०१२३', 'Credentials');
yes(...same('EPIC: YMS५७१५५७७'), 'YMS५७१५५७७', 'Credentials');
yes(...same('Phone: ９８４５０１２３４５'), '９８４５０１２３４５', 'Contact Number');   // fullwidth
no('EPIC: DVM२२२३०६४', 'EPIC: QRT१११२०६४', 'QRT');   // replaced: no piece is Overscrubbed

// ---------------- values split over two lines ----------------
{
  const doc = 'Id Passport: X486\n5305  Status: archived';
  yes(doc, doc, 'X486', 'Credentials');
  yes(doc, doc, '5305', 'Credentials');
}
{
  const doc = 'Account No: 501002345\n67891  Branch: Pune';
  yes(doc, doc, '501002345', 'Account Number');
  yes(doc, doc, '67891', 'Account Number');
}
no('Id Passport: X486\n5305  Status: archived', 'Id Passport: Q912\n7731  Status: archived', 'Q912');
no(...same('Status: open\ntoday we start'), 'open');                                          // words, not a split value

// ---------------- unchanged ----------------
yes(...same('Mobile: 9845012345'), '9845012345', 'Contact Number');
yes(...same('PAN: ABCDE1234F'), 'ABCDE1234F', 'Credentials');

let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text);
  let ok, got = hit ? norm(hit.label) : '(none)';
  if (c.kind === 'yes') ok = !!hit && norm(hit.label) === c.lab;
  else ok = !hit;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 70)} -> got ${got}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 150)}]`); }
}
console.log(`\n${pass}/${pass + fail} disguised-value checks passed`);
process.exit(fail ? 1 : 0);
