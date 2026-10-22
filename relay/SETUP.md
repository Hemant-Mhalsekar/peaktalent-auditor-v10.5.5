# Team sync – setup (v11.8.1)

The team sync pools what every reviewer's extension learns, as **hashes only**. It needs three free pieces:

| Piece | Where | What it does |
|---|---|---|
| Relay | Cloudflare Worker `pt-auditor-relay` | Checks the hashed batches from the extensions and stores them; serves the team bundle. Holds the GitHub token. |
| Data repo | Private GitHub repo `peaktalent-auditor-data` | Stores the batches (`events/`), the running totals (`state/`) and the team bundle (`shared/bundle.json`). |
| Build job | GitHub Action in the data repo | Turns the batches into the team bundle, at 15:30 and 21:00 IST. |

## Part A – done already
1. Private repo `peaktalent-auditor-data` created.
2. Fine-grained token (only that repo, Contents read/write) created and saved in Cloudflare as the secret `GITHUB_TOKEN`.
3. Worker `pt-auditor-relay` created, with the text variable `GITHUB_REPO` = `Hemant-Mhalsekar/peaktalent-auditor-data`.

## Part B – the team key (Cloudflare, 2 minutes)
1. On your computer, open `extension/team-config.js` in this project (it is NOT in git).
2. Copy the value of `key:` (the long text between the quotes, without the quotes).
3. Cloudflare → Workers & Pages → `pt-auditor-relay` → **Settings** → **Variables and Secrets** → **Add**:
   - Type **Secret**, name `TEAM_KEY`, value: the key you copied → **Deploy**.

## Part C – the relay code (Cloudflare, 3 minutes)
1. Cloudflare → `pt-auditor-relay` → **Edit code** (top right).
2. Select everything in the editor and delete it.
3. Open `relay/worker.js` from this project, copy ALL of it, paste it into the editor.
4. Click **Deploy**.
5. Check: open `https://pt-auditor-relay.hemantmhalsekar01.workers.dev/` in the browser. It must say **PeakTalent relay ok**.

## Part D – the nightly job (GitHub, 5 minutes)
1. Open `github.com/Hemant-Mhalsekar/peaktalent-auditor-data`.
2. **Add file → Create new file**, name `aggregate.mjs`. Paste ALL of `relay/aggregate.mjs` from this project. **Commit changes**.
3. **Add file → Create new file**, name `.github/workflows/aggregate.yml` (type the slashes; GitHub makes the folders). Paste ALL of `relay/aggregate.yml`. **Commit changes**.
4. Repo **Settings → Actions → General → Workflow permissions**: choose **Read and write permissions** → **Save**.
5. **Actions** tab → **Aggregate** → **Run workflow** → **Run workflow**. After about a minute it shows a green tick and the repo has `shared/bundle.json`.

## Part E – your extension (1 minute)
1. `chrome://extensions` → PeakTalent Auditor → the **reload** arrow.
2. Open a review task, click the extension icon. **Team sync** should say **on**. Click **Sync now**: "Team bundle" shows today's date.

## Part F – the reviewers
- Send them the **whole extension folder including `extension/team-config.js`** (zip it), privately (not on GitHub: this repo is public).
- Each reviewer: remove the old copy, unzip, `chrome://extensions` → **Load unpacked** → choose the folder.
- To turn sync off for one person: the popup switch. To turn it off for everyone: delete `TEAM_KEY` in Cloudflare.

## Privacy
- Texts and task ids are hashed in the reviewer's browser before anything is sent; the relay refuses any batch that contains other fields.
- Reviewers appear only as random ids. The data repo holds hashes and counts, never document text.
- A hash of a very common name can be guessed by trying names; keep the data repo private and the salt (in `team-config.js`) within the team.

## Renewing the GitHub token (once a year)
GitHub → Settings → Developer settings → Fine-grained tokens → `pt-auditor-relay` → **Regenerate**, then update the `GITHUB_TOKEN` secret in Cloudflare.

## Updating to a new version of the relay or the job
- Relay: Cloudflare → `pt-auditor-relay` → **Edit code** → replace everything with the new `relay/worker.js` → **Deploy**.
- Job: data repo → `.github/workflows/aggregate.yml` → the pencil (Edit) → replace everything with the new `relay/aggregate.yml` → **Commit changes**.
