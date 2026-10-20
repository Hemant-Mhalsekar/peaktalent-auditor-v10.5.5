// Address, second review on the 13-chip page (v11.7.2). The whole address on the line is one label; a city, state,
// country, postal code or landmark alone is not; a changed address gets no label. Every value is synthetic.
// Run: node tests/address.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const A = 'Address', OVER = 'Overscrubbed';
const cases = [];
const yes = (doc, text, lab = A, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = A) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });
const whole = (doc) => yes(doc, doc);

// ---------------- the whole address, from its first part ----------------
whole('#45, 2nd Cross, Indiranagar, Bengaluru - 560038');
whole('Tower B, 5th Floor, DLF Cyber City, Gurugram 122002');
whole('Flat 3, 10 Downing Street, London SW1A 2AA');
whole('Level 5, 1 Martin Place, Sydney NSW 2000');
whole('Flat 302, Lodha Splendora, Wakad, Pune 411057');
whole('H.No. 8-2-293/82, Road No. 10, Banjara Hills, Hyderabad 500034');
whole('Plot 17, Sector 62, Noida, UP 201301');
whole('Shop 4, Near City Mall, Linking Road, Bandra West, Mumbai 400050');
no('Shop 4, Near City Mall, Linking Road, Bandra West, Mumbai 400050', '4, Near City Mall, Linking Road, Bandra West, Mumbai 400050');
whole('Village Rampur, Post Sadar, Dist. Gorakhpur, UP 273001');
whole('350 Fifth Avenue, Suite 3300, New York, NY 10118');
whole('221B Baker Street, London NW1 6XE');
whole('Hauptstrasse 5, 10115 Berlin');
whole('Rua Augusta 1500, Consolacao, Sao Paulo - SP, 01304-001');
whole('Jl. Sudirman No. 12, Jakarta Selatan 12190');
whole('P.O. Box 1234, Dubai, UAE');
whole('10 Anson Road, #20-05 International Plaza, Singapore 079903');

// ---------------- ... to its last part ----------------
whole('1600 Pennsylvania Ave NW Washington DC 20500');
whole('100 Queen St W, Toronto, ON M5H 2N2');
whole('742 Evergreen Terrace, Springfield, IL 62704');

// ---------------- countries that were missed ----------------
whole('12 Rue de Rivoli, 75001 Paris');
yes('Bureau: 8 Avenue des Champs-Elysees, 75008 Paris', '8 Avenue des Champs-Elysees, 75008 Paris');
whole('1-1-2 Oshiage, Sumida-ku, Tokyo 131-0045');
yes('Office: 2-11-3 Meguro, Meguro-ku, Tokyo 153-0063', '2-11-3 Meguro, Meguro-ku, Tokyo 153-0063');

// ---------------- in text, keys and formats ----------------
yes('Please deliver to 12 MG Road, Pune 411001 by Friday.', '12 MG Road, Pune 411001');
yes('Office at Anna Salai, Chennai 600002', 'Anna Salai, Chennai 600002');   // "Salai" is a road (Tamil); "Office at" is not part of it
no('Office at Anna Salai, Chennai 600002', 'Office at Anna Salai, Chennai 600002');
yes('Lives in 12, MG Road, Pune 411001', '12, MG Road, Pune 411001');
yes('Address: 12, MG Road, Bengaluru 560001', '12, MG Road, Bengaluru 560001');
no('Address: 12, MG Road, Bengaluru 560001', 'Address: 12, MG Road, Bengaluru 560001');
yes('{"address": "12, MG Road, Bengaluru 560001"}', '12, MG Road, Bengaluru 560001');
yes('C/O Ramesh Kumar, 14 Gandhi Nagar, Indore 452001', '14 Gandhi Nagar, Indore 452001');   // user rule C: the name is a Person Name
yes('C/O Ramesh Kumar, 14 Gandhi Nagar, Indore 452001', 'Ramesh Kumar', 'Person Name');
yes('Infosys Ltd, Electronics City, Hosur Road, Bengaluru 560100', 'Electronics City, Hosur Road, Bengaluru 560100');

// ---------------- multi-line: every line of the block, a locality line too ----------------
{
  const doc = 'Ship to:\n12, MG Road\nIndiranagar\nBengaluru 560038\nIndia';
  yes(doc, '12, MG Road'); yes(doc, 'Indiranagar'); yes(doc, 'Bengaluru 560038'); yes(doc, 'India');
  const sig = 'Rahul Sharma\nAcme Pvt Ltd\n4th Floor, Prestige Tower\nKoramangala\nBengaluru 560034';
  yes(sig, 'Koramangala');
  no('Team update\nIndiranagar\nwas fun', 'Indiranagar');   // a lone place line is not an address
}

// ---------------- separate fields (user rule A): parts of one address when the street is there ----------------
{
  const doc = 'Street: 12 MG Road\nCity: Pune\nState: Maharashtra\nZIP: 411001';
  yes(doc, '12 MG Road'); yes(doc, 'Pune'); yes(doc, 'Maharashtra');
  notAs('City: Pune\nRole: Engineer', 'Pune');
  notAs('State: Maharashtra', 'Maharashtra');
}

// ---------------- not an address ----------------
notAs('Location: Bengaluru', 'Bengaluru');
notAs('Maharashtra, India', 'Maharashtra, India');
no('Read the Wall Street Journal', 'Wall Street');
no('Saved in Google Drive', 'Google Drive');
no('Floor: 3rd Floor', '3rd Floor');
no('const street = "MG Road";', 'MG Road');
no('Near City Mall', 'Near City Mall');                 // user rule D: a landmark alone
no('Opp. SBI Bank', 'Opp. SBI Bank');
no('Bengaluru PIN 560001', 'Bengaluru PIN 560001');     // user rule E: city + PIN, no street
notAs('Pincode: 560087', '560087');

// ---------------- changed ----------------
no('Ship to 12, MG Road, Pune 411001', '937 Garnthwaite Road, Pune 411001', 'Ship to 937 Garnthwaite Road, Pune 411001');
no('Plot 9, Sector 127, Noida 201301', 'Sector 127, Noida 201301', 'Plot 4, Sector 127, Noida 201301');
yes('Ship to 12, MG Road, Pune 411001', 'hello', OVER, 'Ship to hello');

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
  if (ok) pass++; else { fail++; console.log(`✗ ${c.kind} ${c.lab || ''} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)} -> got ${got}` + (c.kind === 'yes' ? '   [all: ' + ts.filter(t => t.label === c.lab).map(t => t.text).join(' ; ').slice(0, 160) + ']' : '')); }
}
console.log(`\n${pass}/${pass + fail} address checks passed`);
process.exit(fail ? 1 : 0);
