// Per-label deep test suite. For every label: identical real values -> label; scrubbed -> no label;
// look-alikes -> never that label. Each case runs the full engine on a small document.
const path = require('path');
const { loadEngine } = require(path.join(__dirname, 'harness'));
const e = loadEngine();
const run = (l, r) => e.api.extractDynamicTargets({ innerText: l }, { innerText: r });
const S = {}; let cur = null;
const label = (n) => { cur = n; S[n] = []; };
const label2 = (n) => { cur = n; S[n] = S[n] || []; };
const yes = (doc, text, lab = cur, right = doc) => S[cur].push({ kind: 'yes', l: doc, r: right, text, lab });
const no = (doc, text, right = doc) => S[cur].push({ kind: 'no', l: doc, r: right, text });
const notAs = (doc, text, lab = cur, right = doc) => S[cur].push({ kind: 'notAs', l: doc, r: right, text, lab });

// ======================= ACCOUNT NUMBER =======================
label('Account Number');
yes('Account Number: 50100234567891', '50100234567891');
yes('A/c No: 001234567890123', '001234567890123');
yes('Acct No. 912010012345678', '912010012345678');
yes('Beneficiary account number - 3456 7890 1234 56', '3456 7890 1234 56');
yes('| Account No | IFSC |\n| 50200012345678 | HDFC0001234 |', '50200012345678', 'Account Number');
no('Account Number: 50100234567891', '50100234567891', 'Account Number: 50100998877665');
no('Account Number: 50100234567891', '50100998877665', 'Account Number: 50100998877665');
notAs('Order ID: 4102434713937455', '4102434713937455');
notAs('Ticket 4102649745602321 raised on 26/03/2026', '4102649745602321');
notAs('Total amount 150000000', '150000000');

// ======================= ADDRESS =======================
label('Address');
yes('Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087');
yes('Ship to: Plot no. 13, Near Shanti Mandir, Sector 127, Noida, Uttar Pradesh 201304', 'Plot no. 13, Near Shanti Mandir, Sector 127, Noida, Uttar Pradesh 201304');
yes('Office:\n12, MG Road,\nPune 411001\nIndia', 'Pune 411001');
no('Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', '45 Kelvin Street, Orbora Nagar, Bengaluru 560087', 'Address: 45 Kelvin Street, Orbora Nagar, Bengaluru 560087');
no('Plot no. 13, Near Shanti Mandir,\nSector 127, Noida,\nUttar Pradesh 201304', 'Sector 127, Noida', '937 Garnthwaite Road\nSector 127, Noida,\nUttar Pradesh');
notAs('Location: Bengaluru', 'Bengaluru');
notAs('Based in Pune and Mumbai', 'Pune');
yes('Meet at MG Road tomorrow', 'MG Road');   // (v11.4.0) a partial address (a street on its own) is an Address
notAs('Floor: 3rd Floor', '3rd Floor');

// ======================= BUSINESS NAME =======================
label('Business Name');
yes('She works at Tata Consultancy Services in Pune.', 'Tata Consultancy Services');
yes('Vendor: Zentrix Analytics Pvt Ltd', 'Zentrix Analytics Pvt Ltd');
yes('Invoice from Initech Software Pvt Ltd', 'Initech Software Pvt Ltd');
yes('Partnered with Flipkart and Swiggy for delivery.', 'Flipkart');
yes('Partnered with Flipkart and Swiggy for delivery.', 'Swiggy');
no('She joined Accenture in 2019.', 'Velmoratech', 'She joined Velmoratech in 2019.');
no('Vendor: Zentrix Analytics Pvt Ltd', 'Quanum Partners LLC', 'Vendor: Quanum Partners LLC');
notAs('| Bank Name | Company Name |\n| AXIS BANK | Vendor |', 'AXIS BANK');
notAs('| Bank Name | Company Name |', 'Company Name');
notAs('Deployed on Kubernetes with Docker.', 'Kubernetes');
notAs('Entity type: C Corporation', 'C Corporation');
notAs('See https://github.com/acme/tool', 'github');
notAs('Team: Analytics', 'Analytics');
notAs('STRIPE_KEY=sk_test_51HxYzAbCdEfGh', 'STRIPE');
notAs('Our Services and Solutions', 'Our Services');

// ======================= CONTACT NUMBER =======================
label('Indian Mobile Number');
yes('Call 9876543210 today', '9876543210');
yes('Mobile: +91 98450 12345', '+91 98450 12345');
yes('Mob: +91-9811122233', '+91-9811122233');
yes('Phone: 98450-12345', '98450-12345');
yes('Office: 080-2345 6789', '080-2345 6789', 'International Phone Number');
yes('Whatsapp 09845012345', '09845012345');
no('Call 9876543210 today', '9123456780', 'Call 9123456780 today');
notAs('Aadhaar: 4321 8765 2109', '4321 8765 2109');
notAs('Order 123456789012', '123456789012');
notAs('Timestamp 1712345678', '1712345678');
notAs('Amount Rs. 1,500', '1,500');
notAs('Ext: 4521', '4521');

// ======================= CREDENTIALS =======================
label('Credentials');
yes('Password - customerdelivery2@admin123!', 'customerdelivery2@admin123!');
yes('PAN: ABCDE1234F', 'ABCDE1234F');
yes('Aadhaar: 4321 8765 2109', '4321 8765 2109');
yes('IFSC: HDFC0001234', 'HDFC0001234');
yes('UPI ID: rahul92@okhdfcbank', 'rahul92@okhdfcbank');
yes('Your OTP is 482913.', '482913');
yes('CVV: 789', '789');
yes('Card Number: 4111 1111 1111 1111', '4111 1111 1111 1111');
yes('DB_PASSWORD=Xk9#mPq2!vL7', 'Xk9#mPq2!vL7');
yes('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE');
yes('token: ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8');
yes('{"_account_id": "243057143242"}', '243057143242');
yes('Security answer - BlueHorizon', 'BlueHorizon');
no('PAN: ABCDE1234F', 'QWERT5678Z', 'PAN: QWERT5678Z');
no('Password - customerdelivery2@admin123!', 'Qe4$wRt8@zN1', 'Password - Qe4$wRt8@zN1');
notAs('Password - customerdelivery2@admin123!', 'Password');
notAs('token: function(stream, state) {', 'function(stream');
notAs('const token = getToken(req);', 'getToken(req');
notAs('apiKey: config.apiKey,', 'config.apiKey');
notAs('"password": "${DB_PASSWORD}"', '${DB_PASSWORD}');
notAs('The pin code is required.', 'required');
notAs('Use 789 units', '789');
notAs('{"id": "26527fe0-1234-4abc-9def-001122334455"}', '26527fe0-1234-4abc-9def-001122334455');

// ======================= DATE =======================
label('Date');
yes('DOB: 05-11-1988', '05-11-1988');
yes('Date of Birth: 14/08/1992', '14/08/1992');
yes('Born on 12 March 1990', '12 March 1990');
yes('"date_of_birth": "1991-07-23"', '1991-07-23');
no('DOB: 05-11-1988', '17-02-1991', 'DOB: 17-02-1991');
notAs('Statement Date: 12-01-2026 00:00:00', '12-01-2026 00:00:00');
notAs('Statement Date: 12-01-2026', '12-01-2026');
notAs('Joined: 22 Dec 2025 12:00 PM', '22 Dec 2025');
notAs('Meeting on 14 March 2025', '14 March 2025');
notAs('created_at: 2024-03-11T09:12:44Z', '2024-03-11T09:12:44Z');

// ======================= EMAIL ADDRESS =======================
label('Email Address');
yes('Mail me at priya.raghavan@northwind-demo.com', 'priya.raghavan@northwind-demo.com');
yes('Reply to <support.team@acmecorp-demo.io>.', 'support.team@acmecorp-demo.io');
yes('"email": "deepak.c@initech-demo.com"', 'deepak.c@initech-demo.com');
yes('cc: ops@initech-demo.com, hr@initech-demo.com', 'hr@initech-demo.com');
no('Contact: anita.desai@globex-demo.com', 'morvela.quint@globex-demo.com', 'Contact: morvela.quint@globex-demo.com');
notAs('Logo: icon@2x.png', 'icon@2x.png');
notAs('import x from "@angular/core"', '@angular/core');
notAs('UPI ID: rahul92@okhdfcbank', 'rahul92@okhdfcbank');
// (v11.4.3) an apostrophe inside the name part is part of the address
yes("Mail sean.o'brien@initech-demo.com today", "sean.o'brien@initech-demo.com");
notAs("Mail sean.o'brien@initech-demo.com today", 'brien@initech-demo.com');
yes("He wrote 'priya@northwind-demo.com' twice", 'priya@northwind-demo.com');
// (v11.4.3) invalid addresses are not e-mails
notAs('Mail priya.@northwind-demo.com', 'priya.@northwind-demo.com');
notAs('Mail priya..r@northwind-demo.com', 'priya..r@northwind-demo.com');
notAs('Mail .priya@northwind-demo.com', '.priya@northwind-demo.com');
// (v11.4.3) placeholders: only fake domains are skipped; test@ / user@ on a real domain are e-mails
notAs('Mail priya@example.com', 'priya@example.com');
notAs('Mail someone@test.com', 'someone@test.com');
notAs('Mail anyone@domain.com', 'anyone@domain.com');
yes('Mail test@acmecorp-demo.io', 'test@acmecorp-demo.io');
yes('Mail user@acmecorp-demo.io', 'user@acmecorp-demo.io');
yes('Mail email@acmecorp-demo.io', 'email@acmecorp-demo.io');
yes('Mail sample@globex-demo.com', 'sample@globex-demo.com');
// (v11.4.3) an e-mail broken over two lines: each line's piece is labeled
const EW = 'Mail priya.raghavan@northwind-\ndemo.com today';
yes(EW, 'priya.raghavan@northwind-');
yes(EW, 'demo.com');
const EW2 = 'Mail priya.raghavan\n@northwind-demo.com today';
yes(EW2, 'priya.raghavan');
yes(EW2, '@northwind-demo.com');
yes('Mail priya.raghavan@northwind-demo.com today', 'demo.com', undefined, EW);   // wrapped only on the right
no(EW, 'demo.com', 'Mail priya.raghavan@velmora-\ndemo.com today');                // domain changed -> scrubbed
notAs('Ends priya.raghavan@northwind-demo.com\ndemo.com is a site', 'demo.com');  // already a whole e-mail: the next line is not part of it
// (v11.4.3) hidden addresses: only the person's name and the company name are labeled
const H1 = 'Mail priya.raghavan [at] northwind-demo [dot] com';
yes(H1, 'priya.raghavan', 'Person Name');
yes(H1, 'northwind-demo', 'Business Name');
notAs(H1, 'priya.raghavan [at] northwind-demo [dot] com');
const H2 = 'Mail priya(at)northwind-demo.com';
yes(H2, 'priya', 'Person Name');
yes(H2, 'northwind-demo', 'Business Name');
const H3 = 'Write to arjun.mehta at contoso-demo dot co dot in';
yes(H3, 'arjun.mehta', 'Person Name');
yes(H3, 'contoso-demo', 'Business Name');
const H4 = 'Mail support {at} initech-demo {dot} com';
yes(H4, 'initech-demo', 'Business Name');
notAs(H4, 'support', 'Person Name');                                               // a role word is not a person
const H5 = 'Mail rahul.verma [at] gmail [dot] com';
yes(H5, 'rahul.verma', 'Person Name');
notAs(H5, 'gmail', 'Business Name');                                               // a webmail provider is not the person's company
no('Mail priya.raghavan [at] northwind-demo [dot] com', 'northwind-demo', 'Mail zelvora.k [at] northwind-demo [dot] com');   // changed on the right -> nothing
notAs('We are available at acmecorp-demo.com for questions', 'available', 'Person Name');
notAs('Meet at office dot com later', 'office', 'Business Name');

// ======================= IP ADDRESS =======================
label('IP Address');
// (v11.4.5) a full stop after the address, both ends of a range
yes('Ping 8.8.8.8.', '8.8.8.8');
yes('Blocked 203.0.113.45, then retried.', '203.0.113.45');
yes('Range 10.0.0.1-10.0.0.50 reserved', '10.0.0.50');
yes('Range 10.0.0.1 - 10.0.0.50 reserved', '10.0.0.50');
// port and range suffix are not part of the label
yes('Connect to 10.0.0.12:8080 now', '10.0.0.12');
yes('Allow 10.0.0.0/16 only', '10.0.0.0');
// (v11.4.5) IPv6 forms
yes('Link fe80::1ff:fe23:4567:890a up', 'fe80::1ff:fe23:4567:890a');
yes('Link fe80::1ff:fe23:4567:890a%eth0 up', 'fe80::1ff:fe23:4567:890a');
yes('Mapped ::ffff:192.168.1.10 ok', '::ffff:192.168.1.10');
yes('Prefix 2001:db8::/32 owned', '2001:db8::');
yes('Addr 2001:db8:0:0:1:0:0:1 set', '2001:db8:0:0:1:0:0:1');
yes('Peer 2001:db8:85a3::8a2e:370:7334.', '2001:db8:85a3::8a2e:370:7334');
notAs('At 12:30:45 today', '12:30:45');
notAs('fp aa:bb:cc:dd:ee:ff:00:11:22:33', 'aa:bb:cc:dd:ee:ff:00:11');
notAs('MAC 00:1A:2B:3C:4D:5E here', '00:1A:2B:3C:4D:5E');
// (v11.4.5) a version word after the number
notAs('pkg 10.2.0.15 build', '10.2.0.15');
notAs('Upgrade to 4.18.0.2 release today', '4.18.0.2');
yes('Host 10.2.0.15 builds the site', '10.2.0.15');
yes('Server 192.168.10.25 is down', '192.168.10.25');
yes('login ok user=ravi ip=172.16.4.21', '172.16.4.21');
yes('"last_login_ip": "203.0.113.45"', '203.0.113.45');
yes('host=10.1.2.3:5432', '10.1.2.3');
yes('IPv6 2001:db8::1 configured', '2001:db8::1');
no('Server 192.168.10.25 is down', '10.99.88.77', 'Server 10.99.88.77 is down');
notAs('MAC 00:1A:2B:3C:4D:5E', '00:1A:2B:3C:4D:5E');
notAs('Upgrade to version 1.2.3.4', '1.2.3.4');
notAs('Score 999.999.999.999', '999.999.999.999');
notAs('Time 10:30:45', '10:30:45');

// ======================= OVERSCRUBBED =======================
label('Overscrubbed');
// (v11.4.4) a word joined by _ or written in camelCase: only the changed part
yes('def calculate_total(items):', 'zelvor', undefined, 'def calculate_zelvor(items):');
notAs('def calculate_total(items):', 'calculate_zelvor', undefined, 'def calculate_zelvor(items):');
yes('MAX_RETRY_COUNT = 5', 'VELMORA', undefined, 'MAX_VELMORA_COUNT = 5');
yes('const getUserProfile = 1;', 'Velmora', undefined, 'const getUserVelmora = 1;');
notAs('const getUserProfile = 1;', 'getUserVelmora', undefined, 'const getUserVelmora = 1;');
yes('class OrderService {}', 'Quarvin', undefined, 'class QuarvinService {}');
yes('let maxRetryCount = 3;', 'Zelvo', undefined, 'let maxZelvoCount = 3;');
// (v11.4.4) a value replaced by something of another kind is Overscrubbed; the same kind is correct redaction
yes('Order 12345 shipped', 'hello', undefined, 'Order hello shipped');
no('Order 12345 shipped', '00000', 'Order 00000 shipped');
no('Order 12345 shipped', '98765', 'Order 98765 shipped');
yes('Call 9876543210 today', 'quarvel', undefined, 'Call quarvel today');
no('Call 9876543210 today', '9123456780', 'Call 9123456780 today');
yes('Mail priya@northwind-demo.com today', 'velmorine', undefined, 'Mail velmorine today');
no('Mail priya@northwind-demo.com today', 'zelvor@quellan-demo.com', 'Mail zelvor@quellan-demo.com today');
no('I met Hemant at the airport.', 'Alex', 'I met Alex at the airport.');
no('Ask the Member first.', 'Manager', 'Ask the Manager first.');
// (v11.4.4) a changed ordinary date is Overscrubbed (only a date of birth may be scrubbed): the changed part
yes('Meeting on 12 March 2025', '19 April', undefined, 'Meeting on 19 April 2025');
yes('Invoice date: 12-03-2025', '19-04', undefined, 'Invoice date: 19-04-2025');
yes('Released 2024-10-15 to all', '2023-07-02', undefined, 'Released 2023-07-02 to all');
yes('Due on March 12, 2025.', 'April 19', undefined, 'Due on April 19, 2025.');
no('DOB: 05-11-1988', '17-02-1991', 'DOB: 17-02-1991');
no('Date of Birth: 12 March 1990', '19 April', 'Date of Birth: 19 April 1990');
// (v11.4.4) an added word is Overscrubbed
yes('the report is ready', 'final', undefined, 'the final report is ready');
yes('The Council Member approved it.', 'Beagenhydra', undefined, 'The Council Beagenhydra approved it.');
yes('for the end-client team', 'lyroranim', undefined, 'for the end-lyroranim team');
yes('"CreateDate": "2012-10-17"', 'hydragenzen', undefined, '"CreateDate": "hydragenzen-10-17"');
yes('"region": "ap-northeast-2"', 'terovawren', undefined, '"region": "ap-terovawren-2"');
yes('Provide a brief summary.', 'Galearwren', undefined, 'Galearwren a brief summary.');
yes('We toured Ireland last summer.', 'Quelvaria', undefined, 'We toured Quelvaria last summer.');
yes('Good communication skills in English', 'Beaargale', undefined, 'Good communication skills in Beaargale');
yes('API_KEY = "sk_live_abc123XYZ789"', 'BRYENA_STELWICK', undefined, 'BRYENA_STELWICK = "sk_live_abc123XYZ789"');
yes('| TECHNICAL ERROR STUDENT CAN SEE |', 'MAGEXCED', undefined, '| TECHNICAL ERROR MAGEXCED CAN SEE |');
no('I met Furkan at the airport.', 'Dalvorin', 'I met Dalvorin at the airport.');
no('She joined Accenture in 2019.', 'Velmoratech', 'She joined Velmoratech in 2019.');
no('Thanks, Rohan Kulkarni', 'Velmarith', 'Thanks, Rohan Velmarith');
no('PAN: ABCDE1234F', 'QWERT5678Z', 'PAN: QWERT5678Z');
no('See https://jira.acmecorp-demo.io/browse/OPS-12', 'velmoracorp', 'See https://jira.velmoracorp.io/browse/OPS-12');
no('DOB: 05-11-1988', '17-02-1991', 'DOB: 17-02-1991');
no('Plot no. 13, Near Shanti Mandir, Noida 201304', 'Garnthwaite', '937 Garnthwaite Road, Noida 201304');
no('GSTIN 09AACCN2228F1ZY', '17GSPPN8790HUZX', 'GSTIN 17GSPPN8790HUZX');
no('Contact: anita.desai@globex-demo.com', 'morvela.quint@globex-demo.com', 'Contact: morvela.quint@globex-demo.com');
no('Call 9876543210 today', '9123456780', 'Call 9123456780 today');
no('| id | name | issue |\n| 1 | suvarna g | late |\n| 2 | DIVESH RAMAN | late |\n| 3 | purvan mallick | late |', 'taverwyniel', '| id | name | issue |\n| 1 | taverwyniel g | late |\n| 2 | TAVOVANDO VELERIS | late |\n| 3 | purvan devivrenric | late |');
notAs('Same text on both sides.', 'Same');

// ======================= PERSON NAME =======================
label('Person Name');
yes('Hi Rahul Sharma, welcome aboard.', 'Rahul Sharma');
yes('From: Priya Raghavan <p@x-demo.com>', 'Priya Raghavan');
yes('To: Arjun Mehta', 'Arjun Mehta');
yes('Account Holder: Sneha Iyer\nBranch: Koramangala', 'Sneha Iyer');
yes('emp,full_name\n1042,Imran Shaikh', 'Imran Shaikh');
yes('Reviewed by R. Krishnan', 'R. Krishnan');
yes('RAHUL VERMA\nSenior Data Analyst', 'RAHUL VERMA');
yes('{"author": "srinadh"}', 'srinadh');
yes('[10:02] Meera Pillai: did you push the fix?', 'Meera Pillai');
yes('// TODO: ask Karthik about retry', 'Karthik');
yes('Thanks, Rohan Kulkarni', 'Rohan', undefined, 'Thanks, Rohan Velmarith');
no('I met Furkan at the airport.', 'Dalvorin', 'I met Dalvorin at the airport.');
notAs('Joining in June.', 'June');
notAs('Travel to India.', 'India');
notAs('India vs Pakistan final', 'India vs Pakistan');
notAs('If the applicant is a potential member, verify.', 'potential member');
notAs('Hi Rahul Sharma, welcome.', 'Hi Rahul Sharma');
notAs('Languages: English, Bengali, Hindi', 'Bengali');
notAs('Measure with Vernier Calipers and Screw Gauge', 'Vernier Calipers');
notAs('i am in touch | Login Related |', 'Login Related');
notAs('public class UserService { HttpClient client; }', 'UserService');
notAs('Well versed with Microsoft Office and Google Ad Words', 'Microsoft');
notAs('B.Sc (Hon): 2019', 'Hon');
notAs('Hosted on Looker Studio and Apache Airflow', 'Looker Studio');
notAs('Patient Name: ', 'Patient Name');

// ======================= URL / LINK =======================
label('URL/Link');
yes('Docs: https://docs.acmecorp-demo.io/setup', 'https://docs.acmecorp-demo.io/setup');
yes('Read https://acmecorp-demo.io/policy.', 'https://acmecorp-demo.io/policy');
yes('Profile: https://www.linkedin.com/in/rahul-verma-92', 'https://www.linkedin.com/in/rahul-verma-92');
yes('[guide](https://wiki.initech-demo.com/x/y?a=1)', 'https://wiki.initech-demo.com/x/y?a=1');
no('See https://jira.acmecorp-demo.io/browse/OPS-12', 'https://jira.velmoracorp.io/browse/OPS-12', 'See https://jira.velmoracorp.io/browse/OPS-12');
notAs('Old: http://legacy.acmecorp-demo.io', 'http://legacy.acmecorp-demo.io');
notAs('Mirror: www.acmecorp-demo.io', 'www.acmecorp-demo.io');
notAs('Example: https://example.com', 'https://example.com');
notAs('Local: https://localhost:3000', 'https://localhost:3000');
// (v11.3.5) links wrapped over several lines (PDF text): every line's piece is labeled; the left may be wrapped differently
yes('Open https://acmecorp-demo.io/very/long/\npath/to/page now', 'https://acmecorp-demo.io/very/long/');
yes('Open https://acmecorp-demo.io/very/long/\npath/to/page now', 'path/to/page');
yes('Open\nhttps://acmecorp-demo.io/docs/\napi/v2/users\nnow', 'api/v2/users');
yes('Go https://acmecorp-demo.io/a/\n\nb/c/page ok', 'b/c/page');
yes('Go https://acmecorp-demo.io/search\n?q=abc&page=2 ok', '?q=abc&page=2');
yes('Go https://acmecorp-demo.io/my-long-\npage-name/x ok', 'page-name/x');
yes('Go https://acmecorp-demo.io/a/b/c/page ok', 'https://acmecorp-demo.io/a/b/c/page');                                           // control: not wrapped
yes('Go https://acmecorp-demo.io/a/b/c/page ok', 'b/c/page', undefined, 'Go https://acmecorp-demo.io/a/\nb/c/page ok');           // wrapped only on the right
yes('Go https://acmecorp-demo.io/a/\nb/c/page ok', 'https://acmecorp-demo.io/a/b/c/page', undefined, 'Go https://acmecorp-demo.io/a/b/c/page ok'); // wrapped only on the left
no('Go https://acmecorp-demo.io/a/\nb/c/page ok', 'b/c/page', 'Go https://velmora.io/a/\nb/c/page ok');                            // domain scrubbed -> no label
notAs('Home https://acmecorp-demo.io/\nand/or more', 'and/or');
notAs('Home https://acmecorp-demo.io/\nand more text here', 'and');
notAs('Due 12/03\nhttps://acmecorp-demo.io/x', '12/03');
// (v11.3.5) brackets that belong to the link stay in it; brackets around the link do not
yes('Film https://en.wikipedia.org/wiki/Heat_(film) ok', 'https://en.wikipedia.org/wiki/Heat_(film)');
yes('Film https://en.wikipedia.org/wiki/Heat_(film).', 'https://en.wikipedia.org/wiki/Heat_(film)');
yes('[x](https://en.wikipedia.org/wiki/Heat_(film))', 'https://en.wikipedia.org/wiki/Heat_(film)');
yes('(see https://acmecorp-demo.io/page)', 'https://acmecorp-demo.io/page');
yes('see [https://acmecorp-demo.io/page] ok', 'https://acmecorp-demo.io/page');
yes('see **https://acmecorp-demo.io/page** ok', 'https://acmecorp-demo.io/page');
yes('Go https://[2001:db8::1]/admin ok', 'https://[2001:db8::1]/admin');
// (v11.3.5) one label per link: an e-mail / IP address inside a labeled link is not a second label
notAs('Clone https://user:pass@git.acmecorp-demo.io/repo.git', 'pass@git.acmecorp-demo.io', 'Email Address');
notAs('Panel: https://203.0.113.45/admin', '203.0.113.45', 'IP Address');
yes('Server 203.0.113.45 and https://203.0.113.45/admin', '203.0.113.45', 'IP Address');   // the same IP outside a link is still an IP
yes('Mail pass@git.acmecorp-demo.io and https://user:pass@git.acmecorp-demo.io/r.git', 'pass@git.acmecorp-demo.io', 'Email Address');

// (v11.4.1) links wrapped anywhere: mid-word, before ".io", inside a query; each line's piece is labeled
const W1 = 'See https://docs.acmecorp-demo.io/guides/inst\nallation-steps for details';
yes(W1, 'https://docs.acmecorp-demo.io/guides/inst');
yes(W1, 'allation-steps');
const W2 = 'See https://docs.acmecorp-demo.io/guides/\ninstallation-steps for details';
yes(W2, 'installation-steps');
const W3 = 'See https://docs.acmecorp-demo\n.io/guides/setup now';
yes(W3, 'https://docs.acmecorp-demo');
yes(W3, '.io/guides/setup');
const W4 = 'Link: https://acmecorp-demo.io/reports/2024/q3-summary?ref=ema\nil&id=42';
yes(W4, 'il&id=42');
const W5 = 'https://github.com/acmecorp-demo/very-long-repository-na\nme/blob/main/README';
yes(W5, 'me/blob/main/README');
const W6 = 'Ref https://acmecorp-demo.io/a/b/c/\nd/e/f/\ng/h/page end';
yes(W6, 'd/e/f/');
yes(W6, 'g/h/page');
yes('Ref https://acmecorp-demo.io/a/b/c/page end', 'page', undefined, 'Ref https://acmecorp-demo.io/a/b/c/\npage end');   // a plain word: joined when the left has the link on one line
no('See https://docs.acmecorp-demo.io/guides/inst\nallation-steps', 'allation-steps', 'See https://docs.velmora-demo.io/guides/inst\nallation-steps');   // domain scrubbed
// a new line that is NOT the rest of the link
notAs('Docs: https://acmecorp-demo.io/setup\nInstall the CLI first.', 'Install');
notAs('See https://acmecorp-demo.io/docs\nand then run it', 'and');
notAs('See https://acmecorp-demo.io/docs\ne.g. the setup page', 'e.g.');
notAs('Links:\nhttps://acmecorp-demo.io/docs\n- second item here', '-');
notAs('Steps https://acmecorp-demo.io/docs\n2. run the build', '2.');
notAs('Read https://acmecorp-demo.io/docs\n(optional) later', '(optional)');
// (v11.4.1) links to files are not labeled (styles, scripts, images, fonts, archives, documents, media, data, code)
for (const ext of ['css', 'js', 'mjs', 'map', 'wasm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp', 'avif', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'tgz', 'tar', 'gz', 'zip', '7z', 'rar', 'bz2', 'xz', 'whl', 'jar', 'war', 'deb', 'rpm', 'apk', 'exe', 'msi', 'dmg', 'pkg',
  'mp3', 'wav', 'mp4', 'mov', 'avi', 'webm',
  'json', 'xml', 'yaml', 'yml', 'lock', 'py', 'java', 'ts', 'go', 'sh']) {
  notAs(`File https://cdn.acmecorp-demo.io/assets/file-v2.${ext} here`, `https://cdn.acmecorp-demo.io/assets/file-v2.${ext}`);
}
// (v11.4.2) documents may hold personal data, so links to them ARE labeled
for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'md']) {
  yes(`File https://cdn.acmecorp-demo.io/assets/file-v2.${ext} here`, `https://cdn.acmecorp-demo.io/assets/file-v2.${ext}`);
}
yes('Doc https://acmecorp-demo.io/files/report.pdf?v=2', 'https://acmecorp-demo.io/files/report.pdf?v=2');
yes('Img https://acmecorp-demo.io/hr/very/long/\nsalaries-2024.xlsx here', 'salaries-2024.xlsx');
// (v11.4.2) Google Drive / Docs / Sheets / Slides / Forms links are labeled, also when wrapped inside the document id
const G = {
  sheet: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0',
  doc: 'https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/edit?usp=sharing',
  slides: 'https://docs.google.com/presentation/d/1QwErTyUiOpAsDfGhJkLzXcVbNm0123456789/edit',
  form: 'https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGh123456/viewform',
  file: 'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345/view?usp=sharing',
  folder: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
  open: 'https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
  download: 'https://drive.google.com/uc?export=download&id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
};
for (const u of Object.values(G)) {
  yes(`Shared: ${u} today`, u);
  yes(`See [the file](${u}) now`, u);
  yes(`| Doc | ${u} |`, u);
  yes(`{"url": "${u}"}`, u);
}
no(`Shared: ${G.sheet} today`, G.sheet.replace('1AbCdEf', '9QzXwVu'), `Shared: ${G.sheet.replace('1AbCdEf', '9QzXwVu')} today`);   // id changed -> scrubbed
const GW = 'Budget sheet: https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn\nOpQrStUvWxYz0123456789\n/edit#gid=0 thanks';
yes(GW, 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn');
yes(GW, 'OpQrStUvWxYz0123456789');
yes(GW, '/edit#gid=0');
notAs('Logo https://acmecorp-demo.io/static/LOGO.PNG#top', 'https://acmecorp-demo.io/static/LOGO.PNG#top');
notAs('Get https://acmecorp-demo.io/dist/app-1.2.3.tar.gz now', 'https://acmecorp-demo.io/dist/app-1.2.3.tar.gz');
notAs('Img https://acmecorp-demo.io/img/very/long/\nphoto.jpg here', 'photo.jpg');
notAs('Img https://acmecorp-demo.io/img/very/long/\nphoto.jpg here', 'https://acmecorp-demo.io/img/very/long/');
// pages are still links, also when they look like a file name or have a dot in the path
yes('Page https://acmecorp-demo.io/about.html', 'https://acmecorp-demo.io/about.html');
yes('Page https://acmecorp-demo.io/index.php?id=4', 'https://acmecorp-demo.io/index.php?id=4');
yes('Repo https://github.com/acmecorp-demo/tool.js', 'https://github.com/acmecorp-demo/tool.js');
yes('Site https://docs.acmecorp-demo.io', 'https://docs.acmecorp-demo.io');
yes('Pkg https://acmecorp-demo.io/v1.2/download', 'https://acmecorp-demo.io/v1.2/download');
yes('Mail https://acmecorp-demo.io/r?file=a.pdf', 'https://acmecorp-demo.io/r?file=a.pdf');

// ======================= PERSON USERNAME =======================
label('Person Username');
yes('Ping @rahul_92 on Slack', '@rahul_92');
yes('Ask @priya.s in #ops', '@priya.s');
yes('Follow @meera_writes', '@meera_writes');
no('Ping @rahul_92 on Slack', '@velmor_17', 'Ping @velmor_17 on Slack');
notAs('@Override\npublic void run() {}', '@Override');
notAs('@media (max-width: 600px) {}', '@media');
notAs('import "@angular/core";', '@angular/core');
notAs('mail ops@initech-demo.com', '@initech-demo.com');
notAs('"node_id": "MDY6Q29tbWl0MTIzNDU2"', 'MDY6Q29tbWl0MTIzNDU2');
notAs('commit 9fceb02d0ae598e95dc970b74767f19372d61af8', '9fceb02d0ae598e95dc970b74767f19372d61af8');

// ======================= VEHICLE NUMBER PLATE =======================
label('Vehicle Number Plate');
yes('Car: KA 05 MN 4321', 'KA 05 MN 4321');
yes('Car: KA05MN4321', 'KA05MN4321');
yes('Bike: DL 3C AB 1234', 'DL 3C AB 1234');
yes('Truck: MH-12-AB-9876', 'MH-12-AB-9876');
yes('New BH plate: 22 BH 1234 AA', '22 BH 1234 AA');
yes('Old plate OR 02 AB 1234', 'OR 02 AB 1234');
no('Car: KA 05 MN 4321', 'MH 12 AB 9876', 'Car: MH 12 AB 9876');
notAs('Plate: UT 28 EZ 6570', 'UT 28 EZ 6570');
notAs('Model AB 12 CD 3456 is a part code', 'AB 12 CD 3456');
notAs('PAN: ABCDE1234F', 'ABCDE1234F');


// ======================= WAVE 2: harder, mixed-format cases =======================
label2('Account Number');
yes('{"account_number": "001234567890123", "ifsc": "SBIN0001234"}', '001234567890123');
yes('acc_no,name\n50100234567891,Kavya Nair', '50100234567891', 'Account Number');
notAs('Contact 9876543210', '9876543210');
label2('Address');
yes('Registered Office: No. 45, 2nd Cross, Indiranagar, Bengaluru, Karnataka 560038', 'No. 45, 2nd Cross, Indiranagar, Bengaluru, Karnataka 560038');
notAs('Visit Koramangala this weekend', 'Koramangala');
notAs('Sector 5 meeting room', 'Sector 5');
label2('Business Name');
yes('Offer letter from Infosys Limited dated 1 May', 'Infosys Limited');
yes('Client: Mahindra & Mahindra Ltd', 'Mahindra & Mahindra Ltd');
notAs('Paid via HDFC Bank NEFT', 'HDFC Bank');
notAs('Built with Node.js and React', 'Node.js');
notAs('Our Partners', 'Our Partners');
label2('Indian Mobile Number');
yes('{"mobile": "9811122233"}', '9811122233');
yes('ph: 98201-11223 / 98201-11224', '98201-11224');
notAs('Card Number: 4111 1111 1111 1111', '4111 1111 1111');
notAs('PIN: 560087', '560087');
label2('Credentials');
yes('"password": "Tr0ub4dor&3"', 'Tr0ub4dor&3');
yes('Voter ID: ABC1234567', 'ABC1234567');
yes('Expiry: 11/28', '11/28');
yes('SLACK_TOKEN=xoxb-1234567890-abcdefghij', 'xoxb-1234567890-abcdefghij');
notAs('Password must be 8 characters', 'must');
notAs('Enter your OTP below', 'below');
notAs('PIN: 560087 (area pin code)', 'area');
label2('Date');
yes('D.O.B: 03/04/1995', '03/04/1995');
yes('| Name | DOB |\n| Kavya | 21-09-1996 |', '21-09-1996');
notAs('Invoice Date: 03/04/2025', '03/04/2025');
label2('Email Address');
yes('Write to kavya.nair+jobs@globex-demo.com', 'kavya.nair+jobs@globex-demo.com');
notAs('Version pkg@1.2.3', 'pkg@1.2.3');
notAs('git@github.com:acme/tool.git', 'git@github.com');
label2('IP Address');
yes('Allowed: 10.0.0.1, 10.0.0.2', '10.0.0.2');
notAs('Price 1.25.30.40 kg', '1.25.30.40');
notAs('Section 3.2.1.4 of the policy', '3.2.1.4');
label2('Overscrubbed');
yes('Server alpha is down', '10.1.2.3', undefined, 'Server 10.1.2.3 is down');   // (v11.4.5) a word replaced by an IP address
yes('Monthly report attached.', 'velmarish', undefined, 'Monthly velmarish attached.');
yes('## Project Timeline', 'Zelvorine', undefined, '## Project Zelvorine');
yes('| Status | Resolved |', 'Quellanor', undefined, '| Status | Quellanor |');
no('Signed: Pooja Hegde', 'Varnoth', 'Signed: Pooja Varnoth');
no('Invited Arun Kalvari, Mira Tolle, Devan Roshi', 'Brevothan', 'Invited Zorilan Kalvari, Brevothan Quelmira, Ostravin Delnaris');
no('Aadhaar: 4321 8765 2109', '9988 7766 5544', 'Aadhaar: 9988 7766 5544');
no('Server 192.168.10.25', '10.99.88.77', 'Server 10.99.88.77');
no('Car: KA 05 MN 4321', 'MH 12 AB 9876', 'Car: MH 12 AB 9876');
label2('Person Name');
yes('Signed: Pooja Hegde', 'Pooja Hegde');
yes('Ms. Kavya Nair joined today', 'Kavya Nair');
yes('Assignee: Divya Menon', 'Divya Menon');
notAs('Good Morning Team', 'Good Morning');
notAs('Login Page Redesign', 'Login Page');
notAs('Tamil Nadu State Board', 'Tamil Nadu');
notAs('New Delhi office', 'New Delhi');
notAs('Grace period of 30 days', 'Grace');
label2('URL/Link');
yes('See <https://status.acmecorp-demo.io>', 'https://status.acmecorp-demo.io');
notAs('Email kavya@globex-demo.com', 'kavya@globex-demo.com');
label2('Person Username');
yes('cc @kavya.nair and @divya_m', '@divya_m');
notAs('Price @ 500 per unit', '@ 500');
notAs('@SpringBootApplication', '@SpringBootApplication');
label2('Vehicle Number Plate');
yes('| Vehicle | Owner |\n| TN 09 BX 4455 | Kavya |', 'TN 09 BX 4455');
notAs('Room KA 05 MN', 'KA 05 MN');
notAs('IFSC: HDFC0001234', 'HDFC0001234');

// ======================= RUN =======================
let total = 0, failed = 0; const report = [];
for (const [lab, cases] of Object.entries(S)) {
  let ok = 0; const fails = [];
  for (const c of cases) {
    total++;
    let ts; try { ts = run(c.l, c.r); } catch (err) { fails.push(`CRASH ${err.message}`); failed++; continue; }
    const hit = ts.find(t => t.text === c.text);
    let good;
    if (c.kind === 'yes') good = hit && hit.label === c.lab;
    else if (c.kind === 'no') good = !hit;
    else good = !hit || hit.label !== c.lab;
    if (good) ok++; else { failed++; fails.push(`${c.kind.toUpperCase()} "${c.text}" in ${JSON.stringify(c.r).slice(0, 90)} -> got ${hit ? hit.label : 'nothing'}`); }
  }
  report.push({ lab, ok, n: cases.length });
  console.log(`${fails.length ? '✗' : '✓'} ${lab}: ${ok}/${cases.length}`);
  for (const f of fails) console.log('     ' + f);
}
console.log(`\n${total - failed}/${total} label checks passed`);
module.exports = report;
if (require.main === module) process.exit(failed ? 1 : 0);
