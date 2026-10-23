# PeakTalent PII, BII & Credentials Standard Annotation Guidelines
**Document ID:** PT-SOP-ANN-2026-V10.4  
**Version:** 10.4.0  
**Effective Date:** October 2026  
**Status:** Approved Standard Operating Procedure (SOP)  
**Applicability:** All PeakTalent Data Annotators, QA Reviewers, and Automated Verification Engines

---

## Table of Contents
1. [Executive Summary & Core Directives](#1-executive-summary--core-directives)
2. [Annotation Decision Tree](#2-annotation-decision-tree)
3. [Label Color System & Taxonomy](#3-label-color-system--taxonomy)
4. [Universal 15-Category Credentials Specification](#4-universal-15-category-credentials-specification)
5. [Strict Entity Annotation Rules](#5-strict-entity-annotation-rules)
   - 5.1 [Credentials (Value-Only Rule)](#51-credentials-value-only-rule)
   - 5.2 [Person Name](#52-person-name)
   - 5.3 [Business Name](#53-business-name)
   - 5.4 [Vehicle Number Plate](#54-vehicle-number-plate)
   - 5.5 [Address](#55-address)
   - 5.6 [Overscrubbed (Partial Isolation Rule)](#56-overscrubbed-partial-isolation-rule)
   - 5.7 [Date (DOB Strictly Only)](#57-date-dob-strictly-only)
   - 5.8 [Person Username & System IDs](#58-person-username--system-ids)
   - 5.9 [Other Categories (Contact, Email, IP, URL)](#59-other-categories-contact-email-ip-url)
6. [Comprehensive Do's and Don'ts Matrix](#6-comprehensive-dos-and-donts-matrix)
7. [Automated Verification & QA Protocols](#7-automated-verification--qa-protocols)

---

## 1. Executive Summary & Core Directives

This document establishes the official operational standard for annotating and verifying Personally Identifiable Information (PII), Business Identifiable Information (BII), Credentials, and Overscrubbed text on the **PeakTalent AI Evaluation & Redaction Platform** (`dashboard.peaktalent.ai`).

### Primary Rules of Engagement:
1. **Left vs. Right Document Comparison**:
   - Annotators evaluate documents in a side-by-side split screen (`left.docx`/`left.jsonl`/`left.pdf` vs. `right.docx`/`right.jsonl`/`right.pdf`).
   - The **Left Document** represents the original source document.
   - The **Right Document** represents the redacted or transformed target document.
2. **Identity Invariance Requirement (Unscrubbed Rule)**:
   - Real-world entities such as **Person Names**, **Business Names**, **Addresses**, and **Credentials** must **only be labeled if they exist identically in both Left and Right documents**.
   - If an entity was redacted, masked, or replaced with a synthetic placeholder (e.g. `Rahul Sharma` $\rightarrow$ `Melivn O`), it is considered scrubbed: **DO NOT label either the original or the replacement as Person Name or Business Name**.
3. **Value-Only Credentials**:
   - Structural field keys (e.g. `account_id`, `PolicyId`, `password`, `pin`) must **NEVER** be annotated.
   - **Only the actual secret or credential value** (e.g. `243057143242`, `ANPAZKAPJZG4NVQDF6L6N`) is labeled as `Credentials`.
4. **Delimiter-Aware Partial Overscrubbing**:
   - When non-sensitive text or structural tokens are erroneously altered, **only annotate the specific synthetic/scrambled substring**, excluding adjoining delimiters, hyphens, slashes, or unchanged suffixes (e.g. annotate `hydragenzen` from `hydragenzen-10-17`, `beaexbright` from `job-beaexbright`).
5. **No Hallucinated Infrastructure / Banking Entities**:
   - Software packages, cloud components, and database resources (`Database@AWS`, `Amazon ODB`, `Node.js`) are **NEVER** Business Names.
   - Table field labels (`Bank Name`, `Patient Name`, `Policy Holder`) and banking organizations (`AXIS BANK`, `HDFC Bank`) are strictly excluded from `Business Name`.

---

## 2. Annotation Decision Tree

```mermaid
flowchart TD
    Start["Examine Token / Phrase in Right Document"] --> MatchLeft{"Does identical string exist in Left Document?"}
    
    MatchLeft -- "YES (Identical / Unscrubbed)" --> CheckType{"Determine Entity Category"}
    MatchLeft -- "NO (Changed / Redacted / Replaced)" --> CheckOrig{"What was the original text on the Left?"}

    CheckType -- "15-Category Credential Value" --> L_Cred["Label: Credentials (#FF7A45)\n(Ensure key is NOT selected)"]
    CheckType -- "Human Name" --> L_Person["Label: Person Name (#1890FF)"]
    CheckType -- "Legal Company / Brand" --> CheckBiz{"Is it a Bank or Software?"}
    CheckBiz -- "Bank / Tech Tool / Header" --> L_SkipBiz["DO NOT LABEL (Exclude)"]
    CheckBiz -- "Legitimate Enterprise" --> L_Biz["Label: Business Name (#13C2C2)"]
    CheckType -- "Complete Street Address" --> L_Addr["Label: Address (#F5222D)"]
    CheckType -- "Official Vehicle License Plate" --> L_Plate["Label: Vehicle Number Plate (#A0D911)"]
    CheckType -- "Date of Birth (DOB)" --> L_DOB["Label: Date (#EB2F96)"]
    CheckType -- "Other PII (Email, Phone, IP)" --> L_Other["Label respective category"]

    CheckOrig -- "Was a Person Name or Business Name" --> SkipRedacted["DO NOT LABEL\n(Properly redacted PII/BII)"]
    CheckOrig -- "Was Non-PII / Technical Prose / Common Word" --> CheckPartial{"Is it part of a delimited token?"}
    
    CheckPartial -- "Yes (e.g. 'job-beaexbright')" --> L_PartialOver["Isolate ONLY the scrubbed word\nLabel: Overscrubbed (#FF7875)"]
    CheckPartial -- "No (Whole word replaced)" --> L_FullOver["Label: Overscrubbed (#FF7875)"]
```

---

## 3. Label Color System & Taxonomy

The PeakTalent UI enforces a strict 13-category color system. Annotations must conform to the following palette:

| # | Label | Dot Color | Background | Border | Text Color | Definition & Scope |
| :-: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | **Credentials** | 🍑 `#FF7A45` | `#FFF2E8` | `#FFBB96` | `#D4380D` | Passwords, tokens, API keys, IDs across the 15 universal categories. Value-only. |
| **2** | **Person Name** | 🔵 `#1890FF` | `#E6F7FF` | `#91D5FF` | `#096DD9` | Verified real human names. Left == Right identical only. |
| **3** | **Business Name** | 🟢 `#13C2C2` | `#E6FFFB` | `#87E8DE` | `#08979C` | Commercial brands, corporations, vendors. Excludes banks & tech tools. |
| **4** | **Overscrubbed** | ⚠️ `#FF7875` | `#FFF1F0` | `#FFCCC7` | `#CF1322` | Non-PII text, prose, or code unnecessarily redacted or replaced. |
| **5** | **Address** | 🔴 `#F5222D` | `#FFF1F0` | `#FFA39E` | `#CF1322` | Full or partial postal addresses (a street on its own counts; a city, state, country or PIN alone does not). Left == Right only. |
| **6** | **Vehicle Number Plate** | 🍏 `#A0D911` | `#FCFFE6` | `#EAFF8F` | `#7CB305` | Valid Indian motor vehicle registration numbers with official state codes. |
| **7** | **Date** | 🌸 `#EB2F96` | `#FFF0F6` | `#FFADD2` | `#C41D7F` | Strictly Date of Birth (DOB) only. General dates must NOT be labeled. |
| **8** | **Contact Number** | 🟠 `#FA8C16` | `#FFF7E6` | `#FFD591` | `#D46B08` | Old chip, replaced by Indian Mobile Number and International Phone Number (5.9). |
| **9** | **Email Address** | 🌿 `#52C41A` | `#F6FFED` | `#B7EB8F` | `#389E0D` | Personal or commercial email addresses. |
| **10** | **IP Address** | 🔷 `#13C2C2` | `#E6FFFB` | `#87E8DE` | `#08979C` | IPv4 and IPv6 network addresses. |
| **11** | **URL/Link** | 🟡 `#FAAD14` | `#FFFBE6` | `#FFE58F` | `#D48806` | Web addresses, HTTP(S) links, endpoints. Excludes placeholders. |
| **12** | **Person Username** | 🌌 `#2F54EB` | `#F0F5FF` | `#ADC6FF` | `#1D39C4` | Social media handles (`@handle`). Excludes database `node_id` or login keys. |
| **13** | **Account Number** | 🟣 `#722ED1` | `#F9F0FF` | `#D3ADF7` | `#531DAB` | Bank account numbers specifically. Other IDs belong to Credentials. |

---

## 4. Universal 15-Category Credentials Specification

The platform mandates that the following **15 categories are strictly classified as `Credentials`** when they are identical in both Left and Right documents:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           UNIVERSAL 15-CATEGORY CREDENTIALS MATRIX                             │
├────┬─────────────────────────────┬─────────────────────────────────┬───────────────────────────┤
│ #  │ Category Name               │ Format & Specification          │ Canonical Example         │
├────┼─────────────────────────────┼─────────────────────────────────┼───────────────────────────┤
│ 1  │ Bank Branch Code            │ 11-character alphanumeric IFSC  │ HDFC0001234, SBIN0000456  │
│ 2  │ Income Tax ID               │ 10-character PAN card format    │ ABCDE1234F, BKRPK9921M    │
│ 3  │ Secret Keys & API Tokens    │ Secret keys, bearer, JWT, SSH   │ sk-proj-1234567890abcdef  │
│ 4  │ Passwords, PINs & OTPs      │ Secret passwords, OTPs, PINs    │ superSecretPassword123    │
│ 5  │ Aadhaar Card Number         │ 12-digit Indian national UID    │ 1234 5678 9012            │
│ 6  │ Driving License Number      │ Indian State DL alphanumeric    │ DL14 20110012345          │
│ 7  │ Voter ID Number             │ 10-character Election EPIC ID   │ WBF1234567, ABC1234567    │
│ 8  │ Credit / Debit Card Number  │ 13-19 digit card no, CVV, expiry│ 4532 1234 5678 9012       │
│ 9  │ UPI ID                      │ Virtual Payment Address (VPA)   │ user@okhdfcbank, pay@upi  │
│ 10 │ Transaction ID              │ Bank UTR, blockchain tx hash    │ CB0111264256, 0x3a7b1c4e  │
│ 11 │ Invocation ID               │ Cloud function execution UUID   │ c4a7d8e2-1b3c-4d5e-8f9a   │
│ 12 │ SHA / SSH / Hash Key        │ SHA-1 (40 hex), SHA-256 (64 hex)│ 839aeeff4312171ac86bebf47 │
│ 13 │ VPC ID                      │ Cloud Virtual Private Cloud ID  │ vpc-0a1b2c3d4e5f67890     │
│ 14 │ Card ID                     │ Tokenized card reference        │ card_1J4iOz2eZvKYlo2CSm   │
│ 15 │ Account ID                  │ 12-digit cloud account / IAM ID │ 243057143242, ANPAZKAPJZG │
└────┴─────────────────────────────┴─────────────────────────────────┴───────────────────────────┘
```

> [!IMPORTANT]
> **Strict Value-Only Rule for Credentials**:
> When an entity appears inside JSON, YAML, code, or key-value format (e.g. `"_account_id": "243057143242"` or `"PolicyId": "ANPAZKAPJZG4NVQDF6L6N"`):
> - **WRONG**: `"_account_id": "243057143242"` (Do NOT label the key or quotes)
> - **CORRECT**: `"243057143242"` (Label ONLY the value)

---

## 5. Strict Entity Annotation Rules

### 5.1 Credentials (Value-Only Rule)
- **Condition**: Must be identical in both documents (Left == Right).
- **Strict rule for every credential type**: the same value on both sides -> `Credentials`. A changed value was correctly scrubbed -> **no label at all** (not Credentials, not Overscrubbed).
- **Key formats understood**: `Key: value`, `Key - value`, `Key = value`, `Key is value`, with optional quotes, e.g. `Password - customerdelivery2@admin123!`, `PAN: ABCDE1234F`, `OTP is 482913`. Only the value is labeled, never the key.
- **Government IDs and secrets of the Complete PII Type List are all Credentials** (v11.4.8): SSN (`123-45-6789`), passports (`J8369854`, `A12345678`, US `123456789`), driver licences (US `D1234567`, UK `MORGA753116SM9IJ`, India), Aadhaar (also `2345-6789-0123`), voter ID (also `AB/12/345/678901`), UAN, PAN; the token after `Bearer` (token only); vendor keys (`GOCSPX-`, `glrt-`, `dckr_pat_`, `xkeysib-`, `sntrys_`, `pypi-`, Stripe, Slack, GitHub, GitLab, AWS, Google, OpenAI, Anthropic, npm, SendGrid, JWT, ...); secrets behind `secret`, `credentials`, `signature`, `server key`; passphrases (all their words). An ID number needs its key word in front ("SSN", "Passport no.", "DL#"); the number alone is not enough. Indian number plates stay **Vehicle Number Plate**.
- **Integrity hashes** (v11.4.12): in `"integrity": "sha512-<base64>"` (package-lock.json) and `<script integrity="sha384-...">`, the hash after the algorithm name is Credentials (SHA hash), like a hex SHA; `sha512-` itself is not labeled. A hash wrapped over several lines gets one label per line.
- **Connection URLs** (v11.4.8): only the password is labeled (`postgres://admin:**S3cretPass**@db...`); nothing else in the URL.
- **Private key blocks** (v11.4.8): only the key lines between `-----BEGIN ... PRIVATE KEY-----` and `-----END ...-----`, each line on its own.
- **Placeholders are not secrets**: `YOUR_API_KEY_HERE`, `<your-token>`, `xxxxxxxx`, `********`, `changeme`. (AWS's documented example keys, `AKIAIOSFODNN7EXAMPLE`, are labeled: test documents use them as real keys.)
- **Short values behind a key** (CVV `789`, PIN `4821`, expiry `11/28`) are Credentials only when they sit directly after their key (`"cvv": "789"`). A bare 3–4 digit number is never a credential.
- **PIN and OTP (v11.7.1)**: a PIN is **4 digits**; six digits after `PIN` / `Pincode` is a postal PIN code, not a credential. An OTP (4–8 digits) is labeled behind its key or in a sentence (`OTP code 482913 expires`).
- **Not credentials (v11.7.1)**: order, booking, invoice and ticket numbers; plain object ids (`"id": ...`, `node_id`, `user_id`); code references (`process.env.API_KEY`).
- **The token after `Bearer` / `Basic`, and the key after `ssh-rsa` / `ssh-ed25519`**, is what is labeled. A label that also covers that word is accepted. Azure `AccountKey=` / `SharedAccessKey=` values are Credentials.
- **Changed values**: a secret replaced by another secret or by a plain word gets no label; a plain word replaced by a secret-looking value is Overscrubbed (one label for the whole value).
- **Card numbers**: grouped `4-4-4-4` numbers are accepted on format; ungrouped 13–19 digit numbers must pass the Luhn checksum.
- **Bank UTR / transaction references** are recognised behind keys such as `UTR No:`, `Txn ID:`, `Transaction Ref:`.
- **Financial types (v11.4.10)**: bank accounts and **IBANs** (checksum-validated, with or without spaces) are **Account Number**, also behind `Account #` / `Account` without a colon. **US routing (ABA) numbers** (checksum-validated), **IFSC**, **card numbers** (Amex `3782 822463 10005` too), CVV, expiry and **crypto wallets** (Ethereum `0x…`, Bitcoin `1…` / `3…` / `bc1…`) are **Credentials**. A number behind an account / routing / card key is never a phone number. Insurance policy numbers of 12 digits stay Credentials.
- **Account Number (v11.7.6)**: label only the number (not `Account Number:`), the whole number (not a part of a spaced number or IBAN). Order / invoice / ticket numbers, customer IDs, amounts and timestamps are not account numbers. A plain word replaced by an account number is Overscrubbed. Documents hold Indian and US data: sort codes, BSB, CLABE, loan and folio numbers are not labeled.
- **Account ID vs Account Number**: any 12-digit number identical on both sides is treated as Aadhaar / cloud Account ID (Credentials). A 12-digit **bank** account number therefore also lands in Credentials — re-label it as `Account Number` by hand.
- **Exclusion**: Keys such as `account_id`, `_account_id`, `PolicyId`, `password`, `pin`, `otp`, `secret`, `api_key` must **never** receive an annotation badge.

- **How the auditor knows your label (v11.6.0)**: it reads the label's exact name from the dashboard's own review data (the label list and the annotations the page downloads and saves), so two labels with the same colour are never confused. When that data is not available it falls back to the label's colour.

### 5.2 Person Name
- **Condition**: Only mark if **unscrubbed** and identical on both sides (`Left == Right`).
- **Compound Names**: PascalCase names (`OrlaKestrelbrook`) or single lowercase names (`srinadh`) that represent human names are protected from being marked as Overscrubbed.
- **Changed Names**: When a real human name on the Left is replaced by another synthetic name or scrambled text on the Right, **leave it blank (do NOT annotate)**.
- **Prose Guard**: The word "applicant" or "patient" occurring in prose sentences (e.g. `If the applicant is a potential member...`) does not make following words a Person Name. A name *field* needs a key form such as `Applicant: …` or `Author = …`.
- **Never Person Names**: months and weekdays ("June"), places ("India", "West Indies"), and match titles ("India vs Pakistan").
- **Name columns in tables**: in a spreadsheet column where several rows had a name replaced, an unchanged value (`kalaivani`, `bourniya.j`) is a Person Name, a replaced value is a scrubbed name (no label), and the unchanged part of a partly replaced name (`purav` in `purav mallick` -> `purav devivrenric`) is a Person Name.
- **Same-shaped lines**: if one slide heading `# Furkan` was scrubbed, an unchanged heading of the same shape (`# Joaquim`) is a Person Name.
- **(v11.5.1) One name, one label**: the full name is one label (`Rahul Sharma`, `Sean O'Brien`, `Mary-Jane Watson`, surname first `Sharma, Rahul`). A later mention of a part of it (`Rahul`, also lower-case `rahul`) is labeled too, unless that part is a dictionary word (`Will`). A part that only occurs inside the full name gets no label of its own.
- **(v11.5.1) Names in other languages** count, with accents (`José García`, `João Silva`) and from Indonesia / Brazil (`Budi Santoso`, `Siti Rahayu`, `Ana Souza`).
- **(v11.5.1) Lower-case names** are names: after a person cue (`ping srinadh`, `cc: kalaivani, bourniya`, `thanks priya`, `assignee: srinadh`), never on a code line and never a dictionary word (`ping the server`, `cc: everyone`).
- **(v11.5.1)** A name replaced by a plain word is **Overscrubbed** (`Pooja Hegde` → `hello`); a name replaced by another name stays correct redaction.
- **Greetings are not part of a name**: in `Hi Rahul Sharma`, label only `Rahul Sharma`.
- **Name lists**: in `distributed between Naazia, Vinita and Shrusti`, only the capitalised names in the comma-separated list count — not other words later in the sentence.

### 5.3 Business Name
- **Condition**: Must exist identically in both documents (`Left == Right`).
- **Scrubbed Companies**: If a company name is changed (e.g. `Acme Corp` $\rightarrow$ `Vexave Logistics PLC`), **do not label either side**.
- **Negative Constraints (Strict Exclusions)**:
  - **Banking Organizations**: `AXIS BANK`, `HDFC Bank`, `State Bank of India` are excluded.
  - **Table Headers & Field Names**: `Bank Name`, `Patient Name`, `Policy Holder`, `Company Name`, `Vendor` must never be annotated as Business Name.
  - **Software / Cloud Infrastructure**: `Database@AWS`, `Amazon ODB`, `Cloud SQL`, `OAuth`, `Node.js`, `Kubernetes`, `Docker` are technical assets, not Business Names.
  - **Legal entity types and placeholders**: `C Corporation`, `LLC`, `Sole Proprietorship`, and anything inside a form placeholder such as `[E.g., …]` or `[Insert company name]` are not Business Names.
  - **Words inside links**: `github` inside `https://github.com/...` is part of the URL, not a Business Name.
  - **(v11.5.4) A company name inside a code tag or identifier is still a Business Name** (`Juno` in `@OnJunoAPI`): a reviewer's label there is not a mistake.
  - **A lone suffix word** (`Analytics`, `Solutions`, `Group`) is not a company on its own; it needs a name in front (`Acme Analytics`).
  - **(v11.5.0) Platforms used as a tool** (`on Slack`, `via WhatsApp`, `Watch on YouTube`, `Microsoft Teams`) are not companies; as an employer (`works at LinkedIn`, `joined Slack`) they are. A JSON / config key (`"twitter":`) is never a company.
  - **(v11.5.0) Ordinary words are not companies**, even when a company has that name: `a young engineer`, `persistent storage`, `a notion`, `the postman`. A company is written as a name; one that is also a dictionary word (`Persistent`, `Notion`) needs company context and does not count at the start of a sentence. An ordinary word in a company slot (`Vendor: Internal`, `Client: Rejected`) is not a company.
- **(v11.5.0) Organisations are Business Name**: hospitals, clinics, universities, colleges, schools, institutes, academies, foundations and government bodies (`Apollo Hospitals`, `Anna University`, `Delhi Public School`, `Ministry of Corporate Affairs`). Banks stay excluded.
- **(v11.5.0) Forms**: any language (`Müller Logistik GmbH`), all capitals (`ZENTRIX ANALYTICS PVT LTD`), names with `&` (`Ernst & Young`), behind `Company:` / `Organisation:` / `Employer -`, and after "joined" / "works at" (`He joined Zentrix`). The dot of `Inc.` / `Ltd.` / `Corp.` / `Co.` is part of the label. One company gets one label (no extra `Tata` inside `Tata Consultancy Services`).
- **(v11.5.0)** A company replaced by a plain word, or a plain word by a company, is **Overscrubbed**; a company replaced by another company-like name stays correct redaction.

### 5.4 Vehicle Number Plate
- **Real-World Standard Enforced**: Must follow official Indian Motor Vehicles format:
  `2-letter State/UT code` + `1–2 digits (optionally followed by one letter)` + `1–3 letters` + `4 digits`
  or the Bharat Series (`BH` format: `22 BH 1234 AA`).
- **Approved State / UT Codes (36 current)**:
  `AN`, `AP`, `AR`, `AS`, `BR`, `CG`, `CH`, `DD`, `DL`, `GA`, `GJ`, `HP`, `HR`, `JH`, `JK`, `KA`, `KL`, `LA`, `LD`, `MH`, `ML`, `MN`, `MP`, `MZ`, `NL`, `OD`, `PB`, `PY`, `RJ`, `SK`, `TN`, `TR`, `TS`, `UK`, `UP`, `WB`.
- **Legacy codes still accepted** (older plates are still on the road): `OR` (Odisha, before 2012), `UA` (Uttarakhand, before 2007), `DN` (Dadra & Nagar Haveli, before 2020).
- **RTO code may include a letter** (Delhi style): `DL 3C AB 1234` is valid.
- **(v11.5.2) Also labeled**: dots as separators (`KA.05.MN.4321`); older plates without series letters (`MH 12 1234`, `KA-03-4521`); temporary registration plates, as one label (`TS 09 TR 2024 1234`, `KA01TR20240012`); foreign plates (`7ABC123`, `AB12 CDE`, `B 1234 XYZ`) only behind a plate / registration key (`Licence plate:`, `Plate number -`, `Reg No:`).
- **(v11.5.2)** A plate replaced by a plain word, or a plain word by a plate, is **Overscrubbed**.
- **Exclusions**:
  - Synthetic or fictitious state prefixes (e.g. `UT 28 EZ 6570` - `UT` is invalid; `RV 05 KP 6908` - `RV` is invalid).
  - Date redaction diffs (where date phrases are replaced with plate-like strings).
  - Scrubbed plates (plates changed between Left and Right return `null`).

### 5.5 Address
- **Full or partial (v11.4.0)**: a complete address (`Flat 302, Lodha Splendora, Wakad, Pune 411057`) **or a part of one** that locates a place below city level: a street on its own (`MG Road`, `221B Baker Street, London`, `Rua Augusta 1500`, `Jl. Sudirman No. 12`), a sector (`Sector 62, Noida`), a shop / flat / plot with its street (`Shop 4, Linking Road, Bandra West`).
- **The label covers the whole address on the line**: house number, building, street, locality, city, state and PIN together, as one label.
- **Negative Constraints**:
  - A city, state or country on its own (`Bengaluru`, `Maharashtra`, `India`) is **NOT** an address.
  - A postal code on its own is a **Postal Code**, not an Address (see 5.9).
  - A floor on its own (`3rd Floor`) is not an address; ordinary phrases that end in a street word (`Wall Street Journal`, `Google Drive`) are not either.
- **Verification Requirement**: The address must exist identically in **BOTH Left and Right panes**. If scrubbed or altered, do not annotate.
- **Scrubbed address -> no label at all**: if any part of the address changed (street, plot number, PIN), do not label the address, its unchanged fragments (e.g. `Sector 127, Noida`), or the replacement text (`937 Garnthwaite Road`) - not Address, not Overscrubbed.
- **Multi-line addresses**: when the whole block is identical on both sides, label each line of it as Address (the country line too). A key in front ("Ship to: ", "Lives at ") is not part of the label.
- **Wrapped addresses** (v11.4.7): an address that runs onto the next line, also mid-word ("Beng" / "aluru 560087"), is labeled piece by piece, one per line.
- **Every country** (v11.4.7): the label runs to the end of the address: unit, city, state and postcode (`221B Baker Street, Apt 4, London NW1 6XE`, `350 Fifth Avenue, Suite 3300, New York, NY 10118`, `Rua Augusta 1500, Consolacao, Sao Paulo - SP, 01304-001`, `Hauptstrasse 5, 10115 Berlin`). Village addresses (`Village Rampur, Post Sadar, Dist. Gorakhpur, UP 273001`) and **PO boxes** (`P.O. Box 1234, Dubai, UAE`) are addresses.
- **A company first, then its address** (v11.4.7): `Infosys Ltd, Electronics City, Hosur Road, Bengaluru 560100` → `Infosys Ltd` is a Business Name, the rest is the Address.
- **Place names inside an address are not people** (`Anna Salai`, `Baker Street`, `Sao Paulo`).
- **From the first part to the last (v11.7.2)**: a unit, tower, level or `#` in front is part of the address (`Tower B, 5th Floor, ...`, `#45, 2nd Cross, ...`); a lead-in such as `Office at` is not. French and Japanese addresses are covered.
- **Separate fields (v11.7.2)**: when a street field is in the block, the `City:`, `State:` and `ZIP:` values are labeled Address too; a city or state field alone is not.
- **A PIN / ZIP on its own (v11.9.0)** is an Address on the 13-chip page (`Pincode: 560087`).
- **Not an address (v11.7.2)**: a landmark alone (`Near City Mall`, `Opp. SBI Bank`); a city + PIN without a street (`Bengaluru PIN 560001`). `C/O Ramesh Kumar, ...`: the name is Person Name, the rest Address.
- **One label for the whole address (v11.7.2)**: labeling only a part of it (`MG Road` in `12, MG Road, Pune 411001`) is flagged.
- An address replaced by a plain word, or a plain word by an address, is **Overscrubbed**. Addresses inside code (`const street = "MG Road";`) are not labeled.

### 5.6 Overscrubbed (Partial Isolation Rule)
- **Definition**: Non-sensitive generic words, verbs, technical phrases, or structural elements that were unnecessarily altered during redaction.
- **Canonical Examples**:
  - `Council Member` $\rightarrow$ `Council Beagenhydra`: `Beagenhydra` is **`Overscrubbed`**.
  - `potential Council` $\rightarrow$ `orbenorb Council`: `orbenorb` is **`Overscrubbed`**.
  - `end-client` $\rightarrow$ `end-lyroranim`: `lyroranim` is **`Overscrubbed`**.
  - `Provide a brief` $\rightarrow$ `Galearwren a brief`: `Galearwren` is **`Overscrubbed`**.
- **Delimiter-Aware Boundary Rule**:
  When a sub-component of a token is altered while punctuation/delimiters remain identical, **isolate and annotate ONLY the changed sub-token**:
  - `"hydragenzen-10-17"` (from `"2012-10-17"`): Annotate **`hydragenzen`** only. (Do NOT include `-10-17`).
  - `"ap-terovawren-2"` (from `"ap-northeast-2"`): Annotate **`terovawren`** only.
  - `"job-beaexbright"` (from `"job-function"`): Annotate **`beaexbright`** only.
- **The original decides**: if the original text is ordinary words ("Chance R", "Kickoff", "Cricket"), its replacement is Overscrubbed, even when the replacement looks like a name ("Yelanando N"). **(v11.9.0) A replaced place** (city, state, country, or a school / college / hospital name) **is correct redaction**, no label.
- **(v11.9.0)** Also correct redaction (no label): an id replaced by an id of the same shape (`R000001` → `R000007`), a machine username replaced, a hash replaced, a name inside a name field replaced. Overscrubbed: a demographic value replaced (`Nationality - Indian` → `Giduhi`), a placeholder e-mail replaced by a real-looking one.
- **Scrubbed names are not Overscrubbed**: if the original is a name ("Furkan", "Roni S"), its replacement is correct redaction -> no label.
- **Code names (v11.4.4)**: a part of a name joined by `_` or written in camelCase is isolated like a `-` part: `calculate_total` → `calculate_zelvor`: **`zelvor`**; `getUserProfile` → `getUserVelmora`: **`Velmora`**; `OrderService` → `QuarvinService`: **`Quarvin`**.
- **Same kind is fine, another kind is Overscrubbed (v11.4.4)**: a real value replaced by one of the same kind is correct redaction (`Hemant` → `Alex`, `12345` → `00000`, one e-mail or phone for another). **A normal word replaced by any other word, made up or real, is Overscrubbed (v11.7.9)**: `Member` → `Manager`, `pending` → `approved`, `today` → `tomorrow`, because normal words expose no PII or BII. A number, phone, e-mail or link replaced by a plain word is **Overscrubbed** (`12345` → `hello`).
- **Dates (v11.4.4)**: only a date of birth may be scrubbed. Any other changed date is **Overscrubbed**, on its changed part (`12 March 2025` → `19 April 2025`: **`19 April`**; `12-03-2025` → `19-04-2025`: **`19-04`**). A changed DOB gets no label.
- **Version numbers are not dates** (v11.4.13): `^7.12.13`, `~4.17.21`, `"version": "7.14.5"` are never treated as a changed date, and a line that is on the left unchanged is never "changed".
- **Added words** are Overscrubbed (`the report` → `the final report`: **`final`**).
- **Renamed keys are Overscrubbed**: in config files, a renamed key (`API_KEY = …` → `BRYENA_STELWICK = …`) is Overscrubbed, even though the value next to it is a secret.
- **Overscrubbing Exclusions**:
  - If the original text was a genuine **Person Name** or **Business Name**, its replacement is NOT overscrubbed ("if it's scrubbed, no need to label anything").

### 5.7 Date (DOB Strictly Only)
- Only annotate as `Date` if it is explicitly a **Date of Birth** (accompanied by field indicators: `DOB`, `Date of Birth`, `Birth Date`, `Born On`) **and identical on both sides**. A DOB that was changed was correctly scrubbed — leave it blank.
- **(v11.4.9) Keys**: DOB, D.O.B., Date of Birth (`date_of_birth`, `dateOfBirth`), Birth Date, Birthday, Born, the short `b.`, and Hindi `Janm Tithi`, Indonesian `Tanggal Lahir` / `Tgl Lahir`, Portuguese `Data de Nascimento`, Spanish `Fecha de Nacimiento`; also as a table / CSV column.
- **(v11.4.9) Only a full date** (day, month and year), in any written form: `05-11-1988`, `1988-11-05`, `5th November, 1988`, `November 5, 1988`, `05-Nov-1988`. A month and year (`Sept 1996`) or a year alone is not labeled. A date of death is not labeled.
- **(v11.4.9)** A renamed DOB key (`DOB:` → `Zelvo:`) is Overscrubbed and the unchanged date stays a Date. A DOB replaced by a word is Overscrubbed.
- **(v11.7.8)** A two-digit year (`05/11/88`) is a full DOB; a child's, spouse's or parent's DOB is labeled too. With a time (`1988-11-05T00:00:00Z`) only the date is labeled. A plain word replaced by a DOB is Overscrubbed. Label the whole date, without its key.
- General operational dates, statement dates, policy periods, transaction timestamps (`12-01-2026`, `22 Dec 2025 12:00 PM`) must **NOT** be annotated as `Date`.

### 5.8 Person Username & System IDs
- Only explicit social / platform handles beginning with `@` (e.g. `@rahul_92`) that are **identical on both sides** are annotated as `Person Username`. A changed handle was correctly scrubbed — leave it blank. Code annotations (`@Override`, `@media`, `@angular/core`) are not usernames.
- **(v11.4.6)** A handle may hold `-` (`@rahul-verma`) and a server (`@priya@mastodon.social`: the whole handle, not an e-mail). Capitalised handles in a sentence are handles (`Follow @RahulVerma`). Group mentions (`@here`, `@channel`, `@everyone`, `@all`) are not people. Code is told apart by where the @word stands: a decorator / annotation alone on its line above `def` / `class` / `public` / `fun`, followed by `(`, or inside an HTML tag (`<button @click=...>`) is code. Organisation handles (`@NASA`) count; GitHub team handles (`@acme/design-team`) do not.
- **Usernames behind a key** (v11.4.6): the value of a `username`, `user`, `login`, `handle`, `screen_name`, `nickname`, `github`, `twitter`, ... key or column is a Person Username when identical on both sides (`Username: rahul_92`, `"login": "kavya.nair"`). A generic account (`user: Master`, `root`, `admin`, `postgres`, `ec2-user`, ...) or a dictionary word is not a person; a number is an id; a value with a space is a full name (Person Name).
- A handle replaced by a plain word is **Overscrubbed** (`@rahul_92` → `hello`), and so is a plain word replaced by a handle (v11.7.4).
- **(v11.9.0)** Not usernames: documentation tags (`* @package`), Ruby `@variables`, Perl arrays (`@ARGV`), and any ALL-CAPS word after `@` (`@NASA`, `@BIOS`). An @-mention of a full name (`@Himanshu Shankar`) is one Person Username label. Usernames in app logs (`accessed for siroju_gilivasu_892pv14134`) are labeled.
- **(v11.7.4)** A Username / Login **column** holds usernames. A username is labeled wherever it appears: Reddit `u/name`, Discord `name#1234`, the user folder of a file path (`/home/rahul/`, `C:\Users\rahul.sharma\`; not `Public`, `Shared`, `ubuntu`), a git author's one-word login. **Not usernames**: bots (`@dependabot`, `@github-actions`), user ids (`<@U024BE7LH>`), SQL variables (`@UserId`), spreadsheet references (`@Table1`).
- **Types in code are not usernames** (v11.4.11): `username: Attribute.String;`, `user: UserEntity;`, `username: string;`, `handle: Schema.Types.String,`. In code only a quoted value counts (`username: "rahul_92"`).
- Git commit hashes, API node IDs (`node_id`), base64 strings (`MDY6Q29tbWl0...`), login session keys, and numeric database IDs are **NOT** usernames and must **NOT** be annotated.

### 5.9 Other Categories (Contact, Email, IP, URL)
- **Indian Mobile Number** (v11.4.0, replaces Contact Number for mobiles): 10 digits starting 6–9, with an optional `+91`, `91` or `0` in front, which is part of the label (`+91 98450 12345`, `09845012345`, `984-501-2345`).
- **International Phone Number** (v11.4.0): every other phone number, including Indian landlines (`080-2345 6789`, `+91 80 2345 6789`) and toll-free numbers (`1800-123-4567`). The country code and brackets are part of the label (`+1 (415) 732-0198`, `+55 11 91234-5678`, `0812-3456-7890`). A run of digits without a phone shape counts only right after a phone word (`Fax: 2345 6789`). Dates, IP addresses, SSN, CPF, EIN, ZIP+4, CEP, card and Aadhaar numbers are never phones. Only the US range reserved for fiction, `555-0100` to `555-0199`, is not labeled (v11.4.2); other numbers with 555 (`(415) 555-0232`) are real phones.
- **Contact Number details (v11.5.3)**: a number in brackets is found (`Rahul (9845012345)`); the `00` international prefix is part of the number (`0044 20 7946 0321`); an extension is not (`… ext. 204` → only the number); vanity numbers (`1-800-FLOWERS`) are not labeled; a number behind an order / invoice / ticket / booking / employee-ID key is not a phone (`Order #9845012345`); a number inside a link gets no label of its own (`https://wa.me/919876543210` is only the URL); a plain word replaced by a phone number is Overscrubbed.
- **Which chips the page has (v11.4.1)**: the auditor uses the labels whose chips are on the page. With only the 13 old chips, every phone number (Indian mobile, landline, other countries) is **Contact Number** and postal codes are not labeled. With the new chips, a phone labeled Contact Number is shown as a mistake, with the right one of the two labels above.
- **Postal Code / Indonesian Postal Code / Brazilian CEP** (v11.4.0): labeled when a key or a column names the value (`Pincode: 560087`, `"postal_code": "560001"`, `ZIP 94105-1234`, `Postcode: SW1A 1AA`, a CSV `postal_code` column). `Kode pos` gives Indonesian Postal Code (5 digits) and `CEP` gives Brazilian CEP (`#####-###`). A bare number with no key is not labeled. Inside an address line, the whole line is the Address.
- **Email Address**: Valid `user@domain` addresses, identical on both sides. File names such as `icon@2x.png` are not emails.
  - (v11.7.3) Accented name parts are part of the e-mail (`josé@empresa.com.br`). System addresses (`noreply@`, `MAILER-DAEMON@`) are e-mails; template domains (`company.com`, `domain.com`, `yourdomain.com`, ...) are placeholders.
  - Label exactly the e-mail: not `mailto:` or `< >`, not only its name part. A name or company inside an e-mail is not labeled on its own: the whole e-mail is the Email Address.
  - A plain word replaced by an e-mail is Overscrubbed.
  - **Placeholders** (v11.4.3): only fake domains are skipped (`example.com`, `test.com`, `dummy.com`, `sample.com`, `placeholder.com`, `domain.com`). The name part alone does not make a placeholder: `test@acmecorp-demo.io`, `user@acmecorp-demo.io` are e-mails.
  - The name part may hold an apostrophe (`sean.o'brien@...`); it cannot start or end with a dot or hold two dots in a row.
  - **Broken over two lines** (v11.4.3): `priya.raghavan@northwind-` / `demo.com` is one e-mail; each line's piece is labeled.
  - **Hidden addresses** (v11.4.3): `priya.raghavan [at] northwind-demo [dot] com`, `priya(at)northwind-demo.com`, `arjun.mehta at contoso-demo dot co dot in` are not labeled as e-mails. When the same hidden address is on both sides, the person's name (`priya.raghavan`) is a **Person Name** and the company (`northwind-demo`) is a **Business Name**. A mailbox name (`support`, `hr`, `info`) is not a person, and a webmail provider (`gmail`, `outlook`, `yahoo`) is not a company.
- **IP Address**: IPv4 (e.g. `192.168.1.1`) and IPv6 (e.g. `2001:db8::1`). MAC addresses (`00:1A:2B:3C:4D:5E`) are **not** IP addresses.
  - **The label is the address only** (v11.4.5): not the port (`10.0.0.12:8080` → `10.0.0.12`), not the range suffix (`10.0.0.0/16` → `10.0.0.0`, `2001:db8::/32` → `2001:db8::`), not the network-card suffix (`fe80::1%eth0` → `fe80::1`).
  - Every IPv6 form counts: `::` anywhere (`fe80::1ff:fe23:4567:890a`, `::1`), an IPv4 tail (`::ffff:192.168.1.10`). Both ends of a range (`10.0.0.1-10.0.0.50`) are labeled.
  - A four-part version number is not an IP: with a version word before (`Version 1.2.3.4`) or after it (`10.2.0.15 build`, `4.18.0.2 release`).
  - Loopback, `0.0.0.0`, network masks and the documentation ranges are treated like any other address.
  - An ordinary word replaced by an IP address is **Overscrubbed** (`Server alpha` → `Server 10.1.2.3`).
- **MAC addresses (v11.7.11)** are labeled IP Address (`00:1A:2B:3C:4D:5E`, `0011.2233.4455` behind a MAC key).
- **IP Address (v11.7.7)**: label only the address (no port, key, `/24` suffix or punctuation). Loopback (`127.0.0.1`, `::1`), broadcast and netmask addresses are not labeled; neither are package versions (`"version": "10.2.0.15"`, a dependencies block). Documentation-range IPs (`192.0.2.x`, `203.0.113.x`) are labeled.
- **URL / Link**: `https://` and (v11.7.11) `http://` links identical on both sides are labeled. Bare `www.` links are left unlabeled. Placeholders (`https://example.com`, `localhost`) and footnote anchors (`#footnote-1`) are excluded.
  - **Links to files are not labeled** (v11.4.1): when the last part of the path (before `?` or `#`) ends in a file extension: styles and scripts (`.css .js .mjs .map .wasm`), images (`.png .jpg .jpeg .gif .svg .ico .webp .bmp .avif`), fonts (`.woff .woff2 .ttf .otf .eot`), archives and packages (`.tgz .tar .gz .zip .7z .rar .bz2 .xz .whl .jar .war .deb .rpm .apk .exe .msi .dmg .pkg`), audio and video (`.mp3 .wav .mp4 .mov .avi .webm`), data and config (`.json .xml .yaml .yml .lock`), code (`.py .java .ts .go .sh`). Pages stay links (`.html`, `.php`, `?file=a.pdf`), and so does a repository on GitHub / GitLab / Bitbucket (`github.com/acme/three.js`).
  - **Links to documents ARE labeled** (v11.4.2), because a document may hold personal data: `.pdf .doc .docx .xls .xlsx .ppt .pptx .csv .txt .md`. So are Google Drive / Docs / Sheets / Slides / Forms links (`docs.google.com/...`, `drive.google.com/...`), including when the line breaks inside the long document id.
  - **(v11.7.5)** Upper-case links count. **A link to an IP address is not a link**: label the IP address (`10.0.0.5` in `https://10.0.0.5/admin`). Template links (`your-domain.com`, `${HOST}`, `{{host}}`) and standards addresses (`json-schema.org`, `schema.org`) are not labeled. A link with a secret in it is one URL/Link label. A word inside a link is part of the link, not a name or a company. A link replaced by a plain word, or a plain word by a link, is Overscrubbed.
  - **Wrapped links** (v11.4.1): a link broken over several lines is one link, wherever the break falls (mid-word, before `.io`, inside a query). Each line's piece gets its own label, because a label cannot span lines. The next line is not part of the link when it is a list marker (`-`, `2.`), a bracket or quote, `e.g.`, another link, or an ordinary capitalised word.

---

### 5.12 Code that looks like a value (v11.11.2)
- A constant's **name** (`CONFLUENT_CLOUD_API_KEY`) is not a credential; only its value is.
- `@typescript-eslint`, `@echo`, `@setlocal` are code, not usernames.
- A value replaced on a token / key / password line is correct redaction, not Overscrubbed.
- `INCLUDING BUT NOT LIMITED` is not a company; `session.client`, `service_name='secretsmanager'` are code, not a company or a person.
- An empty `KEY=` never takes the next line; localhost links are not labeled.

### 5.11 Built-in data lists (v11.11.0)
The auditor knows ~108k real person names, ~48k institutions, listed companies and every real Indian PIN / US ZIP code. Institutions (schools, colleges, universities, IITs) are **Business Name**; company names written in lower case are labeled when the sentence shows a company; a postal code on its own is labeled only when it really exists.

### 5.10 Disguised values (v11.10.0)
A value written with spaces between its characters (`9 8 4 5 0 1 2 3 4 5`), with non-Latin digits (Devanagari, fullwidth, ...) or split over two lines (`Id Passport: X486` / `5305`) is judged as the value it is: label it as written, the whole of it (both pieces when it is split over two lines).

## 6. Comprehensive Do's and Don'ts Matrix

| Feature / Case | ❌ INCORRECT (Common Mistake) | ✅ CORRECT (Standard Procedure) | Rationale |
| :--- | :--- | :--- | :--- |
| **AWS Account ID in JSON** | Annotate `_account_id": "243057143242` | Annotate **`243057143242`** | Structural keys must never be annotated; only the secret value. |
| **IAM Policy ID** | Annotate `PolicyId: ANPAZKAP...` | Annotate **`ANPAZKAP...`** | Value-only rule for credentials. |
| **Scrubbed Human Name** | Label replacement `Melivn O` as Person Name | **Leave blank (do not label)** | Scrubbed entities must not be labeled as Person Name. |
| **Compound Scrubbed Word** | Ignore `Beagenhydra` (thinking it's a name) | Label **`Beagenhydra`** as **`Overscrubbed`** | It replaced the common noun "Member" in "Council Member". |
| **Hyphenated Token Diff** | Label full `hydragenzen-10-17` | Label **`hydragenzen`** as **`Overscrubbed`** | Common suffix `-10-17` was unchanged; isolate the scrubbed part. |
| **Delimited Path Diff** | Label full `job-beaexbright/AmazonODB` | Label **`beaexbright`** as **`Overscrubbed`** | Delimiter isolation extracts only the synthetic token. |
| **Bank Name in Table** | Label `AXIS BANK` as Business Name | **Leave blank (do not label)** | Banking organizations are strictly excluded from Business Name. |
| **Table Column Header** | Label header `Bank Name` or `Patient Name` | **Leave blank (do not label)** | Form/table field headers are never entities. |
| **Cloud Software Resource** | Label `Database@AWS` as Business Name | **Leave blank (do not label)** | Software and infrastructure components are not business names. |
| **Invalid State Plate** | Label `UT 28 EZ 6570` as Vehicle Plate | **Leave blank (do not label)** | `UT` is not a recognized Indian state code; strictly invalid. |
| **Single City Name** | Label `Bengaluru` or `Pune` as Address | **Leave blank (do not label)** | Single cities are not complete addresses. |
| **Changed Full Address** | Label address when left $\neq$ right | **Leave blank (do not label)** | Address must exist identically in both Left and Right documents. |
| **Statement Date** | Label `12-01-2026 00:00:00` as Date | **Leave blank (do not label)** | Only Date of Birth (DOB) may be labeled as Date. |

---

## 7. Automated Verification & QA Protocols

Every document processed by the automated engine or human annotator must pass a 4-point QA check before submission:

1. **Zero Key Contamination**:
   - Inspect JSON/YAML payloads. Verify that no JSON keys (`password`, `account_id`, `PolicyId`, `pin`) possess an underline or label tag.
2. **Double-Ended Identity Check**:
   - Verify that all active `Person Name`, `Business Name`, `Address`, and `Credentials` annotations exist in verbatim form in the Left document pane.
3. **Delimiter Cleanliness Check**:
   - Ensure all `Overscrubbed` annotations are stripped of trailing hyphens, slashes, brackets, or commas.
4. **State Code Authenticity Check**:
   - Confirm every `Vehicle Number Plate` begins with an official 2-letter Indian State/UT code (or a legacy code listed in 5.4).

### 7.2 Team sync (v11.8.0)

The learning of every reviewer is pooled for the whole team, as hashes only: no document text leaves anyone's browser.
- A term labeled by 3+ reviewers on 2+ tasks is suggested to everyone ("learned from the team").
- A text rejected 5+ times by 2+ reviewers, and never accepted, is no longer suggested with that label.
- A label the team mostly rejects (20+ decisions, under 30% accepted) is shown faded.
- **Accuracy (v11.8.2)**: popup → **Accuracy report** shows precision (suggestions that were right) and coverage (reviewers' labels that were suggested) per label and per day, for the team and for you; the data repo's `REPORT.md` shows the team report.
- The popup's **Team sync** switch turns it off for you. Your learning is sent every 15 minutes; the team bundle is built at 15:30 and 21:00 IST and reaches every extension within the hour (or at once with **Sync now**).

### 7.1 Learning from reviewers (v11.7.0)

The auditor learns from what reviewers save, on each reviewer's own computer:

| What the reviewer does | What the auditor learns |
| --- | --- |
| Saves the suggested label on suggested text | Accepted (for the label and for that exact text) |
| Saves another label on suggested text, or deletes the suggested label | Rejected |
| Ignores a suggestion | Nothing |
| Labels text that was not suggested | Remembered; suggested once the same label is saved on 2 different tasks |

- A text rejected 3+ times and never accepted stops being suggested with that label.
- A label with 20+ decisions and under 30% accepted is shown faded ("low confidence").
- The label check and the rules in this document are never changed by learning.
- Use the toolbar popup to see the counts, **Export** them as JSON, or **Reset** them.

> The browser auditor is an assistant, not an authority. It highlights likely labels and likely mistakes; the annotator makes the final call. Known gaps are listed in the README under *Known limitations*.

