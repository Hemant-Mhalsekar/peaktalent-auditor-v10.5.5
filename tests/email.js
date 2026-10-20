// Email Address, second review on the 13-chip page (v11.7.3). Every value is synthetic. Run: node tests/email.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const EM = 'Email Address', OVER = 'Overscrubbed';
const cases = [];
const yes = (doc, text, lab = EM, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = EM) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- e-mails ----------------
yes('Mail rahul.sharma@infosys.com today', 'rahul.sharma@infosys.com');
yes('Contact: RAHUL.SHARMA@INFOSYS.COM', 'RAHUL.SHARMA@INFOSYS.COM');
yes('rahul+jobs@gmail.com', 'rahul+jobs@gmail.com');
yes('9845012345@gmail.com', '9845012345@gmail.com');
yes('<a href="mailto:priya@acme-demo.io">Write</a>', 'priya@acme-demo.io');
yes('mailto:priya@acme-demo.io?subject=Hi', 'priya@acme-demo.io');
yes('Write to rahul@infosys.com.', 'rahul@infosys.com');
yes('To: a.b@acme-demo.io;c.d@acme-demo.io', 'c.d@acme-demo.io');
yes('hello@studio.design', 'hello@studio.design');
yes("sean.o'brien@initech-demo.com", "sean.o'brien@initech-demo.com");
yes('test@infosys.com', 'test@infosys.com');
// accented name parts
yes('Mail josé@empresa.com.br', 'josé@empresa.com.br');
yes('Escreva para joão.silva@empresa.com.br', 'joão.silva@empresa.com.br');
yes('Contact: müller@beispiel-firma.de', 'müller@beispiel-firma.de');
no('Mail josé@empresa.com.br', '@empresa.com.br');
notAs('Mail josé@empresa.com.br', '@empresa.com.br', 'Person Username');
// system addresses are e-mails (user rule B)
yes('Sent from noreply@acme-demo.io', 'noreply@acme-demo.io');
yes('MAILER-DAEMON@mail.acme-demo.io', 'MAILER-DAEMON@mail.acme-demo.io');
yes('Co-authored-by: Priya <12345+priya@users.noreply.github.com>', '12345+priya@users.noreply.github.com');

// ---------------- not e-mails ----------------
no('user@example.com', 'user@example.com');
no('your.email@domain.com', 'your.email@domain.com');
no('name@company.com', 'name@company.com');                 // user rule C: template domains
no('john@yourcompany.com', 'john@yourcompany.com');
no('admin@yourdomain.com', 'admin@yourdomain.com');
no('me@mydomain.com', 'me@mydomain.com');
no('info@website.com', 'info@website.com');
no('logo@2x.png', 'logo@2x.png');
no('lodash@4.17.21', 'lodash@4.17.21');
no('priya..r@acme-demo.io', 'priya..r@acme-demo.io');
no('git@github.com:acme/repo.git', 'git@github.com');
notAs('Pay rahul@okhdfcbank', 'rahul@okhdfcbank');
notAs('@priya@mastodon.social', '@priya@mastodon.social');

// ---------------- changed ----------------
no('Mail rahul@infosys.com', 'amit@infosys.com', 'Mail amit@infosys.com');
yes('Mail rahul@infosys.com', 'hello', OVER, 'Mail hello');
yes('Mail support', 'rahul@infosys.com', OVER, 'Mail rahul@infosys.com');       // user rule A: a word replaced by an e-mail
yes('Reach the help desk', 'priya@acme-demo.io', OVER, 'Reach the priya@acme-demo.io');
no('Mail rahul@infosys.com', 'user@example.com', 'Mail user@example.com');

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
console.log(`\n${pass}/${pass + fail} email checks passed`);
process.exit(fail ? 1 : 0);
