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

refresh();
