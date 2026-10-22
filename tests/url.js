// URL/Link, second review on the 13-chip page (v11.7.5). Every value is synthetic. Run: node tests/url.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const L = 'URL/Link', OVER = 'Overscrubbed', IP = 'IP Address';
const U = 'https://portal.acme-demo.io/users/1042/profile';
const cases = [];
const yes = (doc, text, lab = L, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });

// ---------------- links (unchanged rules) ----------------
yes(`See ${U} now`, U);
yes(`See ${U}.`, U);
yes(`(see ${U})`, U);
yes('[wiki](https://en.wikipedia.org/wiki/Foo_(bar))', 'https://en.wikipedia.org/wiki/Foo_(bar)');
yes(`${U}?tab=info&id=7`, `${U}?tab=info&id=7`);
yes('https://api.acme-demo.io:8443/v1/users', 'https://api.acme-demo.io:8443/v1/users');
yes('https://hr.acme-demo.io/payslips/2024-03.pdf', 'https://hr.acme-demo.io/payslips/2024-03.pdf');
yes('https://drive.google.com/file/d/1AbCdEfGhIjK/view', 'https://drive.google.com/file/d/1AbCdEfGhIjK/view');
yes('https://www.linkedin.com/in/rahul-sharma-92', 'https://www.linkedin.com/in/rahul-sharma-92');
// user rule C: a link holding a secret is one link
yes('https://api.acme-demo.io/hook?token=Xk9mPq2vL7aa88', 'https://api.acme-demo.io/hook?token=Xk9mPq2vL7aa88');

// ---------------- upper case ----------------
yes('HTTPS://PORTAL.ACME-DEMO.IO/USERS', 'HTTPS://PORTAL.ACME-DEMO.IO/USERS');
yes('Visit Https://Portal.Acme-Demo.io/Team', 'Https://Portal.Acme-Demo.io/Team');

// ---------------- user rule D: an IP address as the host is an IP Address, not a link ----------------
no('https://10.0.0.5/admin', 'https://10.0.0.5/admin');
yes('https://10.0.0.5/admin', '10.0.0.5', IP);
yes('Dashboard at https://192.168.1.20:8080/status', '192.168.1.20', IP);

// ---------------- not links ----------------
no('https://your-domain.com/callback', 'https://your-domain.com/callback');
no('https://yourapp.com/login', 'https://yourapp.com/login');
no('https://${HOST}/api', 'https://${HOST}/api');
no('https://{{host}}/api/v1', 'https://{{host}}/api/v1');
no('https://<your-tenant>.auth0.com/authorize', 'https://<your-tenant>.auth0.com/authorize');
no('"$schema": "https://json-schema.org/draft-07/schema"', 'https://json-schema.org/draft-07/schema');   // user rule B
no('"@context": "https://schema.org"', 'https://schema.org');
// (v11.7.11) user rule: http:// links are labeled too
yes('See http://portal.acme-demo.io/users', 'http://portal.acme-demo.io/users');
yes('Source http://rubygems.org/', 'http://rubygems.org/');
yes("source 'http://rubygems.org'", 'http://rubygems.org');
yes('HTTP://LEGACY.ACME-DEMO.IO/OLD', 'HTTP://LEGACY.ACME-DEMO.IO/OLD');
no('http://localhost:3000/api', 'http://localhost:3000/api');
no('http://example.com/x', 'http://example.com/x');
no('http://cdn.acme-demo.io/logo.png', 'http://cdn.acme-demo.io/logo.png');
yes('http://10.0.0.5/admin', '10.0.0.5', IP);
no('http://10.0.0.5/admin', 'http://10.0.0.5/admin');
yes('See here', 'http://app.acme-demo.io/d/7', OVER, 'See http://app.acme-demo.io/d/7');
no('See www.acme-demo.io/users', 'www.acme-demo.io/users');
no('https://example.com/path', 'https://example.com/path');
no('https://cdn.acme-demo.io/logo.png', 'https://cdn.acme-demo.io/logo.png');
no('ftps://files.acme-demo.io/upload', 'ftps://files.acme-demo.io/upload');             // user rule E
no('s3://acme-bucket/reports/2024.csv', 's3://acme-bucket/reports/2024.csv');

// ---------------- changed ----------------
no(`See ${U}`, 'https://portal.acme-demo.io/users/9999/profile', 'See https://portal.acme-demo.io/users/9999/profile');
yes(`See ${U}`, 'here', OVER, 'See here');                       // a link replaced by a word
yes(`See ${U} for more`, 'details', OVER, 'See details for more');
yes('See here', U, OVER, `See ${U}`);                            // user rule A: a word replaced by a link
yes('Open the dashboard today', 'https://app.acme-demo.io/d/42', OVER, 'Open the https://app.acme-demo.io/d/42 today');

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
console.log(`\n${pass}/${pass + fail} url checks passed`);
process.exit(fail ? 1 : 0);
