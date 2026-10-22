// IP Address, second review on the 13-chip page (v11.7.7). Every value is synthetic. Run: node tests/ip.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const IP = 'IP Address', OVER = 'Overscrubbed';
const cases = [];
const yes = (doc, text, lab = IP, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });

// ---------------- IP addresses ----------------
yes('Server 192.168.10.25 is down', '192.168.10.25');
yes('Ping 8.8.8.8.', '8.8.8.8');
yes('Connect to 10.0.0.5:8080', '10.0.0.5');
yes('Subnet 10.0.0.0/24', '10.0.0.0');                 // user rule B: the IP part of a subnet
no('Subnet 10.0.0.0/24', '10.0.0.0/24');
yes('10.0.0.1-10.0.0.50', '10.0.0.50');
yes('{"ip": "203.0.113.45"}', '203.0.113.45');       // user rule C: documentation ranges stay labeled
yes('Doc range 192.0.2.10', '192.0.2.10');
yes('fe80::1ff:fe23:4567:890a', 'fe80::1ff:fe23:4567:890a');
yes('::ffff:192.168.1.10', '::ffff:192.168.1.10');
yes('X-Forwarded-For: 203.0.113.45, 70.41.3.18', '70.41.3.18');
yes('https://10.0.0.5/admin', '10.0.0.5');
yes('  host: 172.16.0.4', '172.16.0.4');

// ---------------- (v11.7.11) user rule: MAC addresses are labeled IP Address ----------------
yes('MAC 00:1A:2B:3C:4D:5E here', '00:1A:2B:3C:4D:5E');
yes('ether 00-1a-2b-3c-4d-5e', '00-1a-2b-3c-4d-5e');
yes('{"mac": "a4:5e:60:d1:22:9f"}', 'a4:5e:60:d1:22:9f');
yes('Device MAC: 0011.2233.4455', '0011.2233.4455');
no('fp aa:bb:cc:dd:ee:ff:00:11:22:33', 'aa:bb:cc:dd:ee:ff');
no('At 12:30:45 today', '12:30:45');
no('MAC 00:1A:2B:3C:4D:5E', '00:1A:2B:3C:4D:99', 'MAC 00:1A:2B:3C:4D:99');
no('MAC 00:00:00:00:00:00', '00:00:00:00:00:00');
no('MAC ff:ff:ff:ff:ff:ff', 'ff:ff:ff:ff:ff:ff');

// ---------------- user rule A: special addresses ----------------
no('Listen on 127.0.0.1', '127.0.0.1');
no('127.0.0.1 - - [10/Oct/2024] "GET /"', '127.0.0.1');
no('Bind to ::1 only', '::1');
no('Broadcast 255.255.255.255', '255.255.255.255');
no('Netmask 255.255.255.0', '255.255.255.0');
no('mask: 255.255.0.0', '255.255.0.0');
no('0.0.0.0', '0.0.0.0');

// ---------------- not IP addresses ----------------
no('"dependencies": {\n  "lodash": "4.17.21.1",\n  "@acme/ui-kit": "^2.10.0.3"\n}', '4.17.21.1');
no('"dependencies": {\n  "lodash": "4.17.21.1",\n  "@acme/ui-kit": "^2.10.0.3"\n}', '2.10.0.3');
yes('{"servers": {\n  "web01": "10.0.1.15",\n  "redis": "10.0.1.16"\n}}', '10.0.1.16');   // a host map in a config is IPs
no('"version": "10.2.0.15"', '10.2.0.15');
no('Bump react-dom@18.2.0.1 in package.json', '18.2.0.1');
yes('ssh ec2-user@10.0.0.5', '10.0.0.5');
yes('ssh ubuntu@10.0.0.6', '10.0.0.6');
no('Version 1.2.3.4', '1.2.3.4');
no('Due 12.03.2025', '12.03.2025');
no('OID 1.3.6.1.4.1', '1.3.6.1.4.1');

// ---------------- (v11.7.10) a changed IPv6 address is correct redaction, never Overscrubbed pieces ----------------
no('IPv6: fe80::1ff:fe23:4567:890a', 'fd12', 'IPv6: fd12:3456:789a:1::1');
no('IPv6: fe80::1ff:fe23:4567:890a', '3456', 'IPv6: fd12:3456:789a:1::1');
no('IP 10.0.0.1', 'db8', 'IP 2001:db8::1');
no('Host 2001:db8:85a3::8a2e:370:7334 up', '1', 'Host 2001:db8:85a3::1:2:3 up');
no('| web01 | 2001:db8::15 |', '77', '| web01 | 2001:db8::77 |');
yes('Host 2001:db8:85a3::8a2e:370:7334 up', '2001:db8:85a3::8a2e:370:7334');

// ---------------- changed ----------------
no('Server 192.168.10.25', '10.9.8.7', 'Server 10.9.8.7');
yes('Server 192.168.10.25 down', 'alpha', OVER, 'Server alpha down');
yes('Server alpha down', '192.168.10.25', OVER, 'Server 192.168.10.25 down');

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
console.log(`\n${pass}/${pass + fail} ip checks passed`);
process.exit(fail ? 1 : 0);
