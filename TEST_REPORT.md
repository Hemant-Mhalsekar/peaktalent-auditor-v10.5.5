# PeakTalent Auditor - Test Report (v11.3.4)

Every label is tested three ways:

- **Labeled** - the real value, identical on both sides, gets this label.
- **Scrubbed** - the value was replaced on the right side: it gets no label at all.
- **Look-alike** - text that resembles this label (a city for Address, a version number for IP, a code annotation for Username) never gets this label.

| Label | Labeled | Scrubbed | Look-alike | Total |
|---|---|---|---|---|
| Account Number | 7 | 2 | 4 | 13 |
| Address | 4 | 2 | 6 | 12 |
| Business Name | 7 | 2 | 11 | 20 |
| Contact Number | 8 | 1 | 7 | 16 |
| Credentials | 17 | 2 | 11 | 30 |
| Date | 6 | 1 | 6 | 13 |
| Email Address | 5 | 1 | 5 | 11 |
| IP Address | 6 | 1 | 6 | 13 |
| Overscrubbed | 12 | 16 | 1 | 29 |
| Person Name | 14 | 1 | 18 | 33 |
| URL/Link | 5 | 1 | 5 | 11 |
| Person Username | 4 | 1 | 8 | 13 |
| Vehicle Number Plate | 7 | 1 | 5 | 13 |
| **All labels** | | | | **227** |

All 227 checks pass (`node tests/labels.js`).

## Other suites

| Suite | What it checks | Result |
|---|---|---|
| `tests/exact.js` | 11 whole documents (KYC form, incident report, offer letter, ticket CSV, code + config, chat, lecture sheet, bank statement, medical report, JSON user list, resume). The labels must match exactly: nothing missing, nothing extra. | 11 / 11 |
| `tests/dom_labels.js` | Mistake check in a real page, for every label: the right label gives no red outline, a wrong label gives one. Also wrong labels on scrubbed names, statement dates and scrubbed companies. | 29 / 29 |
| `tests/matrix.js` | 65 realistic documents from earlier reports (emails, resumes, sheets, transcripts, invoices). | 65 / 65 |
| `tests/run.js` | 266 rule checks, including the robustness suite (odd characters, huge tokens, base64 blobs). | 266 / 266 |
| `tests/dom.js`, `dom_large.js`, `dom_audit.js` | Page behaviour, 560 KB documents, mistake outline after labeling. | 17 / 17 |
| Fuzz (1,295 random documents) | No crash on any input. | 0 errors |
| ESLint | Undefined variables, duplicate keys, unreachable or unused code. | 0 problems |

## Second, independent campaign (v10.5.5)

`tests/labels_deep.js` was written from scratch on different documents (JSON, CSV, tables, .env files, SMS, chat, prose). Every number below is "passing / total".

| Label | Must get the label | Must NOT get it |
|---|---|---|
| Account Number | 8/8 | 7/7 |
| Address | 7/7 | 7/7 |
| Business Name | 8/8 | 14/14 |
| Contact Number | 9/9 | 7/7 |
| Credentials | 19/19 | 13/13 |
| Date | 6/6 | 7/7 |
| Email Address | 5/5 | 5/5 |
| IP Address | 7/7 | 7/7 |
| Overscrubbed | 14/14 | 17/17 |
| Person Name | 15/15 | 18/18 |
| URL/Link | 6/6 | 6/6 |
| Person Username | 4/4 | 9/9 |
| Vehicle Number Plate | 7/7 | 6/6 |

All 238 checks pass. `tests/dom_labels_deep.js` adds 33 real-page mistake checks: for each of the 13 labels the correct label gets no outline and a wrong label gets the red outline, plus 7 cases of text that must stay blank (scrubbed name, statement date, city, bank, invalid plate, http link).


## Mistake check (rebuilt in v11.3.4)

| Suite | What it checks | Result |
|---|---|---|
| `tests/dom_palette.js` | Every one of the 13 labels drawn **only with colour** (underline + tint, and background tint) on an unchanged JSON key: the label is recognised from the chip colours and flagged | 26/26 |
| `tests/dom_labels_deep.js` | For each label: correct label -> no outline, wrong label -> red outline; plus 17 cases that must be flagged (unchanged key labeled, Overscrubbed on a scrubbed name / company / e-mail / password, Overscrubbed covering unchanged text, replaced phone labeled, e-mail labeled Credentials, ordinary word as Business, language as Person, statement date, city, bank, invalid plate, http link) | 43/43 |
| `tests/dom_labels.js` | Earlier per-label suite | 29/29 |
| `tests/dom_classlabels.js` | Labels drawn with CSS classes only; a label changed by swapping its class ("exclusive" Overscrubbed -> Date) | 4/4 |
| `tests/dom_rangelabels.js` | Labels painted without an element: CSS Custom Highlight API and coloured overlay boxes; wrong -> red box, correct -> none | 5/5 |
| `tests/dom_dialog.js` | Label chosen in the platform's dialog ("Change label for \u201Cexclusive\u201D" -> Date -> Apply) or picked from a label menu: wrong -> red box, correct -> none; Diagnose report contents | 5/5 |
| `tests/dom_marks.js` | The live dashboard's own markup (from its Diagnose report): `<mark role="button">` labels with translucent background + gradient underline. Wrong labels -> red outline, correct ones -> none | 5/5 |
| `tests/dom_audit.js` | Label applied around the auditor's own highlight | 4/4 |

## Label check (mistake indication, v11.3.4)

`tests/dom_labelcheck.js` uses the live dashboard's label markup (`<mark role="button">`, background tint + gradient underline, palette from the label chips).

| What is checked | Result |
|---|---|
| Each of the 13 labels applied correctly -> no mistake | 13/13 |
| Each of the 13 labels replaced by a wrong label -> mistake naming the correct label | 13/13 |
| Text that must stay unlabeled (unchanged word, JSON key, scrubbed name / company / phone, statement date, city alone, http link, language) -> mistake, correct = "No label" | 9/9 |
| Overscrubbed word labeled Date -> "Date -> Overscrubbed"; fixed -> cleared; changed again -> flagged; removed -> cleared | 4/4 |
| Label drawn inside a suggestion span; partial Overscrubbed label; several labels at once; mistake list; document text unchanged | 5/5 |
| Pane header ("Annotate here" chip, file name) never judged | 1/1 |
| **Total** | **45/45** |

`tests/dom_chrome_colours.js`: the same check when the page reports colours the way Chrome does (oklch, `rgb(r g b / a)`, `color(srgb ...)`), with unreadable chip colours (built-in colours), and with an unreadable label colour (learned from the label dialog): 11/11.

`tests/dom_extension.js`: the Chrome extension build itself with a chrome.runtime stub - wrong label flagged, popup status shows the mistake, popup diagnostics answer: 3/3.


## Mass test campaign (v11.3.4) - 2 lakh generated documents

`tests/mass.js` generates documents from about 300 Indian and international names, about 50 companies and 25 brands, about 35 templates (greetings, sign-offs, name fields, chat lines, CSV / JSON rows, table cells, invoices, offer letters) and variants (identical, fully scrubbed, first or last name kept, ordinary words / software / places / languages / banks / people / companies in the wrong slot), plus all other labels (identical -> label, changed -> no label). Every document inside a run is different.

8 runs of 25,000 with different seeds (101, 202, 303, 404, 505, 606, 707, 808): **200,000 / 200,000 correct (100%)**. The build runs 5,000 cases; `npm run test:mass` runs 2 lakh.

| Category | Correct / total |
|---|---|
| Account Number: changed -> no label | 3,420 / 3,420 |
| Account Number: identical -> Account Number | 4,596 / 4,596 |
| Address: city alone -> not Address | 32 / 32 |
| Address: identical complete address -> Address | 4,348 / 4,348 |
| Business: bank names -> not Business Name | 40 / 40 |
| Business: identical company -> Business Name | 14,105 / 14,105 |
| Business: ordinary word in a company slot -> not Business Name | 1,438 / 1,438 |
| Business: person name in a company slot -> not Business Name | 6,502 / 6,502 |
| Business: scrubbed company -> no label | 13,830 / 13,830 |
| Business: software/place/language in a company slot -> not Business Name | 1,757 / 1,757 |
| Contact Number: changed -> no label | 3,369 / 3,369 |
| Contact Number: identical -> Contact Number | 4,433 / 4,433 |
| Credentials: changed -> no label | 3,330 / 3,330 |
| Credentials: identical -> Credentials | 4,567 / 4,567 |
| Date: identical date of birth -> Date | 4,583 / 4,583 |
| Date: other dates -> not Date | 4,520 / 4,520 |
| Email Address: changed -> no label | 3,498 / 3,498 |
| Email Address: identical -> Email Address | 4,617 / 4,617 |
| IP Address: changed -> no label | 3,300 / 3,300 |
| IP Address: identical -> IP Address | 4,567 / 4,567 |
| Overscrubbed: ordinary word replaced -> Overscrubbed | 6,755 / 6,755 |
| Person Username: changed -> no label | 3,309 / 3,309 |
| Person Username: identical -> Person Username | 4,386 / 4,386 |
| Person: company in a name slot -> not Person Name | 6,261 / 6,261 |
| Person: first name kept, surname scrubbed | 11,484 / 11,484 |
| Person: fully scrubbed -> no label | 13,633 / 13,633 |
| Person: identical full name -> Person Name | 17,331 / 17,331 |
| Person: identical list of names -> every name Person Name | 6,959 / 6,959 |
| Person: list mostly scrubbed -> no Overscrubbed on scrubbed names | 4,594 / 4,594 |
| Person: ordinary word in a name slot -> not Person Name | 2,352 / 2,352 |
| Person: ordinary word replaced -> Overscrubbed | 6,753 / 6,753 |
| Person: software/place/month/language in a name slot -> not Person Name | 2,238 / 2,238 |
| Person: surname kept, first name scrubbed | 7,008 / 7,008 |
| URL/Link: changed -> no label | 3,392 / 3,392 |
| URL/Link: identical -> URL/Link | 4,583 / 4,583 |
| Vehicle Number Plate: changed -> no label | 3,376 / 3,376 |
| Vehicle Number Plate: identical -> Vehicle Number Plate | 4,734 / 4,734 |

## Limits

The tests use made-up documents written to match the guidelines and the screenshots you sent. The live dashboard can contain formats nobody has seen yet, so if a label looks wrong on a real page, send a screenshot and it will be added to these suites.
