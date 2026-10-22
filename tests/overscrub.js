// Overscrubbed, second review on the 13-chip page (v11.7.9). User rule: a normal word replaced by any other word - made up
// or real - is Overscrubbed, since it exposes no PII or BII; a real value replaced by its own kind is correct redaction.
// Every value is synthetic. Run: node tests/overscrub.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const O = 'Overscrubbed';
const cases = [];
const yes = (l, r, text) => cases.push({ kind: 'yes', l, r, text });
const no = (l, r, text) => cases.push({ kind: 'no', l, r, text });

// ---------------- made-up and real replacements of normal words ----------------
yes('The Council Member approved it.', 'The Council Beagenhydra approved it.', 'Beagenhydra');
yes('The Council Member approved it.', 'The Council Manager approved it.', 'Manager');     // user rule B: real -> real
yes('Status: pending', 'Status: approved', 'approved');
yes('Send it today', 'Send it tomorrow', 'tomorrow');
yes('a big house', 'a small house', 'small');
yes('an end-client meeting', 'an end-lyroranim meeting', 'lyroranim');
yes('getUserProfile()', 'getUserVelmora()', 'Velmora');
yes('Send the report today', 'Send the final report today', 'final');
// user rule A: two replaced words side by side keep two labels
yes('for project kickoff', 'for Zelvo Quarnis', 'Zelvo');
yes('for project kickoff', 'for Zelvo Quarnis', 'Quarnis');
no('for project kickoff', 'for Zelvo Quarnis', 'Zelvo Quarnis');
// a file name: only the changed name, every extension
yes('see file.txt', 'see zelvor.txt', 'zelvor');
yes('open report.pdf now', 'open zelvor.pdf now', 'zelvor');
yes('load config.yaml first', 'load quarnis.yaml first', 'quarnis');
yes('run setup.sh', 'run velmora.sh', 'velmora');

// ---------------- correct redaction ----------------
no('Hi Rahul Sharma,', 'Hi Amit Verma,', 'Amit Verma');
no('Works at Infosys Ltd', 'Works at Zelvor Ltd', 'Zelvor');
no('Mail rahul@infosys.com', 'Mail amit@acme.com', 'amit@acme.com');
no('Call 9845012345', 'Call 9876500000', '9876500000');
no('DOB: 05-11-1988', 'DOB: 12-04-1990', '12-04-1990');
no('The Council Member approved it.', 'The Council Member approved it.', 'Member');

// ---------------- run ----------------
let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text && t.label === O);
  const ok = c.kind === 'yes' ? !!hit : !hit;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 160)}]`); }
}
console.log(`\n${pass}/${pass + fail} overscrub checks passed`);
process.exit(fail ? 1 : 0);
