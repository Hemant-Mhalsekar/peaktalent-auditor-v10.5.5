// Toolbar popup: shows status for the current tab and triggers a re-audit.
const $ = (id) => document.getElementById(id);

function setStatus(kind, text) {
  $('status').className = 'status ' + kind;
  $('status-text').textContent = text;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function send(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      // No content script in this tab (not a PeakTalent page, or the page was opened before install).
      if (chrome.runtime.lastError) resolve(null); else resolve(res);
    });
  });
}

async function refresh() {
  const tab = await activeTab();
  if (!tab || !/^https:\/\/dashboard\.peaktalent\.ai\//.test(tab.url || '')) {
    setStatus('', 'Open a review task on dashboard.peaktalent.ai');
    return;
  }
  const res = await send(tab.id, { action: 'status' });
  if (!res) { setStatus('warn', 'Reload the PeakTalent tab to start the auditor'); return; }
  $('rescan').disabled = false;
  $('diag').disabled = false;
  if (!res.onReviewScreen) { setStatus('', 'Waiting for a side-by-side review screen'); return; }
  $('stats').hidden = false;
  $('tags').textContent = res.tags;
  $('mistakes').textContent = res.mistakes || 0;
  showLearning(await send(tab.id, { action: 'learning' }));
  // (v11.3.5) labels the check could not read or judge: "0 mistakes" must not look like "all correct" when this is not 0
  const notChecked = res.notChecked || 0;
  if ($('notchecked')) $('notchecked').textContent = notChecked;
  if (!res.active) setStatus('warn', 'Paused (use the bar on the page to resume)');
  else if (res.mistakes > 0) setStatus('bad', res.mistakes + ' wrong label' + (res.mistakes === 1 ? '' : 's') + ' - hover the red outlines' + (notChecked > 0 ? ' (+' + notChecked + ' not checked)' : ''));
  else if (notChecked > 0) setStatus('warn', '0 mistakes, ' + notChecked + ' not checked - press Copy diagnostics and send it');
  else setStatus('ok', 'Auditing this document');
}

$('rescan').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  $('rescan').disabled = true;
  await send(tab.id, { action: 'rescan' });
  setTimeout(() => { $('rescan').disabled = false; refresh(); }, 400);
});

$('diag').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  const res = await send(tab.id, { action: 'diagnostics' });
  const text = (res && res.text) || 'No answer from the page - reload the PeakTalent tab and try again.';
  $('diagtext').hidden = false;
  $('diagtext').value = text;
  $('diagtext').select();
  try { await navigator.clipboard.writeText(text); $('diag').textContent = 'Copied - paste it in your message'; }
  catch (e) { try { document.execCommand('copy'); $('diag').textContent = 'Copied - paste it in your message'; } catch (x) { $('diag').textContent = 'Select the text below and copy it'; } }
});

// (v11.7.0) learning from reviewers: what has been learned on this computer, with Export (JSON) and Reset
function showLearning(res) {
  if (!res || !res.summary) return;
  const s = res.summary;
  $('learn').hidden = false;
  $('l-dec').textContent = s.decisions;
  $('l-hidden').textContent = s.hiddenTexts;
  $('l-terms').textContent = s.learnedTerms;
  const low = s.labels.filter(x => x.low).map(x => x.label);
  $('l-low').textContent = low.length ? low.join(', ') : 'none';
}

$('l-export').addEventListener('click', async () => {
  const tab = await activeTab();
  const res = tab && await send(tab.id, { action: 'learning-export' });
  if (!res || !res.json) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([res.json], { type: 'application/json' }));
  a.download = 'peaktalent-learning-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
});

// Reset asks for a second click instead of a dialog (a dialog closes the popup)
let resetArmed = null;
$('l-reset').addEventListener('click', async () => {
  if (!resetArmed) {
    $('l-reset').textContent = 'Click again to reset';
    resetArmed = setTimeout(() => { resetArmed = null; $('l-reset').textContent = 'Reset'; }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  const tab = await activeTab();
  const res = tab && await send(tab.id, { action: 'learning-reset' });
  $('l-reset').textContent = 'Reset';
  showLearning(res);
});

// (v11.8.0) team sync: the background worker sends hashed learning to the team relay and keeps the team bundle
const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
function bg(msg) { return new Promise((resolve) => { try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r || null); }); } catch (e) { resolve(null); } }); }
function showTeam(s) {
  if (!s) { $('t-status').textContent = 'not running - reload the extension'; return; }
  $('t-on').checked = !!s.enabled; $('t-on').disabled = !s.configured; $('t-now').disabled = !s.configured || !s.enabled;
  $('t-status').textContent = !s.configured ? 'off (no team-config.js)' : !s.enabled ? 'off' : s.lastError ? s.lastError : 'on - sent ' + ago(s.lastSent);
  $('t-queued').textContent = s.queued;
  $('t-built').textContent = s.bundleBuilt ? new Date(s.bundleBuilt).toLocaleDateString() + ' (fetched ' + ago(s.bundleFetched) + ')' : 'none yet';
  $('t-terms').textContent = s.teamTerms;
  $('t-id').textContent = s.client ? s.client.slice(0, 8) : '-';   // (v11.12.0) the id in the report's "Who is up to date"
}
$('t-on').addEventListener('change', async () => showTeam(await bg({ action: 'pt-sync-toggle', on: $('t-on').checked })));
$('t-now').addEventListener('click', async () => { $('t-now').disabled = true; $('t-now').textContent = 'Syncing…'; showTeam(await bg({ action: 'pt-sync-now' })); $('t-now').textContent = 'Sync now'; });
bg({ action: 'pt-sync-status' }).then(showTeam);
// (v11.8.2) the accuracy report opens in its own tab
$('t-acc').addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL('accuracy.html') }); });

refresh();
