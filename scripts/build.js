// Build every distributable from the single source file src/content.js.
//   node scripts/build.js
// 1. Runs the test suite (build stops if any test fails).
// 2. Copies the engine into extension/ and generates the userscript + console-paste builds in dist/.
// 3. Writes the real test numbers into README.md (between the TEST-RESULTS markers).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const rel = (...p) => path.join(root, ...p);
const read = (p) => fs.readFileSync(rel(p), 'utf8');

// --- 1. tests must pass
try {
  execFileSync(process.execPath, [rel('tests', 'run.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'matrix.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'labels.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'labels_deep.js')], { stdio: 'inherit' });
  // mass test: 5,000 generated documents in the build (set MASS_N=200000 for a full campaign)
  execFileSync(process.execPath, [rel('tests', 'mass.js')], { stdio: ['ignore', 'pipe', 'inherit'], env: Object.assign({}, process.env, { MASS_N: process.env.MASS_N || '5000' }) });
  console.log('mass test passed (tests/mass.js)');
  execFileSync(process.execPath, [rel('tests', 'exact.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'contact.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'credentials.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'address.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'email.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'username.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'url.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'account.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'ip.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'dob.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'overscrub.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [rel('tests', 'relay.js')], { stdio: 'inherit' });
} catch (e) {
  console.error('\nBuild stopped: tests failed.');
  process.exit(1);
}
let haveJsdom = true;
try { require.resolve('jsdom', { paths: [root] }); } catch (e) { haveJsdom = false; }
if (haveJsdom) {
  try {
    execFileSync(process.execPath, [rel('tests', 'dom.js')], { stdio: 'inherit', cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_large.js')], { stdio: 'inherit', cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_labelcheck.js')], { stdio: 'inherit', cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_e2e.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_review_data.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_learning.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_sync.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root });
    execFileSync(process.execPath, [rel('tests', 'dom_chrome_colours.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root });
  }
  catch (e) { console.error('\nBuild stopped: DOM tests failed.'); process.exit(1); }
} else {
  console.warn('\n(Skipping DOM tests: run `npm install` to enable them. They catch start-up errors in a real page.)');
}

// --- 2. versions must agree
const src = read('src/content.js');
const version = (src.match(/const PT_VERSION = "([\d.]+)"/) || [])[1];
const manifest = JSON.parse(read('extension/manifest.json'));
if (!version) { console.error('PT_VERSION not found in src/content.js'); process.exit(1); }
if (manifest.version !== version) {
  console.error(`Version mismatch: src/content.js says ${version}, extension/manifest.json says ${manifest.version}`);
  process.exit(1);
}

// (v11.6.0) the page hook runs inside the page (world MAIN, document_start) and passes the dashboard's review data on
// (written before the manifest check below, which needs the file to exist)
const hook = read('src/page-hook.js');
fs.writeFileSync(rel('extension', 'page-hook.js'), hook);
// (v11.8.0) the background worker does the team sync (all network traffic of the extension)
fs.writeFileSync(rel('extension', 'background.js'), read('src/background.js'));

// Root manifest (v11.2.2): Chrome's "Load unpacked" then also works on the PROJECT folder itself, not only on extension/.
// Choosing the project folder used to fail with "Manifest file is missing or unreadable".
{
  const rootManifest = JSON.parse(JSON.stringify(manifest));
  const pre = (pth) => 'extension/' + pth;
  rootManifest.action.default_popup = pre(rootManifest.action.default_popup);
  for (const k of Object.keys(rootManifest.action.default_icon)) rootManifest.action.default_icon[k] = pre(rootManifest.action.default_icon[k]);
  for (const k of Object.keys(rootManifest.icons)) rootManifest.icons[k] = pre(rootManifest.icons[k]);
  rootManifest.content_scripts = rootManifest.content_scripts.map(cs => Object.assign({}, cs, { js: cs.js.map(pre) }));
  if (rootManifest.background) rootManifest.background.service_worker = pre(rootManifest.background.service_worker);
  fs.writeFileSync(rel('manifest.json'), JSON.stringify(rootManifest, null, 2) + '\n');
  // Check both manifests: valid JSON, MV3, and every file they name exists.
  for (const [base, m] of [['extension', manifest], ['.', rootManifest]]) {
    const files = [m.action.default_popup, ...Object.values(m.action.default_icon), ...Object.values(m.icons), ...m.content_scripts.flatMap(cs => cs.js), ...(m.background ? [m.background.service_worker] : [])];
    for (const f of files) if (!fs.existsSync(path.join(root, base, f))) { console.error(`manifest in ${base}: missing ${f}`); process.exit(1); }
    if (m.manifest_version !== 3) { console.error('manifest_version must be 3'); process.exit(1); }
  }
  console.log('manifests OK (extension/manifest.json and ./manifest.json)');
}

fs.mkdirSync(rel('dist'), { recursive: true });
fs.writeFileSync(rel('extension', 'content.js'), src);
// The Chrome extension build itself is tested (chrome.runtime stub: label check, popup status, popup diagnostics).
try { require.resolve('jsdom', { paths: [root] }); execFileSync(process.execPath, [rel('tests', 'dom_extension.js')], { stdio: ['ignore', 'inherit', 'ignore'], cwd: root }); }
catch (e) { if (e.status) { console.error('extension test failed'); process.exit(1); } }

const userscript = `// ==UserScript==
// @name         PeakTalent PII/BII Annotation Auditor
// @namespace    https://dashboard.peaktalent.ai/
// @version      ${version}
// @description  Highlights PII/BII, credentials and overscrubbed text on PeakTalent review screens. Works fully offline.
// @match        https://dashboard.peaktalent.ai/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==
// GENERATED FILE - edit src/content.js and src/page-hook.js, then run \`node scripts/build.js\`.

// Page hook first (it must see the review data the dashboard loads), the auditor once the page is ready.
${hook}
(function __ptStartAuditor() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', __ptStartAuditor, { once: true }); return; }
${src}
})();`;
fs.writeFileSync(rel('dist', 'peaktalent-auditor.user.js'), userscript);

const paste = `// PeakTalent Auditor v${version} - console build.
// Open the PeakTalent review tab, open the browser console (Safari: Develop > Show JavaScript Console,
// Chrome: Cmd/Ctrl+Option/Alt+J), paste this whole file and press Enter. Pasting again replaces the old copy.
// GENERATED FILE - edit src/content.js and src/page-hook.js, then run \`node scripts/build.js\`.
// Pasted after the page loaded, it reads labels from the review data only for changes made from now on; reload the
// review and paste again to read every label exactly.

${hook}
${src}`;
fs.writeFileSync(rel('dist', 'console-paste.js'), paste);

// --- 3. real test numbers into README
const results = JSON.parse(read('tests/results.json'));
const rows = Object.entries(results.suites).map(([s, c]) => `| ${s} | ${c.pass} / ${c.pass + c.fail} |`).join('\n');
const block = `<!-- TEST-RESULTS:START (generated by scripts/build.js — do not edit by hand) -->
**${results.passed} / ${results.total} checks passing** on engine v${version} (run on ${results.generated.slice(0, 10)}).

| Suite | Passing |
| --- | --- |
${rows}
<!-- TEST-RESULTS:END -->`;
const readme = read('README.md');
const updated = readme.replace(/<!-- TEST-RESULTS:START[\s\S]*?<!-- TEST-RESULTS:END -->/, block);
if (updated === readme && !readme.includes(block)) { console.error('README.md is missing the TEST-RESULTS markers'); process.exit(1); }
fs.writeFileSync(rel('README.md'), updated);

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(rel(p))).digest('hex').slice(0, 16);
console.log(`\nBuilt v${version}`);
for (const f of ['extension/content.js', 'dist/peaktalent-auditor.user.js', 'dist/console-paste.js']) console.log(`  ${f}  sha256:${sha(f)}`);
