// Issues reported from live use, one block per report, so none comes back. Every value is synthetic.
// Run: node tests/reported.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const cases = [];
const yes = (l, r, text, lab) => cases.push({ kind: 'yes', l, r, text, lab });
const no = (l, r, text) => cases.push({ kind: 'no', l, r, text });
const notAs = (l, r, text, lab) => cases.push({ kind: 'notAs', l, r, text, lab });
const same = (doc) => [doc, doc];

// ---------------- 2026-10-23 (v11.11.2) ----------------
// 1. a constant NAME used as a value is not the secret ("apiKey: CONFLUENT_CLOUD_API_KEY"), nor are its imports
{
  const doc = 'import {\n  CONFLUENT_CLOUD_API_KEY,\n  CONFLUENT_KAFKA_CLUSTER_API_SECRET,\n} from "./config";\n' +
    'const client = new Kafka({ apiKey: CONFLUENT_CLOUD_API_KEY, apiSecret: CONFLUENT_KAFKA_CLUSTER_API_SECRET });\n' +
    'api_key = CONFLUENT_CLOUD_API_KEY\n  password: CONFLUENT_KAFKA_CLUSTER_API_SECRET,';
  no(...same(doc), 'CONFLUENT_CLOUD_API_KEY');
  no(...same(doc), 'CONFLUENT_KAFKA_CLUSTER_API_SECRET');
  yes(...same('API_KEY=' + 'sk_' + 'live_51HaBcDeFgHiJkLmNoPq'), 'sk_live_51HaBcDeFgHiJkLmNoPq', 'Credentials');   // a real key still is
  yes(...same('DB_PASSWORD=Xk9#mPq2vL7'), 'Xk9#mPq2vL7', 'Credentials');
}
// 2. an npm / eslint plugin name is not a username
no(...same("plugins: ['@typescript-eslint'],\nrules: {\n  '@typescript-eslint/camelcase': 'off',\n}"), '@typescript-eslint');
no(...same('{"plugins": ["@typescript-eslint", "@nrwl/nx"]}'), '@typescript-eslint');
yes(...same('Ping @rahul_92 on chat'), '@rahul_92', 'Person Username');
// 3. a value replaced on a token / key line is correct redaction, never Overscrubbed
no('GIT_USERNAME: klub_helm:USERNAME\nGIT_TOKEN: klub_helm:TOKEN', 'GIT_USERNAME: klub_helm:USERNAME\nGIT_TOKEN: dummy_yGHMCPjD7', 'dummy_yGHMCPjD7');
no('INTERNAL_API_KEY=abc', 'INTERNAL_API_KEY=dummy_5BsOKSr6LFFJPnom06hRSN9', 'dummy_5BsOKSr6LFFJPnom06hRSN9');
yes('Mode: standard', 'Mode: Xk9#mPq2vL7', 'Xk9#mPq2vL7', 'Overscrubbed');                      // a plain word replaced: still Overscrubbed
// 4. "LIMITED" after ordinary words is not a company ("INCLUDING BUT NOT LIMITED")
{
  const lic = 'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,';
  no(...same(lic), 'INCLUDING BUT NOT LIMITED');
  notAs(...same('Liability is not limited to the amount paid.'), 'not limited', 'Business Name');
  yes(...same('Supplier: Tata Motors Limited'), 'Tata Motors Limited', 'Business Name');
  yes(...same('Vendor: Velmora Foods Limited'), 'Velmora Foods Limited', 'Business Name');
}
// 5. a batch-file command after "@" is code ("@echo off")
no(...same('@echo off\n\njava -jar "%~dp0..\\lib\\cmdrunner-2.3.jar"'), '@echo');
no(...same('@setlocal enabledelayedexpansion'), '@setlocal');
no(...same('@rem build script'), '@rem');
// 6. an empty value never takes the next line ("MONGO_DB_PASSWORD=" then "INTERNAL_API_URL=http://localhost:3000")
{
  const env = 'MONGO_DB_HOST=localhost:27017\nMONGO_DB_USER_NAME=\nMONGO_DB_PASSWORD=\nINTERNAL_API_URL=http://localhost:3000\nINTERNAL_API_KEY=dummy_5BsOKSr6LFFJPnom06hRSN9';
  no(...same(env), 'INTERNAL_API_URL=http://localhost:3000');
  no(...same(env), 'http://localhost:3000');                                                       // localhost links are not labeled
  yes(...same('API_URL=http://api.klub-demo.io/v1'), 'http://api.klub-demo.io/v1', 'URL/Link');
}
// 7. code is not a company or a person ("client = session.client(", "service_name='secretsmanager'")
{
  const py = "# Create a Secrets Manager client\nsession = boto3.session.Session()\nclient = session.client(\n    service_name='secretsmanager',\n    region_name=region_name,\n)";
  no(...same(py), 'session.client');
  no(...same(py), 'secretsmanager');
  no(...same("bucket_name='reports-archive'"), 'reports-archive');
  yes(...same("name='Rahul Sharma'"), 'Rahul Sharma', 'Person Name');
  yes(...same('Client: Infosys'), 'Infosys', 'Business Name');
}

// ---------------- 2026-10-24 (v11.12.1) ----------------
// 1. a client object in code is not a company (fixed in 11.11.2; screenshot from 11.11.1)
no(...same('# Create Secret Manager client using Application Default Credentials\nclient = secretmanager.SecretManagerServiceClient()'), 'secretmanager.SecretManagerServiceClient');
// 2. a link ending in "/" does not take the next lines ("CLOUDFRONT_URL=https://x.cloudfront.net/" then "HUBSPOT_CONSUMER_KEY=")
{
  const env = 'EMAIL_HOST_PASSWORD=\nEMAIL_USE_TLS=False\nSNOWFLAKE_URL=\nCLOUDFRONT_URL=https://dncivszesn2ba.cloudfront.net/\nHUBSPOT_CONSUMER_KEY=\nHUBSPOT_CONSUMER_SECRET=\nRECAPTCHA_SECRET_KEY=\nSNOWFLAKE_ADMIN_USERNAME=\nSNOWFLAKE_ADMIN_PASSWORD=\nSNOWFLAKE_QUERY_USERNAME=';
  yes(...same(env), 'https://dncivszesn2ba.cloudfront.net/', 'URL/Link');
  for (const t of ['HUBSPOT_CONSUMER_KEY=', 'HUBSPOT_CONSUMER_SECRET=', 'RECAPTCHA_SECRET_KEY=', 'SNOWFLAKE_ADMIN_USERNAME=', 'EMAIL_USE_TLS=False', 'SNOWFLAKE_QUERY_USERNAME=', 'False']) no(...same(env), t);
}
// 3. "##" after a link (across a blank line) is not part of the link
{
  const md = 'See [Ant Design](https://ant.design/).\n\n## Learn More\n\n## The .gitignore file\n##';
  no(...same(md), '##');
  yes(...same(md), 'https://ant.design/', 'URL/Link');
  no(...same(md), 'https://ant.design/).');
}
// 4. a link closed by ")" ends there: the next lines (CSS) are not link pieces
{
  const css = ' * Licensed under MIT\n(https://github.com/twbs/bootstrap/blob/master/LICENSE)\n */\n.btn-default,\n.btn-primary,\n.btn-danger {';
  yes(...same(css), 'https://github.com/twbs/bootstrap/blob/master/LICENSE', 'URL/Link');
  for (const t of ['https://github.com/twbs/bootstrap/blob/master/LICENSE)', '*/', '.btn-default,', '.btn-primary,', '.btn-danger']) no(...same(css), t);
}
// a real wrapped link is still joined (the left document has it on one line)
{
  const L = 'Docs: https://docs.acme-demo.io/guides/installation/steps/linux/ubuntu-22-04-lts/advanced-setup-with-proxy-and-custom-ca';
  const R = 'Docs: https://docs.acme-demo.io/guides/installation/steps/linux/\nubuntu-22-04-lts/advanced-setup-with-proxy-and-custom-ca';
  yes(L, R, 'https://docs.acme-demo.io/guides/installation/steps/linux/', 'URL/Link');
  yes(L, R, 'ubuntu-22-04-lts/advanced-setup-with-proxy-and-custom-ca', 'URL/Link');
}
// 6. a heading made of ordinary words is not a person ("## Learn More": More is also a surname)
no(...same('## Learn More\n\nYou can learn more in the docs.'), 'Learn More');
no(...same('Read More about it below.'), 'Read More');
yes(...same('Report by Rahul More, Pune'), 'Rahul More', 'Person Name');
// 7. a link followed by a YAML key is not wrapped ("# Graylog: https://.../graylog/" then "graylog:")
{
  const yml = '  # Graylog: https://hub.docker.com/r/graylog/graylog/\n  graylog:\n    image: graylog/graylog:4.3.3';
  yes(...same(yml), 'https://hub.docker.com/r/graylog/graylog/', 'URL/Link');
  no(...same(yml), 'graylog:');
}

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
console.log(`\n${pass}/${pass + fail} reported-issue checks passed`);
process.exit(fail ? 1 : 0);
