// Credentials, second review on the 13-chip page (v11.7.1). Value only, the same on both sides; a changed value gets no
// label. Every value is synthetic; vendor prefixes are split so no scanner takes them for real keys.
// Run: node tests/credentials.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });
const J = (a, b) => a + b;

const C = 'Credentials', OVER = 'Overscrubbed';
const cases = [];
const yes = (doc, text, lab = C, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = C) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- secrets behind a key ----------------
yes('Password: Tr0ub4dor&3', 'Tr0ub4dor&3');
yes('The password is hunter2024!', 'hunter2024!');
yes('DB_PASSWORD=Xk9#mPq2vL7', 'Xk9#mPq2vL7');
yes('  password: "S3cr3t!Pass"', 'S3cr3t!Pass');
yes('client_secret: 9f8e7d6c5b4a3210fedcba9876543210', '9f8e7d6c5b4a3210fedcba9876543210');
yes('TWILIO_AUTH_TOKEN=9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d', '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d');
yes('postgres://admin:S3cretPass@db.internal:5432/app', 'S3cretPass');
no('postgres://admin:S3cretPass@db.internal:5432/app', 'admin');

// ---------------- PIN and OTP (user rule: a PIN is 4 digits) ----------------
yes('PIN: 4821', '4821');
yes('"pin": "4821"', '4821');
yes('ATM PIN: 4821', '4821');
yes('Your OTP is 482913', '482913');
yes('OTP: 482913', '482913');
yes('OTP code 482913 expires in 5 minutes', '482913');
yes('Use OTP 4821 to log in', '4821');
yes('One-time password: 73920155', '73920155');
notAs('PIN: 411001', '411001');
notAs('Pincode: 560087', '560087');
notAs('PIN code - 400001', '400001');
notAs('"pin": "411001"', '411001');
notAs('UPI PIN: 482913', '482913');

// ---------------- tokens and vendor keys ----------------
yes('OPENAI_API_KEY=' + J('sk-', 'proj-AbCdEf1234567890GhIjKl'), J('sk-', 'proj-AbCdEf1234567890GhIjKl'));
yes('token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123ghiJKL456mno', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123ghiJKL456mno');
yes('Authorization: Bearer abc123XYZ789tokenValue456', 'abc123XYZ789tokenValue456');
no('Authorization: Bearer abc123XYZ789tokenValue456', 'Bearer abc123XYZ789tokenValue456');
yes('Authorization: Basic YWRtaW46cGFzc3dvcmQ=', 'YWRtaW46cGFzc3dvcmQ=');
yes('curl -H "Authorization: Basic dXNlcjpzM2NyZXQxMjM=" https://api.acme-demo.io', 'dXNlcjpzM2NyZXQxMjM=');
no('Choose the Basic plan for small teams', 'plan');
notAs('Basic Information', 'Information');
yes('DefaultEndpointsProtocol=https;AccountName=acmedemo;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq==;EndpointSuffix=core.windows.net',
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq==');
yes('Endpoint=sb://acme-demo.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=Zk3mP9qR2sT5uV8wX1yA4bC7dE0fG6hJ9kL2mN5pQ8r=',
  'Zk3mP9qR2sT5uV8wX1yA4bC7dE0fG6hJ9kL2mN5pQ8r=');

// ---------------- SSH keys: the key part only ----------------
yes('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7v8k user@host', 'AAAAB3NzaC1yc2EAAAADAQABAAABAQC7v8k');
no('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7v8k user@host', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7v8k');
yes('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl dev@laptop', 'AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl');

// ---------------- hashes (user rule: SHA values, docker digests included) ----------------
yes('commit 839aeeff4312171ac86bebf47a1c2d3e4f5a6b7c', '839aeeff4312171ac86bebf47a1c2d3e4f5a6b7c');
yes('image: nginx@sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');

// ---------------- the 15 categories ----------------
yes('PAN: ABCDE1234F', 'ABCDE1234F');
yes('IFSC Code: HDFC0001234', 'HDFC0001234');
yes('Aadhaar: 2345 6789 0123', '2345 6789 0123');
yes('Voter ID: WBF1234567', 'WBF1234567');
yes('DL No: DL14 20110012345', 'DL14 20110012345');
yes('Passport No: J8369854', 'J8369854');
yes('SSN: 123-45-6789', '123-45-6789');
yes('Pay to rahul.sharma@okhdfcbank', 'rahul.sharma@okhdfcbank');
yes('Card: 4532 1234 5678 9012', '4532 1234 5678 9012');
yes('"cvv": "789", "expiry": "11/28"', '789');
yes('UTR No: CB0111264256', 'CB0111264256');
yes('invocation_id: c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a', 'c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a');
yes('VpcId: vpc-0a1b2c3d4e5f67890', 'vpc-0a1b2c3d4e5f67890');
yes('"AccountId": "243057143242"', '243057143242');
yes('Wallet: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e');

// ---------------- not credentials ----------------
no('"password": ""', 'password');
no('API_KEY=YOUR_API_KEY_HERE', 'YOUR_API_KEY_HERE');
no('Password: ********', '********');
no('const key = process.env.API_KEY;', 'process.env.API_KEY');
no('token: ${GITHUB_TOKEN}', '${GITHUB_TOKEN}');
no('permissions:\n  id-token: write', 'write');
no('"id": "26527fe0-1b3c-4d5e-8f9a-0b1c2d3e4f5a"', '26527fe0-1b3c-4d5e-8f9a-0b1c2d3e4f5a');
no('Order ID: ORD-2024-778812', 'ORD-2024-778812');
no('Booking ref: BK7781230', 'BK7781230');
no('Room 4821 is free', '4821');

// ---------------- changed values ----------------
no('Password: Tr0ub4dor&3', 'Zx81!kqPw', 'Password: Zx81!kqPw');
no('Password: Tr0ub4dor&3', 'hello', 'Password: hello');          // a secret replaced by a word: correct redaction (user rule D)
no('PAN: ABCDE1234F', 'PQRST6789K', 'PAN: PQRST6789K');
yes('Mode: standard', 'Xk9#mPq2vL7', OVER, 'Mode: Xk9#mPq2vL7');   // a plain word replaced by a secret-looking value: one label
no('Mode: standard', 'Xk9', 'Mode: Xk9#mPq2vL7');
no('Mode: standard', 'mPq2vL7', 'Mode: Xk9#mPq2vL7');

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
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)} -> got ${got}`); }
}
console.log(`\n${pass}/${pass + fail} credentials checks passed`);
process.exit(fail ? 1 : 0);
