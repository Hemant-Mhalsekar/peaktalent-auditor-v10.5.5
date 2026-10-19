// Contact group of the new label set (v11.4.0): Indian Mobile Number, International Phone Number, Email Address,
// Address (full or partial, whole line), Postal Code, Indonesian Postal Code, Brazilian CEP.
// Every value is synthetic. Run: node tests/contact.js
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

const IN = 'Indian Mobile Number', INTL = 'International Phone Number', POST = 'Postal Code', KODEPOS = 'Indonesian Postal Code',
  CEP = 'Brazilian CEP', ADDR = 'Address', EMAIL = 'Email Address';
const cases = [];
// yes: `text` must be labeled `lab` (same document on both sides unless `right` is given)
const yes = (doc, text, lab, right = doc) => cases.push({ kind: 'yes', l: doc, r: right, text, lab });
// no: `text` must get no label at all
const no = (doc, text, right = doc) => cases.push({ kind: 'no', l: doc, r: right, text });
// notAs: `text` must not get label `lab` (another label is fine)
const notAs = (doc, text, lab) => cases.push({ kind: 'notAs', l: doc, r: doc, text, lab });

// ---------------- Indian Mobile Number: 10 digits starting 6-9, optional +91 / 91 / 0, country code included ----------------
yes('Call 9876543210 today', '9876543210', IN);
yes('Mobile: +91 98450 12345', '+91 98450 12345', IN);
yes('Mob: +91-9811122233', '+91-9811122233', IN);
yes('Phone: 98450-12345', '98450-12345', IN);
yes('Whatsapp 09845012345', '09845012345', IN);
yes('tel:+919876543210', '+919876543210', IN);
yes('Reach me on 984-501-2345 anytime', '984-501-2345', IN);
yes('| 1042 | Kavya | 9845098450 |', '9845098450', IN);
yes('{"mobile": "9123498765"}', '9123498765', IN);
notAs('Call 9876543210 today', '9876543210', INTL);
notAs('Call 9876543210 today', '9876543210', 'Contact Number');
no('Call 9876543210 today', '9123456780', 'Call 9123456780 today');
notAs('Aadhaar: 4321 8765 2109', '4321 8765 2109', IN);
notAs('Order 123456789012', '123456789012', IN);
notAs('Amount 7000000000 INR', '7000000000', IN);
notAs('Call 9999999999 for demo', '9999999999', IN);

// ---------------- International Phone Number: every other phone number (Indian landline and toll-free included) ----------------
yes('Office: 080-2345 6789', '080-2345 6789', INTL);
yes('Board line (022) 2345 6789', '(022) 2345 6789', INTL);
yes('Noida office 0120-4567890', '0120-4567890', INTL);
yes('Toll free 1800-123-4567', '1800-123-4567', INTL);
yes('US desk: +1 (415) 732-0198', '+1 (415) 732-0198', INTL);
yes('US desk: (415) 732-0198', '(415) 732-0198', INTL);
yes('Call 415-732-0198 after 5', '415-732-0198', INTL);
yes('London +44 20 7946 0321', '+44 20 7946 0321', INTL);
yes('UK mobile 07700 912345', '07700 912345', INTL);
yes('Sao Paulo +55 11 91234-5678', '+55 11 91234-5678', INTL);
yes('Escritorio (11) 3456-7890', '(11) 3456-7890', INTL);
yes('Jakarta +62 812-3456-7890', '+62 812-3456-7890', INTL);
yes('HP 0812-3456-7890', '0812-3456-7890', INTL);
yes('Kantor (021) 5551234', '(021) 5551234', INTL);
yes('Dubai +971 4 123 4567', '+971 4 123 4567', INTL);
yes('Bangalore +91 80 2345 6789', '+91 80 2345 6789', INTL);
yes('US +1 9876543210', '+1 9876543210', INTL);
yes('Fax: 2345 6789', '2345 6789', INTL);
yes('Phone: 4157320198', '4157320198', INTL);
notAs('Office: 080-2345 6789', '080-2345 6789', IN);
no('US desk: +1 (415) 732-0198', '+1 (415) 732-4471', 'US desk: +1 (415) 732-4471');
// look-alikes that are never phone numbers
notAs('Released on 2024-10-15', '2024-10-15', INTL);
notAs('Valid 15-10-2024 to 14-10-2025', '15-10-2024', INTL);
notAs('Server 192.168.10.25', '192.168.10.25', INTL);
notAs('SSN: 123-45-6789', '123-45-6789', INTL);
notAs('CPF 123.456.789-09', '123.456.789-09', INTL);
notAs('ZIP 94105-1234', '94105-1234', INTL);
notAs('CEP 01310-100', '01310-100', INTL);
notAs('Card 4111 1111 1111 1111', '4111 1111 1111 1111', INTL);
notAs('Period 2019-2023', '2019-2023', INTL);
notAs('Version 1.2.3.4', '1.2.3.4', INTL);
notAs('Ticket 4102649745602321 raised', '4102649745602321', INTL);
notAs('Timestamp 1712345678', '1712345678', INTL);
notAs('Price $1,250,000', '1,250,000', INTL);
notAs('EIN 12-3456789', '12-3456789', INTL);
notAs('Ext: 4521', '4521', INTL);
// (v11.4.2) only the fictional range 555-0100 to 555-0199 is skipped; other 555 numbers are real phones
notAs('US desk: (415) 555-0132', '(415) 555-0132', INTL);
notAs('Call 555-0199 now', '555-0199', INTL);
notAs('US desk: +1 415 555 0100', '+1 415 555 0100', INTL);
yes('US desk: (415) 555-0232', '(415) 555-0232', INTL);
yes('US desk: +1 415-555-7788', '+1 415-555-7788', INTL);
yes('Call 415.555.2671 after 5', '415.555.2671', INTL);
notAs('Total 4157320198 views', '4157320198', INTL);

// (v11.5.3) a number in brackets; the 00 international prefix; ID numbers are not phones; nothing labeled inside a link
yes('Rahul (9845012345) called', '9845012345', IN);
yes('Ask Priya [9845012346] today', '9845012346', IN);
yes('Dial 0044 20 7946 0321', '0044 20 7946 0321', INTL);
yes('Dial 00 44 20 7946 0321', '00 44 20 7946 0321', INTL);
notAs('Order #9845012345 shipped', '9845012345', IN);
notAs('Invoice No 9845012345', '9845012345', IN);
notAs('Employee ID: 9845012345', '9845012345', IN);
notAs('Ticket 9845012345 closed', '9845012345', IN);
notAs('Booking ref 9845012345', '9845012345', IN);
yes('Contact No: 9845012345', '9845012345', IN);
yes('Mobile no. 9845012345', '9845012345', IN);
notAs('Chat: https://wa.me/919876543210', '919876543210', 'Credentials');
notAs('Chat: https://wa.me/919876543210', '919876543210', IN);
yes('Chat: https://wa.me/919876543210', 'https://wa.me/919876543210', 'URL/Link');
notAs('Office +1 (415) 732-0198 ext. 204', '+1 (415) 732-0198 ext. 204', INTL);
notAs('Call 1-800-FLOWERS', '1-800-FLOWERS', INTL);

// ---------------- Email Address ----------------
yes('Mail priya.raghavan@northwind-demo.com today', 'priya.raghavan@northwind-demo.com', EMAIL);
notAs('Pay to kavya@okhdfcbank', 'kavya@okhdfcbank', EMAIL);
notAs('Logo icon@2x.png', 'icon@2x.png', EMAIL);
no('Mail priya.raghavan@northwind-demo.com today', 'velmora.q@quellan-demo.com', 'Mail velmora.q@quellan-demo.com today');

// ---------------- Postal codes: labeled when a key or column says so ----------------
yes('Pincode: 560087', '560087', POST);
yes('{"postal_code": "560001"}', '560001', POST);
yes('ZIP: 94105', '94105', POST);
yes('Zip code 94105-1234', '94105-1234', POST);
yes('Postcode: SW1A 1AA', 'SW1A 1AA', POST);
yes('Postal code K6E 8X2', 'K6E 8X2', POST);
yes('Kode pos: 12190', '12190', KODEPOS);
yes('CEP: 01310-100', '01310-100', CEP);
yes('id,department,postal_code,status\nR000026,Field Services,08139-555,archived\nR000029,Support,6274SH,archived', '08139-555', POST);
yes('id,department,postal_code,status\nR000026,Field Services,08139-555,archived\nR000029,Support,6274SH,archived', '6274SH', POST);
yes('| Name | Kode Pos |\n| Budi | 40115 |', '40115', KODEPOS);
no('Pincode: 560087', '560099', 'Pincode: 560099');
notAs('PIN: 4821', '4821', POST);
notAs('Order 560087 shipped', '560087', POST);
notAs('Pincode: 560087', '560087', IN);
notAs('Pincode: 560087', '560087', INTL);

// ---------------- Address: full or partial, the whole line ----------------
yes('Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', ADDR);
yes('Flat 302, Lodha Splendora, Wakad, Pune 411057', 'Flat 302, Lodha Splendora, Wakad, Pune 411057', ADDR);
yes('Meet at MG Road tomorrow', 'MG Road', ADDR);
yes('Office: Sector 62, Noida', 'Sector 62, Noida', ADDR);
yes('Lives at 221B Baker Street, London', '221B Baker Street, London', ADDR);
yes('Shop 4, Linking Road, Bandra West', 'Shop 4, Linking Road, Bandra West', ADDR);
yes('Endereco: Rua Augusta 1500, Consolacao, Sao Paulo', 'Rua Augusta 1500, Consolacao, Sao Paulo', ADDR);
yes('Alamat: Jl. Sudirman No. 12, Jakarta Selatan', 'Jl. Sudirman No. 12, Jakarta Selatan', ADDR);
no('Meet at MG Road tomorrow', 'Kelvin Road', 'Meet at Kelvin Road tomorrow');
notAs('Location: Bengaluru', 'Bengaluru', ADDR);
notAs('Based in Pune and Mumbai', 'Pune', ADDR);
notAs('Country: India', 'India', ADDR);
notAs('State: Maharashtra', 'Maharashtra', ADDR);
notAs('Floor: 3rd Floor', '3rd Floor', ADDR);
notAs('Read the Wall Street Journal', 'Wall Street', ADDR);
notAs('git checkout main && git push', 'main', ADDR);
notAs('Pincode: 560087', '560087', ADDR);

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
console.log(`\n${pass}/${pass + fail} contact checks passed`);
process.exit(fail ? 1 : 0);
