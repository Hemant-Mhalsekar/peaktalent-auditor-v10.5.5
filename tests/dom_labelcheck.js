// Real-DOM tests (need jsdom) for the LABEL CHECK (v11.0.0), using the live dashboard's own label markup as reported
// by its Diagnose panel: <mark role="button"> with a translucent background + gradient underline, colours from the
// label chips at the top. Every label is tested: correct label -> no mark; wrong label -> red mark naming the
// CORRECT label. Also: re-check after every annotation, label change, label removal, and that the document text
// is never modified.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Indian Mobile Number': [250, 140, 22], 'International Phone Number': [0, 150, 80], 'Postal Code': [120, 40, 40],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const LABELS = Object.keys(PAL);
const chipsFor = (P) => Object.entries(P).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const chips = chipsFor(PAL);
const markStyle = (label, P = PAL) => { const [r, g, b] = P[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));`; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function page(leftLines, rightLines, P = PAL) {
  const dom = new JSDOM(`<!doctype html><body><div>${chipsFor(P)}<span>Reference · read-only</span><span>Annotate here</span><span>left.docx-1</span><span>right.docx-1</span></div>
    <div id="left">${leftLines.map(l => `<div>${esc(l)}</div>`).join('')}</div><div id="right">${rightLines.map(l => `<div>${esc(l)}</div>`).join('')}</div></body>`,
    { runScripts: 'outside-only', url: 'https://dashboard.peaktalent.ai/review', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1400 }); Object.defineProperty(w, 'innerHeight', { value: 900 });
  const Lp = w.document.getElementById('left'), Rp = w.document.getElementById('right');
  const box = (l, t, wd, h) => ({ left: l, top: t, width: wd, height: h, right: l + wd, bottom: t + h });
  w.Element.prototype.getBoundingClientRect = function () {
    if (this === Lp) return box(40, 100, 600, 700);
    if (this === Rp) return box(720, 100, 600, 700);
    if (Rp.contains(this) || Lp.contains(this)) return box(this.closest('#left') ? 40 : 720, 120, 300, 20);
    return box(0, 0, 0, 0);
  };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.__PT_TEST__ = true; w.eval(src);
  const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
  await settle();
  // the reviewer labels `word` with `label` the way the platform does (wraps the plain text in a <mark>)
  const annotate = async (word, label, inside = false) => {
    // find the word in the document text (it may be split by the auditor's own suggestion spans) and wrap it
    const nodes = [], starts = []; let all = '';
    const walker = w.document.createTreeWalker(Rp, w.NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { nodes.push(n); starts.push(all.length); all += n.nodeValue; }
    let pos = -1, from = 0;
    while ((pos = all.indexOf(word, from)) >= 0) {
      const inMark = nodes.some((nd, k) => starts[k] <= pos && pos < starts[k] + nd.nodeValue.length && nd.parentElement.closest('mark'));
      if (!inMark) break; from = pos + 1;
    }
    if (pos < 0) throw new Error('word not found: ' + word);
    const at = (p) => { let k = 0; while (k + 1 < nodes.length && starts[k + 1] <= p) k++; return [nodes[k], p - starts[k]]; };
    const [sn, so] = at(pos), [en, eo] = at(pos + word.length - 1);
    const rg = w.document.createRange(); rg.setStart(sn, so); rg.setEnd(en, eo + 1);
    // the word is exactly one of the auditor's suggestion spans: label the whole span (as an editor re-render would)
    const tag = sn === en && sn.parentElement.classList.contains('pt-tag') && sn.parentElement.textContent === word ? sn.parentElement : null;
    if (tag && !inside) { rg.setStartBefore(tag); rg.setEndAfter(tag); }
    // expand to our whole suggestion span when the word is exactly its text
    const m = w.document.createElement('mark');
    m.setAttribute('role', 'button'); m.setAttribute('tabindex', '0'); m.setAttribute('style', markStyle(label, P));
    m.appendChild(rg.extractContents());
    rg.insertNode(m);
    await settle();
    return m;
  };
  const state = (m) => ({ mark: m.getAttribute('data-ptc'), your: m.getAttribute('data-ptc-your'), expected: m.getAttribute('data-ptc-expected'), why: m.getAttribute('data-ptc-why') });
  const status = () => (w.document.getElementById('pt-status-text') || {}).textContent || '';
  return { w, Rp, annotate, state, status, settle, close: () => w.__pt_cleanup() };
}

const cases = [];   // [name, left, right, word, correctLabel ('' = must stay unlabeled), wrongLabelToTry]
const same = (name, line, word, label, wrongTry) => cases.push([name, [line], [line], word, label, wrongTry]);
const diff = (name, l, r, word, label, wrongTry) => cases.push([name, [l], [r], word, label, wrongTry]);
// one case per label (identical value on both sides)
same('Account Number', 'Account Number: 50100234567891', '50100234567891', 'Account Number', 'Indian Mobile Number');
same('Address', 'Address: Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Flat 302, Tower B, Prestige Lakeside, Varthur Road, Bengaluru 560087', 'Address', 'Business Name');
same('Business Name', 'She works at Infosys Limited in Pune.', 'Infosys Limited', 'Business Name', 'Person Name');
same('Indian Mobile Number', 'Mobile: +91 98450 12345', '+91 98450 12345', 'Indian Mobile Number', 'Account Number');
// (v11.4.0) Contact group of the new label set
same('International Phone Number', 'US desk: +1 (415) 732-0198', '+1 (415) 732-0198', 'International Phone Number', 'Indian Mobile Number');
same('Indian landline', 'Office: 080-2345 6789', '080-2345 6789', 'International Phone Number', 'Indian Mobile Number');
same('Postal Code', 'Pincode: 560087', '560087', 'Postal Code', 'Address');
same('partial address', 'Meet at MG Road tomorrow', 'MG Road', 'Address', 'Postal Code');
same('Credentials', 'PAN: ABCDE1234F', 'ABCDE1234F', 'Credentials', 'Vehicle Number Plate');
same('Date', 'DOB: 05-11-1988', '05-11-1988', 'Date', 'Credentials');
same('Email Address', 'Mail priya.raghavan@northwind-demo.com today', 'priya.raghavan@northwind-demo.com', 'Email Address', 'URL/Link');
same('IP Address', 'Server 192.168.10.25 is down', '192.168.10.25', 'IP Address', 'Indian Mobile Number');
diff('Overscrubbed', 'The Council Member approved it.', 'The Council Beagenhydra approved it.', 'Beagenhydra', 'Overscrubbed', 'Date');
same('Person Name', 'Hi Rahul Sharma, welcome aboard.', 'Rahul Sharma', 'Person Name', 'Business Name');
same('URL/Link', 'Docs: https://docs.acmecorp-demo.io/setup', 'https://docs.acmecorp-demo.io/setup', 'URL/Link', 'Email Address');
same('Person Username', 'Ping @rahul_92 on Slack', '@rahul_92', 'Person Username', 'Person Name');
same('Vehicle Number Plate', 'Vehicle: KA 05 MN 4321', 'KA 05 MN 4321', 'Vehicle Number Plate', 'Credentials');
// text that must stay unlabeled: any label is wrong, correct = "No label"
same('unchanged word ("exclusive")', 'Deliver at least 3-5 exclusive/original stories per month.', 'exclusive', '', 'Date');
same('unchanged JSON key', '"dependencies": {', 'dependencies', '', 'Overscrubbed');
diff('scrubbed person name', 'I met Furkan at the airport.', 'I met Dalvorin at the airport.', 'Dalvorin', '', 'Overscrubbed');
diff('scrubbed company', 'She joined Accenture in 2019.', 'She joined Velmoratech in 2019.', 'Velmoratech', '', 'Business Name');
diff('scrubbed phone', 'Call 9876543210 today', 'Call 9123456780 today', '9123456780', '', 'Indian Mobile Number');
same('statement date (not DOB)', 'Statement Date: 12-01-2026', '12-01-2026', '', 'Date');
same('city alone', 'Location: Bengaluru', 'Bengaluru', '', 'Address');
same('link to a file (v11.4.1)', 'Logo: https://cdn.acmecorp-demo.io/static/logo.png', 'https://cdn.acmecorp-demo.io/static/logo.png', '', 'URL/Link');
same('link to a script (v11.4.1)', 'Load https://cdn.acmecorp-demo.io/app/main.js first', 'https://cdn.acmecorp-demo.io/app/main.js', '', 'URL/Link');
same('http link', 'Old: http://legacy.acmecorp-demo.io', 'http://legacy.acmecorp-demo.io', '', 'URL/Link');
same('language', 'Languages: English, Bengali, Hindi', 'Bengali', '', 'Person Name');

(async () => {
  let pass = 0, fail = 0;
  const check = (ok, name, info) => { if (ok) pass++; else fail++; console.log((ok ? '\u2713 ' : '\u2717 ') + name + (ok ? '' : ' - ' + JSON.stringify(info))); };

  for (const [name, L, R, word, correct, wrongTry] of cases) {
    if (correct) {
      const p = await page(L, R);
      const m = await p.annotate(word, correct);
      const s = p.state(m);
      check(s.mark !== 'wrong' && !/Mistake/.test(p.status()), `${name}: correct label "${correct}" -> no mistake`, s);
      p.close();
    }
    const p2 = await page(L, R);
    const m2 = await p2.annotate(word, wrongTry);
    const s2 = p2.state(m2);
    const want = correct || 'No label';
    check(s2.mark === 'wrong' && s2.your === wrongTry && (s2.expected || '').startsWith(want) && /1 Mistake/.test(p2.status()),
      `${name}: labeled "${wrongTry}" -> mistake, correct label shown as "${want}"`, s2);
    p2.close();
  }

  // The reported case: should be Overscrubbed, labeled Date -> "Date -> Overscrubbed".
  {
    const p = await page(['Publish a minimum of three news stories per day.'], ['Publish a minimum of three news ionoryorb per day.']);
    const m = await p.annotate('ionoryorb', 'Date');
    const s = p.state(m);
    check(s.mark === 'wrong' && s.your === 'Date' && s.expected === 'Overscrubbed', 'reported case: Overscrubbed word labeled Date -> "Date \u2192 Overscrubbed"', s);
    // the reviewer fixes it: label changed to Overscrubbed (style swap only) -> mistake disappears
    m.setAttribute('style', markStyle('Overscrubbed'));
    await p.settle();
    check(p.state(m).mark === 'ok' && !/Mistake/.test(p.status()), 'after changing the label to Overscrubbed the mistake disappears', p.state(m));
    // the reviewer changes it to Person Name -> flagged again
    m.setAttribute('style', markStyle('Person Name'));
    await p.settle();
    check(p.state(m).mark === 'wrong' && p.state(m).expected === 'Overscrubbed', 'changing it again to Person Name -> flagged again', p.state(m));
    // the reviewer removes the label -> no mark left anywhere
    const parent = m.parentNode; while (m.firstChild) parent.insertBefore(m.firstChild, m); m.remove();
    await p.settle();
    check(!p.w.document.querySelector('[data-ptc="wrong"]') && !/Mistake/.test(p.status()), 'removing the label clears the mistake', p.status());
    p.close();
  }

  // An editor that wraps the selection INSIDE the auditor's suggestion span is handled the same way.
  {
    const p = await page(['Publish a minimum of three news stories per day.'], ['Publish a minimum of three news ionoryorb per day.']);
    const m = await p.annotate('ionoryorb', 'Date', true);
    const s = p.state(m);
    check(s.mark === 'wrong' && s.expected === 'Overscrubbed', 'label drawn inside the suggestion span is checked too', s);
    p.close();
  }

  // Reported case: README "# Droom Chat" - the reviewer labels "Droom" (identical) as Business Name twice. The pane
  // header contains the file name and a light-blue "Annotate here" chip; neither is a label.
  {
    const p = await page(['# Droom Chat', '', 'Chat Plugin for Droom'], ['# Droom Chat', '', 'Chat Plugin for Droom']);
    const hdr = p.w.document.createElement('div');
    const [r, g, b] = PAL['Person Name'];
    hdr.innerHTML = `<span>right.md-d146149f</span><span style="background-color: rgba(${r}, ${g}, ${b}, 0.12); color: rgb(${r}, ${g}, ${b}); border-radius: 6px">Annotate here</span>`
      // the same title row as on a .gitkeep file, with an icon inside the chip
      + `<div><span>right.gitkeep-03956dc6</span><a style="background-color: rgba(${r}, ${g}, ${b}, 0.12); color: rgb(${r}, ${g}, ${b})"><i>\u270E</i> Annotate here</a></div>`;
    p.Rp.insertBefore(hdr, p.Rp.firstChild);
    await p.settle();
    await p.annotate('Droom', 'Business Name');
    await p.annotate('Droom', 'Business Name');
    const chip = Array.from(p.Rp.querySelectorAll('span')).find(s => s.textContent === 'Annotate here');
    const chip2 = p.Rp.querySelector('a');
    check(!chip.getAttribute('data-ptc') && !chip2.getAttribute('data-ptc') && !p.w.document.querySelector('[data-ptc="wrong"]') && !/Mistake/.test(p.status()),
      'pane header ("Annotate here" chip, file name) is never judged; correct Business Name labels -> no mistake', { chip: chip.getAttribute('data-ptc'), status: p.status() });
    p.close();
  }

  // Partial label: Overscrubbed covering unchanged text too.
  {
    const p = await page(['| Total Transfer-Ins/VDRs for the year | 0 |'], ['| Total Galeonorb-Ins/VDRs for the year | 0 |']);
    const m = await p.annotate('Galeonorb-Ins/VDRs', 'Overscrubbed');
    const s = p.state(m);
    check(s.mark === 'wrong' && /Galeonorb/.test(s.expected || ''), 'Overscrubbed label covering unchanged text -> "label only Galeonorb"', s);
    p.close();
  }

  // Several labels at once + the mistake list + the document text is never changed.
  {
    const L = ['The Council Member approved it.', 'Hi Rahul Sharma, welcome aboard.', 'Deliver exclusive stories.'];
    const R = ['The Council Beagenhydra approved it.', 'Hi Rahul Sharma, welcome aboard.', 'Deliver exclusive stories.'];
    const p = await page(L, R);
    const before = p.Rp.textContent;
    await p.annotate('Beagenhydra', 'Overscrubbed');
    await p.annotate('Rahul Sharma', 'Person Name');
    await p.annotate('exclusive', 'Date');
    check(p.w.document.querySelectorAll('[data-ptc="wrong"]').length === 1 && /1 Mistake/.test(p.status()), 'three labels, one wrong -> exactly 1 mistake', p.status());
    check(p.Rp.textContent === before, 'the document text is never modified by the check', '');
    const st = p.w.document.getElementById('pt-status-text');
    st.click();
    const list = p.w.document.getElementById('ptc-list');
    check(list && !list.hidden && /exclusive/.test(list.textContent) && /Date/.test(list.textContent) && /No label/.test(list.textContent), 'clicking the mistake count opens the list with word, your label and the correct label', list && list.textContent);
    p.close();
  }

  // (v11.3.5) The mistake check must never fail silently: a label that could not be checked (judge crashed, colour unreadable)
  // is counted and shown, so "0 mistakes" can be told apart from "nothing could be checked".
  {
    const ALL_CLEAR = /^\uD83C\uDFAF \d+ to Annotate$/;
    // makes the judge crash for the text "ZQX" only: Map.get('ZQX') throws, but only when called from judgeLabel (the engine's other
    // code, and every other label, are untouched)
    const breakJudge = (w) => { const G = w.Map.prototype.get; w.Map.prototype.get = function (k) { if (k === 'ZQX' && /judgeLabel/.test(new w.Error().stack || '')) throw new Error('boom-test'); return G.call(this, k); }; };
    const stats = (p) => p.w.__PT__.labelStats() || {};
    const notChecked = (s) => (s.errors || 0) + (s.unread || 0);

    // Test A: judge crashes for one label -> not a mistake, counted as an error, bar says "not checked", not the all-clear
    {
      const p = await page(['Code ZQX here'], ['Code ZQX here']);
      breakJudge(p.w);
      const m = await p.annotate('ZQX', 'Person Name');
      const s = stats(p);
      check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), 'A: a crashed label check is not flagged as a mistake', p.state(m));
      check(s.errors === 1 && /boom-test/.test(s.lastError || ''), 'A: stats.errors == 1 and stats.lastError is kept', s);
      check(/0 mistakes, 1 not checked/.test(p.status()) && !ALL_CLEAR.test(p.status()), 'A: bar says "0 mistakes, 1 not checked", not the all-clear', p.status());
      check(/errors: 1/.test(p.w.document.getElementById('pt-status-text').title) && /unread: 0/.test(p.w.document.getElementById('pt-status-text').title), 'A: the tooltip lists the counts', p.w.document.getElementById('pt-status-text').title);
      p.close();
    }
    // Test B: a <mark> whose colour cannot be read and that is not in the dialog memory (next to one readable, correct label)
    const unread = (m) => { for (const a of Array.from(m.attributes)) m.removeAttribute(a.name); m.setAttribute('style', 'background-color: transparent;'); };   // nothing the check can read
    {
      const p = await page(['Code ZQX here, Hi Rahul Sharma.'], ['Code ZQX here, Hi Rahul Sharma.']);
      await p.annotate('Rahul Sharma', 'Person Name');
      unread(await p.annotate('ZQX', 'Person Name'));
      await p.settle();
      const s = stats(p);
      check(s.unread === 1 && s.skipped && s.skipped.unread === 1, 'B: an unreadable <mark> is counted (stats.unread, stats.skipped.unread)', s);
      check(/0 mistakes, 1 not checked/.test(p.status()) && !ALL_CLEAR.test(p.status()), 'B: bar says "0 mistakes, 1 not checked"', p.status());
      p.close();
    }
    // the existing "labels not readable" hint still shows when NO label could be read at all
    {
      const p = await page(['Code ZQX here'], ['Code ZQX here']);
      unread(await p.annotate('ZQX', 'Person Name'));
      await p.settle();
      check(/labels not readable/.test(p.status()) && !ALL_CLEAR.test(p.status()) && stats(p).unread === 1, 'B2: no label readable -> the "labels not readable" hint is kept', p.status());
      p.close();
    }
    // Test C: everything readable and correct -> nothing not checked, normal state
    {
      const p = await page(['Hi Rahul Sharma, welcome aboard.'], ['Hi Rahul Sharma, welcome aboard.']);
      await p.annotate('Rahul Sharma', 'Person Name');
      const s = stats(p);
      check(notChecked(s) === 0 && s.checked === 1 && ALL_CLEAR.test(p.status()), 'C: all labels readable and correct -> notChecked == 0, normal bar', { s, status: p.status() });
      p.close();
    }
    // Test D: one real mistake plus one crash
    {
      const p = await page(['Deliver exclusive stories. Code ZQX here'], ['Deliver exclusive stories. Code ZQX here']);
      breakJudge(p.w);
      await p.annotate('exclusive', 'Date');
      await p.annotate('ZQX', 'Person Name');
      const s = stats(p);
      check(s.errors === 1 && /1 Mistake \(\+1 not checked\)/.test(p.status()), 'D: one mistake + one crash -> "1 Mistake (+1 not checked)"', { s, status: p.status() });
      p.close();
    }
    // too short / too long labels are counted separately and do not count as "not checked"
    {
      const p = await page(['Code Q here'], ['Code Q here']);
      await p.annotate('Q', 'Person Name');
      const s = stats(p);
      check(s.skipped && s.skipped.tooShort === 1 && notChecked(s) === 0, 'a one-character label is counted in skipped.tooShort, not in "not checked"', s);
      p.close();
    }
  }

  // (v11.3.6) Labels that share a colour are never guessed. Email Address and Person Name get the SAME colour here, in both chip
  // orders. The check judges every candidate: all wrong -> a real mistake; mixed -> "unsure" (counted as not checked); a label
  // the dialog told us about resolves the tie.
  {
    const stats = (p) => p.w.__PT__.labelStats() || {};
    const sharedPal = (emailFirst) => {
      const blue = PAL['Person Name'], P = {};
      for (const n of (emailFirst ? ['Email Address', 'Person Name'] : ['Person Name', 'Email Address'])) P[n] = blue;
      for (const n of Object.keys(PAL)) if (!(n in P)) P[n] = PAL[n];
      return P;
    };
    const ORDERS = [['Email first', true], ['Person Name first', false]];
    const EMAIL = 'priya.raghavan@northwind-demo.com';
    const sameLine = ['Mail ' + EMAIL + ' today'];
    const notCheckedAll = (s) => (s.errors || 0) + (s.unread || 0) + (s.ambiguous || 0);
    const dialogApply = async (p, word, label) => {
      const d = p.w.document.createElement('div');
      d.setAttribute('role', 'dialog');
      d.innerHTML = `<div>Change label for</div><div>\u201C${word}\u201D</div><div class="label-select"><span>${label}</span></div><button>Remove</button><button>Cancel</button><button>\u2713 Apply</button>`;
      p.w.document.body.appendChild(d);
      await p.settle(50);
      d.querySelectorAll('button')[2].dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
      d.remove();
      await p.settle(900);
    };
    const seenStates = {};
    for (const [name, emailFirst] of ORDERS) {
      const P = sharedPal(emailFirst);
      // Test 1: an e-mail labeled Person Name, shared colour -> unsure, not ok, not a normal mistake
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Person Name');
        const s = stats(p), st = p.state(m);
        seenStates[name] = { mark: st.mark, your: st.your, expected: st.expected, ambiguous: s.ambiguous };
        check(st.mark === 'unsure' && (s.ambiguous | 0) === 1 && notCheckedAll(s) >= 1 && !/Mistake/.test(p.status()) && /not checked/.test(p.status()),
          `T1 (${name}): e-mail labeled Person Name on a shared colour -> "unsure", counted as not checked, not a mistake`, { st, s, status: p.status() });
        check(/Colour is shared by Email Address and Person Name/.test(st.why || '') && st.your === 'Email Address / Person Name', `T1 (${name}): the badge names both labels and the why-text explains it`, st);
        p.close();
      }
      // Test 2: a real person name labeled Person Name -> never "wrong"
      {
        const line = ['Hi Rahul Sharma, welcome aboard.'];
        const p = await page(line, line, P);
        const m = await p.annotate('Rahul Sharma', 'Person Name');
        check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), `T2 (${name}): real person name on a shared colour -> no false mistake`, { st: p.state(m), status: p.status() });
        p.close();
      }
      // Test 3: a real e-mail labeled Email Address -> never "wrong"
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Email Address');
        check(p.state(m).mark !== 'wrong' && !/Mistake/.test(p.status()), `T3 (${name}): real e-mail labeled Email Address on a shared colour -> no false mistake`, { st: p.state(m), status: p.status() });
        p.close();
      }
      // Test 4: a replaced value: both candidate labels are wrong -> a real mistake
      for (const lab of ['Person Name', 'Email Address']) {
        const p = await page(['The Council Member approved it.'], ['The Council Beagenhydra approved it.'], P);
        const m = await p.annotate('Beagenhydra', lab);
        const st = p.state(m);
        check(st.mark === 'wrong' && st.expected === 'Overscrubbed' && /1 Mistake/.test(p.status()) && /shared/i.test(st.why || ''),
          `T4 (${name}): replaced value labeled "${lab}" on a shared colour -> a real mistake (both candidates wrong)`, { st, status: p.status() });
        p.close();
      }
      // Test 5: the label dialog resolves the tie
      {
        const p = await page(sameLine, sameLine, P);
        const m = await p.annotate(EMAIL, 'Person Name');
        await dialogApply(p, EMAIL, 'Person Name');
        const st = p.state(m);
        check(st.mark === 'wrong' && st.your === 'Person Name' && st.expected === 'Email Address' && /1 Mistake/.test(p.status()),
          `T5 (${name}): the dialog says Person Name -> tie resolved, judged as a normal mistake (e-mail -> Email Address)`, { st, status: p.status() });
        p.close();
      }
    }
    check(JSON.stringify(seenStates['Email first']) === JSON.stringify(seenStates['Person Name first']), 'T1: the result is identical in both chip orders', seenStates);
    // Test 6: a palette without ties behaves as before (and nothing is counted as ambiguous)
    {
      const p = await page(sameLine, sameLine);
      const m = await p.annotate(EMAIL, 'Person Name');
      const st = p.state(m), s = stats(p);
      check(st.mark === 'wrong' && st.expected === 'Email Address' && (s.ambiguous | 0) === 0 && /1 Mistake/.test(p.status()), 'T6: no tie -> e-mail labeled Person Name is a normal mistake, ambiguous == 0', { st, s });
      p.close();
    }
  }

  // (v11.4.1) Suggestions follow the label chips on the page. The old dashboard (13 chips) gets the old labels.
  {
    const OLD = Object.assign({}, PAL);
    OLD['Contact Number'] = OLD['Indian Mobile Number'];
    for (const k of ['Indian Mobile Number', 'International Phone Number', 'Postal Code']) delete OLD[k];
    const NEW = Object.assign({}, PAL, { 'Contact Number': [250, 140, 22] });
    const tags = (p) => Array.from(p.Rp.querySelectorAll('span.pt-tag')).map(t => [t.textContent, t.getAttribute('data-label')]);
    const doc = ['Call 9876543210 today', 'Office: 080-2345 6789', 'Pincode: 560087'];
    {
      const p = await page(doc, doc, OLD);
      const t = tags(p);
      check(t.some(([x, l]) => x === '9876543210' && l === 'Contact Number') && t.some(([x, l]) => x === '080-2345 6789' && l === 'Contact Number'),
        'old chips: phones are suggested as Contact Number', t);
      check(!t.some(([x]) => x === '560087'), 'old chips: a postal code is not suggested', t);
      const m = await p.annotate('9876543210', 'Contact Number', true);
      check(p.state(m).mark === 'ok' && !/Mistake/.test(p.status()), 'old chips: a phone labeled Contact Number is correct', { st: p.state(m), status: p.status() });
      p.close();
    }
    {
      const p = await page(doc, doc, OLD);
      const m = await p.annotate('560087', 'Address');
      check(p.state(m).mark === 'wrong' && p.state(m).expected === 'No label', 'old chips: a PIN labeled Address -> mistake, no label (Postal Code is not on the page)', p.state(m));
      p.close();
    }
    {
      const p = await page(doc, doc, NEW);
      const t = tags(p);
      check(t.some(([x, l]) => x === '9876543210' && l === 'Indian Mobile Number') && t.some(([x, l]) => x === '080-2345 6789' && l === 'International Phone Number') &&
        t.some(([x, l]) => x === '560087' && l === 'Postal Code'), 'new chips: Indian Mobile Number, International Phone Number and Postal Code are suggested', t);
      p.close();
    }
  }

  console.log(`\n${pass}/${pass + fail} label-check checks passed`);
  process.exit(fail ? 1 : 0);
})();
