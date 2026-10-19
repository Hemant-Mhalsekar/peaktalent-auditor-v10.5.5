// EXACT-SET tests: the engine must produce exactly these labels for the whole document - nothing missing, nothing extra.
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });
const D = [];
const doc = (name, left, right, expected) => D.push({ name, left, right, expected });

doc('KYC form (partly scrubbed)',
`Customer KYC Form
Name: Kavya Nair
Date of Birth: 21-09-1996
Mobile: +91 98450 12345
Email: kavya.nair@globex-demo.com
PAN: ABCDE1234F
Aadhaar: 4321 8765 2109
Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087
Bank: HDFC Bank
Account Number: 50100234567891
IFSC: HDFC0001234
Vehicle: KA 05 MN 4321
Form submitted on 12-01-2026`,
`Customer KYC Form
Name: Kavya Nair
Date of Birth: 21-09-1996
Mobile: +91 98450 12345
Email: velmora.quint@orbelune.com
PAN: QWERT5678Z
Aadhaar: 4321 8765 2109
Address: 45 Kelvin Street, Orbora Nagar, Bengaluru 560087
Bank: HDFC Bank
Account Number: 50100234567891
IFSC: HDFC0001234
Vehicle: MH 12 AB 9876
Form zorvantel on 12-01-2026`,
[['Kavya Nair','Person Name'],['21-09-1996','Date'],['+91 98450 12345','Indian Mobile Number'],['4321 8765 2109','Credentials'],
 ['50100234567891','Account Number'],['HDFC0001234','Credentials'],['zorvantel','Overscrubbed']]);

doc('Server incident report',
`Incident #4521 - API outage
Reported by: Divya Menon (@divya_m)
Affected host: 10.12.4.21 (api-gw-1), fallback 2001:db8::7
Runbook: https://wiki.initech-demo.com/runbooks/api-gw
Root cause: expired certificate on the load balancer.
DB_PASSWORD=Xk9#mPq2!vL7 was rotated after the incident.
Timeline: detected 09:12, resolved 10:40.`,
`Incident #4521 - API outage
Reported by: Divya Menon (@divya_m)
Affected host: 10.12.4.21 (api-gw-1), fallback 2001:db8::7
Runbook: https://wiki.initech-demo.com/runbooks/api-gw
Root velmarish: expired certificate on the load balancer.
DB_PASSWORD=Xk9#mPq2!vL7 was rotated after the incident.
Timeline: detected 09:12, resolved 10:40.`,
[['Divya Menon','Person Name'],['@divya_m','Person Username'],['10.12.4.21','IP Address'],['2001:db8::7','IP Address'],
 ['https://wiki.initech-demo.com/runbooks/api-gw','URL/Link'],['velmarish','Overscrubbed'],['Xk9#mPq2!vL7','Credentials']]);

doc('Offer letter',
`Infosys Limited
Electronics City, Hosur Road, Bengaluru 560100

Dear Rohan Kulkarni,
We are pleased to offer you the position of Senior Analyst.
Your joining date is 1 May 2026. Please report to Meera Pillai.
For queries write to hr@infosys-demo.com or call 080-2345 6789.`,
`Infosys Limited
Electronics City, Hosur Road, Bengaluru 560100

Dear Velmarith Quandor,
We are pleased to offer you the position of Senior Analyst.
Your joining date is 1 May 2026. Please report to Meera Pillai.
For queries write to hr@infosys-demo.com or call 080-2345 6789.`,
[['Infosys Limited','Business Name'],['Electronics City, Hosur Road, Bengaluru 560100','Address'],['Meera Pillai','Person Name'],
 ['hr@infosys-demo.com','Email Address'],['080-2345 6789','International Phone Number']]);

doc('Support ticket CSV',
`ticket_id,customer,phone,issue,agent
4102434713937455,Sneha Iyer,9845098450,Login failed after update,bournika.j
4102649426338705,Imran Shaikh,9123498765,Refund not received,bournika.j`,
`ticket_id,customer,phone,issue,agent
4102434713937455,Sneha Iyer,9845098450,Login failed after velmarish,bournika.j
4102649426338705,Torvan Quist,9988776655,Refund not received,bournika.j`,
[['Sneha Iyer','Person Name'],['9845098450','Indian Mobile Number'],['velmarish','Overscrubbed'],['bournika.j','Person Name']]);

doc('Code + config',
`// Author: Karthik Rao
import { Injectable } from "@angular/core";
@Injectable()
export class PaymentService {
  private apiKey = config.apiKey;
  private stripeKey = "sk_live_51HxYzAbCdEfGhIjKlMn";
  endpoint = "https://api.acmecorp-demo.io/v2/pay";
}`,
`// Author: Karthik Rao
import { Injectable } from "@angular/core";
@Injectable()
export class PaymentService {
  private apiKey = config.apiKey;
  private stripeKey = "sk_live_51HxYzAbCdEfGhIjKlMn";
  endpoint = "https://api.acmecorp-demo.io/v2/pay";
}`,
[['Karthik Rao','Person Name'],['sk_live_51HxYzAbCdEfGhIjKlMn','Credentials'],['https://api.acmecorp-demo.io/v2/pay','URL/Link']]);

doc('Chat export',
`[10:02] Meera Pillai: did you push the fix for Zentrix Analytics Pvt Ltd?
[10:03] Tarun Bose: yes, PR is up. Server 172.16.4.21 restarted.
[10:04] Meera Pillai: thanks. Call me on 99001 22334 if it fails again.`,
`[10:02] Meera Pillai: did you push the fix for Zentrix Analytics Pvt Ltd?
[10:03] Tarun Bose: yes, PR is up. Server 172.16.4.21 restarted.
[10:04] Meera Pillai: thanks. Call me on 99001 22334 if it fails again.`,
[['Meera Pillai','Person Name'],['Tarun Bose','Person Name'],['Zentrix Analytics Pvt Ltd','Business Name'],['172.16.4.21','IP Address'],['99001 22334','Indian Mobile Number']]);

doc('Lecture list (education export)',
`| id | title | class | board | teacher |
| A1 | Laws of Motion | Class 10 | TN State Board | Shankar Sir |
| A2 | Vernier Calipers and Screw Gauge | Class 9 | TN State Board | Sandra Ma'am |`,
`| id | title | class | board | teacher |
| A1 | Laws of Veronced | Class 10 | Orbora Group | Zaneltarane Sir |
| A2 | Vernier Calipers and Screw Gauge | Class 9 | Orbora Group | Quelvara Ma'am |`,
[['Veronced','Overscrubbed']]);


doc('Bank statement table',
`Statement of Account - HDFC Bank
Account Holder: Sneha Iyer
| Date | Narration | Ref No | Amount |
| 02-01-2026 | UPI/rahul92@okhdfcbank/Groceries | UTR2026010200123456 | 1,250.00 |
| 05-01-2026 | NEFT to Zentrix Analytics Pvt Ltd | N005260012345678 | 45,000.00 |
| 09-01-2026 | ATM WDL Koramangala | - | 5,000.00 |`,
`Statement of Account - HDFC Bank
Account Holder: Sneha Iyer
| Date | Narration | Ref No | Amount |
| 02-01-2026 | UPI/rahul92@okhdfcbank/Groceries | UTR2026010200123456 | 1,250.00 |
| 05-01-2026 | NEFT to Quanum Partners LLC | N005260012345678 | 45,000.00 |
| 09-01-2026 | ATM WDL Koramangala | - | 5,000.00 |`,
[['Sneha Iyer','Person Name'],['rahul92@okhdfcbank','Credentials']]);

doc('Medical report',
`Apollo Hospitals, Greams Road, Chennai 600006
Patient Name: Lakshmi Narayanan    DOB: 05-11-1958
Referred by: Dr. Arvind Swamy
Diagnosis: Type 2 diabetes. Review after 3 months.
Contact: 9840012345`,
`Apollo Hospitals, Greams Road, Chennai 600006
Patient Name: Lakshmi Narayanan    DOB: 05-11-1958
Referred by: Dr. Arvind Swamy
Diagnosis: Type 2 velmorine. Review after 3 months.
Contact: 9840012345`,
[['Apollo Hospitals','Business Name'],['Greams Road, Chennai 600006','Address'],   // (v11.5.0) a hospital is an organisation; company first, then its address
 ['Lakshmi Narayanan','Person Name'],['05-11-1958','Date'],['Arvind Swamy','Person Name'],['velmorine','Overscrubbed'],['9840012345','Indian Mobile Number']]);

doc('JSON user list',
`[{"id": 77812, "name": "Deepak Choudhary", "email": "deepak.c@initech-demo.com", "mobile": "+91-9811122233", "ip": "203.0.113.45", "created_at": "2024-03-11T09:12:44Z", "role": "admin"},
 {"id": 77813, "name": "Anita Desai", "email": "anita.desai@initech-demo.com", "mobile": "+91-9811122244", "ip": "203.0.113.46", "created_at": "2024-03-12T10:00:00Z", "role": "viewer"}]`,
`[{"id": 77812, "name": "Deepak Choudhary", "email": "deepak.c@initech-demo.com", "mobile": "+91-9811122233", "ip": "203.0.113.45", "created_at": "2024-03-11T09:12:44Z", "role": "admin"},
 {"id": 77813, "name": "Velmora Quint", "email": "velmora.q@orbelune.com", "mobile": "+91-9988776655", "ip": "198.51.100.7", "created_at": "2024-03-12T10:00:00Z", "role": "viewer"}]`,
[['Deepak Choudhary','Person Name'],['deepak.c@initech-demo.com','Email Address'],['+91-9811122233','Indian Mobile Number'],['203.0.113.45','IP Address']]);

doc('Resume header',
`RAHUL VERMA
Email: rahul.verma92@gmail.com | Phone: 9876543210 | GitHub: https://github.com/rahulv92
Skills: Python, SQL, Power BI, Tableau
Languages: English, Hindi, Marathi
Experience: Senior Data Analyst, Infosys Limited (2019 - Present)`,
`RAHUL VERMA
Email: rahul.verma92@gmail.com | Phone: 9876543210 | GitHub: https://github.com/rahulv92
Skills: Python, SQL, Power BI, Tableau
Languages: Beaargale, Hindi, Marathi
Experience: Senior Data Analyst, Infosys Limited (2019 - Present)`,
[['RAHUL VERMA','Person Name'],['rahul.verma92@gmail.com','Email Address'],['9876543210','Indian Mobile Number'],['https://github.com/rahulv92','URL/Link'],
 ['Beaargale','Overscrubbed'],['Infosys Limited','Business Name']]);

let failed = 0;
for (const d of D) {
  const ts = run(d.left, d.right);
  const got = new Map(ts.map(t => [t.text, t.label]));
  const missing = d.expected.filter(([t, l]) => got.get(t) !== l).map(([t, l]) => `missing ${l}: "${t}"${got.has(t) ? ' (got ' + got.get(t) + ')' : ''}`);
  const want = new Set(d.expected.map(([t]) => t));
  // Extra = labels not expected. Sub-parts of an expected name ("Meera" inside "Meera Pillai") with the same label are fine.
  const extra = ts.filter(t => !want.has(t.text) && !d.expected.some(([x, l]) => l === t.label && x.includes(t.text))).map(t => `extra ${t.label}: "${t.text}"`);
  if (missing.length || extra.length) { failed++; console.log('✗', d.name); [...missing, ...extra].forEach(x => console.log('    ' + x)); }
  else console.log('✓', d.name, `(${d.expected.length} labels, nothing extra)`);
}
console.log(`\n${D.length - failed}/${D.length} documents produce exactly the expected labels`);
if (require.main === module) process.exit(failed ? 1 : 0);
