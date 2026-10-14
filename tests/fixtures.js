// All fixtures use synthetic data. No real people, phone numbers, keys or companies.
module.exports.creds = `
1. Bank branch: HDFC0001234
2. Income tax: ABCDE1234F
3. Secret key: sk-proj-1234567890abcdef12345678
4. Password: "password": "superSecretPassword123"
5. Aadhar: 1234 5678 9012 and 987654321098
6. Driving license: DL14 20110012345
7. Voter ID: WBF1234567
8. Credit card: 4532 1234 5678 9012, "cvv": "789", "expiry": "11/28"
9. UPI: payuser@okhdfcbank
10. Tx ID: 0x3a7b1c4e9d0f2a5b8c6e1d4f7a0b3c5e
11. Invocation ID: c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a
12. SHA hash: 0123456789abcdef0123456789abcdef01234567
13. VPC ID: vpc-0a1b2c3d4e5f67890
14. Card ID: card_1J4iOz2eZvKYlo2CSm3W4w8G
15. Account ID: "_account_id": "111122223333", "PolicyId": "ANPAEXAMPLEID2345678"
`;

module.exports.p158 = {
  left: `["arn:aws:odb:*:*:exadb-vm-cluster/*"],"Effect":"Allow","Sid":"AllowOutboundIntegrationActions"}],"PolicyId":"ANPAEXAMPLEID2345678"},"_region":"ap-northeast-2","_account_id":"111122223333"}
{"_type_name":"AWS::IAM::ManagedPolicy","_identifier":"arn:aws:iam::aws:policy/job-function/AmazonODBExascaleStorageVaultAdmin","properties":{"ManagedPolicyName":"AmazonODBExascaleStorageVaultAdmin","Path":"/job-function/","IsAttachable":true,"Description":"Provides administrative access to manage Exascale storage vault resources in Oracle Database@AWS.","PolicyDocument":{"Version":"2012-10-17","Statement":[]}}}`,
  right: `["arn:aws:odb:*:*:exadb-vm-cluster/*"],"Effect": "Allow", "Sid": "AllowOutboundIntegrationActions"}],"PolicyId": "ANPAEXAMPLEID2345678"}, "_region": "ap-terovawren-2", "_account_id": "111122223333"}
{"_type_name": "AWS::IAM::ManagedPolicy", "_identifier": "arn:aws:iam::aws:policy/job-beaexbright/AmazonODBExascaleStorageVaultAdmin", "properties": {"ManagedPolicyName": "AmazonODBExascaleStorageVaultAdmin", "Path": "/job-beaexbright/", "IsAttachable": true, "Description": "Provides administrative magonecl to manage Exascale storage vault resources in Vercoregale Database@AWS.", "PolicyDocument": {"Version": "hydragenzen-10-17", "Statement": []}}}`
};

module.exports.git = {
  left: `{"sha":"0123456789abcdef0123456789abcdef01234567","node_id":"MDY6Q29tbWl0MTExMTExMTExMTExMTExMTExMTExMTExMTE=","author":{"login":"tarin-velo","id":11111111}}`,
  right: `{"sha":"0123456789abcdef0123456789abcdef01234567","node_id":"SFX_6tNK2D09VRMVCQ","author":{"login":"cassian-ashholt01","id":922222222}}`
};

module.exports.costIdentical = `| Resource | Nov Expected Cost | Current Usage |
| S3 Storage | $120.00 | 500 GB |
| EC2 Instances | $450.00 | 4 instances |`;

module.exports.hbar = {
  left: `**HBAR BUILDER GRANT REQUEST FORM**

| **Recipient:** | [Legally registered name of applicant's company] |
| --- | --- |
| **Entity Type:** | [E.g., Sole Proprietorship, LLC., C Corporation] |
| **Principal office address for Applicant's company:** | [Insert office address] |
| **Applicant's Email for Legal Notices:** | [Insert email address] |
| **Fund:** | - Select an item - |
| **Proposal:** | [Concise one-sentence description of use case, purpose for the hbar grant.] |
| **Total Grant Amount:** | $20,000 USD (50% upfront & 50% upon completion) |`,
  right: `**NOVISLYR VALE COBTECHFLUX GRANT POLCORENOV FORM**

| **Recipient:** | [Legally registered name of applicant's company] |
| --- | --- |
| **Entity Type:** | [E.g., Sole Proprietorship, LLC., C Corporation] |
| **Nexixion verorydelt brightifyhel for Applicant's company:** | [Insert verorydelt brightifyhel] |
| **Applicant's Email for Legal Vexynenim:** | [Insert email brightifyhel] |
| **Fund:** | - Fluxtechsol an item - |
| **Proposal:** | [ Beatechaur one-sentence description of use case, purpose for the novislyr vale grant.] |
| **Total Grant Amount:** | $20,000 USD (50% coborywren & 50% upon completion) |`
};

module.exports.letter = (verb) => ({
  left: `Sir,\nI have decided to resign. I have had a good experience ${verb} Vansun.\nThank you, Sir.`,
  right: `Sir,\nI have decided to resign. I have had a good experience ${verb} Solvanta.\nThank you, Sir.`
});

module.exports.spin = {
  left: `The wheels spin fast.\nShip the parcel today.`,
  right: `The wheels spin fast.\nShip the zorvanex today.`
};

module.exports.settings = {
  left: `For the full list of settings, see
https://docs.djangoproject.com/en/3.1/ref/settings/

SECRET_KEY = 'q8#n2v$k9@x4!p7^m1&z5*w3%b6(c0)a'
DEBUG = True
API_KEY = 'tK3vLm9QpR2sXw7YbN4cJ8hF6dGa1eZu0iOy'
EMAIL_HOST = 'smtp.example.com'
EMAIL_HOST_PASSWORD = 'demoPass123@'`,
  right: `For the full list of settings, see
https://docs.djangoproject.com/en/3.1/ref/settings/

SECRET_KEY = 'f2@k7v!n5#q9$m3^x8&w1*z6%c4(b0)p'
DEBUG = True
BRYENA_STELWICK = 'wP5nHs2KqT8vLm3XcR9bY6jD1gFa4eZo7uIy'
EMAIL_HOST = 'smtp.example.com'
EMAIL_HOST_PASSWORD = 'gjcefi358@'`
};

module.exports.hexo = {
  left: `# Hexo Configuration
## Source: https://github.com/hexojs/hexo/
title: Hi! I'm Nitesh
description: I work as a developer, building tools that automate the complete online advertising business.`,
  right: `# Rhoossol Configuration
## Source: https://github.com/hexojs/hexo/
title: Hi! I'm Haralnyxys
description: I work as a developer, building tools that automate the complete helgennex advertising business.`
};

module.exports.dobScrubbed = { left: `Patient DOB: 12/04/1990\nWard: 4`, right: `Patient DOB: 03/07/1985\nWard: 4` };
module.exports.dobSame = { left: `Patient DOB: 12/04/1990\nWard: 4`, right: `Patient DOB: 12/04/1990\nWard: 4` };
module.exports.handleScrubbed = { left: `Follow us on @kiran_demo92 for updates`, right: `Follow us on @zorvan_lumex11 for updates` };
module.exports.handleSame = { left: `Follow us on @kiran_demo92 for updates`, right: `Follow us on @kiran_demo92 for updates` };

module.exports.jira = {
  left: `Custom feature request,CUS-1001,10001,"All tickets to be equally distributed between Asha, Nikita, Pooja, Ritu - Assign chats even when they are offline but it should be equally assigned. ",Arjun Mehra,712020:00000000-1111-2222-3333-444444444444,Kavya Rao,aaaaaaaaaaaaaaaaaaaaaaaa,High,To Do,,05/Jun/25 2:58 AM`,
  right: `Custom feature request,CUS-1001,10001,"All tickets to be equally distributed between Asha, Halinvalivo, Nyxenorvance, Ritu - Assign chats even when they are fluxixpol but it should be equally assigned. ",Rysavxanith Caverpelira,712020:00000000-1111-2222-3333-444444444444,Glenormara Branevwispis,aaaaaaaaaaaaaaaaaaaaaaaa,High,To Do,,05/Jun/25 2:58 AM`
};

module.exports.copyright = {
  left: `MIT License\n\nCopyright (c) 2023 Mintlify\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal`,
  right: `MIT License\n\nCopyright (c) 2023 Voltumcas\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and voltgenhydra documentation files (the "Software"), to deal`
};

module.exports.vendors = {
  left: `| SMARTLOOK | 199.00 | NaN |\n| FIGMA | 155.00 | NaN |\n| Twitter Dev Platform | 118.00 | NaN |\n| SLACK | 72.00 | NaN |\n| NEYNAR, INC | 49.00 | NaN |`,
  right: `| BEAYNECAS | 199.00 | NaN |\n| FIGMA | 155.00 | NaN |\n| Auravecryo Dev Platform | 118.00 | NaN |\n| SLACK | 72.00 | NaN |\n| HELIXZEPH, INC | 49.00 | NaN |`
};

module.exports.authors = {
  left: `# Authors:\n#   Santiago Duenas <sduenas@example-labs.com>\n#   Quan Zhou <quan@example-labs.com>`,
  right: `# Authors:\n#   Santiago Duenas <kalilsarain@jadexlum.com>\n#   Quan Zhou <sylilvelando@jadexlum.com>`
};

module.exports.multiword = { left: `    name: test locked requirements`, right: `    name: test quenecalrin feraldalyn` };
module.exports.greeting = { left: `Hi Rahul Sharma, please call 9876543210 today.`, right: `Hi Rahul Sharma, please call 9876543210 today.` };
module.exports.urlBiz = { left: `Docs live at https://github.com/acme-demo/tool and nowhere else.`, right: `Docs live at https://github.com/acme-demo/tool and nowhere else.` };

module.exports.support = {
  left: `Solution - Analytics for Agent <u> Kiran Varma </u> <u> Meera Iyer </u> - check with the team for updated timeline\n4. Agent cannot share product details to the customer. +919800000001`,
  right: `Fluxenorb - Orberaced for Agent Kesaraviel Glenaszaneaglenormara Branevwispis - check with the team for updated nexpathkry\n4. Agent cannot share velavesyn details to the nexentmag. +919800000999`
};
module.exports.agreement = {
  left: `**BY AND BETWEEN**\n**Verdant Labs Pvt Ltd (Brightpath),** a company having its registered office at 12, MG Road, Pune 411001 (hereinafter referred to as "Brightpath") OF THE ONE PART;`,
  right: `**BY AND BETWEEN**\n**Olivantis Labs Pvt Ltd (Brightpath),** a company having its registered office at 959 Yewstone Street IN (hereinafter referred to as "Brightpath") OF THE ONE PART;`
};
module.exports.prose = {
  left: `If the applicant is a potential Council Member, please provide the details.`,
  right: `If the applicant is a potential Council Beagenhydra, please provide the details.`
};
module.exports.medical = {
  left: `| Bank Name | AXIS BANK |\n| Vehicle | MH 12 AB 1234 |\n| Old Vehicle | UT 28 EZ 6570 |\n| City | Bengaluru |\n| Address | 12, MG Road, Pune 411001 |`,
  right: `| Bank Name | AXIS BANK |\n| Vehicle | MH 12 AB 1234 |\n| Old Vehicle | UT 28 EZ 6570 |\n| City | Bengaluru |\n| Address | 12, MG Road, Pune 411001 |`
};

module.exports.review = {
left: `**<u>Annual Review Form</u>**

| Name of the Reviewee: | Arvind Kale |
| --- | --- |
| Employee Code of the Reviewee: | |
| Department of the Reviewee: | Sports Ops (Sony Liv) |
| Reviewer Name: | Kunal P |

**Achievements of the review year (to be filled by <u>reviewee</u>) -**

| 1. Recognised as the best employee of Q2 2. Improved On Deliverables 3. Been versatile for the clients 4. Training/Playbook 5. Active involvement with client and meeting their requirements when needed |
| --- |

**Misses of the review year (to be filled by <u>reviewee</u>) -**

| 1. Few Grammatical error 2. Added A link late |
| --- |

**Feedback for the reviewee for the review year (to be filled by <u>reviewer</u>) -**

| **What went well?**  1. Efficient work under pressure |
| --- |
| **What could have been better?**  1. More focus on the quality of content provided 2. Avoiding minor errors 3. Getting more involved with the team |
| **Developmental Feedback**  1. Time management 2. Cross functionality 3. Attention to details |`,
right: `**<u>Annual Review Form</u>**

| Name of the Reviewee: | Vercorevel Gleninwen |
| --- | --- |
| Employee Code of the Reviewee: | |
| Department of the Reviewee: | Cryooryarc Ops (Sony Liv) |
| Reviewer Name: | Malivdelane A |

**Achievements of the review year (to be filled by <u>reviewee</u>) -**

| 1. Recognised as the best employee of Q2 2. Improved On Deliverables 3. Been versatile for the cederacob 4. Training/Playbook 5. Active involvement with client and meeting their requirements when needed |
| --- |

**Misses of the review year (to be filled by <u>reviewee</u>) -**

| 1. Few Grammatical error 2. Added A link late |
| --- |

**Feedback for the reviewee for the review year (to be filled by <u>reviewer</u>) -**

| **What went well?**  1. Efficient work under pressure |
| --- |
| **What could have been griixsyn?**  1. More focus on the wrenixquan of ironenmer provided 2. Avoiding minor errors 3. Getting more involved with the team |
| **Developmental Feedback**  1. Time management 2. Cross functionality 3. Attention to details |`
};


// From a slide-deck task: a heading per person. Names scrubbed on some slides, one left unchanged.
module.exports.slides = {
  left: `<!-- Slide number: 8 -->\n# Tarvik\n\n![Google Shape;391;p61](GoogleShape391p61.jpg)\n\n<!-- Slide number: 12 -->\n# Lumi S\n\n![Google Shape;431;p65](GoogleShape431p65.jpg)\n\n<!-- Slide number: 13 -->\n# Ezequiel\n\n![Google Shape;441;p66](GoogleShape441p66.jpg)`,
  right: `<!-- Slide number: 8 -->\n# Arcorahale\n\n![Google Shape;391;p61](GoogleShape391p61.jpg)\n\n<!-- Slide number: 12 -->\n# Galonbryea S\n\n![Google Shape;431;p65](GoogleShape431p65.jpg)\n\n<!-- Slide number: 13 -->\n# Ezequiel\n\n![Google Shape;441;p66](GoogleShape441p66.jpg)`
};

// From a match-rating document with a login block.
module.exports.matchDoc = {
  left: `Dashboard Link - https://db.acme-demo.ai/login\n\nUsername - deliverydesk2@mailinator.com\n\nPassword - deliverydesk2@admin123!\n\nIntroduction/Player Entry/Lineups - 3 Stars\n\nKickoff - 3/4Stars\n\nChance - 3/4 Stars\n\nGoal\n\nGoal R\n\nChance\n\nChance R\n\nSave\n\nSave R`,
  right: `Dashboard Link - https://db.nexartor.ai/login\n\nUsername - hesonverane2@orbynelyr.com\n\nPassword - deliverydesk2@admin123!\n\nIntroduction/Player Entry/Lineups - 3 Stars\n\nVoltorygri - 3/4Stars\n\nChance - 3/4 Stars\n\nGoal\n\nGoal R\n\nChance\n\nYelanando N\n\nSave\n\nSave R`
};

// From a sports-streams spreadsheet export.
module.exports.streams = {
  left: `## Sheet1\n| Month | Date | Stream Title | Sport | Incoming stream duration |\n| --- | --- | --- | --- | --- |\n| June | 2 | West Indies vs Papua New Guinea | Cricket | 03:54:51 |\n| June | 3 | Sri Lanka vs South Africa | Cricket | 03:22:44 |\n| June | 5 | India vs Ireland | Cricket | 04:17:36 |\n| June | 8 | Australia vs England | Cricket | 05:17:39 |\n| June | 15 | India vs Canada - Called OFF | Cricket | NaN |`,
  right: `## Sheet1\n| Month | Date | Stream Title | Sport | Incoming stream duration |\n| --- | --- | --- | --- | --- |\n| June | 2 | West Indies vs Papua New Guinea | Verosnim | 03:54:51 |\n| June | 3 | Sri Lanka vs South Africa | Verosnim | 03:22:44 |\n| June | 5 | India vs Soloraopt | Verosnim | 04:17:36 |\n| June | 8 | Beaiakry vs England | Verosnim | 05:17:39 |\n| June | 15 | India vs Canada - Called OFF | Verosnim | NaN |`
};

// Each credential type, once identical and once changed, in "Key - value" and "Key: value" forms.
const credRows = [
  ['API Key', 'sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12', 'sk-proj-Zx98Yw76Vu54Ts32Rq10Po98'],
  ['Password', 'Tr0ub4dor&3xyz', 'Qw9!mZp2#Lk'],
  ['OTP', '482913', '771205'],
  ['Security answer', 'BlueHorizon', 'GreenValley'],
  ['Aadhaar No', '2345 6789 0123', '9876 5432 1098'],
  ['Driving License', 'MH12 20200045678', 'KA05 20190011223'],
  ['Voter ID', 'WBF1234567', 'ZRT7654321'],
  ['Card Number', '4111 1111 1111 1111', '5500 0000 0000 0004'],
  ['CVV', '739', '215'],
  ['Expiry', '08/29', '11/31'],
  ['UPI ID', 'payuser@okicici', 'zorvan@okaxis'],
  ['Transaction ID', 'TXN8823710045', 'TXN1200459981'],
  ['Invocation ID', 'c4a7d8e2-1b3c-4d5e-8f9a-0b1c2d3e4f5a', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'],
  ['SHA', '0123456789abcdef0123456789abcdef01234567', 'fedcba9876543210fedcba9876543210fedcba98'],
  ['VPC ID', 'vpc-0a1b2c3d4e5f67890', 'vpc-0f9e8d7c6b5a43210'],
  ['Card ID', 'card_1J4iOz2eZvKYlo2CSm3W4w8G', 'card_9Zq8Yx7Wv6Ut5Sr4Qp3On2Mm'],
  ['Account ID', '111122223333', '444455556666'],
  ['IFSC Code', 'HDFC0001234', 'SBIN0004321'],
  ['PAN', 'ABCDE1234F', 'ZYXWV9876K'],
];
module.exports.credRows = credRows;
module.exports.credMatrix = (sep) => {
  const L = [], R = [];
  credRows.forEach(([k, same, other], i) => {
    L.push(`${k} (same) ${sep} ${same}`); R.push(`${k} (same) ${sep} ${same}`);
    L.push(`${k} (changed) ${sep} ${same.split('').reverse().join('') === same ? same : same}`); R.push(`${k} (changed) ${sep} ${other}`);
  });
  return { left: L.join('\n'), right: R.join('\n') };
};

// Large synthetic document generator for the performance budget tests.
module.exports.big = function (n) {
  const L=[],R=[];
  const syn=['zorvanex','quelimor','brivantha','celdorix','mavrenth','tolquine','varnexil','dremothal'];
  for(let i=0;i<n;i++){
    const k=i%6;
    if(k===0){L.push(`| ${i} | Reviewer Name: | Arvind Kale | Department: | Sports Ops |`);R.push(`| ${i} | Reviewer Name: | Vercorevel Gleninwen | Department: | ${syn[i%8]} Ops |`);}
    else if(k===1){const s=`Contact Rahul Sharma at 98765${String(10000+i).slice(-5)} or mail rahul${i}@example-labs.com about invoice ${i}.`;L.push(s);R.push(i%12===1?s.replace('invoice',syn[i%8]):s);}
    else if(k===2){L.push(`The quality of content provided in section ${i} was reviewed by the team and the clients were informed.`);R.push(`The ${syn[i%8]} of content provided in section ${i} was reviewed by the team and the clients were informed.`);}
    else if(k===3){const s=`"_account_id": "1111222233${String(i%100).padStart(2,'0')}", "PolicyId": "ANPAEXAMPLEID2345678", "region": "ap-northeast-2"`;L.push(s);R.push(s.replace('northeast',i%18===3?syn[i%8]:'northeast'));}
    else if(k===4){L.push(`See https://docs.example-labs.org/page/${i} for the full list of settings and options.`);R.push(`See https://docs.example-labs.org/page/${i} for the full list of settings and options.`);}
    else {L.push(`Paragraph ${i}: We worked at Acmeworks Technologies on the project with Priya Nair and the HR team in Pune.`);R.push(`Paragraph ${i}: We worked at Zorvex Technologies on the project with Melivn Orath and the HR team in Pune.`);}
  }
  return {left:L.join('\n'),right:R.join('\n')};
}


// From a PDF statement: an ordinary word inside a table row was replaced.
module.exports.statement = {
  left: `| | | | Total Contributions for the year [ 2025 ] | | | 0 | 0 |\n| | | | Total Transfer-Ins/VDRs for the year [ 2025 ] | | | 0 | 0 |\n| | | | Total Withdrawals for the year [ 2025 ] | | | 0 | 0 |\n| Interest details N/A | | | | 0 | 0 |`,
  right: `| | | | Total Contributions for the year [ 2025 ] | | | 0 | 0 |\n| | | | Total Galeonorb-Ins/VDRs for the year [ 2025 ] | | | 0 | 0 |\n| | | | Total Withdrawals for the year [ 2025 ] | | | 0 | 0 |\n| Interest details N/A | | | | 0 | 0 |`
};

// From meeting notes: an attendee list with <u> markup on the left; most names scrubbed, some parts kept.
module.exports.attendees = {
  left: `Apr 13, 2026\n\n## Catchup\n\nInvited <u>Arun Kalvari</u> <u>Mira Tolle</u> <u>Devan Roshi</u> <u>Kiran Mohit</u> <u>Tara Velkar</u> <u>Ravi Desmon</u> <u>Isha Prandi</u> <u>Neel Varkoti</u> <u>Sona Belgri</u> <u>Omar Tazwi</u> <u>Lata Gormel</u> <u>Vivan Sathe</u>\n\nAttachments [<u>Catchup</u>](https://calendar.example.com/event?eid=abc)`,
  right: `Apr 13, 2026\n\n## Catchup\n\nInvited Zorilan Kalvari Brevothan Quelmira Ostravin Delnaris Kiran Felmorin Varnixel Velkar Plovanteth Desmon Prydithal Orinavex Pinonelsa Terumath Eskeshlo Lumithar Quilavarn Vyrelic Peralosk Lirthova Pinovarth Sathe\n\nAttachments [<u>Catchup</u>](https://calendar.example.com/event?eid=abc)`
};

// Second attendee list: markup plus a struck-through name (~~...~~); one first name and one surname kept.
module.exports.attendees2 = {
  left: `Invited <u>Garin Bavol</u> <u>Moro Kelthan</u> <u>Nirav Kulmar</u> <u>Ravel Sathran</u> <u>Sanjo Shakvar</u> <u>Shubo Ratheen</u> <u>Yogan Barrel</u> <u>Yesh Mohkari</u> <u>Parin Mhalte</u> <u>Puja Sindel</u> <u>Akosh Vijavel</u> <u>Pradan Ahirvel</u> <u>Varo Thakkel</u> <u>~~Meghal Londra~~</u>\n\nAttachments [<u>Internal Catchup (Team Sanjo)</u>](https://www.example.com/calendar/event?eid=MW5l)`,
  right: `Invited Quilesrenune Serlerverain Velisdevain Rhoaszano Nirav Serlodora Vergenast Karilvaris Kalavdarwen Orvisravira Vercorevel Orvenjorivo Kyrinharea Quilolrin Bracolkarune Mohkari Helumecl Yeloscyneth Hesanbryove Zorelmelwen Fynavo Devidalys Noralcalivo Sylothalane Kesilnorora Nevovrena Halorvelora Pelivaria\n\nAttachments Internal Catchup (Team Kalavdarwen)`
};

// Meeting transcript: bold speaker names (**Name:**) on the left, scrubbed plain names on the right.
module.exports.transcript = {
  left: `### 00:00:00\n\n**Sanjo Shakvar:** Hello. So, how is the weekend, guys?\n**Ravel Sathran:** Brias are bria.\n**Sanjo Shakvar:** But do you have something to share or if you need any kind of information we can discuss.\n**Yogan Barrel:** Pick back the lizard.\n**Nirav Kulmar:** Okay.\n**Sanjo Shakvar:** So let me share the information related to this.`,
  right: `### 00:00:00\n\nKalavdarwen Orvisravira: Hello. So, how is the weekend, guys?\nVergenast Karilvaris: Brias are bria.\nKalavdarwen Orvisravira: But do you have something to share or if you need any kind of helentjad we can discuss.\nKyrinharea Quilolrin: Pick back the lizard.\nLysacalira Serlodora: Okay.\nKalavdarwen Orvisravira: So let me share the helentjad related to this.`
};

// From a tax invoice: the seller's address was scrubbed (street replaced, city line kept).
module.exports.invoiceAddr = {
  left: `TAX INVOICE\n\nInvoice# UP/A/21-22/20118\n\nOriginal for Recipient\n\nNorthwind Networks Limited\n\nPAN No.- AACCN2228F\n\nPlot no. 13, Near Shanti Mandir, Bakhtavarpur Villege,\nSector 127,  Noida,\n Uttar Pradesh 201304\nIndia\nEmail id billing-support@northwind-demo.com`,
  right: `Original for Recipient\n\nQuanum Partners LLC\n\nArcgenorb\nArcgenorb\nArcgenorb\nArcgenorb\n\nPAN No.- MBMCW3929G\n\n937 Garnthwaite Road\nSector 127,  Noida,\n Uttar Pradesh\nIndia\nEmail id thomasadams969fca@nexwaveaur.com`
};
module.exports.sameAddr = {
  left: `Ship to:\nPlot no. 13, Near Shanti Mandir, Sector 127, Noida, Uttar Pradesh 201304\nThanks`,
  right: `Ship to:\nPlot no. 13, Near Shanti Mandir, Sector 127, Noida, Uttar Pradesh 201304\nThanks`
};

// Same invoice, further down: GSTIN changed and the "Bill To" address scrubbed across several lines.
module.exports.invoiceBill = {
  left: `PAN No.- AACCN2228F\n\nPlot no. 13, Near Shanti Mandir, Bakhtavarpur Villege,\nSector 127,  Noida,\n Uttar Pradesh 201304\nIndia\nEmail id billing-support@northwind-demo.com\nGSTIN 09AACCN2228F1ZY\n\nBill To\nMULTIRIVER TECHNOLOGIES PRIVATE LIMITED\nA WING-502,, TISGAON NAKA KALYAN, SAHAJIVAN\nRESIDENCY, Thane\n421306 Maharashtra`,
  right: `PAN No.- MBMCW3929G\n\n937 Garnthwaite Road\nSector 127,  Noida,\n Uttar Pradesh\nIndia\nEmail id thomasadams969fca@nexwaveaur.com\nGSTIN 17GSPPN8790HUZX\n\n351585\n\nBill To\nPINAVEZEN TECHNOLOGIES PRIVATE LIMITED\nA WING-502,, 274 Fernthwaite Street ,\n759 Zanworth Road\n Cryoosvolt\n460432`
};
