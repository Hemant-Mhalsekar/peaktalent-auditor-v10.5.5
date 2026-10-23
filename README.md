# PeakTalent PII / BII Annotation Auditor

A browser add-on for reviewers on **dashboard.peaktalent.ai**. On a side-by-side review screen it compares the left (source) document with the right (redacted) document and:

- highlights text in the right document that should carry a label (Person Name, Business Name, Credentials, Address, Overscrubbed, and the other SOP labels), and
- outlines labels you have already applied that break the SOP, with a tooltip that says why.

The labeling rules it follows are in [GUIDELINES.md](GUIDELINES.md). It is an assistant: you still make the final call on every label.

**Privacy.** The auditor makes no network requests. Document text never leaves your browser. A test checks that the engine source contains no network APIs.

---

## Install

Works in Chrome, Edge and Brave (version 100 or newer) and Safari 16.4 or newer (macOS Ventura 13.3+). Older Safari versions cannot run some of the text patterns the auditor uses.

Pick one of the three options. All three run the same engine (`src/content.js`).

### Chrome, Edge or Brave (recommended)

1. Download `PeakTalent-Auditor-Chrome.zip` and double-click it. You get a folder **PeakTalent-Auditor-Chrome** with `manifest.json` directly inside it.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the **PeakTalent-Auditor-Chrome** folder itself (select the folder, do not open it; do not select the .zip file).
5. Reload any open PeakTalent tab.

The whole project folder (`peaktalent-auditor-v11.3.4`) and its `extension/` folder can also be loaded: both contain a `manifest.json`.

**"Manifest file is missing or unreadable"** means the selected folder has no `manifest.json` directly inside it: you picked the .zip file, a parent folder, or a folder one level too high. Select the folder that shows `manifest.json` when you open it. If you previously loaded the Safari file (`peaktalent-auditor.user.js`), that is not an extension; use the folder above.

The extension only runs on `https://dashboard.peaktalent.ai/*`.

### Tampermonkey / Violentmonkey (any browser)

1. Install Tampermonkey or Violentmonkey.
2. Open the dashboard, click **Create a new script**, replace everything with the contents of `dist/peaktalent-auditor.user.js`, and save.

The userscript is limited to `https://dashboard.peaktalent.ai/*`.

### Safari

Safari does not load unpacked Chrome extensions. You have two choices.

- **Quick, per session:** enable *Settings → Advanced → Show features for web developers*. Open the review tab, then *Develop → Show JavaScript Console*. Paste the whole of `dist/console-paste.js` and press Return. It lasts until the tab is reloaded; pasting again cleanly replaces the old copy.
- **Permanent:** on a Mac with Xcode, run `xcrun safari-web-extension-converter extension/` and follow the prompts. This builds a Safari Web Extension from the same folder.

The old bookmarklet loaded the script from a `file:///` path. Browsers block that from a `https://` page, so it never worked and has been removed.

---

## Using it

When a review screen is detected, a small bar appears (open the browser console to confirm the version: it prints `[PeakTalent] Precision Engine v11.3.4 is active.`) at the top right of the page. Drag it anywhere; it remembers its position. Use **Stop** or **Resume** on the bar to pause the auditor.

- **Suggested labels** are underlined in the right document using the platform's label colours.

| Shortcut | Action |
| --- | --- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd> | Re-audit the page now |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | Hide / show the floating bar |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Print diagnostics in the browser console (for bug reports) |

In the Chrome extension, the toolbar popup shows the suggestion count for the current tab and has a **Re-audit this page** button.

---

## Label check (mistakes)

After every change in the right document (you add, change or remove a label) the auditor checks every label you placed:

1. If the auditor suggests a label for exactly that text, your label must be that label.
2. Otherwise the guideline rules decide: unchanged text gets no label; a replaced name, company, address, credential or code gets no label; a replaced ordinary word is Overscrubbed (only the changed part); an entity label must have that entity's format (e-mail, https link, IP, phone, plate, @username, 9-18 digit account, complete address, date of birth).

A wrong label gets a **red dashed outline** and a small tag above it, **"your label -> correct label"** (for example `Date -> Overscrubbed` or `Date -> No label`). Hover it for the reason. The bar shows **"N Mistakes"**; click it for a list of all wrong labels (click one to jump to it). The check never changes the document's text.

## Labels and colours

These follow the PeakTalent platform palette. Business Name and IP Address share a colour on the platform itself, so tell them apart by the text, not the colour.

| Label | Colour | What it covers |
| --- | --- | --- |
| Credentials | `#FF7A45` | Values (never keys) from the 15 credential categories |
| Person Name | `#1890FF` | Real names identical on both sides |
| Business Name | `#13C2C2` | Companies and brands identical on both sides (not banks, software, entity types or placeholders) |
| Overscrubbed | `#FF7875` (dashed) | Non-sensitive text that was replaced; only the changed part of a delimited token |
| Address | `#F5222D` | Complete postal addresses identical on both sides |
| Vehicle Number Plate | `#A0D911` | Valid Indian plates (current, legacy and BH series) |
| Date | `#EB2F96` | Date of birth only, identical on both sides |
| Contact Number | `#FA8C16` | Indian mobile and landline numbers |
| Email Address | `#52C41A` | Email addresses identical on both sides |
| IP Address | `#13C2C2` | IPv4 and IPv6 |
| URL/Link | `#FAAD14` | `https://` links identical on both sides |
| Person Username | `#2F54EB` | `@handles` identical on both sides |
| Account Number | `#722ED1` | Bank account numbers |

---

## Known limitations

- **Phone numbers:** only Indian formats are recognised. Check other formats, such as `+1 (555) 234-8901`, by hand.
- **12-digit numbers:** a 12-digit number is treated as Aadhaar or a cloud Account ID (Credentials). A 12-digit **bank** account number will also be suggested as Credentials; re-label it as Account Number.
- **Renamed software:** a renamed software or framework name (for example `Hexo` → `Rhoossol`) is only flagged as Overscrubbed when the engine can tell it is a common word. Unknown product names are left for you to judge.
- **Long documents:** documents longer than about 60,000 characters use *large-document mode*: only the part on screen (plus 150 lines above and below) is analysed and highlighted, and the audit follows your scrolling. Suggestions further away appear when you scroll to them. Hover over the bar's status text to see which lines are being audited.
- **Names vs ordinary words:** the engine decides with a built-in list of ~22,000 common English words. A rare English word used as a heading may be treated as a name, and a name that is also a common word ("Grace", "Hope") may be treated as an ordinary word.
- **Business names:** detection is offline and rule-based (known brands, company suffixes, vendor tables, employer phrases such as "working at"). An unusual brand name with no such clue may not be suggested.
- **Screen detection:** this depends on PeakTalent's page layout. If the platform's layout changes, the bar may show "not on a review screen" until the detector is updated.

---

## For developers

Per-label test coverage and results: see `TEST_REPORT.md`.

```
src/content.js          the engine — the ONLY file to edit
extension/              Chrome/Edge/Brave extension (manifest, popup, icons; content.js is copied in by the build)
dist/                   generated: userscript, console-paste build, extension zip
tests/run.js            regression suite (no dependencies)
tests/dom.js            real-DOM checks (needs jsdom)
tests/fixtures.js       synthetic test documents — no real people, numbers, keys or companies
scripts/build.js        runs the tests, then builds extension/ and dist/, then writes the results below
GUIDELINES.md           the annotation SOP
CHANGELOG.md            what changed
```

```bash
node tests/run.js          # regression suite; exit code 1 on any failure
npm install && npm run test:dom   # optional real-DOM checks
node scripts/build.js      # test, then build every distributable and refresh the results table
```

To add a rule, first add a failing case to `tests/run.js` using synthetic data, then change `src/content.js`, then run the build. Do not patch generated files, and do not keep forked copies of the engine.

### Test results

<!-- TEST-RESULTS:START (generated by scripts/build.js — do not edit by hand) -->
**266 / 266 checks passing** on engine v11.11.1 (run on 2026-10-23).

| Suite | Passing |
| --- | --- |
| Credentials | 26 / 26 |
| AWS IAM | 7 / 7 |
| System IDs | 3 / 3 |
| Clean docs | 1 / 1 |
| Overscrubbed form | 12 / 12 |
| Business | 16 / 16 |
| Context | 7 / 7 |
| Identity | 12 / 12 |
| Person | 3 / 3 |
| Mixed | 20 / 20 |
| Real tasks | 15 / 15 |
| Credential rule | 76 / 76 |
| Code | 7 / 7 |
| Statement | 2 / 2 |
| Attendees | 13 / 13 |
| Address rule | 8 / 8 |
| Robustness | 1 / 1 |
| Formats | 18 / 18 |
| Privacy | 2 / 2 |
| Runtime | 5 / 5 |
| Review form | 9 / 9 |
| Performance | 3 / 3 |
<!-- TEST-RESULTS:END -->
