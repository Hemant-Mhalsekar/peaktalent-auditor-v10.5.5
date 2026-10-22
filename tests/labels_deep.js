// Per-label deep test campaign: for each of the 13 labels, cases that MUST get the label (same text on both sides)
// and look-alikes / scrubbed values that must NOT. Run: node tests/labels.js (V=1 for details).
// Per-label deep test campaign. Each case: label, kind (POS = must be labeled exactly; NEG = must NOT get that label / any label),
// left, right, text, [expectedLabel]
const {loadEngine}=require('./harness'); const e=loadEngine();
const run=(l,r)=>e.api.extractDynamicTargets({innerText:l},{innerText:r});
const cases=[];
// pos(label, doc, text) : identical doc, text must be labeled `label`
const pos=(label,doc,text,lbl=label)=>cases.push({label,kind:'POS',l:doc,r:doc,text,want:lbl});
// posd(label,left,right,text,lbl): different docs, text must have label lbl
const posd=(label,l,r,text,lbl)=>cases.push({label,kind:'POS',l,r,text,want:lbl});
// neg(label, left, right, text): text must get NO label at all
const neg=(label,l,r,text)=>cases.push({label,kind:'NEG',l,r,text});
const negs=(label,doc,text)=>neg(label,doc,doc,text);
// not(label, doc, text): text may have another label but must NOT have `label`
const not=(label,doc,text)=>cases.push({label,kind:'NOT',l:doc,r:doc,text});

/* ===================== ACCOUNT NUMBER ===================== */
pos('Account Number','Account Number: 50100234567891','50100234567891');
pos('Account Number','A/c No. 0123456789012','0123456789012');
pos('Account Number','Acct No: 912010012345678','912010012345678');
pos('Account Number','Beneficiary Account No - 38291045672','38291045672');
pos('Account Number','| Account Number | 112233445566 |','112233445566');
pos('Account Number','Please credit to account number 6789012345 today.','6789012345');
neg('Account Number','Account Number: 50100234567891','Account Number: 60200345678912','60200345678912');
negs('Account Number','Order No: 4500012345','4500012345');
negs('Account Number','Invoice # 1234567890','1234567890');
negs('Account Number','Account Type: Savings','Savings');
negs('Account Number','Total: 1234567890 views','1234567890');

/* ===================== ADDRESS ===================== */
pos('Address','Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087','Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087');
pos('Address','Ship to: 14, MG Road, Pune 411001','14, MG Road, Pune 411001');
pos('Address','Office: Plot No. 7, Sector 62, Noida, Uttar Pradesh 201309','Plot No. 7, Sector 62, Noida, Uttar Pradesh 201309');
pos('Address','Residence: H.No 12-3-45, Banjara Hills, Hyderabad 500034','H.No 12-3-45, Banjara Hills, Hyderabad 500034');
pos('Address','Address:\nNo. 45, 2nd Cross, Indiranagar,\nBengaluru 560038\nIndia\nThanks','No. 45, 2nd Cross, Indiranagar');
negs('Address','Location: Bengaluru','Bengaluru');
pos('Address','Our office is on MG Road.','MG Road');   // (v11.4.0) partial address
negs('Address','Floor: 3rd Floor','3rd Floor');
neg('Address','Address: 14, MG Road, Pune 411001','Address: 22, Brigade Road, Pune 411002','22, Brigade Road, Pune 411002');
pos('Address','Pincode: 560038','560038','Postal Code');   // (v11.4.0) a keyed PIN is a Postal Code, never an Address

/* ===================== BUSINESS NAME ===================== */
pos('Business Name','She works at Infosys Limited in Pune.','Infosys Limited');
pos('Business Name','Vendor: Zentrix Analytics Pvt Ltd','Zentrix Analytics Pvt Ltd');
pos('Business Name','Tata Consultancy Services won the contract.','Tata Consultancy Services');
pos('Business Name','Payment via Razorpay was successful.','Razorpay');
pos('Business Name','Ordered from Flipkart and Swiggy.','Flipkart');
pos('Business Name','Northwind Traders Pvt Ltd signed the NDA.','Northwind Traders Pvt Ltd');
neg('Business Name','She joined Accenture in 2019.','She joined Velmoratech in 2019.','Velmoratech');
neg('Business Name','Infosys Limited','Quanum Partners LLC','Quanum Partners LLC');
negs('Business Name','| Bank Name | AXIS BANK |','AXIS BANK');
negs('Business Name','Company Name: ','Company Name');
negs('Business Name','Deployed on Kubernetes with Docker and Node.js.','Kubernetes');
negs('Business Name','Entity type: C Corporation','C Corporation');
negs('Business Name','Repo: https://github.com/acme-demo/app','github');
negs('Business Name','Our Analytics team grew.','Analytics');
negs('Business Name','STRIPE_KEY=sk_live_51HxYzAbCdEfGhIjKlMn','STRIPE');
negs('Business Name','HDFC Bank, Koramangala Branch','HDFC Bank');

/* ===================== CONTACT NUMBER ===================== */
pos('Indian Mobile Number','Call 9876543210 now','9876543210');
pos('Indian Mobile Number','Mobile: +91 98450 12345','+91 98450 12345');
pos('Indian Mobile Number','Ph: +91-9811122233','+91-9811122233');
pos('Indian Mobile Number','WhatsApp 98200-11223','98200-11223');
pos('International Phone Number','Office: 080-2345 6789','080-2345 6789');
pos('Indian Mobile Number','{"mobile": "9123498765"}','9123498765');
pos('Indian Mobile Number','| 1042 | Kavya | 9845098450 |','9845098450');
neg('Indian Mobile Number','Call 9876543210','Call 9123456780','9123456780');
negs('Indian Mobile Number','Order 5876543210 shipped','5876543210');
negs('Indian Mobile Number','Timestamp 1698765432','1698765432');
not('Indian Mobile Number','Aadhaar: 4321 8765 2109','4321 8765 2109');
negs('Indian Mobile Number','Call 9999999999 for demo','9999999999');

/* ===================== CREDENTIALS ===================== */
pos('Credentials','Password - customerdelivery2@admin123!','customerdelivery2@admin123!');
pos('Credentials','PAN: ABCDE1234F','ABCDE1234F');
pos('Credentials','Aadhaar: 4321 8765 2109','4321 8765 2109');
pos('Credentials','IFSC: HDFC0001234','HDFC0001234');
pos('Credentials','UPI ID: rahul92@okhdfcbank','rahul92@okhdfcbank');
pos('Credentials','Your OTP is 482913.','482913');
pos('Credentials','CVV: 789','789');
pos('Credentials','Card Number: 4111 1111 1111 1111','4111 1111 1111 1111');
pos('Credentials','DB_PASSWORD=Xk9#mPq2!vL7','Xk9#mPq2!vL7');
pos('Credentials','AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE','AKIAIOSFODNN7EXAMPLE');
pos('Credentials','token: ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8','ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8');
pos('Credentials','{"_account_id": "243057143242"}','243057143242');
pos('Credentials','Voter ID: ABC1234567','ABC1234567');
pos('Credentials','UTR No: UTR2026011200123456','UTR2026011200123456');
neg('Credentials','Password - Xk9#mPq2!vL7','Password - Qe4$wRt8@zN1','Qe4$wRt8@zN1');
neg('Credentials','PAN: ABCDE1234F','PAN: QWERT5678Z','QWERT5678Z');
negs('Credentials','token: function(stream, state) {','function(stream');
negs('Credentials','password: hashPassword(input),','hashPassword(input');
negs('Credentials','apiKey: config.apiKey,','config.apiKey');
negs('Credentials','"password": "${DB_PASSWORD}"','${DB_PASSWORD}');
negs('Credentials','Enter your password to continue.','password');
negs('Credentials','Price 789 rupees','789');
negs('Credentials','{"account_id": "243057143242"}','account_id');

/* ===================== DATE ===================== */
pos('Date','DOB: 05-11-1988','05-11-1988');
pos('Date','Date of Birth: 14/08/1992','14/08/1992');
pos('Date','Born on 12 March 1990','12 March 1990');
pos('Date','{"date_of_birth": "1991-07-23"}','1991-07-23');
neg('Date','DOB: 05-11-1988','DOB: 17-02-1991','17-02-1991');
negs('Date','Statement Date: 12-01-2026 00:00:00','12-01-2026 00:00:00');
negs('Date','Joined: 22 Dec 2025 12:00 PM','22 Dec 2025 12:00 PM');
negs('Date','Invoice date 2025-11-02','2025-11-02');
negs('Date','Meeting on Monday','Monday');

/* ===================== EMAIL ===================== */
pos('Email Address','Mail priya.raghavan@northwind-demo.com','priya.raghavan@northwind-demo.com');
pos('Email Address','<support.team@acmecorp-demo.io>','support.team@acmecorp-demo.io');
pos('Email Address','{"email":"deepak.c@initech-demo.com"}','deepak.c@initech-demo.com');
pos('Email Address','mailto:hr@globex-demo.in','hr@globex-demo.in');
neg('Email Address','Contact: anita.desai@globex-demo.com','Contact: morvela.quint@globex-demo.com','morvela.quint@globex-demo.com');
negs('Email Address','Use icon@2x.png for retina','icon@2x.png');
negs('Email Address','npm i @angular/core','@angular/core');

/* ===================== IP ADDRESS ===================== */
pos('IP Address','Server 192.168.10.25 is down','192.168.10.25');
pos('IP Address','host=10.1.2.3:5432','10.1.2.3');
pos('IP Address','IPv6 2001:db8::1 assigned','2001:db8::1');
pos('IP Address','"last_login_ip": "203.0.113.45"','203.0.113.45');
pos('IP Address','DB_HOST=10.0.4.17','10.0.4.17');
neg('IP Address','Server 192.168.10.25','Server 172.16.9.99','172.16.9.99');
pos('IP Address','MAC 00:1A:2B:3C:4D:5E','00:1A:2B:3C:4D:5E');   // (v11.7.11) user rule: a MAC address is labeled IP Address
negs('IP Address','Upgrade to version 1.2.3.4','1.2.3.4');
negs('IP Address','Value 999.300.1.1 invalid','999.300.1.1');
negs('IP Address','Time 10:30:45','10:30:45');

/* ===================== OVERSCRUBBED ===================== */
posd('Overscrubbed','The Council Member approved it.','The Council Beagenhydra approved it.','Beagenhydra','Overscrubbed');
posd('Overscrubbed','for the end-client team','for the end-lyroranim team','lyroranim','Overscrubbed');
posd('Overscrubbed','"CreateDate": "2012-10-17"','"CreateDate": "hydragenzen-10-17"','hydragenzen','Overscrubbed');
posd('Overscrubbed','"region": "ap-northeast-2"','"region": "ap-terovawren-2"','terovawren','Overscrubbed');
posd('Overscrubbed','Provide a brief summary.','Galearwren a brief summary.','Galearwren','Overscrubbed');
posd('Overscrubbed','We toured Ireland last summer.','We toured Quelvaria last summer.','Quelvaria','Overscrubbed');
posd('Overscrubbed','Good communication skills in English','Good communication skills in Beaargale','Beaargale','Overscrubbed');
posd('Overscrubbed','API_KEY = "x"','BRYENA_STELWICK = "x"','BRYENA_STELWICK','Overscrubbed');
posd('Overscrubbed','## Project Timeline','## Project Zelvorine','Zelvorine','Overscrubbed');
posd('Overscrubbed','| v_1 | suvarna g | Batch Timing |\n| v_2 | DIVESH RAM | Batch Timing |\n| v_3 | ravi k | Class Related |','| v_1 | taverwyniel g | Batch Wrenanferiel |\n| v_2 | TAVOVANDO VELERIS | Batch Wrenanferiel |\n| v_3 | lomenrik k | Class Related |','Wrenanferiel','Overscrubbed');
neg('Overscrubbed','I met Furkan at the airport.','I met Dalvorin at the airport.','Dalvorin');
neg('Overscrubbed','She joined Accenture in 2019.','She joined Velmoratech in 2019.','Velmoratech');
neg('Overscrubbed','Address: Plot no. 13, Near Shanti Mandir, Sector 127, Noida 201304','Address: 937 Garnthwaite Road, Sector 127, Noida','Garnthwaite');
neg('Overscrubbed','See https://jira.acmecorp-demo.io/browse/OPS-12','See https://jira.velmoracorp.io/browse/OPS-12','velmoracorp');
neg('Overscrubbed','Password - Xk9#mPq2!vL7','Password - Qe4$wRt8@zN1','Qe4$wRt8@zN1');
neg('Overscrubbed','GSTIN 09AACCE2228F1ZY','GSTIN 17GSPPN8790HUZX','17GSPPN8790HUZX');
neg('Overscrubbed','Thanks, Rohan Kulkarni','Thanks, Rohan Velmarith','Velmarith');
neg('Overscrubbed','**Sanjo Shakvar:** Hello there','Kalavdarwen Orvisravira: Hello there','Orvisravira');
neg('Overscrubbed','token: function(stream, state) {','token: function(stream, state) {','function(stream');

/* ===================== PERSON NAME ===================== */
pos('Person Name','Hi Rahul Sharma, welcome aboard.','Rahul Sharma');
pos('Person Name','From: Priya Raghavan <p@x-demo.com>','Priya Raghavan');
pos('Person Name','Account Holder: Sneha Iyer','Sneha Iyer');
pos('Person Name','To: Arjun Mehta','Arjun Mehta');
pos('Person Name','[10:02] Meera Pillai: did you push?','Meera Pillai');
pos('Person Name','Reviewed by R. Krishnan today','R. Krishnan');
pos('Person Name','RAHUL VERMA\nSenior Data Analyst','RAHUL VERMA');
pos('Person Name','{"author": "srinadh"}','srinadh');
pos('Person Name','emp_id,full_name\n1042,Imran Shaikh','Imran Shaikh');
pos('Person Name','// TODO: ask Karthik about retry','Karthik');
posd('Person Name','Thanks, Rohan Kulkarni','Thanks, Rohan Velmarith','Rohan','Person Name');
neg('Person Name','I met Furkan at the airport.','I met Dalvorin at the airport.','Dalvorin');
negs('Person Name','Joining in June.','June');
negs('Person Name','Travel to India.','India');
negs('Person Name','India vs Pakistan final.','India vs Pakistan');
negs('Person Name','Languages: English, Bengali, Hindi','Bengali');
negs('Person Name','If the applicant is a potential member, verify.','potential member');
negs('Person Name','Measurement: Vernier Calipers and Screw Gauge','Vernier Calipers');
negs('Person Name','| 1 | Login Related | i am in touch |','Login Related');
negs('Person Name','public class UserService { HttpClient c; }','UserService');
negs('Person Name','Skills: Microsoft Office, Google Ads','Microsoft');
negs('Person Name','Apache Airflow and Looker Studio','Apache Airflow');
negs('Person Name','Mark the attendance','Mark');

/* ===================== URL/LINK ===================== */
pos('URL/Link','Docs: https://docs.acmecorp-demo.io/setup','https://docs.acmecorp-demo.io/setup');
pos('URL/Link','Read https://acmecorp-demo.io/policy.','https://acmecorp-demo.io/policy');
pos('URL/Link','LinkedIn: https://www.linkedin.com/in/rahul-verma-92','https://www.linkedin.com/in/rahul-verma-92');
pos('URL/Link','[guide](https://wiki.initech-demo.com/x?y=1)','https://wiki.initech-demo.com/x?y=1');
neg('URL/Link','See https://jira.acmecorp-demo.io/x','See https://jira.velmoracorp.io/x','https://jira.velmoracorp.io/x');
pos('URL/Link','Old: http://legacy.acmecorp-demo.io','http://legacy.acmecorp-demo.io');   // (v11.7.11) user rule: http links too
negs('URL/Link','Mirror: www.acmecorp-demo.io','www.acmecorp-demo.io');
negs('URL/Link','Example: https://example.com','https://example.com');
negs('URL/Link','Local: https://localhost:3000','https://localhost:3000');

/* ===================== PERSON USERNAME ===================== */
pos('Person Username','Ping @rahul_92 on Slack','@rahul_92');
pos('Person Username','Ask @priya.s in #ops','@priya.s');
pos('Person Username','Follow @meera_writes on X','@meera_writes');
neg('Person Username','Ping @rahul_92','Ping @kelvo_77','@kelvo_77');
negs('Person Username','@Override\npublic void run(){}','@Override');
negs('Person Username','@media (max-width: 600px)','@media');
negs('Person Username','import x from "@angular/core"','@angular/core');
negs('Person Username','"node_id": "MDY6Q29tbWl0MTIzNDU2"','MDY6Q29tbWl0MTIzNDU2');
negs('Person Username','mail ops@initech-demo.com','@initech-demo.com');

/* ===================== VEHICLE NUMBER PLATE ===================== */
pos('Vehicle Number Plate','Vehicle: KA 05 MN 4321','KA 05 MN 4321');
pos('Vehicle Number Plate','Car KA05MN4321 parked','KA05MN4321');
pos('Vehicle Number Plate','Bike DL 3C AB 1234','DL 3C AB 1234');
pos('Vehicle Number Plate','Truck MH-12-AB-9876','MH-12-AB-9876');
pos('Vehicle Number Plate','BH plate 22 BH 1234 AA','22 BH 1234 AA');
neg('Vehicle Number Plate','Vehicle: KA 05 MN 4321','Vehicle: MH 12 AB 9876','MH 12 AB 9876');
negs('Vehicle Number Plate','Plate: UT 28 EZ 6570','UT 28 EZ 6570');
negs('Vehicle Number Plate','Model AB 12 CD 3456 X','AB 12 CD 3456');
negs('Vehicle Number Plate','Ref KA 05 MN 43210','KA 05 MN 4321');


/* ===================== WAVE 2: harder contexts ===================== */
// Account Number
pos('Account Number','{"account_number": "50100234567891", "ifsc": "HDFC0001234"}','50100234567891');
pos('Account Number','Bank A/C: 3456789012345','3456789012345');
negs('Account Number','Account Number:','Account Number');
neg('Account Number','| Account No | 50100234567891 |','| Account No | 50100299999999 |','50100299999999');
// Address
pos('Address','| Address | 22, Linking Road, Bandra West, Mumbai 400050 |','22, Linking Road, Bandra West, Mumbai 400050');
pos('Address','Delivered to 5th Floor, Cyber Towers, HITEC City, Hyderabad 500081 yesterday','5th Floor, Cyber Towers, HITEC City, Hyderabad 500081');
negs('Address','Sector 127','Sector 127');
negs('Address','Mumbai, Delhi and Chennai offices','Mumbai, Delhi and Chennai');
// Business
pos('Business Name','| Vendor | Amount |\n| Zomato | 1,250 |\n| Uber | 640 |','Zomato');
pos('Business Name','Offer letter from Globex Software Solutions','Globex Software Solutions');
neg('Business Name','Offer letter from Globex Software Solutions','Offer letter from Velmora Nexus Solutions','Velmora Nexus Solutions');
negs('Business Name','The vendor list is attached.','vendor');
negs('Business Name','Use Cloud SQL and OAuth.','Cloud SQL');
negs('Business Name','[Insert company name]','Insert company name');
// Contact
pos('Indian Mobile Number','Contact: 09876543210','09876543210');
pos('Indian Mobile Number','tel:+919876543210','+919876543210');
negs('Indian Mobile Number','Amount 7000000000 INR','7000000000');
negs('Indian Mobile Number','ID 1234567890','1234567890');
// Credentials
pos('Credentials','Security answer - BlueHorizon','BlueHorizon');
pos('Credentials','MPIN: 4821','4821');
pos('Credentials','"client_secret": "a8F3kL9pQ2xZ7vB1nM4c"','a8F3kL9pQ2xZ7vB1nM4c');
pos('Credentials','Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
pos('Credentials','Expiry: 11/28','11/28');
not('Credentials','Valid till 11/28 per policy','11/28');
negs('Credentials','password reset link sent','reset');
pos('Credentials','PIN code: 560038','560038','Postal Code');   // (v11.4.0) not a credential: a Postal Code
negs('Credentials','OTP verification failed','verification');
// Date
pos('Date','| Name | DOB |\n| Ravi | 04/02/1995 |','04/02/1995');
pos('Date','Birth Date: 1985-12-30','1985-12-30');
negs('Date','DOB:','DOB');
negs('Date','Valid from 01/04/2025 to 31/03/2026','01/04/2025');
// Email
pos('Email Address','Emails: a.k@initech-demo.com, b.r@initech-demo.com','b.r@initech-demo.com');
negs('Email Address','user@localhost','user@localhost');
neg('Email Address','mail hr@globex-demo.in','mail hr@velmora-x.in','hr@velmora-x.in');
// IP
pos('IP Address','ssh admin@10.20.30.40','10.20.30.40');
pos('IP Address','allow from 172.31.255.254/32','172.31.255.254');
negs('IP Address','Score 3.5.2.1 points','3.5.2.1');
negs('IP Address','Phone 192.168 is not an IP','192.168');
// Overscrubbed
posd('Overscrubbed','Click the Submit button.','Click the Velorantix button.','Velorantix','Overscrubbed');
posd('Overscrubbed','"status": "active"','"status": "brennovik"','brennovik','Overscrubbed');
posd('Overscrubbed','Total Contributions for the year','Total Zorvanthel for the year','Zorvanthel','Overscrubbed');
posd('Overscrubbed','job-function/AmazonODB','job-beaexbright/AmazonODB','beaexbright','Overscrubbed');
neg('Overscrubbed','Meeting with Infosys Limited','Meeting with Quanum Partners LLC','Quanum Partners LLC');
neg('Overscrubbed','DOB: 05-11-1988','DOB: 17-02-1991','17-02-1991');
neg('Overscrubbed','Call 9876543210','Call 9123456780','9123456780');
neg('Overscrubbed','Mail anita@globex-demo.com','Mail morv@velmora.com','morv@velmora.com');
neg('Overscrubbed','Server 192.168.10.25','Server 172.16.9.99','172.16.9.99');
neg('Overscrubbed','Ping @rahul_92','Ping @kelvo_77','@kelvo_77');
neg('Overscrubbed','Vehicle: KA 05 MN 4321','Vehicle: MH 12 AB 9876','MH 12 AB 9876');
neg('Overscrubbed','Same text everywhere.','Same text everywhere.','Same');
// Person Name
pos('Person Name','Signed: Kavya Nair','Kavya Nair');
pos('Person Name','assigned to Naazia, Vinita and Shrusti','Vinita');
pos('Person Name','"full_name": "Deepak Choudhary"','Deepak Choudhary');
pos('Person Name','Mr. Suresh Kumar will join','Suresh Kumar');
negs('Person Name','Hope you are well.','Hope');
negs('Person Name','Grace period is 15 days.','Grace');
negs('Person Name','Patient Name:','Patient Name');
negs('Person Name','Dear Team,','Team');
negs('Person Name','Power BI dashboard','Power BI');
negs('Person Name','West Bengal Board','West Bengal');
// URL
pos('URL/Link','<a href="https://shop.globex-demo.in/cart">cart</a>','https://shop.globex-demo.in/cart');
pos('URL/Link','(https://drive.google.com/file/d/1AbC/view)','https://drive.google.com/file/d/1AbC/view');
negs('URL/Link','#footnote-1','#footnote-1');
// Username
pos('Person Username','cc @ananya.rao and @dev_k','@dev_k');
negs('Person Username','@media screen','@media');
negs('Person Username','@2x assets','@2x');
negs('Person Username','price @ 50','@');
// Vehicle
pos('Vehicle Number Plate','| Vehicle No | TN 09 BX 1234 |','TN 09 BX 1234');
pos('Vehicle Number Plate','Regn: OR02AB1234','OR02AB1234');
negs('Vehicle Number Plate','Part No: XY 12 ZZ 9999','XY 12 ZZ 9999');
negs('Vehicle Number Plate','Code AB12CD3456','AB12CD3456');

// ---------- run ----------
const byLabel={}; let failures=[];
for (const c of cases){
  let ts; try{ts=run(c.l,c.r)}catch(err){failures.push([c,'CRASH '+err.message]);continue}
  const hit=ts.find(x=>x.text===c.text);
  let ok, why='';
  if(c.kind==='POS'){ ok=!!hit && hit.label===c.want; if(!ok) why= hit?`got ${hit.label}`:'missing'; }
  else if(c.kind==='NOT'){ ok=!hit || hit.label!==c.label; if(!ok) why=`got ${hit.label}`; }
  else { ok=!hit; if(!ok) why=`got ${hit.label}`; }
  byLabel[c.label]=byLabel[c.label]||{pos:0,posOk:0,neg:0,negOk:0};
  const b=byLabel[c.label]; if(c.kind==='POS'){b.pos++; if(ok)b.posOk++;} else {b.neg++; if(ok)b.negOk++;}
  if(!ok) failures.push([c,why,ts]);
}
for (const [c,why,ts] of failures){ console.log(`✗ [${c.label}] ${c.kind} "${c.text}" — ${why}`); if(process.env.V&&ts) console.log('     all:',ts.map(x=>x.text+'→'+x.label).join(' | ')); }
console.log('\nLabel                 must-label   must-not-label');
let tp=0,tt=0;
for (const [k,b] of Object.entries(byLabel)){ console.log(`${k.padEnd(22)}${(b.posOk+'/'+b.pos).padEnd(13)}${b.negOk+'/'+b.neg}`); tp+=b.posOk+b.negOk; tt+=b.pos+b.neg; }
console.log(`\n${tp}/${tt} label checks correct`);
process.exit(failures.length?1:0);
