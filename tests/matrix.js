// Realistic mixed documents checked against GUIDELINES.md: every expected label present, nothing extra on listed texts.
// Deep rule matrix: realistic mixed documents. Each case: [name, left, right, mustHave[[text,label]], mustNotLabel[text]]
const {loadEngine}=require('./harness'); const e=loadEngine();
const run=(l,r)=>e.api.extractDynamicTargets({innerText:l},{innerText:r});
const C=[];
const same=(name,doc,must,mustNot=[])=>C.push([name,doc,doc,must,mustNot]);
const diff=(name,l,r,must,mustNot=[])=>C.push([name,l,r,must,mustNot]);

// ---------- Email / chat style ----------
same('email header identical',
`From: Priya Raghavan <priya.raghavan@northwind-demo.com>
To: Arjun Mehta <arjun.mehta@contoso-demo.in>
Date: Mon, 12 Jan 2026 10:15:00 +0530
Subject: Onboarding documents

Hi Arjun,

Please find the onboarding checklist attached. Call me on +91 98450 12345 if anything is unclear.

Regards,
Priya Raghavan
HR Manager, Northwind Traders Pvt Ltd`,
[['Priya Raghavan','Person Name'],['priya.raghavan@northwind-demo.com','Email Address'],['Arjun Mehta','Person Name'],['arjun.mehta@contoso-demo.in','Email Address'],['+91 98450 12345','Indian Mobile Number'],['Northwind Traders Pvt Ltd','Business Name']],
['Mon, 12 Jan 2026','HR Manager','Onboarding','Subject','Regards']);

diff('email header scrubbed',
`From: Priya Raghavan <priya.raghavan@northwind-demo.com>
Hi Arjun,
Call me on +91 98450 12345.
Regards,
Priya Raghavan
HR Manager, Northwind Traders Pvt Ltd`,
`From: Velmora Quistan <velmora.quistan@orbelune.com>
Hi Kaldren,
Call me on +91 91234 56789.
Regards,
Velmora Quistan
HR Manager, Quanum Partners LLC`,
[],['Velmora Quistan','Velmora','Quistan','velmora.quistan@orbelune.com','Kaldren','+91 91234 56789','Quanum Partners LLC','Quanum']);

diff('ordinary words scrubbed in email body',
`Please review the attached proposal before the meeting on Friday.`,
`Please review the attached zorvantel before the meeting on Friday.`,
[['zorvantel','Overscrubbed']],['Friday','Please']);

diff('partial name kept',
`Thanks, Rohan Kulkarni`,
`Thanks, Rohan Velmarith`,
[['Rohan','Person Name']],['Velmarith','Thanks']);

// ---------- Resume ----------
same('resume identical',
`RAHUL VERMA
Email: rahul.verma92@gmail.com | Phone: 9876543210
LinkedIn: https://www.linkedin.com/in/rahul-verma-92
Date of Birth: 14/08/1992
Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087

EXPERIENCE
Senior Data Analyst, Infosys Limited (2019 - Present)
- Built dashboards in Power BI for the finance team.`,
[['rahul.verma92@gmail.com','Email Address'],['9876543210','Indian Mobile Number'],['https://www.linkedin.com/in/rahul-verma-92','URL/Link'],['14/08/1992','Date']],
['EXPERIENCE','Senior Data Analyst','Power BI','2019','Present','finance']);

diff('resume scrubbed',
`RAHUL VERMA
Email: rahul.verma92@gmail.com | Phone: 9876543210
Date of Birth: 14/08/1992
Senior Data Analyst, Infosys Limited (2019 - Present)`,
`KELVAN ORSTEN
Email: kelvan.orsten@mailbox.org | Phone: 9123456780
Date of Birth: 02/03/1990
Senior Data Analyst, Brightwave Labs (2019 - Present)`,
[],['KELVAN ORSTEN','kelvan.orsten@mailbox.org','9123456780','02/03/1990','Brightwave Labs','Brightwave']);

// ---------- Credentials in config ----------
same('env file identical secrets',
`DB_HOST=10.0.4.17
DB_USER=admin
DB_PASSWORD=Xk9#mPq2!vL7
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STRIPE_KEY=sk_live_51HxYzAbCdEfGhIjKlMn`,
[['10.0.4.17','IP Address'],['Xk9#mPq2!vL7','Credentials'],['AKIAIOSFODNN7EXAMPLE','Credentials'],['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY','Credentials'],['sk_live_51HxYzAbCdEfGhIjKlMn','Credentials']],
['DB_HOST','DB_PASSWORD','AWS_ACCESS_KEY_ID','STRIPE_KEY']);

diff('env file secrets scrubbed',
`DB_PASSWORD=Xk9#mPq2!vL7
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`,
`DB_PASSWORD=Qe4$wRt8@zN1
AWS_ACCESS_KEY_ID=AKIAJ7QWERTYUIOP1234`,
[],['Qe4$wRt8@zN1','AKIAJ7QWERTYUIOP1234']);

same('json aws ids',
`{"_account_id": "243057143242", "PolicyId": "ANPAZKAPJZG4JKQ7XYZ12", "Arn": "arn:aws:iam::243057143242:policy/ReadOnly"}`,
[['243057143242','Credentials'],['ANPAZKAPJZG4JKQ7XYZ12','Credentials']],
['_account_id','PolicyId','Arn']);

same('code is not credentials',
`function login(user, password) {
  const token = await getToken(user);
  if (!password) return null;
  return { token: token, expires: 3600 };
}`,
[],['getToken(user','token','password','3600']);

// ---------- Indian IDs ----------
same('kyc identical',
`PAN: ABCDE1234F
Aadhaar: 4321 8765 2109
IFSC: HDFC0001234
UPI ID: rahul92@okhdfcbank
Vehicle: KA 05 MN 4321`,
[['ABCDE1234F','Credentials'],['4321 8765 2109','Credentials'],['HDFC0001234','Credentials'],['rahul92@okhdfcbank','Credentials'],['KA 05 MN 4321','Vehicle Number Plate']],
['PAN','Aadhaar','IFSC','Vehicle']);

diff('kyc scrubbed',
`PAN: ABCDE1234F
Vehicle: KA 05 MN 4321`,
`PAN: QWERT5678Z
Vehicle: MH 12 AB 9876`,
[],['QWERT5678Z','MH 12 AB 9876']);

same('invalid plate',`Plate: UT 28 EZ 6570`,[],['UT 28 EZ 6570']);

// ---------- Banking statement ----------
same('bank statement',
`Account Holder: Sneha Iyer
Account Number: 50100234567891
Bank: HDFC Bank, Koramangala Branch
Statement Date: 12-01-2026 00:00:00
Txn ID: UTR2026011200123456`,
[['Sneha Iyer','Person Name'],['50100234567891','Account Number']],
['HDFC Bank','12-01-2026 00:00:00','12-01-2026','Statement Date','Account Holder','Bank']);

// ---------- URLs ----------
same('urls',
`Docs: https://docs.acmecorp-demo.io/setup
Old: http://legacy.acmecorp-demo.io
Mirror: www.acmecorp-demo.io
Example: https://example.com`,
[['https://docs.acmecorp-demo.io/setup','URL/Link']],
['http://legacy.acmecorp-demo.io','www.acmecorp-demo.io','https://example.com']);

diff('url scrubbed',`See https://jira.acmecorp-demo.io/browse/OPS-12`,`See https://jira.velmoracorp.io/browse/OPS-12`,[],['velmoracorp','https://jira.velmoracorp.io/browse/OPS-12']);

// ---------- usernames, IPs ----------
same('handles and ips',
`Ping @rahul_92 on Slack. Server 192.168.10.25, IPv6 2001:db8::1, MAC 00:1A:2B:3C:4D:5E.
@Override
public void run() {}`,
[['@rahul_92','Person Username'],['192.168.10.25','IP Address'],['2001:db8::1','IP Address']],
['00:1A:2B:3C:4D:5E','@Override']);

// ---------- Overscrubbed canonical ----------
diff('council member',`The Council Member approved it.`,`The Council Beagenhydra approved it.`,[['Beagenhydra','Overscrubbed']],['Council']);
diff('end-client',`for the end-client team`,`for the end-lyroranim team`,[['lyroranim','Overscrubbed']],['end-lyroranim']);
diff('date to synthetic',`"CreateDate": "2012-10-17"`,`"CreateDate": "hydragenzen-10-17"`,[['hydragenzen','Overscrubbed']],['hydragenzen-10-17']);
diff('region',`"region": "ap-northeast-2"`,`"region": "ap-terovawren-2"`,[['terovawren','Overscrubbed']],['ap-terovawren-2']);
diff('place overscrub',`We toured Ireland last summer.`,`We toured Quelvaria last summer.`,[['Quelvaria','Overscrubbed']],[]);
diff('scrubbed name in prose',`I met Furkan at the airport.`,`I met Dalvorin at the airport.`,[],['Dalvorin']);
diff('company scrubbed in prose',`She joined Accenture in 2019.`,`She joined Velmoratech in 2019.`,[],['Velmoratech']);
diff('verb scrubbed',`Provide a brief summary.`,`Galearwren a brief summary.`,[['Galearwren','Overscrubbed']],[]);
diff('key renamed',`API_KEY = "sk_live_abc123XYZ789"`,`BRYENA_STELWICK = "sk_live_abc123XYZ789"`,[['BRYENA_STELWICK','Overscrubbed'],['sk_live_abc123XYZ789','Credentials']],[]);

// ---------- Business ----------
same('business identical prose',
`The contract between Tata Consultancy Services and Zentrix Analytics Pvt Ltd was signed in Pune.`,
[['Tata Consultancy Services','Business Name'],['Zentrix Analytics Pvt Ltd','Business Name']],['Pune','contract']);
same('business exclusions',
`| Bank Name | Company Name | Vendor |
| AXIS BANK | Database@AWS | C Corporation |
Hosted on Kubernetes with Docker.`,
[],['AXIS BANK','Bank Name','Company Name','Vendor','Database@AWS','C Corporation','Kubernetes','Docker']);

// ---------- Addresses ----------
same('single city not address',`Location: Bengaluru`,[],['Bengaluru']);

// ---------- Names ----------
same('months/places not names',`Joining in June. Travel to India. India vs Pakistan final.`,[],['June','India','India vs Pakistan']);
same('greeting',`Hi Rahul Sharma, welcome aboard.`,[['Rahul Sharma','Person Name']],['Hi Rahul Sharma']);
same('prose applicant',`If the applicant is a potential member, verify documents.`,[],['potential member','applicant']);
same('dob only dates',`Joined: 22 Dec 2025 12:00 PM\nDOB: 05-11-1988`,[['05-11-1988','Date']],['22 Dec 2025 12:00 PM','22 Dec 2025']);
diff('dob changed',`DOB: 05-11-1988`,`DOB: 17-02-1991`,[],['17-02-1991']);

// ---------- Round 2 ----------
same('csv employees',
`emp_id,full_name,email,phone,city
1042,Kavya Nair,kavya.nair@globex-demo.com,9845098450,Kochi
1043,Imran Shaikh,imran.shaikh@globex-demo.com,9123498765,Mumbai`,
[['Kavya Nair','Person Name'],['kavya.nair@globex-demo.com','Email Address'],['9845098450','Indian Mobile Number'],['Imran Shaikh','Person Name'],['9123498765','Indian Mobile Number']],
['emp_id','full_name','Kochi','Mumbai','1042']);

same('json users',
`[{"id": 77812, "name": "Deepak Choudhary", "email": "deepak.c@initech-demo.com", "mobile": "+91-9811122233", "last_login_ip": "203.0.113.45", "created_at": "2024-03-11T09:12:44Z"}]`,
[['Deepak Choudhary','Person Name'],['deepak.c@initech-demo.com','Email Address'],['+91-9811122233','Indian Mobile Number'],['203.0.113.45','IP Address']],
['77812','2024-03-11T09:12:44Z','created_at','last_login_ip']);

same('server log',
`2025-11-02 14:03:11 INFO  [auth] login ok user=ravi.k ip=172.16.4.21
2025-11-02 14:03:15 WARN  [db] slow query 1532ms host=10.1.2.3:5432
2025-11-02 14:03:20 ERROR [api] NullPointerException at OrderService.java:118 (build 4.2.1.7)`,
[['172.16.4.21','IP Address'],['10.1.2.3','IP Address']],
['2025-11-02 14:03:11','OrderService','NullPointerException','4.2.1.7','INFO','WARN']);

same('code identifiers not names',
`public class UserService {
  private final HttpClient httpClient;
  private final OrderRepository orderRepository;
  // TODO: ask Karthik about retry policy
}`,
[['Karthik','Person Name']],['UserService','HttpClient','OrderRepository','User Service']);

diff('several words overscrubbed in one sentence',
`The quarterly report shows strong growth in the northern region.`,
`The quarterly velmarish shows strong orbantel in the northern region.`,
[['velmarish','Overscrubbed'],['orbantel','Overscrubbed']],['quarterly','northern']);

diff('heading overscrub',`## Project Timeline`,`## Project Zelvorine`,[['Zelvorine','Overscrubbed']]);

diff('email partly scrubbed (domain kept)',
`Contact: anita.desai@globex-demo.com`,`Contact: morvela.quint@globex-demo.com`,[],['morvela.quint@globex-demo.com','globex-demo.com','morvela.quint']);

same('medical bill',
`Patient Name: Lakshmi Narayanan
Bill No: MB-2025-00981
Consultant Charges: Rs. 1,500
Hospital: Apollo Hospitals, Greams Road, Chennai 600006`,
[['Lakshmi Narayanan','Person Name']],
['Patient Name','MB-2025-00981','1,500','Rs. 1,500','Consultant Charges']);

same('chat transcript',
`[10:02] Meera Pillai: did you push the fix?
[10:03] Tarun Bose: yes, PR #482 is up
[10:04] Meera Pillai: thanks, reviewing now`,
[['Meera Pillai','Person Name'],['Tarun Bose','Person Name']],['PR #482','10:02','reviewing']);

same('phone formats',
`Office: 080-2345 6789
Mobile: +91 99001 22334
Alt: 99001-22335
Fax: 1800 425 1234
Ext: 4521`,
[['080-2345 6789','International Phone Number'],['+91 99001 22334','Indian Mobile Number'],['99001-22335','Indian Mobile Number']],['4521']);

same('version numbers are not IPs',`Upgrade from version 1.2.3.4 to v2.0.0.1 today.`,[],['1.2.3.4','2.0.0.1']);

same('slack mention vs email',`Ask @priya.s in #ops-team, or mail ops@initech-demo.com`,[['@priya.s','Person Username'],['ops@initech-demo.com','Email Address']],['#ops-team','@initech-demo.com']);


same('names lowercase in json name field',`{"author": "srinadh"}`,[['srinadh','Person Name']],[]);

same('company vs field label',`Company Name: Initech Software Pvt Ltd`,[['Initech Software Pvt Ltd','Business Name']],['Company Name']);


// ---------- Round 3 ----------
same('plates',`Car: KA05MN4321, Bike: DL 3C AB 1234, Truck: MH-12-AB-9876`,[['KA05MN4321','Vehicle Number Plate'],['DL 3C AB 1234','Vehicle Number Plate'],['MH-12-AB-9876','Vehicle Number Plate']]);
same('otp sms',`Your OTP is 482913. Do not share it.`,[['482913','Credentials']]);
same('card',`Card Number: 4111 1111 1111 1111\nExpiry: 11/28\nCVV: 789`,[['4111 1111 1111 1111','Credentials'],['11/28','Credentials'],['789','Credentials']]);
same('initials',`Reviewed by R. Krishnan and Anand K.`,[['R. Krishnan','Person Name']],[]);
same('caps name header',`RAHUL VERMA\nSenior Data Analyst`,[['RAHUL VERMA','Person Name']],['Senior Data Analyst']);
same('email angle',`Reply to <support.team@acmecorp-demo.io>.`,[['support.team@acmecorp-demo.io','Email Address']]);
same('url trailing dot',`Read https://acmecorp-demo.io/policy.`,[['https://acmecorp-demo.io/policy','URL/Link']]);
same('complete address one line',`Address: 221B, Baker Street, London NW1 6XE`,[],[]);
same('indian complete address',`Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087`,[['Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087','Address']]);
diff('number overscrub',`Total items: 42 boxes`,`Total items: 42 qelvorans`,[['qelvorans','Overscrubbed']]);
diff('name surname changed only',`Signed: Pooja Hegde`,`Signed: Pooja Varnoth`,[['Pooja','Person Name']],['Varnoth']);
same('whatsapp export',`12/03/25, 9:14 pm - Nikhil Joshi: reached?\n12/03/25, 9:15 pm - Ananya Rao: 5 min`,[['Nikhil Joshi','Person Name'],['Ananya Rao','Person Name']],['12/03/25','9:14 pm']);
same('signature block',`Best,\nKaran Malhotra\nProduct Lead | Initech Software Pvt Ltd\nM: +91 98200 11223`,[['Karan Malhotra','Person Name'],['Initech Software Pvt Ltd','Business Name'],['+91 98200 11223','Indian Mobile Number']],['Product Lead','Best']);


// ---------- Round 4: spreadsheet exports (support tickets, lecture list) ----------
{
  const S = require('./fixture_sheets');
  diff('ticket sheet', S.tickets.left, S.tickets.right,
    [['kalaivendhi','Person Name'],['purvan','Person Name'],['bournika.j','Person Name'],['Wrenanferiel','Overscrubbed'],['MAGEXCED','Overscrubbed'],['helixcryo','Overscrubbed'],['ionunedelt','Overscrubbed']],
    ['Login Related','Alerady Enrolment','taverwyniel','Taverwyniel','devivrenric','Veloneth','TAVOVANDO VELERIS','YARISIVO BRIGHTUNELUM','Terenlyr','Verejorove']);
  diff('lecture sheet', S.lectures.left, S.lectures.right,
    [['Veronced','Overscrubbed'],['Phinanael-Rysosmelira','Overscrubbed']],
    ['Vernier Calipers','Zaneltarane','Orbora Group','Screw Gauge']);
}


// ---------- Round 5: resume with skills / languages / education ----------
{
  const RS = require('./fixture_resume');
  diff('resume skills & languages', RS.r1.left, RS.r1.right,
    [['Zephancepol','Overscrubbed'],['Beaargale','Overscrubbed'],['Verorydelt','Overscrubbed'],['Magaveast','Overscrubbed']],
    ['Thoughtctrl Hindi','Bengali','Hindi','Hon','Microsoft','Google','Torgenflux']);
  same('languages are not names', `Languages: English, Bengali, Hindi, Tamil`, [], ['English','Bengali','Hindi','Tamil']);
}


// ---------- Round 6: code files (YAML permissions, Vue hidden inputs, PHP imports) ----------
same('yaml permissions are not credentials', "permissions:\n  contents: read\n  pages: write\n  id-token: write\n\njobs:\n  deploy:\n    environment:\n      name: github-pages", [], ['write','read','github','github-pages']);
same('html name attributes are not people', '<input type="hidden" name="CUST_ID" v-model="genChecksum.CUST_ID">\n<input type="hidden" name="WEBSITE" v-model="genChecksum.WEBSITE">\n<input type="hidden" name="CHECKSUMHASH" v-model="genChecksum.checksum">', [], ['WEBSITE','CHECKSUMHASH','CUST_ID']);
same('php imports', 'use App\\Http\\Controllers\\Controller;\nuse App\\Models\\Match;', [], ['Controller','Match']);


// ---------- Round 7: project notes table (brand + ordinary word, scrubbed dotted handles) ----------
{
  const MT = require('./fixture_meta');
  diff('project notes table', MT.left, MT.right, [['Meta','Business Name']], ['Meta token','Jordan.Miller','Morgan.Bennett','Casey.Wilson','Jamie.Parker','Alex','Taylor']);
}

// ---------- Run ----------
let fail=0, pass=0;
for (const [name,l,r,must,mustNot] of C) {
  let ts; try { ts=run(l,r);} catch(err){ console.log('CRASH',name,err.message); fail++; continue; }
  const probs=[];
  for (const [t,lab] of must) { const hit=ts.find(x=>x.text===t); if(!hit) probs.push(`MISSING ${lab}: "${t}"`); else if(hit.label!==lab) probs.push(`WRONG "${t}" got ${hit.label} want ${lab}`); }
  for (const t of mustNot) { const hit=ts.find(x=>x.text===t); if(hit) probs.push(`SHOULD NOT LABEL "${t}" (got ${hit.label})`); }
  if (probs.length){ fail++; console.log('✗',name); probs.forEach(p=>console.log('   ',p)); console.log('    all:',ts.map(x=>x.text+'→'+x.label).join(' | ')); } else pass++;
}
console.log(`\n${pass}/${pass+fail} realistic-document cases fully correct`);
process.exit(fail ? 1 : 0);
