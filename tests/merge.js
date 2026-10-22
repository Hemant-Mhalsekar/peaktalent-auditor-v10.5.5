// (v11.9.0) Fixes and rules taken over from the team's v13 fork (user decisions of 2026-10-22), plus four bugs the comparison
// exposed. Every value is synthetic. Run: node tests/merge.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const O = 'Overscrubbed', U = 'Person Username', PN = 'Person Name', BN = 'Business Name';
const cases = [];
const yes = (l, r, text, lab) => cases.push({ kind: 'yes', l, r, text, lab });
const no = (l, r, text) => cases.push({ kind: 'no', l, r, text });
const notAs = (l, r, text, lab) => cases.push({ kind: 'notAs', l, r, text, lab });
const same = (doc) => [doc, doc];

// ---------------- Overscrubbed ----------------
no('Studied at Delhi Public School', 'Studied at Velmora Public School', 'Velmora');          // a school is a business: redaction
yes('Nationality - Indian', 'Nationality - Giduhi', 'Giduhi', O);                          // a normal word replaced
yes('Religion: Hindu', 'Religion: Quarvix', 'Quarvix', O);
yes('records.bot@example.org', 'zelvor.bot@quarnis.org', 'zelvor.bot@quarnis.org', O);    // a placeholder replaced
no('Ticket R000001 closed', 'Ticket R000007 closed', 'R000007');                           // an id replaced by an id
no('Employee EMP-0042 joined', 'Employee EMP-0099 joined', 'EMP-0099');
no('hash: $2b$12$WbJB6sAF2leAbCdEf', 'hash: $2b$12$ZzYyXxWwVvUuTtSs', 'ZzYyXxWwVvUuTtSs');   // a secret replaced
no('Name="Barber, Jennifer"', 'Name="Mutate, Sucobevi"', 'Mutate');                        // a name field replaced
no('login ok for siroju_g_892', 'login ok for velib_q_101', 'velib_q_101');                // a username replaced
notAs(...same('# 2. Validate GitHub release exists'), 'GitHub', BN);                        // a platform used as a tool
no('The Bengaluru office is open', 'The Kolugonom office is open', 'Kolugonom');           // user rule 1: a place replaced
no('Office in Ireland', 'Office in Velmoria', 'Velmoria');
no('Shipped from Pune to Mumbai', 'Shipped from Quarvo to Mumbai', 'Quarvo');
yes('Approved by RBI last week', 'Approved by ZQX last week', 'ZQX', O);                   // user rule 5: a regulator replaced
yes('The Council Member approved it.', 'The Council Beagenhydra approved it.', 'Beagenhydra', O);   // unchanged rules
yes('Status: pending', 'Status: approved', 'approved', O);
no('Call 9845012345', 'Call 9876500000', '9876500000');                                     // user rule 6: a changed phone

// ---------------- usernames ----------------
no(...same('* @package WordPress'), '@package');                                            // code documentation tags
no(...same(' * @subpackage Admin'), '@subpackage');
no(...same('def show\n  @transcript = load\nend'), '@transcript');                        // Ruby instance variable
no(...same('my @files = glob("*");'), '@files');                                           // Perl arrays
no(...same('my ($v, $t) = @ARGV;'), '@ARGV');
yes(...same('Protected route accessed for siroju_gilivasu_892pv14134'), 'siroju_gilivasu_892pv14134', U);   // log usernames
yes(...same('User login successful: kavya_n_2024'), 'kavya_n_2024', U);
yes(...same('github_login_20 = "rahulverma"'), 'rahulverma', U);
no(...same('Follow @NASA for updates'), '@NASA');                                           // user rule 2: all caps after @
no(...same('Enter @BIOS settings'), '@BIOS');
no(...same('cc @RAHUL'), '@RAHUL');
yes(...same('Ping @rahul_92 on chat'), '@rahul_92', U);
yes(...same('Thanks @Himanshu Shankar for the fix'), '@Himanshu Shankar', U);              // user rule 3: the whole mention
notAs(...same('Thanks @Himanshu Shankar for the fix'), '@Himanshu', U);
no(...same('Thanks @Himanshu Shankar for the fix'), 'Himanshu Shankar');

// ---------------- names / companies ----------------
yes(...same('Firmware Engineer @ Spintly'), 'Spintly', BN);                                 // role @ company
yes(...same('From: jahnavi s <jira@evp.atlassian.net>'), 'jahnavi s', PN);                 // e-mail sender name
yes(...same('From: Rahul Verma <rahul@infosys.com>'), 'Rahul Verma', PN);
no(...same('https://www.linkedin.com/in/testcandidate'), 'https://www.linkedin.com/in/testcandidate');   // user rule 4: example accounts
no(...same('Mail testcandidate@gmail.com'), 'testcandidate@gmail.com');
no(...same('https://github.com/john-doe'), 'https://github.com/john-doe');
yes(...same('https://www.linkedin.com/in/rahul-sharma-92'), 'https://www.linkedin.com/in/rahul-sharma-92', 'URL/Link');
yes(...same('Pincode: 560087'), '560087', 'Postal Code');                                  // decision 1 (see the page test for the chip)

// ---------------- small fixes (C) ----------------
no(...same('Mozilla/5.0 Chrome/143.0.0.0 Safari/537.36'), '143.0.0.0');                   // a browser version
no(...same('Edg/120.0.2210.91'), '120.0.2210.91');
yes(...same('Server 143.10.0.7 is down'), '143.10.0.7', 'IP Address');
no(...same('Ref BIN0001613-342606361564-NA'), '342606361564');                               // a bank reference chain
no(...same('Ref BIN0001613-342606361564-NA'), 'BIN0001613');
no(...same('echo "user\\nname@acme-demo.io"'), 'nname@acme-demo.io');                       // escaped text

// ---------------- bugs in 11.8.2 ----------------
no(...same('Contact Venkatesh Subramanian for access.'), 'Contact Venkatesh Subramanian');
yes(...same('Contact Venkatesh Subramanian for access.'), 'Venkatesh Subramanian', PN);
notAs(...same('Austin, TX 73301'), 'Austin', PN);
no(...same('| Address | City | State | Pincode |\n| 12 MG Road | Pune | Maharashtra | 411001 |'), '12 MG');
no(...same('run --username raj --password raj'), 'raj --password raj');

let pass = 0, fail = 0;
for (const c of cases) {
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { fail++; console.log('✗ CRASH', c.text, err.message); continue; }
  const hit = ts.find(t => t.text === c.text);
  let ok, got = hit ? hit.label : '(none)';
  if (c.kind === 'yes') ok = !!hit && hit.label === c.lab;
  else if (c.kind === 'no') ok = !hit;
  else ok = !hit || hit.label !== c.lab;
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 80)} -> got ${got}   [all: ${ts.map(t => t.text + '=' + t.label).join(' ; ').slice(0, 150)}]`); }
}
console.log(`\n${pass}/${pass + fail} merge checks passed`);
process.exit(fail ? 1 : 0);
