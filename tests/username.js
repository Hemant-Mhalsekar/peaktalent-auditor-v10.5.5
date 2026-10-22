// Person Username, second review on the 13-chip page (v11.7.4). Every value is synthetic. Run: node tests/username.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const U = 'Person Username', OVER = 'Overscrubbed', PN = 'Person Name';
const cases = [];
const yes = (doc, text, lab = U, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = U) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- handles (unchanged rules) ----------------
yes('Ping @rahul_92 on chat', '@rahul_92');
yes('Follow @RahulVerma for updates', '@RahulVerma');
yes('cc @rahul-verma', '@rahul-verma');
yes('Assigned to @rahul_92.', '@rahul_92');
yes('(@rahul_92)', '@rahul_92');
yes('@priya@mastodon.social', '@priya@mastodon.social');
yes('Username: rahul_92', 'rahul_92');
yes('{"login": "kavya.nair"}', 'kavya.nair');
yes('Twitter: @rahul_92', '@rahul_92');

// ---------------- a Username column ----------------
yes('| Name | Username |\n| Rahul | rahul_92 |', 'rahul_92');
yes('| Name | Username | City |\n|---|---|---|\n| Rahul | rahul_92 | Pune |\n| Priya | priya.k | Delhi |', 'priya.k');
yes('name,username\nRahul,rahul_92', 'rahul_92');
yes('id\tlogin\temail\n1\tkavya_n\tk@acme-demo.io', 'kavya_n');
no('| Name | Username |\n| Rahul | admin |', 'admin');

// ---------------- user rule C: usernames in other shapes, file paths too ----------------
yes('Posted by u/rahul_92 yesterday', 'u/rahul_92');
yes('Discord: rahul#1234', 'rahul#1234');
yes('Saved to /home/rahul/projects/app', 'rahul');
yes('Open /Users/priya.k/Documents/report.pdf', 'priya.k');
yes('C:\\Users\\rahul.sharma\\Desktop\\notes.txt', 'rahul.sharma');
no('Saved to /home/ubuntu/app', 'ubuntu');
no('C:\\Users\\Public\\Documents', 'Public');
no('/Users/Shared/files', 'Shared');
no('Fixed in acme/app#1234', 'app#1234');

// ---------------- user rule D: a git author's login ----------------
yes('Author: rahulverma <rahul@infosys.com>', 'rahulverma');
notAs('Author: rahulverma <rahul@infosys.com>', 'rahulverma', PN);
yes('Author: Rahul Verma <rahul@infosys.com>', 'Rahul Verma', PN);

// ---------------- not usernames ----------------
no('@dependabot rebase', '@dependabot');          // user rule A: bots
no('@renovate[bot] updated deps', '@renovate');
no('cc @github-actions', '@github-actions');
no('<@U024BE7LH> said hi', '@U024BE7LH');         // user rule B: ids
no('SELECT @UserId FROM users', '@UserId');
no('DECLARE @Total INT', '@Total');
no('=SUM(@Table1)', '@Table1');
no('Username: Rahul Sharma', 'Rahul');
yes('Username: Rahul Sharma', 'Rahul Sharma', PN);
no('@here please review', '@here');
// (v11.7.10) code-comment tags are not people
no('// @TODO fix this later', '@TODO');
no('@TODO: refactor', '@TODO');
no('# @FIXME broken', '@FIXME');
no('@note this is important', '@note');
no('/* @HACK temporary */', '@HACK');
no('@XXX check this', '@XXX');
// (v11.9.0) user rule (v13 fork): an all-caps word after @ is a product / code name, not a username
no('cc @RAHUL', '@RAHUL');
no('Follow @NASA for updates', '@NASA');
no('user: Master', 'Master');
notAs('Instagram - @priya.clicks', 'Instagram', 'Business Name');
yes('Instagram - @priya.clicks', '@priya.clicks');

// ---------------- changed ----------------
no('Ping @rahul_92', '@amit_77', 'Ping @amit_77');
yes('Ping @rahul_92', 'hello', OVER, 'Ping hello');
yes('Ping team', '@rahul_92', OVER, 'Ping @rahul_92');          // user rule E
yes('Thanks to the reviewers', '@priya_k', OVER, 'Thanks to the @priya_k');

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
console.log(`\n${pass}/${pass + fail} username checks passed`);
process.exit(fail ? 1 : 0);
