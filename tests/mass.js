// MASS TEST CAMPAIGN - generates very large numbers of DIFFERENT documents (no two identical) from name / company /
// value pools, templates and variants, and checks every label the guidelines define, with special depth for
// Person Name and Business Name.
//   node tests/mass.js            -> default 20,000 cases (used by the build)
//   MASS_N=200000 node tests/mass.js   -> a full campaign (lakhs of cases)
//   V=1 shows up to 8 failing examples per category.
const { loadEngine } = require('./harness');
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });

// ---------- seeded random ----------
let seed = +(process.env.SEED || 20261015);
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- pools ----------
const FIRST = ('aarav aditi aditya ajay akash amit ananya anil anita anjali ankit arjun arun ashok ayesha bhavana deepak deepika dinesh divya farhan gaurav ' +
  'harish imran ishita jatin kavya kiran kunal lakshmi mahesh manish meera mohit naveen neha nikhil nisha pankaj pooja pradeep pranav priya rahul rajesh ' +
  'rakesh ramesh ravi riya rohan rohit sachin sahil sameer sandeep sanjay saurabh shalini shreya shruti siddharth sneha sonal sunil suresh swati tanvi ' +
  'tarun varun vijay vikram vinay vishal yash zoya akshay alok amrita anand anirudh ankita anuj aparna arnav ashish ashwin ayush bhavesh chirag dhruv ' +
  'gautam girish hemant himanshu hitesh irfan ishaan jaya jyoti kabir kapil karan kartik kavita keshav kishore komal krishna lalit madhav madhuri ' +
  'manoj mayank mukesh nadia neeraj nilesh nitin pallavi parth prakash prashant pratik praveen preeti rachna raghav rajat rajeev rashmi ruchi sakshi ' +
  'salman santosh sarita shashank shikha shilpa shivam sudhir sujata sumit sunita tushar uday umesh vikas vineet vinod vivek yogesh zainab').split(' ');
const LAST = ('sharma verma gupta singh kumar patel reddy rao nair iyer menon pillai shetty kulkarni deshpande joshi mehta shah agarwal bansal jain ' +
  'kapoor khanna malhotra chopra bose banerjee chatterjee mukherjee ghosh das sen dutta mishra pandey tiwari dubey yadav chaudhary saxena srivastava ' +
  'sinha shukla trivedi bhatt desai patil naidu prasad qureshi khan shaikh ahuja bajaj goswami dasgupta sengupta subramanian iyengar').split(' ');
const INTL = ['John Smith', 'Emily Clark', 'Michael Brown', 'Sarah Johnson', 'David Miller', 'Laura Wilson', 'James Taylor', 'Olivia Martin', 'Daniel Lee', 'Sophia Walker',
  'Lucas Meyer', 'Hannah Fischer', 'Mateo Garcia', 'Elena Rossi', 'Kenji Tanaka', 'Yuki Sato', 'Wei Zhang', 'Mei Chen', 'Omar Haddad', 'Fatima Zahra'];
const SYL = ['ve', 'lo', 'ra', 'zen', 'kar', 'mi', 'thal', 'or', 'quin', 'dor', 'bry', 'nel', 'vor', 'sa', 'ly', 'cre', 'hal', 'mo', 'ten', 'xi', 'pha', 'ru', 'gal', 'wyn', 'del', 'fen', 'tor', 'ny', 'sel', 'var'];
const synth = (n = 3) => { let s = ''; for (let i = 0; i < n; i++) s += pick(SYL); return s; };
const synthName = () => cap(synth(2 + Math.floor(rnd() * 2))) + ' ' + cap(synth(2 + Math.floor(rnd() * 2)));
const synthWord = () => synth(3);
const person = () => rnd() < 0.15 ? pick(INTL) : cap(pick(FIRST)) + ' ' + cap(pick(LAST));

const CO_HEAD = ['Zentrix', 'Northwind', 'Globex', 'Initech', 'Brightpath', 'Cloudnine', 'Quantra', 'Vertexa', 'Lumora', 'Nexora', 'Stellaris', 'Orbitek', 'Tridenta',
  'Kavach', 'Sahyadri', 'Indus', 'Vayu', 'Prakriti', 'Arogya', 'Saarthi', 'Nimbus', 'Helios', 'Corvex', 'Pinnacle', 'Evergreen Agro', 'Bluepeak', 'Silverline'];
const CO_SUF = ['Pvt Ltd', 'Private Limited', 'Limited', 'Technologies', 'Solutions', 'Labs', 'Analytics Pvt Ltd', 'Software', 'Systems', 'Industries', 'Enterprises',
  'Consulting', 'Logistics', 'Pharma', 'Ventures', 'Networks', 'Traders', 'Inc', 'LLC', 'Technologies Pvt Ltd'];
const BRANDS = ['Infosys', 'Wipro', 'Flipkart', 'Zomato', 'Swiggy', 'Razorpay', 'Paytm', 'Ola', 'Byjus', 'Zerodha', 'Freshworks', 'Zoho', 'Accenture', 'Deloitte', 'Cognizant',
  'Capgemini', 'Myntra', 'Nykaa', 'Meesho', 'Dunzo', 'Cred', 'PhonePe', 'Unacademy', 'Vedantu', 'Inc42'];
const company = () => rnd() < 0.3 ? pick(BRANDS) : pick(CO_HEAD) + ' ' + pick(CO_SUF);
const synthCompany = () => cap(synth(3)) + ' ' + pick(CO_SUF);

// ordinary capitalised words that sit where names / companies usually sit
const ORD_PERSON = ['Team', 'Manager', 'Everyone', 'Customer', 'Sir', 'Madam', 'Support', 'Admin', 'Reviewer', 'Candidate', 'Partner', 'Friends', 'Colleagues', 'Student', 'Parent'];
const ORD_BIZ = ['Pending', 'Unknown', 'Internal', 'Approved', 'Shortlisted', 'Rejected', 'Confirmed', 'Draft', 'Sample', 'General', 'Local Market', 'Head Office'];
// software / places / months / languages: never Person or Business
const NON_ENTITY = ['Kubernetes', 'Docker', 'Jira', 'Excel', 'Photoshop', 'Bengaluru', 'Mumbai', 'Delhi', 'India', 'January', 'Monday', 'English', 'Hindi', 'Bengali', 'Python', 'Jira'];

// ---------- templates ----------
const P_TPL = [
  (n) => `Hi ${n}, welcome aboard.`, (n) => `From: ${n} <hr@globex-demo.com>`, (n) => `Signed: ${n}`, (n) => `Account Holder: ${n}`,
  (n) => `[10:02] ${n}: did you push the fix?`, (n) => `| 1042 | ${n} | Sales | Pune |`, (n) => `{"name": "${n}", "role": "analyst"}`,
  (n) => `Reviewed by ${n} today.`, (n) => `Thanks,\n${n}`, (n) => `Meeting with ${n} at 4 PM.`, (n) => `Candidate Name: ${n}`,
  (n) => `Dear ${n},\nPlease find the offer attached.`, (n) => `Assigned to ${n} for review.`, (n) => `Patient Name: ${n}`, (n) => `Regards,\n${n}\nHR Manager`,
  (n) => `emp_id,full_name,dept\n77,${n},Finance`, (n) => `**${n}:** Okay, sounds good.`, (n) => `Interviewer: ${n}`, (n) => `Owner - ${n}`, (n) => `cc: ${n}`,
];
const B_TPL = [
  (b) => `She works at ${b} in Pune.`, (b) => `Vendor: ${b}`, (b) => `Offer letter from ${b}`, (b) => `| Vendor | ${b} | 1,250 |`, (b) => `${b} signed the NDA.`,
  (b) => `Invoice from ${b} for March.`, (b) => `Client: ${b}`, (b) => `Company Name: ${b}`, (b) => `Employer - ${b}`, (b) => `{"company": "${b}", "plan": "pro"}`,
  (b) => `Previously at ${b} (2019 - 2022)`, (b) => `Payment received from ${b}.`, (b) => `Partner: ${b}`, (b) => `Organisation: ${b}`, (b) => `Bill To\n${b}`,
];

// ---------- cases ----------
// Each case: { cat, l, r, must: [[text,label]], mustNot: [text], notLabel: [[text,label]] }
const gens = [];
const add = (w, fn) => gens.push([w, fn]);

// PERSON NAME
add(8, () => { const n = person(); const d = pick(P_TPL)(n); return { cat: 'Person: identical full name -> Person Name', l: d, r: d, must: [[n, 'Person Name']] }; });
add(6, () => { const n = person(), s = synthName(); const t = pick(P_TPL); return { cat: 'Person: fully scrubbed -> no label', l: t(n), r: t(s), mustNot: [s, ...s.split(' ')] }; });
add(5, () => { const f = cap(pick(FIRST)), la = cap(pick(LAST)), s = cap(synth(3)); const t = pick(P_TPL);
  return { cat: 'Person: first name kept, surname scrubbed', l: t(f + ' ' + la), r: t(f + ' ' + s), must: [[f, 'Person Name']], mustNot: [s, f + ' ' + s] }; });
add(3, () => { const f = cap(pick(FIRST)), la = cap(pick(LAST)), s = cap(synth(3)); const t = pick(P_TPL);
  return { cat: 'Person: surname kept, first name scrubbed', l: t(f + ' ' + la), r: t(s + ' ' + la), must: [[la, 'Person Name']], mustNot: [s] }; });
add(4, () => { const w = pick(ORD_PERSON); const d = pick(P_TPL)(w); return { cat: 'Person: ordinary word in a name slot -> not Person Name', l: d, r: d, notLabel: [[w, 'Person Name']] }; });
add(3, () => { const w = pick(NON_ENTITY); const d = pick(P_TPL)(w); return { cat: 'Person: software/place/month/language in a name slot -> not Person Name', l: d, r: d, notLabel: [[w, 'Person Name']] }; });
add(3, () => { const w = pick(ORD_PERSON), s = cap(synthWord()); const t = pick(P_TPL);
  return { cat: 'Person: ordinary word replaced -> Overscrubbed', l: t(w), r: t(s), must: [[s, 'Overscrubbed']] }; });
add(3, () => { const ns = Array.from({ length: 4 + Math.floor(rnd() * 4) }, person); const d = 'Attendees: ' + ns.join(', ');
  return { cat: 'Person: identical list of names -> every name Person Name', l: d, r: d, must: ns.map(n => [n, 'Person Name']) }; });
add(2, () => { const ns = Array.from({ length: 5 }, person); const ss = ns.map(() => synthName()); const k = Math.floor(rnd() * 5);
  const rs = ns.map((n, i) => i === k ? n : ss[i]);
  return { cat: 'Person: list mostly scrubbed -> no Overscrubbed on scrubbed names', l: 'Invited ' + ns.join(' '), r: 'Invited ' + rs.join(' '),
    mustNot: ss.filter((_, i) => i !== k).flatMap(s => s.split(' ')) }; });

// BUSINESS NAME
add(8, () => { const b = company(); const d = pick(B_TPL)(b); return { cat: 'Business: identical company -> Business Name', l: d, r: d, must: [[b, 'Business Name']] }; });
add(6, () => { const b = company(), s = synthCompany(); const t = pick(B_TPL); return { cat: 'Business: scrubbed company -> no label', l: t(b), r: t(s), mustNot: [s, s.split(' ')[0]] }; });
add(4, () => { const w = pick(ORD_BIZ); const d = pick(B_TPL)(w); return { cat: 'Business: ordinary word in a company slot -> not Business Name', l: d, r: d, notLabel: [[w, 'Business Name']] }; });
add(3, () => { const w = pick(NON_ENTITY); const d = pick(B_TPL)(w); return { cat: 'Business: software/place/language in a company slot -> not Business Name', l: d, r: d, notLabel: [[w, 'Business Name']] }; });
add(2, () => { const bank = pick(['HDFC Bank', 'ICICI Bank', 'AXIS BANK', 'State Bank of India', 'Kotak Mahindra Bank']); const d = `Bank: ${bank}`;
  return { cat: 'Business: bank names -> not Business Name', l: d, r: d, notLabel: [[bank, 'Business Name']] }; });
add(3, () => { const n = person(); const d = pick(B_TPL)(n); return { cat: 'Business: person name in a company slot -> not Business Name', l: d, r: d, notLabel: [[n, 'Business Name']] }; });
add(3, () => { const b = company(); const d = pick(P_TPL)(b); return { cat: 'Person: company in a name slot -> not Person Name', l: d, r: d, notLabel: [[b, 'Person Name']] }; });

// OTHER LABELS (identical -> label, changed -> no label)
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
const L2 = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const letters = (n) => Array.from({ length: n }, () => L2[Math.floor(rnd() * L2.length)]).join('');
const STATES = ['KA', 'MH', 'TN', 'DL', 'UP', 'GJ', 'RJ', 'KL', 'TS', 'WB', 'HR', 'PB'];
const VAL = {
  'Email Address': () => `${pick(FIRST)}.${pick(LAST)}${Math.floor(rnd() * 99)}@${pick(['globex-demo.com', 'initech-demo.in', 'northwind-demo.io'])}`,
  'Indian Mobile Number': () => pick([`${pick(['9', '8', '7'])}${digits(9)}`, `+91 ${pick(['9', '8'])}${digits(4)} ${digits(5)}`, `+91-${pick(['9', '7'])}${digits(9)}`]),
  'IP Address': () => `${pick([10, 172, 192, 203])}.${Math.floor(rnd() * 250)}.${Math.floor(rnd() * 250)}.${1 + Math.floor(rnd() * 250)}`,
  'Vehicle Number Plate': () => `${pick(STATES)} ${String(1 + Math.floor(rnd() * 98)).padStart(2, '0')} ${letters(2)} ${digits(4)}`,
  'URL/Link': () => `https://${pick(['docs', 'wiki', 'portal', 'app'])}.${pick(['globex-demo', 'initech-demo', 'northwind-demo'])}.io/${synthWord()}`,
  'Person Username': () => `@${pick(FIRST)}_${digits(2)}`,
  // a real PAN: 3 letters, the holder-type letter (P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local, J juridical, G govt), 1 letter, 4 digits, 1 letter
  'Credentials': () => `${letters(3)}${pick(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'])}${letters(1)}${digits(4)}${letters(1)}`,
  'Account Number': () => `${pick(['5', '3', '9'])}${digits(13)}`,
};
const CTX = {
  'Email Address': (v) => pick([`Mail ${v} today`, `Email: ${v}`, `Contact <${v}>`]),
  'Indian Mobile Number': (v) => pick([`Call ${v} now`, `Mobile: ${v}`, `Ph - ${v}`]),
  'IP Address': (v) => pick([`Server ${v} is down`, `host=${v}`, `"ip": "${v}"`]),
  'Vehicle Number Plate': (v) => pick([`Vehicle: ${v}`, `Car ${v} parked`, `| Vehicle No | ${v} |`]),
  'URL/Link': (v) => pick([`Docs: ${v}`, `See ${v} for details`, `[guide](${v})`]),
  'Person Username': (v) => pick([`Ping ${v} on Slack`, `cc ${v}`, `Follow ${v}`]),
  'Credentials': (v) => pick([`PAN: ${v}`, `PAN No.- ${v}`, `"pan": "${v}"`]),
  'Account Number': (v) => pick([`Account Number: ${v}`, `A/c No. ${v}`, `| Account No | ${v} |`]),
};
for (const lab of Object.keys(VAL)) {
  add(2, () => { const v = VAL[lab](); const d = CTX[lab](v); return { cat: `${lab}: identical -> ${lab}`, l: d, r: d, must: [[v, lab]] }; });
  add(1.5, () => { const v = VAL[lab](), v2 = VAL[lab](); if (v === v2) return null; const t = CTX[lab]; const tpl = t('\u0000');
    return { cat: `${lab}: changed -> no label`, l: tpl.replace('\u0000', v), r: tpl.replace('\u0000', v2), mustNot: [v2] }; });
}
add(2, () => { const dd = String(1 + Math.floor(rnd() * 28)).padStart(2, '0'), mm = String(1 + Math.floor(rnd() * 12)).padStart(2, '0'), yy = 1960 + Math.floor(rnd() * 45);
  const v = pick([`${dd}-${mm}-${yy}`, `${dd}/${mm}/${yy}`, `${yy}-${mm}-${dd}`]); const d = pick([`DOB: ${v}`, `Date of Birth: ${v}`, `Born on ${v}`]);
  return { cat: 'Date: identical date of birth -> Date', l: d, r: d, must: [[v, 'Date']] }; });
add(2, () => { const v = `${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-20${10 + Math.floor(rnd() * 16)}`;
  const d = pick([`Statement Date: ${v}`, `Invoice date ${v}`, `Joined: ${v}`]); return { cat: 'Date: other dates -> not Date', l: d, r: d, notLabel: [[v, 'Date']] }; });
add(2, () => { const no = 1 + Math.floor(rnd() * 400), rd = pick(['MG Road', 'Brigade Road', 'Linking Road', 'Park Street', 'Anna Salai']), city = pick(['Bengaluru 560001', 'Mumbai 400050', 'Pune 411001', 'Chennai 600006', 'Kolkata 700016']);
  const v = `${no}, ${rd}, ${city}`; const d = `Address: ${v}`; return { cat: 'Address: identical complete address -> Address', l: d, r: d, must: [[v, 'Address']] }; });
add(2, () => { const w = pick(['Bengaluru', 'Mumbai', 'Pune', 'Chennai']); const d = `Location: ${w}`; return { cat: 'Address: city alone -> not Address', l: d, r: d, notLabel: [[w, 'Address']] }; });
add(3, () => { const w = pick(['report', 'summary', 'meeting', 'review', 'project', 'budget', 'schedule', 'dashboard', 'feedback', 'policy']), s = synthWord();
  const t = pick([(x) => `Please share the ${x} by Friday.`, (x) => `The ${x} was approved.`, (x) => `## Project ${cap(x)}`]);
  const R = t(s), Lt = t(w); const shown = /## Project/.test(R) ? cap(s) : s;
  return { cat: 'Overscrubbed: ordinary word replaced -> Overscrubbed', l: Lt, r: R, must: [[shown, 'Overscrubbed']] }; });


// ---------- CODE FILES: identifiers are never Person / Business names; real authors still are ----------
const IDENT_CAPS = ['WEBSITE', 'CHECKSUMHASH', 'CUST_ID', 'ORDER_ID', 'CHANNEL_ID', 'TXN_AMOUNT', 'MERC_UNQ_REF', 'CALLBACK_URL', 'API_BASE', 'MAX_RETRIES', 'DEFAULT_LOCALE', 'MERCHANT', 'STATUS', 'TOKEN_TTL', 'REDIS_HOST', 'APP_NAME', 'LOG_LEVEL', 'PAYMENT', 'INVOICE', 'CUSTOMER'];
const IDENT_CAMEL = ['genChecksum', 'userService', 'orderController', 'paymentGateway', 'isLoading', 'fetchOrders', 'customerName', 'billingAddress', 'handleSubmit', 'checkoutForm', 'merchantKey', 'renderRow', 'Controller', 'Request', 'Match', 'Command', 'Kernel', 'Handler', 'Model', 'Builder'];
const CODE_TPL = [
  (x) => `<input type="hidden" name="${x}" v-model="form.${x}">`,
  (x) => `<input name="${x}" placeholder="${x}" class="form-control">`,
  (x) => `<label for="${x}">${x}</label>`,
  (x) => `const ${x} = process.env.${x};`,
  (x) => `{"name": "${x}", "version": "1.0.0"}`,
  (x) => `name: ${x}`,
  (x) => `use App\\Http\\Controllers\\${x};`,
  (x) => `import ${x} from './${x}';`,
  (x) => `SELECT ${x} FROM orders WHERE id = 1;`,
  (x) => `export default { name: '${x}', data() { return {}; } }`,
  (x) => `public function ${x}(Request $request)`,
  (x) => `.${x} { color: red; }`,
];
add(4, () => { const x = pick(IDENT_CAPS.concat(IDENT_CAMEL)); const d = pick(CODE_TPL)(x); return { cat: 'Code: identifiers / attribute names -> not Person / Business Name', l: d, r: d, notLabel: [[x, 'Person Name'], [x, 'Business Name']] }; });
add(2, () => { const n = person(); const d = pick([(p) => `// Author: ${p}`, (p) => `/** @author ${p} */`, (p) => `# Maintainer: ${p}`, (p) => `"author": "${p}",`, (p) => `Signed-off-by: ${p} <dev@globex-demo.com>`])(n);
  return { cat: 'Code: real author name in a comment / manifest -> Person Name', l: d, r: d, must: [[n, 'Person Name']] }; });
add(2, () => { const x = pick(['write', 'read', 'admin', 'none', 'enabled', 'true', 'public', 'private']); const k = pick(['id-token', 'token', 'password', 'secret', 'api_key', 'auth']);
  const d = `permissions:\n  ${k}: ${x}`; return { cat: 'Code: setting words behind key-like names -> not Credentials', l: d, r: d, notLabel: [[x, 'Credentials']] }; });

// ---------- run ----------
const N = +(process.env.MASS_N || 20000);
const totalW = gens.reduce((s, g) => s + g[0], 0);
const stats = new Map(), fails = new Map(), seenDocs = new Set();
let made = 0, dupSkipped = 0, guard = 0;
const t0 = Date.now();
while (made < N && guard < N * 5) {
  guard++;
  let x = rnd() * totalW, g = gens[0];
  for (const gg of gens) { if ((x -= gg[0]) <= 0) { g = gg; break; } }
  const c = g[1]();
  if (!c) continue;
  const key = c.l + '\u0001' + c.r;
  if (seenDocs.has(key)) { dupSkipped++; continue; }   // every case is a different document
  seenDocs.add(key); made++;
  let ts;
  try { ts = run(c.l, c.r); } catch (err) { ts = null; }
  const probs = [];
  if (!ts) probs.push('CRASH');
  else {
    // (v11.5.0) "Pvt Ltd." / "Inc." keep their dot, also at the end of a sentence
    for (const [t, lab] of c.must || []) { const h = ts.find(x => x.text === t || (lab === 'Business Name' && x.text === t + '.' && /\b(?:Ltd|Inc|Corp|Co|Pvt)$/.test(t))); if (!h) probs.push(`missing ${lab} "${t}"`); else if (h.label !== lab) probs.push(`"${t}" got ${h.label}, want ${lab}`); }
    for (const t of c.mustNot || []) { const h = ts.find(x => x.text === t); if (h) probs.push(`"${t}" should have no label, got ${h.label}`); }
    for (const [t, lab] of c.notLabel || []) { const h = ts.find(x => x.text === t); if (h && h.label === lab) probs.push(`"${t}" must not be ${lab}`); }
  }
  const s = stats.get(c.cat) || { n: 0, ok: 0 }; s.n++; if (!probs.length) s.ok++; stats.set(c.cat, s);
  if (probs.length) { const f = fails.get(c.cat) || []; if (f.length < 8) f.push({ l: c.l, r: c.r, probs, got: ts ? ts.map(x => x.text + '\u2192' + x.label).join(' | ') : '' }); fails.set(c.cat, f); }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
let tot = 0, ok = 0;
const rows = [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log('Category'.padEnd(78) + 'pass / total');
for (const [k, s] of rows) { tot += s.n; ok += s.ok; console.log(k.padEnd(78) + `${s.ok} / ${s.n}` + (s.ok < s.n ? `   (${(100 * s.ok / s.n).toFixed(2)}%)` : '')); }
console.log(`\n${ok}/${tot} mass-generated cases correct (${(100 * ok / tot).toFixed(3)}%), all ${made} documents different, ${secs}s`);
if (process.env.V) for (const [k, f] of fails) { console.log('\n### ' + k); for (const x of f) console.log('  L: ' + JSON.stringify(x.l) + '\n  R: ' + JSON.stringify(x.r) + '\n  ! ' + x.probs.join('; ') + '\n  got: ' + x.got); }
if (process.env.MASS_JSON) require('fs').writeFileSync(process.env.MASS_JSON, JSON.stringify({ ok, tot, rows }, null, 1));
process.exit(ok === tot ? 0 : 1);
