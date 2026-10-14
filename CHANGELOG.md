# Changelog

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
