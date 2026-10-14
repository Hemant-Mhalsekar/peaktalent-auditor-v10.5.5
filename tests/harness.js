// Loads src/content.js inside a sandboxed fake browser and returns its internal API.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl() {
  const el = {
    style: {}, children: [], classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { return c; }, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    textContent: '', innerText: '', innerHTML: ''
  };
  return el;
}

function loadEngine(opts = {}) {
  const file = opts.file || path.join(__dirname, '..', 'src', 'content.js');
  let src = fs.readFileSync(file, 'utf8');
  if (opts.injectHook) src = src.replace(/\}\)\(\);\s*$/, opts.injectHook + '\n})();');
  const network = [];
  const listeners = [];      // currently attached [target, type, fn]
  const selectors = [];      // every selector passed to document.querySelectorAll
  const add = (target) => (t, f) => listeners.push([target, t, f]);
  const remove = (target) => (t, f) => { const i = listeners.findIndex(l => l[0] === target && l[1] === t && l[2] === f); if (i >= 0) listeners.splice(i, 1); };
  const doc = makeEl();
  Object.assign(doc, {
    body: Object.assign(makeEl(), { normalize() {}, innerText: '' }),
    head: makeEl(),
    documentElement: makeEl(),
    getElementById() { return null; },
    createElement: () => makeEl(),
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener: add('document'), removeEventListener: remove('document'),
    querySelectorAll(sel) { selectors.push(sel); return []; },
    hidden: false
  });
  const win = {
    __PT_TEST__: true, innerWidth: 1400, innerHeight: 900,
    addEventListener: add('window'), removeEventListener: remove('window'),
    location: { href: 'https://dashboard.peaktalent.ai/review' },
    getSelection: () => ({ toString: () => '' }),
    getComputedStyle: () => ({}),
  };
  const sandbox = {
    window: win, document: doc, console: { log() {}, warn() {}, error() {}, info() {} },
    history: { pushState() {}, replaceState() {} }, location: win.location,
    MutationObserver: function () { return { observe() {}, disconnect() {}, takeRecords() { return []; } }; },
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: () => 1, localStorage: { getItem: () => null, setItem() {} },
    fetch: (url) => { network.push(String(url)); return Promise.reject(new Error('network blocked in tests')); },
    chrome: undefined
  };
  win.window = win; win.document = doc;
  vm.createContext(sandbox);
  const history = sandbox.history;
  const origPush = history.pushState;
  const runAgain = () => vm.runInContext(src, sandbox, { filename: path.basename(file) });
  runAgain();
  return { api: win.__PT__, sandbox, network, listeners, selectors, runAgain, origPush, history, win };
}

module.exports = { loadEngine };
