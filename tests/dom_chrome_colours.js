// Real-DOM check (needs jsdom): Chrome reports colours in modern notation. getComputedStyle() is wrapped so every
// colour comes back the way Chrome serialises Tailwind / modern CSS colours - oklch(...), "rgb(r g b / a)" or
// color(srgb ...) - instead of the rgb() Safari returns. The label check must still read every label.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const PAL = { 'Account Number': [114, 46, 209], 'Address': [229, 57, 53], 'Business Name': [19, 194, 194], 'Contact Number': [250, 140, 22],
  'Credentials': [255, 122, 69], 'Date': [235, 47, 150], 'Email Address': [56, 158, 13], 'IP Address': [92, 219, 211], 'Overscrubbed': [255, 227, 227],
  'Person Name': [22, 119, 255], 'URL/Link': [250, 173, 20], 'Person Username': [47, 84, 235], 'Vehicle Number Plate': [160, 217, 17] };
const chips = Object.entries(PAL).map(([n, [r, g, b]]) => `<span style="background-color: rgba(${r},${g},${b},0.08)"><i style="display:inline-block;background-color: rgb(${r},${g},${b})"></i>${n}</span>`).join('');
const markStyle = (label) => { const [r, g, b] = PAL[label]; return `background-color: rgba(${r}, ${g}, ${b}, 0.18); background-image: linear-gradient(rgb(${r}, ${g}, ${b}), rgb(${r}, ${g}, ${b}));`; };

// sRGB -> OKLCH (as Chrome would print it)
function toOklch(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(A * A + Bb * Bb); let H = Math.atan2(Bb, A) * 180 / Math.PI; if (H < 0) H += 360;
  return [L, C, H];
}
const STYLES = {
  oklch: (r, g, b, a) => { const [L, C, H] = toOklch(r, g, b); return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)}${a < 1 ? ' / ' + a : ''})`; },
  modernRgb: (r, g, b, a) => `rgb(${r} ${g} ${b}${a < 1 ? ' / ' + a : ''})`,
  srgbFn: (r, g, b, a) => `color(srgb ${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)}${a < 1 ? ' / ' + a : ''})`,
};
const convert = (str, fmt) => String(str).replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/g, (_, r, g, b, a) => STYLES[fmt](+r, +g, +b, a == null ? 1 : +a));

async function scenario(fmt, word, label, L, R, opts = {}) {
  const chipHtml = opts.noChipColours ? Object.keys(PAL).map(n => `<span><i></i>${n}</span>`).join('') : chips;
  const mStyle = opts.noMarkColour ? 'background-color: transparent' : markStyle(label);
  const dom = new JSDOM(`<!doctype html><body><div>${chipHtml}<span>Reference · read-only</span><span>Annotate here</span><span>left.xlsx-1</span><span>right.xlsx-1</span></div>
    <div id="left">${L.map(l => `<div>${l}</div>`).join('')}</div><div id="right">${R.map(l => `<div>${l.replace(word, `<mark role="button" style="${mStyle}">${word}</mark>`)}</div>`).join('')}</div></body>`,
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
  // Chrome-style computed colours
  const orig = w.getComputedStyle.bind(w);
  w.getComputedStyle = (el, pseudo) => {
    const cs = orig(el, pseudo);
    return new Proxy(cs, { get(t, k) { const v = t[k]; if (typeof v === 'function') return v.bind(t); return typeof v === 'string' && /rgb/.test(v) ? convert(v, fmt) : v; } });
  };
  w.__PT_TEST__ = true; w.eval(src);
  await new Promise(r => setTimeout(r, 800));
  if (opts.dialog) {   // the reviewer opens the dashboard's label dialog on the word and applies the label
    const d = w.document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.innerHTML = `<div>Change label for</div><div>\u201C${word}\u201D</div><div class="label-select"><span>${label}</span></div><button>Remove</button><button>Cancel</button><button>\u2713 Apply</button>`;
    w.document.body.appendChild(d);
    await new Promise(r => setTimeout(r, 50));
    d.querySelectorAll('button')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.remove();
    await new Promise(r => setTimeout(r, 900));
  }
  const m = Rp.querySelector('mark');
  const res = { mark: m.getAttribute('data-ptc'), expected: m.getAttribute('data-ptc-expected'), your: m.getAttribute('data-ptc-your') };
  w.__pt_cleanup(); return res;
}

(async () => {
  const L1 = ['Deliver at least 3-5 exclusive/original stories per month.'], R1 = L1;
  const L2 = ['The Council Member approved it.'], R2 = ['The Council Beagenhydra approved it.'];
  let pass = 0, fail = 0;
  for (const fmt of Object.keys(STYLES)) {
    const a = await scenario(fmt, 'exclusive', 'Date', L1, R1);
    const okA = a.mark === 'wrong' && a.your === 'Date' && /No label/.test(a.expected || '');
    const b = await scenario(fmt, 'Beagenhydra', 'Date', L2, R2);
    const okB = b.mark === 'wrong' && b.your === 'Date' && b.expected === 'Overscrubbed';
    const c = await scenario(fmt, 'Beagenhydra', 'Overscrubbed', L2, R2);
    const okC = c.mark === 'ok' && c.your === 'Overscrubbed';
    for (const [ok, name, r] of [[okA, `${fmt}: unchanged word labeled Date -> mistake "No label"`, a], [okB, `${fmt}: Overscrubbed word labeled Date -> "Date -> Overscrubbed"`, b], [okC, `${fmt}: correct Overscrubbed label -> recognised, no mistake`, c]]) {
      if (ok) pass++; else fail++;
      console.log((ok ? '\u2713 ' : '\u2717 ') + name + (ok ? '' : ' - ' + JSON.stringify(r)));
    }
  }
  // label chips whose colours cannot be read at all: the built-in palette still recognises the labels
  {
    const r1 = await scenario('oklch', 'exclusive', 'Date', L1, R1, { noChipColours: true });
    const ok = r1.mark === 'wrong' && r1.your === 'Date';
    if (ok) pass++; else fail++;
    console.log((ok ? '\u2713 ' : '\u2717 ') + 'chip colours unreadable -> built-in label colours still recognise "Date"' + (ok ? '' : ' - ' + JSON.stringify(r1)));
  }
  // a label whose colour cannot be read at all: learned from the dashboard's own label dialog
  {
    const r2 = await scenario('oklch', 'exclusive', 'Date', L1, R1, { noMarkColour: true, dialog: true });
    const ok = r2.mark === 'wrong' && r2.your === 'Date';
    if (ok) pass++; else fail++;
    console.log((ok ? '\u2713 ' : '\u2717 ') + 'label colour unreadable -> label learned from the "Change label for" dialog and checked' + (ok ? '' : ' - ' + JSON.stringify(r2)));
  }
  console.log(`${pass}/${pass + fail} Chrome colour-format checks passed`);
  process.exit(fail ? 1 : 0);
})();
