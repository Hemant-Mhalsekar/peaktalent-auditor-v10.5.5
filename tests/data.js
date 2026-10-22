// (v11.11.0) The data lists taken over from the team's v13 fork: companies (stock-exchange listings + YC directory),
// institutions, ~108k real person names, real Indian PIN and US ZIP codes. User rules of 2026-10-22: institutions are
// Business Name, lowercase company names are labeled, a PIN / ZIP on its own is an Address.
// Every value is synthetic or public. Run: node tests/data.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const BN = 'Business Name', PN = 'Person Name';
const cases = [];
const yes = (doc, text, lab) => cases.push({ kind: 'yes', l: doc, r: doc, text, lab });
const no = (doc, text) => cases.push({ kind: 'no', l: doc, r: doc, text });
const notAs = (doc, text, lab) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- companies from the dataset ----------------
yes('He moved to Tata Motors last year.', 'Tata Motors', BN);
yes('Shares of Hindustan Unilever rose.', 'Hindustan Unilever', BN);
yes('Supplier: Jupiter Wagons Limited', 'Jupiter Wagons Limited', BN);          // dictionary words with the legal form
notAs('the wagons were parked at the jupiter yard', 'jupiter', BN);           // ... lower case, no company context: not a company
notAs('Hit the target before Friday.', 'target', BN);
notAs('Export the sheet to Excel.', 'Excel', BN);
yes('She works at Infosys in Pune.', 'Infosys', BN);                          // unchanged
// lowercase company names (user rule 3), when the sentence shows a company
yes('i work at infosys now', 'infosys', BN);
yes('paid through razorpay yesterday', 'razorpay', BN);
yes('ordered lunch on swiggy', 'swiggy', BN);
notAs('we need a stronger target this quarter', 'target', BN);
notAs('the delivery was on time', 'delivery', BN);

// ---------------- institutions (user rule 2: Business Name) ----------------
yes('Graduated from IIT Bombay in 2015.', 'IIT Bombay', BN);
yes("Studied at St. Xavier's College, Mumbai.", "St. Xavier's College", BN);
yes('Alumnus of Delhi Public School, R K Puram.', 'Delhi Public School', BN);
notAs('Graduated from IIT Bombay in 2015.', 'Bombay', BN);
no('He finished school in 2010.', 'school');
notAs('Secondary School Certificate', 'Secondary School Certificate', BN);    // a qualification, not a school

// ---------------- person names from the name database ----------------
yes('Approved by Lalremruata Pachuau.', 'Lalremruata Pachuau', PN);
yes('Reviewed by Yogeshwar Varalakshmi today.', 'Yogeshwar Varalakshmi', PN);
yes('Signed: Mohammed Irfan Qureshi', 'Mohammed Irfan Qureshi', PN);
no('Signed: Mohammed Irfan Qureshi', 'Irfan');                                // one name, one label
no('Hope you are well.', 'Hope');                                             // a name that is also an English word
no('Grace period ends Friday.', 'Grace');
no('Pending Review Items', 'Pending Review');

// ---------------- real postal codes ----------------
yes('Pincode: 560087', '560087', 'Postal Code');                             // real (shown as Address on the 13-chip page)
yes('Pin code - 411001', '411001', 'Postal Code');
no('Pincode: 999999', '999999');                                              // not a real PIN
no('Pincode: 100000', '100000');
yes('ZIP: 73301', '73301', 'Postal Code');                                    // real US ZIP (Austin)
no('ZIP: 00000', '00000');

let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text);
  let ok, got = hit ? hit.label : '(none)';
  if (c.kind === 'yes') ok = !!hit && hit.label === c.lab;
  else if (c.kind === 'no') ok = !hit;
  else ok = !hit || hit.label !== c.lab;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 70)} -> got ${got}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 150)}]`); }
}
console.log(`\n${pass}/${pass + fail} data checks passed`);
process.exit(fail ? 1 : 0);
