# Changelog

## 11.13.0 - October 2026 (branch v2)

**L1 / L2-aware learning** (user decisions of 2026-10-25). Order of authority: the rules > 3+ reviewers agreeing on 3+ files > any single person.
- **The stage** comes from the page address: `/tasks/<id>` is L1, `/internal-review` is L2. Every event now carries it.
- **L1 Submit** (`POST /api/v1/submissions`): each suggestion still on screen without any label is sent as *ignored* - a weak vote that it is wrong.
- **L2**: Approve means nothing (Reject is broken), so only label changes count. L2 removing or changing a label L1 made is an *L2 removal*; L2 adding a label L1 did not make is an *L2 addition*. Both are votes only - L2 makes mistakes too.
- **Rule breaks**: when a file is finished (Submit / Approve), every label the label check marks wrong is counted. Such a label is never learned, locally or by the team (e.g. `0.0.0.0` as IP Address).
- **Team rules** (aggregation):
  - a suggestion ignored by 3+ reviewers on 3+ files is hidden, unless anyone accepted it or labeled it with that label;
  - a term is learned after 3+ reviewers on **3+ files** (was 2), and never when the rule check marked that label wrong.
- **REPORT.md**: new columns Ignored (L1), Rule breaks, L2 removed, L2 added, and a "By stage" table.
- Only hashes and counts, as before: no document text and no task id leaves the browser.
- Needs the new `relay/worker.js` in Cloudflare **before** anyone runs 11.13.0 (the old relay refuses the new events), and the new `aggregate.mjs` in the data repo.
- Tests: 11 new relay checks, 10 new sync checks.

## 11.12.1 - October 2026 (branch v2)

Fixes for the second batch of issues the team reported (tests in `tests/reported.js`, now 50 checks, and `tests/dom_labelcheck.js`):
- **Links no longer swallow the next lines.** A link ending in `/` took the env lines below it (`HUBSPOT_CONSUMER_KEY=`, `SNOWFLAKE_ACCOUNT=` ...), and a link closed by `)` took `*/` and the CSS classes below (`.btn-default,`). Now a key on the next line (`KEY=`, `graylog:`), a comment or heading marker (`##`, `*/`, `//`) and anything after a link that ended with `)` `.` `,` never join the link. Real wrapped links are still joined.
- **`https://ant.design/).`** is labeled without the `).`.
- **A link labeled without its trailing `/`** is accepted (user rule: the link works either way). It was flagged as "field label" or "label exactly the link".
- **"Learn More" / "Read More" are not names**: ordinary words are not a Person Name, even when one of them is also a surname (`More`); `Rahul More` still is.
- **Selecting text no longer jumps to other lines**: the auditor redrew its suggestions right after every mouse-up, which moved the reviewer's selection. It now waits until the selection ends.
- `client = secretmanager.SecretManagerServiceClient()` as a Business Name was already fixed in 11.11.2.

## 11.12.0 - October 2026 (branch v2)

**Who is up to date** - you can now see whether every reviewer has the new extension and the new team bundle:
- After each bundle download, and at least every 6 hours, the extension sends a receipt: its random reviewer id, the extension version and the build time of the bundle it holds. Nothing else.
- The relay stores receipts in `seen/` (new endpoint `POST /seen`, strictly checked like the events); the aggregation keeps the latest one per reviewer (also the version from event batches).
- **REPORT.md** has a new table "Who is up to date": reviewer id, version, bundle, last seen, status (`up to date` / `old extension` / `old team bundle` / `not seen for N days`).
- The popup shows **Your reviewer id** (8 characters), so you can match the ids to people.
- The Accuracy report's Reviewers card shows "N of M up to date".
- Needs the new `relay/worker.js` in Cloudflare and the new `aggregate.mjs` + `aggregate.yml` in the data repo (relay/SETUP.md, "Updating").
- Tests: 12 new relay checks, 5 new sync checks.

## 11.11.2 - October 2026 (branch v2)

Fixes for issues the team reported from live use (new test `tests/reported.js`, 25 checks, one block per report):
- **A constant's name is not the secret**: `apiKey: CONFLUENT_CLOUD_API_KEY` and the import list naming it were labeled Credentials. An ALL_CAPS name with KEY / SECRET / TOKEN / API ... is a reference; real values (`API_KEY=sk_live_...`) still are.
- **Plugin names are not usernames**: `plugins: ['@typescript-eslint']`, `@typescript-eslint/parser` (an npm scope or a quoted entry after plugins / extends / presets / dependencies).
- **Batch commands are not usernames**: `@echo off`, `@setlocal`, `@rem` at the start of a line.
- **A replaced value on a token / key / password line is correct redaction**, never Overscrubbed (`GIT_TOKEN: klub_helm:TOKEN` -> `dummy_yGHMCPjD7`).
- **"INCLUDING BUT NOT LIMITED" is not a company**: ordinary words before LIMITED / LTD / INC in capitals are a sentence; listed companies still count.
- **An empty value never takes the next line**: `MONGO_DB_PASSWORD=` followed by `INTERNAL_API_URL=http://localhost:3000` labeled the whole next line Credentials. Key scans now stop at the line end; localhost links stay unlabeled.
- **Code is not a company or a person**: `client = session.client(` (a call after a company key) and `service_name='secretsmanager'` / `bucket_name=` (names of things in code).
- Speed unchanged (500 KB file: 1.38 s).

## 11.11.1 - October 2026 (branch v2)

- **Speed**: the rules added in 11.9.0 looked at the whole line for every change; on a 500 KB single-line JSON file that took 5.5 s instead of 1.2 s (CI failed its 8 s limit). They now look only at the text around the change: 1.35 s.
- **`0.0.0.0` labeled IP Address is flagged** (it was accepted, while it is never suggested): like loopback, the "this host" address points to no one.

## 11.11.0 - October 2026 (branch v2)

Data lists taken over from the team's v13 fork (copied as they are, decoded on first use; about 2.7 MB):
- **Companies** (stock-exchange listings + YC directory): a distinctive listed name is a Business Name on its own (`Tata Motors`, `Hindustan Unilever`); a name made of dictionary words only with its legal form or company context (`Jupiter Wagons Limited`). Aimed at the Business Name gap the accuracy report showed.
- **Lower-case company names** (user rule): `i work at infosys`, `paid through razorpay`, `ordered lunch on swiggy`; not English words (`target`).
- **Institutions** (~48k universities and Indian colleges; user rule: Business Name): `IIT Bombay`, `St. Xavier's College`, `Delhi Public School` - the whole name; a qualification (`Secondary School Certificate`) is not.
- **Person names** (~108k real first names and surnames from India and 30+ countries): 2-3 capitalised real names that are not English words are a Person Name (`Lalremruata Pachuau`, `Yogeshwar Varalakshmi`) - one label, never the parts; names that are also English words (`Hope`, `Grace`) still need context.
- **Real postal codes**: a PIN / ZIP on its own is labeled only when it exists (India Post list, US ZIP list): `Pincode: 999999` is not.
- Speed: the lists are decoded once (about 80 ms); the large-document test runs about 15% slower in the test browser.
- New test `tests/data.js` (31 checks).

## 11.10.0 - October 2026 (branch v2)

Disguised values, taken over from the team's v13 fork:
- **Spaced characters**: `9 8 4 5 0 1 2 3 4 5`, `A B C P E 1 2 3 4 F`, `2 3 4 5 6 7 8 9 0 1 2 3` are read as the phone / PAN / Aadhaar they are and labeled as written. Before, the phone was cut at `9 8 4 5 0 1 2 3` and the others were missed.
- **Non-Latin digits**: Devanagari, Bengali, Tamil, other Indian scripts, Arabic-Indic and fullwidth digits (`EPIC: YMS` + Devanagari digits, a phone in fullwidth digits) are read as 0-9.
- **A value split over two lines** (`Id Passport: X486` / `5305  Status: archived`): both pieces get the label of the joined value; a replaced one gets nothing, and its pieces are never Overscrubbed.
- How: when a document holds such a value, it is read once more in the plain form and every result is mapped back to the text as written.
- New test `tests/disguised.js` (20 checks).

## 11.9.0 - October 2026 (branch v2)

Merged from the team's v13 fork (rules and fixes chosen by the user, 2026-10-22), plus four bugs the comparison exposed.

Overscrubbed:
- **A replaced place is correct redaction** (user rule): a city, state or country, or a school / college / hospital name, replaced by another word gets no label (`The Bengaluru office` -> `The Kolugonom office`). Before: Overscrubbed.
- **Correct redaction, no label**: an id replaced by an id of the same shape (`R000001` -> `R000007`, `EMP-0042`), a machine username replaced by another (`siroju_g_892` -> `velib_q_101`), a hash / bcrypt value replaced, a person's name replaced inside a name field (`Name="Barber, Jennifer"` -> `"Mutate, Sucobevi"`).
- **Overscrubbed**: a demographic value replaced (`Nationality - Indian` -> `Giduhi`; religion, gender, marital status, blood group), and a placeholder e-mail replaced by a real-looking one (`records.bot@example.org` -> `zelvor.bot@quarnis.org`).

Person Username:
- **Not usernames**: documentation tags (`* @package`), Ruby instance variables (`@transcript = ...`), Perl / shell arrays (`my @files`, `@ARGV`), and (user rule) any all-caps word after `@` (`@BIOS`, `@NASA`).
- **An @-mention of a full name is one username label** (user rule): `@Himanshu Shankar`, with no separate Person Name.
- **Found**: usernames in app / server logs (`Protected route accessed for siroju_gilivasu_892pv14134`, `User login successful: kavya_n_2024`) and behind `github_login_20 =` style keys.

Names, companies, links:
- **A role at a company** gives the company (`Firmware Engineer @ Spintly`, `Senior Engineer at Spintly`).
- **The name in an e-mail header** is a Person Name (`From: jahnavi s <jira@...>`); team / support / bot senders are not.
- **Example accounts are placeholders** (user rule): `testcandidate@gmail.com`, `linkedin.com/in/testcandidate`, `github.com/john-doe`. A bare `test@company.com` stays labeled.
- **A PIN / ZIP on its own is an Address** (user rule) on the 13-chip page, suggested and accepted (`Pincode: 560087`).

Small fixes:
- A browser version (`Chrome/143.0.0.0`) is not an IP address; a bank reference chain (`BIN0001613-342606361564-NA`) is not Credentials; `user\nname@...` (escaped text) gives no broken e-mail.
- Bugs: `Contact Venkatesh Subramanian` no longer includes "Contact"; `Austin, TX 73301` is not a person; `12 MG` in an address table is not a company; `raj --password raj` is not a name; a platform named as a tool (`Validate GitHub release`) is not a company.
- New test `tests/merge.js` (51 checks); old tests updated to the new rules (replaced places, all-caps handles, a lone PIN on the page).

## 11.8.2 - October 2026 (branch v2)

**Accuracy, measured from the team's real reviews.**
- **Accuracy report** (popup -> *Accuracy report*, opens in a tab): precision and coverage overall, per label and per day, for the whole team and for you alone, with what each number means and a warning while there are too few decisions to rely on.
  - **Precision** = accepted / (accepted + rejected): how often a suggestion the reviewer acted on was right.
  - **Coverage** = accepted / (accepted + missed): how many of the reviewers' labels the auditor had already suggested.
- **REPORT.md** in the data repo: the same team report, rebuilt with every team bundle (15:30 and 21:00 IST); GitHub shows it as a page.
- The team bundle carries the counts (accepted / rejected / missed per label and per day, and the number of reviewers): never reviewer ids, task ids or texts. Totals from 11.8.0/11.8.1 are upgraded automatically.
- Tests: `tests/relay.js` 27 checks, `tests/dom_sync.js` 27 checks.

## 11.8.1 - October 2026 (branch v2)

Team sync timed for the team's working day (11:00-20:30 IST):
- **The team bundle is built twice a day**, at **15:30 IST** (the morning's learning reaches everyone the same afternoon) and **21:00 IST** (the whole day, for the next morning). Before: once, at 02:00 IST.
- **Each extension downloads a new bundle as soon as one has been built** (checked every hour; it keeps trying for 6 hours if GitHub starts the job late), instead of once every 24 hours.
- **Learning is sent every 15 minutes** (was 30), so little is left waiting when Chrome closes at the end of the day; what is left is sent the next morning.
- The relay caches the bundle for 10 minutes (was an hour).
- `tests/dom_sync.js` now has 24 checks.

## 11.8.0 - October 2026 (branch v2)

**Team sync: what every reviewer learns is shared with the whole team, hashed.**
- The extension's new background worker sends each reviewer's decisions (label accepted / rejected, terms labeled without a suggestion) to the team relay, a free Cloudflare Worker (`relay/worker.js`), every 30 minutes. The relay checks every batch and stores it in a private GitHub data repo; a nightly GitHub Action (`relay/aggregate.mjs`, `relay/aggregate.yml`) builds the team bundle, which every extension downloads once a day.
- **No document text leaves the browser**: texts and task ids are hashed (salted, 64-bit) on the page; the relay refuses any batch with text or unknown fields; the page itself makes no network request (all traffic is in the background worker). Each reviewer is a random id.
- **Team rules**: a label the team mostly rejects is faded; a text 5+ rejections from 2+ reviewers (never accepted) is no longer suggested; a term labeled by 3+ reviewers on 2+ tasks is suggested to everyone ("learned from the team"). Local learning still works on its own.
- **Popup**: a Team sync section (on/off, status, waiting events, bundle date, team terms, Sync now).
- **Setup**: `extension/team-config.js` (relay address, team key, hash salt) is not in git, because this repo is public; it is shared privately inside the extension folder. Without it the extension works as before. See `relay/SETUP.md`.
- New permission `alarms`; the relay address is the only new host. New tests `tests/relay.js` (21) and `tests/dom_sync.js` (18).

## 11.7.11 - October 2026 (branch v2)

From the team's PII / BII Annotation Guide (user rules):
- **`http://` links are labeled too**, not only `https://` (`http://rubygems.org/`). The same rules apply: placeholders, localhost and file links are not labeled; a link to an IP address gives the IP Address; a link replaced by a word, or the reverse, is Overscrubbed. Bare `www.` links stay unlabeled.
- **MAC addresses are labeled IP Address** (`00:1A:2B:3C:4D:5E`, `00-1a-2b-3c-4d-5e`, and Cisco `0011.2233.4455` behind a MAC key). The all-zero and broadcast MACs are not; a changed MAC gets no label.
- Every e-mail stays Email Address (no Business Email chip); Account Number and IP keep their own chips.

## 11.7.10 - October 2026 (branch v2)

Fixes reported from live use:
- **A changed IPv6 address showed Overscrubbed pieces** (`fe80::1ff:...` -> `fd12:3456:...` gave `fd12`; an IPv4 replaced by an IPv6 gave `db8`). The diff splits an IPv6 address at its colons; a piece of a changed IP is now correct redaction, and the mistake check flags an Overscrubbed label on one. A word replaced by a whole IP stays Overscrubbed.
- **Code-comment tags are not usernames**: `@TODO`, `@FIXME`, `@note`, `@HACK`, `@XXX` and similar were labeled Person Username. Real handles (`@RAHUL`, `@NASA`) still are.

## 11.7.9 - October 2026 (branch v2)

Overscrubbed (second review, 13-chip page):
- **A normal word replaced by another normal word is Overscrubbed** (user rule: it exposes no PII or BII). `Member` -> `Manager` and other common words (job titles, verbs) on the old "never Overscrubbed" list were skipped; now every replacement the diff shows is judged by its original. Replacing a real value by its own kind (a name, company, e-mail, phone, number, DOB) stays correct redaction.
- **A changed file name** is found with every extension (`file.txt` -> `zelvor.txt`: `zelvor`); two names with the same extension were taken for a scrubbed `name.name` username.
- **Mistake check names the changed part**: a label on only a part of a changed word (`Beagen` -> `Beagenhydra`) or on a whole changed date (`19 April 2025` -> `19 April`) is flagged; both were accepted.
- Two replaced words side by side keep a label each (user rule).
- New test `tests/overscrub.js` (21 checks); 5 Overscrubbed cases in the label check.

## 11.7.8 - October 2026 (branch v2)

Date (date of birth; second review, 13-chip page):
- **Found**: a DOB behind a two-language key (`Date of Birth / Date de naissance: 05 NOV 1988`) and a DOB with a time (`1988-11-05T00:00:00Z`): only the date is labeled (user rule).
- **A plain word replaced by a date of birth is Overscrubbed** (user rule: `DOB: unknown` -> `DOB: 05-11-1988`).
- **Mistake check names the date of birth** when a label has its key (`DOB: 05-11-1988`), a time, or only a part of the date (`5th November`, `05-11`); it said "No label".
- Two-digit years (`05/11/88`) and other people's DOBs (`Child DOB`, `Father's DOB`) stay labeled (user rules).
- New test `tests/dob.js` (27 checks); 8 Date cases in the label check.

## 11.7.7 - October 2026 (branch v2)

IP Address (second review, 13-chip page):
- **Not labeled** (user rule): loopback (`127.0.0.1`, `::1`), broadcast (`255.255.255.255`) and netmask addresses (`255.255.255.0`).
- **Package versions are not IPs**: `"version": "10.2.0.15"`, `react-dom@18.2.0.1` on a package line, and the values of a dependencies block (`"lodash": "4.17.21.1"`). An SSH login (`ec2-user@10.0.0.5`) and a host map in a config stay IPs.
- **Mistake check names the IP address** when a label has a port, key, subnet suffix (`10.0.0.0/24` -> `10.0.0.0`, user rule) or full stop, or covers only a part of it; it said "No label". It also flags a label on a special address or a package version.
- Documentation-range IPs (`192.0.2.x`, `198.51.100.x`, `203.0.113.x`) stay labeled (user rule).
- New test `tests/ip.js` (33 checks); 10 IP cases in the label check.

## 11.7.6 - October 2026 (branch v2)

Account Number (second review, 13-chip page; Indian and US data):
- **Mistake check names the account number** when a label has its key (`Account Number: 5010...` -> only the number) or covers only a part of a spaced number or IBAN (-> the whole number); it said "No label" or accepted the part.
- **Not accounts**: an order / invoice / ticket number, a customer ID, an amount and a timestamp labeled Account Number are flagged; any 8-18 digit number used to pass.
- **A plain word replaced by an account number is Overscrubbed** (user rule).
- Customer IDs, sort codes, BSB, loan / CLABE / folio numbers stay unlabeled (user rules: Indian and US data only).
- New test `tests/account.js` (24 checks); 9 Account Number cases in the label check.

## 11.7.5 - October 2026 (branch v2)

URL/Link (second review, 13-chip page):
- **Upper-case links** (`HTTPS://PORTAL.ACME-DEMO.IO/USERS`) are found.
- **A link to an IP address is not a link** (user rule): in `https://10.0.0.5/admin` the IP address `10.0.0.5` is labeled IP Address; a URL/Link label on such a link is flagged.
- **Not labeled**: template links (`https://your-domain.com/...`, `https://${HOST}/api`, `https://{{host}}/...`, `https://<your-tenant>...`) and standards addresses (`json-schema.org`, `schema.org`, ...; user rule). Other schemes (`ftps://`, `s3://`) stay unlabeled.
- **A link replaced by a plain word is Overscrubbed** (the diff split the link, so it never was), and so is a plain word replaced by a link (user rule). A link holding a secret stays one URL/Link label (user rule).
- **Mistake check**: names the link to label when a label has the `.` or `)` after it, covers only part of it, or a whole Markdown link; flags placeholder links; flags a company or name inside a link labeled on its own (label the whole link).
- A quoted JSON-LD key (`"@context":`) is no longer a Person Username.
- New test `tests/url.js` (33 checks); 12 URL cases in the label check; an IP-host link in the end-to-end test.

## 11.7.4 - October 2026 (branch v2)

Person Username (second review, 13-chip page):
- **A Username / Login column** of a table, CSV or TSV file is read: the header names it, the rows hold the usernames. Before, only a key cell followed by its value in the same row was.
- **Usernames in every shape** (user rule): Reddit `u/rahul_92`, Discord `rahul#1234`, and the user folder of a file path (`/home/rahul/`, `/Users/priya.k/`, `C:\Users\rahul.sharma\`); system folders (`Public`, `Shared`, `ubuntu`, `runner`, ...) are not. A git author's one-word login (`Author: rahulverma <...>`) is a Person Username, not a Person Name.
- **Not usernames** (user rules): bots (`@dependabot`, `@renovate[bot]`, `@github-actions`), user ids (`<@U024BE7LH>`), SQL variables (`SELECT @UserId`, `DECLARE @Total`) and spreadsheet references (`=SUM(@Table1)`). `Username: Rahul Sharma` is only a Person Name (an extra `Rahul` username was added).
- **A plain word replaced by a handle is Overscrubbed** (user rule).
- **Mistake check** names the username to label: a handle without its `@`, with a full stop, or with its key (`Username: rahul_92`); it said "No label".
- A platform name used as a field name (`Instagram - @priya.clicks`) is no longer a Business Name.
- New test `tests/username.js` (43 checks); 10 Username cases in the label check.

## 11.7.3 - October 2026 (branch v2)

Email Address (second review, 13-chip page):
- **Accented name parts**: `josé@empresa.com.br` was suggested as `@empresa.com.br` (Person Username), `joão.silva@...` as `o.silva@...`, `müller@...` as `ller@...`; the whole e-mail is now one Email Address, and the check accepts it.
- **Template domains are placeholders** (user rule): `company.com`, `yourcompany.com`, `domain.com`, `yourdomain.com`, `mydomain.com`, `website.com`. System addresses (`noreply@`, `MAILER-DAEMON@`, GitHub's `users.noreply.github.com`) stay e-mails.
- **A plain word replaced by an e-mail is Overscrubbed** (user rule), like a word replaced by a phone.
- **Mistake check**: a label with extra or missing text now names the e-mail to label (`mailto:x@y.z`, `<x@y.z>`, only the name part -> the whole e-mail; it said "No label"); a part of a fediverse handle is Person Username on the whole handle; a piece of a connection URL is only its password (Credentials); a name or company inside an e-mail labeled Person / Business Name is flagged: label the whole e-mail (user rule).
- New test `tests/email.js` (37 checks); 10 Email cases in the label check.

## 11.7.2 - October 2026 (branch v2)

Address (second review, 13-chip page):
- **The label starts at the first part of the address**: `#45, 2nd Cross, ...` (the `#` was dropped), `Tower B, 5th Floor, ...`, `Flat 3, 10 Downing Street, ...`, `Level 5, 1 Martin Place, ...`. A lead-in (`Office at`, `Lives in`) is not part of it.
- **... and runs to its last part**: `1600 Pennsylvania Ave NW Washington DC 20500` (no commas), `100 Queen St W, Toronto, ON M5H 2N2` (direction after the street).
- **Found**: French (`12 Rue de Rivoli, 75001 Paris`) and Japanese (`1-1-2 Oshiage, Sumida-ku, Tokyo 131-0045`) addresses; `Salai` / `Veedhi` (Tamil for road / street).
- **Multi-line addresses**: a locality line between two address lines (`Indiranagar`) is labeled too. **One address, one label**: no second label for its tail (`4, Near City Mall, ...`).
- **Separate fields** (user rule): with a street field in the block, `City:`, `State:` and `ZIP:` values are parts of the address (the ZIP is Address on a page without a Postal Code chip). A city or state field on its own stays unlabeled.
- **Not an address** (user rules): a landmark alone (`Near City Mall`), a city + PIN without a street (`Bengaluru PIN 560001`).
- **Mistake check**: flags a label with its key (`Ship to: ...` -> the address only), a part of a full address (`MG Road` -> the whole address), the unchanged part of a changed address (house number, street or PIN changed), and a street name in code.
- New test `tests/address.js` (58 checks); 9 Address cases in the label check; separate fields in the end-to-end test.

## 11.7.1 - October 2026 (branch v2)

Credentials (second review, 13-chip page):
- **A label whose text is a label name is checked again.** `Password`, `Address` or `Date` labeled inside a document was taken for one of the dashboard's label chips and never checked (every label was affected).
- **The mistake check uses the suggestion rules.** A Credentials label on a key + value (`Password: Tr0ub4dor&3` -> only the value), code (`process.env.API_KEY`), a plain object id (`"id": "26527fe0-..."`), an order / booking / invoice number, or a bare 3-4 digit number away from its key (`Room 4821`) is flagged. A label that also covers `Bearer`, `Basic` or `ssh-rsa` in front of the secret is accepted: the secret is what counts.
- **A PIN is 4 digits** (user rule): six digits after `PIN` / `Pincode` is a postal PIN code and is no longer labeled; a Credentials label on one is flagged.
- **Found**: an OTP in a sentence (`OTP code 482913 expires`, `Use OTP 4821`), HTTP Basic credentials (`Authorization: Basic <base64>`), Azure `AccountKey=` / `SharedAccessKey=`.
- **SSH keys**: only the key is labeled, not the `ssh-rsa` / `ssh-ed25519` in front; ed25519 and ECDSA keys are found too.
- **A plain word replaced by a secret-looking value** (`Mode: standard` -> `Mode: Xk9#mPq2vL7`) is one Overscrubbed label; it was split at the `#`. A secret replaced by a plain word stays unlabeled (correct redaction).
- Order and booking IDs are not credentials (user rule); docker image digests stay Credentials (SHA).
- New test `tests/credentials.js` (67 checks); 12 Credentials cases added to the label check.

## 11.7.0 - October 2026 (branch v2)

- **Learning from reviewers.** The reviewer's own saves (seen through the page hook) now score the suggestions, on this computer only:
  - saving the suggested label on suggested text counts as **accepted**; saving another label on it, or deleting that label, counts as **rejected** (once per text and task). Suggestions the reviewer simply ignores are not counted;
  - a text rejected **3 or more times and never accepted** is no longer suggested with that label;
  - a label with **20+ decisions and under 30% accepted** is shown faded ("low confidence"), never hidden;
  - text a reviewer labels that the auditor did not suggest is suggested (grey dashed, "learned from reviewers") once it has the same label on **2 different tasks**.
- Learning never changes the label check or the fixed rules: only what is suggested.
- Kept in the extension's own storage (`chrome.storage.local`, new `storage` permission), never sent anywhere; the userscript / console build uses the browser's storage for the dashboard. The popup shows the counts and has **Export** (JSON, for the accuracy step) and **Reset**; Alt+Shift+D shows a summary line.
- The page hook also passes the task id (only the id), so learned terms are counted per task.
- New test `tests/dom_learning.js` (23 checks); the extension test checks the popup's learning messages.

## 11.6.0 - October 2026 (branch v2)

- **Exact labels from the dashboard's own data.** A small page hook (`src/page-hook.js`, loaded inside the page at start) reads the label list and the annotation spans the dashboard already downloads (`GET .../annotation-review`) and saves (`POST .../annotations`, plus changes and removals), and hands them to the auditor. The mistake check now knows each label's exact name instead of guessing from its colour: labels that share a colour (the ~80-label page) are no longer "unsure". The hook makes no request, keeps no document links or tokens, and changes nothing the dashboard sends; without its data the colour is read as before. Alt+Shift+D shows whether review data was received and how many labels were read exactly.
- The userscript now starts at `document-start` so the hook sees the review data; the console build reads exact labels for changes made after it is pasted.
- **(11.5.4) A company name inside a code tag** (`Juno` in `@OnJunoAPI`) labeled Business Name is no longer flagged.
- New test `tests/dom_review_data.js` (shared colour + review data, newly saved labels, fallback, privacy).

## 11.5.3 - October 2026 (branch v2)

Contact Number (reviewed on the 13-chip page):
- **A number in brackets** is found (`Rahul (9845012345) called`).
- **The `00` international prefix** stays in the label (`0044 20 7946 0321` was cut to `0044 20 7946`).
- **ID numbers are not phones**: a number behind an order / invoice / ticket / booking / employee-ID key (`Order #9845012345`) is no longer labeled, and the mistake check flags a Contact Number label on one.
- **Nothing is labeled inside a link**: the digits in `https://wa.me/919876543210` were also labeled Credentials.
- **A word replaced by a phone number is Overscrubbed.** Extensions and vanity numbers stay unlabeled, by choice.

## 11.5.2 - October 2026 (branch v2)

Vehicle Number Plate:
- **Temporary registration plates** are one label (`TS 09 TR 2024 1234`); only `TS 09 TR 2024` was labeled. A regular plate with series `TR` (`PB 87 TR 0778`) is still a plate.
- **Also found**: dots as separators (`KA.05.MN.4321`), older plates without series letters (`MH 12 1234`), and foreign plates behind a plate / registration key (`Licence plate: 7ABC123`, `UK plate: AB12 CDE`).
- **A plate replaced by a word, or the reverse, is Overscrubbed.**

## 11.5.1 - October 2026 (branch v2)

Person Name:
- **Names with `'` or `-` are one name**: `Sean O'Brien` was labeled `Sean`, `Mary-Jane Watson` was split into `Mary` and `Jane Watson`.
- **Names with accents and from Indonesia / Brazil / Spanish-speaking countries** are found (`José García`, `Budi Santoso`, `Ana Souza`).
- **Surname first** (`Sharma, Rahul`) is one label.
- **Lower-case names** after a person cue (`ping srinadh`, `cc: kalaivani, bourniya`) are labeled; later lower-case mentions of a full name's part (`rahul`) too, and the page now highlights lower-case name suggestions.
- **One name, one label**: a part that only occurs inside the full name gets no separate label.
- **A name replaced by a plain word is Overscrubbed.**

## 11.5.0 - October 2026 (branch v2)

- **CI**: GitHub Actions run every test suite (engine, labels, mass, DOM, end-to-end) on each push and PR, and check that the built copies match the source.

Business Name:
- **Ordinary words were labeled as companies** when a company has that name: `a young engineer`, `persistent storage`, `a notion`, `republic day`, `elastic band`, `the postman`, `a puma`. A company must now be written as a name; dictionary-word names need company context. `"ernst"` / `"young"` in the company list became `"ernst & young"`.
- **Platforms used as a tool** (`on Slack`, `on YouTube`, `on LinkedIn`, `via WhatsApp`) and **JSON keys** (`"twitter":`) are not companies; as an employer they are.
- **Found**: GmbH / AG / Ltda / Pty / ... and accented letters, all-capital names, `Company:` / `Organisation:` keys, the employer after "joined", names with `&`, and organisations (hospitals, universities, schools, institutes, government bodies).
- **The dot of `Inc.` / `Ltd.` / `Corp.`** stays in the label; **one company, one label** (no extra `Tata` / `Mahindra`).
- **Company <-> plain word** is Overscrubbed; the mistake check follows all of the above.

## 11.4.14 - October 2026

Found by a new end-to-end test of the whole page (`tests/dom_e2e.js`: a review page with the 13 chips, every kind of value suggested, highlighted, then labeled right and wrong):
- **E-mail addresses were never highlighted on the page.** The engine suggested them, but the highlighter skipped any word that looks like a web address (ends in `.com`, `.io`, ... or holds `://`), which every e-mail does. The same check hid the password inside a connection URL, dotted usernames (`kavya.nair`), fediverse handles and the `demo.com` piece of a wrapped e-mail. The check now applies only to labels that must never sit inside a link (names, companies, Overscrubbed, ...); e-mails, credentials, IPs, usernames, accounts and phones, and any suggestion that is the whole word, are highlighted. This bug predates the 11.x work.
- **Wrapped links next to a long line**: a link broken mid-word was joined only when its line was (nearly) the longest line of the whole document; one long line anywhere (a JSON blob, another URL) stopped it. It is now judged against the lines around it, and a mid-word break followed by a lowercase `-` / `_` piece (`inst` + `allation-steps`) is joined.

## 11.4.13 - October 2026

- **Overscrubbed: version numbers are not dates.** In a package-lock.json, `"@babel/helper-plugin-utils": "^7.12.13"` (identical on both sides) got `12.13` as Overscrubbed: the changed-date rule took `7.12.13` for a date and compared it with another line of the left that only differs in its version (`"^7.18.10"`). Now a line that is on the left unchanged is skipped, and a version (after `^ ~ v = < >`, after a `version` key, or with an impossible day / month such as `4.17.20`) is never a date.

## 11.4.12 - October 2026

- **Integrity hashes are Credentials.** The base64 SHA in `"integrity": "sha512-..."` (package-lock.json), `sha384-` / `sha256-` / `sha1-` (`<script integrity>`) is labeled (the hash only, not `sha512-`), checked against the algorithm's length. A hash wrapped over several lines gets one label per line. Hex SHAs were already labeled.
- **Highlighting**: a suggestion that starts or ends with a non-word character (`...3g==`, `@rahul_92`, `+91 98450 12345`) is now highlighted on the page; the old word-boundary match missed it.

## 11.4.11 - October 2026

- **Person Username: types in code are not usernames.** In a schema such as `username: Attribute.String;` the type `Attribute.String` was taken for the user's name, and every `Attribute.String` in the file was highlighted. An unquoted type or reference after a username / user / handle key (`Attribute.String`, `UserEntity`, `string`, `models.CharField(...)`) is now skipped; a quoted value (`username: "rahul_92"`) still counts, also behind `config.username`.

## 11.4.10 - October 2026

Account Number and financial Credentials:
- **IBANs are Account Number** (checked with their checksum), with or without spaces; before, part of a spaced IBAN was Credentials and a compact one got nothing.
- **US routing (ABA) numbers are Credentials** (checked with their checksum), behind Routing / ABA / RTN.
- **An account behind `Account #` or `Account` (no colon)** is found; `Account #: 000123456789` was labeled International Phone Number.
- **Amex cards** (`3782 822463 10005`) and **Bitcoin wallets** (`1…`, `3…`, `bc1…`) are Credentials.
- **No second label inside an account number**: the first 12 digits of `3456 7890 1234 56` were also Credentials.
- The mistake check accepts an IBAN as Account Number and flags a routing number labeled Account Number.

## 11.4.9 - October 2026

Date (date of birth):
- **More formats**: `1988-11-05` behind a plain key, `5th November, 1988`, `November 5, 1988`, `05-Nov-1988`.
- **More keys**: `Born:`, `Birthday -`, `dateOfBirth`, a `dob` column in a CSV / tab file, the short `b.` (`Rahul (b. 05-11-1988)`), and Hindi / Indonesian / Portuguese / Spanish keys (`Janm Tithi`, `Tanggal Lahir`, `Tgl Lahir`, `Data de Nascimento`, `Fecha de Nacimiento`).
- **Only full dates**: a month + year or a year alone is not a DOB; the mistake check flags a Date label on one. A date of death is not labeled.
- **A renamed DOB key** is Overscrubbed and the unchanged date stays a Date; **a DOB replaced by a word** is Overscrubbed.

## 11.4.8 - October 2026

Credentials (every government ID and secret of the Complete PII Type List):
- **Found for the first time**: SSN, passports (US, India, any country), US and UK driver licences, Aadhaar with dashes, the old voter-ID format (`AB/12/345/678901`), the token after `Bearer` (non-JWT), Google OAuth `GOCSPX-`, GitLab `glrt-` / `glptt-`, Docker `dckr_pat_`, secrets with `=` or `:` inside (base64, `id:secret`, Firebase server keys), secrets behind `secret` / `credentials` / `signature`, passphrases with spaces.
- **Brevo `xkeysib-` keys** are labeled whole (only the middle was).
- **Connection URLs**: only the password is labeled; `mongodb+srv://app:Pa55w0rd@...` no longer gives an e-mail and a company, `https://user:pass@...` no longer a URL/Link.
- **Private key blocks**: the key lines are labeled, one per line, not the BEGIN / END lines.
- **Placeholders** (`YOUR_API_KEY_HERE`, `<your-token>`, `xxxx`) are not credentials.
- The mistake check flags a whole connection URL (only the password), a BEGIN / END line and a placeholder.

## 11.4.7 - October 2026

Address:
- **The label runs to the end of the address** for every country: unit, city, state and postcode were cut off (`221B Baker Street, Apt` → `…, Apt 4, London NW1 6XE`; `10 Downing Street, London SW` → `… SW1A 2AA`; Sao Paulo, Jakarta, New York the same).
- **New forms found**: `Parkway` and other road words (`1600 Amphitheatre Parkway, Mountain View, CA 94043`), German streets (`Hauptstrasse 5, 10115 Berlin`), village addresses (`Village Rampur, Post Sadar, Dist. Gorakhpur, UP 273001`), PO boxes.
- **Wrapped addresses**: the first line no longer carries its key ("Ship to: "), a break in the middle of a word is joined, and a city + postcode line of any country ("London NW1 6XE") belongs to the block.
- **Place names inside an address are not people** (`Anna Salai`, `Baker Street`, `Sao Paulo` were Person Name); the mistake check flags a Person Name label on them.
- **A company first**: `Infosys Ltd, …` → `Infosys Ltd` is the Business Name, the rest the Address.
- **Quoted CSV cells**: `1,"12, MG Road, Pune 411001"` no longer gets an extra label with the row number and quote.
- **An address replaced by a word (or the reverse) is Overscrubbed.**

## 11.4.6 - October 2026

Person Username:
- **Capitalised handles are handles**: `Follow @RahulVerma`, `@RahulVerma92` and `@Priya` at the start of a line were taken for code annotations and skipped.
- **Hyphens**: `@rahul-verma` was cut to `@rahul`.
- **Group mentions are not people**: `@here`, `@channel`, `@everyone`, `@all` were labeled.
- **Code is told apart by position, not spelling**: Python decorators (`@staticmethod`, `@dataclass`, `@app.route(...)`, `@pytest.fixture`, `@login_required`) and Vue directives (`@click`) were labeled; Java / Kotlin / TypeScript annotations stay unlabeled.
- **Fediverse handles** (`@priya@mastodon.social`) are one Person Username, not an e-mail.
- **Usernames behind a key** (`Username: rahul_92`, `"login": "kavya.nair"`, a Username column) are labeled; generic accounts (`user: Master`, root, admin, postgres, ...) and dictionary words are not.
- **A handle replaced by a plain word is Overscrubbed.**
- The mistake check uses the same rules.

## 11.4.5 - October 2026

IP Address:
- **A full stop after the address** no longer hides it (`Ping 8.8.8.8.`).
- **Both ends of a range** are labeled (`10.0.0.1-10.0.0.50`: the second one was missed).
- **IPv6**: `::` in the middle (`fe80::1ff:fe23:4567:890a`), a network-card suffix (`%eth0`, not labeled), an IPv4 tail (`::ffff:192.168.1.10`), a closing `::` before a range suffix (`2001:db8::/32` → `2001:db8::`) were all missed.
- **Version numbers with a version word after them** (`10.2.0.15 build`, `4.18.0.2 release`) are not IP addresses; the mistake check flags an IP label on them.
- **An ordinary word replaced by an IP address is Overscrubbed** (`Server alpha` → `Server 10.1.2.3`).
- Unchanged by choice: the port and the range suffix stay outside the label; loopback, `0.0.0.0` and masks are labeled as before.

## 11.4.4 - October 2026

Overscrubbed:
- **Words joined by `_` are split**: `calculate_total` → `calculate_zelvor` got no label (an older rule took it for a person's handle like `kartik.nayyar`); now `zelvor` is Overscrubbed.
- **camelCase / PascalCase parts are isolated**: `getUserVelmora` → `Velmora`, `QuarvinService` → `Quarvin`, `maxZelvoCount` → `Zelvo` (the whole name was labeled, or nothing).
- **A value replaced by another kind is Overscrubbed**: a number, phone, e-mail or link replaced by a plain word (`12345` → `hello`). The same kind (`12345` → `00000`, `Hemant` → `Alex`, one e-mail for another) stays correct redaction.
- **Changed ordinary dates are Overscrubbed** on their changed part (`19 April`, `19-04`); only a date of birth may be scrubbed. Before, only a changed month word was labeled.
- **Mistake check**: an Overscrubbed label on a changed DOB, or on a number / phone / e-mail replaced by the same kind, is flagged; an Overscrubbed label on a changed ordinary date is accepted.

## 11.4.3 - October 2026

Email Address:
- **An apostrophe in the name part** is part of the e-mail: `sean.o'brien@initech-demo.com` was labeled as `brien@initech-demo.com`.
- **Invalid addresses** (`priya.@...`, `priya..r@...`, `.priya@...`) are not e-mails.
- **Placeholders by domain only.** `test@`, `user@`, `email@`, `name@`, `sample@` on a real company domain are now labeled; addresses at `example.com`, `test.com`, `domain.com`, ... are still skipped.
- **An e-mail broken over two lines** is found (inside the domain, before the `@`, or after a `. _ -` in the name); each line's piece is labeled.
- **Hidden addresses** (`[at]`, `(at)`, `{at}`, `[dot]`, or `first.last at company dot com`): the person's name gets Person Name and the company gets Business Name when the same hidden address is on both sides. Mailbox names (support, hr, ...) and webmail providers (gmail, outlook, ...) are left out.
- **The mistake check uses the same rule as the suggestions**: an Email label on `priya@example.com` or `icon@2x.png` is now flagged (it was accepted).

## 11.4.2 - October 2026

- **URL/Link: links to documents are labeled again**: `.pdf .doc .docx .xls .xlsx .ppt .pptx .csv .txt .md` may hold personal data. Other file links (styles, scripts, images, fonts, archives, media, data, code) stay unlabeled.
- **URL/Link: Google Drive / Docs / Sheets / Slides / Forms links** are covered by tests in every form (plain, Markdown, table, JSON, with `#gid=` / `?usp=`), and a link broken in the middle of its long document id (`.../d/1AbCdEfGhIjKlMn` + `OpQrStUvWxYz0123456789`) is now joined.
- **Phones: only the fictional US range 555-0100 to 555-0199 is skipped.** Other 555 numbers (`(415) 555-0232`, `+1 415-555-7788`) are labeled. `415.555.2671` is no longer read as a version number.

## 11.4.1 - October 2026

- **Suggestions follow the label chips on the page.** The dashboard currently shows the 13 old chips, so there a phone is suggested as `Contact Number` (Indian mobiles and every other phone number, which 11.4.0 now finds), postal codes are not suggested, and a phone labeled Contact Number is correct. The new labels (Indian Mobile Number, International Phone Number, Postal Code, ...) are used only when their chips are on the page. The 13 old labels are always kept.

URL/Link:
- **Wrapped links are found wherever the line breaks.** Before, a link was only joined when its line ended in `/ - _ = & ? % ~ +` and the next line looked like a path. Now a break mid-word (`.../inst` + `allation-steps`), before the domain ending (`acmecorp-demo` + `.io/guides`) or inside a query (`?ref=ema` + `il&id=42`) is recognised too. A word joined by `-` or `_` counts only when the link's line is (almost) the longest line, i.e. it was really wrapped; a plain word counts only when the left document has the whole link on one line. List markers, brackets, `e.g.`, other links and capitalised words never continue a link.
- **Links to files are not labeled**: styles, scripts, images, fonts, archives and packages, documents, audio and video, data and config, and code files (the full list is in GUIDELINES.md 5.9), judged on the end of the path before `?` / `#`. Pages (`.html`, `.php`, `?file=a.pdf`) and GitHub / GitLab / Bitbucket repositories are still links. The mistake check flags a URL/Link label on a file link.

## 11.4.0 - October 2026

New label set (Complete PII Type List), Contact group. Scope column of the list is not followed: every type is labeled.
- **Phone numbers are split.** `Indian Mobile Number` (10 digits starting 6-9, optional +91 / 91 / 0) and `International Phone Number` (every other phone: other countries, Indian landlines, toll-free). The country code and brackets are part of the label. Non-Indian numbers are found for the first time (`+1 (415) 732-0198`, `+44 20 7946 0321`, `(11) 3456-7890`, `0812-3456-7890`); a bare run of digits only after a phone word. Dates, IPs, SSN, CPF, EIN, ZIP+4, CEP, card and Aadhaar numbers are excluded. The US-555 placeholder rule no longer hides numbers that start with 0 (`(021) 5551234`, Jakarta).
- **Postal codes are labeled** when a key or a table / CSV column names them: `Postal Code`, `Indonesian Postal Code` (kode pos), `Brazilian CEP`.
- **Partial addresses count.** A street on its own (`MG Road`, `221B Baker Street, London`, `Rua Augusta 1500`, `Jl. Sudirman No. 12`) is an Address, with the place names that follow it on the line. A city, state, country or postal code alone is not.
- **Mistake check** knows the new labels: a mobile labeled International (or the reverse) is a mistake, a phone labeled with the old `Contact Number` chip is shown with the right new label, a postal code labeled Address is shown as Postal Code.
- **All ~80 chip names** of the new label picker are read. Labels that share a colour are judged for every label of that colour (11.3.6); when all are wrong the badge names them all. Built-in chip colours are only used for chips that are on the page.
- Tests: new `tests/contact.js` (90 cases); older tests moved from Contact Number to the new phone labels.

## 11.3.6 - October 2026

- **Labels that share a colour are no longer guessed. The check judges every candidate label: real mistakes are still flagged, unclear cases are marked 'unsure' and counted as not checked.** When two labels have (almost) the same colour (within a margin of 6), the check no longer picks the first chip. If the label dialog knows the words, that label is used. Otherwise every candidate is judged: all wrong -> a real mistake; all correct -> fine; mixed -> `data-ptc="unsure"` (amber dashed outline, badge "A / B ?", hover card explains), not a mistake, and included in "not checked" (bar, tooltip, Alt+Shift+D and the popup status carry the new `ambiguous` count). Palettes without ties behave exactly as before.

## 11.3.5 - October 2026

- **Bar now shows how many labels could not be checked; a crash or unreadable label no longer looks like all-clear.** The mistake check counts labels it could not judge (`errors`: the judge crashed; `unread`: a `<mark>` whose colour could not be read) and shows "N Mistakes (+K not checked)", or "0 mistakes, K not checked" in the existing warning colour when there are none. A crash is still not flagged as a mistake. The bar tooltip, Alt+Shift+D diagnostics and the toolbar popup list the counts (checked, mistakes, errors, unread, too short, too long). Labels of 1 character or over 250 characters are counted as skipped, but are not part of "not checked".
- **Links:** a link that a PDF wrapped over several lines is recognised (each line's piece is labeled, since a label cannot span lines); an e-mail or IP address that only occurs inside a labeled link is not a second label; brackets that belong to a link stay in it (`.../Heat_(film)`) while brackets around a link are dropped; a link followed by "." or "," is now highlighted on the page.

## 11.3.4 - October 2026

From the PROJECT.md screenshot (settings table):
- **"Meta token" was a Business Name; only "Meta" is.** A brand followed or preceded by ordinary words is labeled as the brand alone ("Meta token" -> "Meta", "Google Ads account" -> "Google"). Full company names with a corporate suffix are never trimmed ("Evergreen Agro LLC", "Tata Consultancy Services").
- **Scrubbed recipient handles were Overscrubbed:** "kartik.nayyar" -> "Jordan.Miller", "Rahul.chaturvedi" -> "Morgan.Bennett", "karthik.nair" -> "Casey.Wilson", "mubarak.shah" -> "Jamie.Parker". A dotted / underscored person handle replaced by another is a scrubbed name (no label). Constants like API_KEY -> BRYENA_STELWICK are still Overscrubbed.
- The table is now a permanent test (`tests/matrix.js`, 69 documents). Fresh mass round: 25,000 / 25,000.

## 11.3.3 - October 2026

Person Name logic checked again on code files (Vue, PHP, JS, YAML, SQL, CSS, JSON manifests):

- The Vue screenshot (`<input name="WEBSITE">`, `name="CHECKSUMHASH"`) gives no suggestions with v11.3.2 and later (fixed there; the screenshot was taken with an earlier version).
- New mass-test categories for code files: identifiers and attribute names in 12 code patterns (HTML attributes, labels, env constants, JSON / YAML `name:`, PHP `use`, JS `import`, SQL columns, Vue `name:`, PHP methods, CSS classes) must never be Person or Business Name; real author names in comments / manifests (`// Author:`, `@author`, `"author":`, `Signed-off-by:`) must be Person Name; setting words behind key-like names (`id-token: write`) must not be Credentials.
- The first round found one more problem, now fixed: **camelCase / PascalCase identifiers after `name:` were Person Names** (`name: 'userService'`, `name: checkoutForm`). Compound identifiers are never person names (real names with internal capitals - McDonald, MacArthur, DeSouza, VanDyke - still are).
- Mass test after the fix: 20,000 + 25,000 new documents, 100% correct; code-file categories 859 / 859.

## 11.3.2 - October 2026

**Mistake check: real cause found.** The review screen is a modal window (`role="dialog"`). Since v11.2.1 a rule that skips the screen's own controls ("anything inside a dialog or header is a control") also matched that modal, so **every label in the document was skipped** - the bar showed "labels not readable" and no mistake was ever flagged. v11.0.1 did not have that rule, which is why it worked. Controls are now only skipped when they are outside the document (a `<button>`, or a menu / popover / header that does not contain the document). Test: the Chrome extension build inside a `role="dialog"` modal - v11.3.1 fails it, v11.3.2 passes.

Wrong suggestions fixed:
- **YAML permissions as Credentials**: "id-token: write", "pages: write" - "token" looked like a credential key. A plain dictionary word ("write", "read") is never a credential value.
- **HTML attribute names as Person Name**: `<input name="WEBSITE">`, `name="CHECKSUMHASH"` - the value of a `name=` attribute is a field name; ALL-CAPS identifiers and snake_case words are never person names (unless a known name).
- **"github" in "github-pages"** was a Business Name; brand names inside hyphenated identifiers are ignored.

New permanent cases in `tests/matrix.js` (68 documents) for the YAML, Vue and PHP files from the screenshots.

## 11.3.1 - October 2026

- **"Annotate here" flagged as a wrong Person Name again** (title row of `right.gitkeep-...`). The chip contains an icon next to the words, so its text was not exactly "Annotate here" and the v11.2.1 rule missed it. Now nothing in a pane's title row is ever checked: short controls that contain "Annotate here" / "read-only" / "Submit for review", and every element in the row that holds the file name (`left.xxx-1a2b3c` / `right.xxx-1a2b3c`). Only labels inside the document text are judged. Nothing else changed.
- Test extended with this exact title row (icon inside the chip): v11.3.0 fails it, v11.3.1 passes (label check 45/45).

## 11.3.0 - October 2026

The mistake check is made independent of how a browser reports colours, so it works the same in Chrome, Edge, Brave, Safari and Firefox:

- **Built-in label colours.** The dashboard's 13 label colours (measured on the live page) are built in. Colours read from the label chips are used first; any chip that cannot be read falls back to the built-in colour, so labels are recognised even when no chip can be read.
- **Labels learned from the dashboard's own label dialog.** When "Change label for "..."" opens on a label, or you click Apply, the auditor records which label is on which words. A label whose colour cannot be read at all is still checked.
- **Chrome extension popup fixed.** Without a host permission Chrome hides the tab address from the popup, so the popup always said "Open a review task" and never showed the mistake count. The manifest now has `host_permissions` for dashboard.peaktalent.ai (and `activeTab`).
- **"Copy diagnostics" button in the extension popup** (and Alt+Shift+D on the page): browser, extension or userscript, how many label colours were read from the chips, the raw colours of the first labels on the page, which label was read for each, and the verdict. If a label is ever not checked, this report shows why.
- **Bar hint:** when labels are on the page but none could be read, the bar says "labels not readable" instead of silently showing no mistakes.
- New tests: built-in colours when chips are unreadable, label learned from the dialog when the label has no readable colour, and the actual Chrome extension build run with a chrome.runtime stub (label check, popup status, popup diagnostics).

## 11.2.3 - October 2026

- **Mistake check did not work in the Chrome extension (it did in Safari).** The check recognises your labels by their colours, learned from the label chips. Safari reports colours as `rgb(...)`, but Chrome reports modern CSS colours in their own notation - `oklch(...)`, `rgb(235 47 150 / 0.18)`, `color(srgb ...)` - which the old colour reader could not read. In Chrome no label colour was recognised, so no label was ever checked. Colours are now read in every CSS notation (rgb/rgba old and new syntax, hex, hsl, oklch, oklab, color(srgb / srgb-linear / display-p3)), with the browser converting anything else (lab, lch, named colours).
- New real-page test `tests/dom_chrome_colours.js`: the page reports its colours the way Chrome does (oklch, modern rgb, color(srgb)); a wrong label is flagged with the correct label and a correct label is recognised, in all three notations (9/9). v11.2.2 failed these.

## 11.2.2 - October 2026

- **Chrome: "Manifest file is missing or unreadable".** The extension itself was valid, but its `manifest.json` sits in the `extension/` sub-folder, so choosing the unzipped project folder (or the folder above the extension) in **Load unpacked** failed. Now:
  - a separate download **PeakTalent-Auditor-Chrome.zip** unzips to one folder with `manifest.json` directly inside;
  - the project folder itself also has a `manifest.json` (pointing to `extension/`), so loading the whole project works too;
  - the build checks both manifests (valid JSON, Manifest V3, every file they name exists).
- README: clearer Chrome steps and what the "manifest missing" message means.

## 11.2.1 - October 2026

- **Mistake shown in the wrong place.** On the review screen the light-blue **"Annotate here"** chip in the right pane's header was read as a Person Name label (its colour matches the Person Name chip) and flagged "Person Name -> No label", so the bar showed "1 Mistake" although your labels were correct. The label check now ignores the review screen's own controls: "Annotate here", "Reference - read-only", file names (`right.md-...`), label chips, counters ("2 annotations", "2 matches in the left document"), buttons, dialogs and menus. Only labels inside the document text are checked.
- New real-page test with the exact case (README "# Droom Chat", "Droom" labeled Business Name twice, header with file name and "Annotate here"): v11.2.0 failed it, v11.2.1 passes. Label-check suite: 45/45.

## 11.2.0 - October 2026

**Deep Person Name / Business Name campaign: 2 lakh generated documents, 100% correct.** New `tests/mass.js` (see TEST_REPORT.md). The first round scored 96.85%; everything it found was fixed:

Person Name
- International names were missed (Wei Zhang, Hannah Fischer, Mateo Garcia, Omar Haddad): ~350 common international given names and surnames added.
- Surnames that are also brands ("Dhruv Bajaj"): the full name is a Person Name; "Bajaj" alone after a first name is a Person Name, not a Business Name ("works at Bajaj" stays Business).
- "Hi" was labeled Person Name when the first name after it was scrubbed ("Hi Priya Khan" -> "Hi Delvarsel Khan").
- Companies after greetings ("Hi Silverline Labs") were Person Name; phrases ending in a corporate suffix are never a person.
- Software / places / languages / months in name fields ("Candidate Name: Excel") and ordinary words ("Candidate Name: Friends") were Person Name.
- A plate in a table cell ("| Vehicle No | KL 61 HU 6444 |") was Person Name: text with digits, @ or a plate format is never a person.
- Replaced ordinary words in name slots ("Dear Parent" -> "Dear Torravar", "Candidate Name: Support" -> ...) are now Overscrubbed.
- Scrubbed name lists with international names, or a repeated surname, no longer give Overscrubbed.

Business Name
- Companies named with dictionary words ("Pinnacle Software", "Evergreen Agro Traders") are recognised in a company context (Vendor:, Client:, Bill To, works at, offer letter from, signed the NDA, ...) or with a legal suffix (Inc, Ltd, Pvt Ltd, LLC ...); scrubbed ones are correct redaction (no Overscrubbed).
- "Hi Silverline Labs" no longer becomes a Business Name with "Hi" in it; Jira, Excel, Photoshop, languages and places are never Business Names.

Other labels
- PANs starting with "MD" were rejected as GitHub node ids; Indian mobiles containing "555" were rejected as fake US numbers.

All suites pass: 266 rule checks, 65 realistic documents, 227 + 238 label checks, 11 exact documents, 2 lakh mass documents, 7 + 6 + 44 page checks, stress test (1,295 odd documents, 0 crashes), code checker 0 problems.

## 11.0.1 - October 2026

- **Diagnose button removed from the floating bar** (as requested). The bar now shows only the status and Stop / Start. The diagnostics panel is still available with the keyboard shortcut **Alt+Shift+D** for bug reports.

## 11.0.0 - October 2026

**New label check (mistake indication), rebuilt from scratch** for the live dashboard's own label markup (`<mark role="button">` with a coloured background and underline, as shown by its Diagnose report).

Logic - after **every** annotation (add, change, remove), every label you placed is judged:
1. the auditor's own suggestion for exactly that text decides the correct label (e.g. a word that should be **Overscrubbed** but is labeled **Date** -> "Date -> Overscrubbed");
2. otherwise the guideline rules: unchanged text -> No label; replaced name / company / address / credential / code -> No label; replaced ordinary word -> Overscrubbed (changed part only); an Overscrubbed label that also covers unchanged text -> "Overscrubbed: <changed part>"; entity labels must have their format (e-mail, https link, IP, phone, plate, @username, 9-18 digit account, complete address, date of birth only) and must not be ordinary words, languages, field names or JSON keys.

UI:
- red dashed outline + a tag above the word: **your label -> correct label**;
- hover card: text, your label, correct label, reason;
- bar: "N to Annotate - N Mistakes" (red); click it for the list of mistakes, click an item to jump to it (prev / next buttons);
- the extension popup shows the mistake count again.

Fixes found while building it:
- **A label drawn inside one of the auditor's suggestion spans was deleted** when suggestions were refreshed (spans were replaced by plain text). Spans are now unwrapped, keeping everything inside them, and only the touched elements are normalised.
- A very light label colour (Overscrubbed, 255/227/227) "matched" other labels' tints (Business Name was read as Overscrubbed). Colour matching now requires every colour channel to fit.
- The check never adds text to the document (the tag is drawn with CSS), never changes the page's own classes or styles (it uses its own attributes), and is invisible to the change detection (no feedback loop).

Tests: `tests/dom_labelcheck.js` - 44 real-page checks with the live markup: all 13 labels correct (no mistake) and wrong (mistake naming the correct label), 9 kinds of text that must stay unlabeled, the reported Overscrubbed-labeled-as-Date case, re-check after changing the label (fixed -> mark disappears, changed again -> flagged again), removing a label, partial Overscrubbed labels, a label inside a suggestion span, several labels at once, the mistake list, and that the document text is never modified.

## 10.7.0 - October 2026

**The mistake check was removed completely**, as requested. The auditor now only suggests labels (the dotted underlines and the "N to Annotate" count).

Removed:
- the red outline / "MISTAKE" tag on labels and its hover tooltip;
- the "Mistakes" count on the floating bar and in the extension popup;
- the rules that judged your labels, the reading of labels painted without elements (CSS highlights, overlay boxes), and the learning of labels from the platform's label dialog;
- the mistake-check test suites (8 files).

Kept:
- all suggestion logic, unchanged (all suggestion suites pass with the same results);
- the reading of your existing labels for one purpose only: a word you already labeled correctly does not get a second suggestion drawn inside it;
- the Diagnose button, now a short report (version, panes, suggestion count, last error);
- clean-up of red marks that older versions may have left on an open page.

New test: `tests/dom_nomistakes.js` (5 checks).

## 10.6.3 - October 2026

**Root cause found** thanks to the Diagnose report from the live dashboard ("exclusive" labeled Date, no red outline):

- The report showed the auditor **did** recognise the label ("exclusive" -> Date, from its colour) but the mistake check said "241 candidate elements, **0 of your labels recognised**".
- PeakTalent draws every label as a **clickable `<mark role="button">`**. The mistake check had a rule "skip anything inside a button" (meant for toolbar buttons), so it skipped **every** label on the page. That is why no mistake was ever flagged.

Fixes:
- Button / toolbar checks now apply only to elements **outside** the right document. Every `<mark>` label inside the document is checked.
- The dashboard draws the underline as a `linear-gradient` background image; those colours are now read too, so very light label colours (Overscrubbed) are recognised reliably.
- The Diagnose report now lists **why** candidates were skipped (by reason), so a problem like this is visible immediately.

Test: `tests/dom_marks.js` rebuilds the live markup exactly as reported (`<mark role="button">`, inline translucent background + gradient underline, palette from the chips). "exclusive" as Date -> red outline; "exclusive" as Overscrubbed -> red outline; "Beagenhydra" as Person Name -> red outline; correct Overscrubbed marks -> no outline. v10.6.2 fails 3 of these 5; v10.6.3 passes all 5.

## 10.6.2 - October 2026

Reported again with v10.6.1 installed: "exclusive" labeled **Date** shows no red outline. The decision rules flag it; the auditor still cannot see how the live dashboard draws that label. This release adds a way to know your label that does not depend on the page's markup at all, plus a one-click diagnostics report.

- **Labels learned from the platform's label dialog.** When you click **Apply** in "Change label for “exclusive”" (or pick a label name from a label menu), the auditor records which label you chose for which words and checks it with the same rules. A wrong label gets a red box over the words. This works however the dashboard paints labels.
- **The auditor no longer overwrites the platform's own label styling.** Earlier versions removed `title`, background, border, shadow and outline from label elements when clearing old mistake marks, and wrote inline outline styles onto them. That could erase the label's own colour (so the next pass could not recognise it) and its tooltip. Only the auditor's own attributes are touched now; the red outline comes from the auditor's stylesheet.
- **Diagnose button** on the floating bar (also Alt+Shift+D): opens a panel with a **Copy** button. The report shows the panes found, the label colours read from the chips, every word recognised as labeled and the verdict, CSS highlights, labels learned from the dialog, and the page structure around them. Copy it and paste it in a message for any page where a mistake is not flagged. Nothing is sent anywhere.

Tests: `tests/dom_dialog.js` (5: the exact screenshot flow - dialog + Apply on "exclusive" as Date -> red box; correct label -> none; label picked from a menu; diagnostics report contents). All earlier suites pass.

## 10.6.1 - October 2026

Reported: "exclusive" (unchanged on both sides) labeled **Date**, but no red mistake outline.

The decision rules already treat this as a mistake (in tests every label on unchanged text is flagged). What can fail on the live page is **finding your label at all**, so this release makes that robust against every way an editor can draw a label:

- **Labels drawn with CSS classes** (colour in a stylesheet, no inline style or data attribute): recognised by the chip-colour palette. Changing a label (e.g. Overscrubbed -> Date) only swaps a class, which did not change the auditor's "has anything changed" snapshot, so the check was skipped. Now **any change inside the right document forces the mistake check to run again**.
- **Labels painted without an element around the words**:
  - the CSS Custom Highlight API (`CSS.highlights`), used by modern editors: the highlight's name ("date", "annotation-overscrubbed", ...) or its colour gives the label, its ranges give the text;
  - coloured boxes positioned over the text: found by colour, the words under them read from the page.
  A wrongly labeled range gets a **red box drawn over the words** (it follows scrolling), counted in the bar's "Mistakes".
- Two filters that could hide labels from the check were too broad: any ancestor whose class contained "nav" (also matches "canvas", "unavailable") skipped every label; labels taller than 40 px (wrapping onto a second line) were skipped. Fixed.
- **Alt+Shift+D** now also lists the CSS highlights on the page and every label found without an element.

Tests: `tests/dom_classlabels.js` (4: class-only labels, label change by class swap), `tests/dom_rangelabels.js` (5: CSS highlights and overlay boxes, wrong -> red box, correct -> none). All earlier suites pass.

## 10.6.0 - October 2026

**The mistake check (red outline) was rebuilt from scratch.** Reported case: in a package.json that is identical on both sides, the reviewer labeled the JSON key "dependencies" and no red outline appeared.

Two parts were rewritten:

1. **Reading your label from the page.** The old code only knew Ant Design colours and a few attribute names. The PeakTalent dashboard draws labels in its own colours, so labels drawn only with colour (no data attribute) were not recognised and never checked. The auditor now **learns the label colours from the label chips at the top of the review screen** (Account Number, Address, ... Vehicle Number Plate) and matches each labeled word's background / underline / border to them, including lighter tints. Works whatever markup the platform uses.

2. **Deciding whether the label is wrong** - 300 lines of overlapping special cases replaced by these rules, in order:
   - If the auditor suggests a label for exactly this text, your label must be that label ("should be labeled X, not Y").
   - **Overscrubbed** is wrong when: the text is identical on the left (nothing changed); it replaced a name, company, address, credential or reference code (correct redaction); the label also covers unchanged text ("Galeonorb-Ins/VDRs" -> label only "Galeonorb"); it is inside a changed link or e-mail.
   - **Any other label** is wrong when: the text is not on the left (a replacement value gets no label); it is a field name / JSON key / column header; it is an ordinary word, place or language; it has the format of a different label (an e-mail labeled Credentials, a phone labeled Account Number); it does not have the label's format (IP, phone, plate, @username, https link, 9-18 digit account, complete address, date of birth only); a person's name labeled Business Name; a bank or software name labeled Business Name.
   - Otherwise the label is accepted - no false alarms when unsure.

Also:
- Pane text is rebuilt with line breaks where the browser does not provide them.
- **Alt+Shift+D** now also prints the label colours learned from the chips and, for each coloured/underlined word in the right document, which label the auditor read. If a label is ever not recognised, that output shows why.

Tests: new `tests/dom_palette.js` (26 checks: every label drawn only with colour, as underline and as background, on the "dependencies" key). `tests/dom_labels_deep.js` grew to 43 checks with the new rules. All earlier suites pass unchanged.

## 10.5.5 - October 2026

Second deep per-label campaign: a new, independent set of 238 label checks (`tests/labels_deep.js`) and 33 real-page mistake checks (`tests/dom_labels_deep.js`), written from scratch on different documents than 10.5.4's suites. They found 9 more problems, all fixed:

- **Account Number**: in a table row "| Account Number | 112233445566 |" the 12-digit value was labeled Credentials. An account-number key (also in the cell before) now wins over the 12-digit Credentials rule.
- **Address**: an address inside a sentence ("Delivered to 5th Floor, Cyber Towers, HITEC City, Hyderabad 500081 yesterday") was labeled with the surrounding words; now only the address is labeled. Multi-line addresses starting "No. 45, 2nd Cross, ..." are recognised (house number "No. 45", "2nd Cross", "5th Main").
- **Any label**: a label spanning two lines could be suggested; it can never be highlighted on the page, so it is no longer produced.
- **Contact Number**: "tel:+919876543210" was missed (and its 12 digits labeled Credentials). Money is no longer a phone number ("Amount 7000000000 INR"); six identical digits in a row are not a phone.
- **Person Username**: "@2x" (image suffix) was labeled; handles must start with a letter.
- **Mistake check**: a scrubbed name labeled "Overscrubbed" by the reviewer was not flagged. Names replaced on the right are now remembered per page and a reviewer's Overscrubbed label on them gets the red outline.

All suites: 266 rule checks, 65 realistic documents, 227 + 238 label checks, 11 exact documents, 7 + 6 + 4 + 29 + 33 real-page checks. Fuzz: 1,295 odd documents, 0 crashes.

## 10.5.4 - October 2026

Deep per-label testing. New test suites cover all 13 labels; see `TEST_REPORT.md`.

- `tests/labels.js`: 227 checks. For every label, values that must get the label, scrubbed values that must get nothing, and look-alikes that must never get that label.
- `tests/exact.js`: 11 whole documents whose labels must match exactly (nothing missing, nothing extra).
- `tests/dom_labels.js`: 29 mistake-check cases in a real page, two for each of the 13 labels plus three "must not be labeled" cases.

The new tests found 13 problems, all fixed:
- **Account Number**: values in an "Account No" table column, in JSON (`"account_number": ...`) and in CSV columns (`acc_no`) were missed.
- **Address**: an address after a field label on the same line ("Ship to: Plot no. 13, ...") was missed.
- **Business Name**: "Mahindra & Mahindra Ltd" was missed (the "&"). A brand used as a field label ("GitHub: https://...") or inside a link was labeled.
- **Date**: "D.O.B: 03/04/1995" was missed (the dots).
- **Email Address**: "git@github.com:acme/tool.git" (an SSH remote) was labeled.
- **IP Address**: "Section 3.2.1.4" and "Price 1.25.30.40 kg" were labeled. Numbering, prices and units are excluded. Four small parts need network context ("ip", "host", "server", ...).
- **Person Username**: "@SpringBootApplication" (a code annotation) was labeled.
- **Person Name**: "Ma'am" was labeled from a teacher column. Honorifics (Sir, Ma'am, Dr, Smt, Ji, ...) are never names on their own.
- **Credentials**: "Xk9#mPq2!vL7 was rotated after the incident" was labeled as one credential. A credential is one token, never a phrase.
- **Mistake check**: a reviewer's "Person Username" label was read as "Person Name", so a correct label was flagged. The exact label name is now matched first.
- **Mistake check**: labels longer than 50 characters (full addresses, long links) were never checked. The limit is now 220 characters.

## 10.5.3 - October 2026

Fixes from the resume screenshots (Parama Das PDF, Disha Suratwala DOCX).

Wrong Person Name suggestions removed:
- **"Microsoft", "Google"** ("Microsoft Office, Photoshop, Google Ad Words" -> "Microsoft Verorydelt, Pixelforge, Google Ad Words"), **"Bengali"** ("English, Bengali" -> "Beaargale , Bengali") and **"Hon"** ("B.Sc (Hon)"). The "kept part of a scrubbed name list" rule counted any replaced word; it now counts only words that replaced a NAME. Office / Photoshop / English are ordinary words, so their neighbours are not kept name parts.
- **"Thoughtctrl Hindi"** and **"Bengali"**: languages (English, Hindi, Bengali, Tamil, ... 50 languages) are now ordinary words, never names. Replacing a language is Overscrubbed ("English" -> "Beaargale").

Checked and still correct on these resumes: Overscrubbed on every replaced ordinary word (Project, Skills, writing skill, create, groups, communication skills, English, technique, connect, research, creative content, Tuition, Degree, University, School, Higher Secondary, Economics, Office, Photoshop, Internet Applications, Advanced, Illustrator, Software Buildup, experience, social, Digital, college); no label on scrubbed names / institutions (Sister Nivedita, Taki, Asutosh, Taraknath Palit Siksha, Drishti).

New permanent tests: resume cases in `tests/matrix.js` (now 65 documents).

## 10.5.2 - October 2026

Fixes from the Vedantu spreadsheet screenshots (support-ticket export and lecture list). Rebuilt both sheets with made-up names and checked every label.

Wrong labels removed:
- **"Login Related", "Alerady Enrolment", "Vernier Calipers" were suggested as Person Name.** Two causes:
  - the 10.5.1 rule "any two distinctive capitalised words are a name" was too loose. It is removed; names again need a known given name or surname (the list now has ~250 more Indian names, so "Arjun Mehta" and "Imran Shaikh" are still found);
  - an "I am" anywhere on a line ("i am in touch with this parent") made every phrase on that line a name. The key ("I am", "Author:", "Customer Name:") must now sit directly before the name.
- **Scrubbed lowercase names were marked Overscrubbed**: "suganya g" -> "taverwyniel g", "purav mallick" -> "purav devivrenric". New: name columns in tables are recognised (a column where several rows had a name replaced). Changed values in a name column are scrubbed names and get no label.

Missed labels now found:
- **Unchanged names in a name column** ("kalaivani", "bourniya.j") -> Person Name.
- **The kept part of a partly scrubbed name** ("purav" in "purav mallick" -> "purav devivrenric") -> Person Name.

Still correct on these sheets: Overscrubbed on replaced ordinary words (Timing, STUDENT, SESSION, parent, course, Motion, Must-Watch, Discussion, Class); no label on scrubbed names (DINESH RAM, Sakshi, Shankar Sir) or the scrubbed board name (TN State Board -> Orbora Group, Cbse); 16-digit ticket IDs and dates stay unlabeled.

New permanent tests: the two sheets are in `tests/matrix.js` (now 63 documents).

## 10.5.1 - October 2026

Deep logic review. I wrote 61 realistic mixed documents (emails, resumes, .env files, JSON, CSV, server logs, bank statements, medical bills, chat and WhatsApp exports, invoices, KYC forms) and checked every expected label against GUIDELINES.md. The first run found 16 problems; all are fixed and the documents are now a permanent test (`tests/matrix.js`).

Missed labels that are now found (identical on both sides):
- **IP addresses** were never scanned on their own (only inside diffs). IPv4 and IPv6 are now found anywhere; MAC addresses and version numbers ("version 1.2.3.4") are excluded.
- **Contact numbers** written with spaces or dashes: "+91 98450 12345", "99001-22335", landlines "080-2345 6789".
- **Bank account numbers** behind "Account Number:", "A/c No", "Acct No" (9-18 digits) -> Account Number.
- **Credentials in .env / config files**: DB_PASSWORD, AWS_SECRET_ACCESS_KEY, STRIPE_KEY and other prefixed keys. Well-known secret formats (Stripe sk_live_, GitHub ghp_, Slack xoxb-, Google AIza, AWS AKIA, GitLab glpat-, npm_, JWTs) are found whatever key they sit behind, including a renamed key.
- **OTP / PIN at the end of a sentence**: "Your OTP is 482913." (the full stop broke it).
- **Person names** not in the name list ("Arjun Mehta", "Imran Shaikh"): two or three distinctive capitalised words now count, and ~250 common Indian given names and surnames were added. Names followed by a new line ("Sneha Iyer" then "Account Number") are no longer swallowed. Names with initials ("R. Krishnan") and ALL-CAPS name headers on resumes ("RAHUL VERMA").
- **Company names** with more suffixes: Services, Consultancy Services, Labs, Software, Networks, Traders, Pharma, Ventures, Partners, Associates ("Tata Consultancy Services").
- **Vehicle plates** with a Delhi-style RTO letter ("DL 3C AB 1234").

Wrong labels that are now gone:
- "STRIPE" in STRIPE_KEY was labeled Business Name; brand words inside identifiers are ignored.

Checked to stay quiet: tech prose ("Apache Airflow", "Looker Studio", "Azure DevOps", "Kanban Board"), code class names, log timestamps, version numbers, statement dates, scrubbed names/companies/emails.

Open question (unchanged behaviour): when a general date's month is changed ("14 March" -> "22 April"), only "April" is marked Overscrubbed. Tell me if changed general dates should get no label instead.

## 10.5.0 - October 2026 (release)

Final hardening pass. No rule changes; the auditor gives the same suggestions as 10.4.9.

- **The audit can no longer crash on unusual content.** A fuzz test (1,295 documents with odd characters, 20,000-character words, base64 images and random edits) found that a very long unbroken token, such as an embedded image, made the browser reject a text pattern and stopped the whole audit. Every dynamic pattern is now built safely (an impossible pattern simply matches nothing), and tokens over 300 characters are skipped as data.
- **If anything unexpected still goes wrong**, the bar shows "Audit error (Alt+Shift+D)" instead of silently stopping, the same page is not retried in a loop, and Alt+Shift+D prints the error for a bug report.
- **Static analysis:** ESLint (no undefined variables, duplicate keys, unreachable code, unused code, and more) reports 0 errors and 0 warnings on the engine, popup, build script and tests. Four unused leftover functions were removed.
- New permanent robustness suite in `tests/run.js` (144 odd-input combinations plus 40 random edits of real-world fixtures, all must finish without error).
- README lists browser requirements (Safari 16.4+, Chrome/Edge/Brave 100+).

## 10.4.9 - October 2026

More of the same invoice: scrubbed addresses and reference codes get no label.

- **Multi-line scrubbed addresses** ("Bill To" blocks): a changed word on any line of an address block (a short line within two lines of a house number, street, sector, PIN, state or country) is correct redaction, so "Fernthwaite Street", "Zanworth Road" and "Thane" -> "Cryoosvolt" are no longer marked Overscrubbed. A replacement that itself looks like a street ("274 Fernthwaite Street") is also treated as a scrubbed address.
- **Changed reference codes** (GSTIN, invoice/order IDs: letters mixed with digits, 8+ characters) are no longer marked Overscrubbed.
- JSON, code, CSV and long paragraphs are never treated as address blocks, so overscrubs there are still found.

## 10.4.8 - October 2026

Address rule, as specified: a scrubbed address gets no label at all; only a complete address that is identical on both sides is labeled Address.

- **Scrubbed addresses are no longer marked Overscrubbed.** "Plot no. 13, Near Shanti Mandir, Bakhtavarpur Villege" -> "937 Garnthwaite Road" was suggested as Overscrubbed on "Garnthwaite" and "Road". Any change inside an address (house/plot number, street, sector, PIN, city/state) is now treated as correct redaction.
- **An identical piece of a scrubbed address is no longer labeled Address.** "Sector 127, Noida" stayed the same while the street was replaced, and was suggested as Address. An address line is now labeled only when its whole address block (the consecutive address lines around it) is identical on both sides.
- **Identical multi-line addresses are labeled line by line** (e.g. "Plot no. 13, Near Shanti Mandir," / "Sector 127, Noida," / "Uttar Pradesh 201304" / "India") when the block as a whole is a complete address.
- Also shipped: the transcript regression test (`**Name:**` speakers) from the previous report.

## 10.4.7 - October 2026

- **Attendee lists with struck-through names** (`~~Name~~`) or bold markers (`**Name**`): these markers are ignored when comparing, so the scrubbed names after them are no longer marked Overscrubbed.
- **Kept name parts in such lists are labeled Person Name** (e.g. a first name or surname left unchanged in a list where the rest was scrubbed).
- **Surnames that are also English words** (Baker, Rose, Hill) no longer make a scrubbed list of 4+ names look like ordinary text. Short phrases are unchanged, so "Chance R" -> "Yelanando N" is still Overscrubbed.

## 10.4.6 - October 2026

Fix for attendee lists and other runs of names (meeting notes).

- **Scrubbed names in a long list are no longer marked Overscrubbed.** In "Invited Aman Baurasi, Amlen Lakra, ... (20+ people)" the scrubbed names (Prydithalvic, Orinea, ...) were suggested as Overscrubbed. Two causes:
  - the left side had `<u>...</u>` markup around each name and the right side did not, which shifted the comparison; simple inline markup (`<u>`, `<b>`, `<i>`, `<em>`, `<strong>`, ...) is now ignored when comparing;
  - the "this was a name" check only accepted up to 5 words; long lists of names (including lowercase parts like "chhatrapal") are now recognised.
- **Name parts that were kept are labeled Person Name.** In a list where most names were scrubbed, parts left identical on both sides ("Baurasi", "Shivam", "Chowta", "Shrivastav") are labeled Person Name, following the rule "same on both sides -> label it".

## 10.4.5 - October 2026

Fixes for the mistake check (red outline on wrong labels) and a wrong suggestion in PDF statements.

- **Mistake outline now appears when you label a word the auditor had highlighted.** When you select a highlighted word and apply a label, the platform wraps our highlight inside your label. The auditor then (a) threw away the word's text while reading your label, so your label was skipped entirely, and (b) read our own highlight's "Overscrubbed" tag as if it were your label. Both are fixed: our highlights are ignored when reading your label, and the text is kept.
- **Applying or changing a label now always triggers a re-check.** Labels drawn as plain coloured spans were not part of the change detection, so nothing re-ran after "Label updated".
- **The mistake check now agrees with the suggestions.** If the auditor suggests a label for a word, your label on that word is judged against that suggestion ("should be labeled Overscrubbed, not Person Name"). Before, a separate rule could call the auditor's own suggestion a mistake ("Galeonorb ... is a correctly scrubbed business name").
- **PDF statement rows:** "Transfer" -> "Galeonorb" in "Total Transfer-Ins/VDRs" is Overscrubbed even when it is the first cell of a row next to numbers (that shape was mistaken for a vendor table). Business and name guesses no longer override an ordinary original word.
- **New: Alt+Shift+D** prints diagnostics to the browser console: whether the review screen and panes were found, large-document mode, the last run time, and a table of your labels with the auditor's verdict. Useful for bug reports; nothing is sent anywhere.
- New real-page test `tests/dom_audit.js` (applies a correct and a wrong label the way the platform does and checks the outline).

## 10.4.4 - October 2026

- **Code is no longer labeled as Credentials.** In a JavaScript file, `token: function(stream, state) {` was suggested as Credentials because "token" looked like a credential key. Credential values are now checked:
  - typed keys need the right format (Aadhaar = 12 digits, PAN = `ABCDE1234F`, IFSC, VPC ID, card number, CVV, expiry, UPI, voter ID, driving licence, account ID, invocation ID, hash, transaction ID, OTP/PIN);
  - generic keys (password, token, API key, ...) reject code: function calls (`hashPassword(input)`), index access (`os.environ["..."]`), references like `config.apiKey`, placeholders like `${DB_PASSWORD}` or `{{ token }}`, and keywords.
  Real secrets with punctuation (`P@ss(123)!`) are still labeled.
- The same check now also applies to the older credential scans, which had the same problem.
- New regression tests for code files (CodeMirror mode file, config and env lookups).

## 10.4.3 - October 2026

Long documents no longer freeze the browser.

- **Large-document mode.** When the right document is longer than about 60,000 characters (or 1,500 lines), the auditor analyses and highlights only what is on screen plus 150 lines above and below, and follows you as you scroll. The work per audit is now the same for a 5-page and a 500-page document. In tests, a 560 KB document is audited in a fraction of a second per screen in Node; the slower jsdom test browser stays under 10 seconds.
- **The pane text is read without forcing a page layout** in this mode (the browser's `innerText` lays out the whole document first, which is slow on long documents).
- **Fixed two start-up errors** that could stop the script entirely when it was loaded while a review screen was already open (for example with the console build or after reloading the userscript): some internal state was used before it was created. Found by the new real-page test of a long document.
- New test `tests/dom_large.js` builds a 560 KB review screen, checks that only the visible part is processed, that scrolling moves the audit, and that no network requests are made. The build runs it automatically when jsdom is installed.

## 10.4.2 - October 2026

Fixes from real tasks (slide deck, match-rating doc, sports spreadsheet) and a speed overhaul for large documents.

### Labeling rules
- **Credentials follow one strict rule for all 15 types: same value on both sides -> Credentials; changed -> no label at all.** A single key-value scan now reads `Key: value`, `Key - value`, `Key = value` and `Key is value` for every credential type (passwords, PINs, OTPs, security answers, API/secret keys, Aadhaar, driving licence, voter ID, card number, CVV, expiry, UPI ID, transaction ID, invocation ID, SHA/hash, VPC ID, card ID, account ID, IFSC, PAN). Before, `Password - customerdelivery2@admin123!` was missed because only `:` and `=` were understood, and pieces of a changed password could be marked Overscrubbed.
- **Scrubbed names are no longer marked Overscrubbed.** The engine now carries a list of ~22,000 ordinary English words. A replaced capitalised word that is *not* an ordinary word ("Furkan" -> "Arcorahale", "Roni S" -> "Galonbryea S") is a correctly scrubbed name or brand, so it gets no label.
- **The original text decides Overscrubbed.** When the original is ordinary text ("Chance R", "Kickoff", "Cricket"), replacing it is Overscrubbed even if the replacement looks like a name ("Yelanando N"). Places (Ireland, Australia) are not PII, so replacing them is Overscrubbed too.
- **Unchanged names in name positions are labeled.** If a line such as `# Furkan` was scrubbed, an identical line of the same shape (`# Joaquim` on the next slide) is labeled Person Name.
- **No more Person Name on months, places or match titles.** "June", "West Indies vs Papua New Guinea", "India vs Pakistan" and similar are never Person Names.

### Speed (large documents used to freeze the browser)
- A 140 KB document took **45 s** and a 280 KB one **3 minutes** in 10.4.1; they now take about **1 s** and **2 s**. A 500 KB one-line JSON export used to run out of memory; it now takes about 2 s. Performance budgets are enforced by tests.
- How: a per-document word index so each rule only scans the lines that matter; caching of repeated checks; Myers diff instead of n x m tables for long documents and long lines; one layout-free text read per audit; DOM reads and writes batched instead of interleaved (which forced a re-layout per annotation); no `innerHTML` serialisation or per-character hashing on the 1.5 s heartbeat.
- Re-audits of unchanged text (after a click or a new label) reuse the previous result.
- Long documents show "Analysing large document..." first, and slow documents are re-checked less often, so the page stays responsive.

### Fixes
- An "id" key anywhere on a JSON line used to switch off all checks on that line; now only the id value itself is skipped.
- Fixed a start-up error in the new code path, caught by the real-DOM test, which the build now runs automatically when jsdom is installed.

## 10.4.1 - October 2026

Fixes found on a real annual-review-form task.

- **Scrubbed names in person name fields are no longer marked Overscrubbed.** Before, `Reviewer Name: | Nihar A` -> `Malivdelane A` was suggested as Overscrubbed. Any "... Name:" / "Name of the ...:" field now counts as a person field, unless it is clearly not about a person (Company Name, File Name, Project Name and similar).
- **"More" is no longer suggested as a Person Name.** Given names that are also everyday English words (More, Mark, Jack, Ram, Dev, Harsh, Milan and similar) only count as names next to another name ("Rahul More") or in a name field.
- **Overscrubbed words in key-value tables are no longer missed** (`clients` -> `cederacob`, `better` -> `griixsyn`, `quality` -> `wrenixquan`, `content` -> `ironenmer`). A label cell such as "Name of the Reviewee:" was taken as a "Name" column header, so every word below it was treated as a person's name.
- **The floating bar no longer shows garbled characters** (`ðŸŽ¯`, `â¿`). The engine source is now pure ASCII, so it displays correctly even when a tool reads the file with the wrong text encoding. A test enforces this.
- Added well-known streaming brands (Sony LIV, Hotstar, JioCinema, Netflix, ZEE5) to the known-business list.

## 10.4.0 — October 2026

This release is a correctness and safety release. The previous build (10.3.0) passed **87 of these 130 checks**; this one passes all of them.

### Privacy and safety
- **Removed every network call.** Business and person names, plus the whole right-hand document as "context", were being sent to Wikipedia, DuckDuckGo, and to Gemini or OpenAI when a key was set in `localStorage`. The engine now decides offline, and a test checks that the source contains no network APIs.
- **Start-up no longer damages the page.** The old cleanup replaced every element whose class contained `pt-` (`prompt-…`, `script-…`, `receipt-…`) and every platform `<mark data-label>` annotation with plain text. It now removes only its own `span.pt-tag` highlights.
- **Re-running is safe.** Loading the script twice (console paste, userscript plus extension) used to stack event listeners and `history.pushState` wrappers. A second load now tears down the first completely.
- **The userscript only runs on `https://dashboard.peaktalent.ai/*`.** Before, it ran on every website (`*://*/*`).
- Each click now triggers one debounced rescan instead of three.
- Change detection hashes the full pane text. Before, it only compared the length and the first 100 characters.

### Credentials
- **The AWS account value `243057143242`, the IAM ID, the VPC ID, the Card ID, the Invocation ID, the Voter ID and the transaction ID are labeled again.** A too-broad "generic id" check treated any key ending in `id` (`account_id`, `PolicyId`, `Voter ID`) as a database ID and dropped the value.
- CVV, PIN and expiry values are labeled when they follow their key.
- Fixed the password value being missed in `Password: "password": "value"`.
- Card numbers: 13–19 digits. Ungrouped numbers must pass the Luhn checksum.
- Bank UTR and transaction references behind `UTR No:`, `Txn ID:` and similar keys are recognised.
- Removed the undocumented Employee-ID category, so the set is again the 15 SOP categories.

### Overscrubbed
- **Fixed an inverted rule.** A generic word in the original (`function`, `requirements`) used to *prevent* Overscrubbed. Replacing a generic word is exactly what Overscrubbed means. This fixes `beaexbright` (from `job-function`) and `feraldalyn` (from `requirements`).
- Renamed config keys (`API_KEY` → `BRYENA_STELWICK`) are Overscrubbed even on secret lines.
- The words "spin", "kingpin" and similar no longer switch off detection for the whole document.
- ALL-CAPS headings are no longer mistaken for person names (`COBTECHFLUX`).
- The whole-document comparison now uses each diff's own line as context. Before, it used none, so every context guard was skipped.
- A lone suffix word (`Analytics`, `Solutions`) is not treated as a company (`Orberaced`).

### Names and businesses
- **Fixed the employer phrase rule.** Half of it never matched ("resigning from", "hired by", "experience at") because of broken `\s` escapes. Bare `join`, `left` and `leaving` were removed: they turned "join Monday's call" and "left Bengaluru" into businesses. The two copies of the rule are now one shared definition.
- **Name lists** ("between Naazia, Vinita and Shrusti") only count the capitalised, comma-separated names. Before, any word within 100 characters counted (`offline` became a name).
- A name *field* now requires a key form (`Applicant:`); the word "applicant" in a sentence is not enough.
- Greetings are stripped from names (`Hi Rahul Sharma` → `Rahul Sharma`).
- Not Business Names any more: legal entity types (`C Corporation`, `LLC`), form placeholders (`[E.g., …]`), and words that only appear inside a URL (`github`).
- **Cleaned the built-in brand list.** Removed synthetic words that had leaked in from test documents (`casorazeph`, `orbanceast`, `solvanta`, `olivier`) and generic words (`linear`, `notion`, `hero`, `cred`, `new shop`).

### Identity rule (Left == Right)
- A changed DOB or a changed `@handle` is no longer labeled; it was correctly scrubbed.
- Identical `@handles` are now found by their own scan.
- Address labels in tables no longer include the header cell, and no longer appear twice.

### Validators
- IPv6 support added. MAC addresses are no longer counted as IP addresses.
- Phone numbers are no longer read as Unix timestamps.
- Vehicle plates: Delhi-style RTO letters (`DL 3C AB 1234`) and the legacy codes `OR`, `UA` and `DN` are accepted. The state list is corrected to the 36 current codes.

### Product
- **Popup "Re-audit" button works.** Before, the engine had no message listener. The popup also shows live counts.
- Keyboard shortcuts implemented: Alt+Shift+A (re-audit) and Alt+Shift+H (hide/show bar).
- Removed `styles.css`. Its first rule made the platform's own highlights transparent, and the rest styled elements that don't exist.
- Removed the bookmarklet (`file:///` loading cannot work from an `https://` page) and the static demo page, which showed scrubbed names labeled as Business Name.
- **One source file.** `scripts/build.js` runs the tests and then generates the extension copy, the userscript and the console build, so the copies can no longer drift.
- **Test numbers in the README are written by the build from a real test run.** They are no longer typed in by hand.
- **Removed about 90 trace, patch and forked-engine files.** These were nine diverging copies of the engine and scripts that silently failed to patch. The test fixtures now contain only synthetic data.

### Documentation
- GUIDELINES.md now matches the engine:
  - state codes;
  - https-only URLs;
  - DOB and `@handle` identity rule;
  - CVV/PIN key rule;
  - card checksum;
  - renamed-key rule;
  - greeting, name-list and placeholder rules;
  - the 12-digit bank account caveat.
- README gives working install steps for Chrome/Edge/Brave, Tampermonkey and Safari, and lists known limitations.
