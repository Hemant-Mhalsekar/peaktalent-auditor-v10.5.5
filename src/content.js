// =========================================================================
// PeakTalent PII / BII Annotation Auditor - Precision Engine v10.4.2
//
// Runs in the reviewer's browser on dashboard.peaktalent.ai. Compares the left (source) and
// right (redacted) documents, highlights what should be labeled, and flags labels that break
// the annotation SOP (see GUIDELINES.md).
//
// Privacy: this script makes NO network requests. Document text never leaves the browser.
//
// This file is the single source of truth. The userscript and console-paste builds in dist/
// are generated from it by `node scripts/build.js` - do not edit those copies by hand.
// Tests: `node tests/run.js`
// =========================================================================
(function () {

    'use strict';

    const PT_VERSION = "11.4.4";

    // Safety net (v10.5.0): every dynamic regular expression in the engine is built from document text. A pathological
    // token (a 100 KB base64 image, a minified line) can make the browser refuse the pattern ("Invalid regular
    // expression: Stack overflow"), which used to abort the whole audit. Inside this script, `new RegExp(...)` now
    // returns a pattern that never matches instead of throwing. Regex literals are unaffected.
    const NativeRegExp = /x/.constructor;   // the real RegExp (works in every page, sandbox and test runner)
    const NEVER_MATCHES = /(?!)/;
    const RegExp = function SafeRegExp(source, flags) {
        if (typeof source === "string" && source.length > 20000) return new NativeRegExp(NEVER_MATCHES.source, flags);
        try { return new NativeRegExp(source, flags); } catch (e) { return new NativeRegExp(NEVER_MATCHES.source, flags); }
    };
    // Tokens longer than this are data (encoded images, hashes of hashes, minified code), never names or words.
    const MAX_TOKEN_LEN = 300;

    // Runtime state used by functions that already run during start-up (ensurePill -> isAnnotationReviewScreen),
    // so it must be initialised before anything else.
    let __ptScreenCache = { t: 0, v: false };
    const LARGE_DOC_CHARS = 120000;      // above this, show "Analysing..." and yield one frame first
    let __ptYieldedOnce = false;
    let __ptViewportInfo = null;          // set while auditing a long document in viewport mode
    let __ptLastError = null;             // last run error, shown by Diagnose
    let __ptcMistakes = [];
    let __ptLabelStats = null;            // what the label check could read on this page (shown by Alt+Shift+D)               // label-check results (wrong labels) for the current page
    let lastRunMs = 0, lastRunEnd = 0;   // adaptive pacing (see triggerUpdate / heartbeat)
    let cachedLeftPane = null;
    let cachedRightPane = null;
    let isModifyingDOM = false;
    let lastTaskSignature = "";
    let lastAnnotatedSnapshot = "";
    let isUserMouseDown = false;
    let debounceTimer = null;
    let dragWindowHandlers = [];

    // Running the script a second time (console paste, userscript + extension, popup re-inject) first tears
    // down the previous instance completely, so listeners and history wrappers never stack up.
    if (typeof window.__pt_cleanup === "function") {
        try { window.__pt_cleanup(); } catch (e) {}
    }
    const __ptListeners = [];
    function ptOn(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        __ptListeners.push([target, type, fn, opts]);
    }

    if (window.__pt_interval) clearInterval(window.__pt_interval);
    if (window.__pt_observer) {
        window.__pt_observer.disconnect();
        window.__pt_observer = null;
    }
    window.__pt_auto_active = true;

    const oldBar = document.getElementById("pt-floating-bar");
    if (oldBar) oldBar.remove();
    const oldStyles = document.getElementById("pt-precision-styles");
    if (oldStyles) oldStyles.remove();

    // Remove ONLY this tool's own highlight spans (span.pt-tag) and its mistake markers.
    // The platform's own annotations and any page element whose class merely contains "pt-"
    // ("prompt-", "script-", "receipt-") are never touched.
    const existingTags = document.querySelectorAll("span.pt-tag");
    const touchedParents = new Set();
    for (const t of existingTags) {
        if (!t.parentNode) continue;
        touchedParents.add(t.parentNode);
        t.parentNode.replaceChild(document.createTextNode(t.textContent), t);
    }
    for (const parent of touchedParents) { try { parent.normalize(); } catch (e) {} }
    // (v10.7.0) the mistake check was removed; these lines only clear marks left on the page by older versions.
    for (const b of document.querySelectorAll(".pt-mistake-box")) b.remove();
    for (const w of document.querySelectorAll(".pt-wrong-label, [data-pt-wrong]")) {
        w.classList.remove("pt-wrong-label");
        w.removeAttribute("data-pt-wrong");
        w.removeAttribute("data-error-msg");
    }

    const styleEl = document.createElement("style");
    styleEl.id = "pt-precision-styles";
    styleEl.innerHTML = `
        /* ---- Label check (v11.0.0) ---- */
        [data-ptc="wrong"] {
            outline: 2px dashed #ef4444 !important;
            outline-offset: 2px !important;
            border-radius: 3px !important;
            position: relative !important;
            cursor: help !important;
        }
        [data-ptc="wrong"]::before {
            content: attr(data-ptc-your) " \\2192  " attr(data-ptc-expected) !important;
            position: absolute !important;
            left: -2px !important;
            bottom: calc(100% + 4px) !important;
            white-space: nowrap !important;
            font: 600 10.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #fff !important;
            background: #dc2626 !important;
            padding: 0 6px !important;
            border-radius: 4px !important;
            box-shadow: 0 1px 4px rgba(0,0,0,.25) !important;
            z-index: 2147483000 !important;
            pointer-events: none !important;
            text-decoration: none !important;
        }
        /* ---- (v11.3.6) shared colour: the label could be either, so it is shown as "unsure", never guessed ---- */
        [data-ptc="unsure"] {
            outline: 2px dashed #f59e0b !important;
            outline-offset: 2px !important;
            border-radius: 3px !important;
            position: relative !important;
            cursor: help !important;
        }
        [data-ptc="unsure"]::before {
            content: attr(data-ptc-your) " ?" !important;
            position: absolute !important;
            left: -2px !important;
            bottom: calc(100% + 4px) !important;
            white-space: nowrap !important;
            font: 600 10.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #fff !important;
            background: #d97706 !important;
            padding: 0 6px !important;
            border-radius: 4px !important;
            box-shadow: 0 1px 4px rgba(0,0,0,.25) !important;
            z-index: 2147483000 !important;
            pointer-events: none !important;
            text-decoration: none !important;
        }
        [data-ptc-flash] { animation: ptcflash 0.45s ease-in-out 3 !important; }
        @keyframes ptcflash { 50% { outline-color: #facc15; box-shadow: 0 0 0 6px rgba(250, 204, 21, .45); } }
        #ptc-card {
            position: fixed; z-index: 2147483646; display: none; max-width: 340px; padding: 10px 12px;
            background: #111827; color: #f9fafb; border: 1px solid #374151; border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,.35); font: 12.5px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none;
        }
        #ptc-card.ptc-show { display: block; }
        #ptc-card .ptc-h { font-weight: 700; color: #fca5a5; margin-bottom: 6px; }
        #ptc-card .ptc-row { display: flex; gap: 10px; justify-content: space-between; }
        #ptc-card .ptc-row span { color: #9ca3af; }
        #ptc-card .ptc-why, #ptc-list .ptc-why { color: #d1d5db; margin-top: 6px; font-size: 12px; }
        .ptc-bad { color: #fca5a5; } .ptc-good { color: #86efac; }
        #ptc-list {
            position: fixed; z-index: 2147483645; right: 20px; top: 70px; width: min(380px, 92vw); max-height: 60vh; overflow: auto;
            background: #111827; color: #f9fafb; border: 1px solid #374151; border-radius: 12px;
            box-shadow: 0 12px 36px rgba(0,0,0,.4); font: 12.5px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #ptc-list[hidden] { display: none; }
        #ptc-list .ptc-head { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: #1f2937; border-bottom: 1px solid #374151; }
        #ptc-list .ptc-head button { background: transparent; border: 0; color: #e5e7eb; font-size: 15px; cursor: pointer; padding: 0 6px; }
        #ptc-list .ptc-item { padding: 9px 12px; border-bottom: 1px solid #1f2937; cursor: pointer; }
        #ptc-list .ptc-item:hover { background: #1f2937; }
        #ptc-list .ptc-item b { display: block; margin-bottom: 2px; }
        #ptc-list .ptc-empty { padding: 14px 12px; color: #86efac; }
        #pt-floating-bar {
            position: fixed !important;
            top: 14px;
            right: 24px;
            background: #0b1329 !important;
            color: #ffffff !important;
            padding: 0 16px !important;
            border-radius: 9999px !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45) !important;
            z-index: 2147483647 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 10px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 12px !important;
            border: 1px solid #1e293b !important;
            user-select: none !important;
            cursor: grab !important;
            box-sizing: border-box !important;
            white-space: nowrap !important;
            width: -webkit-fit-content !important;
            width: fit-content !important;
            min-width: 0 !important;
            height: 36px !important;
            overflow: visible !important;
            resize: none !important;
        }
        #pt-floating-bar:active {
            cursor: grabbing !important;
        }
        .pt-drag-handle {
            opacity: 0.4 !important;
            cursor: grab !important;
            font-size: 13px !important;
            line-height: 1 !important;
            user-select: none !important;
            flex-shrink: 0 !important;
        }
        .pt-drag-handle:hover {
            opacity: 0.9 !important;
        }
        .pt-status-dot {
            width: 8px !important;
            height: 8px !important;
            border-radius: 50% !important;
            display: inline-block !important;
            flex-shrink: 0 !important;
        }
        .pt-status-dot.active {
            background: #10b981 !important;
            box-shadow: 0 0 8px #10b981 !important;
        }
        .pt-status-dot.paused {
            background: #ef4444 !important;
            box-shadow: 0 0 8px #ef4444 !important;
        }
        #pt-status-text {
            flex: 1 1 auto !important;
            white-space: nowrap !important;
            font-weight: 600 !important;
            font-size: 12px !important;
            overflow: visible !important;
            letter-spacing: 0.2px !important;
        }
        #pt-toggle-btn {
            border: none !important;
            width: 58px !important;
            min-width: 58px !important;
            max-width: 58px !important;
            height: 22px !important;
            padding: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 9999px !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            outline: none !important;
            user-select: none !important;
            flex-shrink: 0 !important;
            transition: all 0.15s ease !important;
            box-sizing: border-box !important;
        }
        #pt-toggle-btn.btn-stop {
            background: rgba(239, 68, 68, 0.25) !important;
            color: #f87171 !important;
            border: 1px solid rgba(239, 68, 68, 0.5) !important;
        }
        #pt-toggle-btn.btn-stop:hover {
            background: #ef4444 !important;
            color: #ffffff !important;
        }
        #pt-toggle-btn.btn-start {
            background: rgba(16, 185, 129, 0.25) !important;
            color: #34d399 !important;
            border: 1px solid rgba(16, 185, 129, 0.5) !important;
        }
        #pt-toggle-btn.btn-start:hover {
            background: #10b981 !important;
            color: #ffffff !important;
        }
        #pt-toggle-btn.btn-disabled, #pt-toggle-btn:disabled {
            background: rgba(100, 116, 139, 0.2) !important;
            color: #64748b !important;
            border: 1px solid rgba(100, 116, 139, 0.3) !important;
            cursor: not-allowed !important;
            opacity: 0.5 !important;
            pointer-events: none !important;
        }
        .pt-tag {
            display: inline !important;
            padding: 0 1px 1px 1px !important;
            border-radius: 2px !important;
            cursor: text !important;
            user-select: text !important;
            -webkit-user-select: text !important;
            position: relative !important;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
        }
        .pt-tag:hover::after {
            content: attr(data-label);
            position: absolute;
            bottom: calc(100% + 4px);
            left: 50%;
            transform: translateX(-50%);
            background: #262626;
            color: #ffffff;
            font-size: 11px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 4px;
            white-space: nowrap;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            pointer-events: none;
        }
        /* EXACT OFFICIAL PEAKTALENT PALETTE - DOTTED UNDERLINES FOR EXTENSION SUGGESTIONS */
        .pt-account   { border-bottom: 2.5px dotted #722ED1 !important; background-color: rgba(114, 46, 209, 0.12) !important; color: inherit !important; }
        .pt-person    { border-bottom: 2.5px dotted #1890FF !important; background-color: rgba(24, 144, 255, 0.12) !important; color: inherit !important; }
        .pt-contact   { border-bottom: 2.5px dotted #FA8C16 !important; background-color: rgba(250, 140, 22, 0.12) !important; color: inherit !important; }
        .pt-address   { border-bottom: 2.5px dotted #F5222D !important; background-color: rgba(245, 34, 45, 0.12) !important; color: inherit !important; }
        .pt-business  { border-bottom: 2.5px dotted #13C2C2 !important; background-color: rgba(19, 194, 194, 0.12) !important; color: inherit !important; }
        .pt-creds, .pt-credentials { border-bottom: 2.5px dotted #FF7A45 !important; background-color: rgba(255, 122, 69, 0.12) !important; color: inherit !important; }
        .pt-date      { border-bottom: 2.5px dotted #EB2F96 !important; background-color: rgba(235, 47, 150, 0.12) !important; color: inherit !important; }
        .pt-email     { border-bottom: 2.5px dotted #52C41A !important; background-color: rgba(82, 196, 26, 0.12) !important; color: inherit !important; }
        .pt-ip        { border-bottom: 2.5px dotted #13C2C2 !important; background-color: rgba(19, 194, 194, 0.12) !important; color: inherit !important; }
        .pt-url       { border-bottom: 2.5px dotted #FAAD14 !important; background-color: rgba(250, 173, 20, 0.12) !important; color: inherit !important; }
        .pt-username  { border-bottom: 2.5px dotted #2F54EB !important; background-color: rgba(47, 84, 235, 0.12) !important; color: inherit !important; }
        .pt-vehicle   { border-bottom: 2.5px dotted #73D13D !important; background-color: rgba(115, 209, 61, 0.12) !important; color: inherit !important; }
        .pt-overscrub { border-bottom: 2.5px dotted #FF7875 !important; background-color: rgba(255, 120, 117, 0.12) !important; color: inherit !important; }
    `;
    document.head.appendChild(styleEl);

    function updatePillState() {
        const dot = document.getElementById("pt-status-dot");
        const text = document.getElementById("pt-status-text");
        const btn = document.getElementById("pt-toggle-btn");
        if (!dot || !text || !btn) return;

        const onScreen = isAnnotationReviewScreen();

        if (!onScreen) {
            // Outside of annotation screen: display Disabled and disable the button
            dot.className = "pt-status-dot paused";
            dot.style.backgroundColor = "#64748b";
            dot.style.boxShadow = "none";
            text.style.color = "#94a3b8";
            text.textContent = "Disabled";
            btn.className = "btn-disabled";
            btn.disabled = true;
            btn.textContent = "\u25B6 Start";
            btn.title = "Disabled \u2014 open an annotation review task to enable";
            return;
        }

        // On the annotation screen: button is active
        btn.disabled = false;

        const toAnnotateCount = document.querySelectorAll(".pt-tag").length;
        const mistakeCount = __ptcMistakes.filter(m => m.el && m.el.isConnected).length;
        const unreadable = __ptLabelStats && __ptLabelStats.marks > 0 && __ptLabelStats.labeled === 0;
        // (v11.3.5) labels that could not be checked (the judge crashed, or the colour could not be read). Never throws.
        let notChecked = 0, checkSummary = "";
        try { notChecked = labelsNotChecked(); checkSummary = labelCheckSummary(mistakeCount); } catch (e) { notChecked = 0; checkSummary = ""; }
        const notCheckedNote = notChecked > 0 ? ` (+${notChecked} not checked)` : "";
        const bar = document.getElementById("pt-floating-bar");
        if (bar) {
            bar.style.borderColor = mistakeCount > 0 ? "#ef4444" : "rgba(255, 255, 255, 0.12)";
            bar.style.boxShadow = mistakeCount > 0 ? "0 4px 20px rgba(239, 68, 68, 0.45)" : "0 4px 16px rgba(0, 0, 0, 0.45)";
        }

        if (window.__pt_auto_active) {
            btn.className = "btn-stop";
            btn.textContent = "\u23F9 Stop";
            btn.title = "Click to pause auto-annotation";
            dot.className = "pt-status-dot active";
            dot.style.backgroundColor = "#10b981";
            dot.style.boxShadow = "0 0 8px #10b981";
            if (mistakeCount > 0) {
                dot.style.backgroundColor = "#ef4444";
                dot.style.boxShadow = "0 0 10px #ef4444";
                text.style.color = "#fecaca";
                text.textContent = `\uD83C\uDFAF ${toAnnotateCount} to Annotate \u00B7 \u26A0\uFE0F ${mistakeCount} Mistake${mistakeCount > 1 ? "s" : ""}${notCheckedNote}`;
                text.title = "Click to list the wrong labels" + (checkSummary ? "\n" + checkSummary : "");
                text.style.cursor = "pointer";
                text.onclick = (ev) => { ev.stopPropagation(); toggleMistakeList(); };
            } else if (unreadable) {
                text.style.color = "#fde68a";
                text.textContent = `\uD83C\uDFAF ${toAnnotateCount} to Annotate \u00B7 labels not readable`;
                text.title = "Your labels are on the page but their colour could not be read, so they cannot be checked. Press Alt+Shift+D and send the report." + (checkSummary ? "\n" + checkSummary : "");
            } else if (notChecked > 0) {
                // 0 mistakes, but some labels could not be checked: this must not look like the all-clear
                text.style.color = "#fde68a";
                text.textContent = `\uD83C\uDFAF ${toAnnotateCount} to Annotate \u00B7 \u26A0\uFE0F 0 mistakes, ${notChecked} not checked`;
                text.title = "No mistakes were found, but some labels could not be checked (a label whose colour could not be read, or a check that failed). Press Alt+Shift+D and send the report." + (checkSummary ? "\n" + checkSummary : "");
                text.style.cursor = "default";
                text.onclick = null;
            } else {
                text.style.color = "#ffffff";
                text.textContent = `\uD83C\uDFAF ${toAnnotateCount} to Annotate`;
                text.title = checkSummary;
                text.style.cursor = "default";
                text.onclick = null;
            }
        } else {
            dot.className = "pt-status-dot paused";
            dot.style.backgroundColor = "#94a3b8";
            dot.style.boxShadow = "none";
            text.style.color = "#94a3b8";
            text.textContent = `\u23F8 Paused \u2014 ${toAnnotateCount} to Annotate${mistakeCount ? ` \u00B7 \u26A0\uFE0F ${mistakeCount} Mistake${mistakeCount > 1 ? "s" : ""}${notCheckedNote}` : (notChecked > 0 ? ` \u00B7 \u26A0\uFE0F 0 mistakes, ${notChecked} not checked` : "")}`;
            if (checkSummary) text.title = checkSummary;
            btn.className = "btn-start";
            btn.textContent = "\u25B6 Start";
            btn.title = "Click to resume auto-annotation";
        }
    }

    function toggleAutoAnnotation() {
        if (!isAnnotationReviewScreen()) return;
        window.__pt_auto_active = !window.__pt_auto_active;
        updatePillState();
        if (window.__pt_auto_active) {
            runDynamicAutoAnnotation();
        }
    }

    function makeDraggable(el) {
        let isDragging = false;
        let startX = 0, startY = 0;
        let startLeft = 0, startTop = 0;

        function setPos(left, top) {
            el.style.setProperty("left", left + "px", "important");
            el.style.setProperty("top", top + "px", "important");
            el.style.setProperty("right", "auto", "important");
            el.style.setProperty("bottom", "auto", "important");
        }

        // Restore saved position
        try {
            const saved = JSON.parse(localStorage.getItem("pt_bar_pos") || "null");
            if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
                const maxL = Math.max(0, window.innerWidth - 60);
                const maxT = Math.max(0, window.innerHeight - 36);
                const l = Math.max(0, Math.min(maxL, saved.left));
                const t = Math.max(0, Math.min(maxT, saved.top));
                setPos(l, t);
            }
        } catch (e) {}

        const onDown = (e) => {
            if (e.target.closest("#pt-toggle-btn")) return;
            isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            const rect = el.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            el.style.setProperty("cursor", "grabbing", "important");
            el.style.transition = "none";
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            const newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, startLeft + dx));
            const newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop + dy));
            setPos(newLeft, newTop);
        };

        const onUp = () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.removeProperty("cursor");
            el.style.transition = "";
            const rect = el.getBoundingClientRect();
            try {
                localStorage.setItem("pt_bar_pos", JSON.stringify({ left: rect.left, top: rect.top }));
            } catch (e) {}
        };

        el.addEventListener("mousedown", onDown);
        el.addEventListener("touchstart", onDown, { passive: false });
        // Window-level drag handlers: only one set may exist at a time (the bar can be re-created).
        for (const [type, fn, opts] of dragWindowHandlers) window.removeEventListener(type, fn, opts);
        dragWindowHandlers = [["mousemove", onMove, undefined], ["mouseup", onUp, undefined],
                              ["touchmove", onMove, { passive: false }], ["touchend", onUp, undefined]];
        for (const [type, fn, opts] of dragWindowHandlers) ptOn(window, type, fn, opts);
    }

    function ensurePill() {
        let bar = document.getElementById("pt-floating-bar");
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "pt-floating-bar";
            bar.title = "Drag to reposition anywhere on screen";
            bar.innerHTML = `
                <span class="pt-drag-handle" title="Drag to move">\u283F</span>
                <span class="pt-status-dot active" id="pt-status-dot"></span>
                <span id="pt-status-text" style="font-weight: 600; color: #10b981;">\uD83C\uDFAF Scanning...</span>
                <button id="pt-toggle-btn" class="btn-stop" title="Click to Stop">\u23F9 Stop</button>
            `;
            document.body.appendChild(bar);

            const btn = document.getElementById("pt-toggle-btn");
            if (btn) {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggleAutoAnnotation();
                });
            }

            makeDraggable(bar);
        }
        updatePillState();
    }
    ensurePill();


    // ======================================================================================================
    // LABEL CHECK (v11.0.0) - tells you when a label you applied is wrong, and which label is right.
    //
    // 1. FIND your labels: every element inside the right document whose label can be read - from its
    //    attributes / title, or from its colour matched against the label chips at the top of the screen
    //    (the live dashboard draws labels as <mark role="button"> with a coloured background + underline).
    // 2. DECIDE the correct label for exactly that text (judgeLabel):
    //      a. the auditor's own suggestion for that text            -> that label
    //      b. text that is the same on the left (unchanged)          -> a valid entity of that type, or NO label
    //      c. text that is not on the left (it was replaced)         -> Overscrubbed when the original was an
    //         ordinary word, NO label when it replaced a name / company / address / credential / code
    //      d. an Overscrubbed label that also covers unchanged text  -> Overscrubbed on the changed part only
    // 3. SHOW it: red dashed outline, a badge "Date -> Overscrubbed" above the word, a card with the reason on
    //    hover, the count on the bar, and a list of all mistakes (click one to jump to it).
    // ======================================================================================================
    const PTC_NONE = "No label";
    function judgeLabel(T, L, ctx) {
        const { leftText, rightText, lookup, scrubbed, ordinary } = ctx;
        const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lineOf = (txt, s) => { const i = (txt || "").indexOf(s); if (i < 0) return ""; const a = txt.lastIndexOf("\n", i) + 1; const b = txt.indexOf("\n", i); return txt.slice(a, b < 0 ? txt.length : b); };
        const rLine = lineOf(rightText, T);
        const wrong = (expected, why) => ({ expected, why });
        const inLeft = (() => {
            if (!leftText || leftText.indexOf(T) < 0) return false;
            if (T.length >= 5) return true;
            return new RegExp("(?:^|[^\\p{L}\\p{N}_])" + escRe(T) + "(?![\\p{L}\\p{N}_])", "u").test(leftText);
        })();
        const words = T.split(/[\s\-_/.,:;()]+/).filter(Boolean);
        const sugg = (w) => lookup.get(w) || lookup.get(w.toLowerCase());

        // a. our own suggestion for exactly this text
        const own = sugg(T);
        if (own && own.label) {
            return own.label === L ? null : wrong(own.label, `This text should be labeled ${own.label}.`);
        }

        // d / c for Overscrubbed
        if (L === "Overscrubbed") {
            if (inLeft) return wrong(PTC_NONE, "This text is identical in the left document - nothing was changed, so nothing was overscrubbed.");
            // (v11.4.4) dates: a changed date of birth is correct redaction; any other changed date is overscrubbing
            const dobLine = /\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date|birthday|born|date_of_birth|birth_date|birthdate)\b/i.test(rLine);
            if (isDateFormat(T) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(T) && /\d/.test(T)) {
                if (dobLine) return wrong(PTC_NONE, "A changed date of birth is correct redaction, not overscrubbing.");
                return null;
            }
            // (v11.4.4) a number, phone or e-mail replaced by another of the same kind is correct redaction
            if (/^\+?\d[\d\s().,\/:-]*$/.test(T) || isEmailAddressFormat(T)) return wrong(PTC_NONE, "A value replaced by another of the same kind (number, phone, e-mail) is correct redaction, not overscrubbing.");
            if (words.length && words.every(w => scrubbed.has(w))) return wrong(PTC_NONE, "This replaced a name, company, address, credential or code - that is correct redaction, not overscrubbing.");
            const changedParts = words.filter(w => { const m = sugg(w); return m && m.label === "Overscrubbed"; });
            const unchanged = words.filter(w => w.length >= 3 && /[A-Za-z]/.test(w) && !sugg(w) && new RegExp("(?:^|[^A-Za-z0-9])" + escRe(w) + "(?![A-Za-z0-9])").test(leftText || ""));
            if (changedParts.length && unchanged.length) return wrong("Overscrubbed: " + changedParts.join(", "), `The label also covers unchanged text (${unchanged.slice(0, 3).join(", ")}). Label only the changed part.`);
            if (/https?:\/\/\S*$/.test(rLine.slice(0, Math.max(0, rLine.indexOf(T))))) return wrong(PTC_NONE, "This is inside a changed link - changed links get no label.");
            if (new RegExp("[\\w.+-]*" + escRe(T) + "[\\w.+-]*@|@[\\w.-]*" + escRe(T)).test(rLine)) return wrong(PTC_NONE, "This is part of a changed e-mail address - correct redaction.");
            if (credentialValuesInLine(rLine).some(c => c.value.indexOf(T) >= 0)) return wrong(PTC_NONE, "This is a changed credential value - correct redaction.");
            if (rLine.length <= 120 && looksLikeAddressPart(rLine)) return wrong(PTC_NONE, "This is part of a changed address - correct redaction.");
            return null;
        }

        // c. entity label on replaced text
        if (!inLeft) {
            if (words.length && words.every(w => scrubbed.has(w))) return wrong(PTC_NONE, `This replaced a real value (name, company, address, credential or code). Replaced values get no label - not ${L}.`);
            if (words.some(w => ordinary.has(w) || (sugg(w) && sugg(w).label === "Overscrubbed"))) return wrong("Overscrubbed", `An ordinary word was replaced here, so it is overscrubbed - not ${L}.`);
            return wrong(PTC_NONE, `This text is not in the left document (it was replaced). Replaced values are never ${L}: use Overscrubbed if the original was an ordinary word, otherwise no label.`);
        }

        // b. entity label on unchanged text
        const isEmail = isEmailAddressFormat(T);   // (v11.4.3) the same rule as the suggestions: no placeholders, no icon@2x.png
        const strong = isEmail ? "Email Address" : (/^https:\/\/\S+$/i.test(T) && !isFileAssetLink(T)) ? "URL/Link" : isIpAddressFormat(T) ? "IP Address" :
            /^@[A-Za-z_][\w.]{1,29}$/.test(T) ? "Person Username" : isVehiclePlateFormat(T) ? "Vehicle Number Plate" :
            phoneLabelFor(T);
        const strongL = strong ? labelForPage(strong) : null;   // (v11.4.1) as the chips on this page name it
        // (v11.4.0) a postal code can have a phone-like shape ("08139-555"): with a postal label it is judged as a postal code below
        const postalL = L === LBL_POSTAL || L === LBL_KODEPOS || L === LBL_CEP;
        if (strongL && strongL !== L && !(L === "Credentials" && PHONE_LABELS.has(strongL)) && !(postalL && isPostalCodeShape(T))) return wrong(strongL, `This is a ${strongL}.`);
        const keyLike = /^["']?[A-Za-z_][\w.-]*["']?$/.test(T) && new RegExp('["\']?' + escRe(T) + '["\']?\\s*[:=]').test(rLine);
        if (keyLike && !/^@/.test(T)) return wrong(PTC_NONE, `This is a field name / key, not a ${L}.`);
        if (isFieldLabelOrHeader(T)) return wrong(PTC_NONE, `This is a field label or column header, not a ${L}.`);
        const plain = T.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
        const ordinaryWord = plain && plain === T.replace(/\s+/g, " ").trim() && isOrdinaryPhrase(plain);
        const digits = T.replace(/\D/g, "");
        switch (L) {
            case "Email Address":
                if (isEmail) return null;
                if (isDefaultOrPlaceholderEmail(T)) return wrong(PTC_NONE, "This is a placeholder address (example.com, test.com, ...), not personal data.");
                return wrong(PTC_NONE, "This is not an e-mail address.");
            case "URL/Link":
                if (/^http:\/\//i.test(T) || /^www\./i.test(T)) return wrong(PTC_NONE, "Only https:// links are labeled.");
                if (isFileAssetLink(T)) return wrong(PTC_NONE, "This links to a file (image, script, style, font, archive, media, data or code). File links are not labeled (documents are).");
                return /^https:\/\/\S+$/i.test(T) ? null : wrong(PTC_NONE, "This is not a link.");
            case "IP Address": return isIpAddressFormat(T) ? null : wrong(PTC_NONE, "This is not a valid IP address.");
            case "Contact Number": {   // (v11.4.0) replaced by Indian Mobile Number / International Phone Number
                const ph = labelForPage(phoneLabelFor(T));
                if (ph === "Contact Number") return null;   // (v11.4.1) a page with the old chips only: Contact Number is right
                return ph ? wrong(ph, `Phone numbers now use ${LBL_IN_MOBILE} or ${LBL_INTL_PHONE}; this one is an ${ph}.`) : wrong(PTC_NONE, "This is not a phone number.");
            }
            case LBL_IN_MOBILE:
                if (isIndianMobileFormat(T)) return null;
                return isIntlPhoneFormat(T) ? wrong(LBL_INTL_PHONE, "This is not an Indian mobile (10 digits starting 6-9).") : wrong(PTC_NONE, "This is not a phone number.");
            case LBL_INTL_PHONE: {
                if (isIntlPhoneFormat(T)) return null;
                if (isIndianMobileFormat(T)) return wrong(LBL_IN_MOBILE, "This is an Indian mobile number (10 digits starting 6-9).");
                // a run of digits right after a phone word ("Fax: 2345 6789")
                const before = rLine.slice(0, Math.max(0, rLine.indexOf(T)));
                const dg = digits.length;
                if (dg >= 7 && dg <= 15 && !isNotAPhoneShape(T) && /\b(?:phone|ph|tel|telephone|mob|mobile|cell|fax|whatsapp|contact|call|landline)\b[^\d]{0,12}$/i.test(before)) return null;
                return wrong(PTC_NONE, "This is not a phone number.");
            }
            case LBL_POSTAL:
                return isPostalCodeShape(T) ? null : wrong(PTC_NONE, "This is not a postal code.");
            case LBL_KODEPOS:
                if (/^\d{5}$/.test(T)) return null;
                return isPostalCodeShape(T) ? wrong(LBL_POSTAL, "An Indonesian postal code (kode pos) has 5 digits.") : wrong(PTC_NONE, "This is not a postal code.");
            case LBL_CEP:
                if (/^\d{5}-?\d{3}$/.test(T)) return null;
                return isPostalCodeShape(T) ? wrong(LBL_POSTAL, "A Brazilian CEP is written #####-###.") : wrong(PTC_NONE, "This is not a postal code.");
            case "Vehicle Number Plate": return isVehiclePlateFormat(T) ? null : wrong(PTC_NONE, "This is not a valid Indian number plate.");
            case "Person Username": return /^@[A-Za-z_][\w.]{1,29}$/.test(T) ? null : wrong(PTC_NONE, "This is not an @username.");
            case "Account Number": return (/^\d[\d -]{7,22}\d$/.test(T) && digits.length >= 9 && digits.length <= 18) ? null : wrong(PTC_NONE, "This is not a bank account number (9-18 digits).");
            case "Date": {
                if (!isDateFormat(T)) return wrong(ordinaryWord ? PTC_NONE : PTC_NONE, "This is not a date.");
                const ctxTxt = (rLine + " " + lineOf(leftText, T)).toLowerCase();
                return /\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date|birthday|born|date_of_birth|birth_date)\b/.test(ctxTxt) ? null : wrong(PTC_NONE, "Only dates of birth are labeled.");
            }
            case "Address":   // (v11.4.0) full or partial; a city, state, country or postal code alone is not an address
                if (isCompleteAddress(T) || isPartialAddress(T)) return null;
                if (isPostalCodeShape(T) && !/\s\S+\s/.test(T)) return labelForPage(LBL_POSTAL) ? wrong(LBL_POSTAL, "A postal code on its own is labeled Postal Code, not Address.") : wrong(PTC_NONE, "A postal code on its own is not an address.");
                return wrong(PTC_NONE, "Not an address (a city, state or country alone is not labeled).");
            case "Credentials":
                if (ordinaryWord) return wrong(PTC_NONE, "This is an ordinary word, not a credential.");
                return null;
            case "Person Name":
                if (ordinaryWord || isLanguageWord(plain)) return wrong(PTC_NONE, "This is an ordinary word, place or language, not a person's name.");
                if (/\d/.test(T)) return wrong(PTC_NONE, "This is not a person's name.");
                if (KNOWN_BUSINESS_NAMES.has(T.toLowerCase())) return wrong("Business Name", "This is a company name.");
                if (TECH_TOOLS.has(T.toLowerCase())) return wrong(PTC_NONE, "This is a software / technology name.");
                return null;
            case "Business Name":
                if (ordinaryWord) return wrong(PTC_NONE, "This is an ordinary word, not a company name.");
                if (/\bbank\b/i.test(T)) return wrong(PTC_NONE, "Bank names are not labeled as Business Name.");
                if (TECH_TOOLS.has(T.toLowerCase())) return wrong(PTC_NONE, "This is a software / technology name.");
                if (isPersonName(T, rLine) && !KNOWN_BUSINESS_NAMES.has(T.toLowerCase())) return wrong("Person Name", "This is a person's name.");
                return null;
            default: return null;
        }
    }

    // Text of a label element, without our own suggestion spans' markup.
    function labelText(el) {
        const clone = el.cloneNode(true);
        for (const own of clone.querySelectorAll(".pt-tag")) own.replaceWith(own.ownerDocument.createTextNode(own.textContent));
        for (const x of clone.querySelectorAll("svg, i, [class*='close'], [class*='anticon']")) x.remove();
        return (clone.textContent || "").replace(/\s+/g, " ").replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
    }
    const PTC_ATTRS = ["data-ptc", "data-ptc-your", "data-ptc-expected", "data-ptc-why"];
    function setAttrIfChanged(el, name, value) { if (el.getAttribute(name) !== value) el.setAttribute(name, value); }
    function clearPtc(el) { for (const a of PTC_ATTRS) if (el.hasAttribute(a)) el.removeAttribute(a); }

    const REVIEW_UI_TEXT = /^(?:annotate\s+here|reference(?:\s*[\u00B7.\-|]\s*read[\s-]*only)?|read[\s-]*only|close|cancel|apply|remove|submit(?:\s+for\s+review)?|change\s+label(?:\s+for)?|labels|\d+\s+(?:annotations?|match(?:es)?(?:\s+in\s+the\s+(?:left|right|other)\s+document)?))$/i;
    function isReviewUiElement(el) {
        const t = (el.textContent || "").replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
        if (!t) return false;
        if (REVIEW_UI_TEXT.test(t)) return true;
        // (v11.3.1) the same controls with an icon or extra characters ("\u270E Annotate here", "Annotate here \u2192")
        if (t.length <= 40 && /\b(?:annotate\s+here|read[\s-]*only|submit\s+for\s+review|change\s+label)\b/i.test(t)) return true;
        if (/^(?:left|right)\.[A-Za-z0-9]+-[0-9a-f]{6,}$/i.test(t)) return true;                       // file name header
        if (LABEL_NAMES.some(l => l.toLowerCase() === t.toLowerCase())) return true;                    // a label chip
        // (v11.3.2) a control is a <button>, or sits in a menu / popover / header that does NOT contain the document.
        // The whole review screen is itself a dialog (role="dialog"): the old rule treated every label inside it as a
        // control, so no label was ever checked ("labels not readable").
        if (el.tagName === "BUTTON") return true;
        const { rightPane: rp } = getPanes();
        const box = el.closest("button, [role='dialog'], dialog, [role='menu'], [role='listbox'], header, select, option");
        if (box && !(rp && (box === rp || box.contains(rp)))) return true;
        return false;
    }
    // ---- (v11.3.0) Labels learned from the dashboard's own label dialog - independent of colours and markup ----
    // When you open or apply a label, the dashboard shows 'Change label for "exclusive"' with the current label in a
    // picker. That dialog says exactly which label is on which words, so it is recorded and used whenever a label's
    // colour cannot be read (any browser, any theme).
    const __ptDialogLabels = new Map();   // words -> label
    const __labelIn = (s) => { const t = (s || "").replace(/\s+/g, " ").trim().toLowerCase(); return LABEL_NAMES.find(l => l.toLowerCase() === t) || null; };
    function readLabelDialog(root) {
        const box = root && root.nodeType === 1 ? root : document.body;
        const cands = box.querySelectorAll ? box.querySelectorAll("[role='dialog'], [class*='popover'], [class*='Popover'], [class*='modal'], [class*='dropdown'], div") : [];
        for (const el of cands) {
            const t = (el.textContent || "").replace(/\s+/g, " ");
            if (t.length > 600 || !/change\s+label\s+for/i.test(t)) continue;
            const m = /change\s+label\s+for\s*[\u201C"\u2018']([^\u201D"\u2019']{1,200})[\u201D"\u2019']/i.exec(t);
            if (!m) continue;
            let label = null;
            const sel = el.querySelector("select");
            if (sel && sel.selectedOptions && sel.selectedOptions[0]) label = __labelIn(sel.selectedOptions[0].textContent);
            if (!label) for (const q of el.querySelectorAll("[role='combobox'], [aria-haspopup], [class*='select'], [class*='Select'], button, span, div")) { const l = __labelIn(q.textContent); if (l) { label = l; break; } }
            if (label) return { text: m[1].trim(), label, el };
        }
        return null;
    }
    ptOn(document, "click", (e) => {
        try {
            const t = e.target && e.target.closest ? e.target.closest("button, [role='button'], [role='option'], li, div, span") : null;
            if (!t || t.closest("#pt-floating-bar")) return;
            const bt = (t.textContent || "").replace(/\s+/g, " ").trim();
            const d = readLabelDialog(t.closest("[role='dialog']") || t.parentElement && t.parentElement.parentElement && t.parentElement.parentElement.parentElement);
            if (!d) return;
            if (/^(?:\u2713\s*)?(?:apply|save|update|done|ok)$/i.test(bt)) { __ptDialogLabels.set(d.text, d.label); lastAnnotatedSnapshot = ""; triggerUpdate(400); }
            else if (/remove|delete/i.test(bt) && bt.length < 12) { __ptDialogLabels.delete(d.text); lastAnnotatedSnapshot = ""; triggerUpdate(400); }
        } catch (err) {}
    }, { capture: true });
    // a dialog that opens on an existing label tells us that label too
    const __dialogObserver = new MutationObserver((muts) => {
        try {
            for (const m of muts) for (const n of m.addedNodes) {
                if (n.nodeType !== 1 || n.closest && n.closest("#pt-floating-bar")) continue;
                if (!/change\s+label\s+for/i.test(n.textContent || "")) continue;   // cheap test on the new node only
                const d = readLabelDialog(n.querySelector ? n : document.body) || readLabelDialog(n.parentElement);
                if (d) __ptDialogLabels.set(d.text, d.label);
            }
        } catch (e) {}
    });
    try { __dialogObserver.observe(document.body, { childList: true, subtree: true }); } catch (e) {}

    // (v11.3.5) How many labels could not be checked: a judge crash or a <mark> whose label could not be read.
    // Labels outside the document and the review screen's own controls are not counted. Never throws.
    function labelsNotChecked() {
        try { const s = __ptLabelStats; return s ? (s.errors | 0) + (s.unread | 0) + (s.ambiguous | 0) : 0; } catch (e) { return 0; }   // (v11.3.6) + labels on a shared colour that could not be told apart
    }
    function labelCheckSummary(mistakeCount) {
        try {
            const s = __ptLabelStats;
            if (!s) return "";
            const k = s.skipped || {};
            return `Label check: ${s.checked | 0} checked, mistakes: ${mistakeCount | 0}, errors: ${s.errors | 0}, unread: ${s.unread | 0}, unsure (shared colour): ${s.ambiguous | 0}, too short: ${k.tooShort | 0}, too long: ${k.tooLong | 0}`;
        } catch (e) { return ""; }
    }

    function runLabelCheck(rightPane, leftText, rightText, targets, scopeEls) {
        const lookup = new Map();
        for (const t of targets) { lookup.set(t.text, t); if (!lookup.has(t.text.toLowerCase())) lookup.set(t.text.toLowerCase(), t); }
        const ctx = { leftText, rightText, lookup, scrubbed: targets.scrubbedNames || new Set(), ordinary: targets.ordinaryWords || new Set() };
        const SEL = "mark, span, u, ins, b, strong, em, a, [data-label], [data-entity], [data-category], [data-annotation]";
        const pool = [];
        if (scopeEls) { for (const s of scopeEls) { if (s.matches && s.matches(SEL)) pool.push(s); for (const x of s.querySelectorAll(SEL)) pool.push(x); } }
        else for (const x of rightPane.querySelectorAll(SEL)) pool.push(x);
        if (!(rightText || "").trim()) { for (const el of rightPane.querySelectorAll("[data-ptc]")) clearPtc(el); __ptcMistakes = []; return []; }   // empty document (.gitkeep)
        const labeled = new Map();   // element -> label
        const ambig = new Map();     // (v11.3.6) element -> candidate labels, when its colour is shared by several labels and nothing else settles it
        const stats = { marks: rightPane.querySelectorAll("mark").length, candidates: pool.length, ui: 0, unread: 0, viaDialog: 0, labeled: 0,
                        checked: 0, errors: 0, ambiguous: 0, lastError: "", skipped: { unread: 0, tooShort: 0, tooLong: 0 } };
        __ptLabelStats = stats;
        for (const el of pool) {
            // (a label drawn INSIDE one of our suggestion spans still counts: the editor may wrap the selection there)
            if (labeled.has(el) || el.classList.contains("pt-tag") || el.closest("#pt-floating-bar")) continue;
            const len = (el.textContent || "").length;
            if (len < 1) continue;
            if (len > 250) { if (el.tagName === "MARK") stats.skipped.tooLong++; continue; }   // (v11.3.5) counted, still not checked
            // (v11.2.1) the review screen's own controls are never labels: the "Annotate here" chip (light blue, read
            // as Person Name), "Reference \u00B7 read-only", file names ("right.md-d146149f"), label chips, buttons.
            if (isReviewUiElement(el)) { stats.ui++; continue; }
            // (v11.3.1) The dashboard draws every label as a <mark>. Any other coloured element (a header chip, a badge)
            // is only treated as a label when it says so (data-label / data-entity / an "annotation" class). Without this,
            // the built-in colours of v11.3.0 made the light-blue "Annotate here" chip look like a Person Name label.
            if (el.tagName !== "MARK" && !el.matches("[data-label], [data-entity], [data-category], [data-annotation]") &&
                !/\b(?:annot|entity|pii|label-)\w*/i.test(typeof el.className === "string" ? el.className : "")) { stats.ui++; continue; }
            let L = detectAssignedCategory(el);
            // (v11.3.6) the colour is shared by several labels: the label dialog settles it when it knows these words; otherwise keep every candidate
            if (L) {
                try {
                    const cands = __ptAmbiguous.get(el);
                    if (cands && cands.length > 1) {
                        const tx = (el.textContent || "").replace(/\s+/g, " ").trim();
                        const dl = __ptDialogLabels.get(tx);
                        if (dl && cands.includes(dl)) { L = dl; stats.viaDialog++; }
                        else ambig.set(el, cands);
                    }
                } catch (e) { try { stats.errors++; stats.lastError = String((e && e.message) || e).slice(0, 200); } catch (x) {} }
            }
            // colour not readable: a <mark> whose words were labeled in the dashboard's dialog
            if (!L && el.tagName === "MARK") { const tx = (el.textContent || "").replace(/\s+/g, " ").trim(); if (__ptDialogLabels.has(tx)) { L = __ptDialogLabels.get(tx); stats.viaDialog++; } }
            if (!L && el.tagName === "MARK") { stats.unread++; stats.skipped.unread++; }
            if (L) { labeled.set(el, L); stats.labeled++; }
        }
        const mistakes = [];
        const seen = new Set();
        for (const [el, L] of labeled) {
            // the outermost label element wins (a label drawn as nested elements is judged once)
            let anc = el.parentElement, nested = false;
            while (anc && anc !== rightPane) { if (labeled.has(anc)) { nested = true; break; } anc = anc.parentElement; }
            if (nested) { clearPtc(el); continue; }
            seen.add(el);
            const T = labelText(el);
            if (T.length < 2) { stats.skipped.tooShort++; clearPtc(el); continue; }
            let verdict = null, tieFailed = false, handled = false, Lx = L;
            // (v11.3.6) A colour shared by several labels is never guessed: every candidate is judged.
            //   all wrong -> a real mistake whichever label was used;  all correct -> ok;  mixed -> "unsure" (not a mistake, counted as not checked)
            const cands = ambig.get(el);
            if (cands && cands.length > 1) {
                try {
                    const vs = cands.map(c => judgeLabel(T, c, ctx));
                    const bad = vs.filter(Boolean);
                    const names = cands.length > 2 ? cands.slice(0, -1).join(", ") + " and " + cands[cands.length - 1] : cands.join(" and ");
                    if (bad.length === vs.length) {
                        verdict = { expected: bad[0].expected, why: bad[0].why + ` (The colour is shared by ${names}; whichever you used, it is wrong.)` };
                        Lx = cands.join(" / "); stats.checked++; handled = true;   // (v11.4.0) the label could be any of them
                    } else if (bad.length === 0) {
                        Lx = cands[0]; stats.checked++; handled = true;
                    } else {
                        stats.ambiguous++; handled = true;
                        setAttrIfChanged(el, "data-ptc", "unsure");
                        setAttrIfChanged(el, "data-ptc-your", cands.join(" / "));
                        setAttrIfChanged(el, "data-ptc-expected", bad[0].expected);
                        setAttrIfChanged(el, "data-ptc-why", `Colour is shared by ${names}, so the auditor cannot tell which you used. Check the label name by hand.`);
                        continue;
                    }
                } catch (e) {
                    // fall back to today's behaviour (judge the label that was read) and count the failure
                    tieFailed = true; handled = false; verdict = null; Lx = L;
                    try { stats.errors++; stats.lastError = String((e && e.message) || e).slice(0, 200); } catch (x) {}
                }
            }
            if (!handled) {
                // a crash is still NOT a mistake, but it is counted so the bar does not look like the all-clear (v11.3.5)
                try { verdict = judgeLabel(T, L, ctx); stats.checked++; }
                catch (e) { verdict = null; if (!tieFailed) { try { stats.errors++; stats.lastError = String((e && e.message) || e).slice(0, 200); } catch (x) {} } }
            }
            if (verdict) {
                setAttrIfChanged(el, "data-ptc", "wrong");
                setAttrIfChanged(el, "data-ptc-your", Lx);
                setAttrIfChanged(el, "data-ptc-expected", verdict.expected);
                setAttrIfChanged(el, "data-ptc-why", verdict.why);
                mistakes.push({ el, text: T, your: Lx, expected: verdict.expected, why: verdict.why });
            } else {
                setAttrIfChanged(el, "data-ptc", "ok");
                setAttrIfChanged(el, "data-ptc-your", Lx);
                for (const a of ["data-ptc-expected", "data-ptc-why"]) if (el.hasAttribute(a)) el.removeAttribute(a);
            }
        }
        // elements that are no longer labels (label removed) lose our marks
        for (const el of rightPane.querySelectorAll("[data-ptc]")) if (!seen.has(el) && (!scopeEls || scopeEls.some(s => s.contains(el)))) clearPtc(el);
        __ptcMistakes = mistakes;
        renderMistakeList();
        return mistakes;
    }

    // ---------- UI: hover card, mistake list, navigation ----------
    function ptcCard() {
        let c = document.getElementById("ptc-card");
        if (!c) { c = document.createElement("div"); c.id = "ptc-card"; document.body.appendChild(c); }
        return c;
    }
    const escHtml = (s) => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    ptOn(document, "mouseover", (e) => {
        const el = e.target && e.target.closest ? e.target.closest("[data-ptc='wrong'], [data-ptc='unsure']") : null;
        const card = document.getElementById("ptc-card");
        if (!el) { if (card && !e.target.closest("#ptc-card")) card.classList.remove("ptc-show"); return; }
        const c = ptcCard();
        if (el.getAttribute("data-ptc") === "unsure") {   // (v11.3.6) shared colour
            c.innerHTML = '<div class="ptc-h">? Unsure which label</div>' +
                '<div class="ptc-row"><span>Text</span><b>' + escHtml(labelText(el).slice(0, 80)) + '</b></div>' +
                '<div class="ptc-row"><span>Could be</span><b class="ptc-bad">' + escHtml(el.getAttribute("data-ptc-your")) + '</b></div>' +
                '<div class="ptc-row"><span>Correct</span><b class="ptc-good">' + escHtml(el.getAttribute("data-ptc-expected")) + '</b></div>' +
                '<div class="ptc-why">' + escHtml(el.getAttribute("data-ptc-why") || "") + '</div>';
        } else
        c.innerHTML = '<div class="ptc-h">\u26A0 Wrong label</div>' +
            '<div class="ptc-row"><span>Text</span><b>' + escHtml(labelText(el).slice(0, 80)) + '</b></div>' +
            '<div class="ptc-row"><span>Your label</span><b class="ptc-bad">' + escHtml(el.getAttribute("data-ptc-your")) + '</b></div>' +
            '<div class="ptc-row"><span>Correct</span><b class="ptc-good">' + escHtml(el.getAttribute("data-ptc-expected")) + '</b></div>' +
            '<div class="ptc-why">' + escHtml(el.getAttribute("data-ptc-why") || "") + '</div>';
        const r = el.getBoundingClientRect();
        c.classList.add("ptc-show");
        const w = c.offsetWidth || 280, h = c.offsetHeight || 120;
        let left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
        let top = r.bottom + 8; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 26);
        c.style.left = left + "px"; c.style.top = top + "px";
    }, { passive: true });
    let __ptcIndex = -1;
    function focusMistake(i) {
        if (!__ptcMistakes.length) return;
        __ptcIndex = ((i % __ptcMistakes.length) + __ptcMistakes.length) % __ptcMistakes.length;
        const m = __ptcMistakes[__ptcIndex];
        if (!m.el.isConnected) return;
        m.el.scrollIntoView({ behavior: "smooth", block: "center" });
        m.el.setAttribute("data-ptc-flash", "1");   // an attribute, not a class: the page's own classes are never touched
        setTimeout(() => m.el.removeAttribute("data-ptc-flash"), 1400);
    }
    function renderMistakeList() {
        const panel = document.getElementById("ptc-list");
        if (!panel || panel.hidden) return;
        const rows = __ptcMistakes.map((m, i) => '<div class="ptc-item" data-i="' + i + '"><b>' + escHtml(m.text.slice(0, 40)) + '</b>' +
            '<span class="ptc-bad">' + escHtml(m.your) + '</span> \u2192 <span class="ptc-good">' + escHtml(m.expected) + '</span>' +
            '<div class="ptc-why">' + escHtml(m.why) + '</div></div>').join("");
        panel.querySelector(".ptc-body").innerHTML = rows || '<div class="ptc-empty">No label mistakes on this page.</div>';
    }
    function toggleMistakeList() {
        let panel = document.getElementById("ptc-list");
        if (!panel) {
            panel = document.createElement("div");
            panel.id = "ptc-list";
            panel.hidden = true;
            panel.innerHTML = '<div class="ptc-head"><b>Label mistakes</b><span><button data-a="prev">\u2039</button><button data-a="next">\u203A</button><button data-a="close">\u2715</button></span></div><div class="ptc-body"></div>';
            panel.addEventListener("click", (e) => {
                const a = e.target.getAttribute && e.target.getAttribute("data-a");
                if (a === "close") { panel.hidden = true; return; }
                if (a === "next") return focusMistake(__ptcIndex + 1);
                if (a === "prev") return focusMistake(__ptcIndex - 1);
                const item = e.target.closest(".ptc-item");
                if (item) focusMistake(+item.getAttribute("data-i"));
            });
            document.body.appendChild(panel);
        }
        panel.hidden = !panel.hidden;
        renderMistakeList();
    }

    // Long documents: the analysed window follows scrolling (pane scroll events are caught in the capture phase).
    ptOn(document, "scroll", () => {
        if (!__ptViewportInfo) return;
        lastAnnotatedSnapshot = "";
        triggerUpdate(350);
    }, { capture: true, passive: true });


    function getPanes() {
        if (cachedLeftPane && cachedLeftPane.isConnected && cachedRightPane && cachedRightPane.isConnected) {
            return { leftPane: cachedLeftPane, rightPane: cachedRightPane };
        }
        // One getBoundingClientRect() per element (it used to be read three times for every <div> on the page).
        const rects = new Map();
        const candidates = [];
        for (const el of document.querySelectorAll("pre, code, [class*='content'], [class*='document'], [class*='editor'], div")) {
            const r = el.getBoundingClientRect();
            if (r.width > 220 && r.height > 160) { rects.set(el, r); candidates.push(el); }
        }
        const lefts = candidates.filter(el => rects.get(el).right < window.innerWidth * 0.52);
        const rights = candidates.filter(el => rects.get(el).left > window.innerWidth * 0.45);

        function pickBestPane(els) {
            if (!els || els.length === 0) return null;
            let best = els[0];
            let maxArea = 0;
            for (const el of els) {
                const r = rects.get(el) || el.getBoundingClientRect();
                const area = r.width * r.height;
                if (area > maxArea) {
                    maxArea = area;
                    best = el;
                }
            }
            return best;
        }

        const leftPane = pickBestPane(lefts);
        const rightPane = pickBestPane(rights);
        if (leftPane && rightPane) {
            cachedLeftPane = leftPane;
            cachedRightPane = rightPane;
        }
        return { leftPane: cachedLeftPane, rightPane: cachedRightPane };
    }

    function isAnnotationReviewScreen() {
        const now = Date.now();
        if (now - __ptScreenCache.t < 700) return __ptScreenCache.v;
        const v = isAnnotationReviewScreenUncached();
        __ptScreenCache = { t: now, v };
        return v;
    }
    function isAnnotationReviewScreenUncached() {
        // textContent, not innerText: innerText forces a layout of the whole page, which is slow on long documents.
        const bodyText = document.body ? (document.body.textContent || "") : "";

        // 1. PeakTalent's annotation review screen has distinct badges:
        // "Annotate here" (badge on right pane) or "Reference . read-only" (badge on left pane)
        const hasAnnotateBadge = /Annotate here/i.test(bodyText);
        const hasReferenceBadge = /Reference\s*[\u00B7\-\\u2013\.]?\s*read-only/i.test(bodyText) || (/Reference/i.test(bodyText) && /read-only/i.test(bodyText));
        const hasLeftAndRightFiles = /\bleft\.[a-z0-9_\-]+/i.test(bodyText) && /\bright\.[a-z0-9_\-]+/i.test(bodyText);

        // 2. Count official PII category badges present on the annotation review toolbar
        const piiCategories = [
            "Account Number", "Address", "Business Name", "Contact Number",
            "Credentials", "Date", "Email Address", "IP Address",
            "Overscrubbed", "Person Name", "URL/Link", "Vehicle Number Plate"
        ];
        let piiCount = 0;
        for (const cat of piiCategories) {
            if (bodyText.includes(cat)) piiCount++;
        }

        // On the annotation screen, at least 2 PII category labels are present in the toolbar,
        // and either "Annotate here" or ("Reference" + left/right docs) is present.
        const hasAnnotationMarkers = (hasAnnotateBadge || (hasReferenceBadge && hasLeftAndRightFiles)) && piiCount >= 2;
        if (!hasAnnotationMarkers) return false;

        const { leftPane, rightPane } = getPanes();
        if (!leftPane || !rightPane) return false;
        if (!leftPane.isConnected || !rightPane.isConnected) return false;

        const lRect = leftPane.getBoundingClientRect();
        const rRect = rightPane.getBoundingClientRect();
        if (lRect.width < 180 || rRect.width < 180 || lRect.height < 120 || rRect.height < 120) return false;

        const isSideBySide = (lRect.right <= window.innerWidth * 0.60) && (rRect.left >= window.innerWidth * 0.35);
        return isSideBySide;
    }

    function isWebUrl(str) {
        if (!str) return false;
        const s = str.trim();
        if (/^https?:\/\//i.test(s) || /^\/\//i.test(s) || /^www\./i.test(s)) return true;
        if (/:\/\//.test(s)) return true;
        if (/\.(?:gov|com|org|edu|net|io|ai|co|app)(?:\/|$)/i.test(s)) return true;
        if (/\/(?:blob|tree|raw|main|master|commits|pull)\//i.test(s)) return true;
        return false;
    }

    function isPartOfUrl(str) {
        return isWebUrl(str);
    }

    // (v11.4.1) A link to a file (style, script, image, font, archive, media, data or code file) is not labeled.
    // (v11.4.2) Documents (.pdf .doc .docx .xls .xlsx .ppt .pptx .csv .txt .md) ARE labeled: they may hold personal data.
    // Judged on the last part of the path, before "?" or "#": ".../report.pdf?v=2" is a file, ".../r?file=a.pdf" is a page.
    // A repository on GitHub / GitLab / Bitbucket ("github.com/acme/three.js") is a page, whatever its name ends with.
    const FILE_LINK_EXT = new Set(("css js mjs map wasm png jpg jpeg gif svg ico webp bmp avif woff woff2 ttf otf eot " +
        "tgz tar gz zip 7z rar bz2 xz whl jar war deb rpm apk exe msi dmg pkg " +
        "mp3 wav mp4 mov avi webm json xml yaml yml lock py java ts go sh").split(" "));
    function isFileAssetLink(str) {
        const m = /^(?:https?:)?\/\/([^\/?#\s]+)([^?#\s]*)/i.exec((str || "").trim());
        if (!m || !m[2] || m[2] === "/") return false;
        const segs = m[2].split("/").filter(Boolean);
        if (/^(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)$/i.test(m[1]) && segs.length === 2) return false;
        const ext = /\.([A-Za-z0-9]{1,6})$/.exec(segs[segs.length - 1] || "");
        return !!ext && FILE_LINK_EXT.has(ext[1].toLowerCase());
    }

    function isDefaultOrPlaceholderLink(str) {
        if (!str) return false;
        const s = str.trim().toLowerCase();
        if (/(?:example\.(?:com|org|net)|dummy\.(?:com|org)|sample\.(?:com|org)|test\.(?:com|org)|placeholder|schemas\.android\.com|w3\.org|localhost|127\.0\.0\.1)/i.test(s)) return true;
        return false;
    }

    function isDefaultOrPlaceholderEmail(str) {
        if (!str) return false;
        const s = str.trim().toLowerCase();
        if (/@(?:example\.(?:com|org|net)|test\.(?:com|org)|dummy\.(?:com|org)|sample\.(?:com|org)|placeholder\.(?:com|org)|domain\.com)\b/i.test(s)) return true;
        // (v11.4.3) the name part alone does not make a placeholder: test@acmecorp-demo.io is a real company's mailbox
        return false;
    }

    function isDefaultOrPlaceholderPhone(str) {
        if (!str) return false;
        const s = str.trim().replace(/[^0-9]/g, "");
        if (/^(?:1234567890|0123456789|0000000000|9999999999|1111111111|2222222222|3333333333|4444444444|5555555555|6666666666|7777777777|8888888888)$/.test(s)) return true;
        // US fictional 555 numbers; an Indian mobile (starting 6-9, e.g. 9065558612) is real
        // (v11.4.2) only the US range reserved for fiction, 555-0100 to 555-0199, is fake; other 555 numbers are real phones
        if (/^(?:1?[2-9]\d{2})?55501\d{2}$/.test(s) && !/^[6-9]\d{9}$/.test(s)) return true;
        if (/(\d)\1{5,}/.test(s.slice(-10))) return true;            // "7000000000": six identical digits in a row is not a phone
        return false;
    }

    function isVectorOrPathData(str, context) {
        if (!str && !context) return false;
        const s = (str || "").trim();
        if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        if (/(?:pathdata|<path\b|<\/?vector|android:path)/i.test(ctx)) return true;
        if (/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s\-]+$/.test(s) && /[MmLlHhVvCcSsQqTtAaZz]/.test(s) && /\d/.test(s)) return true;
        if (/^[cMmLlHhVvSsQqTtAaZz]-?\d+(?:\.\d+)?(?:,?\s*-?\d+(?:\.\d+)?)*[zZ]?$/i.test(s)) return true;
        if (/^c?-?\d+(?:\.\d+)?v\d+(?:\.\d+)?c?-?\d+/i.test(s)) return true;
        return false;
    }

    const PLATFORM_MARK_SELECTOR = [
        "mark",
        "ins",
        "[data-label]",
        "[data-entity]",
        "[data-type]",
        "[data-category]",
        "[data-annotation]",
        "[data-val]",
        "[data-value]",
        "[data-name]",
        "[data-tag]",
        "[class*='annotation']",
        "[class*='annotat']",
        "[class*='ann-']",
        "[class*='entity']",
        "[class*='highlight']",
        "[class*='label']",
        "[class*='ant-tag']",
        "[class*='tag-']",
        "[class*='tag']",
        "[class*='badge']",
        "[class*='token']",
        "[aria-label*='annotation']",
        "[aria-label*='Annotation']",
        "[aria-label*='label']",
        "[aria-label*='Label']",
        "span[style*='border']",
        "span[style*='background']",
        "span[style*='outline']",
        "span[style*='box-shadow']",
        "span[style*='text-decoration']",
        "span[style*='color']",
        "span[class*='ant-']",
        "mark[style]",
        "ins[style]"
    ].join(", ");

    const CATEGORY_MAP = [
        { name: "Person Name", classes: [/ant-tag-blue/i, /pt-person/i, /\b(?:person|per_name|author)\b/i, /\bblue\b/i], keywords: [/\bperson[\s\-_]*name\b/i, /\bperson\b/i, /\bauthor\b/i, /\bper_name\b/i], colors: ["#1890ff", "24,144,255", "#91d5ff", "145,213,255", "#e6f7ff", "230,247,255"] },
        { name: "Account Number", classes: [/ant-tag-purple/i, /pt-account/i, /\b(?:account|iban|swift|routing)\b/i, /\bpurple\b/i], keywords: [/\baccount[\s\-_]*number\b/i, /\baccount\b/i, /\bbank[\s\-_]*account\b/i, /\biban\b/i, /\bswift\b/i, /\brouting\b/i], colors: ["#722ed1", "114,46,209", "#d3adf7", "211,173,247", "#f9f0ff", "249,240,255"] },
        { name: "Business Name", classes: [/ant-tag-cyan/i, /pt-business/i, /\b(?:business|company|corp|firm)\b/i, /\bcyan\b/i], keywords: [/\bbusiness[\s\-_]*name\b/i, /\bbusiness\b/i, /\bcompany\b/i, /\bcorp\b/i, /\borg\b/i, /\bfirm\b/i], colors: ["#13c2c2", "19,194,194", "#87e8de", "135,232,222", "#e6fffb", "230,255,251"] },
        { name: "Contact Number", classes: [/ant-tag-orange/i, /pt-contact/i, /\b(?:contact|phone|mobile|tel)\b/i, /\borange\b/i], keywords: [/\bcontact[\s\-_]*number\b/i, /\bcontact\b/i, /\bphone\b/i, /\bmobile\b/i, /\btel\b/i], colors: ["#fa8c16", "250,140,22", "#ffd591", "255,213,145", "#fff7e6", "255,247,230"] },
        { name: "Credentials", classes: [/ant-tag-volcano/i, /ant-tag-gold/i, /pt-creds/i, /pt-credentials/i, /\b(?:credentials?|password|secret|token|apikey|api_key)\b/i, /\bvolcano\b/i], keywords: [/\bcredentials?\b/i, /\bcred\b/i, /\bpassword\b/i, /\bsecret\b/i, /\btoken\b/i, /\bapikey\b/i, /\bapi_key\b/i, /\bauth\b/i], colors: ["#ff7a45", "255,122,69", "#fff2e8", "255,242,232", "#d4380d", "212,56,13"] },
        { name: "Date", classes: [/ant-tag-magenta/i, /pt-date/i, /\b(?:date|dob|birth)\b/i, /\bmagenta\b/i], keywords: [/\bdate\b/i, /\bdob\b/i, /\bbirth\b/i], colors: ["#eb2f96", "235,47,150", "#ffadd2", "255,173,210", "#fff0f6", "255,240,246"] },
        { name: "Email Address", classes: [/ant-tag-green/i, /pt-email/i, /\b(?:email|mail)\b/i, /\bgreen\b/i], keywords: [/\bemail[\s\-_]*address\b/i, /\bemail\b/i, /\bmail\b/i], colors: ["#52c41a", "82,196,26", "#b7eb8f", "183,235,143", "#f6ffed", "246,255,237"] },
        { name: "IP Address", classes: [/ant-tag-cyan/i, /pt-ip/i, /\b(?:ip|ipv4|ipv6)\b/i], keywords: [/\bip[\s\-_]*address\b/i, /\bipaddress\b/i, /\bipv4\b/i, /\bipv6\b/i], colors: ["#36cfc9", "54,207,201"] },
        { name: "URL/Link", classes: [/ant-tag-yellow/i, /pt-url/i, /\b(?:url|link|href)\b/i, /\byellow\b/i, /\bgold\b/i], keywords: [/\burl[\s\-_/]*link\b/i, /\burl\b/i, /\blink\b/i, /\bhref\b/i, /\bhttp\b/i], colors: ["#faad14", "250,173,20", "#ffe58f", "255,229,143", "#fffbe6", "255,251,230"] },
        { name: "Person Username", classes: [/ant-tag-geekblue/i, /pt-username/i, /\b(?:username|user_id|userid)\b/i, /\bgeekblue\b/i], keywords: [/\bperson[\s\-_]*username\b/i, /\busername\b/i, /\buser[\s\-_]*id\b/i], colors: ["#2f54eb", "47,84,235", "#adc6ff", "173,198,255", "#f0f5ff", "240,245,255"] },
        { name: "Vehicle Number Plate", classes: [/ant-tag-lime/i, /pt-vehicle/i, /\b(?:vehicle|plate|license)\b/i, /\blime\b/i], keywords: [/\bvehicle[\s\-_]*number[\s\-_]*plate\b/i, /\bvehicle\b/i, /\blicense[\s\-_]*plate\b/i], colors: ["#73d13d", "#a0d911", "115,209,61", "160,217,17", "#d9f7be", "217,247,190"] },
        { name: "Address", classes: [/ant-tag-red/i, /pt-address/i, /\b(?:address|street|city|postal|zip)\b/i, /\bred\b/i], keywords: [/\baddress\b/i, /\bstreet\b/i, /\bcity\b/i, /\bzip\b/i, /\bpostal\b/i], colors: ["#f5222d", "245,34,45", "#fff1f0", "255,241,240"] },
        { name: "Overscrubbed", classes: [/ant-tag-pink/i, /ant-tag-salmon/i, /pt-overscrub/i, /\b(?:overscrub|scrub)\b/i, /\bpink\b/i, /\bsalmon\b/i], keywords: [/overscrub/i, /\bscrub\b/i], colors: ["#ff7875", "255,120,117", "#ffccc7", "255,204,199"] }
    ];


    // ---- Platform palette (label chip colours), learned from the page and cached for 3 s ----
    const LABEL_NAMES = ["Account Number", "Address", "Business Name", "Contact Number", "Credentials", "Date", "Email Address",
        "IP Address", "Overscrubbed", "Person Name", "URL/Link", "Person Username", "Vehicle Number Plate",
        // (v11.4.0) the new label set (Complete PII Type List). Many share a chip colour: such a label is judged for every
        // label of that colour and shown as "unsure" when they disagree (v11.3.6), never guessed.
        "Passport Number", "Driver Licence Number", "Payment Card Number", "Crypto Wallet Address", "Postal Code", "GPS Coordinates",
        "Indian Aadhaar Number", "Indian PAN (Business)", "Indian PAN (Individual)", "Indian GSTIN", "Indian TAN", "Indian CIN",
        "Brazilian CPF", "Brazilian RG", "Indian Voter ID", "Brazilian PIS/PASEP", "MAC Address", "Indonesian BPJS Number",
        "Indonesian Civil Servant Number (NIP)", "US Social Security Number", "US Passport Number", "US Employer Identification Number",
        "US Driver Licence Number", "US Bank Account/Routing Number", "Stripe Key", "Slack Token", "Sentry Token", "SendGrid Key",
        "PyPI Token", "AWS Access Key ID", "AWS Secret Access Key", "Bank Account Number", "Brazilian CNPJ", "Brazilian CNH",
        "Bearer Token", "Brazilian CEP", "Brazilian Voter Registration", "Connection URL with Credentials", "Date of Birth",
        "Generic API Key", "Google API Key", "GitLab Token", "GitHub Username", "GitHub Token", "IBAN", "IMEI Number",
        "Indian Mobile Number", "Indian UAN", "Indian UPI ID", "Indian Vehicle Number Plate", "IPv6 Address", "JWT Token", "npm Token",
        "OpenAI API Key", "Password", "Private IP Address", "Private Key Block", "Public IPv4 Address", "Indian IFSC Code",
        "Anthropic API Key", "International Phone Number", "Indonesian Postal Code", "Indonesian NPWP", "Indonesian Passport Number",
        "Indonesian NIK", "Indonesian Family Card (KK)", "Indonesian Driving Licence (SIM)"];
    const LABEL_NAME_SET = new Set(LABEL_NAMES.map(l => l.toLowerCase()));
    let __ptPalette = { t: 0, list: [] };
    // ---- Colour parsing (v11.2.3) ----
    // Chrome reports modern CSS colours in their own notation (oklch(...), oklab(...), color(srgb ...), "rgb(1 2 3 / 0.5)"),
    // Safari mostly converts them to rgb(). The old parser only read rgb()/rgba() with integer values, so in Chrome the
    // label chips' colours could not be read and no label was recognised - the mistake check found nothing.
    const COLOR_FN_RE = /(?:rgba?|hsla?|oklch|oklab|color)\([^()]*\)/gi;
    const __ptColourCache = new Map();
    function parseColourToRgba(str) {
        const s = String(str || "").trim().toLowerCase();
        if (!s || s === "none" || s === "transparent") return null;
        if (__ptColourCache.has(s)) return __ptColourCache.get(s);
        let out = null;
        const nums = (inner) => inner.replace(/[,/]/g, " ").trim().split(/\s+/).filter(Boolean);
        const num = (t, scale) => t.endsWith("%") ? parseFloat(t) / 100 * scale : parseFloat(t);
        const alpha = (t) => t == null ? 1 : (t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t));
        const toByte = (x) => Math.max(0, Math.min(255, Math.round(x)));
        const gamma = (x) => { const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055; return toByte(v * 255); };
        const oklabToRgb = (L, A, B) => {
            const l_ = L + 0.3963377774 * A + 0.2158037573 * B, m_ = L - 0.1055613458 * A - 0.0638541728 * B, s_ = L - 0.0894841775 * A - 1.2914855480 * B;
            const l = l_ * l_ * l_, m = m_ * m_ * m_, q = s_ * s_ * s_;
            return [gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q), gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q), gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * q)];
        };
        let m;
        if ((m = /^rgba?\(([^()]*)\)$/.exec(s))) {
            const t = nums(m[1]);
            if (t.length >= 3) out = [toByte(num(t[0], 255)), toByte(num(t[1], 255)), toByte(num(t[2], 255)), alpha(t[3])];
        } else if ((m = /^hsla?\(([^()]*)\)$/.exec(s))) {
            const t = nums(m[1]);
            if (t.length >= 3) {
                const h = ((parseFloat(t[0]) % 360) + 360) % 360 / 360, sat = parseFloat(t[1]) / 100, li = parseFloat(t[2]) / 100;
                const q2 = li < 0.5 ? li * (1 + sat) : li + sat - li * sat, p2 = 2 * li - q2;
                const hue = (tt) => { tt = (tt + 1) % 1; return tt < 1 / 6 ? p2 + (q2 - p2) * 6 * tt : tt < 1 / 2 ? q2 : tt < 2 / 3 ? p2 + (q2 - p2) * (2 / 3 - tt) * 6 : p2; };
                out = [toByte(hue(h + 1 / 3) * 255), toByte(hue(h) * 255), toByte(hue(h - 1 / 3) * 255), alpha(t[3])];
            }
        } else if ((m = /^oklch\(([^()]*)\)$/.exec(s))) {
            const t = nums(m[1]);
            if (t.length >= 3) {
                const L = t[0].endsWith("%") ? parseFloat(t[0]) / 100 : parseFloat(t[0]);
                const C = t[1].endsWith("%") ? parseFloat(t[1]) / 100 * 0.4 : parseFloat(t[1]);
                const H = (parseFloat(t[2]) || 0) * Math.PI / 180;
                out = [...oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), alpha(t[3])];
            }
        } else if ((m = /^oklab\(([^()]*)\)$/.exec(s))) {
            const t = nums(m[1]);
            if (t.length >= 3) {
                const L = t[0].endsWith("%") ? parseFloat(t[0]) / 100 : parseFloat(t[0]);
                const A = t[1].endsWith("%") ? parseFloat(t[1]) / 100 * 0.4 : parseFloat(t[1]);
                const B = t[2].endsWith("%") ? parseFloat(t[2]) / 100 * 0.4 : parseFloat(t[2]);
                out = [...oklabToRgb(L, A, B), alpha(t[3])];
            }
        } else if ((m = /^color\(\s*(srgb|srgb-linear|display-p3)\s+([^()]*)\)$/.exec(s))) {
            const t = nums(m[2]);
            if (t.length >= 3) {
                const v = t.slice(0, 3).map(x => num(x, 1));
                out = m[1] === "srgb-linear" ? [gamma(v[0]), gamma(v[1]), gamma(v[2]), alpha(t[3])]
                    : [toByte(v[0] * 255), toByte(v[1] * 255), toByte(v[2] * 255), alpha(t[3])];   // display-p3 ~ srgb is close enough here
            }
        } else if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
            let h = m[1];
            if (h.length <= 4) h = h.split("").map(x => x + x).join("");
            out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
        }
        // anything else (lab(), lch(), named colours): let the browser's canvas convert it to sRGB
        // (box-shadow / gradient strings: take the first colour function in them)
        if (!out && /\s/.test(s) && COLOR_FN_RE.test(s)) {
            COLOR_FN_RE.lastIndex = 0;
            const first = s.match(COLOR_FN_RE);
            if (first && first[0] !== s) { const r1 = parseColourToRgba(first[0]); __ptColourCache.set(s, r1); return r1; }
        }
        COLOR_FN_RE.lastIndex = 0;
        if (!out && !parseColourToRgba.__noCanvas && typeof document !== "undefined" && /^(?:lab|lch|[a-z]+)\b/.test(s) && !/^(?:currentcolor|inherit|initial|unset|revert)$/.test(s)) {
            try {
                const cv = parseColourToRgba.__cv || (parseColourToRgba.__cv = document.createElement("canvas"));
                cv.width = cv.height = 1;
                let g = null;
                try { g = cv.getContext && cv.getContext("2d"); } catch (e) { g = null; }
                if (!g) parseColourToRgba.__noCanvas = true;
                if (g) {
                    g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = s; g.fillRect(0, 0, 1, 1);
                    const d = g.getImageData(0, 0, 1, 1).data;
                    if (d && d[3] > 0) out = [d[0], d[1], d[2], d[3] / 255];
                }
            } catch (e) { parseColourToRgba.__noCanvas = true; }
        }
        if (out && out.some(x => Number.isNaN(x))) out = null;
        if (__ptColourCache.size > 2000) __ptColourCache.clear();
        __ptColourCache.set(s, out);
        return out;
    }
    function parseRgb(s) {
        const c = parseColourToRgba(s);
        if (!c) return null;
        const a = c[3];
        if (!(a > 0.02)) return null;
        const blend = (v) => Math.round(a * v + (1 - a) * 255);          // as seen on a white page
        return [blend(c[0]), blend(c[1]), blend(c[2])];
    }
    const isNeutral = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx - mn < 14 || mn > 248 || mx < 40; };
    const DEFAULT_LABEL_COLOURS = {
        "Account Number": [114, 46, 209], "Address": [229, 57, 53], "Business Name": [19, 194, 194], "Contact Number": [250, 140, 22],
        "Credentials": [255, 122, 69], "Date": [235, 47, 150], "Email Address": [56, 158, 13], "IP Address": [92, 219, 211],
        "Overscrubbed": [255, 227, 227], "Person Name": [22, 119, 255], "URL/Link": [250, 173, 20], "Person Username": [47, 84, 235],
        "Vehicle Number Plate": [160, 217, 17],
    };
    function learnPalette() {
        const now = Date.now();
        if (now - __ptPalette.t < 3000 && __ptPalette.list.length) return __ptPalette.list;
        const list = [];
        const seen = new Set();   // chip names on the page, whether or not their colour could be read
        try {
            const { leftPane, rightPane } = getPanes();
            const all = document.querySelectorAll("span, div, button, label, li, a");
            for (const el of all) {
                if (el.childElementCount > 3) continue;
                const txt = (el.textContent || "").trim();
                if (!LABEL_NAMES.includes(txt)) continue;
                if ((leftPane && leftPane.contains(el)) || (rightPane && rightPane.contains(el)) || el.closest("#pt-floating-bar")) continue;
                seen.add(txt);
                // the chip, its colour dot and its parent
                const parts = [el, el.parentElement, ...el.querySelectorAll("*")].filter(Boolean);
                for (const pEl of parts) {
                    const cs = getComputedStyle(pEl);
                    for (const v of [cs.backgroundColor, cs.borderTopColor, cs.color]) {
                        const rgb = parseRgb(v);
                        if (rgb && !isNeutral(rgb)) list.push({ name: txt, rgb });
                    }
                }
            }
        } catch (e) {}
        // (v11.3.0) Labels whose chip colour could not be read get the dashboard's known colours (measured on the live
        // page: Date 235/47/150, Overscrubbed 255/227/227, ...). Detection then never depends on reading every chip.
        const have = new Set(list.map(x => x.name));
        // (v11.4.0) ...but only for chips that are on the page (or when no chip was found at all): the new label set dropped
        // none of the old chips yet, and a built-in colour for a chip that is not there would invent a shared colour.
        for (const [name, rgb] of Object.entries(DEFAULT_LABEL_COLOURS)) if (!have.has(name) && (seen.size === 0 || seen.has(name))) list.push({ name, rgb, builtin: true });
        __ptPalette = { t: now, list, learned: have.size, seen };
        return list;
    }
    function matchPlatformPalette(els) {
        const pal = learnPalette();
        if (!pal.length || typeof getComputedStyle !== "function") return null;
        // Strongest (most saturated) colour of each label = its base colour; tints are that colour over white.
        const base = new Map();
        const sat = (c) => Math.max(...c) - Math.min(...c);
        for (const p of pal) { const b = base.get(p.name); if (!b || sat(p.rgb) > sat(b)) base.set(p.name, p.rgb); }
        return __matchColours(els, pal, base);
    }
    function __tintError(rgb, P) {
        // rgb should equal P drawn over white with ONE opacity a:  rgb[k] = 255 - a * (255 - P[k])  for every channel.
        const as = [];
        for (let k = 0; k < 3; k++) { const span = 255 - P[k]; if (span > 25) as.push((255 - rgb[k]) / span); }
        if (as.length < 2) return 1;
        const lo = Math.min(...as), hi = Math.max(...as);
        if (lo < 0.03 || hi > 1.08) return 1;
        // (v11.0.0) every channel must fit, including the ones near 255 - otherwise a very light colour with two
        // equal channels (Overscrubbed 255,227,227) "explained" any tint, e.g. Business Name's teal.
        const a = as.reduce((s, x) => s + x, 0) / as.length;
        for (let k = 0; k < 3; k++) if (Math.abs(rgb[k] - (255 - a * (255 - P[k]))) > 8) return 1;
        return hi - lo;
    }
    // (v11.3.6) Two labels with (almost) the same colour cannot be told apart by colour. Every label whose best match is within
    // TIE_MARGIN of the overall best is a candidate; the first one is still returned (old callers keep working) and the whole
    // list is left in __ptLastTie for detectAssignedCategory, which stores it in __ptAmbiguous (element -> labels).
    const TIE_MARGIN = 6;
    let __ptLastTie = null;
    const __ptAmbiguous = new WeakMap();
    function __bestColour(values, pal, base) {
        let best = null, bestScore = 1e9;
        const byName = new Map();   // label -> its best score over every colour of the element
        const note = (name, sc) => { const o = byName.get(name); if (o === undefined || sc < o) byName.set(name, sc); };
        for (const v of values) {
            const rgb = parseRgb(v);
            if (!rgb || isNeutral(rgb)) continue;
            for (const p of pal) { const d = Math.hypot(rgb[0] - p.rgb[0], rgb[1] - p.rgb[1], rgb[2] - p.rgb[2]); note(p.name, d); if (d < bestScore) { bestScore = d; best = p.name; } }
            for (const [name, P] of base) { const sc = __tintError(rgb, P) * 250; note(name, sc); if (sc < bestScore) { bestScore = sc; best = name; } }
        }
        __ptLastTie = null;
        if (!(bestScore <= 24)) return null;
        try {
            const cands = [];
            for (const [name, sc] of byName) if (sc <= 24 && sc <= bestScore + TIE_MARGIN) cands.push(name);
            if (cands.length > 1) __ptLastTie = cands.sort();   // sorted: the result does not depend on the order of the chips
        } catch (e) { __ptLastTie = null; }
        return best;
    }
    function __matchColours(els, pal, base) {
        const values = [];
        for (const e of els) {
            if (!e || e.nodeType !== 1 || (e.classList && e.classList.contains("pt-tag"))) continue;
            let cs; try { cs = getComputedStyle(e); } catch (x) { continue; }
            const colours = [cs.backgroundColor];
            // (v10.6.3) the live dashboard draws the underline as a linear-gradient background image
            for (const m of (cs.backgroundImage || "").match(COLOR_FN_RE) || []) colours.push(m);
            if (parseFloat(cs.borderBottomWidth) > 0) colours.push(cs.borderBottomColor);
            if (parseFloat(cs.borderTopWidth) > 0) colours.push(cs.borderTopColor);
            if (/underline/.test(cs.textDecorationLine || cs.textDecoration || "")) colours.push(cs.textDecorationColor);
            if (!e.hasAttribute("data-pt-wrong") && cs.boxShadow && cs.boxShadow !== "none") colours.push(cs.boxShadow);
            if (!e.hasAttribute("data-pt-wrong") && cs.outlineStyle && cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) colours.push(cs.outlineColor);
            for (const v of colours) values.push(v);
        }
        return __bestColour(values, pal, base);
    }

    function detectAssignedCategory(el) {
        if (!el || el.nodeType !== 1) return null;
        try { __ptAmbiguous.delete(el); } catch (e) {}   // (v11.3.6) set again below only when the colour is shared by several labels
        // Our own suggestion spans carry data-label / pt-* classes too. They must never be read as the
        // reviewer's label: a Person Name label placed around our "Overscrubbed" suggestion was read as
        // Overscrubbed, so the mistake was never shown.
        const isOwn = (x) => x.classList && (x.classList.contains("pt-tag") || x.id === "pt-floating-bar");
        if (isOwn(el)) return null;

        const parent = el.parentElement;
        const allElements = [el];
        if (parent && !isOwn(parent) && !/^(DIV|TABLE|TBODY|THEAD|TR|TD|TH|PRE|CODE|P|BODY|HTML)$/i.test(parent.tagName)) {
            allElements.push(parent);
        }

        if (el.children) {
            for (let i = 0; i < el.children.length; i++) {
                if (!isOwn(el.children[i])) allElements.push(el.children[i]);
            }
        }

        // Layer 1: Check explicit data attributes on elements
        for (const targetEl of allElements) {
            for (const attr of ["data-label", "data-category", "data-entity", "data-type", "data-annotation", "data-val", "data-name", "data-tag", "aria-label", "title"]) {
                const val = (targetEl.getAttribute(attr) || "").trim();
                if (val) {
                    const normVal = val.toLowerCase().replace(/[\-_]/g, ' ');
                    // (v10.5.4) exact name first, then the LONGEST contained name, then keywords - so that
                    // "Person Username" is not read as "Person Name" (or "Address" inside "Email Address").
                    const exact = CATEGORY_MAP.find(cat => normVal === cat.name.toLowerCase());
                    if (exact) return exact.name;
                    const contained = CATEGORY_MAP.filter(cat => normVal.includes(cat.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
                    if (contained) return contained.name;
                    for (const cat of CATEGORY_MAP) {
                        for (const kw of cat.keywords) {
                            if (kw.test(normVal)) return cat.name;
                        }
                    }
                }
            }
        }

        // Layer 2: Check CSS class names (ant-tag-*, pt-*, ann-*, etc.)
        for (const targetEl of allElements) {
            const cls = targetEl.className || "";
            if (typeof cls === "string") {
                for (const cat of CATEGORY_MAP) {
                    for (const rc of cat.classes) {
                        if (rc.test(cls)) return cat.name;
                    }
                }
            }
        }

        // Layer 3: Check child badge text
        for (const targetEl of allElements) {
            const tc = (targetEl.textContent || "").trim();
            if (targetEl !== el && tc.length > 0 && tc.length < 30) {
                for (const cat of CATEGORY_MAP) {
                    if (tc.toLowerCase() === cat.name.toLowerCase()) return cat.name;
                }
            }
        }

        // Layer 3B (v10.6.0): the platform's OWN palette, learned from the label chips at the top of the review
        // screen ("Account Number", "Overscrubbed", ...). A label drawn on the text uses its chip's colour as a
        // background, underline or border, so it is matched by colour distance - whatever the platform's markup.
        {
            __ptLastTie = null;
            const hit = matchPlatformPalette(allElements);
            if (hit) {
                try { if (__ptLastTie && __ptLastTie.length > 1 && __ptLastTie.includes(hit)) __ptAmbiguous.set(el, __ptLastTie.slice()); } catch (e) {}
                __ptLastTie = null;
                return hit;
            }
        }

        // Layer 4: Check computed & inline border / background colors (space-normalized)
        let computed = "";
        if (typeof window !== "undefined" && window.getComputedStyle) {
            try {
                for (const targetEl of allElements) {
                    const cs = window.getComputedStyle(targetEl);
                    computed += ` ${cs.borderColor || ''} ${cs.borderTopColor || ''} ${cs.borderBottomColor || ''} ${cs.borderLeftColor || ''} ${cs.borderRightColor || ''} ${cs.outlineColor || ''} ${cs.backgroundColor || ''} ${cs.color || ''} ${cs.boxShadow || ''} ${cs.textDecorationColor || ''} `;
                }
            } catch (e) {}
        }
        const fullStyles = `${el.getAttribute ? (el.getAttribute('style') || '') : ''} ${computed}`.toLowerCase().replace(/\s+/g, '');
        for (const cat of CATEGORY_MAP) {
            for (const c of cat.colors) {
                const normC = c.toLowerCase().replace(/\s+/g, '');
                if (fullStyles.includes(normC)) return cat.name;
            }
        }

        // Layer 5: Fallback keyword check across all attribute values
        let allAttrText = "";
        for (const targetEl of allElements) {
            if (targetEl.attributes) {
                for (let i = 0; i < targetEl.attributes.length; i++) {
                    const a = targetEl.attributes[i];
                    allAttrText += ` ${a.name}="${a.value}" `;
                }
            }
        }
        allAttrText = allAttrText.toLowerCase();
        for (const cat of CATEGORY_MAP) {
            for (const kw of cat.keywords) {
                if (kw.test(allAttrText)) return cat.name;
            }
        }

        return null;
    }

    // (v11.3.5) End of a link: trailing punctuation is not part of it, and a closing ) ] } is only dropped when it has no
    // opening partner inside the link - "https://en.wikipedia.org/wiki/Heat_(film)" keeps its bracket, "(see https://a.io/x)" loses it.
    function trimUrlEnd(s) {
        const count = (str, ch) => str.split(ch).length - 1;
        for (;;) {
            const before = s;
            s = s.replace(/[\s*_\-:#,.'"|!?;]+$/, "");
            const last = s.slice(-1);
            if (last === "(" || last === "[" || last === "{") s = s.slice(0, -1);
            else if (last === ")" && count(s, ")") > count(s, "(")) s = s.slice(0, -1);
            else if (last === "]" && count(s, "]") > count(s, "[")) s = s.slice(0, -1);
            else if (last === "}" && count(s, "}") > count(s, "{")) s = s.slice(0, -1);
            if (s === before) return s;
        }
    }

    function cleanWord(str) {
        if (!str) return "";
        let s = str.trim();
        // (v11.4.0) a phone number written with its area code in brackets keeps them: "(022) 2345 6789", "+1 (415) 732-0198"
        if (/^\(\+?\d{1,4}\)[ \t]?\d/.test(s) && phoneLabelFor(s)) return s;
        if (/^_[^_]+_$/.test(s) || /^\*[^\*]+\*$/.test(s)) {
            s = s.slice(1, -1);
        }
        if (/^https?:\/\//i.test(s)) {
            s = trimUrlEnd(s);
        } else {
            s = s.replace(/[\s\[\]\(\)\*_\-:#,\.\/'"\|]+$/g, "");
        }
        if (/^[\s\[\]\(\)\*\-:#,\.\/'"\|]*_[a-zA-Z0-9]/.test(s)) {
            s = s.replace(/^[\s\[\]\(\)\*\-:#,\.\/'"\|]*(_[a-zA-Z0-9].*)/, '$1');
            return s.trim();
        }
        return s.replace(/^[\s\[\]\(\)\*_\-:#,\.\/'"\|]+/g, "").trim();
    }

    function lineTokens(line) {
        const list = line.toLowerCase().match(/[a-z0-9]+/g) || [];
        return { list, set: new Set(list) };
    }
    function tokenSetSimilarity(a, b) {
        if (a.list.length === 0 || b.list.length === 0) return 0;
        let common = 0;
        for (const t of b.list) if (a.set.has(t)) common++;
        return (2 * common) / (a.list.length + b.list.length);
    }

    // Myers O(ND) diff on two arrays of strings. Returns the matched index pairs [[i, j], ...] in order,
    // or null when the arrays differ in more than maxD places (the caller then falls back to something cheaper).
    function myersMatches(a, b, maxD) {
        const n = a.length, m = b.length;
        const max = n + m;
        if (max === 0) return [];
        const limit = Math.min(maxD, max);
        const off = limit + 1;
        let v = new Int32Array(2 * limit + 3);
        const trace = [];          // trace[d] holds only the diagonals -d-1..d+1 (memory ~ D^2, not D x N)
        let found = -1;
        for (let d = 0; d <= limit && found < 0; d++) {
            trace.push(v.slice(off - d - 1, off + d + 2));
            for (let k = -d; k <= d; k += 2) {
                let x;
                if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
                else x = v[off + k - 1] + 1;
                let y = x - k;
                while (x < n && y < m && a[x] === b[y]) { x++; y++; }
                v[off + k] = x;
                if (x >= n && y >= m) { found = d; break; }
            }
        }
        if (found < 0) return null;
        const pairs = [];
        let x = n, y = m;
        for (let d = found; d > 0; d--) {
            const vp = trace[d];
            const o = d + 1;           // index of diagonal 0 inside this compact slice
            const k = x - y;
            const prevK = (k === -d || (k !== d && vp[o + k - 1] < vp[o + k + 1])) ? k + 1 : k - 1;
            const prevX = vp[o + prevK];
            const prevY = prevX - prevK;
            while (x > prevX && y > prevY) { x--; y--; pairs.push([x, y]); }
            x = prevX; y = prevY;
        }
        while (x > 0 && y > 0) { x--; y--; pairs.push([x, y]); }
        return pairs.reverse();
    }

    // 1. Anchor-based Smart Line Aligner: aligns lines via high-confidence anchors (sim >= 0.5 or exact)
    // and matches corresponding lines between anchors even when heavily scrubbed.
    // v10.4.2: the old version compared EVERY left line with EVERY right line (n x m similarity checks), which froze
    // the browser on long documents. Identical leading/trailing lines are now matched directly, long middles are
    // split on identical lines (Myers diff), and the similarity search only runs on small gaps.
    const ALIGN_DP_MAX_CELLS = 250000;
    function alignLinesLCS(leftLines, rightLines) {
        const lFiltered = leftLines.map(l => l.trim()).filter(l => l.length > 0);
        const rFiltered = rightLines.map(l => l.trim()).filter(l => l.length > 0);
        const n = lFiltered.length;
        const m = rFiltered.length;
        if (n === 0 && m === 0) return [];

        const lTok = new Array(n), rTok = new Array(m);
        const tokL = (i) => lTok[i] || (lTok[i] = lineTokens(lFiltered[i]));
        const tokR = (j) => rTok[j] || (rTok[j] = lineTokens(rFiltered[j]));
        const sim = (i, j) => (lFiltered[i] === rFiltered[j] ? 1 : tokenSetSimilarity(tokL(i), tokR(j)));

        // Similarity LCS inside one (small) region -> anchors with sim >= 0.5
        function dpAnchors(l0, l1, r0, r1) {
            const ln = l1 - l0, rn = r1 - r0;
            const w = rn + 1;
            const dp = new Int32Array((ln + 1) * w);
            for (let i = 1; i <= ln; i++) {
                for (let j = 1; j <= rn; j++) {
                    if (sim(l0 + i - 1, r0 + j - 1) >= 0.5) dp[i * w + j] = dp[(i - 1) * w + j - 1] + 1;
                    else dp[i * w + j] = Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
                }
            }
            const out = [];
            let i = ln, j = rn;
            while (i > 0 && j > 0) {
                if (sim(l0 + i - 1, r0 + j - 1) >= 0.5 && dp[i * w + j] === dp[(i - 1) * w + j - 1] + 1) {
                    out.push({ lIdx: l0 + i - 1, rIdx: r0 + j - 1 });
                    i--; j--;
                } else if (dp[(i - 1) * w + j] >= dp[i * w + j - 1]) i--;
                else j--;
            }
            return out.reverse();
        }

        function anchorsIn(l0, l1, r0, r1, depth) {
            const ln = l1 - l0, rn = r1 - r0;
            if (ln <= 0 || rn <= 0) return [];
            if (ln * rn <= ALIGN_DP_MAX_CELLS) return dpAnchors(l0, l1, r0, r1);
            if (depth > 1) return [];                       // no identical lines left: positional fallback
            const ms = myersMatches(lFiltered.slice(l0, l1), rFiltered.slice(r0, r1), 3000);
            if (!ms || ms.length === 0) return [];
            const out = [];
            let pl = l0, pr = r0;
            for (const [i, j] of ms) {
                const li = l0 + i, rj = r0 + j;
                out.push(...anchorsIn(pl, li, pr, rj, depth + 1));
                out.push({ lIdx: li, rIdx: rj });
                pl = li + 1; pr = rj + 1;
            }
            out.push(...anchorsIn(pl, l1, pr, r1, depth + 1));
            return out;
        }

        const anchors = [];
        let pre = 0;
        while (pre < n && pre < m && lFiltered[pre] === rFiltered[pre]) { anchors.push({ lIdx: pre, rIdx: pre }); pre++; }
        let suf = 0;
        while (suf < n - pre && suf < m - pre && lFiltered[n - 1 - suf] === rFiltered[m - 1 - suf]) suf++;
        anchors.push(...anchorsIn(pre, n - suf, pre, m - suf, 0));
        for (let k = suf - 1; k >= 0; k--) anchors.push({ lIdx: n - 1 - k, rIdx: m - 1 - k });

        // Step 2: Between anchors, align chunks positionally 1-to-1
        const pairs = [];
        let lastL = 0, lastR = 0;

        function addChunk(lStart, lEnd, rStart, rEnd) {
            const lCount = lEnd - lStart;
            const rCount = rEnd - rStart;
            const maxCount = Math.max(lCount, rCount);
            for (let k = 0; k < maxCount; k++) {
                const lLine = k < lCount ? lFiltered[lStart + k] : "";
                const rLine = k < rCount ? rFiltered[rStart + k] : "";
                const equal = lLine.length > 0 && lLine === rLine;
                pairs.push({ left: lLine, right: rLine, equal });
            }
        }

        for (const anc of anchors) {
            addChunk(lastL, anc.lIdx, lastR, anc.rIdx);
            pairs.push({
                left: lFiltered[anc.lIdx],
                right: rFiltered[anc.rIdx],
                equal: lFiltered[anc.lIdx] === rFiltered[anc.rIdx]
            });
            lastL = anc.lIdx + 1;
            lastR = anc.rIdx + 1;
        }
        addChunk(lastL, n, lastR, m);

        return pairs;
    }

    // 2. Global Document Token-Level LCS Diff Algorithm (handles cross-line PDF wraps & layout reflows)
    function diffTokensGlobalLCS(lTokens, rTokens) {
        const n = lTokens.length;
        const m = rTokens.length;
        if (n === 0 && m === 0) return [];
        if (n > 5000 || m > 5000) return [];

        const stride = m + 1;
        const lLower = new Array(n);
        for (let i = 0; i < n; i++) lLower[i] = lTokens[i].toLowerCase();
        const rLower = new Array(m);
        for (let j = 0; j < m; j++) rLower[j] = rTokens[j].toLowerCase();

        const dp = new Uint16Array((n + 1) * stride);

        for (let i = 1; i <= n; i++) {
            const lt = lLower[i - 1];
            const rowOffset = i * stride;
            const prevOffset = (i - 1) * stride;
            for (let j = 1; j <= m; j++) {
                if (lt === rLower[j - 1]) {
                    dp[rowOffset + j] = dp[prevOffset + j - 1] + 1;
                } else {
                    const up = dp[prevOffset + j];
                    const left = dp[rowOffset + j - 1];
                    dp[rowOffset + j] = up > left ? up : left;
                }
            }
        }

        let i = n, j = m;
        const diffs = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && lLower[i - 1] === rLower[j - 1]) {
                i--; j--;
            } else {
                let lBlock = [];
                let rBlock = [];
                while ((i > 0 || j > 0) && !(i > 0 && j > 0 && lLower[i - 1] === rLower[j - 1])) {
                    const rowOffset = i * stride;
                    const prevOffset = (i - 1) * stride;
                    if (j > 0 && (i === 0 || dp[rowOffset + j - 1] >= dp[prevOffset + j])) {
                        rBlock.unshift(rTokens[j - 1]);
                        j--;
                    } else if (i > 0) {
                        lBlock.unshift(lTokens[i - 1]);
                        i--;
                    }
                }
                const origClean = cleanWord(lBlock.join(" "));
                const chgClean = cleanWord(rBlock.join(" "));
                if (chgClean && chgClean.length >= 2) {
                    diffs.unshift({ original: origClean, changed: chgClean });
                }
            }
        }
        return diffs;
    }

    // 3. Line-level Token LCS Diff Algorithm
    // Fallback for very long, heavily edited token streams: walk both sides and, at each mismatch, find the
    // nearest point within `win` tokens where 3 tokens line up again. Linear time, small memory.
    function resyncMatches(a, b, win) {
        const out = [];
        let i = 0, j = 0;
        const n = a.length, m = b.length;
        const same3 = (x, y) => a[x] === b[y] && (x + 1 >= n || y + 1 >= m || a[x + 1] === b[y + 1]) && (x + 2 >= n || y + 2 >= m || a[x + 2] === b[y + 2]);
        while (i < n && j < m) {
            if (a[i] === b[j]) { out.push([i, j]); i++; j++; continue; }
            let found = false;
            for (let s = 1; s <= 2 * win && !found; s++) {
                for (let da = Math.max(0, s - win); da <= Math.min(s, win); da++) {
                    const db = s - da;
                    if (i + da < n && j + db < m && same3(i + da, j + db)) { i += da; j += db; found = true; break; }
                }
            }
            if (!found) { i++; j++; }
        }
        return out;
    }

    // Diff blocks from a list of matched index pairs (same output shape as the DP back-trace).
    function blocksFromMatches(lTokens, rTokens, matches, eq) {
        const diffs = [];
        let pi = 0, pj = 0;
        const flush = (i, j) => {
            if (i > pi || j > pj) {
                const origClean = cleanWord(lTokens.slice(pi, i).join(" "));
                const chgClean = cleanWord(rTokens.slice(pj, j).join(" "));
                if (chgClean && chgClean.length >= 2) diffs.push({ original: origClean, changed: chgClean });
            }
        };
        for (const [i, j] of matches) { flush(i, j); pi = i + 1; pj = j + 1; }
        flush(lTokens.length, rTokens.length);
        return diffs;
    }

    // Token diff for one aligned line pair. Very long lines (minified JSON, CSV dumps) used to allocate an
    // n x m table (hundreds of MB) and hang the tab; they now trim the common start/end and use Myers diff.
    const TOKEN_DP_MAX_CELLS = 4000000;
    function diffTokensLCS(lTokens, rTokens) {
        const n0 = lTokens.length, m0 = rTokens.length;
        if (n0 * m0 <= TOKEN_DP_MAX_CELLS && n0 < 65000 && m0 < 65000) return diffTokensLCS_dp(lTokens, rTokens);
        let p = 0;
        while (p < n0 && p < m0 && lTokens[p] === rTokens[p]) p++;
        let s = 0;
        while (s < n0 - p && s < m0 - p && lTokens[n0 - 1 - s] === rTokens[m0 - 1 - s]) s++;
        const lm = lTokens.slice(p, n0 - s), rm = rTokens.slice(p, m0 - s);
        if (lm.length * rm.length <= TOKEN_DP_MAX_CELLS && lm.length < 65000 && rm.length < 65000) return diffTokensLCS_dp(lm, rm);
        const ms = myersMatches(lm, rm, 2000) || resyncMatches(lm, rm, 60);
        return blocksFromMatches(lm, rm, ms);
    }

    function diffTokensLCS_dp(lTokens, rTokens) {
        const n = lTokens.length;
        const m = rTokens.length;
        if (n === 0 && m === 0) return [];

        const dp = [];
        for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (lTokens[i - 1] === rTokens[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        let i = n, j = m;
        const diffs = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && lTokens[i - 1] === rTokens[j - 1]) {
                i--; j--;
            } else {
                let lBlock = [];
                let rBlock = [];
                while ((i > 0 || j > 0) && !(i > 0 && j > 0 && lTokens[i - 1] === rTokens[j - 1])) {
                    if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                        rBlock.unshift(rTokens[j - 1]);
                        j--;
                    } else if (i > 0) {
                        lBlock.unshift(lTokens[i - 1]);
                        i--;
                    }
                }
                const origClean = cleanWord(lBlock.join(" "));
                const chgClean = cleanWord(rBlock.join(" "));
                if (chgClean && chgClean.length >= 2) {
                    diffs.unshift({ original: origClean, changed: chgClean });
                }
            }
        }
        return diffs;
    }

    const NON_ENTITY_TERMS = new Set([
        // Billing, financial, accounting, salary & units
        "cost", "costs", "bill", "billing", "usage", "discount", "discounts", "cud", "cuds", 
        "target", "expected", "budget", "spend", "rate", "rates", "pricing", "price", "amount", 
        "usd", "inr", "eur", "sgd", "cad", "tax", "vat", "fee", "consumption", "total", 
        "subtotal", "net", "gross", "monthly", "daily", "hourly", "quarterly", "annual", 
        "balance", "balanced", "margin", "ratio", "cut", "down", "scale",
        "lakh", "lakhs", "lpm", "crore", "crores", "thousand", "thousands", "million", "millions", "billion", "billions",
        "ctc", "salary", "salaries", "stipend", "bonus", "payout", "payroll", "allowance",
        "hardware", "software", "firmware", "design", "team", "teams", "requirement", "requirements",
        "outsourcing", "miscellaneous", "misc", "invoice", "original", "recipient", "cin", "pan", "gst", "irn",
        // Tech, infrastructure, cloud
        "compute", "storage", "ram", "cpu", "vcpu", "disk", "memory", "cloud", "sql", "db", 
        "database", "api", "server", "servers", "machine", "machines", "pool", "pools", 
        "spot", "cluster", "clusters", "node", "nodes", "worker", "workers", "vm", "vms", 
        "k8s", "kubernetes", "docker", "container", "containers", "network", "networking", 
        "monitoring", "logs", "logging", "backup", "bandwidth", "iops", "load", "balancer", 
        "instance", "instances", "service", "services", "system", "systems", "dev", 
        "gcp", "aws", "azure", "workload", "workloads", "replicas", "pod", "pods", 
        // Document structure, headers, UI terms
        "high", "level", "item", "items", "note", "notes", "unnamed", "overview", "summary", "summaries",
        "status", "statuses", "review", "report", "reports", "reported", "reporting", "reporter", "reporters",
        "details", "description", "descriptions", "index", "column", "columns", "row", "rows", 
        "table", "header", "headers", "reference", "annotation", "readonly", "read-only", "category", 
        "type", "types", "current", "previous", "next", "first", "last", "other", "others", "all", 
        "general", "standard", "custom", "basic", "advanced", "primary", "secondary", 
        "temp", "temporary", "nan", "null", "undefined", "true", "false", "na", "n/a", "no", "s.n", "sn",
        "bank", "name", "holder", "beneficiary", "patient", "policy",
        "make", "makes", "model", "models", "variant", "variants", "dealership", "zone", "lead", "assigned", "assignee", "assignees", "customer",
        "create", "creates", "created", "creating", "creation", "update", "updates", "updated", "updating",
        "priority", "priorities", "resolution", "resolutions", "resolve", "resolved", "resolving",
        "issue", "issues", "key", "keys", "id", "ids", "component", "components", "due", "duedate",
        "well", "likewise", "space", "another", "while", "this", "that", "these", "those", "being", 
        "here", "there", "then", "when", "where", "what", "which", "how", "why", "who", "whom", "whose", 
        "blue", "link", "sound", "mood", "air", "boot", "line", "point", "turning", "cake", "icing", "done",
        // Job titles, seniority levels - NEVER PII
        "senior", "junior", "mid", "lead", "staff", "principal", "head", "chief", "associate",
        "entry", "intern", "fresher", "experienced", "specialist", "expert", "consultant",
        // Career, role, department words - NEVER PII
        "developer", "engineer", "engineer", "architect", "designer", "analyst", "manager",
        "engineering", "development", "architecture", "management", "administration",
        "fullstack", "full-stack", "frontend", "back-end", "backend", "devops", "sre",
        "stack", "full", "mobile", "web", "embedded", "cloud", "data", "ml", "ai",
        "roles", "role", "position", "positions", "department", "departments", "division",
        "tech", "technical", "technology", "technologies",
        // Resume / CV / document section words - NEVER PII
        "scholarship", "education", "university", "college", "degree", "diploma", "certification",
        "experience", "experiences", "skill", "skills", "responsibilities", "responsibility",
        "projects", "project", "achievements", "achievement", "accomplishments",
        "present", "current", "previous", "former", "from", "to", "since",
        "bachelor", "master", "phd", "mtech", "btech", "mba", "bca", "mca", "bsc", "msc",
        // Common English action/descriptor words that appear in documents - NEVER PII
        "support", "supporting", "supported", "implement", "implementation", "implementing",
        "develop", "developing", "developed", "build", "building", "built",
        "manage", "managing", "managed", "lead", "leading", "led",
        "legacy", "scratch", "scale", "scalable", "maintain", "maintenance",
        "integrate", "integration", "deploy", "deployment", "release", "releases",
        "test", "testing", "tests", "debug", "debugging", "fix", "fixes", "fixed",
        "feature", "features", "module", "modules", "function", "functions", "class", "classes",
        "included", "including", "include", "excluded", "excluding", "exclude",
        "required", "requiring", "require", "provided", "providing", "provide",
        "performance", "security", "reliability", "availability", "scalability",
        "responsible", "responsibilities", "ownership", "collaboration", "communication"
    ]);


    // ------------------------------------------------------------------
    // Vocabulary for telling ordinary words from proper nouns (v10.4.2).
    //  - COMMON_WORDS: ~15,000 frequent English words (proper names removed). A capitalised word that is NOT
    //    in this list ("Furkan", "Roni", "Joaquim") is treated as a name/brand; one that IS ("Chance",
    //    "Kickoff", "Cricket") is an ordinary word, so replacing it is Overscrubbed.
    //  - PLACES / CALENDAR_WORDS: countries, states, cities, months and weekdays are never Person Names.
    // ------------------------------------------------------------------
    const COMMON_WORDS = new Set("aaa aap aba abandon abandoned abandoning abandonment abbas abbey abbot abbott abbreviated abbreviation abc abd abdomen abdominal abducted abduction abdul abdullah abi abide abiding abigail abilities ability able abnormal abnormalities aboard abode abolish abolished abolition abomination aboriginal abort aborted abortion abortions abound about above abrams abrasive abroad abrupt abruptly abs absence absent absentee absolute absolutely absorb absorbed absorbing absorbs absorption abstinence abstract abstraction absurd absurdity abt abu abuja abundance abundant abuse abused abuser abusers abuses abusing abusive abyss aca academia academic academically academics academies academy acc accelerate accelerated accelerating acceleration accelerator accent accents accept acceptable acceptance accepted accepting accepts access accessed accessibility accessible accessing accession accessories accessory accident accidental accidentally accidents acclaim acclaimed accolades accommodate accommodated accommodating accommodation accommodations accompanied accompanies accompaniment accompany accompanying accomplice accomplish accomplished accomplishing accomplishment accomplishments accord accordance according accordingly accords account accountability accountable accountant accountants accounted accounting accounts accreditation accredited accrued accumulate accumulated accumulating accumulation accuracy accurate accurately accusation accusations accuse accused accuses accusing accustomed ace aces acetate ache aches achievable achieve achieved achievement achievements achieves achieving achilles aching acid acidic acidity acids acknowledge acknowledged acknowledgement acknowledges acknowledging acl aclu acm acne acoustic acquaintance acquaintances acquainted acquire acquired acquires acquiring acquisition acquisitions acquitted acre acres acronym across acrylic acs act acted actin acting action actions activate activated activates activating activation active actively activism activist activists activities activity actor actors actress actresses actual actually acute acutely adamant adams adapt adaptation adaptations adapted adapter adapting adaptive add added addict addicted addiction addictive addicts adding addison addition additional additionally additions additive additives address addressed addresses addressing adds adele adept adequate adequately adhd adhere adherence adherents adhering adhesion adhesive adjacent adjective adjectives adjoining adjourned adjunct adjust adjustable adjusted adjusting adjustment adjustments adler adm admin administer administered administering administration administrations administrative administrator administrators admirable admiral admiralty admiration admire admired admirer admirers admiring admission admissions admit admits admitted admittedly admitting adnan ado adolescence adolescent adolescents adolf adopt adopted adopting adoption adoptive adopts adorable adore adored adorned adrenaline ads adult adultery adulthood adults advance advanced advancement advances advancing advantage advantageous advantages adventure adventurer adventurers adventures adventurous adversaries adversary adverse adversely adversity advert advertise advertised advertisement advertisements advertiser advertisers advertising adverts advice advisable advise advised adviser advisers advises advising advisor advisors advisory advocacy advocate advocated advocates advocating aerial aero aerobic aerodynamic aeroplane aerospace aesthetic aesthetically aesthetics afar afc affair affairs affect affected affecting affection affectionate affects affidavit affiliate affiliated affiliates affiliation affiliations affinity affirm affirmation affirmative affirmed affirming affleck afflicted affluent afford affordability affordable afforded afghanistan afl afloat aforementioned afp afraid africa africans afro aft after afterlife aftermath afternoon afternoons afterward afterwards again against age aged ageing agencies agency agenda agendas agent agents ages aggravated aggregate aggregation aggression aggressive aggressively agile agility aging agitated agitation ago agony agrarian agree agreeable agreed agreeing agreement agreements agrees agricultural agriculture aha ahead ahem ahh ahhh ahmad aid aidan aide aided aiding aids ailments aim aimed aiming aims ain aint air airborne airbus aircraft aired aires airfield airing airline airlines airplane airplanes airport airports airs airspace airstrikes airway airways airy aisle aisles ajax aka akbar akin akira akron ala alan alarm alarmed alarming alarms alas alba albeit album albums albuquerque alchemy alcohol alcoholic alcoholics alcoholism alden alderman aldo ale alec alert alerted alerts alessandro alexa alexandria alexei alfie alfonso alfredo algae algebra algebraic algeria algorithm algorithms ali alias alien alienated alienation aliens align aligned alignment alike alison alistair alive alkaline all allan allegation allegations allege alleged allegedly alleges allegiance alleging allergic allergies allergy alleviate alley alliance alliances allied allies alligator allison allocate allocated allocation allotment allotted allow allowance allowances allowed allowing allows alloy alloys allure ally alma almighty almond almonds almost alone along alongside alot aloud alpha alphabet alphabetical alpine alps already alright als also alt altar alter alteration alterations altered altering alternate alternately alternating alternative alternatively alternatives although altitude altitudes alto altogether alton alum aluminium aluminum alumni alvarez always alyssa ama amassed amateur amateurs amaze amazed amazing amazingly ambassador ambassadors amber ambient ambiguity ambiguous ambition ambitions ambitious ambrose ambulance ambush ambushed amc amd amen amend amended amendment amendments amends amenities americans americas ames amherst ami amid amidst amin amino amir ammo ammonia ammunition amnesia amnesty among amongst amor amount amounted amounts amp ample amplified amplifier amplifiers amplify amplitude amps amsterdam amused amusement amusing amy ana anaheim anal analog analogous analogue analogy analyse analysed analyses analysing analysis analyst analysts analytic analytical analytics analyze analyzed analyzes analyzing anarchist anarchists anarchy anatomical anatomy anc ancestor ancestors ancestral ancestry anchor anchorage anchored anchors ancient and anders andersen andes andrei andres andrews android anecdotal anecdote anecdotes anemia anesthesia anew ang angel angeles angelic angels anger angered angle angled anglo angrily angry angst anguish angular ani animal animals animate animated animation animations anime animosity ankara ankle ankles ann anna annals annapolis annex annexation annexed annihilation anniversary annotated announce announced announcement announcements announcer announcers announces announcing annoy annoyance annoyed annoying annoys annual annually annuity annum anomalies anomaly anon anonymity anonymous anonymously anorexia another ans answer answered answering answers ant antagonist antarctic antarctica ante antenna antennas anterior anthem anthology anthrax anthropologist anthropology anti antibiotic antibiotics antibodies antibody anticipate anticipated anticipating anticipation antics antidepressants antidote antifa antigen antique antiques antiquities antiquity antisemitism antisocial antitrust antoine ants anus anwar anxieties anxiety anxious any anybody anyhow anymore anyone anything anytime anyway anyways anywhere aol apa apache apart apartheid apartment apartments apathy apc ape aperture apes apex api apiece apocalypse apocalyptic apologies apologise apologize apologized apologizes apologizing apology apostle apostles apostolic app appalled appalling apparatus apparel apparent apparently appeal appealed appealing appeals appear appearance appearances appeared appearing appears appease appellate appendix appetite applaud applauded applause apples appliance appliances applicable applicant applicants application applications applied applies apply applying appoint appointed appointing appointment appointments appoints appraisal appreciate appreciated appreciates appreciating appreciation appreciative apprehended apprentice apprentices apprenticeship approach approached approaches approaching appropriate appropriated appropriately appropriation appropriations approval approvals approve approved approves approving approx approximate approximately approximation apps apr apron apt aptitude aqua aquarium aquatic aqueous ara arabia arabs arbitrarily arbitrary arbitration arbor arc arcade arch archaeological archaeologists archaeology archaic archbishop arched archer archers archery arches archipelago architect architects architectural architecture archival archive archived archives arcs arctic ardent arduous are area areas arena arenas arent argentine arguably argue argued argues arguing argument arguments ari aria arid ariel arise arisen arises arising aristocracy aristocratic aristotle arithmetic ark arlington arm armchair armed armenia armenians armies arming armistice armor armored armory armour armoured arms armstrong army aroma aromatic arose around aroused arrange arranged arrangement arrangements arranging array arrays arrest arrested arresting arrests arrival arrivals arrive arrived arrives arriving arrogance arrogant arrow arrows ars arse arsenal arsenic arson art artefacts arterial arteries artery arthritis article articles articulate articulated artifact artifacts artificial artificially artillery artisan artisans artist artistic artists arts artwork artworks asap asbestos ascend ascended ascending ascension ascent ascertain asean ash ashamed ashes ashore ashton asia asians aside ask asked asking asks asleep asparagus aspect aspects aspen asphalt aspiration aspirations aspire aspirin aspiring ass assad assange assassin assassinate assassinated assassination assassins assault assaulted assaulting assaults assay assemble assembled assemblies assembling assembly assert asserted asserting assertion assertions assertive asserts asses assess assessed assessing assessment assessments asset assets asshole assholes assign assigned assigning assignment assignments assigns assimilation assist assistance assistant assistants assisted assisting assists associate associated associates associating association associations assorted assortment assume assumed assumes assuming assumption assumptions assurance assurances assure assured assures asteroid asteroids asthma aston astonished astonishing astounding astral astray astro astrology astronaut astronauts astronomer astronomers astronomical astronomy astros aswell asylum asymmetric ate atheism atheist atheists athlete athletes athletic athletics atkins atkinson atl atlantic atlantis atlas atleast atm atmosphere atmospheric atom atomic atoms atop atp atrocious atrocities att attach attached attaching attachment attachments attack attacked attacker attackers attacking attacks attain attained attaining attainment attempt attempted attempting attempts attend attendance attendant attendants attended attendees attending attends attention attentive attest attested attic attire attitude attitudes attorney attorneys attract attracted attracting attraction attractions attractive attractiveness attracts attributable attribute attributed attributes attribution attrition auburn auckland auction auctioneer auctions aud audacity audi audible audience audiences audio audit audited auditing audition auditions auditor auditorium auditors auditory audits aug augment augmented august augustine aunt auntie aunts aunty aura aurora auschwitz auspices austen austerity australians austria authentic authentication authenticity author authored authorised authoritarian authoritative authorities authority authorization authorize authorized authors authorship autism autistic auto autobiographical autobiography autograph autoimmune automated automatic automatically automation automobile automobiles automotive autonomous autonomy autopilot autopsy autumn aux auxiliary ava avail availability available avalanche avalon avant avatar ave avenge avengers avenue avenues average averaged averages averaging aversion avert avg avi avian aviation avid aviv avocado avoid avoidance avoided avoiding avoids avon await awaited awaiting awaits awake awaken awakened awakening awakens award awarded awarding awards aware awareness away awe awesome awful awfully awhile awkward awkwardly awoke aws aww axe axes axial axis axle aye azerbaijan aziz azure baba babe babes babies baby babysitter babysitting bach bachelor bachelorette bachelors back backbone backdrop backed backers background backgrounds backing backlash backlog backpack backs backseat backside backstage backstory backup backward backwards backyard bacon bacteria bacterial bad badass baden badge badger badgers badges badly badminton bae baffled baffling bag bagel baggage bagged baggy baghdad bags bahamas bahrain bai bail bailed bailey bailout bain baird bait bake baked baker bakers bakery baking bal balance balanced balances balancing balcony bald bale balfour bali balkans ball ballad ballads ballard ballast ballet ballistic balloon balloons ballot ballots ballpark ballroom balls balm bam bama bamboo ban banana bananas band bandage banded bandit bandits bands bandwagon bandwidth bane bang bangalore banged banging bangkok bangladesh bangor bangs banished banjo bank banker bankers banking bankrupt bankruptcy banks banned banner banners banning banquet bans banter bao baptism baptized bar barack barb barbarian barbarians barbaric barbecue barbed barber barbie barca barcelona barclay barclays bard bare barefoot barely bargain bargaining bargains barge bark barker barking barkley barley barlow barn barnard barnes barnett barney barns barometer baron baroness barons baroque barr barracks barrage barred barrel barrels barren barrier barriers barring barrister barron barrow barry bars bartender barton bas basal base baseball based basel baseline baseman basement bases bash bashing basic basically basics basil basin basing basins basis basket basketball baskets basque bass bassist bastard bastards bastion bat batch batches bates bath bathe bathed bathing bathroom bathrooms baths bathtub batman baton bats batsman battalion battalions batted batter battered batteries battery batting battle battled battlefield battles battleship battling bauer bavaria baxter bay bayer bayern baylor bayonet bayou bays bazaar bbc bbq bbw bcs bdsm beach beaches beacon bead beads beak beale beam beams bean beans bear beard bearded beards bearer bearing bearings bears beast beasts beat beaten beating beatles beats beatty beau beaumont beauties beautiful beautifully beauty beaver became because beck becker beckett beckham become becomes becoming bed bedding bedrock bedroom bedrooms beds bedside bedtime bee beech beef been beep beer beers bees beethoven beetle beetles before beforehand beg began beggar beggars begged begging begin beginner beginners beginning beginnings begins begs begun behalf behave behaved behaves behaving behavior behavioral behaviors behaviour behavioural behaviours beheaded behind behold beige beijing bein being beings beirut bel belarus belfast belgium belief beliefs believable believe believed believer believers believes believing belize bell bellamy belle bellevue bells belly belmont belong belonged belonging belongings belongs beloved below belt belts ben bench benches benchmark benchmarks bend bender bending bends beneath benedict beneficial beneficiaries beneficiary benefit benefited benefiting benefits benevolent bengals benghazi benign bennett benny bent bentley benz berg bergen berger berkeley berlin berman bernardino bernardo bernstein berries berry berth beside besides besieged bespoke best bestowed bestseller bestselling bet beta beth bethany betray betrayal betrayed betraying bets bette better betting betty between beverage beverages beware bey beyonce beyond bhai bias biased biases bibliography bicycle bicycles bid bidder bidders bidding biden bids bieber biennial big bigfoot bigger biggest biggie bigot bigotry bihar bike biker bikers bikes biking bikini bilateral bile bilingual bill billboard billboards billed billing billings billion billionaire billionaires billions bills billy bin binary bind binder binding binds bing binge bingo bins bio biochemical biochemistry biodiversity biographical biographies biography biological biologically biologist biologists biology biomass biomedical biopsy bios biotech biotechnology bipartisan bipolar birch bird birdie birds birth birthday birthdays birthplace births bis biscuit biscuits bisexual bishop bishops bison bit bitch bitches bitching bitcoin bitcoins bite bites biting bits bitten bitter bitterly bitterness bittersweet biz bizarre bjp black blackberry blackburn blacked blackhawks blackjack blacklist blackmail blackout blackpool blacks blacksmith blackwell bladder blade blades blah blair blake blame blamed blames blaming blanc blanchard blanche bland blank blanket blankets blanks blasphemy blast blasted blasting blasts blatant blatantly blaze blazer blazers blazing bleach bleak bled bleed bleeding blend blended blender blending blends bless blessed blessing blessings blew blight blind blinded blinding blindly blindness blinds bling blink blinking bliss blitz blizzard blm bloated bloc block blockade blockbuster blockchain blocked blocker blockers blocking blocks blog blogger bloggers blogging blogs bloke blond blonde blood blooded bloodshed bloodstream bloody bloom bloomberg blooming bloomington blooms blossom blossoms blouse blow blower blowing blowjob blown blowout blows blu blue blueberry bluegrass blueprint blueprints blues bluetooth bluff blunder blunt blur blurred blurry blush blvd bmi bmw boa boar board boarded boarding boards boardwalk boast boasted boasting boasts boat boating boats bob bobby boca bodied bodies bodily body bodybuilding bodyguard bodyguards boeing bog bogus boi boil boiled boiler boilers boiling boils boise boko bold boldly bolivia bollywood bolster bolt bolted bolton bolts bom bomb bombarded bombardment bombed bomber bombers bombing bombings bombs bombshell bon bona bond bondage bonded bonding bonds bone boner bones bonfire bong bonnet bono bonus bonuses bony boo boob boobs boogie booing book booked booker booking bookings booklet books bookstore boom boomer boomers booming boon boost boosted booster boosting boosts boot booted booth booths boots booty booze bop border bordered bordering borderline borders bore bored boredom borg boring born borne borough boroughs borrow borrowed borrower borrowers borrowing bosch bosnia boss bosses boston bot botanical botany botched both bother bothered bothering bothers bots botswana bottle bottled bottles bottling bottom bottoms bought boulder boulders boulevard bounce bounced bounces bouncing bouncy bound boundaries boundary bounded bounds bounty bouquet bourbon bourgeois bourne bournemouth bout boutique bouts bow bowed bowel bowen bowie bowing bowl bowled bowler bowlers bowling bowls bowman bows box boxed boxer boxers boxes boxing boy boycott boyfriend boyfriends boyle boys bra brace bracelet bracelets braces bracket brackets brad brady brag bragg bragging braid brain brainer brains brainwashed brake brakes braking bran branch branched branches branching brand branded branding brands brandt brandy branson bras brasil brass brat braun brave bravely bravery braves bravo brawl bray brazil breach breached breaches bread breadth break breakaway breakdown breakdowns breaker breakers breakfast breaking breakout breaks breakthrough breakup breast breastfeeding breasts breath breathe breathed breathes breathing breathless breaths breathtaking bred breed breeder breeders breeding breeds breeze brennan brent bret brethren brett brew brewed brewer breweries brewers brewery brewing brewster brexit bribe bribery bribes brick bricks bridal bride brides bridge bridges bridgewater bridging brief briefed briefing briefings briefly briefs brig brigade brigades brigadier brigham bright brighten brighter brightest brightly brightness brighton brilliance brilliant brilliantly bring bringing brings brink brisbane brisk brit britney britons brits britt brittle bro broad broadband broadcast broadcaster broadcasters broadcasting broadcasts broaden broader broadly broadway broccoli brochure brock brody broke broken broker brokerage brokers broncos bronze brood brook brooklyn brooks broom bros broth brothel brother brotherhood brothers brought brow brown browne brownie brownies browning brownish browns brows browse browser browsers browsing bruh bruins bruise bruised bruises bruising brunch brunei brunette brunswick brush brushed brushes brushing brutal brutality brutally brute bryant bst btc bts btw bubba bubble bubbles bubbling bubbly bucharest buck bucket buckets buckingham buckle buckley bucks bud budapest buddhists buddies budding buddy budge budget budgetary budgeting budgets buds buenos buff buffalo buffer buffet buffett buffy bug bugging buggy bugs buick build builder builders building buildings builds buildup built bulb bulbs bulgaria bulge bulk bulky bull bulldog bulldogs bullet bulletin bulletproof bullets bullied bullies bullion bullish bullock bullpen bulls bullshit bully bullying bum bummed bummer bump bumped bumper bumping bumps bumpy bums bun bunch bundesliga bundle bundled bundles bundy bungalow bunk bunker bunnies bunny buns burbank burden burdened burdens bureau bureaucracy bureaucratic bureaucrats burger burgers burgess burglar burglary burial buried burke burkina burma burn burned burner burnett burnham burning burnley burnout burns burnt burr burrito burrows burst bursting bursts burt burton bury burying bus busch buses bush bushes busiest business businesses businessman businessmen bust busted buster busting bustling busts busy but butch butcher butler butt butter butterflies butterfly buttocks button buttons butts buy buyer buyers buying buyout buys buzz buzzer buzzfeed buzzing bye bypass byrd byrne byte bytes byu cab cabaret cabbage cabin cabinet cabinets cabins cable cables cabs cache cad cadet cadets cadillac cafe cafes cafeteria caffeine cage cages cain cairns caitlin cake cakes cal calais calamity calcium calculate calculated calculating calculation calculations calculator calculus calcutta caldwell calendar calendars calf calgary calhoun cali caliber calibrated calibration calibre calif caliphate call callahan called caller calling calls calm calmed calming calmly calorie calories calves cam cambodia cambridge camden came camel camels cameo camera cameraman cameras cameron cameroon camilla camille camo camouflage camp campaign campaigned campaigning campaigns campbell camped camper campers camping camps campus campuses cams can canada canadians canal canals canary cancel canceled canceling cancellation cancelled cancelling cancer cancerous cancers candid candidacy candidate candidates candies candle candles candy cane canine canned cannes canning cannon cannons cannot canoe canon canonical canopy cans cant canteen canton cantor canucks canvas canyon cao cap capabilities capability capable capacities capacitor capacity cape capita capital capitalism capitalist capitalists capitalize capitalized capitals capped caps capsule capsules capt captain captains caption captions captivating captive captives captivity capture captured captures capturing car caracas caramel carat caravan carb carbohydrate carbohydrates carbon carbonate carbs carcass carcinoma card cardboard cardiac cardiff cardigan cardinal cardinals cardio cardiovascular cards care cared career careers carefree careful carefully caregivers careless carers cares caretaker carey cargo caricature caring carl carla carlson carlton carly carlyle carmichael carnage carney carnival carol caroline carousel carp carpenter carpet carpets carr carriage carriages carrick carried carrier carriers carries carrington carroll carrot carrots carry carrying cars carson cart carte cartel cartels carter cartilage carton cartoon cartoons cartridge cartridges carts cartwright carve carved carver carving cas casa cascade case cases cash cashier casing casino casinos casket cass cassette cassidy cassie cast caste castillo casting castle castles castor castro casts casual casually casualties casualty cat catalog catalogue catalonia catalyst catalytic catastrophe catastrophic catch catcher catches catching catchy categories categorized category cater catering caterpillar catfish cathedral catheter catholic catholicism catholics cats cattle caucasus caucus caught cauliflower causal cause caused causes causing caution cautious cautiously cavalier cavaliers cavalry cave caveat cavendish caves caviar cavities cavity cavs cayman cba cbc cbd cbi cbs ccc ccp cctv cdc cds cease ceased ceasefire ceases cebu cedar ceiling ceilings celebrate celebrated celebrates celebrating celebration celebrations celebrities celebrity celery celeste celestial celine cell cellar cello cellphone cells cellular celtics cement cemented cemeteries cemetery cena censor censored censorship census cent centenary centennial center centered centers centimeters central centralized centrally centre centred centres centric centrist cents centuries century ceo ceos ceramic ceramics cereal cereals cerebral ceremonial ceremonies ceremony cert certain certainly certainty certificate certificates certification certifications certified cervical ces cesar cessation cfa cfo cgi cha chad chadwick chai chain chained chains chainsaw chair chaired chairman chairmen chairperson chairs chakra chalk challenge challenged challenger challengers challenges challenging chalmers chamber chamberlain chambers champ champagne champion champions championship championships champs chan chance chancellor chances chandelier chandler chandra chanel chang change changed changer changes changing channel channels channing chant chanting chants chaos chaotic chap chapel chaplain chaplin chapman chapter chapters char character characterised characteristic characteristics characterization characterize characterized characters charcoal charge charged charger chargers charges charging chariot charisma charismatic charitable charities charity charlottesville charlton charm charmed charming charms chart charter chartered charters charting charts chase chased chaser chases chasing chassis chastity chat chateau chatham chats chatted chatter chatting chauffeur chavez che cheap cheaper cheapest cheaply cheat cheated cheater cheating cheats check checked checking checklist checkout checkpoint checkpoints checks cheddar cheek cheeks cheeky cheer cheered cheerful cheering cheerleader cheerleaders cheerleading cheers cheese cheesecake cheeses cheesy cheetah chef chefs chelsea chem chemical chemically chemicals chemist chemistry chemists chemo chemotherapy cheng chennai cheque cher cherish cherished cherries cherry cheryl chess chest chester chestnut chests chevrolet chevron chevy chew chewed chewing chi chiang chic chicago chick chicken chickens chicks chico chief chiefly chiefs child childbirth childcare childhood childish children childs chile chili chill chilled chilli chilling chills chilly chime chimney chin china ching chip chipotle chipped chipping chips chloride chlorine cho chocolate chocolates choi choice choices choir choke choked choking cholera cholesterol chong choo choose chooses choosing chop chopped chopper chopping chops choral chord chords chore choreographer choreography chores chorus chose chosen chow christchurch christensen christi christians christy chrome chromium chromosome chromosomes chronic chronicle chronicles chronological chronology chrysler chu chubby chuck chuckle chun chung chunk chunks chunky church churches churchill chute cia cicero cider cigar cigarette cigarettes cigars cinema cinemas cinematic cinematography cinnamon cio cir circa circle circled circles circling circuit circuits circular circulate circulated circulating circulation circumcision circumference circumstance circumstances circumstantial circumvent circus cis citadel citation citations cite cited cites cities citing citizen citizens citizenship citrus city civ civic civil civilian civilians civilisation civilization civilizations civilized clad claim claimant claimants claimed claiming claims clair clam clamp clams clan clandestine clans clap clapping clarification clarified clarify clarifying clarity clark clarke clarkson clash clashes class classed classes classic classical classics classification classifications classified classify classmate classmates classroom classrooms classy claus clause clauses claw claws clay clean cleaned cleaner cleaners cleaning cleanliness cleans cleanse cleansing cleanup clear clearance cleared clearer clearing clearly clears cleavage clegg clement clemson clergy clergyman cleric clerical clerk clerks cleveland clever cleverly cliche click clicked clicking clicks client clientele clients cliff cliffs clifton climate climates climatic climax climb climbed climber climbers climbing climbs clinch clinched cling clinging clinic clinical clinically clinicians clinics clint clintons clip clipped clippers clipping clips clique clive cloak clock clocked clocks clockwise clockwork clogged clone clones cloning close closed closely closeness closer closes closest closet closing closure closures clot cloth clothed clothes clothing cloud clouds cloudy clout clover clown clowns club clubhouse clubs clue clueless clues clumsy cluster clusters clutch clutches clutching clutter cms cnbc cnn coa coach coached coachella coaches coaching coal coalition coarse coast coastal coaster coasters coastline coasts coat coated coates coating coatings coats cobalt cobb cobra coca cocaine cochran cock cockpit cockroach cocks cocktail cocktails cocky coco cocoa coconut cod code coded codes codex coding cody coe coefficient coefficients coercion coffee coffin cognition cognitive coherent cohesion cohesive cohort coil coils coin coincide coincided coincidence coincidentally coincides coined coins coke col cola colbert colby colchester cold colder coldest cole coleman coles coli colin coliseum collaborate collaborated collaborating collaboration collaborations collaborative collaborator collaborators collage collagen collapse collapsed collapses collapsing collar collars collateral colleague colleagues collect collected collectible collecting collection collections collective collectively collector collectors collects colleen college colleges collegiate collide collided collier collingwood collins collision collisions collusion colo colombia colombo colon colonel colonial colonialism colonies colonists colonization colony color colorado colored colorful coloring colors colossal colour coloured colourful colouring colours colt colton colts columbus column columnist columns com coma comb combat combatants combating combination combinations combine combined combines combining combo combs combustion comcast come comeback comedian comedians comedic comedies comedy comes comet comets comey comfort comfortable comfortably comforting comforts comfy comic comical comics comin coming comm comma command commandant commanded commander commanders commanding commandment commandments commando commands commemorate commemorating commemoration commemorative commence commenced commencement commencing commend commended comment commentaries commentary commentator commentators commented commenting comments commerce commercial commercially commercials commission commissioned commissioner commissioners commissioning commissions commit commitment commitments commits committed committee committees committing commodities commodity commodore common commonly commonplace commons commonwealth commotion communal commune communicate communicated communicates communicating communication communications communion communism communist communists communities community commute commuter commuters commuting como comp compact companies companion companions companionship company comparable comparative comparatively compare compared compares comparing comparison comparisons compartment compartments compass compassion compassionate compatibility compatible compel compelled compelling compensate compensated compensation compete competed competence competency competent competes competing competition competitions competitive competitiveness competitor competitors compilation compile compiled compiler compiling complacent complain complained complaining complains complaint complaints complement complementary complete completed completely completeness completes completing completion complex complexes complexion complexities complexity compliance compliant complicate complicated complication complications complicit complied compliment complimentary complimented compliments comply complying component components compose composed composer composers composing composite composites composition compositions compost composure compound compounded compounds comprehend comprehension comprehensive compressed compression compressor comprise comprised comprises comprising compromise compromised compromises compromising compton compulsive compulsory computation computational compute computed computer computerized computers computing comrade comrades con conan conceal concealed concede conceded conceding conceivable conceive conceived concentrate concentrated concentrates concentrating concentration concentrations concept conception concepts conceptual concern concerned concerning concerns concert concerted concerto concerts concession concessions concierge concise conclude concluded concludes concluding conclusion conclusions conclusive concord concordia concrete concur concurrent concurrently concussion condemn condemnation condemned condemning condemns condensed condition conditional conditioned conditioner conditioning conditions condo condolences condom condoms condone conducive conduct conducted conducting conductivity conductor conductors conducts conduit cone cones confederacy confederate confederation confer conference conferences conferred confess confessed confession confessions confidence confident confidential confidentiality confidently configuration configurations configured confined confinement confines confirm confirmation confirmed confirming confirms confiscated conflict conflicted conflicting conflicts conform conformity confront confrontation confronted confronting confronts confuse confused confusing confusion cong congenital congested congestion conglomerate congrats congratulate congratulated congratulations congregation congregations congress congressional congressman congressmen conjecture conjunction conn connect connected connecticut connecting connection connections connectivity connector connectors connects conner connolly connor conquer conquered conquering conqueror conquest cons conscience conscientious conscious consciously consciousness consecrated consecutive consensual consensus consent consequence consequences consequently conservation conservatism conservative conservatives conservatory conserve conserved consider considerable considerably considerate consideration considerations considered considering considers consist consisted consistency consistent consistently consisting consists consolation console consoles consolidate consolidated consolidating consolidation consort consortium conspicuous conspiracy constable constant constantinople constantly constellation constituencies constituency constituent constituents constitute constituted constitutes constitution constitutional constrained constraint constraints construct constructed constructing construction constructions constructive constructs construed consul consular consulate consult consultancy consultant consultants consultation consultations consulted consulting consume consumed consumer consumers consumes consuming consumption cont contact contacted contacting contacts contagious contain contained container containers containing containment contains contaminants contaminated contamination conte contemplate contemplated contemplating contemplation contemporaries contemporary contempt contend contended contender contenders contends content contention contentious contents contest contestant contestants contested contests context contexts contextual contiguous continent continental continents contingency contingent continual continually continuation continue continued continues continuing continuity continuous continuously continuum contour contra contraception contract contracted contracting contraction contractions contractor contractors contracts contractual contradict contradicted contradiction contradictions contradictory contradicts contrary contrast contrasted contrasting contrasts contribute contributed contributes contributing contribution contributions contributor contributors contrived control controlled controller controllers controlling controls controversial controversies controversy convection convened convenience convenient conveniently convent convention conventional conventions converge convergence conversation conversations converse conversely conversion conversions convert converted converter convertible converting converts convex convey conveyed conveying conveyor conveys convict convicted conviction convictions convicts convince convinced convincing convoy conway coo cook cookbook cooke cooked cooker cookie cookies cooking cooks cool coolant cooled cooler coolest cooling coop cooper cooperate cooperating cooperation cooperative coordinate coordinated coordinates coordinating coordination coordinator cop cope copeland copenhagen copied copies coping copper cops copy copying copyright copyrighted cor cora coral corbett corbin corbyn cord cordon cords core cores corinthians cork corn cornell corner cornered corners cornerstone cornwall corny corolla corona coronary coronation coronavirus coroner corp corporal corporate corporation corporations corps corpse corpses corpus correct corrected correcting correction correctional corrections corrective correctly correctness correlate correlated correlation correspond correspondence correspondent correspondents corresponding corresponds corridor corridors corrosion corrugated corrupt corrupted corruption cortex cortez corvette cos cosby cosmetic cosmetics cosmic cosmo cosmopolitan cosmos cosplay cost costa costco costello costing costly costs costume costumes cosy cot cottage cottages cotton couch cougar cougars cough coughing could couldnt coulson coulter council councillor councillors councilman councils counsel counseling counselling counsellor counselor counselors count countdown counted counter counteract countered counterfeit counterpart counterparts counters countess counties counting countless countries country countrymen countryside counts county coup coupe couple coupled couples coupling coupon coupons courage courageous courier course courses court courteous courtesy courthouse courtroom courts courtship courtyard cousin cousins couture cove covenant cover coverage covered covering covers covert coveted covid cow coward cowardly cowards cowboy cowboys coworker coworkers cows cox coyote coyotes coz cozy cpa cpc cpi cpr cps cpu crab crabs crack crackdown cracked cracker crackers cracking cracks cradle craft crafted crafting crafts craftsman craftsmen crafty craigslist cram crammed cramped cramps cranberry crane cranes crank cranky crap crappy crash crashed crashes crashing crate crater crates crave craven craving cravings crawford crawl crawled crawley crawling craze crazed craziest crazy cream creams creamy crease create created creates creating creation creations creative creativity creator creators creature creatures credentials credibility credible credit credited creditors credits creed creek creep creeping creeps creepy crept crescent crest cretaceous crew crews crib cricket cricketer crickets cried cries crime crimea crimes criminal criminals crimson cringe cripple crippled crippling crises crisis crisp crispy cristiano criteria criterion critic critical critically criticise criticised criticism criticisms criticize criticized criticizes criticizing critics critique critiques croatia crochet crocodile croft crook crooked crooks crop cropped crops crore cross crossed crosses crossfit crossing crossings crossover crossroads crossword crotch crouch crow crowd crowded crowdfunding crowds crowe crowley crown crowned crowns crows croydon crucial crucible crucified crude cruel cruelty cruise cruiser cruisers cruises cruising crumble crumbling crumbs crunch crunching crunchy crusade crusader crusaders crush crushed crushes crushing crust cruz cry crying cryptic crypto cryptocurrency crystal crystalline crystals csa csi csr css ctrl cub cube cubes cubic cubs cuckoo cucumber cuddle cuddly cue cues cuff cuffs cuisine culinary culminated culminating culmination culprit cult cultivate cultivated cultivating cultivation cults cultural culturally culture cultured cultures cum cumberland cumbersome cumbria cumming cummings cummins cumulative cunning cunningham cunt cunts cuomo cup cupboard cupcake cupcakes cups curated curator curb cure cured cures curfew curing curiosity curious curiously curl curled curling curls curly currencies currency current currently currents curriculum curry curse cursed curses cursing curt curtain curtains curvature curve curved curves curvy cushion cushions custard custody custom customary customer customers customization customize customized customs cut cute cutest cutie cutler cutoff cuts cutter cutters cutting cuz cvs cyanide cyber cybersecurity cyborg cycle cycles cyclic cyclical cycling cyclist cyclists cyclone cylinder cylinders cylindrical cynical cynicism cypress cyprus cyrus czechoslovakia dab dad daddy dade dads dae daft dagger dai daily dairy daisy dak dal dalai dale daley dallas dalton daly dam damage damaged damages damaging dame damian damien dammit damn damned damning damp dams dan dance danced dancer dancers dances dancing dandy danes dang danger dangerous dangerously dangers dangling daniels dank dans dante dar darby darcy dare dared daredevil daring dark darkened darker darkest darkness darling darn dart darth dartmouth darts darwin dash dashboard dashed dashing dat data database databases date dated dates dating daughter daughters daunting davenport davey davidson davies davis davy dawg dawkins dawn day daycare daylight days daytime dayton daytona dazed dazzling dea deacon dead deadliest deadline deadlines deadly deadpool deaf deal dealer dealers dealership dealing dealings deals dealt dean dear dearest dearly death deaths deb debacle debatable debate debated debates debating debilitating debit debra debris debt debts debut debuted debuts dec decade decades decay decaying deceased deceit deceive deceived deceiving decency decent decentralized deception deceptive decide decided decidedly decides deciding decimal decipher decision decisions decisive deck decker decks declaration declarations declare declared declares declaring decline declined declines declining deco decomposition decor decorate decorated decorating decoration decorations decorative decrease decreased decreases decreasing decree dedicate dedicated dedication deducted deductible deduction deductions dee deed deeds deem deemed deep deepen deepening deeper deepest deeply deer def defamation default defaults defeat defeated defeating defeats defect defective defects defence defences defend defendant defendants defended defender defenders defending defends defense defenses defensive defensively defer deferred defiance defiant deficiencies deficiency deficient deficit deficits define defined defines defining definite definitely definition definitions definitive definitively deflect deflection deforestation deformation deformed defunct defy defying degenerate degradation degrade degraded degrading degree degrees dehydrated dehydration dei deities deity delaney delay delayed delaying delays delegate delegates delegation delete deleted deleting deletion deli deliberate deliberately deliberations delicacy delicate delicious delight delighted delightful delights deliver delivered deliveries delivering delivers delivery delta deluded delusion delusional delusions deluxe delve dem demand demanded demanding demands demeanor dementia demi demise demo democracies democracy democrat democratic democrats demographic demographics demolish demolished demolition demon demonic demons demonstrate demonstrated demonstrates demonstrating demonstration demonstrations demonstrators demos dempsey dems den deng denial denied denies denim denise denny denomination denominations denominator denote denoted denotes denounce denounced dense densely density dent dental dentist dentistry dentists denton denver deny denying depart departed departing department departmental departments departs departure departures depend dependable depended dependence dependencies dependency dependent depending depends depict depicted depicting depiction depicts depleted depletion deplorable deploy deployed deploying deployment deployments deport deportation deported deposed deposit deposited deposition deposits depot depp depreciation depressed depressing depression depressive deprivation deprive deprived dept depth depths deputies deputy der deranged derby derbyshire deregulation derivative derivatives derive derived derives derogatory derrick derry des descend descendant descendants descended descending descends descent describe described describes describing description descriptions descriptive desert deserted deserts deserve deserved deserves deserving design designate designated designation designed designer designers designing designs desirable desire desired desires desk desks desktop desmond desolate despair desperate desperately desperation despicable despise despised despite dessert desserts destination destinations destined destiny destroy destroyed destroyer destroyers destroying destroys destruction destructive det detached detachment detail detailed detailing details detain detained detainees detect detected detecting detection detective detectives detector detectors detention deter detergent deteriorate deteriorated deteriorating deterioration determination determine determined determines determining deterrent detour detox detriment detrimental detroit deutsche dev devastated devastating devastation develop developed developer developers developing development developmental developments develops deviation device devices devil devils devin devise devised devoid devolved devote devoted devotees devotion devotional devour devout dew dex dexter dhabi dhaka dharma dhs dia diabetes diabetic diablo diagnose diagnosed diagnoses diagnosis diagnostic diagnostics diagonal diagram diagrams dial dialect dialects dialog dialogue dialogues dialysis diameter diamond diamonds diaper diapers diaries diarrhea diary diaz dicaprio dice dick dickens dickhead dickinson dicks dickson dictate dictated dictates dictator dictators dictatorship dictionaries dictionary did didn didnt die died dies diesel diet dietary dieting diets diff differ differed difference differences different differential differentiate differentiated differentiation differently differing differs difficult difficulties difficulty diffuse diffusion dig digest digestion digestive digger digging digit digital digitally digits dignified dignity digs dildo dilemma diligence diligent diligently dillon dilute diluted dim dime dimension dimensional dimensions diminish diminished diminishing din dine diner diners ding dining dinner dinners dino dinosaur dinosaurs diocese dior dioxide dip diploma diplomacy diplomat diplomatic diplomats dipped dipping dips dir dire direct directed directing direction directional directions directive directives directly director directorate directories directors directory directs dirk dirt dirty dis disabilities disability disable disabled disabling disadvantage disadvantaged disadvantages disagree disagreed disagreement disagreements disagrees disappear disappearance disappeared disappearing disappears disappoint disappointed disappointing disappointment disapproval disarm disarmament disaster disasters disastrous disbanded disbelief disc discard discarded discern discharge discharged disciple disciples disciplinary discipline disciplined disciplines disclaimer disclose disclosed disclosing disclosure disclosures disco discomfort disconnect disconnected discontent discontinued discord discount discounted discounts discourage discouraged discouraging discourse discover discovered discoveries discovering discovers discovery discredit discredited discreet discrepancies discrepancy discrete discretion discretionary discriminate discriminated discriminating discrimination discriminatory discs discuss discussed discusses discussing discussion discussions disdain disease diseases disgrace disgraced disgraceful disguise disguised disgust disgusted disgusting dish dishes dishonest dishonesty dishwasher disillusioned disk disks dislike disliked dislikes dismal dismantle dismantled dismantling dismay dismiss dismissal dismissed dismissing disney disneyland disobedience disorder disorderly disorders disparate disparities disparity dispatch dispatched dispersal disperse dispersed dispersion displaced displacement display displayed displaying displays displeasure disposable disposal dispose disposed disposition disproportionate disproportionately dispute disputed disputes disqualified disregard disrespect disrespectful disrupt disrupted disrupting disruption disruptive diss dissatisfaction dissatisfied dissemination dissent dissenting dissertation dissolution dissolve dissolved distal distance distances distant distilled distillery distinct distinction distinctions distinctive distinctly distinguish distinguished distinguishes distinguishing distorted distortion distract distracted distracting distraction distractions distraught distress distressed distressing distribute distributed distributes distributing distribution distributions distributor distributors district districts distrust disturb disturbance disturbances disturbed disturbing ditch ditched ditto div diva dive diver divergence divergent divers diverse diversification diversified diversify diversion diversity divert diverted dives divide divided dividend dividends divides dividing divine diving divinity division divisional divisions divisive divorce divorced dixie dixon diy dizzy djokovic djs dlc dmitry dmv dna dnc dns doc dock docked docking docks docs doctor doctoral doctorate doctors doctrine doctrines document documentaries documentary documentation documented documenting documents dod dodd dodge dodger dodgers dodging dodgy doe does doesn doesnt dog dogg doggy dogma dogs doha doherty doi doin doing doj dolan dole doll dollar dollars dolls dolly dolphin dolphins dom domain domains dome domestic domestically domesticated dominance dominant dominate dominated dominates dominating domination domingo dominion domino don donaldson donate donated donating donation donations doncaster done dong donkey donna donnelly donny donor donors dons dont donut donuts doo doodle doom doomed doomsday door doors doorstep doorway dopamine dope doping dorm dormant dorsal dorset dortmund dos dosage dose doses dossier dot doth dots dotted double doubled doubles doubling doubly doubt doubted doubtful doubting doubts douche dough doughnut doughnuts douglass dove dover dow down downed downey downfall downgrade downgraded downhill download downloadable downloaded downloading downloads downright downs downside downstairs downstream downtime downtown downturn downward downwards dowry dozen dozens dps dracula draft drafted drafting drafts drag dragged dragging dragon dragons drags drain drainage drained draining drains drake drama dramas dramatic dramatically drank draped draper drastic drastically draw drawback drawbacks drawer drawers drawing drawings drawn draws dre dread dreaded dreadful dream dreamed dreamer dreaming dreams dreamt dreamy drenched dresden dress dressed dresser dresses dressing drew dried drier dries drift drifted drifting drill drilled drilling drills drink drinker drinkers drinking drinks drip dripping drive driven driver drivers drives driveway driving drizzle droid drone drones drop dropped dropping drops drought drove drown drowned drowning drs drug drugged drugs drum drummer drumming drummond drums drunk drunken dry dryer drying dsm dual duality dub dubai dubbed dubious dublin dubois duchess duck ducks duct dude dudes dudley due duel dues duet duff duffy dug duh dui duke dukes dull duluth duly dum dumb dumbass dumber dumbest dummies dummy dump dumped dumping dumps dumpster dun dunbar dundee dune dunes dung dungeon dungeons dunham dunk dunn dunno duo duplex duplicate duplication dupont durability durable durant duration during dusk dust dusty dutch duties dutton duty dvd dvds dwarf dwarfs dwarves dwell dwellers dwelling dwellings dye dyed dyer dyes dying dyke dynamic dynamics dynamite dynamo dynasty dysfunction dysfunctional dyson dystopian each eachother eager eagerly eagle eagles ear earl earlier earliest early earn earned earners earnest earning earnings earns earrings ears earth earthly earthquake earthquakes ease eased easier easiest easily easing east eastenders easter eastern eastman easton eastward eastwood easy eat eaten eater eaters eating eaton eats eau ebay ebola ebony ebook ebooks eccentric ecclesiastical echo echoed echoes echoing eclectic eclipse eco ecological ecology ecommerce economic economical economically economics economies economist economists economy ecosystem ecosystems ecstasy ecstatic ect ecuador eddy edge edged edges edging edgy edible edinburgh edison edit edited editing edition editions editor editorial editors edits edm edmonton eds edt educate educated educating education educational educator educators edwards eel eels eerie eff effect effected effective effectively effectiveness effects efficacy efficiencies efficiency efficient efficiently effort effortless effortlessly efforts egan egg eggs ego egyptians eid eiffel eight eighteen eighteenth eighth eighties eighty ein einstein eisenhower either ejected elaborate elaborated elaine elastic elbow elbows elder elderly elders eldest elect elected electing election elections elective electoral electorate electors electric electrical electrically electrician electricity electro electrode electrodes electromagnetic electron electronic electronically electronics electrons elegance elegant element elemental elementary elements elephant elephants elevate elevated elevation elevations elevator elevators eleven eleventh elf elgin eligibility eligible eliminate eliminated eliminates eliminating elimination elise elite elites elixir elk elle ellie elliptical ellis ellison elm elongated eloquent else elsewhere elton elusive elves ely email emailed emails emancipation emanuel embankment embargo embark embarked embarking embarrass embarrassed embarrassing embarrassment embassies embassy embedded emblem embodied embodies embodiment embody embrace embraced embraces embracing embroidered embroidery embryo embryonic embryos emerald emerge emerged emergence emergencies emergency emergent emerges emerging emeritus emerson emery emigration emile emilio eminem eminence eminent emirates emission emissions emit emitted emitting emmy emo emoji emory emotion emotional emotionally emotions empathy emperor emperors emphasis emphasised emphasize emphasized emphasizes emphasizing empire empires empirical employ employed employee employees employer employers employing employment employs empower empowered empowering empowerment empress emptied emptiness empty ems emulate enable enabled enables enabling enact enacted enactment enamel enchanted enchanting enclave enclosed enclosure encoded encoding encompass encompasses encompassing encore encounter encountered encountering encounters encourage encouraged encouragement encourages encouraging encrypted encryption encyclopedia end endanger endangered endearing endeavor endeavors endeavour ended endemic endgame ending endings endless endlessly endorse endorsed endorsement endorsements endorsing endowed endowment ends endurance endure endured enduring enemies enemy energetic energies energy enforce enforced enforcement enforcing eng engage engaged engagement engagements engages engaging engine engineer engineered engineering engineers engines england engraved engraving enhance enhanced enhancement enhancements enhances enhancing enigma enjoy enjoyable enjoyed enjoying enjoyment enjoys enlarge enlarged enlargement enlighten enlightened enlightenment enlist enlisted enormous enormously enough enquiries enquiry enraged enrich enriched enrichment enrique enroll enrolled enrolling enrollment ensemble ensign enslaved ensued ensuing ensure ensured ensures ensuring ent entail entails entangled enter entered entering enterprise enterprises enters entertain entertained entertainer entertainers entertaining entertainment enthusiasm enthusiast enthusiastic enthusiastically enthusiasts entice entire entirely entirety entities entitled entitlement entity entourage entrance entrances entrants entrenched entrepreneur entrepreneurial entrepreneurs entrepreneurship entries entropy entrusted entry envelope envelopes envious environment environmental environmentally environments envision envisioned envoy envy enzo enzyme enzymes eos epa epic epidemic epidemiology epilepsy epilogue episcopal episode episodes epitome epoch eps epstein equal equality equally equals equate equation equations equator equatorial equestrian equilibrium equip equipment equipped equitable equities equity equivalence equivalent equivalents era eradicate eras erase erased erdogan ere erect erected erection eric erika erin erm eroded erosion erotic err errands erratic erroneous error errors ers erupted eruption eruptions esa escalate escalated escalating escalation escape escaped escapes escaping escobar escort escorted escorts esoteric esp especially espionage espn esports espresso esq esque essay essays essence essential essentially essentials est establish established establishes establishing establishment establishments estate estates esteem esteemed estimate estimated estimates estimating estimation estonia estranged estrogen estuary eta etc etched etching eternal eternally eternity eth ethanol ethel ether ethereal ethereum ethernet ethic ethical ethics ethnic ethnicity ethos etiquette etsy eun euphoria eur eureka euro europe europeans euros eurovision eurozone euthanasia evacuate evacuated evacuation evade evaluate evaluated evaluating evaluation evaluations evangelical evans evasion eve even evening evenings evenly event events eventual eventually ever everest evergreen everlasting everton every everybody everyday everyone everything everytime everywhere evicted eviction evidence evidenced evident evidently evil evils evo evoke evolution evolutionary evolve evolved evolves evolving ewing exacerbated exact exactly exaggerate exaggerated exaggerating exaggeration exalted exam examination examinations examine examined examiner examines examining example examples exams excavated excavation excavations exceed exceeded exceeding exceedingly exceeds excel excelled excellence excellency excellent except exception exceptional exceptionally exceptions excerpt excerpts excess excessive excessively exchange exchanged exchanges exchanging exchequer excise excite excited excitement exciting exclude excluded excludes excluding exclusion exclusive exclusively excursion excursions excuse excused excuses exec execute executed executing execution executions executive executives exemplary exemplified exempt exemption exemptions exercise exercised exercises exercising exert exeter exhaust exhausted exhausting exhaustion exhaustive exhibit exhibited exhibiting exhibition exhibitions exhibits exile exiled exist existed existence existent existential existing exists exit exited exiting exits exodus exotic exp expand expanded expanding expands expanse expansion expansions expansive expect expectancy expectation expectations expected expecting expects expedition expeditions expel expelled expenditure expenditures expense expenses expensive experience experienced experiences experiencing experiment experimental experimentation experimented experimenting experiments expert expertise experts expiration expire expired expires explain explained explaining explains explanation explanations explanatory explicit explicitly explode exploded explodes exploding exploit exploitation exploited exploiting exploits exploration exploratory explore explored explorer explorers explores exploring explosion explosions explosive explosives expo exponential exponentially export exported exporter exporters exporting exports expose exposed exposes exposing exposition exposure exposures express expressed expresses expressing expression expressions expressive expressly expulsion exquisite ext extant extend extended extending extends extension extensions extensive extensively extent exterior extermination external externally extinct extinction extinguished extortion extra extract extracted extracting extraction extracts extradition extraordinarily extraordinary extras extravagant extreme extremely extremes extremism extremist extremists eye eyeballs eyebrow eyebrows eyed eyeing eyelids eyeliner eyes eyeshadow eyesight eyewitness faa fab faber fabio fable fabric fabricated fabrication fabrics fabulous facade face faced faces facet facets facial facilitate facilitated facilitates facilitating facilities facility facing fact faction factions facto factor factories factors factory facts factual faculties faculty fad fade faded fades fading fag faggot fail failed failing fails failure failures faint fair faire fairfax fairfield fairies fairly fairness fairs fairy fairytale faith faithful faithfully faiths fake faked fakes faking falcon falcons fall fallacy fallen falling fallon fallout falls false falsely fam fame famed familial familiar familiarity families family famine famous famously fan fanatic fanatics fanbase fancy fandom fanfare fang fans fantasies fantastic fantasy faq far farage farah farce fare fares farewell fargo farm farmed farmer farmers farmhouse farming farmland farms farrell fart farther farts fascinated fascinating fascination fascism fascist fascists fashion fashionable fashioned fashions fast faster fastest fasting fat fatal fatalities fatality fatally fate fated fates father fathers fathom fatigue fats fatty faulkner fault faults faulty faux fav fave favor favorable favorably favored favoring favorite favorites favors favour favourable favoured favourite favourites favours fax fay faye fbi fcc fda fear feared fearful fearing fearless fears feasibility feasible feast feat feather feathers feats feature featured features featuring feb feces fed federal federally federation federer fedex feds fee feeble feed feedback feeder feeding feeds feel feelin feeling feelings feels fees feet fei felicity felipe fell fella fellas fellow fellows fellowship fellowships felon felony felt female females feminine feminism feminist feminists femme fence fenced fences fencing fend fender feng fenton feral ferdinand fermentation fermented fern fernandez ferocious ferrari ferries ferris ferry fertile fertility fertilizer fest festival festivals festive festivities fetal fetch fetched fetish fetus feud feudal fever few fewer ffa ffs fiance fiancee fiasco fiat fiber fibers fibre fibres fibrosis fiction fictional fictitious fiddle fide fidel fidelity field fielder fielding fields fierce fiercely fiery fiesta fifa fife fifteen fifteenth fifth fifties fifty fig fight fighter fighters fighting fights figs figure figured figures figuring fil file filed files filing filings filipinos fill filled filler filling fills filly film filmed filming filmmaker filmmakers filmmaking films filter filtered filtering filters filth filthy filtration fin final finale finalist finalists finalized finally finals finance financed finances financial financially financing finch find finder finding findings finds fine fined finely finer fines finesse finest finger fingernails fingerprint fingerprints fingers fingertips finish finished finisher finishes finishing finite finland fins fiona fir fire firearm firearms fireball fired firefighter firefighters firefox fireman fireplace firepower fires firewall firewood fireworks firing firm firmly firms firmware first firsthand firstly firth fiscal fischer fish fisher fisheries fisherman fishermen fishery fishes fishing fishy fist fists fit fitch fitness fits fitted fitting fittings fitz fitzgerald fitzpatrick five fix fixation fixed fixes fixing fixture fixtures fla flag flagged flags flagship flair flake flakes flame flames flaming flammable flanagan flanders flank flanked flanks flannel flap flaps flare flares flash flashback flashbacks flashed flashes flashing flashlight flashy flask flat flats flattened flatter flattered flattering flavor flavored flavors flavour flavours flaw flawed flawless flaws flea fled fledged flee fleece fleeing fleet fleeting fleets flesh fletcher flew flex flexibility flexible flick flickr flies flight flights fling flint flip flipped flipping flips flirt flirting float floated floating floats flock flood flooded flooding floods floor flooring floors flop floppy flops flora floral florence flores floss flour flourish flourished flourishing flow flowed flower flowering flowers flowing flown flows flu fluctuations fluent fluff fluffy fluid fluids fluke flung fluorescence fluorescent fluoride flush flushed flushing flute flux fly flyer flyers flying flynn foam focal focus focused focuses focusing fodder foe foes fog foggy foil fol fold folded folder folders folding folds foley foliage folk folklore folks follow followed follower followers following follows folly fond fondly fondness font fonts foo food foods fool fooled fooling foolish fools foot footage football footballer footballers footed foothills footing footnote footnotes footprint footprints footsteps footwear footy for forbes forbid forbidden force forced forceful forcefully forces forcibly forcing ford fore forearm forecast forecasting forecasts foreclosure forefront foreground forehead foreign foreigner foreigners foreman foremost forensic forensics foresee foreseeable foresight forest forestry forests forever forex forfeit forge forged forgery forget forgets forgetting forging forgive forgiven forgiveness forgiving forgot forgotten fork forks form formal formality formally format formation formations formative formats formatting formed former formerly formidable forming forms formula formulas formulate formulated formulation forrest forsaken forster forsyth fort forte forth forthcoming fortified fortitude fortnight fortnite fortress forts fortunate fortunately fortune fortunes forty forum forums forward forwarded forwarding forwards fossil fossils foster fostered fostering fought foul fouls found foundation foundations founded founder founders founding foundry fountain fountains four fours fourteen fourteenth fourth fowler fox foxes fps fracking fraction fractions fracture fractured fractures fragile fragment fragmentation fragmented fragments fragrance fragrant frail frame framed frames framework frameworks framing fran france francesca francesco franchise franchises franco francs frank frankfurt frankie franklin frankly franks frantic frantically franz fraser frat fraternity fraud fraudulent fray frazier freak freaked freakin freaking freaks freaky free freed freedom freedoms freeing freelance freely freeman frees freestyle freeway freeze freezer freezes freezing freight fremantle fremont frenzy frequencies frequency frequent frequented frequently fresh freshly freshman freshmen freshwater fresno fret freud fri friction fridays fridge fried friedman friedrich friend friendly friends friendship friendships fries friggin fright frightened frightening fringe fringes frivolous fro frog frogs from front frontal frontier frontiers frontline frontman fronts frost frosty frown frowned froze frozen fruit fruitful fruition fruits fruity frustrated frustrating frustration frustrations fry frying fsa ftc fuck fucked fucker fuckers fuckin fucking fucks fudge fuel fueled fueling fuels fugitive fuji fukushima fulfil fulfill fulfilled fulfilling fulfillment fulham full fullback fuller fullest fully fulton fumble fumes fun function functional functionality functionally functioning functions fund fundamental fundamentalist fundamentally fundamentals funded funding fundraiser fundraising funds funeral funerals fungal fungi fungus funk funky funnel funnier funniest funny fur furious furiously furnace furnish furnished furnishings furniture furry further furthermore furthest fury fuse fused fusion fuss futile future futures futuristic fuzzy fyi gabby gabrielle gaddafi gadget gadgets gag gaga gage gain gained gaining gains gal gala galactic galaxies galaxy gale galileo gall gallagher gallant galleries gallery galley gallon gallons galloway gals galveston galway gamble gambler gambling game gameplay gamer gamers games gaming gamma gandhi gang gangs gangster gangsters gao gap gaping gaps garage garbage garcia garde garden gardener gardeners gardening gardens gardiner gardner gareth garfield garland garlic garment garments garner garnered garnet garrett garrison garry garth gas gases gasoline gasp gaston gastric gastrointestinal gate gated gates gateway gather gathered gathering gatherings gathers gator gators gatsby gauge gauntlet gave gavin gay gayle gays gaza gaze gazette gazing gcse gdp gear gearbox geared gearing gears gee geek geeks geelong geese gel gem gemma gems gen gender genders gene genealogy genera general generalization generalized generally generals generate generated generates generating generation generational generations generator generators generic generosity generous generously genes genesis genetic genetically genetics geneva genie genital genitals genius geniuses genocide genome genre genres gent gentle gentleman gentlemen gently gentry gents genuine genuinely genus geo geographic geographical geographically geography geologic geological geologist geologists geology geometric geometry geopolitical georg georges georgetown geothermal germ germain german germanic germans germany germs gerrard gerry gesture gestures get getaway gets gettin getting getty gettysburg ghana ghanaian ghetto ghost ghostbusters ghostly ghosts ghz giant giants gibbons gibbs giddy gif gifs gift gifted gifts gig gigantic giggle giggles giggling gigs gilbert gilded gill gillespie gilmore gimme gimmick gin gina ginger giorgio giraffe girl girlfriend girlfriends girls girly gis gist git give giveaway giveaways given giver gives giving glacial glacier glaciers glad gladiator gladly glam glamorous glamour glance glanced gland glands glare glaring glasgow glass glasses glaze glazed glee glen glendale glide gliding glimpse glimpses glitch glitches glitter glittering global globalization globally globe gloom gloomy glorified glorious glory gloss glossary glossy gloucestershire glove glover gloves glow glowing glucose glue glued gluten gma gmail gmbh gmo gmt gnome goa goal goalie goalkeeper goals goat goats goblin god goddamn goddard goddess godfather godly gods godzilla goes goethe goggles gogh goin going goku gold goldberg golden goldfish goldman goldsmith goldstein golf golfer golfers golfing goliath gomez gon gone gong gonna gonzalez goo good goodbye goodies goodman goodness goodnight goods goodwill goodwin goofy googled goons goose gop gopro gore gorge gorgeous gorilla gorman gosh gospel gospels gossip got gotcha gotta gotten gould gourmet gov govern governance governed governing government governmental governments governor governors governs govt gown gowns gpa gps gpu grab grabbed grabbing grabs grace graceful gracefully gracie gracious grad grade graded grader graders grades gradient grading gradual gradually graduate graduated graduates graduating graduation grady graffiti graft graham grail grain grains gram grammar grammatical grammy grams gran granada grand grandchildren granddaughter grande grandeur grandfather grandma grandmother grandpa grandparents grandson grange granger granite granny grant granted granting grants grape grapefruit grapes graph graphic graphical graphics graphite graphs grappling gras grasp grasping grass grasses grassroots grassy grate grateful gratification grating gratitude grave gravel graveyard gravitational gravity gravy gray grayson grazing grease greasy great greater greatest greatly greatness greats greece greed greedy greeks green greenberg greene greener greenfield greenhouse greens greensboro greenville greenwood greer greet greeted greeting greetings grenade grenades grew grey greyhound grid grief grievance grievances grieve grieving grievous griffin griffiths grill grilled grilling grim grimes grimm grin grind grinder grinding grinning grip gripped gripping grips grit gritty grizzlies grizzly groceries grocery groin groom groomed grooming groove grooves gross grossed grossly grotesque ground groundbreaking grounded grounding grounds groundwater groundwork group grouped grouping groups grouse grove grover groves grow growers growing growl grown grows growth grudge gruesome grumpy grunt gsm gst gta guam guangzhou guantanamo guarantee guaranteed guaranteeing guarantees guard guarded guardian guardians guarding guards guatemala gubernatorial gucci guerrero guerrilla guess guessed guesses guessing guest guests gui guidance guide guided guideline guidelines guides guiding guild guilt guilty guinea guineas guinness guise guitar guitarist guitars gujarat gulf gum gums gun gunfire gunman gunmen gunn gunner gunners gunpoint gunpowder guns gunshot gunshots guru gustav gusts gut guthrie guts gutted gutter guy guyana guys gym gymnasium gymnastics gyms gypsy haas habit habitat habitats habits habitual hack hacked hacker hackers hacking hackney hacks had hadley hague hah haha hahaha hahahaha hahn hai hail hailed hailing haines hair haircut hairdresser haired hairs hairstyle hairy haiti halal hale haley half halftime halfway halifax hall halle hallelujah hallmark halls hallucinations hallway halo halt halted halves ham hamas hamburg hamburger hamid hamlet hammer hammered hammering hammers hammock hammond hamper hampered hampton hamster hamstring han hana hancock hand handbag handbags handbook handcuffs handed handedly handful handgun handheld handicap handicapped handing handkerchief handle handled handler handlers handles handling handmade hands handshake handsome handwriting handwritten handy hang hangar hanged hanger hanging hangover hangs hank hanks hanna hannah hanoi hanover hansen hanson happen happened happening happens happier happiest happily happiness happy har hara haram harass harassed harassing harassment harbor harbour harcourt hard hardcore hardcover harden hardened harder hardest harding hardly hardness hardship hardships hardware hardwood hardworking hardy hare harlan harlem harley harm harmed harmful harming harmless harmonic harmonious harmony harms harness harp harriet harrington harrisburg harrison harry harsh harshly hart hartford hartley harvest harvested harvesting haryana has hasan hash hashtag hashtags haskell hassan hassle hast haste hastily hastings hasty hat hatch hatched hate hated hateful hater haters hates hath hathaway hating hatred hats haul hauled hauling haunt haunted haunting haunts haute have haven havent having havoc hawaii hawk hawking hawkins hawks hawthorn hawthorne hay hayden hayes hayley haynes hays hayward hazard hazardous hazards haze hazel hazy hbo hdmi head headache headaches headed header heading headlights headline headlines headmaster headphone headphones headquartered headquarters heads headset heal healed healer healing heals health healthcare healthier healthy healy heap heaps hear heard hearing hearings hears heart heartache heartbeat heartbreak heartbreaking heartbroken hearted heartfelt heartland heartless hearts hearty heat heated heater heaters heath heather heathrow heating heats heaven heavenly heavens heavier heaviest heavily heavy heavyweight hebrews heck hectares hectic hector hedge hedgehog hedges hee heed heel heels hefty heh heidelberg height heightened heights heinous heir heirs heisman heist held helicopter helicopters helium helix hell hella heller hello helm helmet helmets help helped helper helpers helpful helping helpless helps helsinki hem hemingway hemisphere hemp hen hence henderson hendricks hendrix henley henri henrik hens hentai hepatitis hepburn her herald herb herbal herbs herd herds here hereby hereditary herein heres heresy heritage hermann hermit hernandez hero heroes heroic heroin heroine heroism herpes herr herrera herring hers herself hertfordshire hes hesitant hesitate hesitation hess het heterosexual hewitt hewlett hex hey hezbollah hiatus hicks hid hidden hide hideous hides hiding hierarchical hierarchy higgins high higher highest highland highlands highlight highlighted highlighting highlights highly highness highs highschool highway highways hijab hijacked hike hikes hiking hilarious hill hills hillsborough hillside hilly hilton him himself hind hinder hindered hindsight hindus hinge hinges hint hinted hints hip hippie hips hipster hire hired hires hiring hiroshima his hispanics historian historians historic historical historically histories history hit hitch hitchcock hitherto hitler hitman hits hitter hitters hitting hiv hive hmm hmmm hms hoard hoax hobart hobbies hobbit hobbs hobby hoc hockey hodge hodges hodgson hoe hoffman hog hogan hogg hogs hogwarts hold holden holder holders holding holdings holds hole holes holiday holidays holiness holistic hollis hollow holloway holly holmes holocaust holt holy homage home homecoming homeland homeless homelessness homemade homeowner homeowners homepage homer homes homestead hometown homework homicide homie homo homogeneous homophobia homophobic homosexual homosexuality homosexuals honduras hone honest honestly honesty honey honeymoon hong honolulu honor honorable honorary honored honoring honors honour honourable honoured honours hoo hood hooded hoodie hook hooked hooker hookers hooking hooks hookup hoop hooper hoops hooray hoover hop hope hoped hopeful hopefully hopeless hopelessly hopes hoping hopkins hopped hopper hopping hops horace horde hordes horizon horizons horizontal horizontally hormonal hormone hormones horn horne hornet hornets horns horny horrendous horrible horribly horrid horrific horrified horrifying horror horrors horse horseback horsemen horsepower horses horseshoe horticultural horticulture horton hose hospice hospital hospitality hospitalized hospitals host hostage hostages hosted hostel hostess hostile hostilities hostility hosting hosts hot hotel hotels hotline hotspot hotter hottest hound hounds hour hourly hours house housed household households housekeeper housekeeping houses housewife housewives housing houston hover hovering how howe howell however howie howl howling hpv hrs htc html http https hua huang huawei hub hubbard hubby hubs hud huddersfield hudson hue huffington hug huge hugely hugged hugging hugs huh hulk hull hulu hum human humane humanitarian humanities humanity humans humble humbled humbly humboldt humid humidity humiliated humiliating humiliation humility humming humor humorous humour hump hundred hundreds hung hungary hunger hungry hunt hunted hunters hunting huntington hunts hurdle hurdles hurley hurling huron hurricane hurricanes hurried hurry hurt hurtful hurting hurts husband husbands hush huskies husky hussain hussein hustle hut hutchinson huts hutton hwy hyatt hybrid hybrids hyde hyderabad hydrated hydration hydraulic hydro hydrogen hye hygiene hymn hymns hype hyped hyper hyperbolic hypertension hypnosis hypocrisy hypocrite hypocrites hypocritical hypotheses hypothesis hypothetical hysteria hysterical hyun iain ibiza ibn ibrahim icc ice iceberg iced iceland ich icing ico icon iconic icons ict icu icy ide idea ideal idealistic ideally ideals ideas identical identifiable identification identified identifies identify identifying identities identity ideological ideologies ideology idf idiot idiotic idiots idk idle idol idols ids ieee ifs iggy ign ignite ignited ignition ignorance ignorant ignore ignored ignores ignoring igor iii ikea ill illegal illegally illegitimate illicit illiterate illness illnesses illuminate illuminated illuminating illumination illusion illusions illustrate illustrated illustrates illustrating illustration illustrations illustrator illustrious image imagery images imaginable imaginary imagination imaginative imagine imagined imaging imagining imam imbalance imdb imf imitate imitating imitation immaculate immature immediate immediately immense immensely immersed immersion immersive immigrant immigrants immigration imminent immoral immortal immortality immune immunity imo imp impact impacted impacting impacts impaired impairment impartial impatient impeached impeachment impeccable impedance impede impending imperative imperfect imperfections imperial imperialism imperialist impetus implant implanted implants implement implementation implementations implemented implementing implements implicated implication implications implicit implicitly implied implies imply implying import importance important importantly imported importing imports impose imposed imposes imposing imposition impossible impoverished impractical impress impressed impression impressions impressive imprint imprisoned imprisonment improbable impromptu improper improperly improv improve improved improvement improvements improves improving improvised impulse impulses impulsive impunity imran ina inability inaccessible inaccurate inactive inadequate inadvertently inappropriate inaugural inaugurated inauguration inbound inbox inc incapable incarcerated incarceration incarnation incense incentive incentives inception incest inch inches incidence incident incidental incidentally incidents incision inciting incl inclination incline inclined include included includes including inclusion inclusive income incomes incoming incompatible incompetence incompetent incomplete incomprehensible inconsistencies inconsistency inconsistent inconvenience inconvenient incorporate incorporated incorporates incorporating incorporation incorrect incorrectly increase increased increases increasing increasingly incredible incredibly incremental incubation incumbent incumbents incur incurred indebted indecent indeed indefinite indefinitely independence independent independently independents index indexed indexes indexing indianapolis indians indicate indicated indicates indicating indication indications indicative indicator indicators indices indicted indictment indie indifference indifferent indigenous indigo indirect indirectly indispensable indistinguishable individual individuality individually individuals indo indonesia indoor indoors induce induced induces inducing inducted induction indulge indulgence industrial industries industry indy ineffective inefficient ineligible inequalities inequality inertia inevitable inevitably inexpensive inexperienced infamous infancy infant infantry infants infect infected infection infections infectious infer inference inferior inferno infertility infestation infested infidelity infiltrate infiltrated infiltration infinite infinitely infinity infirmary inflamed inflammation inflammatory inflatable inflated inflation inflict inflicted influence influenced influences influencing influential influenza influx info inform informal informant information informational informative informed informing informs infrared infrastructure infringement infused infusion ing ingenious ingenuity ingredient ingredients ingrid inhabit inhabitants inhabited inhale inherent inherently inherit inheritance inherited inhibit inhibition inhibitor inhibitors inhuman inhumane initial initially initials initiate initiated initiating initiation initiative initiatives inject injected injecting injection injections injunction injure injured injuries injuring injury injustice ink inland inlet inline inmate inmates inn innate inner inning innings innocence innocent innocents innovation innovations innovative inorganic inpatient input inputs inquest inquire inquiries inquiry inquisition ins insane insanely insanity inscribed inscription inscriptions insect insects insecure insecurities insecurity insensitive insert inserted inserting insertion inserts inside insider insiders insidious insight insightful insights insignia insignificant insist insisted insistence insisting insists insolvency insomnia inspect inspected inspecting inspection inspections inspector inspectors inspiration inspirational inspire inspired inspires inspiring insta instability install installation installations installed installing installment installments instance instances instant instantaneous instantly instead instinct instinctively instincts institute instituted institutes institution institutional institutions instruct instructed instruction instructional instructions instructor instructors instrument instrumental instrumentation instruments insufficient insulated insulation insulin insult insulted insulting insults insurance insure insured insurer insurers insurgency insurgent insurgents insurrection int intact intake intangible integer integral integrate integrated integrating integration integrity intellect intellectual intellectually intellectuals intelligence intelligent intend intended intending intends intense intensely intensified intensify intensity intensive intent intention intentional intentionally intentions inter interact interacting interaction interactions interactive interacts intercept intercepted interception interceptions interchange interchangeable interconnected intercontinental intercourse interdisciplinary interest interested interesting interestingly interests interface interfaces interfere interfered interference interfering interim interior interiors intermediary intermediate intermittent intern internal internally international internationally internet interns internship internships interpersonal interplay interpol interpret interpretation interpretations interpreted interpreter interpreting interracial interrogated interrogation interrupt interrupted interrupting interruption intersect intersection intersections interstate interstellar intertwined interval intervals intervene intervened intervening intervention interventions interview interviewed interviewer interviewing interviews intestinal intestine intestines intimacy intimate intimately intimidate intimidated intimidating intimidation into intolerable intolerance intolerant intoxicated intra intricate intrigue intrigued intriguing intrinsic intro introduce introduced introduces introducing introduction introductions introductory intruder intrusion intrusive intuition intuitive invade invaded invaders invading invalid invaluable invariably invasion invasions invasive invent invented inventing invention inventions inventive inventor inventories inventors inventory inverse inversion inverted invest invested investigate investigated investigates investigating investigation investigations investigative investigator investigators investing investment investments investor investors invincible invisible invitation invitational invitations invite invited invites inviting invoice invoke invoked involuntary involve involved involvement involves involving inward ioc iodine ion ionic ions ios iot ipa ipad iphone iphones ipl ipo ipod ips ipswich iranians ire ireland irene iris irl iron ironic ironically ironman irons irony irrational irregular irregularities irrelevant irresistible irrespective irresponsible irreversible irrigation irritated irritating irritation irs irvine isa ish isil isla islamabad islamists island islanders islands isle isles isnt iso isolate isolated isolating isolation isotope isp isps israelis israelites iss issa issuance issue issued issues issuing ist istanbul italia italians italics italy itch itching itchy item items iteration itinerary its itself itunes itv ive ives ivf ivory ivy jab jack jackass jacked jacket jackets jackie jackpot jacks jacksonville jacobs jacqueline jade jae jaguar jaguars jail jailed jails jakarta jake jam jamal jameson jammed jamming jams jane janeiro jang janitor japan jar jargon jarrett jars jasmine jasper javascript javier jaw jaws jax jay jays jazz jealous jealousy jean jeans jeb jed jedi jeep jeez jeff jefferson jelly jellyfish jen jenkins jenna jenner jennings jenny jensen jeopardy jericho jerk jerking jerks jerry jersey jerseys jess jet jets jewel jewellery jewelry jewels jews jfk jiang jigsaw jihad jimi jimmy jingle jinx joaquin job jobless jobs jock jockey jodie jody joe joey jog jogging johannes johannesburg johansson johns johnson johnston johnstone join joined joining joins joint jointly joints jojo joke joked joker jokes joking jokingly jolie jolly jonny joo jordan josef josh josie journal journalism journalist journalistic journalists journals journey journeys joy joyful joyous joys jubilee judd judge judged judgement judges judging judgment judgmental judgments judicial judiciary judo jug juggling juice juices juicy jul julio jumbo jump jumped jumper jumpers jumping jumps junction june jung jungle junior juniors juniper junk junkie junta jurisdiction jurisdictions jurisprudence jurors jury jus just justice justices justifiable justification justified justifies justify justifying juvenile juveniles juventus kabul kahn kai kaiser kale kali kan kane kang kangaroo kano kansas kanye kaplan kapoor kappa kara karachi karaoke karate kardashian karim karma karnataka kart kashmir kat katherine katrina katz kaufman kay kayak kazakhstan keane keating keaton keel keen keep keeper keepers keeping keeps kei keller kelley kellogg kelly kelsey kelvin kemp ken kendall kendrick kennedy kennel kenny kensington kent kenya kenyan kepler kept kerala kern kernel kerr kerry kershaw kessler ketchup kettle kev key keyboard keyboards keynes keynote keys keystone keyword keywords kfc kgb khaled khalid khalifa khan kia kick kicked kicker kicking kickoff kicks kickstarter kid kidd kidding kiddo kidnap kidnapped kidnapping kidney kidneys kiev kill killed killer killers killing killings kills kilograms kilometer kilometers kilometre kilometres kilos kim kimi kimmel kin kinase kind kinda kinder kindergarten kindle kindly kindness kindred kinds kinetic king kingdom kingdoms kings kingsley kingston kink kinks kinky kira kirby kirk kiss kissed kisses kissing kit kitchen kitchens kite kits kitten kittens kitty kiwi kkk klein knack knee kneel kneeling knees knew knicks knife knight knights knit knitted knitting knives knob knock knocked knocking knockout knocks knot knots know knowing knowingly knowledge knowledgeable knowles known knows knox knuckle knuckles kobe kodak koh kolkata kong kool korea koreans kosher kosovo kraft kramer kremlin kristina kruger kuala kudos kun kung kurds kuwait kyle kylie kyoto kyrgyzstan lab label labeled labeling labelled labelling labels labor laboratories laboratory laborers labour labourers labs labyrinth lac lace laced lacey lack lacked lacking lacks lacrosse lacy lad ladder ladders laden ladies lads lady lafayette lag lager lagging lagoon lagos laguna lahore lai laid lair laird lake lakers lakes lakh lam lama lamar lamb lambert lamborghini lambs lame lament lamont lamp lamps lan lancashire lance land landed lander landfill landing landings landlord landlords landmark landmarks landowners lands landscape landscapes landscaping landslide lane lanes lang lange langley language languages lanka lankan lansing lantern lanterns laos lap lapd laps lapse laptop laptops lara large largely larger largest lark larkin larry larsen larson larvae las laser lasers lash lashes last lasted lasting lastly lasts latch late lately latency latent later lateral latest latex latina latino latinos latitude latte latter lattice latvia lau lauded lauderdale laugh laughable laughed laughing laughs laughter launch launched launcher launchers launches launching laundering laundry laura laureate laurel lauren lava lavender lavish law lawful lawless lawmakers lawn lawns laws lawsuit lawsuits lawyer lawyers lax lay layer layered layers laying layout layouts lays laziness lazy lbs lcd lds lea leach lead leader leaders leadership leading leaf leaflets leafs leafy league leagues leak leakage leaked leaking leaks lean leaned leaning leans leap leaping leaps lear learn learned learner learners learning learns learnt lease leased leases leash leasing least leather leave leaves leaving lebanon lebron lecture lecturer lecturers lectures lecturing led ledge ledger lee leech leeds left leftist leftists leftover leftovers lefty leg legacy legal legality legalization legalize legalized legally legend legendary legends legged leggings legion legions legislation legislative legislator legislators legislature legislatures legit legitimacy legitimate legitimately lego legs lehman lei leighton leipzig leisure leland lemme lemon lemonade lemons lend lender lenders lending lends length lengths lengthy lenin lennon lennox lens lenses lent leonardo leone leopard leroy lesbians lesions lesley less lessen lesser lesson lessons lest let lethal lets letter lettering letterman letters letting lettuce leukemia lev levant level leveled leveling levels lever leverage levied levin levine levy lew lewd lewis lexington lexus lgbt lgbtq liabilities liability liable liaison liar liars lib libel liberal liberalism liberals liberate liberated liberating liberation libertarian liberties liberty librarian librarians libraries library libs libya lice licence licences license licensed licenses licensing lick licked licking lid lie lied lien lies lieu lieutenant life lifeboat lifeless lifeline lifelong lifespan lifestyle lifestyles lifetime lift lifted lifting lifts liga ligament light lighted lighten lighter lighthouse lighting lightly lightning lights lightweight like liked likelihood likely likeness likes likewise liking lil lilies lillian lilly lily lim limb limbo limbs lime limestone limit limitation limitations limited limiting limitless limits limo limousine limp lin lincolnshire linden line lineage linear linebacker lined lineman linen liner liners lines lineup ling linger lingerie lingering linguistic linguistics lining link linkage linked linking links linux lion lionel lions lip lipid lips lipstick liquid liquidation liquidity liquids liquor list listed listen listened listener listeners listening listens listing listings lists lit lite liter literacy literal literally literary literate literature liters lithium lithuania litigation litre litres litter little liturgy liu live lived livelihood lively liver liverpool lives livestock livin living livingston lizard lizards llc llp lmao lmfao lng load loaded loading loads loaf loan loaned loans loathing lobby lobbying lobbyists lobe lobes lobster loc local localities locality localization localized locally locals locate located locating location locations loch lock lockdown locke locked locker lockhart lockheed locking locks loco locomotive locomotives locus lodge lodged lodges lodging loft lofty log logan logged logging logic logical logically login logistical logistics logo logos logs loki lol lollipop lon london lone loneliness lonely long longer longest longevity longing longitude longitudinal longstanding longtime loo look looked lookin looking lookout looks loom looming looms loop loophole loops loose loosely loosen loot looted looting lopez lord lorde lords lordship lore loretta lori lorry los lose loser losers loses losing loss losses lost lot lotion lots lottery lotto lotus loud louder loudest loudly louisville lounge lousy lovable love loved lovely lover lovers loves lovin loving lovingly low lowe lower lowered lowering lowers lowest lowly lowry lows loyal loyalists loyalty lsd lsu ltd lte luca lucid lucille luck luckily lucky lucrative lucy ludicrous luggage luiz luka lulu lumber luminous lump lumps lumpur luna lunar lunatic lunch luncheon lunches lunchtime lund lung lungs lupus lure lured lurking lush lust lux luxembourg luxurious luxury lvl lyft lying lyle lyme lymph lymphoma lynch lyons lyric lyrical lyrics mac macarthur macau macbook macdonald mace macedonia mach machete machine machinery machines macho mack mackay mackenzie macleod macmillan macquarie macro mad madam madame madden maddie made madeleine madeline madison madly madman madness mae maestro mafia mag magazine magazines magic magical magically magician magistrate magistrates magma magna magnesium magnet magnetic magnets magnificent magnitude magnolia magnum maguire mahal maharashtra maher mahogany mai maid maiden maids mail mailbox mailed mailing mails main mainland mainly mains mainstream maintain maintained maintaining maintains maintenance maize maj majestic majesty major majority majors make makeover maker makers makes makeshift makeup makin making mal malaria malawi malaysia maldives male males malfunction mali malibu malice malicious malignant malik mall mallory malls malnutrition malone malpractice malt malta malware mama mamma mammal mammalian mammals mammoth man mana manage manageable managed management manager managerial managers manages managing mandarin mandate mandated mandates mandatory mandela mandy mane maneuver maneuvers manga mango manhood mani mania maniac manic manifest manifestation manifestations manifested manifesto manifests manifold manila manipulate manipulated manipulating manipulation manipulative manitoba mankind manly manned manner manners manning manny manor manpower mansfield mansion mansions manslaughter manson mantle mantra manu manual manually manuals manufacture manufactured manufacturer manufacturers manufactures manufacturing manure manuscript manuscripts many mao map maple mapped mapping maps mar marathon marble marbles marc marcel march marched marches marching marco marcus mardi mare margarita margin marginal marginalized marginally margins mariah marijuana marin marina marine mariners marines marino marital maritime mark marked markedly marker markers market marketed marketers marketing marketplace markets marking markings marks marley marlins marlon maroon marquee marquis marriage marriages married marries marriott marrow marry marrying marseille marsh marshal marshals marshes marshmallow mart marta martial martin martini martyr martyrdom martyrs marvel marvellous marvelous marx mas mascara mascot masculine masculinity mash mashed mask masked masks mason masonic masonry mass massachusetts massacre massage masse masses massey massive massively mast master mastered mastering mastermind masterpiece masterpieces masters mastery masturbate masturbating masturbation mat mata match matched matches matching matchmaking matchup mate mateo mater material materially materials maternal maternity mates math mathematical mathematically mathematician mathematics mathews mathieu maths matilda mating matrices matrix matte matteo matter mattered matters matthews mattress mature matured maturity maui mauritius maverick mavericks maxi maxim maximize maximum maxine maxwell may maya maybe mayhem maynard mayonnaise mayor mayoral mayors mayweather maze mba mcbride mccain mccall mccann mccarthy mccartney mcconnell mccormick mccoy mcdermott mcdonald mcdonalds mcdonnell mcdowell mcgee mcgill mcgrath mcgraw mcgregor mcguire mckenna mckenzie mckinley mclaren mclaughlin mclean mcleod mcmahon mcmillan mcnamara mcqueen mead meade meadow meadows meal meals mean meaning meaningful meaningless meanings means meant meantime meanwhile measles measurable measure measured measurement measurements measures measuring meat meatballs meats mechanic mechanical mechanically mechanics mechanism mechanisms med medal medalist medals meddling media medial median mediated mediation mediator medic medicaid medical medically medicare medication medications medicinal medicine medicines medics medieval mediocre meditate meditation mediterranean medium medley meds meek meet meeting meetings meets meetup mega megan meghan meh mei mein mel melancholy melanie melanoma melbourne melee mellon mellow melo melodic melodies melody melon melt meltdown melted melting melts melville melvin member members membership memberships membrane membranes meme memes memo memoir memoirs memorabilia memorable memorandum memorial memorials memories memorize memory memphis men menace menacing mend mendes mendoza meng meningitis menopause mens menstrual mental mentality mentally mention mentioned mentioning mentions mentor mentoring mentors menu menus meow meps mercantile mercenaries mercenary mercer merch merchandise merchandising merchant merchants merciful mercy mere meredith merely merge merged merger mergers merging meridian merit merits merkel merlin mermaid merrill merritt merry meryl mesa mesh mess message messages messaging messed messenger messengers messes messi messing messy met meta metabolic metabolism metadata metal metallic metallica metals metaphor metaphors metaphysical meteor meteorite meteorological meteorology meter meters meth methane method methodist methodology methods methyl meticulous metre metres metric metrics metro metropolis metropolitan mets mexicans mexico meyer meyers mgm mhz mic mice mich michaels michelangelo michele michelin michigan mick micro microbes microbial microbiology microphone microphones microscope microscopic microscopy microwave mid midday middle middlesbrough middlesex middleton midfield midfielder midfielders midget midi midland midlands midnight midst midterm midterms midtown midway midwife might mighty migraine migrant migrants migrate migrated migrating migration migratory mika mike mikhail mil milano mild mildly mile mileage milestone milestones miley milf milford miliband militant militants military militia militias milk milking milky mill millennia millennial millennials millennium miller milling million millionaire millionaires millions mills milne milner milo milton milwaukee mimic min mina mind minded mindful mindfulness mindless minds mindset mine minecraft mined miner mineral minerals miners mines ming mingle mini miniature minimal minimise minimize minimizing minimum mining minions minister ministerial ministers ministries ministry mink minneapolis minnesota minnie minor minorities minority minors mins mint minus minute minutes mir miracle miracles miraculous miraculously mirage mirror mirrored mirrors mis miscarriage miscellaneous mischief mischievous misconception misconceptions misconduct misdemeanor miserable miserably misery misfortune misguided misinformation mislead misleading misled misogyny misplaced miss missed misses missile missiles missing mission missionaries missionary missions missy mist mistake mistaken mistakenly mistakes mister mistress misty misunderstand misunderstanding misunderstood misuse mit mitigate mitigating mitigation mitochondrial mitsubishi mitt mix mixed mixer mixes mixing mixtape mixture mla mlb mls mma mmm moan moaning mob mobile mobility mobilization mobilize mobilized mobs mock mocked mockery mocking mode model modeled modeling modelled modelling models modem moderate moderated moderately moderation moderator modern modernist modernity modernization modes modest modesty modi modification modifications modified modify modifying mods modular modulation module modules mohamed mohammed moines moist moisture mojo mol mold molded molding moldova mole molecular molecule molecules molested molly molten mom moment momentarily moments momentum momma mommy moms mon monaco monarch monarchs monarchy monastery mondays monetary money mongolia monies monitor monitored monitoring monitors monk monkey monkeys monks mono monograph monologue monopoly monoxide monroe monsanto monsieur monsoon monster monsters monstrous montage montana monte montenegro montgomery month monthly months montreal monument monumental monuments moo mood moods moody moon moonlight moons moor moors moose moot mop mor moral morale morales morality morally morals morbid more moreno moreover morgan morley mormon morning mornings morocco moron morons morphine morphological morphology morris morrison morrow morse mortal mortality mortals mortar mortars mortem mortgage mortgages mos mosaic mosque mosques mosquito mosquitoes moss most mostly motel moth mother motherboard motherfucker motherfuckers motherfucking motherhood mothers moths motif motifs motion motions motivate motivated motivates motivating motivation motivational motivations motive motives moto motor motorbike motorcycle motorcycles motorists motorola motors motorsport motorway motto mould mound mounds mount mountain mountainous mountains mounted mounting mounts mourinho mourn mourning mouse moustache mouth mouths movable move moved movement movements mover movers moves movie movies moving moyes mozambique mozart mph mps mri mrna msc msg msm msnbc msu mtv mubarak much mucus mud muddy mueller muffin muffins mug mugs muhammad muir mulberry mule muller multi multicultural multimedia multinational multiplayer multiple multiples multiplication multiplied multiplier multiply multitude mum mumbai mummy mums mundane municipal municipalities municipality munitions munro mural murals murder murdered murderer murderers murdering murderous murders murdoch murphy muscle muscles muscular muse museum museums mushroom mushrooms music musical musically musicals musician musicians musk muslim muslims mussolini must mustache mustafa mustang mustard muster mustered mutant mutants mutation mutations mute muted mutilated mutilation mutiny mutual mutually muzzle mvp myanmar myers myles myriad myrtle myself myspace mysteries mysterious mysteriously mystery mystic mystical myth mythical mythology myths nada nadal nadia nadine nadu nafta nag nagging nah nail nailed nails nairobi naive naked nam name named nameless namely names namibia naming nan nana nancy nanny nano nap napa napkin naples napoleon napoli narcissistic narcotics narrated narration narrative narratives narrator narrow narrowed narrower narrowing narrowly naruto nas nasa nasal nascar nasdaq nash nashville nasty nat natal natasha nation national nationalism nationalist nationalists nationalities nationality nationally nationals nations nationwide native natives nativity nato natural naturalist naturally nature naughty nausea nautical nav naval navigate navigating navigation navigator navy naw nay nazis nba nbc ncaa ndp neal near nearby nearer nearest nearing nearly neat neatly nebraska nebula nec necessarily necessary necessities necessity neck necklace necklaces necks nectar nee need needed needing needle needles needless needs needy negative negatively negatives negativity neglect neglected neglecting negligence negligent negligible negotiable negotiate negotiated negotiating negotiation negotiations negro nehru neighbor neighborhood neighborhoods neighboring neighbors neighbour neighbourhood neighbourhoods neighbouring neighbours neither nelson nemo neo neon nephew nephews nerd nerds nerdy nero nerve nerves nervous nervously nes ness nest nesting nests net netanyahu netherlands nets netting network networking networks neural neurological neurology neuron neurons neuroscience neutral neutrality neutron nev never nevermind nevertheless new newark newbie newborn newcomer newcomers newer newest newfound newly newman news newsletter newspaper newspapers newsroom newsweek newt newton newtown next nexus neymar nfc nfl ngo ngos nhl nhs nic nice nicely nicer nicest niche nichols nicholson nick nickel nicki nickname nicknamed nicknames nicky nico nicola nicole nicotine niece nielsen nietzsche nifty niger nigeria nigerians nigga nigger nigh night nightclub nightingale nightlife nightly nightmare nightmares nights nighttime nih nikki nikon nil niles nine nineteen nineteenth nineties ninety nino nintendo ninth nip nipple nipples nirvana nissan nitrate nitro nitrogen nixon noaa nobel nobility noble nobles nobody nocturnal nod nodded nodding node nodes nods noel noir noise noises noisy nokia nolan nom nomenclature nominal nominate nominated nominating nomination nominations nominee nominees non none nonetheless nonexistent nonfiction nonlinear nonprofit nonsense nonstop noodle noodles nook noon nope nor norm norma normal normalized normally normandy norms norris north northampton northbound northeast northeastern northern northumberland northward northwest northwestern norton norwich norwood nos nose nosed noses nostalgia nostalgic not notable notably notation notch note notebook notebooks noted notes noteworthy nothin nothing notice noticeable noticeably noticed notices noticing notification notifications notified notify noting notions notoriety notorious notoriously notre nottingham notwithstanding noun nouns nov nova novak novel novelist novels novelty novice now nowadays nowhere nozzle npr nra nrl nsa nsfw nsw nuanced nuances nuclear nuclei nucleus nude nudes nudge nudity nugget nuggets nuisance nuke nukes null numb number numbered numbering numbers numerical numerous nun nuns nurse nursery nurses nursing nurture nurturing nut nutrient nutrients nutrition nutritional nutritious nuts nutshell nutty nxt nyc nye nylon nypd nyse nyt nyu oak oakland oakley oaks oasis oath oatmeal oats obama obamacare obedience obedient obese obesity obey obi obituary object objected objection objections objective objectively objectives objects obligated obligation obligations obligatory obliged oblique oblivion oblivious obnoxious obscene obscure obscured obscurity observation observational observations observatory observe observed observer observers observes observing obsessed obsession obsessive obsolete obstacle obstacles obstruction obtain obtained obtaining obvious obviously occasion occasional occasionally occasions occult occupancy occupants occupation occupational occupations occupied occupies occupy occupying occur occurred occurrence occurrences occurring occurs ocd ocean oceanic oceans oct octopus oculus odd oddly odds ode odessa odi odor oecd oem ofc off offence offences offend offended offender offenders offending offense offenses offensive offer offered offering offerings offers office officer officers offices official officially officials officiating offline offs offseason offset offshore offside offspring oft often ofthe ogden ohh ohhh oil oilers oils oily okay okinawa old older oldest oldham olds olive olives olsen olympics ombudsman omega omg ominous omission omitted omnibus onboard once oncology one ones oneself ongoing onion onions online only ono ons onset onslaught onstage ontario onto onward onwards oof ooh ooo oooh oops opal opaque opec open opened opener opening openings openly openness opens opera operas operate operated operates operating operation operational operations operative operatives operator operators opinion opinions opioid opium opponent opponents opportunities opportunity oppose opposed opposes opposing opposite opposites opposition oppressed oppression oppressive oprah ops opt opted optic optical optics optimal optimism optimistic optimization optimize optimized optimum opting option optional options opus oral orange oranges orb orbit orbital orbiting orbits orchard orchards orchestra orchestral orchestrated orchid ordained ordeal order ordered ordering orderly orders ordinance ordinances ordinarily ordinary ordination ordnance ore oregon org organ organic organisation organisational organisations organise organised organisers organising organism organisms organization organizational organizations organize organized organizer organizers organizing organs orgasm orgasms orgy orient oriental orientation oriented origin original originality originally originals originate originated originates originating origins orioles ornament ornamental ornaments ornate orphan orphanage orphaned orphans orr orthodox orthodoxy ortiz orton orwell osaka osama osborne oscars oslo ost ostensibly osu otc other others otherwise otter otto ouch ought ounce ounces our ours ourselves ousted out outage outback outbreak outbreaks outburst outcome outcomes outcry outdated outdoor outdoors outer outfit outfits outgoing outing outlaw outlawed outlaws outlet outlets outline outlined outlines outlining outlook outnumbered outpatient outpost output outputs outrage outraged outrageous outreach outright outs outset outside outsider outsiders outskirts outsourcing outspoken outstanding outta outward outweigh ova oval ovarian ovaries ovation oven ovens over overall overarching overboard overcame overcome overcoming overdose overdrive overdue overflow overflowing overhaul overhead overheard overland overlap overlapping overlay overload overlook overlooked overlooking overly overnight overrated override overrun overs oversaw overseas oversee overseeing overseen oversees overshadowed oversight oversized overt overtake overtaken overthrow overtime overtly overturn overturned overview overwatch overweight overwhelm overwhelmed overwhelming overwhelmingly owe owed owens owes owing owl owls own owned owner owners ownership owning owns oxfordshire oxidation oxide oxygen oyster oysters ozone pablo pac pace paced pacers paces pacific pacing pack package packaged packages packaging packard packed packer packers packet packets packing packs pact pad padded padding paddle paddy padres pads pagan page pageant pages paid paige pain paine painful painfully painless pains paint painted painter painters painting paintings paints pair paired pairing pairs pajamas pak pakistan pal palace palaces palate pale paleo palestine palestinians palette palin palladium palm palmer palms palo palpable pals palsy pam pamphlet pamphlets pan panama panasonic pancake pancakes pancreas pancreatic panda pandas pandemic pandora panel panels panic panicked panicking panorama panoramic pans pant pantheon panther panthers panties pantry pants paolo pap papa papal paparazzi paper paperback papers paperwork papua par para parachute parade parades paradigm paradise paradox paragraph paragraphs parallel parallels paralympic paralympics paralysis paralyzed paramedic paramedics parameter parameters paramilitary paramount paranoia paranoid paranormal parasite parasites parasitic parcel parcels parchment pardon parent parental parenthood parenting parents parish parishes parity park parked parker parking parkinson parks parkway parliament parliamentary parlor parlour parody parole parrot parry parsley parsons part partake parted partial partially participant participants participate participated participates participating participation particle particles particular particularly particulars parties parting partisan partition partly partner partnered partnering partners partnership partnerships partridge parts party partying pas pasadena pasha paso pass passage passages passed passenger passengers passer passes passing passion passionate passionately passions passive passover passport passports password passwords past pasta paste pastel pastor pastoral pastors pastry pasture pastures pat patch patched patches patent patented patents paternal paternity paterson path pathetic pathogen pathogens pathological pathologist pathology paths pathway pathways patience patient patiently patients patio patriarch patriarchal patriot patriotic patriotism patriots patrol patrolling patrols patron patronage patrons pats pattern patterned patterns patterson patti patton patty paulo pause paused pauses pave paved pavement pavilion paving paw pawn paws pax paxton pay payable payback paycheck payday payer payers paying payload payment payments payne payoff payout paypal payroll pays pbs pcb pci pcr pcs pct pdf pea peabody peace peaceful peacefully peacekeeping peach peaches peacock peak peaked peaks peanut peanuts pear pearce pearl pearls pears pearson peas peasant peasants peat pebble pebbles peck peculiar pedal pedals pedestal pedestrian pedestrians pediatric pediatrics pedigree pedophile pedro pee peeing peek peel peeled peeling peep peer peers peg peggy pelicans pellets pelosi pelvic pelvis pen penal penalties penalty pence pencil pencils pendant pending pendulum penetrate penetrated penetrating penetration peng penguin penguins peninsula penis penitentiary penn penned pennies penny pens pension pensioners pensions pentagon penthouse people peoples pep pepe pepper peppers pepsi peptide peptides per perceive perceived percent percentage percentages perception perceptions perch perched percussion perennial perez perfect perfected perfection perfectly perform performance performances performed performer performers performing performs perfume perhaps peril perilous perimeter period periodic periodical periodically periodicals periods peripheral periphery perish perished perjury perk perkins perks permanent permanently permissible permission permit permits permitted permitting perpendicular perpetrated perpetrator perpetrators perpetual perpetually perpetuate perry persecuted persecution perseverance persia persist persisted persistence persistent persists person persona personal personalised personalities personality personalized personally personnel persons perspective perspectives persuade persuaded persuasion persuasive pertaining perth pertinent pervasive perverse pervert perverted pesos pessimistic pest pesticide pesticides pests pet peta petals pete peterborough peters petersburg petersen peterson petit petite petition petitions petra petrol petroleum pets petty pew peyton pga phantom pharma pharmaceutical pharmaceuticals pharmacies pharmacist pharmacists pharmacology pharmacy phase phased phases phd phelps phenomena phenomenal phenomenon phew phi philadelphia philanthropic philanthropy philharmonic philips phillies phillips philly philosopher philosophers philosophical philosophies philosophy phoebe phoenix phone phoned phones phony phosphate phosphorus photo photograph photographed photographer photographers photographic photographing photographs photography photon photons photos photoshop photoshopped php phrase phrases physical physically physician physicians physicist physicists physics physiological physiology physique pianist piano piazza pic picasso pick picked pickering picket picking pickle pickled pickles picks pickup pickups picky picnic pics pictorial picture pictured pictures picturesque pie piece pieces pier pierce pierced piercing piers pies pig pigeon pigeons piggy pigment pigs pikachu pike pile piled piles pilgrim pilgrimage pilgrims piling pill pillar pillars pillow pillows pills pilot pilots pimp pin pinch pinched pine pineapple pines ping pink pinky pinnacle pinned pinpoint pins pint pinterest pints pioneer pioneered pioneering pioneers pious pip pipe pipeline pipelines piper pipes piping piracy pirate pirates piss pissed pisses pissing pistol pistols piston pistons pit pitch pitched pitcher pitchers pitches pitching pitfalls pitiful pits pitt pitted pittsburgh pity pivot pivotal pixar pixel pixels pixie pizza pizzas pla place placebo placed placement placements places placing plagiarism plague plagued plaid plain plainly plains plaintiff plaintiffs plan plane planes planet planetary planets plank planned planner planners planning plans plant plantation plantations planted planting plants plaque plaques plasma plaster plastered plastic plastics plate plateau plated plates platform platforms plating platinum plato platoon platter plausible play playa playable playback playbook playboy played player players playful playground playhouse playing playlist playlists playoff playoffs plays playstation playwright plaza plc plea plead pleaded pleading pleads pleas pleasant pleasantly please pleased pleases pleasing pleasure pleasures pledge pledged pledges plentiful plenty plethora plight plot plots plotted plotting plow ploy pls plucked plug plugged plugin plugs plum plumber plumbing plume plump plunge plunged plural plurality plus plush plutonium ply plywood plz pneumonia png poaching pocket pockets pod podcast podcasts podium pods poe poem poems poet poetic poetry poets poignant point pointed pointer pointers pointing pointless points poised poison poisoned poisoning poisonous poisons poke poked pokemon poker poking pol poland polar polarization polarized pole poles police policeman policemen policies policing policy policymakers polio polish polished polishing polite politely political politically politician politicians politico politics polk polka poll pollard polled pollen polling pollock polls pollutants polluted pollution polo poly polymer polymers polytechnic pom pond ponder ponds pong ponies pont pony poo pooh pool poole pools poop poor poorer poorest poorly pop popcorn pope popped popping poppy pops populace popular popularity popularly populated population populations populous por porcelain porch pore pores pork porn porno pornographic pornography porous porsche port portable portal portals porter portfolio portfolios portion portions portland porto portrait portraits portray portrayal portrayed portraying portrays ports portsmouth pos pose posed poses posh posing position positioned positioning positions positive positively positives positivity posse possess possessed possesses possessing possession possessions possessive possibilities possibility possible possibly post postage postal postcard postcards posted poster posterior posters postgraduate posting postings postmaster postpone postponed posts postseason posture postwar pot potassium potato potatoes potency potent potential potentially potion potomac pots potter pottery potts potty pouch poultry pound pounded pounding pounds pour poured pouring pours pov poverty pow powder powdered powders powell power powered powerful powerfully powerhouse powering powerless powerpoint powers ppl ppm ppp practical practically practice practiced practices practicing practise practised practising practitioner practitioners prada pradesh pragmatic prague prairie praise praised praises praising prank pranks pray prayed prayer prayers praying pre preach preached preacher preachers preaching precarious precaution precautions preceded precedence precedent preceding precinct precious precipitation precise precisely precision precursor predator predators predatory predecessor predecessors predetermined predicament predict predictable predicted predicting prediction predictions predictive predicts predominant predominantly preface prefecture prefer preferable preferably preference preferences preferential preferred preferring prefers prefix pregnancies pregnancy pregnant prehistoric prejudice prejudices preliminary prelude prem premature prematurely premier premiere premiered premieres premiership premise premises premium premiums prenatal prentice preoccupied prep prepaid preparation preparations preparatory prepare prepared preparedness prepares preparing prepping prequel prerequisite pres preschool prescott prescribe prescribed prescribing prescription prescriptions preseason presence present presentation presentations presented presenter presenters presenting presently presents preservation preserve preserved preserves preserving presided presidency president presidential presidents presiding press pressed presses pressing pressure pressured pressures prestige prestigious preston presumably presume presumed presumption pretend pretended pretending pretends pretentious pretext pretoria prettier prettiest pretty prevail prevailed prevailing prevalence prevalent prevent preventable prevented preventing prevention preventive prevents preview previews previous previously prey price priced priceless prices pricey pricing prick pride priest priesthood priests prima primal primaries primarily primary primate prime primed primer primetime primitive prince princes princess princesses princeton principal principally principals principle principles print printed printer printers printing prints prior priorities prioritize priority prism prison prisoner prisoners prisons pristine pritchard privacy private privately privatization privilege privileged privileges privy prix prize prized prizes pro proactive prob probabilities probability probable probably probate probation probe probes probing problem problematic problems proc procedural procedure procedures proceed proceeded proceeding proceedings proceeds process processed processes processing procession processor processors proclaim proclaimed proclaiming proclamation proctor procure procurement prod prodigy produce produced producer producers produces producing product production productions productive productivity products prof profession professional professionalism professionally professionals professions professor professors proficiency proficient profile profiles profiling profit profitability profitable profits profound profoundly prog prognosis program programme programmed programmer programmers programmes programming programs progress progressed progresses progressing progression progressive progressively progressives prohibit prohibited prohibiting prohibition prohibits project projected projectile projecting projection projections projector projects proliferation prolific prologue prolong prolonged prom promenade prominence prominent prominently promise promised promises promising promo promote promoted promoter promoters promotes promoting promotion promotional promotions prompt prompted prompting promptly prompts prone pronoun pronounce pronounced pronouns pronunciation proof proofs prop propaganda propagation propane propel propelled propeller propensity proper properly properties property prophecy prophet prophetic prophets proponent proponents proportion proportional proportions proposal proposals propose proposed proposes proposing proposition proprietary proprietor props propulsion pros prose prosecute prosecuted prosecuting prosecution prosecutions prosecutor prosecutors prospect prospective prospects prospectus prosper prosperity prosperous prostate prosthetic prostitute prostitutes prostitution protagonist protagonists protect protected protecting protection protections protective protector protectors protects protein proteins protest protestant protestants protested protesters protesting protestors protests proto protocol protocols proton prototype prototypes protracted proud proudly prove proved proven provenance proverb proverbs proves provide provided providence provider providers provides providing province provinces provincial proving provision provisional provisions provocation provocative provoke provoked provoking provost prowess proximal proximity proxy prudent prussia pryor psa psalm psalms pseudo psg psi psp pst psych psyche psychedelic psychiatric psychiatrist psychiatrists psychiatry psychic psycho psychological psychologically psychologist psychologists psychology psychopath psychosis psychotherapy psychotic pts ptsd pty pub puberty public publication publications publicity publicized publicly publish published publisher publishers publishes publishing pubs puck pudding puddle pueblo puerto puff puke pulitzer pull pulled pulling pulls pulmonary pulp pulpit pulse pulses puma pump pumped pumping pumpkin pumpkins pumps pun punch punched punches punching punctuation puncture pundits pune punish punishable punished punishing punishment punishments punitive punjab punk puns punt pup pupil pupils puppet puppets puppies puppy pups purchase purchased purchaser purchasers purchases purchasing purdue pure purely purest purge purification purified purity purple purported purpose purposely purposes purse pursuant pursue pursued pursuing pursuit pursuits push pushed pushes pushing pussies pussy put putin putnam puts putt putting puzzle puzzled puzzles pvc pvt pyramid pyramids python qaeda qatar qld quad quadrant quadruple quaint quake quaker qualification qualifications qualified qualifier qualifiers qualifies qualify qualifying qualitative qualities quality quantify quantitative quantities quantity quantum quarantine quarrel quarry quarter quarterback quarterbacks quarterfinals quarterly quarters quartet quartz quasi quay que quebec queen queens queensland queer quentin queries query quest question questionable questioned questioning questionnaire questions quests queue queues qui quick quicker quickest quickly quid quiet quieter quietly quilt quincy quinn quirky quit quite quits quitting quiz quo quota quotas quotation quotations quote quoted quotes quoting quran rabbi rabbit rabbits rabies raccoon race raced racer racers races rachael racial racially racing racism racist racists rack racket racking racks rad radar radcliffe radial radiant radiation radiator radical radically radicals radio radioactive radiology radios radius rae raf raffle raft rag rage ragged raging rags rahman rai raid raided raider raiders raiding raids rail railing railroad railroads rails railway railways rain rainbow rainbows rained rainfall rainforest raining rains rainy raise raised raises raising raisins raja rajasthan rake raleigh rallied rallies rally rallying ralph ram ramadan rambling ramen ramifications ramirez ramos ramp rampage rampant ramps rams ramsay ran rana ranch rancho rand random randomized randomly randy rang range ranged ranger rangers ranges ranging rank ranked rankin ranking rankings ranks ransom rant ranting rap rape raped rapes rapid rapidly rapids raping rapist rapists rapper rappers rapping rapport raptor raptors rapture rare rarely rarity ras rash raspberry rat ratchet rate rated rates rather ratification ratified rating ratings ratio ration rational rationale rations ratios rats rattle rattled rattling ravaged rave raven ravens ravine raving raw ray rays razor rbi rbs rca rea reach reached reaches reaching react reacted reacting reaction reactionary reactions reactive reactor reactors reacts read readable reader readers readily readiness reading readings reads ready reagan real realisation realise realised realises realising realism realist realistic realistically realities reality realization realize realized realizes realizing really realm realms realtor realty reap reaper rear reason reasonable reasonably reasoned reasoning reasons reassurance reassure reassuring rebate rebates rebel rebellion rebellious rebels rebirth reboot reborn rebound rebounds rebuild rebuilding rebuilt rec recall recalled recalling recalls recap recapture receipt receipts receive received receiver receivers receives receiving recent recently reception receptionist receptions receptive receptor receptors recess recession recharge recipe recipes recipient recipients reciprocal recital recite recited reckless reckon reckoned reckoning reclaim reclaimed reclamation recognise recognised recognises recognising recognition recognizable recognize recognized recognizes recognizing recoil recollection recommend recommendation recommendations recommended recommending recommends recon reconcile reconciled reconciliation reconnaissance reconnect reconsider reconstruct reconstructed reconstruction record recorded recorder recorders recording recordings records recount recounted recounts recourse recover recovered recovering recovers recovery recreate recreated recreation recreational recruit recruited recruiter recruiters recruiting recruitment recruits rectangle rectangular rectify rector recurrence recurrent recurring recycle recycled recycling red reddish redeem redeemed redemption redesign redesigned redevelopment redhead redirect redistribution redmond redo redress reds redskins reduce reduced reduces reducing reduction reductions redundancy redundant redwood reece reed reef reefs reel reelection reese reeves ref refer referee referees reference referenced references referencing referendum referral referrals referred referring refers refill refine refined refinement refineries refinery refining reflect reflected reflecting reflection reflections reflective reflects reflex reflexes reform reformation reformed reforming reforms refrain refresh refreshed refreshing refrigeration refrigerator refs refuge refugee refugees refund refunded refunds refurbished refusal refuse refused refuses refusing refute reg regain regained regal regan regard regarded regarding regardless regards regency regenerate regeneration regent regents reggae regime regimen regiment regiments regimes regina region regional regions regis register registered registering registers registrar registration registry regression regret regrets regretted regular regularly regulars regulate regulated regulates regulating regulation regulations regulator regulators regulatory rehab rehabilitation rehearsal rehearsals reich reign reigned reigning reigns reilly reimbursement rein reincarnation reindeer reinforce reinforced reinforcement reinforcements reinforces reinforcing reins reinstated reiterated reject rejected rejecting rejection rejects rejoice rejoin relapse relatable relate related relates relating relation relational relations relationship relationships relative relatively relatives relativity relax relaxation relaxed relaxing relay relays release released releases releasing relegated relegation relentless relentlessly relevance relevant reliability reliable reliably reliance reliant relic relics relied relief relies relieve relieved relieving religion religions religious religiously relish relive reload relocate relocated relocating relocation reluctance reluctant reluctantly rely relying rem remain remainder remained remaining remains remake remanded remark remarkable remarkably remarked remarks remastered rematch remedies remedy remember remembered remembering remembers remembrance remind reminded reminder reminders reminding reminds reminiscent remission remix remnant remnants remodeling remorse remote remotely removable removal remove removed removes removing remuneration remy ren renaissance renal rename renamed renault render rendered rendering renders rendezvous rendition rene renee renegade renew renewable renewables renewal renewed renewing reno renounce renovated renovation renovations renowned rent rental rentals rented renters renting rents reopen reopened reopening reorganization rep repaid repair repaired repairing repairs reparations repay repayment repeal repealed repeat repeated repeatedly repeating repeats repel repent repentance repercussions repertoire repetition repetitive replace replaced replacement replacements replaces replacing replay replays replica replicate replicated replication replied replies reply replying report reported reportedly reporter reporters reporting reports repository repost represent representation representations representative representatives represented representing represents repressed repression reprint reprinted reproduce reproduced reproduction reproductive reps reptile reptiles republic republican republicans republics repulsive reputable reputation reputed request requested requesting requests require required requirement requirements requires requiring requisite res resale rescue rescued rescues rescuing research researched researcher researchers researches researching resemblance resemble resembled resembles resembling resent resentment reservation reservations reserve reserved reserves reservoir reservoirs reset resettlement reside resided residence residences residency resident residential residents resides residing residual residue residues resign resignation resigned resigning resigns resilience resilient resin resist resistance resistant resisted resisting resolution resolutions resolve resolved resolving resonance resonate resort resorted resorting resorts resource resources respect respectable respected respectful respectfully respecting respective respectively respects respiratory respite respond responded respondents responders responding responds response responses responsibilities responsibility responsible responsibly responsive rest restart restaurant restaurants rested resting restitution restless restoration restore restored restoring restrain restrained restraining restraint restraints restrict restricted restricting restriction restrictions restrictive restroom restructuring rests result resulted resulting results resume resumed resumes resurgence resurrected resurrection ret retail retailer retailers retain retained retaining retains retake retaliation retard retarded retention rethink retina retire retired retirees retirement retires retiring retreat retreated retreating retreats retribution retrieval retrieve retrieved retro retrospect retrospective return returned returning returns reunion reunite reunited reusable reuse reuters rev revamp revamped reveal revealed revealing reveals revelation revelations revenge revenue revenues revered reverence reverend reversal reverse reversed reversible reversing revert reverted review reviewed reviewer reviewers reviewing reviews revise revising revision revisions revisit revisited revival revive revived reviving revoke revoked revolt revolution revolutionaries revolutionary revolutions revolve revolver revolves revolving reward rewarded rewarding rewards rewind rewrite rewriting rewritten rex rey reyes reynolds rhetoric rhetorical rhine rhino rhinos rhode rhyme rhymes rhys rhythm rhythmic rhythms rib ribbon ribbons ribs rica rican rice rich richards richardson richer riches richest richie richly richness richter rick rico rid ridden riddle riddled ride rider riders rides ridge ridges ridicule ridiculed ridiculous ridiculously riding ridley rife riff rifle rifles rift rig rigged rigging right righteous righteousness rightful rightfully rightly rights rigid rigorous rigs rihanna riley rim rims rin ring ringing ringo rings rink rinse rio riot rioting riots rip ripe ripley ripped ripper ripping ripple rips rise risen rises rising risk risked risking risks risky ritchie rite rites ritual rituals ritz rival rivalries rivalry rivals river rivera rivers riverside riviera rna roach road roadmap roads roadside roadway roam roaming roar roaring roast roasted roasting rob robb robbed robber robberies robbers robbery robbie robbing robbins robe roberts robertson robes robin robinson robot robotic robotics robots robson robust robyn roc roche rochester rock rocked rockefeller rocker rocket rockets rockford rockin rocking rocks rockstar rockwell rocky rod rode rodent rodents rodeo rodgers rodney rodrigo rodriguez rods roe roger rogers rogue roi role roles rolex roll rolled roller rollercoaster rollers rolling rollins rolls rom roma romance romances romania romans romantic romero romo ronaldo ronnie roof roofing roofs rooftop rookie rookies room roommate roommates rooms rooney rooster root rooted rooting roots rope ropes rory ros rosary rose rosemary rosen rosenberg roses rosie ross rossi roster rosy rot rotary rotate rotated rotating rotation rotational rotations roth rotherham rotor rotten rotterdam rotting rouge rough roughly roulette round roundabout rounded rounder rounding rounds roundup route routed router routes routine routinely routines routing routledge rover rovers row rowdy rowe rowing rowling rows roxy royal royale royals royalties royalty royce rpg rpm rss rts rub rubbed rubber rubbing rubbish rubble ruben rubin rubio rubs ruby rudd rudder rude rudimentary rue rufus rug rugged rugs ruin ruined ruining ruins ruiz rule ruled ruler rulers rules ruling rulings rum rumble rumor rumored rumors rumour rumours run runaway rundown rung runner runners runnin running runoff runs runway rupees rupture ruptured rural ruse rush rushed rushes rushing russia russians russo rust rustic rusty rutgers ruth rutherford ruthless rwanda ryan ryder rye ryu sabbath saber sabine sabotage sabres sac sachs sack sacked sacks sacrament sacred sacrifice sacrificed sacrifices sacrificing sad saddam saddened saddest saddle sadistic sadly sadness safari safe safeguard safeguarding safeguards safely safer safest safety saffron sag saga sage sai said saigon sail sailed sailing sailor sailors sails saint saints sake sakura sal salad salads salah salaries salary sale salem sales salesman salford saline salisbury saliva salle sally salman salmon salon saloon salsa salt salted salts salty salute salvador salvage salvation salvatore sam sama samba same sami sammy samoa sample sampled samples sampling sampson samson samurai san sanchez sanction sanctioned sanctions sanctuary sand sandals sanders sanderson sands sandstone sandwich sandwiches sandy sane sang sanitary sanitation sanity sank sans santana sao sap sapphire sar sarcasm sarcastic sas sash sasha saskatchewan sassy sat satan satanic satellite satellites satin satire satirical satisfaction satisfactory satisfied satisfies satisfy satisfying saturated saturation saturdays sauce sauces saudi saudis sauna saunders sausage sausages savage savages save saved saver saves saving savings savior savvy saw sawyer sax saxophone say sayin saying sayings says sbs scale scaled scales scaling scalp scam scams scan scandal scandalous scandals scanned scanner scanners scanning scans scar scarborough scarce scarcely scarcity scare scared scares scarf scariest scaring scarlet scarlett scarred scars scarves scary scatter scattered scattering scenario scenarios scene scenery scenes scenic scent scented schedule scheduled schedules scheduling scheme schemes schizophrenia schmidt schneider scholar scholarly scholars scholarship scholarships scholastic school schoolboy schooling schools schultz schumacher schumer schuster schwartz sci science sciences scientific scientifically scientist scientists scientology scissors sclerosis scooby scoop scooter scope score scoreboard scored scorer scorers scores scoring scorpion scot scotch scotia scotland scourge scout scouting scouts scramble scrambled scrambling scrap scrape scraped scraping scrapped scraps scratch scratched scratches scratching scream screamed screaming screams screen screened screening screenings screenplay screens screenshot screenshots screenwriter screw screwed screwing screws script scripted scripts scripture scriptures scroll scrolling scrolls scrub scrubs scrum scrutiny scuba scully sculpted sculptor sculpture sculptures scum scumbag sea seafood seahawks seal sealed sealing seals seam seaman seamless seams search searched searches searching sears seas seaside season seasonal seasonally seasoned seasoning seasons seat seated seating seats seattle seaweed sec secession secluded second secondary seconded secondly seconds secrecy secret secretariat secretaries secretary secretive secretly secrets sect sectarian section sectional sections sector sectors sects secular secure secured securely securing securities security sedan sedentary sediment sediments seduce seduced seduction seductive see seed seeded seeding seeds seeing seek seeker seekers seeking seeks seem seemed seeming seemingly seems seen sees sega segment segmentation segments segregated segregation seine seinfeld seismic seize seized seizing seizure seizures seldom select selected selecting selection selections selective selectively selector selects self selfie selfies selfish selfishness selfless sell seller sellers selling sells selma selves sem semantic semantics semen semester semi semiconductor semifinal semifinals seminal seminar seminars seminary senate senator senators send sender sending sends senior seniority seniors sens sensation sensational sensations sense sensed senseless senses sensibility sensible sensing sensitive sensitivity sensor sensors sensory sensual sent sentence sentenced sentences sentencing sentiment sentimental sentiments sentinel seo seoul sep separate separated separately separates separating separation sept septic sequel sequels sequence sequences sequencing sequential ser serbia serene serenity serge sergeant sergey serial serie series serious seriously seriousness sermon sermons serotonin serpent serum servant servants serve served server servers serves service serviced servicemen services servicing serving ses sesame session sessions set setback setbacks seth sets setting settings settle settled settlement settlements settler settlers settles settling setup seven sevens seventeen seventeenth seventh seventies seventy sever several severance severe severed severely severity sevilla seville sew sewage sewer sewers sewing sewn sex sexes sexiest sexism sexist sexual sexuality sexually sexy sgt sha shabby shack shade shaded shades shading shadow shadows shadowy shady shaft shafts shaggy shah shake shaken shaker shakes shakespeare shaking shaky shale shall shallow shalt sham shaman shame shamed shameful shameless shaming shampoo shan shanghai shape shaped shapes shaping shapiro shaq share shared shareholder shareholders shares sharif sharing shark sharks sharp sharpe sharpen sharper sharply shatter shattered shattering shaun shave shaved shaving shaw shawl she shea shear sheath shed shedding sheds sheen sheep sheer sheet sheets sheikh shelby sheldon shelf shell shelley shellfish shelling shells shelly shelter sheltered shelters shelton shelves shenanigans shenzhen shepard shepherd shepherds sheppard sheridan sheriff sheriffs sherlock sherry sherwood shes shi shia shield shielded shielding shields shift shifted shifting shifts shilling shillings shin shine shines shining shiny ship shipbuilding shipment shipments shipped shipping ships shipyard shire shirt shirts shit shite shits shitting shitty shiva shivering shock shocked shocker shocking shocks shoe shoes shone shook shoot shooter shooters shooting shootings shootout shoots shop shopper shoppers shopping shops shore shoreline shores short shortage shortages shortcomings shortcut shortcuts shorten shortened shortening shorter shortest shorthand shortlisted shortly shorts shorty shot shotgun shots should shoulda shoulder shoulders shouldnt shout shouted shouting shouts shove shoved shovel shoving show showcase showcased showcases showcasing showdown showed shower showered showering showers showing shown showroom shows showtime shrapnel shred shredded shreds shrek shri shrimp shrine shrines shrink shrinking shroud shrub shrubs shrug shrugged shrunk shuffle shun shut shutdown shutout shuts shutter shutters shutting shuttle shy siberia sibling siblings sic sicily sick sickening sickle sickness side sided sidekick sideline sidelines sides sidewalk sidewalks sideways siding siege siemens sierra sig sigh sighs sight sighted sighting sightings sights sightseeing sigma sign signage signal signaling signalling signals signature signatures signed significance significant significantly signifies signify signing signings signs silence silenced silent silently silhouette silica silicon silicone silk silky silly silva silver similar similarities similarity similarly simmer simmons simone simple simpler simplest simplicity simplified simplify simplistic simply simpson simpsons sims simulate simulated simulation simulations simulator simultaneous simultaneously sin sinai sinatra since sincere sincerely sincerity sinclair sinful sing singapore singer singers singing single singled singles singleton sings singular singularity sinister sink sinking sinks sinn sinner sinners sino sins sinus sip sipping sir sire siren sirens siri sis sissy sister sisters sit sitcom site sites sits sitter sitting situ situated situation situational situations six sixers sixteen sixteenth sixth sixties sixty sizable size sizeable sized sizes sizing skate skateboard skateboarding skater skaters skates skating skeletal skeleton skeletons skeptical skepticism sketch sketches sketchy skewed ski skid skier skiers skies skiing skill skilled skills skim skin skincare skinned skinner skinny skins skip skipped skipper skipping skips skirt skirts skis skit skull skulls sky skyline skype skyscraper slab slabs slade slag slain slam slammed slamming slams slander slang slant slap slapped slapping slaps slash slashed slate slated slater slaughter slaughtered slave slavery slaves slay slayer slaying sled sleek sleep sleeper sleeping sleepless sleeps sleepy sleeve sleeves slender slept slew slice sliced slices slicing slick slid slide slider slides sliding slight slightest slightly slim slime sling slip slipped slippers slippery slipping slips slit sloan sloane slogan slogans slope slopes sloppy slot slots slovakia slovenia slow slowed slower slowing slowly slows sludge slug sluggish slum slumber slump slums slur slut sluts sly smack smackdown smacked small smaller smallest smallpox smart smarter smartest smartphone smartphones smash smashed smashing smear smell smelled smelling smells smelly smh smile smiled smiles smiley smiling smith smiths smoke smoked smoker smokers smokes smokey smoking smoky smooth smoother smoothie smoothly sms smug smuggled smuggling snack snacks snag snail snails snake snakes snap snapped snapping snaps snapshot snare snatch snatched sneak sneakers sneaking sneaky sneeze sniff sniffing sniper snipers snl snoop snoring snow snowball snowboarding snowden snowfall snowflake snowman snowy snp snuck snuff snyder soak soaked soaking soap soaps soar soaring sob sobbing sober sobriety sobs soc soccer social socialism socialist socialists socialize socially societal societies society socio socioeconomic sociological sociology sock socket sockets socks socrates sod soda sodium sofa soft softball soften softened softer softly software soggy soho soil soils sol solace solar sold soldier soldiers sole solely solemn soles solicitation solicitor solicitors solid solidarity solidly solids solitary solitude solo solos soluble solution solutions solve solved solvent solves solving som soma somalia some somebody someday somehow someone someones someplace somerset somethin something sometime sometimes somewhat somewhere son sonar song songs songwriter songwriting sonic sonny sonoma sons soo soon sooner sooo soooo sooooo soothe soothing sophie sophisticated sophistication sophomore soprano sorcerer sorcery sore sorely sorority soros sorrow sorrows sorry sort sorta sorted sorting sorts sos sought soul souls sound soundcloud sounded sounding sounds soundtrack soup sour source sourced sources sourcing south southampton southbound southeast southeastern southern southwest southwestern souvenir souvenirs sovereign sovereignty soviet soviets sow sox soy spa space spacecraft spaced spaces spaceship spacex spacing spacious spade spades spaghetti spain spam spamming span spaniards spanking spanning spans spare spared spark sparked sparkle sparkling sparks sparrow sparse sparta spartans spat spatial spawn spawned spawning spd speak speaker speakers speaking speaks spear spears spec special specialised specialising specialist specialists speciality specialization specialize specialized specializes specializing specially specials specialties specialty species specific specifically specification specifications specificity specifics specified specifies specify specifying specimen specimens specs spectacle spectacular spectator spectators spectra spectral spectre spectroscopy spectrum speculate speculated speculation speculative sped speech speeches speechless speed speeding speeds speedway speedy spell spelled spelling spells spelt spence spencer spend spending spends spent sperm sphere spheres spherical spice spices spicy spider spiderman spiders spies spike spiked spikes spill spilled spilling spills spin spinach spinal spine spines spinner spinning spinoff spins spiral spirit spirited spirits spiritual spirituality spiritually spit spite spitting splash spleen splendid splinter split splits splitting spoil spoiled spoiler spoilers spoiling spoils spokane spoke spoken spokesman spokesperson sponge spongebob sponsor sponsored sponsoring sponsors sponsorship spontaneous spontaneously spooky spoon spoons sporadic spores sport sporting sports sportsman spot spotlight spots spotted spotting spouse spouses sprawling spray sprayed spraying sprays spread spreading spreads spreadsheet spree spring springer springfield springs springsteen sprinkle sprinkled sprint sprinter sprite sprouts spruce sprung spun spur spurred spurs spy spying sql squad squadron squads square squared squarely squares squash squat squats squeeze squeezed squeezing squid squire squirrel squirrels squirt sri ssd ssr sta stab stabbed stabbing stability stabilization stabilize stabilized stable stables stack stacked stacking stacks stadium stadiums staff staffed staffers staffing stafford staffordshire staffs stag stage staged stages staggered staggering staging stagnant stagnation stain stained staining stainless stains stair staircase stairs stairway stake stakeholders stakes stale stalin stalk stalked stalker stalking stalks stall stalled stalling stallion stalls stamford stamina stamp stamped stamping stamps stance stand standalone standard standardized standards standby standing standings standout standpoint stands stanford stanton staple staples star starboard starbucks starch stardust stare stared stares staring stark starlight starr starred starring starry stars starship start started starter starters starting startled startling starts startup startups starvation starve starved starving stash stat state stated statement statements staten states statesman statewide static stating station stationary stationed stationery stations statistic statistical statistically statistics stats statue statues stature status statute statutes statutory staunch stay stayed staying stays std ste stead steadfast steadily steady steak steaks steal stealing steals stealth steam steamed steamer steaming steel steele steelers steep steer steering stein steiner stella stellar stem stemmed stemming stems step stepfather steph stephens stephenson stepmother stepped stepping steps stereo stereotype stereotypes stereotypical sterile sterling stern steroid steroids steven stevens stevenson stevie stew steward stewards stewardship stick sticker stickers sticking sticks sticky stiff stiffness stigma stiles still stills stimulate stimulated stimulates stimulating stimulation stimuli stimulus sting stink stinks stint stipulated stir stirling stirred stirring stitch stitched stitches stock stocked stockholm stocking stockings stocks stoic stoke stoked stokes stole stolen stomach stomp stomping stone stoned stoner stones stony stood stool stoop stop stoppage stopped stopping stops storage store stored stores storey stories storing storm stormed storming storms stormy story storyline storylines storytelling stout stove str straight straighten straightforward strain strained straining strains strait straits strand stranded strands strange strangely stranger strangers strangest strangled strap strapped straps strasbourg strata strategic strategically strategies strategist strategy stratford strauss straw strawberries strawberry straws stray streak streaks stream streamed streaming streamline streamlined streams street streets strength strengthen strengthened strengthening strengthens strengths stress stressed stresses stressful stressing stretch stretched stretcher stretches stretching stricken strict stricter strictly stride strides strife strike striker strikers strikes striking string stringent strings strip striped stripes stripped stripper strippers stripping strips strive striving stroke strokes stroking stroll strong stronger strongest stronghold strongly struck structural structurally structure structured structures struggle struggled struggles struggling strung strut sts stubborn stuck stud studded student students studied studies studio studios studs study studying stuff stuffed stuffing stuffs stumble stumbled stumbling stump stun stung stunned stunning stunt stunts stupid stupidest stupidity sturdy sturgeon stuttgart style styled styles styling stylish stylist stylistic suarez sub subaru subcommittee subconscious subdivision subdivisions subdued subject subjected subjective subjects sublime submarine submarines submerged submission submissions submissive submit submitted submitting subordinate subpoena subs subscribe subscribed subscriber subscribers subscription subscriptions subsection subsequent subsequently subset subsidiaries subsidiary subsidies subsidized subsidy substance substances substantial substantially substantive substitute substituted substitutes substitution substrate substrates subtitle subtitles subtle subtly suburb suburban suburbs subversive subway succeed succeeded succeeding succeeds success successes successful successfully succession successive successor successors succumbed such suck sucked sucker suckers sucking sucks suction sudden suddenly sue sued suede suez suffer suffered sufferers suffering suffers suffice sufficient sufficiently suffrage sugar sugars suggest suggested suggesting suggestion suggestions suggestive suggests suicidal suicide suicides suing suit suitability suitable suitcase suite suited suites suits sulfate sulfur sullivan sulphur sultan sum summaries summarize summarized summary summed summer summers summertime summit summon summoned summons sumner sums sun sundance sundays sunderland sunflower sung sunglasses sunk sunken sunlight sunny sunrise suns sunscreen sunset sunshine sup super superb superficial supergirl superhero superheroes superintendent superior superiority superiors superman supermarket supermarkets supernatural superpower superpowers superseded supersonic superstar superstars superstition superstitious supervise supervised supervising supervision supervisor supervisors supervisory supper supplement supplemental supplementary supplemented supplements supplied supplier suppliers supplies supply supplying support supported supporter supporters supporting supportive supports suppose supposed supposedly suppress suppressed suppressing suppression supremacist supremacy supreme sur sure surely surf surface surfaced surfaces surfer surfers surfing surge surgeon surgeons surgeries surgery surgical surname surpass surpassed surpassing surplus surprise surprised surprises surprising surprisingly surreal surrender surrendered surrey surrogate surround surrounded surrounding surroundings surrounds surveillance survey surveyed surveying surveyor surveys survival survive survived survives surviving survivor survivors susceptible sushi suspect suspected suspects suspend suspended suspending suspense suspension suspensions suspicion suspicions suspicious sustain sustainability sustainable sustained sustaining sutherland sutton suv suzuki sven swag swagger swallow swallowed swallowing swallows swam swamp swamps swan swans swansea swanson swap swapped swapping swaps swarm swat sway swayed swear swearing swears sweat sweater sweaters sweating sweatshirt sweaty sweden swedes sweeney sweep sweeping sweeps sweet sweeter sweetest sweetheart sweetie sweetness sweets swell swelling swept swift swiftly swim swimmer swimmers swimming swimsuit swine swing swinging swings swipe swirl swirling swiss switch switched switches switching switzerland swollen swoop sword swords swore sworn swung sydney sykes syllable syllables syllabus sylvester symbol symbolic symbolism symbols symmetric symmetrical symmetry sympathetic sympathies sympathy symphony symposium symptom symptoms synagogue sync synchronized syndicate syndrome synergy synod synonymous synonyms synopsis syntax synth synthesis synthesized synthetic syracuse syria syrians syringe syrup system systematic systematically systemic systems tab table tables tablespoon tablespoons tablet tablets tabloid taboo tabs tac tack tackle tackled tackles tackling tacky taco tacoma tacos tactic tactical tactics tad tae taft tag tagged tagging tags tahoe tai tail tailed tailor tailored tails tainted taipei taiwan taiwanese taj tak take takeaway taken takeoff takeover taker takers takes takin taking tal talbot tale talent talented talents tales taliban talk talked talkin talking talks tall tallahassee taller tallest tally tam tamara tame tammy tampa tampering tan tandem tang tangent tangible tangled tango tank tanker tankers tanks tanner tanning tanzania tao tap tape taped taper tapered tapes tapestry taping tapped tapping taps tar tara tardis target targeted targeting targets tariff tariffs tart taser task tasked tasks tasmania taste tasted tastes tasting tasty tat tata tate tattoo tattooed tattoos tatum tau taught tavern tax taxable taxation taxed taxes taxi taxing taxis taxpayer taxpayers tay tbh tds tea teach teacher teachers teaches teaching teachings teal team teamed teaming teammate teammates teams teamwork tear tearing tears teas tease teased teaser teasing teaspoon tech technical technically technician technicians technique techniques techno technological technologically technologies technology ted tedious tee teen teenage teenager teenagers teens tees teeth tehran tel telecom telecommunication telecommunications telegram telegraph telephone telephones telescope telescopes televised television tell teller telling tells telly temp temper temperament temperance temperate temperature temperatures tempered tempest template templates temple temples tempo temporal temporarily temporary temps tempt temptation temptations tempted tempting ten tenant tenants tend tended tendencies tendency tender tenderness tenders tending tendon tends tenn tennessee tennis tenor tens tense tension tensions tent tentacles tentative tentatively tenth tents tenure tequila ter term termed terminal terminals terminate terminated terminating termination terminator terminology terminus terms terra terrace terraces terrain terrestrial terrible terribly terrier terrific terrified terrifying territorial territories territory terror terrorism terrorist terrorists terry tertiary tesco tessa test testament tested tester testicles testified testify testifying testimonies testimony testing testosterone tests tex texans text textbook textbooks texted textile textiles texting texts textual texture textured textures tha thailand thames than thank thanked thankful thankfully thanking thanks thanksgiving thankyou that thatcher thats thaw thc the theater theaters theatre theatres theatrical thee theft their theirs them thematic theme themed themes themselves then theological theology theorem theoretical theoretically theories theorist theorists theory therapeutic therapeutics therapies therapist therapists therapy there thereafter thereby therefore therein thereof theres thermal thermometer these theses thesis theta they theyre thi thick thicker thickness thief thieves thigh thighs thin thine thing things thingy think thinker thinkers thinkin thinking thinks thinly thinner thinning third thirds thirst thirsty thirteen thirteenth thirties thirty this thistle tho thom thompson thomson thong thor thorn thorne thorns thornton thorough thoroughly thorpe those thou though thought thoughtful thoughts thousand thousands thrash thread threaded threads threat threaten threatened threatening threatens threats three threesome threshold thresholds threw thrice thrift thrill thrilled thriller thrilling thrills thrive thriving throat throats throne thrones throttle through throughout throughput throw throwback throwing thrown throws thru thrust thu thug thugs thumb thumbnail thumbs thumping thunder thunderstorm thunderstorms thursdays thus thwarted thx thy thyroid tia tibet tic tick ticket tickets ticking tickle ticks tidal tide tides tidy tie tied tier tiers ties tiffany tiger tigers tight tighten tightened tightening tighter tightly tights til tile tiles till tilt tilted timber timberlake timbers time timed timeframe timeless timeline timelines timely timeout timer timers times timetable timid timing timmy timor timothy tin tinder ting tinker tint tinted tiny tip tipped tipping tips tire tired tires tiring tis tissue tissues tit titanic titanium titans title titled titles tito tits titties tlc tnt toad toast toasted toaster tobacco tobago toby tod today toddler toddlers toe toes tofu together toilet toilets token tokens tokyo told tolerance tolerant tolerate tolerated tolkien toll tolls tomato tomatoes tomb tombs tombstone tome tomlinson tommy tomorrow ton tone toned tones tong tongue tongues toni tonic tonight tonne tonnes tons tony too took tool tools tooth toothbrush toothpaste top topic topical topics topless topography topology topped topping tops tor torah torch torches tore tori tories torment tormented torn tornado tornadoes toro toronto torpedo torpedoes torque torrent torres torso tortoise torture tortured torturing tory tos toss tossed tossing tot total totaled totaling totalitarian totally totals tote toto tottenham touch touchdown touchdowns touched touches touching touchy tough tougher toughest toughness toulouse tour toured touring tourism tourist tourists tournament tournaments tours tout touted tow toward towards towed towel towels tower towering towers towing town towns townsend township townships toxic toxicity toxin toxins toy toys tpp trace traced tracer traces tracing track tracked tracker tracking tracks tract traction tractor tractors tracts trade traded trademark trademarks trader traders trades trading tradition traditional traditionally traditions traffic trafficking trafford tragedies tragedy tragic tragically trail trailer trailers trailing trails train trained trainee trainees trainer trainers training trains trait traitor traitors traits trajectory tram tramp trampoline trance tranquil trans transaction transactions transatlantic transcribed transcript transcription transcripts transfer transferred transferring transfers transform transformation transformations transformative transformed transformer transformers transforming transforms transgender transient transistor transit transition transitional transitioning transitions translate translated translates translating translation translations translator translators translucent transmission transmissions transmit transmitted transmitter transmitting transnational transparency transparent transplant transplantation transplants transport transportation transported transporter transporting transports transverse trap trapped trapping traps trash trashed trauma traumatic traumatized travel traveled traveler travelers traveling travelled traveller travellers travelling travels traverse travis tray trays treacherous tread treadmill treason treasure treasurer treasures treasury treat treated treaties treating treatise treatment treatments treats treaty treble tree trees trek trembling tremendous tremendously trench trenches trend trending trends trendy trespassing trey tri triad trial trials triangle triangles triangular triathlon tribal tribe tribes tribunal tribune tributaries tributary tribute tributes trick tricked trickle tricks tricky trident tried tries trigger triggered triggering triggers trillion trilogy trim trimmed trimming trinidad trinity trio trip triple tripod tripoli tripped tripping trips triumph triumphant triumphs trivia trivial trojans troll trolley trolling trolls troop trooper troopers troops trophies trophy tropical tropics trot trouble troubled troubles troublesome troubling trough troupe trousers trout troy truce truck trucking trucks trudeau true truly truman trump trumpet trumpets trumps trunk trunks truss trust trusted trustee trustees trusting trusts trustworthy truth truthful truthfully truths try tryin trying tsa tsar tsp tsunami tub tube tuberculosis tubes tubing tubular tuck tucked tucker tucson tue tuesdays tug tuition tulip tulsa tumble tumbling tumblr tummy tumor tumors tumour tuna tune tuned tunes tuning tunisia tunnel tunnels turbine turbines turbo turbulence turbulent turd turf turin turing turk turkey turkeys turks turmoil turn turnaround turnbull turned turner turning turnout turnover turnovers turnpike turns turquoise turret turrets turtle turtles tutor tutorial tutorials tutoring tutors tvs twain twat tweak tweaks tweed tweet tweeted tweeting tweets twelfth twelve twenties twentieth twenty twice twilight twin twinkle twins twist twisted twisting twists twitch two tycoon tying tyne type typed types typewriter typhoon typical typically typing typo tyranny tyrant tyre tyres tyrone tyson uae ubiquitous ubuntu ucla uefa ufc ufo uganda ugh ugly uhh ukip ukraine ulster ultimate ultimately ultimatum ultra ultrasound ultraviolet umbrella umm umpire unable unacceptable unaffected unanimous unanimously unanswered unarmed unattended unattractive unauthorized unavailable unavoidable unaware unbalanced unbearable unbeatable unbeaten unbelievable unbelievably unbiased unborn unbroken unc uncanny uncertain uncertainties uncertainty unchanged uncharted unchecked uncle unclear uncles uncomfortable uncommon unconditional unconditionally unconscious unconstitutional uncontrollable uncontrolled unconventional uncover uncovered uncut und undead undecided undefeated undeniable undeniably under underage undercover underdog underestimate underestimated undergo undergoes undergoing undergone undergraduate undergraduates underground underlying undermine undermined undermining underneath underrated underside understand understandable understandably understanding understands understatement understood undertake undertaken undertaker undertaking undertook underwater underway underwear underwent underwood underworld underwriting undesirable undisclosed undisputed undo undocumented undone undoubtedly undue une unearthed uneasy uneducated unemployed unemployment unequal unethical uneven unexpected unexpectedly unexplained unfair unfairly unfamiliar unfavorable unfinished unfit unfold unfolded unfolding unfolds unforeseen unforgettable unfortunate unfortunately unfounded ungrateful unhappiness unhappy unhealthy unheard uni unicef unicorn unidentified unification unified uniform uniformed uniformly uniforms unifying unilateral unimaginable unimportant uninsured unintended unintentionally uninterrupted union unionist unionists unions unique uniquely uniqueness unison unit unite united unites uniting units unity universal universally universe universities university unix unjust unknown unlawful unleash unleashed unless unlike unlikely unlimited unload unloaded unloading unlock unlocked unlocking unlucky unmanned unmarked unmarried unnamed unnatural unnecessarily unnecessary unnoticed uno unofficial unorthodox unpaid unparalleled unplanned unpleasant unpopular unprecedented unpredictable unprepared unprofessional unprotected unpublished unqualified unquestionably unravel unreal unrealistic unreasonable unrelated unreleased unreliable unresolved unrest unrestricted unsafe unsecured unseen unsettled unsettling unsigned unsolicited unsolved unspecified unspoken unstable unstoppable unsuccessful unsuccessfully unsuitable unsure unsuspecting unsustainable unthinkable until untitled unto untold untouched untreated untrue unused unusual unusually unveil unveiled unveiling unwanted unwelcome unwell unwilling unworthy upbeat upbringing upcoming update updated updates updating upfront upgrade upgraded upgrades upgrading upheld uphill uphold upholding upkeep uplift uplifting upload uploaded uploading upon upper upright uprising uproar ups upscale upset upsets upsetting upside upstairs upstate upstream uptake upto upton uptown upward upwards uranium urban urge urged urgency urgent urgently urges urging urinary urine url urn uruguay usa usable usage usb usc usd usda use used useful usefulness useless user username users uses usher using usps uss ussr usual usually utc utensils uterus utilised utilities utility utilization utilize utilized utilizes utilizing utmost utopia utopian uttar utter uttered utterly uzbekistan vacancies vacancy vacant vacate vacated vacation vacations vaccinated vaccination vaccine vaccines vacuum vader vagina vaginal vague vaguely vain vale valentine valet valiant valid validate validated validation validity valley valleys valor valuable valuation value valued values valve valves vampire vampires van vancouver vandalism vanderbilt vanguard vanilla vanish vanished vanishing vanity vans vantage vape vapor var vargas variability variable variables variance variant variants variation variations varied varies varieties variety various variously varsity vary varying vascular vase vast vastly vat vaughan vault vaults vector vectors veg vegan vegas vegetable vegetables vegetarian vegetation veggie veggies vehemently vehicle vehicles veil veiled vein veins velocity velvet vendetta vending vendor vendors venerable venezuela vengeance venom vent ventilation venting vents ventura venture ventured ventures venue venues ver vera verb verbal verbally verbs verde verdict verge verification verified verify verizon verlag vernacular versa versailles versatile versatility verse versed verses version versions versus vertebrae vertex vertical vertically vertigo very vessel vessels vest vested vests vet veteran veterans veterinarian veterinary veto vets vettel vhs via viability viable viagra vibe vibes vibrant vibrating vibration vibrations vicar vice vicinity vicious victim victims victor victories victorious victory vid vidal video videos vids vie viet vietnam view viewed viewer viewers viewing viewpoint viewpoints views vigil vigilance vigilant vigilante vigorous vigorously vii viii viking vikings viktor vile villa village villagers villages villain villains villas ville vin vincent vinci vine vinegar vines vineyard vineyards vintage vinyl viola violate violated violates violating violation violations violence violent violently violet violin viper viral virgil virgin virginity virgins virtual virtually virtue virtues virtuous virus viruses vis visa visas visceral viscount visibility visible visibly vision visionary visions visit visitation visited visiting visitor visitors visits vista visual visualization visualize visually visuals vita vital vitality vitamin vitamins vitro viva vivian vivid vividly vivo viz vlad vocabulary vocal vocalist vocals vocation vocational vodka vogue voice voiced voicemail voices voicing void vol volatile volatility volcanic volcano volcanoes volkswagen volley volleyball vols volt voltage volts volume volumes voluntarily voluntary volunteer volunteered volunteering volunteers volvo vomit vomiting von voodoo vortex voss vote voted voter voters votes voting voucher vouchers vow vowed vowel vowels vows vox voyage voyager voyages vpn vuitton vulgar vulnerabilities vulnerability vulnerable vulture wacky wade waffle waffles wage waged wager wages wagner wagon wagons wah waist wait waited waiter waiters waiting waitress waits waive waived waiver waivers wake wakefield wakes waking wal walcott walden waldo waldorf wales walk walked walker walkers walking walks walkway wall wallace walled waller wallet wallets wallis wallpaper walls wally walnut walsh walt walter walters walton waltz wan wand wanda wander wandered wanderers wandering wang wanna wannabe want wanted wanting wants war warcraft ward warden wardrobe wards ware warehouse warehouses wares warfare warm warmed warmer warmest warming warmly warms warmth warn warned warner warning warnings warns warp warped warrant warranted warrants warranty warren warring warrior warriors wars warsaw warship warships wartime wary was wash washed washer washes washing wasnt wasp wasps waste wasted wasteful wasteland wastes wastewater wasting wat watch watchdog watched watchers watches watching water watercolor watered waterfall waterfalls waterfront watergate watering watermelon waterproof waters watershed waterway waterways watery watford watkins watson watt watts wave waved wavelength wavelengths waves waving wavy wax way ways weak weaken weakened weakening weaker weakest weakly weakness weaknesses wealth wealthiest wealthy weapon weaponry weapons wear wearable wearing wears weary weasel weather weathered weave weaver weaving web webb webber webcam weber webinar webpage website websites webster wed wedding weddings wedge wednesdays wee weed weeds week weekday weekdays weekend weekends weekly weeks weep weeping weibo weigh weighed weighing weighs weight weighted weights weiner weinstein weir weird weirdest weirdo weiss welch welcome welcomed welcomes welcoming weld welded welding welfare well wellbeing wellington wellness wells welp welsh wembley wen wenger went wentworth wept were werewolf wesley west westbrook westchester western westerners westfield westminster weston westward westwood wet wetland wetlands wha whack whale whales whaling wharf wharton what whatever whats whatsoever wheat wheel wheelchair wheeled wheeler wheeling wheels when whenever where whereabouts whereas whereby wherein wherever whether whew which whichever whiff while whilst whim whine whining whip whipped whipping whips whirlwind whiskey whisky whisper whispered whispering whispers whistle whistleblower whistler whistles whistling whit whitaker white whitehall whitehead whites whitman whitney who whoa whoever whole wholeheartedly wholesale wholesome wholly whom whoop whooping whoops whopping whore whores whose why wick wicked wicket wickets wide widely widen widened widening wider widespread widest widow widowed widows width wield wielding wiener wife wifi wig wigan wiggins wiggle wight wigs wii wiki wikileaks wikipedia wil wilcox wild wildcard wildcats wilde wilder wilderness wildest wildfire wildfires wildlife wildly wiley wilkes wilkins will willard willed williams williamsburg williamson willie willing willingly willingness willis willow wills willy wilmington wilt wimbledon win wind winding windmill window windows winds windshield windy wine winery wines wing winged winger wingers wings wink winner winners winning winnings winnipeg wins winslow winter winters wipe wiped wipes wiping wire wired wireless wires wiring wis wisconsin wisdom wise wisely wiser wish wished wishes wishing wit witch witchcraft witches with withdraw withdrawal withdrawals withdrawing withdrawn withdrew withheld withhold withholding within without withstand witness witnessed witnesses witnessing wits witty wives wizard wizards woah woe woes woke woken wolf wolfe wolff wolverine wolves woman womb women womens won wonder wondered wonderful wonderfully wondering wonderland wonders wong wont woo wood wooded wooden woodland woodlands woods woodstock woodward woodwork woody wool woolf worcester word worded wording wordpress words wore work worked worker workers workflow workforce workin working workings workload workout workouts workplace workplaces works workshop workshops world worldly worlds worldview worldwide worm worms worn worried worries worry worrying worse worsening worship worshipped worst worth worthington worthless worthwhile worthy would wouldnt wound wounded wounding wounds woven wow wrap wrapped wrapper wrapping wraps wrath wreath wreck wreckage wrecked wrecking wrench wrestle wrestlemania wrestler wrestlers wrestling wretched wright wrinkles wrist wrists writ write writer writers writes writing writings written wrong wrongdoing wrongful wrongly wrongs wrote wrought wtf wto wwe wwf wwi wwii www wyatt wyoming xanax xavier xbox xiao xii xiii xinjiang xiv xml xvi xxx yacht yachts yah yahoo yale yall yamaha yan yang yankees yard yards yarn yates yay yea yeah year yearbook yearly yearning years yeast yee yeh yell yelled yelling yellow yellowish yellowstone yells yelp yen yep yer yes yesterday yet yield yielded yielding yields yikes yin ying ymca yoga yogi yogurt yoko yong yoo yoon york yorker yorkers yosemite you youll young younger youngest youngster youngsters your youre yours yourself yourselves youth youthful youths youtuber youtubers youve yrs yuan yugoslavia yukon yum yummy yung yup yuri yves zac zachary zack zambia zane zara zeal zealand zebra zee zelda zenith zeppelin zero zest zhang zhao zhou zimbabwe zimmer zimmerman zinc zip zipper zodiac zoe zombie zombies zone zoned zones zoning zoo zoology zuckerberg zur zurich".split(" "));
    const PLACES = new Set(["afghanistan","albania","algeria","andorra","angola","argentina","armenia","australia","austria","azerbaijan","bahamas","bahrain","bangladesh","barbados","belarus","belgium","belize","benin","bhutan","bolivia","bosnia","botswana","brazil","brunei","bulgaria","burkina faso","burundi","cambodia","cameroon","canada","chad","chile","china","colombia","comoros","congo","costa rica","croatia","cuba","cyprus","czech republic","czechia","denmark","djibouti","dominica","ecuador","egypt","el salvador","eritrea","estonia","eswatini","ethiopia","fiji","finland","france","gabon","gambia","georgia","germany","ghana","greece","grenada","guatemala","guinea","guyana","haiti","honduras","hong kong","hungary","iceland","india","indonesia","iran","iraq","ireland","israel","italy","jamaica","japan","jordan","kazakhstan","kenya","kiribati","kuwait","kyrgyzstan","laos","latvia","lebanon","lesotho","liberia","libya","liechtenstein","lithuania","luxembourg","madagascar","malawi","malaysia","maldives","mali","malta","mauritania","mauritius","mexico","moldova","monaco","mongolia","montenegro","morocco","mozambique","myanmar","namibia","nauru","nepal","netherlands","new zealand","nicaragua","niger","nigeria","north korea","norway","oman","pakistan","palau","palestine","panama","papua new guinea","paraguay","peru","philippines","poland","portugal","qatar","romania","russia","rwanda","samoa","san marino","saudi arabia","scotland","senegal","serbia","seychelles","sierra leone","singapore","slovakia","slovenia","somalia","south africa","south korea","spain","sri lanka","sudan","suriname","sweden","switzerland","syria","taiwan","tajikistan","tanzania","thailand","togo","tonga","trinidad","tunisia","turkey","turkmenistan","tuvalu","uganda","ukraine","uae","united arab emirates","united kingdom","uk","usa","united states","america","uruguay","uzbekistan","vanuatu","venezuela","vietnam","wales","england","west indies","yemen","zambia","zimbabwe","africa","asia","europe","oceania","antarctica","middle east","andhra pradesh","arunachal pradesh","assam","bihar","chhattisgarh","goa","gujarat","haryana","himachal pradesh","jharkhand","karnataka","kerala","madhya pradesh","maharashtra","manipur","meghalaya","mizoram","nagaland","odisha","punjab","rajasthan","sikkim","tamil nadu","telangana","tripura","uttar pradesh","uttarakhand","west bengal","delhi","new delhi","jammu","kashmir","ladakh","puducherry","chandigarh","mumbai","bengaluru","bangalore","chennai","kolkata","hyderabad","pune","ahmedabad","jaipur","lucknow","kanpur","nagpur","indore","bhopal","patna","surat","vadodara","coimbatore","kochi","noida","gurugram","gurgaon","mysuru","mysore","visakhapatnam","thiruvananthapuram","madurai","nashik","agra","varanasi","amritsar","ranchi","guwahati","bhubaneswar","dehradun","shimla","london","paris","berlin","tokyo","dubai","new york","san francisco","los angeles","chicago","boston","seattle","toronto","sydney","melbourne","singapore","hong kong","beijing","shanghai","moscow","madrid","rome","amsterdam","zurich","geneva","istanbul","cairo","nairobi","lagos","karachi","lahore","dhaka","colombo","kathmandu","abu dhabi","doha","riyadh"]);
    const CALENDAR_WORDS = new Set("january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun".split(" "));
    const NAME_PARTICLES = new Set(["de", "da", "del", "dos", "van", "von", "der", "bin", "binti", "al", "el", "la", "le", "di", "du", "ibn"]);
    function isCommonWord(w) { return COMMON_WORDS.has((w || "").toLowerCase()); }
    const PLACES_RE = new RegExp("(?:^|[^a-z])(?:" + Array.from(PLACES).sort((a, b) => b.length - a.length).map(p => p.replace(/ /g, "\\s+")).join("|") + ")(?![a-z])", "i");
    function containsPlace(phrase) {
        return !!phrase && PLACES_RE.test(phrase);
    }
    // "Chance R", "Kickoff", "Sports Ops": every word is an ordinary English word, a place or a calendar word
    // (single-letter initials allowed). Replacing such text is Overscrubbed even if the replacement LOOKS like a
    // name ("Yelanando N"): the original decides, not the synthetic replacement.
    // Languages / nationalities: ordinary words, never person names ("English, Bengali and Hindi").
    const LANGUAGE_WORDS = new Set(("english hindi bengali bangla tamil telugu marathi kannada malayalam gujarati punjabi urdu odia oriya assamese " +
        "sanskrit konkani maithili nepali sindhi kashmiri french german spanish italian portuguese russian chinese mandarin cantonese japanese " +
        "korean arabic persian turkish dutch greek hebrew thai vietnamese indonesian malay swahili latin hinglish tanglish").split(" "));
    function isLanguageWord(w) { return LANGUAGE_WORDS.has((w || "").toLowerCase()); }
    // Honorifics / titles are not names on their own ("Ma'am", "Sir", "Dr", "Smt").
    const HONORIFICS = new Set("sir ma'am maam mam madam mr mrs ms miss dr prof shri sri smt kumari ji sahab saheb sahib bhai didi bhaiya sr jr".split(" "));
    function isHonorific(w) { return HONORIFICS.has((w || "").toLowerCase().replace(/[.\u2019]/g, m => m === "\u2019" ? "'" : "")); }
    function isOrdinaryPhrase(s) {
        const ws = (s || "").trim().split(/\s+/).filter(Boolean);
        if (ws.length === 0 || ws.length > 8) return false;
        let real = 0;
        for (const w0 of ws) {
            const w = w0.replace(/[.,:;!?)(]+$/, "").replace(/^[(]+/, "");
            if (/^[A-Za-z]$/.test(w)) continue;
            if (!/^[A-Za-z][A-Za-z'-]*$/.test(w)) return false;
            if (!(isCommonWord(w) || isCalendarWord(w) || PLACES.has(w.toLowerCase()) || isLanguageWord(w) || isHonorific(w))) return false;
            real++;
        }
        if (real === 0) return false;
        // (v11.1.0) a capitalised known given name / surname that is not also a common English word ("Imran",
        // "Shah", "Sinha") is a name, not ordinary text, even though the big word list contains it.
        if (ws.every(w => /^[A-Z]/.test(w)) && ws.some(w => { const l = w.replace(/[.,:;!?]+$/, "").toLowerCase(); return KNOWN_GIVEN_NAMES.has(l) && !AMBIGUOUS_NAME_WORDS.has(l); })) return false;
        // "Mark Brown", "Grace Hill": two capitalised words starting with a known given name are a person.
        if (ws.length >= 2 && /^[A-Z]/.test(ws[0]) && /^[A-Z]/.test(ws[1]) && KNOWN_GIVEN_NAMES.has(ws[0].toLowerCase())) return false;
        return true;
    }
    function isCalendarWord(w) { return CALENDAR_WORDS.has((w || "").toLowerCase().replace(/\.$/, "")); }
    // "Furkan", "Roni S", "Joaquim", "HBAR": capitalised words that are not ordinary English words, places or
    // calendar words (single-letter initials allowed). Code identifiers (camelCase, digits, underscores) never qualify.
    function looksLikeProperNounPhrase(s) {
        // Inline markup is not part of a name ("<u>Aman Baurasi</u> <u>Amlen Lakra</u>").
        const t = (s || "").replace(/<\/?[a-z]{1,8}>/gi, " ").replace(/~~|\*\*|__/g, " ").replace(/\s+/g, " ").trim();
        if (!t || t.length > 600) return false;
        const ws = t.split(/\s+/);
        if (ws.length > 60) return false;
        let real = 0, lowerParts = 0, commonCaps = 0;
        for (const w0 of ws) {
            const w = w0.replace(/[.,;]$/, "");
            if (!w) continue;
            if (/^[A-Z]$/.test(w)) continue;                                   // initial
            if (NAME_PARTICLES.has(w.toLowerCase()) && ws.length > 1) continue;
            if (/^[a-z][a-z'-]{2,}$/.test(w) && ws.length > 1 && !isCommonWord(w) && !isCalendarWord(w)) { lowerParts++; continue; } // "chhatrapal"
            if (!/^(?:[A-Z][a-z'\u00C0-\u024F-]+|[A-Z]{2,})$/.test(w)) return false;   // Proper or ALLCAPS word only
            if (isCalendarWord(w) || PLACES.has(w.toLowerCase()) || isLanguageWord(w)) return false;
            // A capitalised ordinary word ("Baker", "Rose", "Barrel") is tolerated inside a LIST of names
            // (4+ words, at most 30% such words); in a short phrase it means the text was ordinary.
            if (isCommonWord(w) && !(ws.length >= 4 && couldBeName(w))) { commonCaps++; continue; }   // in a list, "Clark", "Walker" are names
            real++;
        }
        if (commonCaps > 0 && (ws.length < 4 || commonCaps > 0.3 * ws.length)) return false;
        return real > 0 && lowerParts <= real && !containsPlace(t);
    }

    // ------------------------------------------------------------------
    // Performance: per-document text index.
    // Many rules ask "does TOKEN appear in context X anywhere in the document?". Running those regexes over the
    // whole document for every token made large documents take tens of seconds and froze the browser.
    // The index maps each word to the lines it occurs on, so each check only scans those lines (+/- 1 line).
    // ------------------------------------------------------------------
    const __ptTextIndexCache = new Map();
    function textIndex(text) {
        let ix = __ptTextIndexCache.get(text);
        if (ix) return ix;
        if (__ptTextIndexCache.size > 8) __ptTextIndexCache.clear();
        const lines = text.split("\n");
        const wordLines = new Map();
        for (let i = 0; i < lines.length; i++) {
            const ws = lines[i].toLowerCase().match(/[a-z0-9]+/g);
            if (!ws) continue;
            let prev = null;
            for (const w of ws.sort()) {
                if (w === prev) continue;
                prev = w;
                let a = wordLines.get(w);
                if (!a) { a = []; wordLines.set(w, a); }
                a.push(i);
            }
        }
        ix = { lines, wordLines, lower: null, squashed: null, narrow: new Map(), memo: new Map(), cleanLines: null, brandWords: null };
        __ptTextIndexCache.set(text, ix);
        return ix;
    }
    function lowerOf(text) {
        if (!text || text.length < 2000) return (text || "").toLowerCase();
        const ix = textIndex(text);
        if (ix.lower === null) ix.lower = text.toLowerCase();
        return ix.lower;
    }
    function squashedOf(text) {
        if (!text || text.length < 2000) return (text || "").replace(/\s+/g, "");
        const ix = textIndex(text);
        if (ix.squashed === null) ix.squashed = text.replace(/\s+/g, "");
        return ix.squashed;
    }
    // Lines of `text` that can possibly contain `token` (plus one line either side), joined with "\n".
    // Small texts are returned unchanged, so behaviour on short documents is identical.
    const NARROW_MIN_LENGTH = 6000;
    const LONG_LINE_CHARS = 4000, LONG_LINE_WINDOW = 400;
    function narrowText(token, text) {
        if (!text || text.length < NARROW_MIN_LENGTH || !token) return text;
        const words = String(token).toLowerCase().match(/[a-z0-9]+/g);
        if (!words) return text;
        const ix = textIndex(text);
        const key = words.join(" ");
        const hit = ix.narrow.get(key);
        if (hit !== undefined) return hit;
        let best = null;
        for (const w of words) {
            const a = ix.wordLines.get(w);
            if (!a) { ix.narrow.set(key, "\n"); return "\n"; }   // a word of the token never occurs: nothing can match
            if (!best || a.length < best.length) best = a;
        }
        const keep = new Set();
        for (const i of best) { keep.add(i - 1); keep.add(i); keep.add(i + 1); }
        const idx = [...keep].filter(i => i >= 0 && i < ix.lines.length).sort((a, b) => a - b);
        const bestWord = words.reduce((acc, w) => ((ix.wordLines.get(w) || []).length < (ix.wordLines.get(acc) || []).length ? w : acc), words[0]);
        const parts = [];
        let last = -2;
        for (const i of idx) {
            if (last !== -2 && i !== last + 1) parts.push("...");   // gap marker between non-adjacent lines
            const line = ix.lines[i];
            if (line.length <= LONG_LINE_CHARS) parts.push(line);
            else {
                // Minified JSON / CSV dumps can be one 500 KB line: keep only windows around the token.
                const low = line.toLowerCase();
                let pos = low.indexOf(bestWord), lastEnd = -1;
                if (pos < 0 && best.includes(i)) parts.push(line.slice(0, LONG_LINE_CHARS));
                while (pos >= 0) {
                    const a = Math.max(0, pos - LONG_LINE_WINDOW, lastEnd), b = Math.min(line.length, pos + bestWord.length + LONG_LINE_WINDOW);
                    if (a < b) parts.push(line.slice(a, b));
                    lastEnd = b;
                    pos = low.indexOf(bestWord, pos + bestWord.length);
                }
            }
            last = i;
        }
        let out = parts.join("\n");
        if (out.length > text.length * 0.7) out = text;
        if (ix.narrow.size > 5000) ix.narrow.clear();
        ix.narrow.set(key, out);
        return out;
    }
    // Cache the result of a pure (token, document) check, so repeated tokens cost nothing on long documents.
    function memoText(text, fnKey, token, compute) {
        if (!text || text.length < NARROW_MIN_LENGTH) return compute();
        const ix = textIndex(text);
        const key = fnKey + "\u0001" + token;
        if (ix.memo.has(key)) return ix.memo.get(key);
        const v = compute();
        if (ix.memo.size > 20000) ix.memo.clear();
        ix.memo.set(key, v);
        return v;
    }
    function firstLinesOf(text, n) {
        if (!text) return [];
        if (text.length < 2000) return text.split(/\r?\n/).slice(0, n);
        return textIndex(text).lines.slice(0, n).map(l => l.replace(/\r$/, ""));
    }
    function allLinesOf(text) {
        if (!text) return [];
        if (text.length < 2000) return text.split(/\r?\n/);
        const ix = textIndex(text);
        if (!ix.cleanLines) ix.cleanLines = ix.lines.map(l => l.replace(/\r$/, ""));
        return ix.cleanLines;
    }

    function isFieldLabelOrHeader(str, docText = "") {
        if (!str) return false;
        const s = str.trim().replace(/^["'`\s,;:|]+|["'`\s,;:|]+$/g, '');
        if (!s) return false;

        // 1. Dynamic check against lines 1-5 of document (CSV, TSV, markdown tables)
        if (docText) {
            const firstLines = firstLinesOf(docText, 5);
            for (const line of firstLines) {
                if (line.includes(",") || line.includes("\t") || line.includes("|") || line.includes(";")) {
                    const headers = line.split(/[,|\t;]+/).map(h => h.trim().replace(/^["'`\s,;:|]+|["'`\s,;:|]+$/g, '')).filter(Boolean);
                    for (const h of headers) {
                        if (h.length >= 2) {
                            const hLower = h.toLowerCase();
                            const sLower = s.toLowerCase();
                            if (sLower === hLower || sLower.startsWith(hLower) || hLower.startsWith(sLower)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        // 2. Comprehensive Header and Field indicators (covering all forms and stems: create, created, component, components, salary, lakhs, etc.)
        if (/^(?:bank|account|patient|policy|primary|employee|procedure|insurer|settled|settlement|utr|summary|category|charge|consultant|investigation|treatment|relationship|customer|make|model|dealership|variant|oem|brand|manufacturer|issue|summary|assignee|reporter|priority|status|resolution|resolve|resolved|create|creates|created|creation|update|updates|updated|due|component|components|notes?|comment|comments|description|created_at|updated_at|created_date|updated_date|salary|salaries|hardware|requirement|requirements|outsourcing|miscellaneous|misc|lakhs?|lpm|crores?|team|teams|invoice|recipient|bill)\b/i.test(s)) return true;
        if (/\b(?:name|id|no|number|date|amount|charges|total|period|summary|details|relationship|status|holder|beneficiary|type|code|balance|breakup|planned|management|reason|model|variant|dealership|zone|city|state|header|column|oem|brand|key|issue|priority|resolution|resolve|resolved|create|creates|created|update|updates|updated|due|component|components|assignee|assign|assigned|reporter|report|reported|salary|hardware|requirement|requirements|outsourcing|miscellaneous|lakhs?|lpm|crores?)\b/i.test(s)) return true;
        return false;
    }

    function hasNonEntityWord(str) {
        if (!str) return false;
        const tokens = str.toLowerCase().split(/[\s\-_\/,\.:;|\(\)\[\]#]+/);
        for (const t of tokens) {
            if (t && NON_ENTITY_TERMS.has(t)) return true;
        }
        return false;
    }

    // True when the words that were ADDED in the changed text (not present in the original) include a
    // generic non-entity word. An original that was a generic word ("function", "provide") being replaced
    // by a synthetic word is exactly what Overscrubbed means, so the original must not be tested here.
    function addedWordsAreGeneric(orig, chg) {
        const split = (s) => (s || "").toLowerCase().split(/[\s\-_\/,\.:;|\(\)\[\]#]+/).filter(Boolean);
        const origSet = new Set(split(orig));
        return split(chg).some(t => !origSet.has(t) && NON_ENTITY_TERMS.has(t));
    }

    const TECH_TOOLS = new Set([
        "nginx", "redis", "apache", "kafka", "rabbitmq", "postgres", "postgresql", 
        "mysql", "sqlite", "mongo", "mongodb", "elastic", "elasticsearch", "kibana", 
        "logstash", "prometheus", "grafana", "envoy", "traefik", "haproxy", "node", 
        "nodejs", "python", "golang", "rust", "docker", "k8s", "kubernetes", "linux", 
        "ubuntu", "debian", "centos", "graphql", "grpc", "rest", "http", "tcp", "udp"
    ]);

    const TECH_ROLES = new Set([
        "router", "gateway", "proxy", "ingress", "egress", "loadbalancer", "balancer", 
        "cache", "queue", "broker", "pipeline", "service", "services", "daemon", 
        "worker", "workers", "server", "servers", "client", "clients", "driver", 
        "adapter", "handler", "controller", "agent", "agents", "watcher", "listener", 
        "consumer", "producer", "processor", "middleware", "plugin", "plugins", "sdk", 
        "api", "apis", "cli", "engine", "backend", "frontend", "ui", "db", "database", 
        "repo", "repository", "module", "modules", "package", "packages", "lib", 
        "library", "app", "apps", "cron", "scheduler", "cluster", "pool", "pod", "script"
    ]);

    function isSoftwareComponent(str) {
        if (!str) return false;
        const s = str.trim().toLowerCase();
        if (s.length < 2) return false;

        // Direct match to known standalone software tool or technical role
        if (TECH_TOOLS.has(s) || TECH_ROLES.has(s)) return true;

        // Technical component name joined with hyphens, underscores, dots, or slashes (e.g. "nginx-redis-router", "api-gateway", "auth_service")
        const parts = s.split(/[\-_\.\s\/]+/);
        if (parts.length >= 2) {
            let hasTool = false;
            let hasRole = false;
            for (const p of parts) {
                if (TECH_TOOLS.has(p)) hasTool = true;
                if (TECH_ROLES.has(p)) hasRole = true;
            }
            if ((hasTool && hasRole) || (hasTool && parts.length >= 2) || (hasRole && parts.length >= 2 && !/^(?:customer|client|patient|user)\s+service$/i.test(s))) {
                return true;
            }
        }

        return false;
    }

    function isInfraOrServerTerm(str) {
        if (!str) return false;
        const s = str.trim().toLowerCase();
        if (hasNonEntityWord(s)) return true;
        if (isSoftwareComponent(s)) return true;

        // Server pools, clusters, instances, spot VMs, dev machines
        if (/[\-_\s](?:pool|spot|reserved|cluster|node|worker|vm|server|machines?)\b/i.test(s)) return true;
        if (/\b(?:pool[\-_\s]\d+|web[\-_\s]spot|web[\-_\s]reserved|dev[\-_\s]machines?|dj[\-_\s]spot|goserver[\-_\s]?[a-z0-9\-]*)\b/i.test(s)) return true;
        if (/\b(?:e2|n1|n2|c2|m1|t2|g2|a2)[\-_\s](?:standard|highmem|custom|micro|small|medium|large)[\-_0-9]*\b/i.test(s)) return true;
        if (/^(?:compute|storage|ram|vcpu|cpu|disk|memory|logs|bandwidth|consumption|data transfer|iops|unnamed.*|nan|null)$/i.test(s)) return true;
        if (/^(?:other cost.*|total.*|monthly bill.*|target cost.*|expected cost.*|costs? to cut.*|gcp.*|aws.*|azure.*)$/i.test(s)) return true;
        if (/^(?:node|pod|replicas?|workload|workloads|container|containers|cluster|k8s|kubernetes|machines?|servers?)$/i.test(s)) return true;
        if (/\b(?:machines?|pools?|servers?|clusters?|spot instances?)\b/i.test(s)) return true;
        return false;
    }

    const KNOWN_GIVEN_NAMES = new Set([
        // (v11.2.0) common international given names and surnames (found missing by the mass test campaign)
        "aaron", "abigail", "adam", "adams", "ahmed", "aisha", "alan", "albert", "alexander", "alexis", "alice", "allen", "alvarez", "amanda", "amber", "amy", "anderson", "andrea", "andres", "andrew", "angela", "ann", "anna", "anthony", "arthur", "ashley", "austin", "bailey", "baker", "barbara", "becker", "benjamin", "bennett", "betty", "beverly", "bianchi", "billy", "bobby", "bradley", "brandon", "brenda", "brian", "brittany", "brooks", "brown", "bruce", "bryan", "camila", "campbell", "carl", "carlos", "carol", "carolyn", "carter", "castillo", "catherine", "charles", "charlotte", "chavez", "chen", "cheryl", "chiara", "christian", "christina", "christine", "christopher", "clark", "collins", "colombo", "cook", "cooper", "cox", "cruz", "cynthia", "daniel", "danielle", "david", "davis", "deborah", "debra", "denise", "dennis", "diana", "diane", "diaz", "diego", "donald", "donna", "doris", "dorothy", "douglas", "dylan", "edward", "edwards", "elena", "elias", "elijah", "elizabeth", "emil", "emily", "emma", "eric", "esposito", "ethan", "eugene", "evans", "evelyn", "fatima", "felix", "ferrari", "finn", "fischer", "flores", "foster", "frances", "frank", "gabriel", "gao", "garcia", "gary", "george", "gerald", "giulia", "gloria", "gomez", "gonzalez", "grace", "gray", "green", "gregory", "guo", "gutierrez", "haddad", "hall", "hannah", "hao", "harold", "harris", "haruto", "hassan", "he", "heather", "helen", "henry", "hernandez", "hill", "hiroshi", "hoffmann", "howard", "hu", "huang", "hughes", "hugo", "hui", "hussein", "ines", "isabel", "isabella", "ito", "jack", "jackson", "jacob", "jacqueline", "james", "janet", "janice", "jason", "javier", "jean", "jeffrey", "jennifer", "jeremy", "jerry", "jesse", "jessica", "jie", "jimenez", "joan", "joe", "john", "johnson", "jonas", "jonathan", "jones", "jordan", "jose", "joseph", "joshua", "joyce", "juan", "judith", "judy", "julia", "julie", "jun", "justin", "karen", "katherine", "kathleen", "kathryn", "kayla", "keith", "kelly", "kenji", "kenneth", "kevin", "khalid", "khoury", "kim", "kimberly", "king", "kobayashi", "kyle", "larry", "laura", "lauren", "lawrence", "layla", "lee", "lei", "leon", "lewis", "li", "liam", "lin", "linda", "ling", "lisa", "liu", "logan", "long", "lopez", "lori", "luca", "lucas", "lucia", "luis", "lukas", "luo", "ma", "madison", "mansour", "margaret", "maria", "mariam", "marie", "marilyn", "mark", "martha", "martin", "martinez", "mary", "mason", "mateo", "matthew", "maximilian", "megan", "mei", "melissa", "mendoza", "meyer", "michael", "michelle", "miguel", "miller", "ming", "mitchell", "mohammed", "moore", "morales", "morgan", "morris", "murphy", "myers", "nakamura", "nancy", "nasser", "natalie", "nathan", "nelson", "nguyen", "nicholas", "nicole", "noah", "oliver", "olivia", "omar", "ortiz", "oscar", "pablo", "pamela", "parker", "patel", "patricia", "patrick", "paul", "paulo", "pedro", "perez", "peter", "peterson", "philip", "phillips", "price", "rachel", "ralph", "ramirez", "ramos", "randy", "raymond", "rebecca", "reed", "ren", "reyes", "ricci", "richard", "richardson", "rivera", "robert", "roberts", "robinson", "rodriguez", "roger", "rogers", "romano", "ronald", "ross", "rossi", "roy", "ruiz", "russell", "russo", "ruth", "ryan", "saleh", "samantha", "samuel", "sanchez", "sanders", "sandra", "sara", "sarah", "sato", "schneider", "schulz", "scott", "sean", "sergio", "sharon", "shirley", "smith", "sofia", "sophia", "sora", "stephanie", "stephen", "steven", "stewart", "sun", "susan", "suzuki", "takahashi", "takeshi", "tanaka", "tao", "tariq", "taylor", "teresa", "terry", "theo", "theresa", "thomas", "thompson", "timothy", "torres", "turner", "tyler", "valentina", "victoria", "vincent", "virginia", "wagner", "walker", "walter", "wang", "ward", "watanabe", "watson", "wayne", "weber", "wei", "white", "william", "williams", "willie", "wilson", "wood", "wright", "wu", "xin", "xu", "yamamoto", "yan", "yang", "ying", "young", "yuki", "yusuf", "zachary", "zahra", "zhang", "zhao", "zhou", "zhu",

        "agnihotri", "asha", "bhalla", "bhandari", "bisht", "chauhan", "dave", "doshi", "gurung", "jadeja", "jhaveri", "joshi", "kapur", "karki", "khurana", "kothari", "lama", "mehrotra", "mistry", "modi", "mody", "negi", "panchal", "pandya", "pant", "parikh", "parmar", "rai", "rajput", "rana", "rathore", "raval", "rawat", "sanghvi", "seth", "shah", "sherpa", "solanki", "soni", "tamang", "tandon", "tewari", "thakur", "thapa", "trivedi", "vaghela", "vyas", "zala",

        // (v11.1.0) more Indian given names and surnames
        "aamir", "abdul", "acharya", "ahmed", "ahuja", "aisha", "ali", "alia", "aliya", "amandeep", "amin", "amina", "anand", "ansari", "anthony", "antony", "archana", "arif", "arora", "arvind", "asif", "asma", "awasthi", "ayesha", "baig", "bains", "bajpai", "balasubramanian", "baliga", "baljit", "balwinder", "basu", "bedi", "begum", "benny", "bhargava", "bhat", "bhatia", "bhattacharya", "bhavna", "biju", "binu", "biswas", "bose", "brar", "chahal", "chakraborty", "chanda", "chari", "chaturvedi", "chawla", "chowdary", "dasgupta", "deepa", "devendra", "dhawan", "dhillon", "dinesh", "dixit", "dutta", "dwivedi", "faisal", "farah", "fatima", "feroz", "francis", "gandhi", "ganesh", "ganguly", "george", "ghoshal", "gill", "girish", "gopalan", "govind", "gowda", "grewal", "grover", "gurpreet", "haider", "halder", "hamid", "harish", "harjit", "harpreet", "hasan", "hazra", "heena", "hegde", "hina", "hussain", "imtiaz", "irfan", "iyengar", "iyer", "jana", "jasbir", "jaspreet", "javed", "jijo", "jitendra", "jomon", "joseph", "junaid", "jyoti", "kajal", "kamala", "kamath", "kamran", "kar", "karanth", "kaur", "khalid", "khanna", "khatun", "kini", "kohli", "krishnan", "kudva", "kuldeep", "kulwant", "kurian", "kurup", "lata", "leela", "luthra", "madhu", "mahendra", "mahesh", "maity", "majumdar", "mallya", "mamta", "manju", "manoj", "manpreet", "mathew", "mathur", "meenakshi", "megha", "mehak", "mehra", "menon", "milind", "mirza", "mitra", "mohammad", "mohammed", "mohd", "mondal", "mujeeb", "mukesh", "mukherjee", "murthy", "murty", "naidu", "naik", "nair", "nambiar", "nandini", "naqvi", "narayanan", "narendra", "naresh", "naseem", "natarajan", "navneet", "nayak", "nazia", "nigam", "oberoi", "padma", "pai", "pal", "panicker", "paramjit", "parvati", "pathak", "pathan", "paul", "philip", "pillai", "poojary", "poonam", "prabhu", "pradeep", "pramod", "puri", "qureshi", "radha", "rai", "rajan", "rajeev", "rajendra", "raju", "rakesh", "ramachandran", "raman", "ramesh", "randhawa", "rani", "rao", "rashid", "rashmi", "reddy", "rekha", "renu", "ritika", "ritu", "rizvi", "rizwan", "roy", "rubina", "rupa", "sabharwal", "saha", "salim", "salman", "sana", "sandeep", "sandhu", "sangeeta", "sanjeev", "sapna", "sara", "sarah", "sarita", "sarkar", "sarma", "sastry", "satish", "savita", "saxena", "sayyed", "sebastian", "seema", "sengupta", "sethi", "shabana", "shahid", "shaji", "shakeel", "shanti", "shazia", "shenoy", "shetty", "shoaib", "shobha", "shukla", "shweta", "siddiqui", "sidhu", "simran", "smita", "sonam", "sonia", "srinivasan", "subramaniam", "sudha", "sudhir", "sukhwinder", "suman", "sundaram", "sunita", "sunny", "surendra", "suresh", "suri", "sushma", "swamy", "sweta", "syed", "talwar", "tara", "tariq", "thampi", "thomas", "tomy", "tripathi", "trivedi", "uma", "umesh", "upadhyay", "upadhyaya", "usha", "vajpayee", "vandana", "varghese", "varma", "veena", "venkatesh", "vidya", "vimala", "vinod", "virendra", "virk", "vohra", "walia", "warrier", "wasim", "xavier", "yamini", "yasmin", "yusuf", "zaidi", "zainab", "zara", "zoya", "zubair",

        // (v10.5.1) common Indian given names and surnames that were missing; English words (Hope, Grace) are not added.
        "aarav", "aadhya", "aakash", "aaliyah", "aamir", "aanya", "aarti", "abhay", "abhinav", "abhishek", "aditi", "aditya", "afreen", "afsana", "ahmed", "aishwarya", "ajay", "ajit", "akanksha", "akash", "akhil", "akshay", "alok", "amar", "amit", "amitabh", "amrita", "anand", "ananya", "anil", "anirudh", "anita", "anjali", "ankit", "ankita", "anuj", "anupam", "anushka", "aparna", "arjun", "arnav", "arpit", "arun", "aruna", "arvind", "ashish", "ashok", "ashwin", "asif", "ayesha", "ayush", "azhar", "bhavana", "bhavesh", "bharat", "bhuvan", "chaitanya", "chetan", "chirag", "deepak", "deepika", "devendra", "dhruv", "dinesh", "divya", "farhan", "farah", "faisal", "gaurav", "gautam", "geeta", "girish", "gopal", "govind", "gunjan", "harish", "harsha", "hemant", "himanshu", "hitesh", "imran", "irfan", "ishaan", "ishita", "jagdish", "jatin", "jayant", "jaya", "jitendra", "jyoti", "kabir", "kajal", "kalpana", "kamal", "kapil", "karan", "kartik", "kavita", "kavya", "keshav", "kiran", "kishore", "komal", "krishna", "kunal", "lakshmi", "lalit", "madhav", "madhuri", "mahesh", "manish", "manisha", "manoj", "mayank", "meena", "meera", "mohan", "mohit", "mukesh", "nadia", "naveen", "neeraj", "neha", "nikhil", "nilesh", "nisha", "nitin", "pallavi", "pankaj", "parth", "pooja", "prabhat", "pradeep", "prakash", "pranav", "prashant", "pratik", "praveen", "preeti", "priyanka", "rachna", "raghav", "rahul", "rajat", "rajeev", "rajesh", "rakesh", "ramesh", "rashmi", "ravi", "riya", "rohan", "rohit", "ruchi", "sachin", "sahil", "sakshi", "salman", "sameer", "sandeep", "sanjay", "santosh", "sarita", "saurabh", "shalini", "shashank", "shikha", "shilpa", "shivam", "shreya", "shruti", "siddharth", "sneha", "sonal", "sonia", "srinivas", "sudhir", "sujata", "sumit", "sunil", "sunita", "suresh", "swati", "tanvi", "tarun", "tushar", "uday", "umesh", "varun", "vijay", "vikas", "vikram", "vinay", "vineet", "vinod", "vishal", "vivek", "yash", "yogesh", "zainab", "zoya", "agarwal", "ahuja", "bajaj", "banerjee", "bhatt", "bhattacharya", "chatterjee", "chaudhary", "choudhary", "chopra", "das", "dasgupta", "desai", "deshmukh", "deshpande", "dubey", "dutta", "gandhi", "ghosh", "goswami", "gupta", "iyengar", "jain", "joshi", "kapoor", "khan", "khanna", "kulkarni", "kumar", "malhotra", "mehra", "mehta", "menon", "mishra", "mukherjee", "naidu", "nair", "pandey", "patel", "patil", "pillai", "prasad", "qureshi", "rao", "reddy", "saxena", "sen", "sengupta", "shaikh", "sharma", "shetty", "shukla", "singh", "sinha", "srivastava", "subramanian", "tiwari", "trivedi", "varma", "verma", "yadav",

        // Indian / South Asian Given Names & Surnames
        "rithan", "srinadh", "adisubu", "himanshu", "rahul", "aditya", "abhinand", "pradeep", 
        "rohit", "arun", "varun", "kartik", "karthik", "suresh", "nitish", "ramesh", "anand", "venkat", "priya", 
        "sneha", "pooja", "ananya", "deepa", "lakshmi", "swati", "divya", "kavita", "neha", 
        "amit", "anil", "ashok", "deepak", "dinesh", "harish", "jitendra", "krishna", "manoj", 
        "mukesh", "naveen", "pankaj", "pawan", "rajesh", "rakesh", "ravi", "sanjay", "satish", 
        "sharma", "singh", "sunil", "vijay", "vikram", "vinod", "vivek", "anita", "archana", 
        "bhavna", "geeta", "meena", "monika", "poonam", "rekha", "ritu", "sandhya", "sarita", 
        "shweta", "sunita", "usha", "vandana",
        "vinita", "vedika", "shrusti", "naazia", "jaideep", "guntupalli", "vaishnavi", "madugula", 
        "sraveen", "naik", "aayush", "tyagi", "choudhury", "tanul", "kshitij", "abhishek", "gupta",
        "karan", "simar", "varinder", "gurtej", "sanjeev", "surinder", "dhillon", "sethi",
        "aadarsh", "aaditya", "aakash", "aarav", "aaryan", "aashish", "abhay", "abhijeet", "abhijit", "abhinav", 
        "aditi", "ajay", "ajit", "akanksha", "akash", "akhil", "akshat", "akshay", "alok", "aman", "amar", 
        "ambika", "amita", "amrita", "aniket", "aniruddh", "anirudh", "anjali", "ankit", "ankita", "ankur", 
        "anmol", "anoop", "anshuman", "anshul", "anuj", "anup", "anupam", "anurag", "aparna", "apurva", 
        "arpit", "arpita", "arti", "aruna", "arundhati", "arvind", "arya", "aryan", "ashish", "ashutosh", 
        "ashwin", "ashwini", "asif", "atul", "avinash", "ayush", "ayushi", "balaji", "bharat", "bharti", 
        "bhaskar", "bhavana", "bhavin", "bhavesh", "brijesh", "chaitanya", "chandan", "chandani", 
        "chandrashekhar", "chetna", "chetan", "chhavi", "chinmay", "chirag", "damodar", "darshan", 
        "deeksha", "deepali", "deepika", "deepti", "dev", "devendra", "devika", "dhananjay", "dharmendra", 
        "dhaval", "dhruv", "dileep", "dilip", "dipak", "dipti", "divyesh", "durga", "ekta", "esha", 
        "gagan", "ganesh", "garima", "gaurav", "gautam", "gayatri", "geetanjali", "girish", "gopal", 
        "govind", "gunjan", "gurpreet", "hardik", "hari", "harpreet", "harsh", "harsha", "harshad", 
        "harshit", "harshita", "hemant", "hema", "himani", "hitesh", "indira", "indu", "isha", "ishaan", 
        "ishan", "ishita", "jagdish", "jai", "jatin", "jaya", "jayant", "jayesh", "jeetu", "jyoti", 
        "kajal", "kalpana", "kalyan", "kamal", "kamlesh", "kanika", "kapil", "karun", "karuna", "kashish", 
        "kaushik", "kavitha", "keerthi", "keshav", "kiran", "kirti", "kishan", "kishore", "komal", 
        "kripa", "kriti", "kritika", "kuldeep", "kumar", "kunal", "kush", "kushal", "lakshay", "lalit", 
        "lalita", "lavanya", "lokesh", "madhav", "madhu", "madhuri", "mahadev", "mahesh", "mamta", 
        "manan", "manas", "mandar", "maneesh", "manish", "manisha", "manju", "manjula", "manohar", 
        "manpreet", "mansi", "mayank", "mayur", "meenakshi", "meera", "megha", "mihir", "milan", 
        "milind", "minakshi", "mithun", "mitesh", "mohit", "mona", "mradul", "mridul", "mukul", 
        "murali", "murthy", "nagesh", "naman", "namrata", "nandini", "nandita", "naresh", "narendra", 
        "natraj", "navin", "navneet", "neeraj", "neerav", "neetika", "neetu", "nidhi", "nikhil", 
        "nikita", "nilesh", "nimish", "ninad", "niraj", "niramay", "nirav", "nirmal", "nisha", 
        "nishant", "nishtha", "nitesh", "nitin", "omkar", "omprasad", "pallavi", "parag", "paras", 
        "paresh", "paridhi", "parth", "parul", "parveen", "pavan", "payal", "piyush", "poornima", 
        "prabal", "prabhat", "prabhu", "prachi", "pradhuman", "pradyumna", "prafull", "prajakta", 
        "prakash", "pramod", "pranav", "pranay", "praneeth", "prasad", "prashant", "prateek", 
        "pratik", "pratima", "praveen", "pravin", "prerna", "preeti", "priti", "priyanka", "pujit", 
        "puneet", "purav", "pushkar", "rachit", "radha", "radhika", "raghav", "raghavan", "raghu", 
        "raj", "rajan", "rajat", "rajeev", "rajendra", "rajiv", "rajkumar", "rajneesh", "raju", 
        "rakhi", "ram", "raman", "ramila", "ramu", "rashmi", "ratan", "ravindra", "renu", "reshma", 
        "richa", "ridhi", "riddhi", "rishabh", "rishi", "rita", "ritesh", "rohan", "ronak", "ruchika", 
        "ruchi", "rupali", "rupa", "rupam", "ruturaj", "sachin", "sagar", "sahil", "sakshi", "saloni", 
        "sameer", "samir", "sandeep", "sandip", "sangeeta", "sanjiv", "sanket", "santosh", "sanyogita", 
        "sapna", "sarala", "saraswati", "saroj", "sarthak", "sarvesh", "satendra", "satya", "satyendra", 
        "saurabh", "savita", "seema", "shailendra", "shailesh", "shalini", "shambhavi", "shankar", 
        "shantanu", "sharad", "sharda", "sharmila", "shashank", "shashi", "shekhar", "shikha", 
        "shilpa", "shivam", "shivani", "shobha", "shobhit", "shree", "shreya", "shreyas", "shrikant", 
        "shripad", "shrishti", "shristi", "shruthi", "shruti", "shubham", "shubhi", "shyam", 
        "siddhant", "siddharth", "simran", "snehal", "sohan", "somesh", "sonal", "sonali", "sonam", 
        "sonia", "sourav", "sparsh", "spandan", "srinivas", "subhash", "subodh", "sudarshan", 
        "sudha", "sudhanshu", "sudhir", "suhas", "sujata", "sujit", "sulekha", "suman", "sumeet", 
        "sumit", "sundar", "suraj", "surabhi", "surashree", "surbhi", "sushant", "sushil", 
        "sushila", "sushma", "swapnil", "sweta", "tanmay", "tanu", "tanuj", "tanuja", "tanvi", 
        "tapas", "tarun", "tejas", "tejaswi", "tribhuvan", "tripti", "trisha", "tushar", "uday", 
        "ujjwal", "umang", "umesh", "upendra", "urvashi", "uttam", "vaibhav", "vaidehi", "vaishali", 
        "vaishnav", "varunika", "vedant", "veena", "venkatesh", "vibhuti", "vidhi", "vidur", "vidya", 
        "vidyadhar", "vijaya", "vikas", "vikrant", "vimal", "vinay", "vinayak", "vineet", "vinit", 
        "vipin", "viplav", "vipul", "virat", "virendra", "vishaal", "vishal", "vishnu", "vishwanath", 
        "yash", "yashasvi", "yashpal", "yashvant", "yashwant", "yogendra", "yogesh", "yuvraj", 
        "zoya", "zaheer", "zeenat",
        "verma", "agarwal", "aggarwal", "mishra", "patel", "reddy", "rao", "yadav", "joshi", 
        "bhat", "bhatt", "shukla", "pandey", "tiwari", "saxena", "jain", "chouhan", "chauhan", 
        "iyer", "iyengar", "nair", "pillai", "menon", "das", "mukherjee", "banerjee", "chatterjee", 
        "ghosh", "sen", "bose", "dutta", "ganguly", "deshmukh", "kulkarni", "patil", "pawar", 
        "shinde", "gaikwad", "more", "jadhav",
        // Western / Global / Biblical
        "jesus", "christ", "peter", "paul", "john", "thomas", "matthew", "luke", "james", "mary", "joseph", 
        "moses", "abraham", "david", "solomon", "judas", "simon", "andrew", "philip", "bartholomew",
        "alex", "alexander", "anthony", "arthur", "brian", "charles", "christopher", 
        "daniel", "edward", "george", "mark", 
        "michael", "richard", "robert", "william", "elena", "maria", 
        "sarah", "emily", "jessica", "ashley", "amanda", "elizabeth", "jennifer", "linda", 
        "rowan", "wanjiru", "orla", "pelelrin", "valesa", "calerona", "randhaven",
        "benjamin", "lucas", "henry", "oliver", "sebastian", "jack", "samuel", "liam", "noah",
        "emma", "olivia", "charlotte", "sophia", "amelia", "isabella", "mia", "harper", "evelyn"
    ]);

    // "between Naazia, Vinita and Shrusti": the token must itself be capitalised and sit inside an unbroken
    // comma / "and" separated run of capitalised words directly after the trigger word. The old rule accepted
    // ANY word up to 100 characters later, so "...even when they are offline" made "offline" a person name.
    // Given names that are also everyday English words ("More focus on...", "Mark as done", "RAM usage").
    // They only count as a name next to another name ("Rahul More") or in an explicit name field ("Author: Mark").
    const AMBIGUOUS_NAME_WORDS = new Set(["more", "mark", "jack", "ram", "harsh", "milan", "dev", "will", "may", "rose", "grace",
        "hope", "joy", "bill", "pat", "art", "guy", "ray", "rich", "frank", "rob", "sky", "summer", "june", "april", "august",
        "faith", "angel", "honey", "amber", "ruby", "crystal", "dawn", "eve", "ivy", "lily", "iris", "page", "chase", "hunter",
        "carter", "miles", "chance", "king", "lord", "deep", "jay", "prince", "star", "max", "victor", "penny", "don", "rex",
        "earl", "duke", "christian", "justice", "royal", "noble", "major", "baker", "cook", "mason", "parker", "walker", "young",
        "white", "black", "brown", "green", "gray", "grey", "hill", "wood", "stone", "swift", "moon", "love", "kind", "sweet"]);
    // words that put a brand surname in a COMPANY context ("works at Bajaj", "from Tata") rather than after a first name
    const CO_WORDS_FOR_SURNAME = new Set(["at", "from", "with", "by", "for", "joined", "vendor", "client", "partner", "the"]);
    // Could this single word be somebody's name (a known given name / surname, or an ambiguous name like "Mark")?
    function couldBeName(w) { const l = (w || "").toLowerCase(); return KNOWN_GIVEN_NAMES.has(l) || AMBIGUOUS_NAME_WORDS.has(l); }
    // Corporate suffixes: a capitalised phrase ending in one of these is a company, never a person.
    const CORP_SUFFIX_RE = /\b(?:Pvt\.?|Private|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|LLC|LLP|PLC|Technologies|Solutions|Services|Systems|Labs|Software|Networks|Traders|Industries|Enterprises|Consulting|Consultancy|Logistics|Pharma|Pharmaceuticals|Ventures|Partners|Associates|Holdings|Analytics|Motors|Insurance|Hospital|Studios|Group|Foods)\.?$/;
    // Is `token` part of a company name ("Pinnacle Software", "Evergreen Agro Traders") on its line?
    function isInCorporateName(token, line) {
        if (!token || !line) return false;
        if (line.length > 400) {   // long lines (minified JSON): only the text around the token matters
            const i = line.indexOf(token);
            if (i < 0) return false;
            line = line.slice(Math.max(0, i - 150), i + token.length + 150);
        }
        const re = /(?:[A-Z][\w&'.-]*\s+){0,3}[A-Z][\w&'.-]*\s+(?:Pvt\.?\s+Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|LLC|LLP|PLC|Technologies|Solutions|Services|Systems|Labs|Software|Networks|Traders|Industries|Enterprises|Consulting|Logistics|Pharma|Ventures|Partners|Associates|Holdings|Analytics|Motors|Insurance|Studios|Group)\b/g;
        let m;
        while ((m = re.exec(line)) !== null) if (m[0].includes(token)) return true;
        return false;
    }
    function isKnownGivenNameWord(w) {
        const t = (w || "").toLowerCase();
        return KNOWN_GIVEN_NAMES.has(t) && !AMBIGUOUS_NAME_WORDS.has(t);
    }

    // "Reviewer Name: | Nihar A", "Name of the Reviewee: Shubham", "Candidate Name = X": the token sits right after a
    // field label that names a PERSON (not "Company Name", "File Name", "Project Name", ...).
    const NON_PERSON_NAME_FIELDS = /\b(?:company|business|bank|brand|vendor|product|file|project|app|application|team|department|branch|store|shop|organi[sz]ation|org|firm|employer|account|server|host|database|db|table|column|field|domain|event|course|school|college|university|institute|hospital|city|state|country|plan|policy|item|model|device|document|folder|sheet|tab|key|variable|function|class|package|module|service|task|job|role|position|designation|scheme|campaign|channel|group|page|site|website|platform|tool|merchant|client\s+company|entity|legal|trade|display|user|screen|host|bucket|region|cluster|instance|image|repo|repository|branch)\s+name\b|\bname\s+of\s+(?:the\s+)?(?:company|business|bank|organi[sz]ation|firm|employer|entity|product|project|vendor|institution|hospital|school|college|course|scheme|plan|policy|file|document)\b/i;
    function isTokenInNameField(token, text) {
        return memoText(text, 'namefield', token, () => isTokenInNameField_impl(token, text));
    }
    function isTokenInNameField_impl(token, text) {
        const t = (token || "").trim();
        if (!t || !text || t.length < 2) return false;
        text = narrowText(t, text);
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('((?:\\b[A-Za-z]+\\s+){0,2}name(?:\\s+of\\s+(?:the\\s+)?[A-Za-z]+)?)\\s*[:=]\\s*(?:\\|\\s*)?["\'*]*' + esc + '(?![A-Za-z0-9])', 'gi');
        let m;
        while ((m = re.exec(text)) !== null) {
            if (!NON_PERSON_NAME_FIELDS.test(m[1])) return true;
        }
        return false;
    }

    function isInSerialNameList(token, text) {
        const t = (token || "").trim();
        if (!t || !text || !/^\p{Lu}/u.test(t)) return false;
        text = narrowText(t, text);
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const name = "\\p{Lu}[\\p{L}'.-]*(?:\\s+\\p{Lu}[\\p{L}'.-]*)?";
        const re = new RegExp('\\b(?:[Bb]etween|[Aa]mong|[Aa]ssigned\\s+to|[Dd]istribute(?:d)?\\s+(?:between|among|to)|[Cc]hats?\\s+to|[Aa]gents?)\\s+(?:' + name + '\\s*(?:,|\\band\\b|&)\\s*){0,12}' + esc + '(?![\\p{L}])', 'u');
        return re.test(text);
    }

    // Small-context results are cached too: the same candidate/context pairs come up thousands of times on
    // long documents, and every call compiles several regular expressions.
    const __ptShortMemo = new Map();
    function shortMemo(key, compute) {
        if (__ptShortMemo.has(key)) return __ptShortMemo.get(key);
        const v = compute();
        if (__ptShortMemo.size > 50000) __ptShortMemo.clear();
        __ptShortMemo.set(key, v);
        return v;
    }
    function isPersonName(str, context) {
        if (!str || str.length > MAX_TOKEN_LEN) return false;
        if (!context || context.length < NARROW_MIN_LENGTH) return shortMemo('P\u0001' + (str || '') + '\u0001' + (context || ''), () => isPersonName_impl(str, context));
        return memoText(context, 'person', str || '', () => isPersonName_impl(str, narrowText((str || '').trim(), context)));
    }
    function isPersonName_impl(str, context) {
        // (v11.2.0) Two or three words that are all known given names / surnames are a person, even when a surname is
        // also a brand ("Dhruv Bajaj", "Ratan Tata").
        {
            const ws0 = String(str || "").trim().split(/\s+/);
            if (ws0.length >= 2 && ws0.length <= 3 && ws0.every(w => /^[A-Z][a-z'\-]+$/.test(w)) &&
                KNOWN_GIVEN_NAMES.has(ws0[0].toLowerCase()) && ws0.every(w => KNOWN_GIVEN_NAMES.has(w.toLowerCase()))) return true;
        }
        {
            const t0 = (str || "").trim();
            // Never a person: match titles ("India vs Canada"), places, months / weekdays, ordinary words alone.
            if (/\b(?:vs\.?|v\.?|versus)\s/i.test(t0)) return false;
            if (containsPlace(t0)) return false;
            const w0 = t0.split(/\s+/).filter(Boolean);
            if (w0.length && w0.every(w => isCalendarWord(w) || /^\d+$/.test(w))) return false;
            // a language word means it is not a person ("Bengali", "Thoughtctrl Hindi")
            if (w0.some(w => isLanguageWord(w.replace(/[.,;:]+$/, "")))) return false;
            if (w0.every(w => isHonorific(w))) return false;
            if (w0.length === 1 && isCommonWord(w0[0]) && !isTokenInNameField(t0, context)) return false;
        }
        if (!str) return false;
        const s = str.trim();
        if (s.length < 3) return false;
        if (hasNonEntityWord(s)) return false;
        if (isFieldLabelOrHeader(s)) return false;
        if (isInfraOrServerTerm(s)) return false;
        if (isBusinessName(s, s, context)) return false;

        // Context clue: name fields ("Author: X", "Customer Name: X") or an introduction ("I'm X", "my name is X").
        // (v10.5.2) The key must sit directly before THIS text. Before, any "I am" anywhere on the line ("i am in
        // touch with this parent") turned every phrase on that line into a name ("Login Related").
        if (context) {
            const escN = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const before = "(?:(?:customer|full|employee|candidate|patient|applicant|lead|client|assignee|reporter|author)\\s*name\\s*[:=,\"']\\s*[\"']?|@(?:author|committer|maintainer|applicant|assignee|owner|reporter|signed-off-by)\\b[\\s:=]*|\\b(?:author|committer|maintainer|applicant|assignee|owner|reporter|signed-off-by)\\s*[:=]\\s*[\"']?|(?:\\bi['\\u2019]?m|\\bi\\s+am|\\bmy\\s+name\\s+is|\\bthis\\s+is)\\s+)";
            if (new RegExp(before + escN + "(?![\\p{L}])", "iu").test(context)) {
                if (/^[\p{L}\s'\.\-]+$/u.test(s) && !/^(?:insert|select|na|none|null|undefined)$/i.test(s) && !hasNonEntityWord(s) && !isFieldLabelOrHeader(s) &&
                    !isOrdinaryPhrase(s)) {
                    return true;
                }
            }
        }

        // Narrative / Dialogue context: "Jesus said to his disciples", "Thomas said to him", "X said to Y", "replied to X"
        if (context) {
            const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp('(?:^|[^\\p{L}])' + esc + '\\s+said\\s+to\\b', 'iu').test(context)) return true;
            if (new RegExp('(?:said|spoke|told|replied|answered)\\s+to\\s+["\'*]*' + esc + '\\b', 'iu').test(context)) return true;
            // Jira / Atlassian user format: <Name>,<Account ID> (e.g. "Asha Rao,712020:0000-...", "Ravi Kumar,aaaaaaaa...")
            if (new RegExp('(?:^|[,\\r\\n])' + esc + ',\\s*(?:\\d{6,}:[a-f0-9\\-]+|[a-f0-9]{24})\\b', 'i').test(context)) return true;
            // Serial name list context: "between Naazia, Vinita, Vedika, Shrusti", "assigned to X, Y, Z"
            if (isInSerialNameList(s, context)) return true;
        }

        const tokens = s.toLowerCase().split(/\s+/);
        // Single name must be in verified given names (and not an everyday English word such as "More")
        if (tokens.length === 1) {
            return isKnownGivenNameWord(tokens[0]) || isTokenInNameField(s, context);
        }

        // Multi-part name (2 to 4 words):
        // 1. Must NOT contain any non-entity words (already verified above)
        // 2. Contains a verified given name/surname OR context is a name field
        if (tokens.length >= 2 && tokens.length <= 4) {
            if (tokens.some(t => KNOWN_GIVEN_NAMES.has(t))) {
                return true;
            }
        }
        // (v10.5.2) The v10.5.1 rule "any 2-3 distinctive capitalised words is a name" was removed: it labeled
        // "Vernier Calipers", "Login Related" and "Alerady Enrolment". Names now need a known given name / surname.
        return false;
    }

    // Verified corporate entities, OEMs, vehicle makes, and platforms
    const KNOWN_BUSINESS_NAMES = new Set([
        // (v11.1.0) major Indian and global companies that were missing (Infosys, Wipro, Zoho, Deloitte ...)
        "1mg", "5paisa", "abb", "acc", "accenture", "acko", "adani", "adidas", "adobe", "air india", "airbnb", "airbus", "airtel", "akasa", "alibaba", "alphabet", "amazon web services", "ambuja", "amd", "american express", "amul", "angel one", "anthropic", "asana", "ashok leyland", "asian paints", "astrazeneca", "ather energy", "atlassian", "aurobindo", "avenue supermarts", "aws", "baidu", "bain", "bajaj allianz", "bajaj finserv", "bankbazaar", "bayer", "bcg", "berger", "bewakoof", "bharatpe", "bharti airtel", "billdesk", "biocon", "birlasoft", "blackbuck", "blue dart", "bluedart", "boeing", "booking.com", "bosch", "britannia", "browserstack", "bsnl", "burger king", "byju's", "byjus", "bytedance", "canon", "canva", "capgemini", "cashfree", "chargebee", "chevron", "cipla", "cisco", "cleartrip", "clickup", "coca-cola", "coforge", "cognizant", "colgate", "confluent", "costco", "coverfox", "cred", "curefit", "cyient", "dabur", "dailyhunt", "databricks", "decathlon", "deepmind", "delhivery", "dell", "deloitte", "digit insurance", "dmart", "domino's", "dominos", "dr reddy's", "dream11", "dropbox", "druva", "dunzo", "easemytrip", "ecom express", "economic times", "elastic", "emami", "ernst", "eruditus", "expedia", "exxonmobil", "facebook", "fi money", "firstcry", "force motors", "freshdesk", "freshworks", "fujitsu", "general electric", "glenmark", "godrej", "google", "groww", "gsk", "hashicorp", "hasura", "hcl", "hcltech", "hdfc", "healthifyme", "hero motocorp", "hexaware", "hindu", "hindustan times", "hindustan unilever", "honeywell", "huawei", "hubspot", "hul", "ibm", "icertis", "icici", "ikea", "inc42", "india today", "indigo", "infosys", "inmobi", "inshorts", "instagram", "instamojo", "intel", "intercom", "irctc", "itc", "ixigo", "jd.com", "johnson & johnson", "jsw", "jupiter", "juspay", "khatabook", "kpmg", "l&t", "larsen & toubro", "lenovo", "lenskart", "linkedin", "livspace", "ltimindtree", "lupin", "mahindra", "mailchimp", "mamaearth", "marico", "mastercard", "mcdonald's", "mcdonalds", "mckinsey", "merck", "microsoft", "mindtree", "miro", "mobikwik", "monday.com", "moneycontrol", "mongodb", "motorola", "mphasis", "mpl", "ndtv", "nestle", "netflix", "netmeds", "nike", "nikon", "niva bupa", "nokia", "notion", "novartis", "nvidia", "nykaa", "nykaa fashion", "okcredit", "okta", "ola electric", "onecard", "oneplus", "openai", "oppo", "oracle", "oyo", "paisabazaar", "palantir", "panasonic", "parle", "patanjali", "paypal", "pepperfry", "pepsico", "persistent", "pfizer", "pharmeasy", "philips", "physicswallah", "pidilite", "pine labs", "pizza hut", "policybazaar", "postman", "practo", "procter & gamble", "puma", "pwc", "qualcomm", "rakuten", "razorpay", "realme", "redbus", "reebok", "reliance", "republic", "ringcentral", "rivigo", "roche", "royal enfield", "salesforce", "samsung", "sanofi", "schneider electric", "scripbox", "shadowfax", "sharechat", "shopify", "siemens", "simplilearn", "smallcase", "snowflake", "sonata", "sony", "spicejet", "spotify", "starbucks", "stripe", "sugar cosmetics", "sun pharma", "tanishq", "tata", "tata motors", "tata power", "tata steel", "tcs", "tech mahindra", "tencent", "tiktok", "times of india", "titan", "toppr", "toshiba", "trello", "tripadvisor", "twilio", "twitter", "ultratech", "unacademy", "uniqlo", "upgrad", "urban ladder", "vedanta", "vedantu", "vistara", "vivo", "vmware", "vodafone idea", "walmart", "webex", "whatsapp", "whitehat jr", "wipro", "xiaomi", "young", "yourstory", "youtube", "zara", "zee news", "zendesk", "zensar", "zerodha", "zoho", "zoom", "zydus",

        // Auto, Tractor, Heavy Equipment OEMs & Brands
        "maruti", "suzuki", "hyundai", "tata", "mahindra", "renault", "nissan", "volkswagen", 
        "skoda", "toyota", "honda", "ford", "chevrolet", "jeep", "mg", "fiat", "peugeot", 
        "citroen", "porsche", "tesla", "jaguar", "volvo", "audi", "bmw", "mercedes", "isuzu", 
        "mitsubishi", "subaru", "mazda", "byd", "bajaj", "tvs", "ducati", "harley", 
        "kawasaki", "kubota", "eicher", "sonalika", "swaraj", "jcb",
        "komatsu", "hitachi", "caterpillar", "yanmar", "bobcat", "claas", "ssangyong",
        // Tech, SaaS, Auto Research & Platforms
        "91wheels", "acko", "carwale", "cardekho", "bikewale", "zigwheels", 
        "spinny", "cars24", "droom", "autocar", "gaadiwadi", "motorbeam",
        "carrypro", "moxie", "moxie beauty", "eume", "twin birds", "divisa",
        "flipkart", "walmart", "amazon", "ebay", "myntra", "nykaa", "ajio", "meesho", "snapdeal", "tatacliq", "jiomart",
        "sony", "sony liv", "sonyliv", "hotstar", "jiocinema", "netflix", "zee5", "zomato", "swiggy", "blinkit", "zepto", "bigbasket", "dunzo", "paytm", "phonepe", "razorpay",
        "zerodha", "groww", "upstox", "uber", "ola", "rapido", "urban company", "makemytrip", "goibibo", "yatra",
        "figma", "slack", "apify", "nevercode", "paddle", "sentry", "cloudflare", "datadog", 
        "circleci", "bitergia", "appveyor", "travis", "jenkins", "gitlab", "github", "browserstack", 
        "docker", "jfrog", "aws", "azure", "gcp", "digitalocean", "heroku", "vercel", "netlify", 
        "supabase", "firebase", "newrelic", "splunk", "pagerduty", "postman", "stripe", "paypal", 
        "auth0", "okta", "twilio", "sendgrid", "shopify", "atlassian", "jira", "confluence", 
        "trello", "asana", "neynar", "simplismart", 
        "intercom", "fireflies", "grimoirelab", "smartlook", "mintlify"
    ]);

    // NOTE: v10.4 removed the background Wikipedia / DuckDuckGo / Gemini / OpenAI lookups. Document text never leaves the browser.

    function isDateFormat(str) {
        if (!str) return false;
        const s = str.trim();
        // DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD  (with -, ., /)
        if (/^\d{1,4}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}$/.test(s)) return true;
        // Common written forms: Jan 1, 2024 / 1 Jan 2024 / January 1, 2024
        if (/^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}$/i.test(s)) return true;
        if (/^\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4}$/i.test(s)) return true;
        // ISO 8601: 2024-01-15 or 2024-01-15T10:30:00
        if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(s)) return true;
        // Year only: 1900-2100
        if (/^(19|20)\d{2}$/.test(s)) return true;
        // Unix timestamps: seconds (10 digits) or milliseconds (13 digits) starting with 1 (2001-2033).
        // Phone numbers (start 6-9) and 11/12-digit IDs are NOT dates.
        if (/^1\d{9}$/.test(s) || /^1\d{12}$/.test(s)) return true;
        return false;
    }

    const VALID_INDIAN_STATES = new Set([
        "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN",
        "GA", "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD",
        "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ",
        "SK", "TN", "TR", "TS", "UK", "UP", "WB",
        // Legacy codes still seen on older plates: OR (Odisha pre-2012), UA (Uttarakhand pre-2007), DN (Dadra & Nagar Haveli pre-2020)
        "OR", "UA"
    ]);

    function isVehiclePlateFormat(str) {
        if (!str) return false;
        const s = str.trim().toUpperCase();
        // Indian vehicle registration: State (2 letters) + RTO (1-2 digits) + Series (1-3 letters) + Number (4 digits)
        const m = s.match(/^([A-Z]{2})[ -]?(\d{1,2}[A-Z]?)[ -]?([A-Z]{1,3})[ -]?(\d{4})$/);
        if (m) {
            const state = m[1];
            if (!VALID_INDIAN_STATES.has(state)) return false; // Rejects fake state codes like UT, RV
            return true;
        }
        // Bharat Series (BH): e.g. "22 BH 1234 AA"
        if (/^\d{2}[ -]?BH[ -]?\d{4}[ -]?[A-Z]{1,2}$/.test(s)) return true;
        return false;
    }

    function isContactNumberFormat(str) {
        if (!str) return false;
        const s = str.trim();
        if (isDefaultOrPlaceholderPhone(s)) return false;
        if (/^\d{12}$/.test(s)) return false; // 12-digit numbers are Aadhar / Cloud Account IDs (Credentials)
        if (/^(?:\+?91[- ]?)?[6-9]\d{4}[- ]?\d{5}$/.test(s)) return true;
        if (/^[6-9]\d{9}$/.test(s)) return true;
        if (/^\+\d{1,3}[- ]?[6-9]\d{9}$/.test(s)) return true;
        if (/^0[1-9]\d{1,3}[- ]?\d{3,4}[- ]?\d{4}$/.test(s)) return true;
        return false;
    }

    // ---- (v11.4.0) Contact group of the new label set ----
    // Phone numbers are split in two labels: an Indian mobile (10 digits starting 6-9, with an optional +91 / 91 / 0 in
    // front) and every other phone number (other countries, Indian landlines, toll-free). The country code is part of the label.
    const LBL_IN_MOBILE = "Indian Mobile Number", LBL_INTL_PHONE = "International Phone Number", LBL_POSTAL = "Postal Code",
        LBL_KODEPOS = "Indonesian Postal Code", LBL_CEP = "Brazilian CEP";
    const PHONE_LABELS = new Set(["Contact Number", LBL_IN_MOBILE, LBL_INTL_PHONE]);
    // Shapes that look like a phone number but are something else: dates, IP and version numbers, SSN, CPF, EIN, ZIP+4, CEP, year ranges.
    function isNotAPhoneShape(s) {
        if (isDateFormat(s) || isIpAddressFormat(s)) return true;
        if (/^\d{1,4}(?:\.\d{1,4}){2,}$/.test(s) && !/^[2-9]\d{2}\.\d{3}\.\d{4}$/.test(s)) return true;   // 1.2.3.4 (not the US "415.555.2671")
        if (/^\d{3}-\d{2}-\d{4}$/.test(s) || /^\d{2}-\d{7}$/.test(s)) return true;          // SSN, EIN
        if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s)) return true;                            // CPF
        if (/^\d{5}-\d{3,4}$/.test(s)) return true;                                         // CEP, ZIP+4
        if (/^(?:19|20)\d{2}\s?[-\u2013]\s?(?:19|20)?\d{2}$/.test(s)) return true;          // 2019-2023
        if (/^[1-9]\d{3}[\s-]\d{4}[\s-]\d{4}(?:[\s-]\d{1,4})?$/.test(s)) return true;        // Aadhaar, card numbers
        return false;
    }
    function isIndianMobileFormat(str) {
        if (!str) return false;
        const s = str.trim();
        if (isDefaultOrPlaceholderPhone(s) || isNotAPhoneShape(s)) return false;
        const m = /^(\+\s?91|\(\+91\)|\+\(91\)|0091|91(?=[\s.-])|0)?[\s.-]?([6-9][\d\s.-]*\d)$/.exec(s);
        if (!m) return false;
        const groups = m[2].split(/[\s.-]+/);
        if (groups.length > 3 || groups.some(g => g.length < 2) || groups[0].length < 3) return false;   // "+91 80 2345 6789" is a landline
        if (groups.join("").length !== 10) return false;
        // "080-2345 6789" is a landline: a leading 0 joined to the number must be followed by at least 5 digits ("098450 12345")
        if (m[1] === "0" && /^0\d/.test(s) && (s.split(/[\s.-]+/)[0].length < 6)) return false;
        return true;
    }
    function isIntlPhoneFormat(str) {
        if (!str) return false;
        const s = str.trim();
        if (isIndianMobileFormat(s) || isNotAPhoneShape(s) || isDefaultOrPlaceholderPhone(s)) return false;
        const digits = s.replace(/\D/g, "");
        if (/^\+\s?\(?\d{1,4}\)?(?:[\s.-]?\(?\d{1,5}\)?){1,6}$/.test(s)) return digits.length >= 8 && digits.length <= 15;   // +44 20 7946 0321
        if (digits.length < 8 || digits.length > 13) return false;
        if (/^0\d{1,4}(?:[\s-]\d{2,8}){1,3}$/.test(s)) return true;                              // 080-2345 6789, 0812-3456-7890, 0120-4567890
        if (/^0\d{9,11}$/.test(s) && !/^0[6-9]\d{9}$/.test(s)) return true;                      // 02223456789
        if (/^\(0?\d{2,4}\)\s?\d{3,5}(?:[\s-]?\d{3,5})?$/.test(s)) return true;                  // (022) 2345 6789, (11) 3456-7890, (415) 732-0198
        if (/^1[89][06]0[\s-]?\d{3}[\s-]?\d{3,4}$/.test(s)) return true;                         // 1800-123-4567
        if (/^[2-9]\d{2}([.-])\d{3}\1\d{4}$/.test(s)) return true;                               // 415-732-0198
        return false;
    }
    // A postal code of any country: 560087, 94105-1234, 01310-100, SW1A 1AA, K6E 8X2, 6274SH. Needs a digit; never a word.
    function isPostalCodeShape(v) {
        const s = (v || "").trim();
        const core = s.replace(/[ -]/g, "");
        return core.length >= 3 && core.length <= 10 && /\d/.test(s) && /^[A-Z0-9]{2,8}(?:[ -][A-Z0-9]{2,5})?$/i.test(s) &&
            (core.match(/[A-Za-z]/g) || []).length <= 5;   // "EC1A 1BB" has 5 letters
    }
    // (v11.4.0) A partial address: a street (name + street word, or a street word in front as in Brazil and Indonesia),
    // optionally with a house / flat / shop number before it and the place names after it ("MG Road", "Shop 4, Linking Road,
    // Bandra West", "221B Baker Street, London", "Rua Augusta 1500, Consolacao", "Jl. Sudirman No. 12, Jakarta Selatan").
    // Street words that are often ordinary words (Drive, Way, Place, Court, Square) need a house number in front.
    const ADDR_NAME = "(?:[A-Z][A-Za-z'\u00C0-\u017F.-]*|\\d+(?:st|nd|rd|th))";
    const ADDR_PREMISE = "(?:(?:[Ff]lat|[Pp]lot|[Hh]ouse|[Dd]oor|[Ss]hop|[Uu]nit|[Oo]ffice|[Aa]pt\\.?|[Aa]partment|[Nn]o\\.?|#)\\s*(?:[Nn]o\\.?\\s*)?#?\\d+[A-Za-z]?(?:[-/]\\d+[A-Za-z]?)?|\\d+[A-Za-z]?(?:[-/]\\d+[A-Za-z]?)?)";
    const ADDR_SUFFIX_SAFE = "Road|Rd|Street|St|Lane|Ln|Avenue|Ave|Boulevard|Blvd|Marg|Nagar|Layout|Colony|Chowk|Gali|Galli|Enclave|Vihar|Puram|Peth|Highway|Hwy";
    const ADDR_SUFFIX_RISKY = "Drive|Dr|Way|Court|Ct|Place|Pl|Square|Sq|Terrace|Path|Close|Crescent";
    const ADDR_PREFIX = "(?:Rua|R\\.|Avenida|Av\\.|Travessa|Alameda|Pra[c\u00E7]a|Rodovia|Estrada|Jl\\.|Jalan|Gg\\.|Gang)";
    const ADDR_PLACES = "(?:,\\s*(?:" + ADDR_NAME + "(?:\\s+" + ADDR_NAME + "){0,3}|[1-9]\\d{2}\\s?\\d{3}|\\d{5}(?:-\\d{3,4})?)(?:\\s+[1-9]\\d{2}\\s?\\d{3})?)*";
    const PARTIAL_ADDRESS_SOURCE =
        "(?<![A-Za-z0-9])(?:" +
            "(?:" + ADDR_PREMISE + ",?\\s+)?(?:" + ADDR_NAME + "\\s+){1,4}(?:" + ADDR_SUFFIX_SAFE + ")\\b\\.?" +
            "|" + ADDR_PREMISE + ",?\\s+(?:" + ADDR_NAME + "\\s+){1,4}(?:" + ADDR_SUFFIX_RISKY + ")\\b\\.?" +
            "|" + ADDR_PREFIX + "\\s+(?:" + ADDR_NAME + "\\s*){1,4}(?:,?\\s*(?:No\\.?\\s*)?\\d+[A-Za-z]?)?" +
        ")(?!\\s+[A-Z][a-z])" + ADDR_PLACES;
    const NOT_STREET_START = /^(?:the|a|an|this|that|these|those|our|your|my|their|his|her|its|on|in|at|to|from|via|main|new|old|next|last|each|every|any|no|wall|easy|sesame|memory|fast|silk|abbey|google|test|high|one|two|first|second)$/i;
    function isPartialAddress(str) {
        const s = (str || "").trim();
        if (s.length < 5 || s.length > 200) return false;
        if (isCompleteAddress(s)) return true;
        const m = new RegExp("^" + PARTIAL_ADDRESS_SOURCE + "$").exec(s);
        if (!m) return false;
        // the first word of a street name without a house number must not be an ordinary word ("The Road", "Wall Street")
        const first = s.split(/[\s,]+/)[0];
        if (!/\d/.test(first) && !new RegExp("^" + ADDR_PREFIX + "$", "i").test(first) && !/^(?:flat|plot|house|door|shop|unit|office|apt\.?|apartment|no\.?|#)$/i.test(first) && NOT_STREET_START.test(first)) return false;
        return true;
    }
    // Which phone label a value gets, or null when it is not a phone number on its own.
    function phoneLabelFor(str) {
        if (isIndianMobileFormat(str)) return LBL_IN_MOBILE;
        if (isIntlPhoneFormat(str)) return LBL_INTL_PHONE;
        return null;
    }

    const NON_EMAIL_FILE_EXTENSIONS = /\.(?:png|jpe?g|gif|svg|webp|ico|bmp|tiff|heic|mp4|mp3|wav|mov|avi|js|ts|jsx|tsx|css|scss|html|xml|json|ya?ml|md|txt|csv|tar|gz|zip|rar|7z|exe|dmg|apk|ipa|bin|pdf|docx?|xlsx?|pptx?)$/i;

    const EMAIL_LOCAL = "[A-Za-z0-9._%+-]+(?:'[A-Za-z0-9._%+-]+)*";
    function isEmailAddressFormat(str) {
        if (!str) return false;
        const s = str.trim();
        if (isDefaultOrPlaceholderEmail(s)) return false;
        // Never match asset filenames with resolution scaling (e.g. icon-60@2x.png, image@3x.jpg)
        if (/@\d+(?:\.\d+)?x\b/i.test(s)) return false;
        // Never match filenames with media, code, or document extensions
        if (NON_EMAIL_FILE_EXTENSIONS.test(s)) return false;
        // Must match authentic email pattern with valid internet domain
        // (v11.4.3) an apostrophe inside the name part belongs to it ("sean.o'brien@...")
        if (!new RegExp("^" + EMAIL_LOCAL + "@[A-Za-z0-9][A-Za-z0-9.-]*\\.[A-Za-z]{2,}$").test(s)) return false;
        const parts = s.split("@");
        if (parts.length !== 2) return false;
        // (v11.4.3) a name part cannot start or end with a dot or hold two dots in a row ("priya.@", "priya..r@")
        if (/^\.|\.$|\.\./.test(parts[0]) || /\.\./.test(parts[1])) return false;
        const domainParts = parts[1].split(".");
        if (domainParts.length < 2) return false;
        const sld = domainParts[0].toLowerCase();
        if (/^\d+x$/.test(sld)) return false;
        return true;
    }

    function isIpAddressFormat(str) {
        if (!str) return false;
        const s = str.trim();
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(s)) return true;
        return isIpv6(s);
    }

    function isIpv6(s) {
        if (!/^[0-9A-Fa-f:]+$/.test(s) || !s.includes(":")) return false;
        if (/^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/.test(s)) return false; // MAC address
        const parts = s.split("::");
        if (parts.length > 2) return false;
        const groups = (x) => (x ? x.split(":") : []);
        const head = groups(parts[0]), tail = groups(parts[1] || "");
        const all = head.concat(tail);
        if (!all.every(g => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
        return parts.length === 2 ? all.length < 8 : all.length === 8;
    }

    function luhnValid(digits) {
        let sum = 0, dbl = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let d = digits.charCodeAt(i) - 48;
            if (dbl) { d *= 2; if (d > 9) d -= 9; }
            sum += d; dbl = !dbl;
        }
        return sum % 10 === 0;
    }

    // Grouped "4-4-4-4" numbers are accepted on format alone; ungrouped 13-19 digit numbers must pass Luhn.
    function isCardNumber(s) {
        if (/^(?:\d{4}[ -]){3}\d{4}$/.test(s)) return true;
        return /^[2-6]\d{12,18}$/.test(s) && luhnValid(s);
    }

    function isAccountNumberFormat(str) {
        if (!str) return false;
        const s = str.trim();
        // Bank Acc No (non-12 digit, non-10 digit phone)
        if (/^\d{9,18}$/.test(s) && !/^[6-9]\d{9}$/.test(s) && !/^\d{12}$/.test(s)) return true;
        return false;
    }

    function isCredentialsFormat(str) {
        if (!str) return false;
        const s = str.trim();
        // 1. Bank branch code (11 characters IFSC code: 4 letters + 0 + 6 alphanumeric)
        if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s)) return true;
        // 2. Income tax ID (10 characters PAN card: 5 letters + 4 digits + 1 letter)
        if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s)) return true;
        // 3. Secret keys, tokens, SSH/private keys, API keys, IAM credentials
        if (/^(?:sk-[a-zA-Z0-9_-]{20,}|(?:AKIA|ANPA|ASIA|AROA|AIDA|AGPA)[0-9A-Z]{16,21}|ghp_[a-zA-Z0-9]{36})$/i.test(s)) return true;
        if (/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s)) return true;
        if (/^ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(s)) return true; // JWT token
        // 5. Aadhar Card No (12-digit unique ID number, continuous or spaced)
        if (/^\d{4}\s\d{4}\s\d{4}$/.test(s) || /^\d{12}$/.test(s)) return true;
        // 6. Driving License No
        if (/^[A-Z]{2}[0-9]{2}[ -]?[0-9]{11}$/.test(s) || /^[A-Z]{2}[ -]?[0-9]{13,15}$/.test(s)) return true;
        // 7. Voter ID (Election card / EPIC number: 3 letters + 7 digits)
        if (/^[A-Z]{3}[0-9]{7}$/.test(s)) return true;
        // 8. Credit/Debit Card No (Card number, CVV and expiry date)
        if (isCardNumber(s)) return true;
        // 9. UPI ID (UPI payment address)
        if (/^[a-zA-Z0-9.\-_]{2,}@(okaxis|okhdfcbank|oksbi|okicici|paytm|upi|ybl|apl|ibl|axl|axisbank|dbs|freecharge|hsbc|icici|kotak|payzapp|postbank|sbi|yesbank)$/i.test(s)) return true;
        // 10. Transaction ID (Bank or blockchain transaction ID)
        if (/^0x[a-fA-F0-9]{16,64}$/.test(s)) return true;
        // 11. Invocation ID (Unique ID for a single run of a cloud function)
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
        if (/^[a-z0-9]{4,6}-[a-z0-9]{4,6}-[a-z0-9]{4,6}-[a-z0-9]{4,6}$/i.test(s) && /\d/.test(s)) return true;
        // 12. SHA/SSH/Hash Key (Hash values SHA-1/SHA-256 or SSH keys)
        if (/^(?:ssh-rsa\s+[A-Za-z0-9+/=]{20,}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(s)) return true;
        // 13. VPC ID (Isolated private network in the cloud)
        if (/^vpc-[a-f0-9]{8,17}$/i.test(s)) return true;
        // 14. Card ID (Internal or tokenized reference to a payment card)
        if (/^card_[a-zA-Z0-9]{16,32}$/.test(s)) return true;
        // 15. Account ID (12-digit cloud account number e.g. AWS)
        if (/^\d{12}$/.test(s)) return true;
        return false;
    }

    const __ptFinancialCache = new Map();
    function financialDocCached(docText) {
        let v = __ptFinancialCache.get(docText);
        if (v === undefined) {
            v = /(?:bill\s*amount|payable\s*amount|non[- ]?pay|charges|consultant\s*charges|surgery\s*charges|hospital\s*charges|pharmacy|total|inr|rs\.?|\u20B9|\$|\u20AC|reimbursement|medical\s*expenses|settled\s*for|amount\s*claimed)/i.test(docText);
            if (__ptFinancialCache.size > 8) __ptFinancialCache.clear();
            __ptFinancialCache.set(docText, v);
        }
        return v;
    }
    function isFinancialOrBillingContext(val, docText) {
        if (!docText || !val) return false;
        const hasFinancialDoc = financialDocCached(docText);
        if (!hasFinancialDoc) return false;
        docText = narrowText(val, docText);
        const esc = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rowRegex = new RegExp('(?:\\|[^\\n\\r|]*' + esc + '[^\\n\\r|]*\\||(?:rs\\.?|inr|\u20B9|\\$|\u20AC)\\s*' + esc + '|' + esc + '\\s*(?:inr|rs|rupees|towards|settled|claimed|charges))', 'i');
        return rowRegex.test(docText);
    }

    function isCompleteAddress(str) {
        if (!str) return false;
        const s = str.trim();
        if (s.length < 15) return false;
        const words = s.split(/[\s,]+/);
        if (words.length < 3) return false;
        const hasStreet = /\b(?:road|rd\b|street|st\b|lane|ln\b|avenue|ave\b|crescent|cres\b|drive|dr\b|nagar|layout|colony|sector|block|cross|main|marg|chowk|rasta)\b/i.test(s);
        const hasPremise = /(?:^|\b)(?:#?\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?|plot(?:\s*no\.?)?\s*\d+|flat(?:\s*no\.?)?\s*\d+|door(?:\s*no\.?)?\s*\d+|house(?:\s*no\.?)?\s*\d+|bldg|building|tower|floor|apt|apartment)\b/i.test(s);
        const hasPincode = /\b[1-9][0-9]{5}\b/.test(s);
        const hasCity = /\b(?:pune|bengaluru|bangalore|mumbai|delhi|new\s*delhi|hyderabad|chennai|kolkata|ahmedabad|surat|jaipur|lucknow|kanpur|nagpur|indore|thane|bhopal|visakhapatnam|patna|vadodara|ghaziabad|ludhiana|agra|nashik|faridabad|meerut|rajkot|varanasi|srinagar|aurangabad|dhanbad|amritsar|navi\s*mumbai|allahabad|howrah|gwalior|jabalpur|coimbatore|vijayawada|jodhpur|madurai|raipur|kota|chandigarh|guwahati|solapur|mysuru|mysore|tiruchirappalli|bareilly|aligarh|tiruppur|gurgaon|gurugram|moradabad|jalandhar|bhubaneswar|salem|warangal|jalgaon|noida)\b/i.test(s);
        if (hasStreet && hasPremise && (hasCity || hasPincode)) return true;
        if (hasPremise && hasCity && hasPincode) return true;
        return false;
    }

    function isAddress(chg, orig) {
        return isCompleteAddress(chg) || isCompleteAddress(orig);
    }

    // Phrases that introduce an employer. Defined once and shared, so the two users cannot drift apart.
    // Bare "join", "left" and "leaving" were removed: they matched "join Monday's call", "left Bengaluru", "the left panel".
    const WORK_CONTEXT_SOURCE = [
        'working\\s+(?:at|for)', 'work\\s+(?:at|for)', 'worked\\s+(?:at|for)', 'employed\\s+(?:at|by)', 'employment\\s+(?:at|with)',
        'job\\s+at', 'career\\s+at', 'role\\s+at', 'position\\s+at', 'joining', 'joined', 'resigning\\s+from', 'resigned\\s+from',
        'resign\\s+from', 'hired\\s+by', 'internship\\s+at', 'intern\\s+at', 'opportunity\\s+at', 'contract\\s+(?:with|at)',
        'consultant\\s+(?:at|for)', 'experience\\s+(?:working\\s+(?:at|for)|at|with)'
    ].join('|');
    const NOT_EMPLOYER_WORDS = /^(?:the|a|an|us|our|you|your|them|him|her|me|on|in|at|to|by|for|with|from|this|that|today|tomorrow|tonight|now|soon|later|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|team|call|meeting|office|company|work)$/i;
    function isPlausibleEmployerToken(tok) {
        const t = (tok || "").replace(/['\u2019]s$/i, "");
        return t.length >= 2 && /^[A-Z0-9]/.test(t) && !NOT_EMPLOYER_WORDS.test(t);
    }

    function isBusinessName(chg, orig, context) {
        if ((chg && chg.length > MAX_TOKEN_LEN) || (orig && orig.length > MAX_TOKEN_LEN)) return false;
        if (!context || context.length < NARROW_MIN_LENGTH) return shortMemo('B\u0001' + (chg || '') + '\u0001' + (orig || '') + '\u0001' + (context || ''), () => isBusinessName_impl(chg, orig, context));
        const c0 = (chg || '').trim(), o0 = (orig || '').trim();
        return memoText(context, 'biz2', c0 + '\u0002' + o0, () => {
            const parts = [];
            if (c0) parts.push(narrowText(c0, context));
            if (o0 && o0 !== c0) parts.push(narrowText(o0, context));
            return isBusinessName_impl(chg, orig, parts.join('\n...\n'));
        });
    }
    function isBusinessName_impl(chg, orig, context) {
        const c = (chg || "").trim();
        const o = (orig || "").trim();
        const ctx = (context || "").trim();

        // Copyright context: # Copyright (C) 2015-2019 Bitergia / Jadexlum
        // User rule: "and business name is oversrubed crtly it should not be labelled"
        if (/(?:copyright|\(c\)|copr\.)\s*(?:\d{4}[\s\-]*(?:\d{4})?)?\s*(?:by\s+)?/i.test(ctx)) return true;

        // 0. If it contains any non-entity / accounting / infra terms, it is NEVER a business name!
        if (hasNonEntityWord(c) || hasNonEntityWord(o)) {
            return false;
        }

        // 0a. Form / table field labels are NEVER a business name!
        if (isFieldLabelOrHeader(c) || isFieldLabelOrHeader(o)) {
            return false;
        }

        // 0b. Bank names or banking entities are NEVER a business name!
        // User rule: "bank name i sno an business name"
        if (/\bbank(?:ing)?\b/i.test(c) || /\bbank(?:ing)?\b/i.test(o)) {
            return false;
        }

        // 0c. Software components, microservices, or server tools (e.g. nginx-redis-router, redis, nginx, postgres) are NEVER a business name!
        if (isSoftwareComponent(c) || isSoftwareComponent(o)) {
            return false;
        }

        // 0d. Standalone corporate suffixes or generic words are NEVER a business name by themselves!
        if (/^(?:group|groups|company|companies|inc\.?|corp\.?|corporation|ltd\.?|limited|llc|llp|plc|technologies|solutions|analytics|partners)$/i.test(c)) {
            return false;
        }

        // 1. Infrastructure terms, server pools, or hardware specs are NEVER a business name!
        if (isInfraOrServerTerm(c) || isInfraOrServerTerm(o)) {
            return false;
        }

        // 2. Direct match to known corporate entities, OEMs & platforms
        if (KNOWN_BUSINESS_NAMES.has(c.toLowerCase()) || KNOWN_BUSINESS_NAMES.has(o.toLowerCase())) {
            return true;
        }

        // 2a. Known third-party business SaaS platforms, e-commerce, cloud, and dev platforms
        if (/\b(?:figma|slack|apify|nevercode|scraper\s*api|paddle(?:\.net)?|sentry(?:\.io)?|cloudflare|datadog|circleci|bitergia|appveyor|travis(?:\s*ci)?|jenkins|teamcity|bamboo|semaphore|buildkite|drone(?:\s*ci)?|codecov|coveralls|sonarqube|codacy|bitbucket|gitlab|github|gitpod|sourcegraph|browserstack|saucelabs|docker(?:\s*hub)?|artifactory|jfrog|aws|amazon\s*web\s*services|azure|gcp|google\s*cloud|digitalocean|linode|heroku|render|fly\.io|railway|vercel|netlify|supabase|firebase|newrelic|dynatrace|splunk|sumologic|pagerduty|logdna|launchdarkly|postman|swagger|insomnia|stripe|braintree|paypal|auth0|okta|twilio|sendgrid|mailgun|segment|mixpanel|amplitude|algolia|shopify|atlassian|jira|confluence|trello|asana|notion|linear|grimoirelab|elastic(?:search)?|kibana|grafana|prometheus|hashicorp|terraform|ansible|snyk|envato|helius|smartlook|twitter|mintlify|messagebird|neynar|intercom|fireflies(?:\.ai)?|backfill|meta|facebook|instagram|google|apple|microsoft|amazon|netflix|spotify|flipkart|walmart|ebay|myntra|nykaa|ajio|meesho|snapdeal|zomato|swiggy|blinkit|zepto|bigbasket|uber|ola|paytm|phonepe|cred|razorpay)\b/i.test(o) ||
            /\b(?:figma|slack|apify|nevercode|scraper\s*api|paddle(?:\.net)?|sentry(?:\.io)?|cloudflare|datadog|circleci|bitergia|appveyor|travis(?:\s*ci)?|jenkins|teamcity|bamboo|semaphore|buildkite|drone(?:\s*ci)?|codecov|coveralls|sonarqube|codacy|bitbucket|gitlab|github|gitpod|sourcegraph|browserstack|saucelabs|docker(?:\s*hub)?|artifactory|jfrog|aws|amazon\s*web\s*services|azure|gcp|google\s*cloud|digitalocean|linode|heroku|render|fly\.io|railway|vercel|netlify|supabase|firebase|newrelic|dynatrace|splunk|sumologic|pagerduty|logdna|launchdarkly|postman|swagger|insomnia|stripe|braintree|paypal|auth0|okta|twilio|sendgrid|mailgun|segment|mixpanel|amplitude|algolia|shopify|atlassian|jira|confluence|trello|asana|notion|linear|grimoirelab|elastic(?:search)?|kibana|grafana|prometheus|hashicorp|terraform|ansible|snyk|envato|helius|smartlook|twitter|mintlify|messagebird|neynar|intercom|fireflies(?:\.ai)?|backfill|meta|facebook|instagram|google|apple|microsoft|amazon|netflix|spotify|flipkart|walmart|ebay|myntra|nykaa|ajio|meesho|snapdeal|zomato|swiggy|blinkit|zepto|bigbasket|uber|ola|paytm|phonepe|cred|razorpay)\b/i.test(c)) {
            return true;
        }

        // 2b. Known automotive platforms, research portals, insurance, brands & vehicle make
        // User rule: "91wheels is business name"
        if (/\b(?:91\s*wheels|91wheels|acko|casorazeph|orbanceast|carwale|cardekho|bikewale|zigwheels|spinny|cars24|droom|autocar|overdrive|gaadiwadi|motorbeam|carrypro|moxie|moxie\s+beauty|new\s+shop|eume|twin\s*birds|divisa|vansun|solvanta|simplismart|tata|mahindra|ssangyong|hyundai|kia|maruti|suzuki|toyota|honda|ford|chevrolet|nissan|renault|volkswagen|skoda|bmw|audi|mercedes|volvo|jeep|mg|fiat|peugeot|citroen|porsche|tesla|jaguar|land\s*rover|byd|subaru|mazda|mitsubishi|isuzu|bajaj|tvs|hero|yamaha|royal\s*enfield|ktm|ducati|harley|triumph|kawasaki|kubota|jcb|eicher|sonalika|swaraj|escorts)\b/i.test(o) ||
            /\b(?:91\s*wheels|91wheels|acko|casorazeph|orbanceast|carwale|cardekho|bikewale|zigwheels|spinny|cars24|droom|autocar|overdrive|gaadiwadi|motorbeam|carrypro|moxie|moxie\s+beauty|new\s+shop|eume|twin\s*birds|divisa|vansun|solvanta|simplismart|tata|mahindra|ssangyong|hyundai|kia|maruti|suzuki|toyota|honda|ford|chevrolet|nissan|renault|volkswagen|skoda|bmw|audi|mercedes|volvo|jeep|mg|fiat|peugeot|citroen|porsche|tesla|jaguar|land\s*rover|byd|subaru|mazda|mitsubishi|isuzu|bajaj|tvs|hero|yamaha|royal\s*enfield|ktm|ducati|harley|triumph|kawasaki|kubota|jcb|eicher|sonalika|swaraj|escorts)\b/i.test(c)) {
            return true;
        }
        // Compound campaign tokens containing known business names (e.g. 91wheelsNexon, orbanceastNexon)
        if (/^(?:91wheels|orbanceast|acko|carwale|cardekho|zigwheels)[a-zA-Z0-9_\-]*$/i.test(o) ||
            /^(?:91wheels|orbanceast|acko|carwale|cardekho|zigwheels)[a-zA-Z0-9_\-]*$/i.test(c)) {
            return true;
        }
        if (/<(?:make|brand|company|vendor|manufacturer)[^>]*>/i.test(ctx)) {
            return true;
        }

        // 2c. Known business domain names (e.g. BLKBOX.ai, hexo.io) or preceded by "developer at / work at"
        if (/\b(?:at|for|with|by|from)\s+([A-Z0-9_\-]+\.(?:ai|io|co|com|org|net|app|dev))\b/i.test(ctx)) return true;
        if (/^[A-Z0-9_\-]{2,}\.(?:ai|io|co|com|org|net|app|dev)$/i.test(o) && !/^(?:docs|api|www|cdn|static|github|gitlab)\./i.test(o)) return true;
        if (/^[A-Z0-9_\-]{2,}\.(?:ai|io|co|com|org|net|app|dev)$/i.test(c) && !/^(?:docs|api|www|cdn|static|github|gitlab)\./i.test(c)) return true;

        // 2d. Contextual references to third-party tools, platforms, or documentation
        // e.g. "See Appveyor's documentation", "from the Appveyor 'artifacts' tab", "powered by Sentry"
        if (/(?:see|check|visit|read|follow)\s+([A-Z][a-zA-Z0-9_\-]+)(?:'s)?\s+(?:docs?|documentation|website|dashboard|console|portal|platform|api|artifacts|tab|setup|service|cloud)\b/i.test(ctx)) {
            const m = ctx.match(/(?:see|check|visit|read|follow)\s+([A-Z][a-zA-Z0-9_\-]+)(?:'s)?\s+(?:docs?|documentation|website|dashboard|console|portal|platform|api|artifacts|tab|setup|service|cloud)\b/i);
            if (m && (m[1].toLowerCase() === c.toLowerCase() || m[1].toLowerCase() === o.toLowerCase())) return true;
        }
        if (/(?:from|in|on)\s+(?:the\s+)?([A-Z][a-zA-Z0-9_\-]+)\s+["']?(?:artifacts|build|dashboard|overview|settings|console)["']?\s+tab\b/i.test(ctx)) {
            const m = ctx.match(/(?:from|in|on)\s+(?:the\s+)?([A-Z][a-zA-Z0-9_\-]+)\s+["']?(?:artifacts|build|dashboard|overview|settings|console)["']?\s+tab\b/i);
            if (m && (m[1].toLowerCase() === c.toLowerCase() || m[1].toLowerCase() === o.toLowerCase())) return true;
        }
        if (/(?:powered\s+by|hosted\s+on|deployed\s+(?:to|on)|integrate\s+with|built\s+with)\s+([A-Z][a-zA-Z0-9_\-]+)\b/i.test(ctx)) {
            const m = ctx.match(/(?:powered\s+by|hosted\s+on|deployed\s+(?:to|on)|integrate\s+with|built\s+with)\s+([A-Z][a-zA-Z0-9_\-]+)\b/i);
            if (m && (m[1].toLowerCase() === c.toLowerCase() || m[1].toLowerCase() === o.toLowerCase())) return true;
        }

        // 3. Has explicit corporate entity suffix in original or changed (excluding banks per user rule)
        const corpSuffix = /\b(?:pvt\.?|ltd\.?|limited|inc\.?|corp\.?|corporation|llc|llp|plc|technologies|solutions|hospital|insurance|motors|logistics|group|company|analytics|partners|studios|systems|consulting)\b/i;
        // The suffix must follow a name ("Acme Analytics"); a lone generic word like "Analytics" or "Solutions" is not a company.
        const suffixOnly = /^(?:(?:pvt\.?|ltd\.?|limited|inc\.?|corp\.?|corporation|llc|llp|plc|technologies|solutions|hospital|insurance|motors|logistics|group|company|analytics|partners|studios|systems|consulting)[\s,.]*)+$/i;
        if (corpSuffix.test(o) && !suffixOnly.test(o)) return true;
        if (corpSuffix.test(c) && !suffixOnly.test(c) && !/^(?:out|and|the|for|with|from|item|case|use)$/i.test(o)) return true;

        // 3b. Has corporate entity suffix directly adjacent to token in context (e.g. "| NEYNAR, INC |", "| Twitter Dev Platform |")
        const nearCorpSuffix = new RegExp('(?:^|[^a-zA-Z0-9])' + (c || o).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:[A-Za-z0-9_\\-]+\\s+){0,2}(?:inc\\.?|corp\\.?|corporation|ltd\\.?|limited|llc|llp|plc|pvt\\.?|technologies|solutions)\\b', 'i');
        if (nearCorpSuffix.test(ctx)) {
            return true;
        }

        // 4. Explicit key-value form field strictly for company/employer (e.g. "Employer: XYZ", "Company Name: ABC")
        if (/(?:company\s*name|employer|vendor\s*name)\s*[:=-]/i.test(ctx)) {
            if (!/^(?:none|na|n\/a|placeholder|insert|select|unknown)$/i.test(o) && o.length > 2) {
                return true;
            }
        }

        // 4b. Employment / workplace context: "working at Acmeworks", "working at Zorvex", "experience at Acmeworks"
        const workContextRegex = new RegExp('\\b(?:' + WORK_CONTEXT_SOURCE + ')\\s+["\'*]*([A-Za-z0-9_\\-&]+)\\b', 'i');
        const workM = ctx.match(workContextRegex);
        if (workM && isPlausibleEmployerToken(workM[1])) {
            const wToken = workM[1].toLowerCase();
            if (wToken === c.toLowerCase() || wToken === o.toLowerCase()) {
                return true;
            }
        }

        return false;
    }

    const HUMAN_NAME_PATTERN = /^(?:[\p{Lu}][\p{L}']*\.?\s+){1,5}[\p{Lu}][\p{L}']*\.?$/u;
    // ALL-CAPS headings ("HBAR BUILDER GRANT") also fit the capitalised-words pattern, so for all-caps text
    // require at least one known given name before treating it as a person's name.
    function looksLikeHumanName(s) {
        const t = (s || "").trim();
        if (!HUMAN_NAME_PATTERN.test(t)) return false;
        if (t !== t.toUpperCase()) return true;
        return t.toLowerCase().split(/\s+/).some(w => KNOWN_GIVEN_NAMES.has(w.replace(/\.$/, "")));
    }

    function isPasswordOrCredentialContext(str) {
        if (!str) return false;
        return /\b(?:password|passwd|pwd|secret|private[_-]?key|auth[_-]?token|access[_-]?token|api[_-]?token|api[_-]?key|passcode|pin)\b/i.test(str);
    }

    function isTokenInPasswordContext(token, text) {
        return memoText(text, 'pwd', token, () => isTokenInPasswordContext_impl(token, text));
    }
    function isTokenInPasswordContext_impl(token, text) {
        if (!token || !text) return false;
        text = narrowText(token, text);
        const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const kvRegex = new RegExp('(?:^|\\r|\\n)[^\\r\\n]*\\b(?:password|passwd|pwd|secret|private[_-]?key|auth[_-]?token|access[_-]?token|api[_-]?token|api[_-]?key|passcode|pin)\\b[^\\r\\n]*[:=][^\\r\\n]*' + esc, 'i');
        if (kvRegex.test(text)) return true;
        const xmlRegex = new RegExp('<[^>]*?(?:password|passwd|pwd|secret|token)[^>]*>[^<]*' + esc, 'i');
        if (xmlRegex.test(text)) return true;
        return false;
    }

    function classifyDiff(original, changed, context) {
        if ((original && original.length > MAX_TOKEN_LEN * 4) || (changed && changed.length > MAX_TOKEN_LEN * 4)) return null;
        if (/\S{300,}/.test(original || "") || /\S{300,}/.test(changed || "")) return null;
        const orig = (original || "").trim(), chg = (changed || "").trim(), ctx = (context || "").trim();

        // 0. A structural KEY that was renamed (e.g. "API_KEY = ..." -> "BRYENA_STELWICK = ...") is overscrubbed.
        //    Checked before the credential-line guard below, which exists to protect secret VALUES, not keys.
        if (orig && chg && orig !== chg && /^[A-Za-z_][A-Za-z0-9_.-]{1,63}$/.test(orig) && /^[A-Za-z_][A-Za-z0-9_.-]{1,63}$/.test(chg)) {
            const escO = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp('(?:^|[\\s{,\\[])["\']?' + escO + '["\']?\\s*[:=]').test(ctx) && !looksLikeHumanName(chg)) {
                return { label: "Overscrubbed", cls: "pt-overscrub" };
            }
        }

        // 0A. Password / Secret / Credential handling in diffs:
        // User rule: "here password is oversrub then it should not be labbeled"
        if (isPasswordOrCredentialContext(ctx) || 
            isPasswordOrCredentialContext(orig) || 
            isPasswordOrCredentialContext(chg)) {
            return null;
        }

        // 0. Default/placeholder links, emails, phone numbers & Vector/Path data
        // User rule: "like this default phone number r mail r link no need to be labelled and path can be changed r no need to be labeled"
        if (isDefaultOrPlaceholderLink(chg) || isDefaultOrPlaceholderLink(orig)) return null;
        if (isDefaultOrPlaceholderEmail(chg) || isDefaultOrPlaceholderEmail(orig)) return null;
        if (isDefaultOrPlaceholderPhone(chg) || isDefaultOrPlaceholderPhone(orig)) return null;
        if (isVectorOrPathData(chg, ctx) || isVectorOrPathData(orig, ctx)) return null;

        // Secret key / API key / Credential high-entropy string check:
        // Rule: "if pi bi is srubbed then it should not be labelled anything"
        if (/^[a-zA-Z0-9_\-]{24,128}$/.test(orig) && /[a-z]/.test(orig) && /[A-Z]/.test(orig) && /\d/.test(orig)) return null;
        if (/^[a-zA-Z0-9_\-]{24,128}$/.test(chg) && /[a-z]/.test(chg) && /[A-Z]/.test(chg) && /\d/.test(chg)) return null;
        if (/[!@#$%^&*()_+=\[\]{}|]/.test(orig) && orig.length >= 16) return null;
        if (/[!@#$%^&*()_+=\[\]{}|]/.test(chg) && chg.length >= 16) return null;
        if (/(?:api_?key|secret_?key|password|passwd|pwd|token)\s*[:=]/i.test(ctx)) return null;

        // 1. Contact Number, Account Number, Credentials, IP Address, Email Address:
        // Rule: "mail should same as left then label it if not no"
        // If changed or scrubbed, return null (never label as Email Address and never as Overscrubbed)
        if (isContactNumberFormat(chg) || isContactNumberFormat(orig) || phoneLabelFor(chg) || phoneLabelFor(orig) ||
            isIpAddressFormat(chg) || isIpAddressFormat(orig) ||
            isAccountNumberFormat(chg) || isAccountNumberFormat(orig) ||
            isCredentialsFormat(chg) || isCredentialsFormat(orig) ||
            isEmailAddressFormat(chg) || isEmailAddressFormat(orig)) {
            return null;
        }

        // 5. URL/Link handling in diffs:
        // User rule: "if this is present in url r link it should not be labelled at at utill the complete url r lunk is same from both side"
        if (isWebUrl(chg) || isWebUrl(orig)) return null;

        // 6. Vehicle Number Plate
        // Rule: "vechile number plate only should follow format it have real world number plates only marked"
        // In classifyDiff (runs on diffs where left != right), changed plates are scrubbed -> return null
        if (isVehiclePlateFormat(chg) || isVehiclePlateFormat(orig)) return null;

        // 8. Date (STRICTLY ONLY Date of Birth / DOB. No other dates should ever be marked!)
        const isDob = /(?:dob|d\.o\.b|date\s+of\s+birth|birth\s*date|birthdate|born\s+on)\b/i.test(ctx) ||
                      /(?:dob|date\s+of\s+birth|birth\s*date|birthdate)\b/i.test(orig) ||
                      /(?:dob|date\s+of\s+birth|birth\s*date|birthdate)\b/i.test(chg);
        // classifyDiff only sees CHANGED text. A changed DOB was correctly scrubbed, so it is never labeled.
        // Identical DOBs are labeled by the dedicated DOB scan in extractDynamicTargets.
        if (isDob && (isDateFormat(chg) || isDateFormat(orig))) {
            return null;
        }
        // If changed text is an actual date/month or both sides are dates, do not label as Overscrubbed
        if ((isDateFormat(orig) && isDateFormat(chg)) || isDateFormat(chg) ||
            /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i.test(chg) ||
            /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(chg)) {
            return null;
        }

        // 9. Person Username
        // User rule: "this r not person username the value of node id r just id this things if it changed to other form r not changed also no issue no need to label it anything"
        // Only explicit @handles (e.g. @username) are Person Username, and strictly only if identical in both files.
        // A changed @handle was correctly scrubbed -> no label. Identical handles are labeled by the @handle scan.
        if (/^@[a-zA-Z0-9_.-]{2,}$/.test(chg) || /^@[a-zA-Z0-9_.-]{2,}$/.test(orig)) return null;

        // 9B. Node IDs, Numeric IDs, and Login/User identifiers
        // Rule: "this r not person username the value of node id r just id this things if it changed to other form r not changed also no issue no need to label it anything"
        // Only when THIS value sits behind an id / login key ("login": "cassian-01"). The old test skipped every diff
        // on any line that merely contained an "id" key, so JSON records with an id never got Overscrubbed checks.
        {
            const escK = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const idKeyBefore = (v) => v && new RegExp('(?:node_id|["\']id["\']|\\blogin|gravatar_id|user_id|avatar_url)["\']?\\s*[:=]\\s*["\']?' + escK(v), 'i').test(ctx);
            if (idKeyBefore(orig) || idKeyBefore(chg)) return null;
        }
        if (/^(?:MD[A-Za-z0-9]{8,}|SFX_[A-Za-z0-9]{8,}|[A-Za-z0-9+/]{20,}={1,2})$/.test(chg) || /^(?:MD[A-Za-z0-9]{8,}|SFX_[A-Za-z0-9]{8,}|[A-Za-z0-9+/]{20,}={1,2})$/.test(orig)) return null;
        if (/^\d{5,12}$/.test(chg) || /^\d{5,12}$/.test(orig)) return null;

        // 10. Address - only label if SAME in both left and right (handled via unscrubbed scan)
        // Rule: "for address there should be complete address eg 12, MG Road, Pune 411001 and both left and right should be then only it should be labeled as adress otherwise no need to mark"
        // Since classifyDiff runs on CHANGED tokens, changed address is scrubbed -> return null
        if (isAddress(chg, orig) || isCompleteAddress(chg) || isCompleteAddress(orig)) return null;

        // 11. Business Name - only label if SAME in both left and right (handled via addTarget guard)
        // Since classifyDiff is called on CHANGED tokens, Business Name here means it was scrubbed -> null
        // (Business Name is only added via direct table scan when lCell === rCell)
        if (isBusinessName(chg, orig, ctx)) return null;

        // 12. Person Name - only label if SAME in both left and right.
        // If either side matches a real human name pattern OR the context is a name field, return null (not even Overscrubbed)
        // Rule: "if its oversrubed then no need to label anything"
        // Also covers single names and PascalCase/camelCase combined names like "OrlaKestrelbrook", "WanjiruMossford", "srinadh"
        if (isFieldLabelOrHeader(chg) && !isFieldLabelOrHeader(orig)) return null;

        // Ordinary original text replaced by anything else is Overscrubbed (unless it sits in a name field).
        // (v11.2.0) in a name field, an ordinary word that can never be a name ("Support", "Manager") is still ordinary
        const ordinaryInNameField = isTokenInNameField(orig, ctx) && !String(orig).split(/\s+/).some(couldBeName);
        if (isOrdinaryPhrase(orig) && (!isTokenInNameField(orig, ctx) || ordinaryInNameField) && !addedWordsAreGeneric(orig, chg) &&
            !isVectorOrPathData(chg, ctx) && !isDefaultOrPlaceholderLink(chg) && !orig.includes("|") && !chg.includes("|") &&
            !isBusinessName(orig, orig, ctx) && !isFieldLabelOrHeader(chg)) {
            return { label: "Overscrubbed", cls: "pt-overscrub" };
        }

        const isOrigPerson = isPersonName(orig, ctx) || looksLikeHumanName(orig) || /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(orig);
        const isChgPerson = isPersonName(chg, ctx) || looksLikeHumanName(chg);
        const isJsonName = /["']name["']\s*:/i.test(ctx);
        const looksLikePersonName = isChgPerson || isOrigPerson;
        const isNameField = /(?:(?:full|employee|candidate|patient|applicant|customer|lead|client)\s*name)\b|(?:@|\b)(?:author|committer|maintainer|applicant|assignee|owner|signed-off-by)\s*[:=]/i.test(ctx) ||
                            /(?:i['\u2019]?m|i\s+am|my\s+name\s+is|hi[!,\\s]+i['\u2019]?m)\s+/i.test(ctx) ||
                            (isJsonName && looksLikePersonName);
        if (isOrigPerson || isChgPerson || isNameField) return null;
        if ((isTokenInNameField(orig, ctx) || isTokenInNameField(chg, ctx)) && !(isOrdinaryPhrase(orig) && !String(orig).split(/\s+/).some(couldBeName))) return null;

        // 13. OVERSCRUBBED (When non-PII text was unnecessarily redacted)
        // First: reject if either side is a common non-entity/job/document word
        if (addedWordsAreGeneric(orig, chg)) return null;
        if (!isVectorOrPathData(chg, ctx) && !isDefaultOrPlaceholderLink(chg) && !orig.includes("|") && !chg.includes("|")) {
            const isOrigBiz = isBusinessName(orig, orig, ctx) || isTokenInBusinessContext(orig, ctx);
            const isChgBiz = isBusinessName(chg, chg, ctx) || isTokenInBusinessContext(chg, ctx);
            const isOrigP = isPersonName(orig, ctx) || isTokenInNameContext(orig, ctx);
            const isChgP = isPersonName(chg, ctx) || isTokenInNameContext(chg, ctx);
            if (!isOrigBiz && !isChgBiz && !isOrigP && !isChgP && !looksLikeProperNounPhrase(orig)) {
                return { label: "Overscrubbed", cls: "pt-overscrub" };
            }
        }

        return null;
    }

    function isChangedPiiOrBii(cleanText, leftText, rightText) {
        if (!cleanText || cleanText.length < 2) return false;

        // 1. Person Name format
        // Multi-word phrase where every word is capitalized e.g. "Kalenira Urnanrin C", "Pelelrin Valesa"
        if (/^(?:[\p{Lu}][\p{L}']*\.?\s+){1,5}[\p{Lu}][\p{L}']*\.?$/u.test(cleanText)) return true;
        if (isPersonName(cleanText, "")) return true;
        if (isTokenInNameContext(cleanText, rightText) || isTokenInNameContext(cleanText, leftText)) return true;

        // 2. Business Name / Corporate Entity format
        if (isBusinessName(cleanText, "", "") || isBusinessName("", cleanText, "")) return true;
        if (isTokenInCopyrightLine(cleanText, rightText) || isTokenInCopyrightLine(cleanText, leftText)) return true;
        if (isTokenInTableVendor(cleanText, rightText) || isTokenInTableVendor(cleanText, leftText)) return true;
        if (isTokenInBusinessContext(cleanText, rightText) || isTokenInBusinessContext(cleanText, leftText)) return true;
        if (/(?:technologies|solutions|corp|inc|ltd|plc|group|studios|consulting|systems|dev\s*platform|industries|holdings|enterprises|pvt|llc|gmbh)\b/i.test(cleanText)) return true;

        // 3. Contact Number / Phone Number format
        if (isContactNumberFormat(cleanText)) return true;
        if (/^\+?\d{1,3}[-.\s]?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}$/.test(cleanText)) return true;
        if (/^\d{7,14}$/.test(cleanText.replace(/\D/g, '')) && /[-.\s()]/.test(cleanText)) return true;

        // 4. Email Address format
        // User rule: "in mail it is crtly srubbed then it should not be marked"
        if (isEmailAddressFormat(cleanText)) return true;
        if (cleanText.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText)) return true;
        if (isInsideAnyEmail(cleanText, rightText)) return true;

        // 5. Date format
        if (isDateFormat(cleanText)) return true;
        if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,4}\b/i.test(cleanText)) return true;
        if (/\b\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}\b/.test(cleanText)) return true;

        // 6. Account Number / Credentials format
        if (isAccountNumberFormat(cleanText) || isCredentialsFormat(cleanText)) return true;
        // Password / Secret / Auth Token / Credential context:
        // User rule: "here password is oversrub then it should not be labbeled"
        if (isTokenInPasswordContext(cleanText, rightText) || isTokenInPasswordContext(cleanText, leftText)) return true;
        if (isPasswordOrCredentialContext(cleanText)) return true;
        if (/^[a-zA-Z0-9_\-]{24,128}$/.test(cleanText) && /[a-z]/.test(cleanText) && /[A-Z]/.test(cleanText) && /\d/.test(cleanText)) return true;
        if (/[!@#$%^&*()_+=\[\]{}|]/.test(cleanText) && cleanText.length >= 16) return true;

        // 7. IP Address format
        if (isIpAddressFormat(cleanText)) return true;

        // 8. Vehicle Plate format
        if (isVehiclePlateFormat(cleanText) || /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}$/i.test(cleanText)) return true;

        // 9. Address format
        if (isAddress(cleanText, "") || isCompleteAddress(cleanText)) return true;

        // 10. URL / Link / Host format
        if (isInsideChangedUrl(cleanText, leftText, rightText)) return true;

        return false;
    }

    function isTokenInCopyrightLine(token, text) {
        return memoText(text, 'copy', token, () => isTokenInCopyrightLine_impl(token, text));
    }
    function isTokenInCopyrightLine_impl(token, text) {
        if (!token || !text) return false;
        text = narrowText(token, text);
        const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(?:copyright|\\(c\\)|copr\\.)[^\\r\\n]*\\b' + esc + '\\b', 'i');
        return regex.test(text);
    }

    function isTokenInTableVendor(token, text) {
        return memoText(text, 'vendor', token, () => isTokenInTableVendor_impl(token, text));
    }
    function isTokenInTableVendor_impl(token, text) {
        if (!token || !text) return false;
        text = narrowText(token, text);
        const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('^\\s*\\|\\s*[^|]*\\b' + esc + '\\b[^|]*\\|\\s*\\d+(?:\\.\\d+)?\\s*\\|', 'im');
        return regex.test(text);
    }

    // Words of multi-word known brands ("sony liv", "urban company") that appear in the document. Computed once per text.
    function multiWordBrandWordsIn(docText) {
        const build = () => {
            const s = new Set();
            const low = lowerOf(docText);
            for (const bName of KNOWN_BUSINESS_NAMES) {
                if (bName.includes(" ") && low.includes(bName)) for (const t of bName.split(/\s+/)) s.add(t);
            }
            return s;
        };
        if (!docText || docText.length < NARROW_MIN_LENGTH) return build();
        const ix = textIndex(docText);
        if (!ix.brandWords) ix.brandWords = build();
        return ix.brandWords;
    }
    function isTokenInBusinessContext(token, docText) {
        return memoText(docText, 'biz', token, () => isTokenInBusinessContext_impl(token, docText));
    }
    function isTokenInBusinessContext_impl(token, docText) {
        if (!token || !docText || token.length < 2) return false;
        const clean = cleanWord(token);
        if (clean.length < 2) return false;
        if (hasNonEntityWord(clean) || isFieldLabelOrHeader(clean)) return false;

        const lowerTok = clean.toLowerCase();
        if (KNOWN_BUSINESS_NAMES.has(lowerTok)) return true;
        if (multiWordBrandWordsIn(docText).has(lowerTok)) return true;

        const fullDoc = docText;
        docText = narrowText(clean, docText);
        const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 1. Token directly followed by corporate entity suffix (within 0-2 words)
        // e.g. "Olivier Technologies Pvt Ltd", "Olivier Solutions", "Olivier Inc", "Moxie Beauty"
        const suffixPattern = new RegExp('(?:^|[^a-zA-Z0-9])' + esc + '\\s+(?:[A-Za-z0-9_\\-]+\\s+){0,2}(?:technologies|solutions|corp|corporation|inc|incorporated|ltd|limited|plc|llc|llp|pvt|group|studios|consulting|systems|dev\\s*platform|industries|holdings|enterprises|hospital|motors|insurance|logistics|beauty|shop|store|apparel|clothing|sarees|fashion)\\b', 'i');
        if (suffixPattern.test(docText)) return true;
        // 1b. Store / shop / brand references: e.g. "from New Shop", "Shopify store", "New Shop"
        if (/\b(?:from|to|in|at)\s+(?:new\s+)?(?:shop|store)\b/i.test(docText)) {
            if (/^(?:shop|store)$/i.test(clean)) return true;
        }
        // 2. Token directly preceded by corporate entity keyword
        // e.g. "Company: Olivier", "Vendor: Olivier", "Employer: Olivier", "OEM: Kubota"
        const prefixPattern = new RegExp('(?:company|employer|vendor|client|contractor|entity|oem|brand|make)\\s*(?:name)?\\s*[:=-]\\s*[\"\']?' + esc + '\\b', 'i');
        if (prefixPattern.test(docText)) return true;
        // 3. Token within corporate definition contract clause:
        // e.g. "Olivier Technologies Pvt Ltd ..., a company having its registered office"
        const clausePattern = new RegExp('(?:^|[^a-zA-Z0-9])' + esc + '[^.\\n]{0,80}\\b(?:a\\s+company|an?\\s+enterprise|an?\\s+entity|registered\\s+office|hereinafter\\s+referred\\s+to\\s+as)\\b', 'i');
        if (clausePattern.test(docText)) return true;
        // 4. Token preceded by employment/workplace context:
        // e.g. "working at Acmeworks", "experience at Acmeworks", "employed at Acmeworks", "resigning from Acmeworks"
        const workPattern = new RegExp('(?:' + WORK_CONTEXT_SOURCE + ')\\s+["\'*]*' + esc + '\\b', 'i');
        if (isPlausibleEmployerToken(token) && workPattern.test(docText)) return true;

        // 5. Tabular / CSV Column Context:
        // If docText has a header row with oem, make, company_name, company, vendor, brand, manufacturer
        const lines = allLinesOf(fullDoc);
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();
            let delimiter = null;
            if (line.includes(",")) delimiter = ",";
            else if (line.includes(";")) delimiter = ";";
            else if (line.includes("\t")) delimiter = "\t";
            else if (line.includes("|")) delimiter = "|";

            if (delimiter) {
                const rawCells = line.split(delimiter).map(c => c.replace(/^["']|["']$/g, "").trim());
                const bizColIdx = rawCells.findIndex(c => /^(?:oem|make|company_name|company|vendor|brand|manufacturer)\b/i.test(c) || /^company\s*name\b/i.test(c));
                if (bizColIdx !== -1) {
                    for (let r = i + 1; r < Math.min(lines.length, i + 50); r++) {
                        const rowCells = lines[r].split(delimiter).map(c => c.replace(/^["']|["']$/g, "").trim());
                        if (rowCells[bizColIdx]) {
                            const cellVal = rowCells[bizColIdx];
                            if (cellVal.toLowerCase().includes(lowerTok)) return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    function isTokenInNameContext(token, docText) {
        return memoText(docText, 'namectx', token, () => isTokenInNameContext_impl(token, docText));
    }
    function isTokenInNameContext_impl(token, docText) {
        if (!token || !docText || token.length < 2) return false;
        const clean = cleanWord(token);
        if (clean.length < 2) return false;
        if (hasNonEntityWord(clean) || isFieldLabelOrHeader(clean)) return false;

        const lowerTok = clean.toLowerCase();
        if (isKnownGivenNameWord(lowerTok)) return true;
        if (isTokenInNameField(clean, docText)) return true;
        const fullDoc = docText;
        docText = narrowText(clean, docText);

        const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 1. Narrative / Dialogue context: "Jesus said to", "Thomas said to him", "said to Jesus"
        const dialogueRegex = new RegExp('(?:^|[^\\p{L}])' + esc + '\\s+(?:said|spoke|replied|answered|asked|cried|shouted|told)\\b', 'iu');
        if (dialogueRegex.test(docText)) return true;
        const dialoguePreRegex = new RegExp('(?:said|spoke|replied|answered|asked|told)\\s+(?:to|unto)?\\s+["\'*]*' + esc + '\\b', 'iu');
        if (dialoguePreRegex.test(docText)) return true;

        // 2. Title / Honorific preceding the token: "Lord Jesus", "Saint Peter", "Mr. Sharma"
        const titleRegex = new RegExp('\\b(?:mr|mrs|ms|miss|dr|lord|king|queen|prince|princess|saint|st|prof|professor|sir|father|sister|brother|apostle|disciple)\\.?\\s+["\'*]*' + esc + '\\b', 'iu');
        if (titleRegex.test(docText)) return true;

        // 3. Jira / Atlassian user format: <Name>,<Account ID> (e.g. "Asha Rao,712020:0000-...", "Ravi Kumar,aaaaaaaa...")
        const jiraUserRegex = new RegExp('(?:^|[,\\r\\n])' + esc + ',\\s*(?:\\d{6,}:[a-f0-9\\-]+|[a-f0-9]{24})\\b', 'i');
        if (jiraUserRegex.test(docText)) return true;

        // 4. Serial name list context: "between Naazia, Vinita, Vedika, Shrusti", "assigned to X, Y, Z"
        if (isInSerialNameList(clean, docText)) return true;

        // 5. Tabular / CSV Column Context:
        // If docText has a header row with Customer Name / Full Name / Employee Name / Lead Name / Assignee / Reporter / Author
        // check if the token appears in that column across rows
        const lines = allLinesOf(fullDoc);
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();
            let delimiter = null;
            if (line.includes(",")) delimiter = ",";
            else if (line.includes("\t")) delimiter = "\t";
            else if (line.includes("|")) delimiter = "|";

            if (delimiter) {
                const rawCells = line.split(delimiter).map(c => c.replace(/^["']|["']$/g, "").trim());
                // Header cell must BE a name header ("Name", "Customer Name", "Assignee"), not a key-value label such as
                // "Name of the Reviewee:" - otherwise every word in that column of every row counted as a person's name.
                const nameColIdx = rawCells.findIndex(c => /^(?:customer|lead|client|employee|patient|candidate|full|first|last)?\s*name$|^(?:assignee|reporter|author|owner|creator)$/i.test(c.replace(/\*/g, '').trim()));
                if (nameColIdx !== -1) {
                    for (let r = i + 1; r < Math.min(lines.length, i + 50); r++) {
                        const rowCells = lines[r].split(delimiter).map(c => c.replace(/^["']|["']$/g, "").trim());
                        if (rowCells[nameColIdx]) {
                            const cellVal = rowCells[nameColIdx];
                            const words = cellVal.toLowerCase().split(/[^\p{L}'.-]+/u).filter(Boolean);
                            if (words.length <= 5 && words.includes(lowerTok)) return true;
                        }
                    }
                }
            }
        }

        // 6. Key-Value context: "Customer Name: Karan", "Name = Karan"
        const kvRegex = new RegExp('(?:(?:customer|client|full|employee|candidate|lead|patient|assignee|reporter|author)\\s*name)\\s*[:=,]\\s*["\'*]*' + esc + '\\b', 'iu');
        if (kvRegex.test(docText)) return true;

        return false;
    }

    function isInsideAnyEmail(token, text) {
        return memoText(text, 'email', token, () => isInsideAnyEmail_impl(token, text));
    }
    function isInsideAnyEmail_impl(token, text) {
        if (!token || !text) return false;
        const clean = token.trim();
        if (clean.length < 2) return false;
        text = narrowText(clean, text);
        const emailRegex = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})\b/g;
        let m;
        const lowerToken = clean.toLowerCase();
        while ((m = emailRegex.exec(text)) !== null) {
            const fullEmail = m[0].toLowerCase();
            const userPart = m[1].toLowerCase();
            const domainPart = m[2].toLowerCase();
            if (fullEmail === lowerToken) return true;
            if (userPart === lowerToken || userPart.includes(lowerToken)) return true;
            const domainLabels = domainPart.split('.');
            if (domainLabels.includes(lowerToken)) return true;
        }
        return false;
    }

    function isInsideChangedUrl(token, leftText, rightText) {
        return memoText(rightText, 'churl:' + (leftText || '').length, token, () => isInsideChangedUrl_impl(token, leftText, rightText));
    }
    function isInsideChangedUrl_impl(token, leftText, rightText) {
        if (!token || !rightText) return false;
        const lowerToken = token.toLowerCase();
        const leftSquashed = squashedOf(leftText || "");
        leftText = narrowText(token, leftText || "");
        rightText = narrowText(token, rightText);

        // 1. Query parameter context check (e.g. utm_medium=token, utm_campaign=token, token in query string)
        const escTok = lowerToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const qRegex = new RegExp('(?:utm_[a-z]+|ref|referrer|source|campaign|medium|affiliate)\\s*[:=\\\\_]+[^|\\r\\n]*' + escTok, 'i');
        if (qRegex.test(rightText)) {
            const inLeft = new RegExp('(?:utm_[a-z]+|ref|referrer|source|campaign|medium|affiliate)\\s*[:=\\\\_]+[^|\\r\\n]*' + escTok, 'i').test(leftText);
            if (!inLeft) return true;
        }

        // 2. Full URL (including multiline / wrapped lines with query parameters)
        const urlRegex = /(?:https?:\/\/|www\.|\b[a-zA-Z0-9_\-]+\.(?:com|org|net|io|ai|co|app|dev|gov|edu|in|uk)\b)[^\s"'<>|]*(?:\s*[\r\n]+\s*[^\s"'<>|]+)*/gi;
        let match;
        while ((match = urlRegex.exec(rightText)) !== null) {
            const fullUrl = match[0].replace(/[.,;:!?]+$/, "").replace(/\s+/g, "");
            if (fullUrl.toLowerCase().includes(lowerToken)) {
                if (!leftSquashed.includes(fullUrl)) {
                    return true;
                }
            }
        }
        return false;
    }

    // Part of a postal address? ("Plot no. 13, Near Shanti Mandir", "937 Garnthwaite Road", "Sector 127, Noida 201304")
    // Needs two address signals, or a number tied to an address word, or a PIN code, so prose like
    // "near the road" does not count.
    const ADDRESS_WORD_RE = /\b(?:plot|flat|house|h\.?\s?no|door|near|opp(?:osite)?|behind|sector|block|phase|road|rd|street|st|lane|ln|avenue|ave|marg|nagar|layout|colony|vill(?:age|ege)|tehsil|district|dist|taluka?|mandal|cross|main|floor|apartments?|apt|tower|building|bldg|chowk|bazaar|enclave|extension|ext|pincode|pin)\b/gi;
    function looksLikeAddressPart(s) {
        const t = (s || "").trim();
        if (!t) return false;
        if (/(?:^|\D)[1-9]\d{5}(?:\D|$)/.test(t) && /[A-Za-z]/.test(t)) return true;                       // PIN code
        if (/\b(?:plot|flat|house|door|sector|block|phase)\s*(?:no\.?\s*)?#?\d+/i.test(t)) return true;      // "Plot no. 13", "Sector 127"
        if (/^(?:no\.?|#)\s*\d+[a-z]?\s*,/i.test(t) || /\b\d+(?:st|nd|rd|th)\s+(?:cross|main|floor|block|stage|phase|avenue|street)\b/i.test(t)) return true; // "No. 45, ...", "2nd Cross"
        if (/^\s*#?\d{1,5}[A-Za-z]?,?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Way|Boulevard|Blvd|Court|Ct|Place|Pl|Marg|Nagar)\b/.test(t)) return true; // "937 Garnthwaite Road"
        const n = (t.match(ADDRESS_WORD_RE) || []).length;
        return n >= 2 || (n >= 1 && containsPlace(t));
    }

    // Is the line holding `token` part of an address block (it, or a line within 2 of it, looks like an address)?
    function isInAddressBlock(token, text) {
        const t = (token || "").trim();
        if (!t || !text) return false;
        return memoText(text, 'addrblock', t, () => {
            const ix = text.length >= NARROW_MIN_LENGTH ? textIndex(text).lines : text.split("\n");
            const first = (t.split(/\s+/)[0] || t);
            for (let i = 0; i < ix.length; i++) {
                if (!ix[i].includes(first)) continue;
                // Address blocks are short prose lines; JSON, code, CSV and long paragraphs never count.
                const usable = (l) => l.length > 0 && l.length <= 120 && !/[{}"=;<>]|\t/.test(l) && (l.match(/,/g) || []).length <= 6;
                if (!usable(ix[i].trim())) continue;
                for (let k = Math.max(0, i - 2); k <= Math.min(ix.length - 1, i + 2); k++) {
                    const l = ix[k].trim();
                    if (!usable(l)) continue;
                    if (looksLikeAddressPart(l) || /^[1-9]\d{5}$/.test(l)) return true;     // a bare PIN line counts
                }
            }
            return false;
        });
    }
    // Reference codes (GSTIN, order / invoice IDs): letters AND digits, no spaces, 8+ characters. Replacing one
    // is never Overscrubbed.
    function looksLikeIdCode(s) {
        const t = (s || "").trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9\/-]{7,}$/.test(t)) return false;
        // At least one segment mixes letters and digits ("17GSPPN8790HUZX", "INV2023001"), or there are 4+ digits.
        // "ap-northeast-2" or "job-function" are names with a number, not codes.
        const mixed = t.split(/[\/-]/).some(seg => /\d/.test(seg) && /[A-Za-z]/.test(seg) && seg.length >= 6);
        return mixed || ((t.match(/\d/g) || []).length >= 4 && /[A-Za-z]/.test(t));
    }

    // Changed words whose ORIGINAL was ordinary text (filled per extraction run).
    const __ptOrdinaryOrigins = new Set();
    // Words of scrubbed values in table name columns (filled per extraction run, Step 1E).
    const __ptNameCellWords = new Set();
    // Right-side words that replaced a NAME (proper noun) on the left (filled per extraction run).
    const __ptScrubbedNameWords = new Set();
    // "Transfer-Ins/VDRs": ordinary once split on delimiters (every alphabetic part is a common word or initial).
    function origOrdinaryForOverscrub(orig) {
        const parts = cleanWord(orig || "").split(/[\s\-_\/.:]+/).filter(p => /[A-Za-z]/.test(p));
        return parts.length > 0 && parts.every(p => isOrdinaryPhrase(p) || /^[A-Z]{2,5}s?$/.test(p));
    }

    // ---- Sibling names: lines shaped like a line whose name was scrubbed ("# {name}") ----
    const __ptNameShapes = new Set();
    function nameShape(line, name) {
        const i = line.indexOf(name);
        if (i < 0) return null;
        const shape = (line.slice(0, i) + "\u0000" + line.slice(i + name.length)).replace(/\d+/g, "#").trim();
        return shape.length <= 40 ? shape : null;     // only short, specific shapes (headings, labels)
    }
    function rememberScrubbedNameShape(name, leftText) {
        const occ = lineOfToken(name, leftText);
        if (!occ) return;
        const sh = nameShape(occ, name);
        if (sh) __ptNameShapes.add(sh);
    }
    function lineOfToken(token, text) {
        const t = narrowText(token, text);
        for (const l of t.split("\n")) if (l.includes(token)) return l;
        return null;
    }

    // ---- Credential key-value lines: "Password - x", "PAN: y", "api_key = z", "OTP is 123456" ----
    const CRED_KEY_SOURCE = [
        'pass(?:word|wd|code|phrase)?', 'pwd', 'pin', 'm-?pin', 'upi\\s*pin', 'atm\\s*pin', 'otp', 'one[\\s-]*time\\s*password',
        'security\\s*(?:question\\s*)?answer', 'secret\\s*answer', 'memorable\\s*word',
        '(?:api|secret|access|private|client)[\\s_-]*(?:key|secret|token)', 'auth(?:entication)?[\\s_-]*token', 'bearer(?:\\s*token)?', 'token', 'ssh[\\s_-]*key',
        'aadh?aa?r(?:\\s*(?:card|no\\.?|number))*', 'driving\\s*licen[cs]e(?:\\s*(?:no\\.?|number))?', 'dl\\s*(?:no\\.?|number)',
        'voter\\s*id(?:\\s*(?:no\\.?|number))?', 'epic(?:\\s*(?:no\\.?|number))?',
        '(?:credit|debit)?\\s*card\\s*(?:no\\.?|number)', 'cvv2?', 'cvc', 'expiry(?:\\s*date)?', 'exp(?:iry)?\\.?\\s*date', 'valid\\s*(?:thru|till|upto)',
        'upi(?:\\s*id)?', 'vpa', 'transaction\\s*(?:id|no\\.?|ref(?:erence)?(?:\\s*no\\.?)?)', 'txn\\s*(?:id|no\\.?|ref)', 'tx\\s*(?:id|hash)', 'utr(?:\\s*(?:no\\.?|number))?',
        '(?:invocation|execution|request|lambda|run)[\\s_-]*id', 'sha(?:-?1|-?256)?(?:\\s*hash)?', 'hash', 'commit(?:\\s*(?:id|sha|hash))?',
        'vpc[\\s_-]*id', 'card[\\s_-]*id', '(?:aws\\s*)?account[\\s_-]*id', 'ifsc(?:\\s*code)?', 'bank\\s*branch\\s*code',
        'pan(?:\\s*(?:card|no\\.?|number))*', 'income\\s*tax\\s*id'
    ].join('|');
    // key (optionally followed by a short "(...)" note) + separator + value, on one line
    const CRED_LINE_RE = new RegExp('(?:^|[\\s|,{;"\'*])(?:[A-Za-z0-9]+[_-])*(' + CRED_KEY_SOURCE + '|(?<=[A-Za-z0-9][_-])key)(?:\\s*\\([^)\\n]{0,30}\\))?["\'*]*\\s*(?::|=|=>|->|\\s-\\s|\\s\\u2013\\s|\\s\\u2014\\s|\\sis\\s)\\s*["\'`]?([^\\n"\'`|]+)', 'gi');
    // Code that follows a key-like word, never a secret: calls ("hashPassword(input", "function(stream"),
    // index access ("os.environ["), dotted references without digits ("config.apiKey"), template / env
    // placeholders ("${DB_PASSWORD}", "{{ token }}", "$API_KEY") and language keywords. Real passwords with
    // punctuation ("P@ss(123)!", "Tr0ub4dor&3") are still accepted.
    function isCodeLikeValue(v) {
        const s = (v || "").trim();
        if (/^[A-Za-z_$][\w$.]*\s*\(/.test(s) && !/\d/.test(s.split("(")[0])) return true;      // call
        if (/^[A-Za-z_$][\w$.]*\[/.test(s) && !/\d/.test(s.split("[")[0])) return true;        // index access
        if (/^(?:\$\{|%\(|\{\{|<%|\$[A-Z_][A-Z0-9_]*$)/.test(s)) return true;                   // placeholders
        if (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/.test(s) && !/\d/.test(s)) return true;           // dotted reference
        if (/^(?:function|new|this|self|return|await|async|require|import|process|os|env|config|settings|options|params|args|props|state|data|req|res|null|undefined|true|false)(?:[.(\[]|$)/i.test(s)) return true;
        return false;
    }

    // Is `v` a real credential VALUE for this key, rather than code that happens to follow a key-like word?
    // e.g. "token: function(stream, state) {" in a JavaScript file is NOT a token.
    function credentialValueLooksReal(key, v, line, quoted) {
        const k = key.toLowerCase().replace(/\s+/g, " ");
        // Bank account numbers behind an account-number key are Account Number, not Credentials (own scan).
        if (/^(?:account|acct)\s*(?:no|number|num)|^a\/c/.test(k)) return false;
        // Bare "key" behind an env-style prefix (STRIPE_KEY=...): only an obvious secret counts.
        if (k === "key") return /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_\-\/+=.]{12,}$/.test(v) && !isCodeLikeValue(v);
        // 1. Typed keys: the value must have that type's format.
        if (/aadh?aa?r/.test(k)) return /^(?:\d{4}\s\d{4}\s\d{4}|\d{12})$/.test(v);
        if (/^pan\b|income tax/.test(k)) return /^[A-Z]{5}\d{4}[A-Z]$/.test(v);
        if (/ifsc|branch code/.test(k)) return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        if (/vpc/.test(k)) return /^vpc-[0-9a-f]{8,17}$/i.test(v);
        if (/card[\s_-]*id/.test(k)) return /^card_[A-Za-z0-9]{10,40}$/.test(v);
        if (/card\s*(?:no|number)/.test(k)) return isCardNumber(v);
        if (/^cvv|^cvc/.test(k)) return /^\d{3,4}$/.test(v);
        if (/expiry|exp|valid/.test(k)) return /^(?:0[1-9]|1[0-2])\s*\/\s*(?:\d{2}|\d{4})$/.test(v);
        if (/upi|vpa/.test(k) && !/pin/.test(k)) return /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/.test(v);
        if (/voter|epic/.test(k)) return /^[A-Z]{3}\d{7}$/.test(v);
        if (/driving|^dl/.test(k)) return /^[A-Z]{2}[ -]?\d{2}[ -]?\d{4}[ -]?\d{7}$|^[A-Z]{2}\d{2}\s\d{11}$/.test(v);
        if (/account/.test(k)) return /^\d{12}$/.test(v) || /^A[A-Z]{3}[A-Z0-9]{12,20}$/.test(v);
        if (/invocation|execution|request|lambda|run/.test(k)) return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) || /^[A-Za-z0-9-]{16,}$/.test(v) && /\d/.test(v);
        if (/^sha|hash|commit/.test(k)) return /^(?:[0-9a-f]{7,64}|sha256:[0-9a-f]{64})$/i.test(v);
        if (/transaction|txn|tx\s|utr/.test(k)) return /^(?:0x[0-9a-f]{16,64}|[A-Za-z0-9-]{8,40})$/i.test(v) && /\d/.test(v);
        if (/^(?:otp|pin|m-?pin|upi\s*pin|atm\s*pin)$|one.*time/.test(k)) return /^\d{4,8}$/.test(v);
        // 2. Generic secrets (password, token, API key, security answer, ...): reject code, references, placeholders.
        if (isCodeLikeValue(v)) return false;
        if (/^(?:your|enter|insert|example|sample|test|dummy|placeholder|changeme|password|secret|token|string|value|xxxx)/i.test(v)) return false;
        // An unquoted bare identifier or dotted path in CODE is a variable reference, not a secret
        // ("apiKey: config.apiKey", "token: tokenFromHeader"). In prose ("Password - Tr0ub4dor&3") it is a value.
        const looksLikeCode = /[;{}]\s*$|^\s*(?:var|let|const|def|function|return|if|else|import|export)\b|\/\/|^\s*[A-Za-z_$][\w$]*\s*:\s*[^:]/.test(line) && !/^\s*[A-Za-z][A-Za-z ]{0,30}\s+[-\u2013\u2014]\s/.test(line);
        if (!quoted && looksLikeCode && /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(v) && !/\d/.test(v)) return false;
        return true;
    }

    function credentialValuesInLine(line) {
        const out = [];
        CRED_LINE_RE.lastIndex = 0;
        let m;
        while ((m = CRED_LINE_RE.exec(line)) !== null) {
            let v = m[2].trim().replace(/[,;]+$/, "").trim();
            // Grouped numbers (Aadhaar, cards, DL) keep their spaces; anything else stops at the first space.
            if (!/^(?:[A-Z]{2}\d{2}\s\d{11}|\d{4}(?:[ -]\d{4}){2,3}|\d{4}\s\d{4}\s\d{4})$/.test(v)) v = v.split(/\s+/)[0];
            v = v.replace(/^["'`]+|["'`]+$/g, "");
            const valueIndex = m.index + m[0].length - m[2].length;
            const quoted = valueIndex > 0 && /["'`]/.test(line[valueIndex - 1]);
            // Sentence punctuation after the value ("Your OTP is 482913.") is not part of it.
            if (!credentialValueLooksReal(m[1], v, line, quoted) && /[.,;:!?)\]]$/.test(v)) {
                const trimmed = v.replace(/[.,;:!?)\]]+$/, "");
                if (credentialValueLooksReal(m[1], trimmed, line, quoted)) v = trimmed;
            }
            if (v.length >= 3 && !/^(?:null|none|n\/a|na|nan|true|false|undefined|xxx+|\*+|-+)$/i.test(v) &&
                credentialValueLooksReal(m[1], v, line, quoted)) {
                out.push({ key: m[1], value: v, index: valueIndex });
            }
        }
        return out;
    }
    // Is `token` (part of) the VALUE of a credential key on its line?
    function isOnCredentialValue(token, text) {
        const t = (token || "").trim();
        if (!t || t.length < 2 || !text) return false;
        return memoText(text, 'credval', t, () => {
            // Token diffs split values at punctuation ("Qw9 ! mZp2 # Lk"), so compare without whitespace.
            const tt = t.replace(/\s+/g, "");
            const firstWord = t.split(/\s+/)[0];
            for (const l of narrowText(firstWord, text).split("\n")) {
                if (!l.replace(/\s+/g, "").includes(tt)) continue;
                for (const cv of credentialValuesInLine(l)) {
                    const vv = cv.value.replace(/\s+/g, "");
                    if (vv.includes(tt) || tt.includes(vv)) return true;
                }
            }
            return false;
        });
    }

    // Result cache: re-audits after a click or a new label usually see the same document text, so the full
    // analysis (the expensive part on long documents) is reused instead of recomputed.
    const __ptTargetsCache = new Map();
    // (v11.4.1) Suggestions follow the label chips on the page. The engine knows the new label set, but a dashboard that only
    // shows the 13 old chips gets the old labels: a phone is "Contact Number", and labels with no chip (Postal Code, ...) are
    // not suggested. The 13 old labels are always kept. When no chip was found at all, nothing is changed.
    const OLD_LABELS = new Set(["Account Number", "Address", "Business Name", "Contact Number", "Credentials", "Date", "Email Address",
        "IP Address", "Overscrubbed", "Person Name", "URL/Link", "Person Username", "Vehicle Number Plate"]);
    const CHIP_FALLBACK = { "Indian Mobile Number": "Contact Number", "International Phone Number": "Contact Number" };
    function pageChipNames() {
        try { learnPalette(); } catch (e) {}
        return (__ptPalette && __ptPalette.seen) || new Set();
    }
    // The label to use on this page for `label`, or null when this page has no chip for it.
    function labelForPage(label, chips = pageChipNames()) {
        if (!label || OLD_LABELS.has(label) || !chips || chips.size === 0 || chips.has(label)) return label;
        const fb = CHIP_FALLBACK[label];
        return fb && chips.has(fb) ? fb : null;
    }
    function adaptTargetsToPage(targets) {
        const chips = pageChipNames();
        if (!chips || chips.size === 0) return targets;
        const out = [];
        for (const t of targets) { const l = labelForPage(t.label, chips); if (l) { if (l !== t.label) t.label = l; out.push(t); } }
        out.scrubbedNames = targets.scrubbedNames; out.ordinaryWords = targets.ordinaryWords;
        return out;
    }

    function extractDynamicTargets(leftPane, rightPane, texts) {
        return adaptTargetsToPage(extractDynamicTargetsCached(leftPane, rightPane, texts));
    }
    function extractDynamicTargetsCached(leftPane, rightPane, texts) {
        const leftText = (texts && texts.left != null) ? texts.left : (leftPane.innerText || "");
        const rightText = (texts && texts.right != null) ? texts.right : (rightPane.innerText || "");
        // Keyed by the texts themselves (native string hashing is much faster than hashing in JS).
        const byRight = __ptTargetsCache.get(leftText);
        const cached = byRight && byRight.get(rightText);
        if (cached) { const copy = cached.map(t => Object.assign({}, t)); copy.scrubbedNames = cached.scrubbedNames; copy.ordinaryWords = cached.ordinaryWords; return copy; }
        const result = extractDynamicTargetsUncached(leftText, rightText);
        if (__ptTargetsCache.size >= 3) __ptTargetsCache.delete(__ptTargetsCache.keys().next().value);
        const m = byRight || new Map();
        if (m.size >= 3) m.delete(m.keys().next().value);
        const stored = result.map(t => Object.assign({}, t)); stored.scrubbedNames = result.scrubbedNames; stored.ordinaryWords = result.ordinaryWords;
        m.set(rightText, stored);
        __ptTargetsCache.set(leftText, m);
        return result;
    }

    function extractDynamicTargetsUncached(leftText, rightText) {
        // Inline markup such as <u>...</u> often survives on one side only (the scrubber dropped it on the right),
        // which shifted every diff in a name list. It is not content, so it is removed before comparing.
        const stripInline = (s) => s.replace(/<\/?(?:u|b|i|em|strong|s|sup|sub|mark|ins|del)>/gi, "").replace(/~~|\*\*/g, "");
        leftText = stripInline(leftText);
        rightText = stripInline(rightText);
        const targetMap = new Map();
        __ptNameShapes.clear();
        __ptOrdinaryOrigins.clear();
        __ptNameCellWords.clear();
        __ptScrubbedNameWords.clear();

        const STOP_WORDS = new Set([
            "a", "an", "the", "of", "for", "in", "on", "to", "at", "by", "from", "with", "about", 
            "into", "through", "during", "before", "after", "above", "below", "under", "up", "down", 
            "is", "am", "are", "was", "were", "be", "been", "being", "have", "has", "had", 
            "do", "does", "did", "will", "would", "shall", "should", "may", "might", "must", 
            "can", "could", "and", "but", "or", "nor", "so", "yet", "if", "as", "that", "this", 
            "these", "those", "it", "its", "not", "no", "yes", "use", "used", "using", "case", 
            "grant", "form", "name", "amount", "total", "date", "item", "select", "type", 
            "summary", "status", "request", "point", "contact", "kyc", "table", "diagram", 
            "architecture", "platform", "fund", "funds", "milestone", "feature", "features", 
            "service", "services", "project", "projects", "group", "groups", 
            "code", "due", "achievement", "company", "applicant", "country", "incorporation", 
            "please", "provide", "brief", "overview", "outcome", "outcomes", "criteria", 
            "payment", "schedule", "earliest", "expected", "unique", "notional", "instrument",
            "annotations", "reference", "readonly", "readonly", "annotation",
            // Job titles and seniority - never Overscrubbed
            "senior", "junior", "mid", "lead", "staff", "principal", "head", "chief", "associate",
            "entry", "intern", "fresher", "experienced", "specialist", "expert", "consultant",
            // Career and role words - never Overscrubbed
            "developer", "engineer", "architect", "designer", "analyst", "manager",
            "engineering", "development", "management", "administration",
            "fullstack", "frontend", "backend", "devops", "sre", "stack", "full",
            "mobile", "web", "embedded", "data", "ml", "ai",
            "roles", "role", "position", "positions", "department", "division", "tech", "technical",
            // Resume / CV section words - never Overscrubbed
            "scholarship", "education", "university", "college", "degree", "diploma", "certification",
            "experience", "experiences", "skill", "skills", "responsibilities", "responsibility",
            "achievements", "accomplishments", "present", "since",
            "bachelor", "master", "phd", "mtech", "btech", "mba",
            // Common English action words - never Overscrubbed
            "support", "supporting", "supported", "implement", "implementing", "implementation",
            "develop", "developing", "developed", "build", "building", "built",
            "manage", "managing", "managed", "leading", "led",
            "legacy", "scratch", "scalable", "maintain", "maintenance",
            "integrate", "integration", "deploy", "deployment", "release", "releases",
            "test", "testing", "debug", "debugging", "fix", "fixes", "fixed",
            "included", "including", "include", "excluded", "excluding",
            "required", "requiring", "require", "provided", "providing",
            "performance", "security", "reliability", "availability", "scalability",
            "responsible", "ownership", "collaboration", "communication",
            // Document content that is never PII
            "number", "phone", "email", "address", "information", "details", "profile",
            "linkedin", "github", "portfolio", "website", "contact", "location", "area",
            "metropolitan", "regional", "national", "international",
            "inc", "ltd", "pvt", "llc", "corp",
            "sr", "jr", "ii", "iii", "iv"
        ]);

        function isIdOrLoginInDoc(text, docText) {
            return memoText(docText, 'idlogin', text, () => isIdOrLoginInDoc_impl(text, docText));
        }
        function isIdOrLoginInDoc_impl(text, docText) {
            if (!text || !docText) return false;
            docText = narrowText(text, docText);
            const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // The key must be exactly one of these names at the start of a key (after "{", ",", "[" or a line start).
            // Without this anchor, "account_id", "PolicyId", "Voter ID" and "VPC ID" were all treated as a generic "id".
            const regex = new RegExp('(?:^|[{,\\[]\\s*|\\n\\s*)["\']?(?:node_id|id|login|gravatar_id|user_id|avatar_url)["\']?\\s*[:=]\\s*["\']?' + esc, 'im');
            return regex.test(docText);
        }

        // keyContext = true when the value was read from an explicit key such as "cvv": / "pin": / "password":
        // (short numbers like a CVV are only credentials when they sit behind such a key).
        function occurrencesOf(token, text) {
            const out = [];
            if (!token || !text) return out;
            const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp('(?<![A-Za-z0-9])' + esc + '(?![A-Za-z0-9])', 'gi');
            let m;
            while ((m = re.exec(text)) !== null) { out.push(m.index); if (m[0].length === 0) re.lastIndex++; }
            return out;
        }

        function onlyInsideUrlsOrEmails(token, text) {
            text = narrowText(token, text);
            const occ = occurrencesOf(token, text);
            if (occ.length === 0) return false;
            const spans = [];
            const re = /(?:https?:\/\/|www\.)[^\s"'<>|)\]]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi;
            let m;
            while ((m = re.exec(text)) !== null) spans.push([m.index, m.index + m[0].length]);
            return occ.every(i => spans.some(([a, b]) => i >= a && i < b));
        }

        function onlyInsidePlaceholders(token, text) {
            text = narrowText(token, text);
            const occ = occurrencesOf(token, text);
            if (occ.length === 0) return false;
            const spans = [];
            const re = /\[[^\]\n]*\]|<[^>\n]*>/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                if (/\b(?:e\.?g\.?|insert|select|example|enter|legally|your|name\s+of)\b|^<[A-Z _]+>$/i.test(m[0])) spans.push([m.index, m.index + m[0].length]);
            }
            return occ.every(i => spans.some(([a, b]) => i >= a && i < b));
        }

        function addTarget(text, label, cls, priority = 10, keyContext = false) {
            if (!text || text.length > MAX_TOKEN_LEN * 2) return;
            // A label cannot span lines: the page shows each line in its own element, so it could never be highlighted.
            if (/[\r\n]/.test(String(text).trim())) return;
            if (!text) return;
            const cleanText = cleanWord(text);
            if (cleanText.length < 2 || (/^\d{1,3}$/.test(cleanText) && label !== "Credentials")) return;
            if (/^[\|\[\]\*\-:#]+$/.test(cleanText)) return;

            // User rule: "this r not person username the value of node id r just id this things if it changed to other form r not changed also no issue no need to label it anything"
            // (v11.2.0) GitHub-style node ids are mixed-case base64 ("MDQ6VXNlcjEy..."); an all-caps 10-character value
            // starting with MD is a PAN ("MDJCH6932F"), not a node id.
            if (/^(?:MD[A-Za-z0-9_-]{8,}|SFX[A-Za-z0-9_-]{8,})$/.test(cleanText) && (/[a-z]/.test(cleanText) || cleanText.length > 12)) return;
            if (label === "Person Username") {
                if (/^\d{5,12}$/.test(cleanText)) return;
                if (isIdOrLoginInDoc(cleanText, rightText) || isIdOrLoginInDoc(cleanText, leftText)) return;
            }
            if (label === "Credentials") {
                // (v11.3.2) a plain dictionary word is a setting, not a secret ("id-token: write", "pages: write")
                if (/^[A-Za-z]{2,}$/.test(cleanText) && isCommonWord(cleanText.toLowerCase())) return;
                // A secret is one token (or a grouped number / two-word security answer), never a phrase
                // ("Xk9#mPq2!vL7 was rotated after the incident").
                if (cleanText.split(/\s+/).length >= 3 && !/^\d{2,6}(?:[ -]\d{2,6}){2,4}$/.test(cleanText)) return;
                // Never a credential: code and references that merely follow a key-like word.
                // hashPassword(input), config.apiKey, os.environ, settings.SECRET_KEY, ${DB_PASSWORD}, {{ token }}
                if (isCodeLikeValue(cleanText)) return;
                // User rule: "dont mark that account id and policy id only label thoese values only"
                if (/^(?:_?account_?id|policyid|password|passwd|pwd|pin|otp)$/i.test(cleanText)) return;
                // User rule: "only id is not necessaery to mark as credentials"
                // Generic object / JSON / node IDs (e.g. "id": "26527fe0-...", node_id, id: ...) are NOT credentials!
                if (isIdOrLoginInDoc(cleanText, rightText) || isIdOrLoginInDoc(cleanText, leftText)) {
                    const esc = cleanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const isCredKey = new RegExp('(?:["\']?(?:invocation[_-]?id|execution[_-]?id|request[_-]?id|secret|api[_-]?key|token)["\']?\\s*[:=]\\s*["\']?)' + esc, 'i');
                    if (!isCredKey.test(rightText) && !isCredKey.test(leftText)) {
                        return;
                    }
                }
                // Rule: Financial amounts, billing numbers, currency, and numerical metrics must NEVER be Credentials!
                if (/^\d+(?:\.\d+)?$/.test(cleanText) && !keyContext) {
                    if (isFinancialOrBillingContext(cleanText, rightText) || isFinancialOrBillingContext(cleanText, leftText) || /^\d{1,4}$/.test(cleanText)) {
                        return;
                    }
                }
            }

            if (label === "Person Name") {
                const greet = cleanText.match(/^(?:hi|hello|hey|dear|thanks|thank\s+you|regards|greetings|good\s+(?:morning|afternoon|evening))[,!.\s]+(.+)$/i);
                if (greet) return addTarget(greet[1], label, cls, priority, keyContext);
                if (isFieldLabelOrHeader(cleanText)) return;
                if (hasNonEntityWord(cleanText)) return;
                // (v11.2.0) found by the mass test campaign
                if (/\d/.test(cleanText) || isVehiclePlateFormat(cleanText) || /@/.test(cleanText)) return;   // "KL 61 HU 6444" is a plate, not a name
                // (v11.3.2) code identifiers: ALL-CAPS single words that are not names ("CHECKSUMHASH", "WEBSITE"), snake_case
                if (/_/.test(cleanText)) return;
                // camelCase / PascalCase compounds are code ("userService", "OrderController"), not people - except name
                // prefixes like McDonald, MacArthur, DeSouza, LaToya, VanDyke, O'Brien
                if (cleanText.split(/\s+/).some(w => /^[a-z]+[A-Z]/.test(w) || (/^[A-Z][a-z]+[A-Z][a-z]/.test(w) && !/^(?:Mc|Mac|De|Di|Da|Du|La|Le|Van|Von|Del|Della|Fitz)[A-Z]/.test(w)))) return;
                if (/^[A-Z]{2,}$/.test(cleanText) && !KNOWN_GIVEN_NAMES.has(cleanText.toLowerCase())) return;
                // the value of an HTML / XML attribute name="..." is a field name, not a person (<input name="WEBSITE">)
                {
                    const escP = cleanText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    if (new RegExp("<[A-Za-z][\\w-]*[^<>]*\\bname\\s*=\\s*[\"']" + escP + "[\"']").test(rightText)) return;
                }
                const pw = cleanText.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
                const lw = pw.map(w => w.toLowerCase());
                if (CORP_SUFFIX_RE.test(cleanText) && pw.length > 1) return;                                   // "Northwind Logistics"
                if (pw.length === 1 && (TECH_TOOLS.has(lw[0]) || /^(?:excel|photoshop|jira|confluence|github|gitlab|python|java|figma|slack|notion|tally)$/.test(lw[0]) ||
                    PLACES.has(lw[0]) || isLanguageWord(lw[0]) || isCalendarWord(lw[0]))) return;                // "Excel", "Bengaluru", "Hindi"
                if (!pw.some(couldBeName) && isOrdinaryPhrase(pw.join(" "))) return;                        // "Friends", "Partner"
                if (lw.some(w => KNOWN_BUSINESS_NAMES.has(w)) && !pw.some(w => KNOWN_GIVEN_NAMES.has(w.toLowerCase()))) return;   // "Infosys"
            }

            if (label === "Business Name" && /\s/.test(cleanText) && !cleanText.split(/\s+/).some(w => CORP_SUFFIX_RE.test(w))) {   // a full company name ("Evergreen Agro LLC") is never trimmed
                // (v11.3.4) a brand followed / preceded by ordinary words is only the brand: "Meta token" -> "Meta",
                // "Google Ads account" -> "Google Ads" (corporate suffixes such as Services / Ltd are kept)
                const ws = cleanText.split(/\s+/);
                const keep = (w) => CORP_SUFFIX_RE.test(w) || /^(?:&|and|of)$/i.test(w);
                let a = 0, b = ws.length;
                const bizish = (s) => containsKnownBusiness(s) || isBusinessName(s, s, "");
                while (b - a > 1 && isCommonWord(ws[b - 1].toLowerCase()) && !keep(ws[b - 1]) && bizish(ws.slice(a, b - 1).join(" "))) b--;
                while (b - a > 1 && isCommonWord(ws[a].toLowerCase()) && !keep(ws[a]) && bizish(ws.slice(a + 1, b).join(" "))) a++;
                if (a > 0 || b < ws.length) return addTarget(ws.slice(a, b).join(" "), label, cls, priority, keyContext);
            }
            if (label === "Business Name") {
                // User rule: "bank name i sno an business name"
                if (/^(?:bank\s*name|company\s*name|business\s*name|firm\s*name|store\s*name|vendor\s*name|employer\s*name|organization\s*name|account\s*name|patient\s*name|policy\s*holder|primary\s*beneficiary|bank|banking)$/i.test(cleanText)) return;
                if (isFieldLabelOrHeader(cleanText)) return;
                if (/\bbank(?:ing)?\b/i.test(cleanText)) return;
                // (v11.2.0) found by the mass test campaign
                if (/^(?:hi|hello|hey|dear|thanks|regards|cc)\b/i.test(cleanText)) return;                      // "Hi Silverline Labs"
                if (/^(?:jira|confluence|excel|photoshop|python|kubernetes|docker|english|hindi|bengali|tamil)$/i.test(cleanText) || isLanguageWord(cleanText) ||
                    PLACES.has(cleanText.toLowerCase()) || isCalendarWord(cleanText)) return;
                // a surname that is also a brand ("Dhruv Bajaj"): right after a given name it is part of a person's name
                if (!/\s/.test(cleanText) && new RegExp("\\b([A-Z][a-z]+)\\s+" + cleanText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(rightText)) {
                    const m = new RegExp("\\b([A-Z][a-z]+)\\s+" + cleanText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").exec(rightText);
                    if (m && KNOWN_GIVEN_NAMES.has(m[1].toLowerCase())) return;
                    // a known SURNAME after any capitalised first name ("Halfensa Bajaj" - the first name was scrubbed)
                    if (m && KNOWN_GIVEN_NAMES.has(cleanText.toLowerCase()) && !KNOWN_BUSINESS_NAMES.has(m[1].toLowerCase()) && !isCommonWord(m[1])) return;
                }
                // (v11.1.0) a product of a company is not the company: "Microsoft Excel", "Google Docs", "Adobe Photoshop"
                if (/\s/.test(cleanText) && /\b(?:Office|Excel|Word|PowerPoint|Outlook|Teams|Azure|Windows|Docs|Sheets|Slides|Drive|Gmail|Meet|Ads|AdWords|Analytics|Cloud|Workspace|Maps|Chrome|Photoshop|Illustrator|Acrobat|Premiere|Reader|Studio|Code|Copilot|Pay|Prime|Music|Store|Play|Search|Console|Firebase|BigQuery|Lambda|S3|EC2|Kafka|BI)\b/.test(cleanText) &&
                    !/\b(?:Pvt|Private|Ltd|Limited|Inc|Corp|Corporation|LLC|LLP|PLC|Technologies|Solutions|Services|Systems|Labs)\b/.test(cleanText)) return;

                // Legal entity TYPES are not businesses ("C Corporation", "LLC", "Sole Proprietorship").
                if (/^(?:[a-z]\s+corp(?:oration)?|llc|llp|plc|inc|ltd|gmbh|sole\s+proprietorship|partnership|private\s+limited(?:\s+company)?|public\s+limited(?:\s+company)?|pvt\.?\s*ltd\.?|limited\s+liability\s+(?:company|partnership)|corporation|company)$/i.test(cleanText)) return;
                // A word that only appears inside URLs / e-mail addresses (e.g. "github" in https://github.com/...) is not a Business Name.
                if (onlyInsideUrlsOrEmails(cleanText, rightText)) return;
                // Form placeholders like "[E.g., Sole Proprietorship, LLC., C Corporation]" or "[Insert company name]".
                if (onlyInsidePlaceholders(cleanText, rightText)) return;

                // Offline decision only. The engine never sends document text to any outside service.
                // keyContext = already verified by the corporate-suffix scan ("Tata Consultancy Services").
                if (!keyContext && !isBusinessName(cleanText, cleanText, rightText) && !isTokenInBusinessContext(cleanText, rightText) &&
                    !isTokenInTableVendor(cleanText, rightText)) {
                    return;
                }
            }

            if (label === "Vehicle Number Plate") {
                // User rule: "vechile number plate only should follow format it have real world number plates only marked"
                if (!isVehiclePlateFormat(cleanText)) return;
            }

            if (label === "Address") {
                // User rule: "for address there should be complete address eg 12, MG Road, Pune 411001 and both left and right should be then only it should be labeled as adress otherwise no need to mark"
                // keyContext = the line belongs to a complete multi-line address block verified identical on both sides.
                if (!keyContext && !isCompleteAddress(cleanText)) return;
            }

            if (label === "URL/Link") {
                // Project rule: only https:// links are labeled (http:// and bare www. links are left alone).
                if (!cleanText.startsWith("https://")) return;
                if (isFileAssetLink(cleanText)) return;   // (v11.4.1) .png, .js, .pdf, ... links are not labeled
            }

            if (label !== "Overscrubbed") {
                // User rule: "other than overscrubbed label everything should have left and right should be same then only it van labelled"
                if (!leftText.includes(cleanText)) return;
            }

            if (label === "URL/Link" || label === "Overscrubbed") {
                if (isDefaultOrPlaceholderLink(cleanText)) return;
            }
            if (label === "Email Address") {
                if (!isEmailAddressFormat(cleanText)) return;
            }
            if (label === "Email Address" || label === "Overscrubbed") {
                if (isDefaultOrPlaceholderEmail(cleanText)) return;
            }
            if (label === "Contact Number" || label === "Overscrubbed") {
                if (isDefaultOrPlaceholderPhone(cleanText)) return;
            }

            if (label === "Overscrubbed") {
                // Must be at least 3 characters
                if (cleanText.length < 3) return;

                // Never label table headers or field labels as Overscrubbed
                if (isFieldLabelOrHeader(cleanText)) return;

                // User rule: "in mail it is crtly srubbed then it should not be marked"
                if (isInsideAnyEmail(cleanText, rightText)) return;

                // When the ORIGINAL was ordinary text ("Transfer" -> "Galeonorb"), the business / name guards below
                // must not apply: they guess from the synthetic replacement's position (e.g. first cell of a table
                // row next to a number looked like a vendor) and contradicted the diff.
                const fromOrdinary = __ptOrdinaryOrigins.has(cleanText);
                // User rule: "business is crtly scrubbed no need to mark as oversrubbed"
                if (!fromOrdinary) {
                    if (isTokenInCopyrightLine(cleanText, rightText) || isTokenInCopyrightLine(cleanText, leftText)) return;
                    if (isTokenInTableVendor(cleanText, rightText) || isTokenInTableVendor(cleanText, leftText)) return;
                    if (isTokenInBusinessContext(cleanText, rightText) || isTokenInBusinessContext(cleanText, leftText)) return;
                    if (isBusinessName(cleanText, "", "") || isBusinessName("", cleanText, "")) return;

                    // User rule: "jesus is person name" / scrubbed person names should not be marked as overscrubbed
                    if (isTokenInNameContext(cleanText, rightText) || isTokenInNameContext(cleanText, leftText)) return;

                    // User rule: "which undergo this labelled when it is changed r oversrub it should not be marked as oversrubed label"
                    // Never label changed/scrubbed PII or BII as Overscrubbed!
                    if (isChangedPiiOrBii(cleanText, leftText, rightText)) return;
                }

                // User rule: "here password is oversrub then it should not be labbeled"
                if (isTokenInPasswordContext(cleanText, rightText) || isTokenInPasswordContext(cleanText, leftText)) return;

                // User rule: "if this is present in url r link it should not be labelled at at utill the complete url r lunk is same from both side"
                if (isInsideChangedUrl(cleanText, leftText, rightText)) return;

                // Never label a full file/directory path as Overscrubbed
                // User rule: "dont show complete path show only oversrubed the partial thing only"
                if (cleanText.includes("/") || cleanText.includes("\\")) return;

                // Never label vector / path data or coordinates as Overscrubbed
                // User rule: "and path can be changed r no need to be labeled"
                if (isVectorOrPathData(cleanText, "")) return;
                if (/^[cMmLlHhVvSsQqTtAaZz0-9.,\s\-]+$/.test(cleanText) && /\d/.test(cleanText) && !/[a-zA-Z]{3,}/.test(cleanText)) return;
                if (/^\d+(?:\.\d+)?$/.test(cleanText)) return;

                // Never label a URL, link, domain name, footnote anchor, or partial URL as Overscrubbed
                if (isPartOfUrl(cleanText)) return;
                if (/^footnote(?:-\d+)?$/i.test(cleanText) || /^#?[a-z0-9_-]*footnote/i.test(cleanText)) return;

                // An overscrubbed substitution cannot exist in the original left document!
                if (lowerOf(leftText).includes(cleanText.toLowerCase())) return;

                const lowerClean = cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (lowerClean.length < 2 || STOP_WORDS.has(lowerClean)) return;

                if (cleanText.includes("@")) {
                    const escEmail = cleanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (new RegExp('(?:^|[^a-zA-Z0-9])' + escEmail + '(?=[^a-zA-Z0-9]|$)', 'i').test(narrowText(cleanText, leftText))) return;
                } else {
                    const words = cleanText.split(/[\s\/]+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
                    if (words.length === 0) return;
                    if (words.every(w => STOP_WORDS.has(w))) return;

                    // Single word check against leftText: an overscrubbed substitution cannot exist in the original left document!
                    if (words.length === 1) {
                        const escW = words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const inLeft = new RegExp('(?:^|[^a-zA-Z0-9])' + escW + '(?=[^a-zA-Z0-9]|$)', 'i').test(narrowText(words[0], leftText));
                        if (inLeft) return;
                    } else {
                        const escPhrase = cleanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        if (new RegExp('(?:^|[^a-zA-Z0-9])' + escPhrase + '(?=[^a-zA-Z0-9]|$)', 'i').test(narrowText(cleanText, leftText))) return;
                        const allWordsInLeft = words.every(w => {
                            const escW = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            return new RegExp('(?:^|[^a-zA-Z0-9])' + escW + '(?=[^a-zA-Z0-9]|$)', 'i').test(narrowText(w, leftText));
                        });
                        if (allWordsInLeft) return;
                    }
                }
            }

            const existing = targetMap.get(cleanText);
            if (!existing || priority > existing.priority) {
                targetMap.set(cleanText, { text: cleanText, label, cls, priority });
            }
        }

        // Step 1: Detect and Parse Numbered Tables (| S.N | Emp ID | Full Name | Department | Phone number |)
        const leftLines = leftText.split('\n');
        const rightLines = rightText.split('\n');

        const isNumberedTable = leftLines.some(l => /^\s*\|\s*\d+\s*\|/.test(l));
        if (isNumberedTable) {
            function parseNumberedTable(lines) {
                let headers = [];
                const rowsBySN = new Map();

                for (let i = 0; i < lines.length; i++) {
                    const trimmed = lines[i].trim();
                    if (!trimmed.startsWith("|")) continue;
                    const parts = trimmed.split("|").map(p => p.trim());
                    if (parts.length >= 2 && parts[0] === "") parts.shift();
                    if (parts.length >= 1 && parts[parts.length - 1] === "") parts.pop();
                    if (parts.length === 0) continue;

                    // Strictly require employee ID and employee name to treat as employee table
                    if (parts.some(p => /emp\s*id|employee\s*id/i.test(p)) && parts.some(p => /full\s*name|employee\s*name/i.test(p))) {
                        headers = parts.map(p => p.replace(/[*_]/g, "").trim());
                        continue;
                    }
                    if (/^\d+$/.test(parts[0])) {
                        const sn = parseInt(parts[0], 10);
                        rowsBySN.set(sn, parts);
                    }
                }
                return { headers, rowsBySN };
            }

            const leftTable = parseNumberedTable(leftLines);
            const rightTable = parseNumberedTable(rightLines);
            const headers = rightTable.headers.length > 0 ? rightTable.headers : leftTable.headers;
            const hasHeaders = headers.length > 0;

            // Helper: directly write to targetMap (bypasses leftText.includes guard).
            // Safe because same-left-right is enforced by lCell === rCell in each caller.
            function setTarget(text, label, cls, priority) {
                if (!text) return;
                const ct = cleanWord(text);
                if (ct.length < 2 || /^\d{1,3}$/.test(ct)) return;
                const ex = targetMap.get(ct);
                if (!ex || priority > ex.priority) {
                    targetMap.set(ct, { text: ct, label, cls, priority });
                }
            }

            // Loop-invariant: computed once instead of once per table cell (it scanned the whole left document each time).
            const isBillingDocLeft = /(?:bill|charge|amount|inr|rs|payable|fee|cost|total|non[- ]?payment|claimed|settled)/i.test(leftText);
            for (const [sn, rParts] of rightTable.rowsBySN.entries()) {
                const lParts = leftTable.rowsBySN.get(sn);

                for (let c = 0; c < rParts.length; c++) {
                    const rCell = rParts[c];
                    const lCell = lParts && c < lParts.length ? lParts[c] : "";
                    // Always skip missing cells and the S.N column (first column)
                    if (!rCell || c === 0) continue;

                    if (!hasHeaders) {
                        // -- NO HEADERS VISIBLE: positional + content heuristics --
                        const isBillingDoc = isBillingDocLeft;
                        if (!isBillingDoc && c === 1 && /^\d{5,9}$/.test(rCell)) {
                            const possibleName = rParts[2] || "";
                            if (possibleName && isPersonName(possibleName, "")) {
                                if (lCell && lCell === rCell) setTarget(rCell, "Credentials", "pt-credentials", 100);
                            }
                        } else if (isContactNumberFormat(rCell)) {
                            // Any column matching contact number format
                            if (lCell && lCell === rCell) setTarget(rCell, "Contact Number", "pt-contact", 100);
                        } else if (/^(?:[A-Z][a-zA-Z']*\.?\s+){1,5}[A-Z][a-zA-Z']*\.?$/.test(rCell)) {
                            // Multi-word capitalized -> Person Name (verified)
                            if (lCell && lCell === rCell && isPersonName(rCell, "")) setTarget(rCell, "Person Name", "pt-person", 90);
                        }
                        continue;
                    }

                    // -- HEADERS AVAILABLE: column-name-based logic --
                    const colName = (headers[c] || "").toLowerCase();
                    if (/s\.?n|serial|#|index/i.test(colName)) continue;

                    if (/emp\s*id|employee\s*id/i.test(colName)) {
                        if (lCell && (lCell === rCell || cleanWord(lCell) === cleanWord(rCell))) setTarget(rCell, "Credentials", "pt-credentials", 100);
                        continue;
                    }
                    if (/phone|mobile|contact|tel/i.test(colName)) {
                        if (lCell && (lCell === rCell || cleanWord(lCell) === cleanWord(rCell))) setTarget(rCell, "Contact Number", "pt-contact", 100);
                        continue;
                    }
                    if (/full\s*name|employee\s*name|patient\s*name/i.test(colName)) {
                        if (lCell && (lCell === rCell || cleanWord(lCell) === cleanWord(rCell))) setTarget(rCell, "Person Name", "pt-person", 90);
                        continue;
                    }
                    if (/dept|department|role|designation/i.test(colName)) {
                        if (lCell && lCell === rCell) continue;
                        const lWords = lCell.split(/\s+/);
                        const rWords = rCell.split(/\s+/);
                        for (const rw of rWords) {
                            if (rw && !lWords.includes(rw)) {
                                setTarget(rw, "Overscrubbed", "pt-overscrub", 90);
                            }
                        }
                        continue;
                    }
                }
            }
        }

        // Step 1B: Scan Markdown Tables for Unscrubbed Business Names (e.g. Cost, Service, Tool tables)
        for (let i = 0; i < rightLines.length; i++) {
            const rLine = rightLines[i].trim();
            if (!rLine.startsWith("|") || !rLine.endsWith("|")) continue;
            if (/^\|[\s\-:|]+\|$/.test(rLine)) continue;

            const rCells = rLine.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            if (rCells.length < 2) continue;

            const firstCell = rCells[0];
            if (!firstCell || firstCell.trim().length < 2) continue;
            if (isFieldLabelOrHeader(firstCell)) continue;

            const cleanName = firstCell.replace(/\s*\([^)]*\)/g, "").trim();
            const targetBizName = cleanName.length >= 2 ? cleanName : firstCell;
            if (targetBizName && targetBizName.length >= 2 && !/^\d+$/.test(targetBizName) && !isInfraOrServerTerm(targetBizName)) {
                // Rule: "if the bussiness name is only it should be labbelled"
                // Only label if identical in left document (unscrubbed business name)
                if (leftText.includes(targetBizName)) {
                    if (isBusinessName(targetBizName, targetBizName, rLine)) {
                        addTarget(targetBizName, "Business Name", "pt-business", 90);
                    }
                }
            }
        }

        // Step 1C: Scan Contract Clauses / Legal Definitions for Unscrubbed Business Names (e.g. referred to as "Brightpath", (d/b/a Brightpath))
        const contractBizRegex = /(?:referred\s+to\s+as|known\s+as|\bcalled\b)\s+["'*]*([A-Za-z0-9_\-.\s&]{2,40})["'*]*|\((?:aka|d\/b\/a|f\/k\/a|trading\s+as)\s+["'*]*([A-Z][A-Za-z0-9_\-.]{2,30})["'*]*\)/gi;
        let cbm;
        while ((cbm = contractBizRegex.exec(rightText)) !== null) {
            const rawCand = (cbm[1] || cbm[2] || "").trim();
            const cleanCand = cleanWord(rawCand);
            if (cleanCand && cleanCand.length >= 2 && !STOP_WORDS.has(cleanCand.toLowerCase()) && !isFieldLabelOrHeader(cleanCand) && !hasNonEntityWord(cleanCand)) {
                if (leftText.includes(cleanCand)) {
                    if (isBusinessName(cleanCand, cleanCand, rightText) || isTokenInBusinessContext(cleanCand, rightText)) {
                        addTarget(cleanCand, "Business Name", "pt-business", 90);
                    }
                }
            }
        }

        // Step 1D: Direct Scan for Known Business Names & Corporate Entities identical in BOTH left and right documents
        // Catches auto brands (Maruti, Hyundai, Tata, Jeep, Nissan, Volkswagen), OEMs (Kubota), platforms, etc. across all doc types
        for (const bName of KNOWN_BUSINESS_NAMES) {
            if (bName.length < 3) continue;
            // (v11.3.2) not inside a hyphenated identifier either ("github-pages", "aws-sdk")
            const bRegex = new RegExp('(?:^|[^a-zA-Z0-9_\\-])(' + bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=[^a-zA-Z0-9_\\-]|$)', 'gi');
            let bm;
            while ((bm = bRegex.exec(rightText)) !== null) {
                const matchWord = bm[1];
                const at = bm.index + bm[0].length - matchWord.length;
                // A brand used as a field label ("GitHub: https://...") or inside a URL / e-mail / path is not a Business Name.
                if (/^\s*:/.test(rightText.slice(at + matchWord.length, at + matchWord.length + 3))) continue;
                if (/(?:\/\/|[./@])$/.test(rightText.slice(Math.max(0, at - 2), at)) || /^[./@]\w/.test(rightText.slice(at + matchWord.length, at + matchWord.length + 2))) continue;
                // (v11.1.0) a brand used as the first word of a PRODUCT name ("Microsoft Office", "Google Ad Words",
                // "Adobe Photoshop") is the product, not the company; a corporate suffix after it is still the company.
                {
                    const nextWord = (/^[ \t]+([A-Z][A-Za-z0-9+]*)/.exec(rightText.slice(at + matchWord.length, at + matchWord.length + 40)) || [])[1];
                    if (nextWord && !/^(?:Pvt|Private|Ltd|Limited|Inc|Corp|Corporation|LLC|LLP|PLC|Group|Technologies|Solutions|Services|Consultancy|Systems|Labs|Software|Networks|Ventures|Partners|Industries|Enterprises|Holdings|Motors|Foods|Retail|India|Global|International|Co)\b/.test(nextWord)) continue;
                }
                if (!hasNonEntityWord(matchWord) && !isFieldLabelOrHeader(matchWord)) {
                    if (lowerOf(leftText).includes(bName.toLowerCase())) {
                        addTarget(matchWord, "Business Name", "pt-business", 90);
                    }
                }
            }
        }
        // Direct scan for corporate entity phrases ending in corporate suffixes (e.g. "Mama Motors", "Olivier Technologies Pvt Ltd")
        const corpNameRegex = /\b[A-Z][a-zA-Z0-9_\-&']*(?:[ \t]+(?:&|[A-Z][a-zA-Z0-9_\-&']*)){0,3}[ \t]+(?:Technologies|Solutions|Motors|Pvt\.?|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|LLC|LLP|PLC|Enterprises|Industries|Holdings|Systems|Studios|Consulting|Consultancy[ \t]+Services|Services|Hospital|Logistics|Insurance|Labs|Software|Networks|Traders|Pharmaceuticals|Pharma|Ventures|Partners|Associates)\b(?:[ \t]+(?:Pvt\.?|Private)[ \t]+(?:Ltd\.?|Limited))?(?:[ \t]+(?:Ltd\.?|Limited))?/g;
        let cnm;
        while ((cnm = corpNameRegex.exec(rightText)) !== null) {
            // (v11.2.0) greetings / determiners before a company are not part of its name ("Hi Silverline Labs")
            const rawCorp = cnm[0].trim().replace(/^(?:(?:Hi|Hello|Hey|Dear|Thanks|The|Our|Your|At|From|With|By|To|For|And)[ \t]+)+/, "");
            if (!/\s/.test(rawCorp)) continue;
            const SUFFIX_WORDS = /^(?:technologies|solutions|motors|pvt\.?|private|ltd\.?|limited|inc\.?|corp\.?|corporation|llc|llp|plc|enterprises|industries|holdings|systems|studios|consulting|consultancy|services|hospital|logistics|insurance|labs|software|networks|traders|pharmaceuticals|pharma|ventures|partners|associates|analytics)$/i;
            const nameWords = rawCorp.split(/\s+/).filter(w => !SUFFIX_WORDS.test(w));
            // "Senior Data Services" / "Our Partners" are not companies: one name word must be distinctive.
            // (v11.2.0) ...unless the suffix is a legal form ("Pinnacle Inc", "Evergreen Agro Pvt Ltd") or the line says it is a
            // company ("Vendor: Pinnacle Networks", "Offer letter from Pinnacle Software", "works at ...").
            if (!nameWords.some(w => !isCommonWord(w) || KNOWN_BUSINESS_NAMES.has(w.toLowerCase()))) {
                const legal = /\b(?:Pvt|Private|Ltd|Limited|Inc|Corp|Corporation|LLC|LLP|PLC)\b/.test(rawCorp);
                const at = rightText.indexOf(rawCorp);
                const lineEnd = at < 0 ? -1 : rightText.indexOf("\n", at);
                const ctxLine = at < 0 ? "" : rightText.slice(Math.max(0, rightText.lastIndexOf("\n", Math.max(0, rightText.lastIndexOf("\n", at) - 1))), lineEnd < 0 ? rightText.length : lineEnd);   // this line and the one above ("Bill To")
                const bizCtx = /\b(?:vendor|client|customer|company|employer|organi[sz]ation|partner|supplier|works?\s+(?:at|for)|worked\s+(?:at|for)|joined|previously\s+at|offer\s+letter\s+from|invoice\s+from|payment\s+(?:received\s+)?from|bill\s+to|signed|contract\s+with)\b/i.test(ctxLine);
                if (!legal && !bizCtx) continue;
                if (nameWords.length === 0 || /^(?:our|the|your|senior|junior|data|business|general|internal|head|local)$/i.test(nameWords[0])) continue;
            }
            // The suffix words themselves ("Services", "Systems") are generic; judge only the name part.
            if (!isFieldLabelOrHeader(rawCorp) && !hasNonEntityWord(nameWords.join(" "))) {
                if (leftText.includes(rawCorp)) {
                    addTarget(rawCorp, "Business Name", "pt-business", 91, true);
                }
            }
        }

        function windowAround(text, token) {
            const i = token ? text.indexOf(token) : -1;
            if (i < 0) return text.slice(0, 2 * LONG_LINE_WINDOW);
            return text.slice(Math.max(0, i - LONG_LINE_WINDOW), Math.min(text.length, i + token.length + LONG_LINE_WINDOW));
        }

        function lineContaining(token, text) {
            text = narrowText((token || "").trim(), text);
            const occ = occurrencesOf((token || "").trim(), text);
            if (occ.length === 0) return "";
            const i = occ[0];
            const s = text.lastIndexOf("\n", i) + 1;
            const e = text.indexOf("\n", i);
            return text.slice(s, e === -1 ? text.length : e);
        }

        // A word next to a replaced part of a name, kept identical on both sides ("Aditi" in "Aditi Shah" ->
        // "Aditi Wrethavex", "Sharma" in "Rahul Sharma" -> "Velmo Sharma"). Returns the kept word or null.
        function keptNamePart(diff, leftText, rightText) {
            const o = cleanWord(diff.original || ""), ch = cleanWord(diff.changed || "");
            if (!/^[A-Z][a-z'\-]{1,}$/.test(o) || !/^[A-Z][a-z'\-]{2,}$/.test(ch) || o === ch) return null;
            if (isCommonWord(ch) && !isCommonWord(o)) return null;                  // replaced BY a real word: not a name swap
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const lL = lineContaining(o, leftText), lR = lineContaining(ch, rightText);
            const before = (line, w) => (new RegExp("(?:^|[^\\p{L}])([A-Z][a-z'\\-]+)[ \\t]+" + esc(w) + "(?![\\p{L}])", "u").exec(line) || [])[1];
            const after = (line, w) => (new RegExp("(?:^|[^\\p{L}])" + esc(w) + "[ \\t]+([A-Z][a-z'\\-]+)(?![\\p{L}])", "u").exec(line) || [])[1];
            for (const [a, b] of [[before(lL, o), before(lR, ch)], [after(lL, o), after(lR, ch)]]) {
                if (!a || a !== b || isHonorific(a)) continue;
                // (v11.2.0) a greeting or other short function word next to the name is not part of it ("Hi Priya Khan")
                if (/^(?:hi|hello|hey|dear|thanks|thank|regards|cc|to|from|with|by|and|or|for|at|the|a|an|on|in|of|via|per)$/i.test(a) || a.length < 3) continue;
                const aKnown = KNOWN_GIVEN_NAMES.has(a.toLowerCase()), oKnown = KNOWN_GIVEN_NAMES.has(o.toLowerCase());
                if (!(aKnown || oKnown)) continue;                                    // one half must be a known name
                if (isCalendarWord(a) || PLACES.has(a.toLowerCase()) || isLanguageWord(a) || KNOWN_BUSINESS_NAMES.has(a.toLowerCase())) continue;
                if (!aKnown && isCommonWord(a)) continue;                            // "The Shah" etc.
                return a;
            }
            return null;
        }
        function containsKnownBusiness(s) {
            const t = (s || "").toLowerCase();
            if (!t) return false;
            if (KNOWN_BUSINESS_NAMES.has(t)) return true;
            const ws = t.split(/\s+/);
            for (let n = Math.min(4, ws.length); n >= 1; n--) for (let i = 0; i + n <= ws.length; i++) if (KNOWN_BUSINESS_NAMES.has(ws.slice(i, i + n).join(" ")) && (n > 1 || ws[i].length > 3)) return true;
            return false;
        }
        // Words of a replacement that is CORRECT redaction (company, address, credential, reference code):
        // remembered so the mistake check can flag a reviewer's Overscrubbed label on them.
        function markRedacted(diff) { for (const w of cleanWord(diff.changed || "").split(/[\s\-_/.,:;]+/)) if (w) __ptScrubbedNameWords.add(w); }
        function processDiffs(diffs, docContext) {
            // Rule: "and path can be changed r no need to be labeled"
            if (isVectorOrPathData("", docContext)) return;

            for (const diff of diffs) {
                // (v11.4.4) A value replaced by something of another kind is Overscrubbed: a number, phone, e-mail or link
                // replaced by a plain word ("Order 12345" -> "Order hello"). The same kind ("12345" -> "00000",
                // "Hemant" -> "Alex", one e-mail for another) is correct redaction and is judged below as before.
                {
                    const o = cleanWord(diff.original || ""), ch = cleanWord(diff.changed || "");
                    const kindOf = (x) => isEmailAddressFormat(x) || /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(x) ? "email" : /^https?:\/\//i.test(x) ? "url" :
                        (phoneLabelFor(x) || isContactNumberFormat(x)) ? "phone" : /^\d(?:[\d\s.,\/:-]*\d)?$/.test(x) ? "number" :
                        /^[A-Za-z][A-Za-z'\-]*$/.test(x) ? "word" : "other";
                    if (o && ch && /^(?:email|url|phone|number)$/.test(kindOf(o)) && kindOf(ch) === "word" && ch.length >= 2 &&
                        !isDateFormat(o) && !new RegExp("(?:^|[^A-Za-z])" + ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z])", "i").test(leftText)) {
                        addTarget(ch, "Overscrubbed", "pt-overscrub", 66);
                        continue;
                    }
                }
                // (v11.3.4) a dotted / underscored person handle replaced by another ("kartik.nayyar" -> "Jordan.Miller",
                // "Rahul.chaturvedi" -> "Morgan.Bennett"): a scrubbed name, never Overscrubbed
                {
                    const o = cleanWord(diff.original || "").replace(/\*/g, ""), ch = cleanWord(diff.changed || "").replace(/\*/g, "");
                    const handle = /^[A-Za-z]{2,}[._][A-Za-z]{2,}$/;
                    // (v11.4.4) ...but "calculate_total" -> "calculate_zelvor" is a code name: the part both sides share is an ordinary word
                    const op = o.split(/[._]/), cp = ch.split(/[._]/);
                    const sharesOrdinary = op.some(w => cp.some(x => x.toLowerCase() === w.toLowerCase()) && isCommonWord(w.toLowerCase()) && !couldBeName(w));
                    if (!sharesOrdinary && handle.test(o) && handle.test(ch) && /[a-z]/.test(o) && /[a-z]/.test(ch)) {   // not CONSTANT_NAMES
                        const nameish = (s) => s.split(/[._]/).some(w => couldBeName(w)) || s.split(/[._]/).every(w => !isCommonWord(w.toLowerCase()));
                        if (nameish(o) || nameish(ch)) { for (const w of ch.split(/[._]/).concat([ch])) __ptScrubbedNameWords.add(w); continue; }
                    }
                }
                // (v11.2.0) Pure insertion (nothing on the left was replaced, usually an alignment artefact around a
                // repeated word such as a shared surname): there is no original to judge, so never Overscrubbed.
                if (!String(diff.original || "").trim() && !/^\s*$/.test(String(diff.changed || ""))) {
                    if (/^[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+){2,}$/.test(String(diff.changed).trim())) { for (const w of String(diff.changed).trim().split(/\s+/)) __ptScrubbedNameWords.add(w); continue; }
                }
                // The global (whole-document) pass has no line context of its own. Without one, every context guard
                // (password lines, DOB fields, name fields) was skipped, so use the line the diff actually sits on.
                let fullContext = docContext || lineContaining(diff.original, leftText) || lineContaining(diff.changed, rightText);
                // A single 500 KB line (minified JSON) is not useful context; use the text around the diff.
                if (fullContext.length > LONG_LINE_CHARS) fullContext = windowAround(fullContext, diff.original || diff.changed);
                // Skip internal IDs, node_id, and login diffs completely
                // Rule: "this r not person username the value of node id r just id this things if it changed to other form r not changed also no issue no need to label it anything"
                // Only skip when the changed value itself sits behind an id / login key. (It used to skip every diff on
                // any line that contained an "id" key anywhere, which disabled detection for whole JSON documents.)
                const isIdDiff = isIdOrLoginInDoc(diff.changed, rightText) || isIdOrLoginInDoc(diff.original, leftText);
                if (isIdDiff) continue;
                // Inside a table name column (Step 1E): a scrubbed name, never Overscrubbed.
                if (__ptNameCellWords.size && (__ptNameCellWords.has(cleanWord(diff.original)) || __ptNameCellWords.has(cleanWord(diff.changed)))) continue;

                // The ORIGINAL decides: when it is ordinary text ("Chance R", "Kickoff"), the changed side's look
                // (often a synthetic name) must not suppress Overscrubbed.
                // (v11.1.0) Half of a person's name replaced ("Aditi Shah" -> "Aditi Wrethavex"): the replaced part is a
                // scrubbed name (no label, even when it is also a dictionary word like Shah / Khan / Rose) and the part
                // that was kept is a Person Name.
                {
                    const kept = keptNamePart(diff, leftText, rightText);
                    if (kept) {
                        for (const w of cleanWord(diff.changed).split(/\s+/)) if (w) __ptScrubbedNameWords.add(w);
                        addTarget(kept, "Person Name", "pt-person", 86);
                        continue;
                    }
                }
                // (v11.1.0) A company name is never "ordinary text", even when its words are dictionary words
                // ("Tata Consultancy Services", "Asian Paints").
                const origIsCompany = isBusinessName(diff.original, diff.changed, fullContext) || containsKnownBusiness(cleanWord(diff.original)) ||
                    isInCorporateName(cleanWord(diff.original), lineContaining(cleanWord(diff.original), leftText)) ||
                    isInCorporateName(cleanWord(diff.changed), lineContaining(cleanWord(diff.changed), rightText));
                // (v11.1.0) "Hi Harsh," -> "Hi Quimolith,": a capitalised word right after a greeting is a name.
                {
                    const o = cleanWord(diff.original);
                    const gl = lineContaining(o, leftText);
                    if (/^[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+){0,2}$/.test(o) && !isCommonWord(cleanWord(diff.changed)) &&
                        new RegExp("(?:^|[\\s>])(?:hi|hello|hey|dear|thanks|thank\\s+you|regards|cc)[,!\\s]+" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}])", "iu").test(gl) &&
                        !/^(?:team|all|everyone|sir|madam|ma'am|guys|folks|there|friends|colleagues|customer|user|both|again)$/i.test(o) &&
                        !(isOrdinaryPhrase(o) && !o.split(/\s+/).some(couldBeName))) {
                        for (const w of cleanWord(diff.changed).split(/\s+/)) if (w) __ptScrubbedNameWords.add(w);
                        continue;
                    }
                }
                const origOrdinary = !origIsCompany && isOrdinaryPhrase(cleanWord(diff.original)) &&
                    (!isTokenInNameField(cleanWord(diff.original), leftText) || !cleanWord(diff.original).split(/\s+/).some(couldBeName));
                if (origIsCompany && !isOrdinaryPhrase(cleanWord(diff.changed))) { markRedacted(diff); continue; }   // a scrubbed company: correct redaction
                // User rule: "here the bussiness name r changed to other form its correct it should not be labelled at all"
                if (!origOrdinary && isBusinessName(diff.changed, diff.original, fullContext) || isBusinessName(diff.original, diff.changed, fullContext) ||
                    isTokenInBusinessContext(cleanWord(diff.changed), rightText) || isTokenInBusinessContext(cleanWord(diff.original), leftText) ||
                    KNOWN_BUSINESS_NAMES.has((diff.original || "").toLowerCase().trim()) || KNOWN_BUSINESS_NAMES.has((diff.changed || "").toLowerCase().trim())) { markRedacted(diff); continue; }

                // User rule: "jesus is person name" / scrubbed person names should not be marked as overscrubbed
                if (!origOrdinary && (isPersonName(diff.original, fullContext) || isPersonName(diff.changed, fullContext) ||
                    isTokenInNameContext(cleanWord(diff.original), leftText) || isTokenInNameContext(cleanWord(diff.changed), rightText))) {
                    for (const w of cleanWord(diff.changed).split(/\s+/)) if (w) __ptScrubbedNameWords.add(w);
                    continue;
                }

                // A scrubbed proper noun ("Furkan" -> "Arcorahale", "Roni S" -> "Galonbryea S") is a correctly
                // redacted name or brand: no label at all. Remember the line shape so unchanged siblings
                // ("# Joaquim" on the next slide) can be recognised as names too.
                const origClean = cleanWord(diff.original);
                if (looksLikeProperNounPhrase(origClean)) {
                    rememberScrubbedNameShape(origClean, leftText);
                    for (const w of cleanWord(diff.changed).split(/\s+/)) if (w) __ptScrubbedNameWords.add(w);
                    continue;
                }
                // A scrubbed address ("Plot no. 13, Near Shanti Mandir, ..." -> "937 Garnthwaite Road") is correct
                // redaction: no label at all (not Address, not Overscrubbed).
                if (looksLikeAddressPart(diff.original) || looksLikeAddressPart(diff.changed) ||
                    isInAddressBlock(cleanWord(diff.original), leftText) || isInAddressBlock(cleanWord(diff.changed), rightText)) { markRedacted(diff); continue; }
                // A changed reference code (GSTIN, invoice / order ID) was correctly scrubbed: no label.
                if (looksLikeIdCode(cleanWord(diff.original)) && looksLikeIdCode(cleanWord(diff.changed))) { markRedacted(diff); continue; }
                // A changed value on a credential line ("Password - x", "PAN: y") was correctly scrubbed: no label.
                if (isOnCredentialValue(diff.changed, rightText) || isOnCredentialValue(diff.original, leftText)) { markRedacted(diff); continue; }

                // (v11.4.4) A code name with one part changed ("calculate_total" -> "calculate_zelvor", "OrderService" ->
                // "QuarvinService", "maxRetryCount" -> "maxZelvoCount"): when the parts both sides share are ordinary words,
                // each changed part replaced an ordinary word -> Overscrubbed, that part only. A joined-up name
                // ("OrlaKestrelbrook" -> "ZelvaQuornfield") shares no part and is judged as before.
                {
                    const splitId = (x) => x.split(/[_.-]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
                    const o = cleanWord(diff.original || ""), ch = cleanWord(diff.changed || "");
                    if (/^[A-Za-z][A-Za-z0-9_.-]*$/.test(o) && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(ch) && o !== ch) {
                        const op = splitId(o), cp = splitId(ch);
                        if (op.length >= 2 && op.length === cp.length) {
                            const same = op.map((w, i) => w.toLowerCase() === cp[i].toLowerCase());
                            const kept = op.filter((w, i) => same[i]);
                            if (kept.length && kept.every(w => isCommonWord(w.toLowerCase()) && !couldBeName(w))) {
                                let any = false;
                                for (let i = 0; i < op.length; i++) {
                                    if (!same[i] && isCommonWord(op[i].toLowerCase()) && !couldBeName(op[i]) && cp[i].length >= 2) { addTarget(cp[i], "Overscrubbed", "pt-overscrub", 65); any = true; }
                                }
                                if (any) continue;
                            }
                        }
                    }
                }

                const cl = classifyDiff(diff.original, diff.changed, fullContext);
                if (cl && cl.label === "Overscrubbed" && origOrdinaryForOverscrub(diff.original)) {
                    for (const w of cleanWord(diff.changed).split(/[\s\-_\/.:]+/)) if (w) __ptOrdinaryOrigins.add(cleanWord(w));
                    __ptOrdinaryOrigins.add(cleanWord(diff.changed));
                }

                if (cl && cl.label === "Overscrubbed") {
                    const changed = diff.changed || "";
                    const original = diff.original || "";

                    // Find common prefix and suffix to isolate ONLY the partial changed/overscrubbed portion
                    // Rule: "dont show full word as annotation show thar partial which is oversrubed only"
                    let pLen = 0;
                    while (pLen < original.length && pLen < changed.length && original[pLen] === changed[pLen]) {
                        pLen++;
                    }
                    let sLen = 0;
                    while (sLen < (original.length - pLen) && sLen < (changed.length - pLen) && 
                           original[original.length - 1 - sLen] === changed[changed.length - 1 - sLen]) {
                        sLen++;
                    }

                    let prefix = changed.slice(0, pLen);
                    let suffix = changed.slice(changed.length - sLen);

                    // Delimiter boundary snap: the kept prefix / suffix must end / start at a word boundary of the changed text:
                    // a delimiter ( - _ / . : @ space brackets , ; ) or (v11.4.4) a camelCase step ("getUser|Velmora", "Quarvin|Service").
                    const DELIM = /[\-_/\.:@\s()\[\]{},;]/;
                    const camelAt = (str, i) => i > 0 && i < str.length && /[a-z0-9]/.test(str[i - 1]) && /[A-Z]/.test(str[i]);
                    const boundaryAt = (str, i) => i <= 0 || i >= str.length || DELIM.test(str[i - 1]) || DELIM.test(str[i]) || camelAt(str, i);
                    while (sLen > 0 && !boundaryAt(changed, changed.length - sLen)) sLen--;
                    while (pLen > 0 && !boundaryAt(changed, pLen)) pLen--;

                    prefix = changed.slice(0, pLen);
                    suffix = changed.slice(changed.length - sLen);
                    let mid = changed.slice(pLen, changed.length - sLen);

                    const cleanMid = cleanWord(mid);
                    if (cleanMid && cleanMid.length >= 2) {
                        const words = cleanMid.split(/\s+/).filter(Boolean);
                        if (words.length > 1) {
                            // Multi-word diff: ONLY add individual synthetic words, NEVER the full sentence
                            for (const w of words) {
                                const cw = cleanWord(w);
                                if (cw.length >= 2 && !lowerOf(leftText).includes(cw.toLowerCase())) {
                                    addTarget(cw, "Overscrubbed", "pt-overscrub", 65);
                                }
                            }
                        } else {
                            // Single token: if it contains hyphens/slashes where parts exist in leftText, isolate sub-parts
                            if (cleanMid.includes("/") || cleanMid.includes("\\")) {
                                const subParts = cleanMid.split(/[\/\\]+/).filter(Boolean);
                                for (const sp of subParts) {
                                    const csp = cleanWord(sp);
                                    if (csp.length >= 2 && !lowerOf(leftText).includes(csp.toLowerCase())) {
                                        addTarget(csp, "Overscrubbed", "pt-overscrub", 65);
                                    }
                                }
                            } else {
                                if (!lowerOf(leftText).includes(cleanMid.toLowerCase())) {
                                    addTarget(cleanMid, "Overscrubbed", "pt-overscrub", 65);
                                }
                            }
                        }
                    }
                } else if (cl && cl.label) {
                    addTarget(diff.changed, cl.label, cl.cls, 60);
                }

                // Sub-word loop: when cl is null (non-name, non-business diff), process individual words for specific formats (e.g. phones, dates)
                const origWords = (diff.original || "").split(/\s+/).filter(w => w.length >= 2);
                const chgWords = (diff.changed || "").split(/\s+/).filter(w => w.length >= 2);
                const isNameContext = looksLikeHumanName(diff.changed) || looksLikeHumanName(diff.original) ||
                                      /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(diff.original) ||
                                      isPersonName(diff.original, fullContext) || isPersonName(diff.changed, fullContext) ||
                                      isTokenInNameContext(cleanWord(diff.original), leftText) || isTokenInNameContext(cleanWord(diff.changed), rightText) ||
                                      /(?:(?:full|employee|candidate|patient|applicant|customer|lead|client)\s*name)\b|(?:\b(?:author|committer|applicant|assignee|owner)\s*[:=])/i.test(fullContext);
                const isBizContext = isBusinessName(diff.changed, diff.original, fullContext) ||
                                     /(?:item|vendor|service|cost|pricing|bill)/i.test(fullContext);
                const isDateDiff = isDateFormat(diff.original) || isDateFormat(diff.changed) ||
                                   /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(diff.original) ||
                                   /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(diff.changed);
                const isUrlDiff = isWebUrl(diff.original) || isWebUrl(diff.changed);
                const isCredDiff = isPasswordOrCredentialContext(fullContext) || isPasswordOrCredentialContext(diff.original) || isPasswordOrCredentialContext(diff.changed);
                if (cl === null && chgWords.length > 1 && !isNameContext && !isBizContext && !isDateDiff && !isUrlDiff && !isCredDiff && !diff.original.includes('|') && !diff.changed.includes('|')) {
                    for (let wIdx = 0; wIdx < chgWords.length; wIdx++) {
                        const cw = cleanWord(chgWords[wIdx]);
                        const ow = wIdx < origWords.length ? cleanWord(origWords[wIdx]) : "";
                        if (ow && looksLikeProperNounPhrase(ow)) continue;
                        if (cw && cw.length >= 2 && !/^\d+$/.test(cw)) {
                            const subCl = classifyDiff(ow, cw, fullContext);
                            if (subCl && subCl.label) {
                                addTarget(cw, subCl.label, subCl.cls, 58);
                            }
                        }
                    }
                }
            }
        }

        // Step 1E (v10.5.2): NAME COLUMNS in pipe tables (support-ticket / CRM exports).
        // Rows are paired by their first cell (ticket id). A column in which several rows had a name-like value
        // replaced ("DINESH RAM" -> "TAVOVANDO VELERIS", "suganya g" -> "taverwyniel g") is a name column:
        //   - changed values in it are scrubbed names -> no label (never Overscrubbed);
        //   - unchanged values in it ("kalaivani", "bourniya.j") are names -> Person Name;
        //   - partly changed values keep their unchanged words as Person Name ("purav mallick" -> "purav ...").
        {
            const cellsOf = (line) => { const t = line.trim(); if (!t.startsWith("|")) return null; const cs = t.split("|").map(x => x.trim()); cs.shift(); if (cs.length && cs[cs.length - 1] === "") cs.pop(); return cs.length >= 3 ? cs : null; };
            const leftRows = new Map();
            for (const ln of leftLines) { const cs = cellsOf(ln); if (cs && cs[0]) leftRows.set(cs[0], cs); }
            const pairs = [];
            for (const ln of rightLines) { const cs = cellsOf(ln); if (cs && cs[0] && leftRows.has(cs[0])) pairs.push([leftRows.get(cs[0]), cs]); }
            const NAMEISH = /^[\p{L}][\p{L}.'\- ]{1,40}$/u;
            const isEmptyCell = (v) => !v || /^(?:nan|null|none|n\/a|na|-+)$/i.test(v);
            const nameLike = (v) => NAMEISH.test(v) && v.split(/\s+/).length <= 4 && !isOrdinaryPhrase(v.replace(/[.\-]/g, " ").trim());
            if (pairs.length >= 3) {
                const cols = Math.max(...pairs.map(([a, b]) => Math.min(a.length, b.length)));
                for (let ci = 1; ci < cols; ci++) {
                    let scrubbed = 0, filled = 0;
                    for (const [a, b] of pairs) {
                        const lv = a[ci] || "", rv = b[ci] || "";
                        if (isEmptyCell(lv)) continue;
                        filled++;
                        if (lv !== rv && nameLike(lv) && nameLike(rv)) scrubbed++;
                    }
                    if (scrubbed < 2 || scrubbed < 0.25 * filled) continue;
                    for (const [a, b] of pairs) {
                        const lv = a[ci] || "", rv = b[ci] || "";
                        if (isEmptyCell(lv) || isEmptyCell(rv) || !nameLike(lv)) continue;
                        if (lv === rv) { addTarget(rv, "Person Name", "pt-person", 88, true); continue; }
                        __ptNameCellWords.add(lv); __ptNameCellWords.add(rv);
                        for (const w of lv.split(/\s+/)) __ptNameCellWords.add(w);
                        for (const w of rv.split(/\s+/)) __ptNameCellWords.add(w);
                        const lw = lv.split(/\s+/), rw = rv.split(/\s+/);
                        for (let k = 0; k < Math.min(lw.length, rw.length); k++) {
                            if (lw[k] === rw[k] && lw[k].length >= 3 && !isHonorific(lw[k]) && !isOrdinaryPhrase(lw[k])) addTarget(rw[k], "Person Name", "pt-person", 87, true);
                        }
                    }
                }
            }
        }

        // Step 1F (v11.1.0): NAME COLUMNS by HEADER in pipe and CSV tables ("full_name", "Name", "Student",
        // "Employee", "Customer", "Agent" ...). An unchanged value in such a column is a Person Name; a changed one is a
        // scrubbed name (no label).
        {
            const NAME_HDR = /^(?:full[\s_]*name|name|first[\s_]*name|last[\s_]*name|student(?:[\s_]*name)?|employee(?:[\s_]*name)?|customer(?:[\s_]*name)?|candidate(?:[\s_]*name)?|patient(?:[\s_]*name)?|agent(?:[\s_]*name)?|author|assignee|owner|reporter|manager|contact(?:[\s_]*person)?|user[\s_]*name|member|participant|attendee|teacher|mentor|parent(?:[\s_]*name)?)$/i;
            const splitRow = (line, sep) => {
                const t = line.trim();
                if (sep === "|") { if (!t.startsWith("|")) return null; const cs = t.split("|").map(x => x.trim()); cs.shift(); if (cs.length && cs[cs.length - 1] === "") cs.pop(); return cs.length >= 2 ? cs : null; }
                if (t.includes("|") || !t.includes(",")) return null;
                const cs = t.split(",").map(x => x.trim()); return cs.length >= 3 ? cs : null;
            };
            for (const sep of ["|", ","]) {
                let header = null, li = 0;
                const lRows = new Map();   // first cell -> cells (left)
                for (const ln of leftLines) { const cs = splitRow(ln, sep); if (cs && cs[0]) lRows.set(cs[0], cs); }
                for (const ln of rightLines) {
                    const cs = splitRow(ln, sep);
                    if (!cs) { header = null; continue; }
                    if (!header) { header = cs; continue; }                      // first row of a table block = header
                    if (cs.every(x => /^:?-{2,}:?$/.test(x))) continue;           // markdown separator row
                    const lc = lRows.get(cs[0]) || (leftLines[li] && splitRow(leftLines[li], sep));
                    for (let ci = 0; ci < header.length && ci < cs.length; ci++) {
                        if (!NAME_HDR.test(header[ci].replace(/[*`]/g, ""))) continue;
                        const v = cs[ci];
                        if (!v || /^(?:nan|null|none|n\/a|na|-+)$/i.test(v) || !/^[\p{L}][\p{L}.'\- ]{1,40}$/u.test(v) || v.split(/\s+/).length > 4) continue;
                        if (isOrdinaryPhrase(v) || isLanguageWord(v) || PLACES.has(v.toLowerCase())) continue;
                        const lv = lc && lc[ci];
                        // (v11.2.0) the left value was an ordinary word that is never a name ("Team", "Manager"): replacing it
                        // is overscrubbing, not a scrubbed name
                        if (lv && lv !== v && isOrdinaryPhrase(lv) && !lv.split(/\s+/).some(couldBeName)) continue;
                        if (lv === v || (leftText.includes(v) && !lc)) addTarget(v, "Person Name", "pt-person", 88, true);
                        else if (lv && lv !== v) {
                            const lw = lv.split(/\s+/), rw = v.split(/\s+/);
                            // kept part of a partly replaced name ("Asha Sinha" -> "Asha Lysdaldren") -> Person Name
                            for (let k = 0; k < Math.min(lw.length, rw.length); k++) {
                                if (lw[k] === rw[k] && /^[A-Z][a-z'\-]+$|^[a-z]{3,}$/.test(rw[k]) && !isHonorific(rw[k]) && !isCalendarWord(rw[k]) && !PLACES.has(rw[k].toLowerCase())) addTarget(rw[k], "Person Name", "pt-person", 87, true);
                                else { __ptNameCellWords.add(rw[k]); __ptNameCellWords.add(lw[k]); }
                            }
                            __ptNameCellWords.add(v); __ptNameCellWords.add(lv);
                        }
                    }
                    li++;
                }
            }
        }

        // Step 2A: Global Document Token-Level LCS (handles cross-line wraps, PDF formatting, missing contents)
        const lCleanText = leftText.split('\n').filter(l => !/^(?:Reference|Annotat|left\.|right\.)/i.test(l.trim())).join('\n');
        const rCleanText = rightText.split('\n').filter(l => !/^(?:Reference|Annotat|left\.|right\.)/i.test(l.trim())).join('\n');
        const lFullTokens = lCleanText.match(/[a-zA-Z0-9_\-\.\/@]+|[^\s]/g) || [];
        const rFullTokens = rCleanText.match(/[a-zA-Z0-9_\-\.\/@]+|[^\s]/g) || [];
        if (lFullTokens.length <= 5000 && rFullTokens.length <= 5000) {
            const globalDiffs = diffTokensGlobalLCS(lFullTokens, rFullTokens);
            processDiffs(globalDiffs, "");
        }

        // Step 2B: Line-Level LCS Alignment + Word-Level LCS Diffing
        const alignedPairs = alignLinesLCS(leftLines, rightLines);
        for (const pair of alignedPairs) {
            // Equal lines require ZERO annotations!
            if (pair.equal || !pair.left || !pair.right) continue;
            // Skip header markers
            if (/^(left\.|right\.|Reference|Annotat)/i.test(pair.left) || /^(left\.|right\.|Reference|Annotat)/i.test(pair.right)) continue;

            const lTokens = pair.left.match(/[a-zA-Z0-9_\-\.\/@]+|[^\s]/g) || [];
            const rTokens = pair.right.match(/[a-zA-Z0-9_\-\.\/@]+|[^\s]/g) || [];
            if (lTokens.length === 0 || rTokens.length === 0) continue;

            const diffs = diffTokensLCS(lTokens, rTokens);
            processDiffs(diffs, pair.left);
        }

        // Step 3: Direct Scan for 10-Digit Contact Numbers identical in BOTH left and right documents
        // (v10.5.1) also "+91 98450 12345", "98450-12345", "+91-9845012345", landlines "080-2345 6789".
        // (v11.4.0) Every phone shape (other countries, landlines, toll-free) is found, and gets Indian Mobile Number or
        // International Phone Number. A bare run of digits is a phone only right after a phone word ("Phone:", "Fax", "Tel").
        {
            const PHONE_CAND = /(?<![\w+@\/.-])(?:\+[ \t]?\(?\d{1,4}\)?|\(\+?\d{1,4}\)|\d)(?:[ \t.-]?\(?\d{1,5}\)?){1,7}(?![\w@\/]|[.-]\d)/g;
            const PHONE_WORD = /\b(?:phone|ph|tel|telephone|mob|mobile|cell|fax|whatsapp|wa|hp|contact(?:\s*(?:no|number))?|call|landline)\b\.?\s*(?:no\.?|number|#)?\s*["']?\s*[:=\-]?\s*["']?\s*$/i;
            let pm;
            while ((pm = PHONE_CAND.exec(rightText)) !== null) {
                let cand = pm[0].trim();
                let lab = phoneLabelFor(cand);
                for (let k = 0; !lab && k < 4 && /[ \t.-]/.test(cand); k++) {   // "+44 20 7946 0321 2024": drop trailing groups
                    cand = cand.replace(/[ \t.-]+[^ \t.-]+$/, "");
                    lab = phoneLabelFor(cand);
                }
                const lineStart = rightText.lastIndexOf("\n", pm.index) + 1;
                const before = rightText.slice(Math.max(lineStart, pm.index - 30), pm.index);
                if (!lab) {
                    cand = pm[0].trim();
                    const dg = cand.replace(/\D/g, "");
                    if (PHONE_WORD.test(before) && dg.length >= 7 && dg.length <= 15 && !isNotAPhoneShape(cand) && !isDefaultOrPlaceholderPhone(cand)) lab = LBL_INTL_PHONE;
                }
                if (!lab || !leftText.includes(cand)) continue;
                // Money is not a phone number ("Amount 7000000000 INR", "Rs. 9876543210").
                const pmLine = lineContaining(cand, rightText);
                const esc = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp("(?:amount|amt|total|balance|price|rs\\.?|inr|\u20B9|usd|\\$)\\s*[:=]?\\s*" + esc + "|" + esc + "\\s*(?:inr|rs|rupees|usd|dollars|views|likes|units)\\b", "i").test(pmLine)) continue;
                addTarget(cand, lab, "pt-contact", 95);
            }
        }

        // Step 4: Scan for HTTPS links that exist identically in BOTH left and right documents
        // (v11.3.5) Brackets inside a link stay part of it (balanced ( ) [ ] - see trimUrlEnd). A link that a PDF wrapped over
        // several lines ("https://a.io/very/long/" + "path/to/page") is one link: it is joined only when a line ends where
        // links usually wrap ( / - _ = & ? % ~ + ) and the next line starts with something shaped like a link piece, and it is
        // labeled only when the same link (ignoring line breaks) is in the left document. A label cannot span lines on the page,
        // so every line's piece is labeled on its own.
        {
            let leftFlat = null;
            const flat = () => (leftFlat === null ? (leftFlat = leftText.replace(/\s+/g, "")) : leftFlat);
            const WRAP_END = /[\/\-_=&?%~+]$/;
            // (v11.4.1) A wrap can fall anywhere in a link: mid-word (".../inst" + "allation-steps"), before the domain ending
            // ("acmecorp-demo" + ".io/guides"), inside a query ("?ref=ema" + "il&id=42"). The next line's first word continues the link when:
            //   - it has link punctuation ( / ? = & # % ) or starts with "." + letters (".io/x"), and is not "and/or", a date, a list number; or
            //   - it is a word joined by - or _ ("allation-steps") and the link's line is (almost) the longest line, so it was wrapped; or
            //   - it is a file name ("index.html") after a line ending in / - _ = & ? % ~ +; or
            //   - the left document has the joined link on one line (then even a plain word: "a/b/c/" + "page").
            // Never: another link, a list marker ("-", "2."), a bracket or quote, "e.g.", or a capitalised word ("Install").
            let maxLine = 0;
            for (const l of rightText.split("\n")) if (l.length > maxLine) maxLine = l.length;
            const notPiece = (tok) => /^[a-z][a-z0-9+.-]*:\/\//i.test(tok) || /^(?:[-*\u2022\u2013]|\d{1,3}[.)])$/.test(tok) ||
                /^[(\["'`<{]/.test(tok) || /^(?:e\.g\.?|i\.e\.?|etc\.?|vs\.?)[,;:]?$/i.test(tok) ||
                /^[A-Za-z]{1,5}\/[A-Za-z]{1,5}$/.test(tok) || /^\d{1,4}(?:\/\d{1,4}){1,2}$/.test(tok) ||
                (/^[A-Z][a-z]+[.,;:!?]?$/.test(tok));
            const isWrapPiece = (tok, prev, lineLen) => {
                if (notPiece(tok)) return false;
                if (/[\/?=&#%]/.test(tok) || /^\.[A-Za-z]{2,}/.test(tok)) return true;
                if (/^[\w.~]+[-_][\w.~-]*$/.test(tok) && lineLen >= 40 && lineLen >= maxLine * 0.8) return true;
                // (v11.4.2) the middle of a long document id ("1AbCdEfGhIjKlMn" + "OpQrStUvWxYz0123456789"): letters and digits mixed
                if (/^[A-Za-z0-9]{10,}$/.test(tok) && /\d/.test(tok) && /[A-Za-z]/.test(tok) && /[A-Za-z0-9]{6,}$/.test(prev) && lineLen >= 40 && lineLen >= maxLine * 0.8) return true;
                return WRAP_END.test(prev) && /^[\w-]+\.[A-Za-z0-9]{2,5}$/.test(tok);
            };
            const putUrl = (text) => {
                const ex = targetMap.get(text);
                if (!ex || 85 > ex.priority) targetMap.set(text, { text, label: "URL/Link", cls: "pt-url", priority: 85 });
            };
            const httpsRegex = /https:\/\/[^\s"'<>]+/g;
            let um;
            while ((um = httpsRegex.exec(rightText)) !== null) {
                const pieces = [um[0]];
                let end = um.index + um[0].length;
                while (pieces.length < 8) {
                    const nx = /^[ \t]*(?:\r?\n[ \t]*)+([^\s"'<>]+)/.exec(rightText.slice(end));
                    if (!nx) break;
                    // a line that starts with a query ("?q=a&page=2", "&x=1") continues the link whatever the previous line ended with
                    const startsQuery = /^[?&][^\s]/.test(nx[1]);
                    const prev = pieces[pieces.length - 1];
                    const lineLen = end - (rightText.lastIndexOf("\n", end - 1) + 1);
                    const tok = trimUrlEnd(nx[1]);
                    const literalLeft = !notPiece(tok) && /^[\w.~-]+$/.test(tok) && leftText.includes(pieces.join("") + tok);
                    if (!startsQuery && !isWrapPiece(nx[1], prev, lineLen) && !literalLeft) break;
                    pieces.push(nx[1]);
                    end += nx[0].length;
                }
                pieces[pieces.length - 1] = trimUrlEnd(pieces[pieces.length - 1]);
                const joined = pieces.join("");
                if (!joined.startsWith("https://") || joined.length <= 8) continue;
                if (pieces.length === 1 && leftText.includes(joined)) { addTarget(joined, "URL/Link", "pt-url", 85); continue; }
                // wrapped on one side only, or wrapped differently on the two sides
                if (!flat().includes(joined) || isDefaultOrPlaceholderLink(joined) || isFileAssetLink(joined) || joined.length > MAX_TOKEN_LEN * 2) continue;
                for (const p of pieces) if (p.length >= 2) putUrl(p);
            }
        }
        // (v10.4) The Employee-ID table scan was removed: Employee IDs are not one of the 15 SOP credential categories.

        // Step 5B: Direct scan for Credentials (All 15 strictly verified project categories)
        // User rule: "these are strictly crendentials where their values at left and right are same then the value should be labbeled as crenditals add this in existing logic and check wheter everything is added"

        // 1. Bank branch code (11 characters IFSC code: 4 letters + 0 + 6 alphanumeric)
        const ifscMatches = rightText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g) || [];
        for (const ifsc of ifscMatches) {
            if (leftText.includes(ifsc)) addTarget(ifsc, "Credentials", "pt-credentials", 95);
        }

        // 2. Income tax ID (10 characters PAN card: 5 letters + 4 digits + 1 letter)
        const panMatches = rightText.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || [];
        for (const pan of panMatches) {
            if (leftText.includes(pan)) addTarget(pan, "Credentials", "pt-credentials", 95);
        }

        // 3. Secret keys, tokens, SSH/private keys, API keys, JWT tokens
        const secKeys = rightText.match(/\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36})\b/g) || [];
        for (const sk of secKeys) {
            if (leftText.includes(sk)) addTarget(sk, "Credentials", "pt-credentials", 95);
        }
        const jwtMatches = rightText.match(/\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g) || [];
        for (const jwt of jwtMatches) {
            if (leftText.includes(jwt)) addTarget(jwt, "Credentials", "pt-credentials", 95);
        }
        const kvSecRegex = /(?:["']?(?:api_?key|secret_?key|auth_?token|client_?secret|access_?token)["']?\s*[:=]\s*["']?)([^"'\s,;]{12,128})/gi;
        let secM;
        while ((secM = kvSecRegex.exec(rightText)) !== null) {
            const sVal = cleanWord(secM[1]);
            if (sVal && sVal.length >= 8 && leftText.includes(sVal)) {
                addTarget(sVal, "Credentials", "pt-credentials", 95);
            }
        }

        // 4. Passwords, PINs, OTPs, security answers
        const kvPwdRegex = /(?:["']?(?:password|passwd|pwd|security_?answer|secret_?answer)["']?\s*[:=]\s*["']?)([^"'\n\r,;]{3,64})/gi;
        let pwdM;
        while ((pwdM = kvPwdRegex.exec(rightText)) !== null) {
            const pVal = cleanWord(pwdM[1]);
            if (/^(?:password|passwd|pwd|security_?answer|secret_?answer)$/i.test(pVal)) {
                // e.g. 'Password: "password": "value"' - the capture was the real key; continue scanning from it.
                kvPwdRegex.lastIndex = pwdM.index + pwdM[0].length - pwdM[1].length;
                continue;
            }
            if (pVal && pVal.length >= 3 && leftText.includes(pVal)) {
                addTarget(pVal, "Credentials", "pt-credentials", 95, true);
            }
        }
        const kvPinOtpRegex = /(?:["']?(?:pin|otp)["']?\s*[:=]\s*["']?)(\d{4,8})/gi;
        let pinM;
        while ((pinM = kvPinOtpRegex.exec(rightText)) !== null) {
            const pVal = pinM[1];
            if (pVal && leftText.includes(pVal)) {
                addTarget(pVal, "Credentials", "pt-credentials", 95, true);
            }
        }

        // 5. Aadhar Card No (12-digit unique ID number, continuous or spaced)
        const aadharSpaced = rightText.match(/\b\d{4}\s\d{4}\s\d{4}\b/g) || [];
        for (const aadh of aadharSpaced) {
            if (leftText.includes(aadh)) addTarget(aadh, "Credentials", "pt-credentials", 95);
        }

        // 6. Driving License No
        const dlMatches = rightText.match(/\b[A-Z]{2}[0-9]{2}[ -]?[0-9]{11}\b|\b[A-Z]{2}[ -]?[0-9]{13,15}\b/g) || [];
        for (const dl of dlMatches) {
            if (leftText.includes(dl)) addTarget(dl, "Credentials", "pt-credentials", 95);
        }

        // 7. Voter ID (Election card / EPIC number: 3 letters + 7 digits)
        const voterMatches = rightText.match(/\b[A-Z]{3}[0-9]{7}\b/g) || [];
        for (const vid of voterMatches) {
            if (leftText.includes(vid)) addTarget(vid, "Credentials", "pt-credentials", 95);
        }

        // 8. Credit/Debit Card No (Card number, CVV and expiry date)
        const ccMatches = rightText.match(/\b(?:\d{4}[ -]){3}\d{4}\b|\b[2-6]\d{12,18}\b/g) || [];
        for (const cc of ccMatches) {
            if (isCardNumber(cc) && leftText.includes(cc)) addTarget(cc, "Credentials", "pt-credentials", 95);
        }
        const cvvRegex = /(?:["']?(?:cvv|cvc|security_?code)["']?\s*[:=]\s*["']?)(\d{3,4})/gi;
        let cvM;
        while ((cvM = cvvRegex.exec(rightText)) !== null) {
            const cvVal = cvM[1];
            if (cvVal && leftText.includes(cvVal)) {
                addTarget(cvVal, "Credentials", "pt-credentials", 95, true);
            }
        }
        const expRegex = /(?:["']?(?:expiry|exp_?date|card_?expiry)["']?\s*[:=]\s*["']?)((?:0[1-9]|1[0-2])[\/\-](?:[0-9]{2}|20[0-9]{2}))/gi;
        let expM;
        while ((expM = expRegex.exec(rightText)) !== null) {
            const expVal = expM[1];
            if (expVal && leftText.includes(expVal)) {
                addTarget(expVal, "Credentials", "pt-credentials", 95, true);
            }
        }

        // 9. UPI ID (UPI payment address)
        const upiRegex = /\b[a-zA-Z0-9.\-_]{2,}@(okaxis|okhdfcbank|oksbi|okicici|paytm|upi|ybl|apl|ibl|axl|axisbank|dbs|freecharge|hsbc|icici|kotak|payzapp|postbank|sbi|yesbank)\b/gi;
        const upiMatches = rightText.match(upiRegex) || [];
        for (const upi of upiMatches) {
            if (leftText.includes(upi)) addTarget(upi, "Credentials", "pt-credentials", 95);
        }

        // 10. Transaction ID (Bank or blockchain (e.g. Bitcoin) transaction ID)
        const txMatches = rightText.match(/\b0x[a-fA-F0-9]{16,64}\b/g) || [];
        for (const tx of txMatches) {
            if (leftText.includes(tx)) addTarget(tx, "Credentials", "pt-credentials", 95);
        }
        const kvTxRegex = /(?:["']?(?:txid|tx[_\- ]id|txn[_\- ]?(?:id|no|ref)|transaction[_\- ]?(?:id|no|ref(?:erence)?)|utr(?:[_\- ]?(?:no|number))?)\.?["']?\s*[:=]\s*["']?)([a-zA-Z0-9_\-]{8,64})/gi;
        let txM;
        while ((txM = kvTxRegex.exec(rightText)) !== null) {
            const txVal = cleanWord(txM[1]);
            if (txVal && txVal.length >= 8 && leftText.includes(txVal)) {
                addTarget(txVal, "Credentials", "pt-credentials", 95);
            }
        }

        // 11. Invocation ID (Unique ID for a single run of a cloud function)
        // User rule: "only id is not necessaery to mark as credentials"
        // Strictly require cloud function / invocation / execution / request context; generic object / panel / JSON "id" values are NEVER credentials!
        const invKvRegex = /(?:["']?(?:invocation[_\- ]?id|execution[_\- ]?id|request[_\- ]?id|trace[_\- ]?id|run[_\- ]?id|lambda[_\- ]?id)["']?\s*[:=]\s*["']?)([0-9a-fA-F-]{36})/gi;
        let invM;
        while ((invM = invKvRegex.exec(rightText)) !== null) {
            const uid = invM[1];
            if (uid && leftText.includes(uid)) {
                addTarget(uid, "Credentials", "pt-credentials", 95);
            }
        }
        const invShortKvRegex = /(?:["']?(?:invocation[_\- ]?id|execution[_\- ]?id|request[_\- ]?id|trace[_\- ]?id|run[_\- ]?id|lambda[_\- ]?id)["']?\s*[:=]\s*["']?)([a-z0-9]{4,6}-[a-z0-9]{4,6}-[a-z0-9]{4,6}-[a-z0-9]{4,6})/gi;
        let invSm;
        while ((invSm = invShortKvRegex.exec(rightText)) !== null) {
            const inv = invSm[1];
            if (inv && /\d/.test(inv) && leftText.includes(inv)) {
                addTarget(inv, "Credentials", "pt-credentials", 95);
            }
        }

        // 12. SHA/SSH/Hash Key (Hash values SHA-1/SHA-256 or SSH keys)
        const sshMatches = rightText.match(/\bssh-rsa\s+[A-Za-z0-9+/=]{20,}/g) || [];
        for (const ssh of sshMatches) {
            if (leftText.includes(ssh)) addTarget(ssh, "Credentials", "pt-credentials", 95);
        }

        // 13. VPC ID (Isolated private network in the cloud)
        const vpcMatches = rightText.match(/\bvpc-[a-f0-9]{8,17}\b/g) || [];
        for (const vpc of vpcMatches) {
            if (leftText.includes(vpc)) addTarget(vpc, "Credentials", "pt-credentials", 95);
        }

        // 14. Card ID (Internal or tokenized reference to a payment card)
        const cardIdMatches = rightText.match(/\bcard_[a-zA-Z0-9]{16,32}\b/g) || [];
        for (const cid of cardIdMatches) {
            if (leftText.includes(cid)) addTarget(cid, "Credentials", "pt-credentials", 95);
        }

        // 15. Account ID (12-digit cloud account number e.g. AWS) & IAM Policy IDs
        // User rule: "dont mark that account id and policy id only label thoese values only eg account_id": "111122223333 onlt 111122223333 this should be marked as crentials not account_id also"
        const awsAccMatches = rightText.match(/(?<![+\d])\b\d{12}\b/g) || [];   // "+919876543210" is a phone
        for (const ac of awsAccMatches) {
            if (leftText.includes(ac)) addTarget(ac, "Credentials", "pt-credentials", 95);
        }
        const iamMatches = rightText.match(/\b(?:AKIA|ANPA|ASIA|AROA|AIDA|AGPA)[A-Z0-9]{16,21}\b/g) || [];
        for (const im of iamMatches) {
            if (leftText.includes(im)) addTarget(im, "Credentials", "pt-credentials", 95);
        }

        // Step 5C: Social @handles identical in BOTH documents -> Person Username.
        // Not part of an e-mail, not a code decorator / CSS at-rule / npm scope.
        const handleRegex = /(?<![A-Za-z0-9_.@\/])@([A-Za-z_][A-Za-z0-9_.]{1,29})(?![A-Za-z0-9_@\/])/g;   // "@2x" is an image suffix
        const CODE_AT_WORDS = /^(?:media|import|keyframes|font-face|supports|page|charset|namespace|layer|container|property|override|param|returns?|type|typedef|deprecated|author|since|see|throws|example|interface|component|injectable|input|output|test|before|after|apply|tailwind|use|extend|mixin|include|each|if|else|function|types|angular|babel|vue|nestjs|testing-library)$/i;
        let hM;
        while ((hM = handleRegex.exec(rightText)) !== null) {
            const handle = '@' + hM[1].replace(/\.+$/, '');
            if (CODE_AT_WORDS.test(hM[1])) continue;
            // Code annotations are PascalCase words ("@SpringBootApplication", "@RestController", "@Test").
            if (/^[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+$/.test(hM[1]) || /^[A-Z][a-zA-Z]*$/.test(hM[1]) && /^\s*$/.test(rightText.slice(rightText.lastIndexOf("\n", hM.index) + 1, hM.index))) continue;
            if (occurrencesOf(handle, leftText).length > 0) addTarget(handle, "Person Username", "pt-username", 90);
        }

        // Step 6: Scan for Email Addresses that exist identically in BOTH left and right documents
        // Rule: "mail should same as left then label it if not no"
        const emailRegex = new RegExp("(?<![A-Za-z0-9._%+-])" + EMAIL_LOCAL + "@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b", "g");
        const rightEmails = rightText.match(emailRegex) || [];
        for (const em of rightEmails) {
            // "git@github.com:acme/tool.git" is an SSH remote, not an e-mail.
            if (/^git@/i.test(em) || new RegExp(em.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":[\\w~]").test(rightText)) continue;
            if (isEmailAddressFormat(em) && leftText.includes(em)) {
                addTarget(em, "Email Address", "pt-email", 90);
            }
        }

        // (v11.4.3) An e-mail broken over two lines ("priya.raghavan@northwind-" + "demo.com", "priya.raghavan" + "@northwind-demo.com").
        // Joined only when the break is inside the domain, right before the "@", or after a . _ - in the name part, the joined
        // text is a real e-mail, the first piece is not one already, and the left has the same e-mail (line breaks ignored).
        // A label cannot span lines, so each piece is labeled on its own.
        {
            const setDirect = (text, label, cls, priority) => {
                const ex = targetMap.get(text);
                if (!ex || priority > ex.priority) targetMap.set(text, { text, label, cls, priority });
            };
            const rl = rightText.split("\n");
            let leftFlatE = null;
            for (let i = 0; i + 1 < rl.length; i++) {
                const tm = /(\S+)\s*$/.exec(rl[i]), hm = /^\s*(\S+)/.exec(rl[i + 1]);
                if (!tm || !hm) continue;
                const a = tm[1].replace(/^.*[<(\["'`:,;]/, "");
                const b = hm[1].replace(/[>)\]"'`.,;:!?]+$/, "");
                if (a.length < 2 || b.length < 2 || (a + b).split("@").length !== 2) continue;
                const brk = (a.includes("@") && !a.endsWith("@")) || b.startsWith("@") || (/[._-]$/.test(a) && b.includes("@") && !a.includes("@"));
                if (!brk || isEmailAddressFormat(a) || !isEmailAddressFormat(a + b)) continue;
                if (leftFlatE === null) leftFlatE = leftText.replace(/\s+/g, "");
                if (!leftFlatE.includes(a + b)) continue;
                setDirect(a, "Email Address", "pt-email", 90);
                setDirect(b, "Email Address", "pt-email", 90);
            }

            // (v11.4.3) A hidden address ("priya.raghavan [at] northwind-demo [dot] com", "priya(at)northwind-demo.com",
            // "arjun.mehta at contoso-demo dot co dot in") is not an e-mail label. When the same hidden address is on both
            // sides, its person name (the name part, if it is a name and not a mailbox like "support") is a Person Name and
            // its company (the domain's name, unless it is a webmail provider like gmail) is a Business Name.
            // A spelled-out " at " counts only with a spelled-out " dot " and a name part like "first.last".
            const AT = "(?:\\s*[\\[({]\\s*at\\s*[\\])}]\\s*|\\s+at\\s+)";
            const DOT = "(?:\\s*[\\[({]\\s*dot\\s*[\\])}]\\s*|\\s+dot\\s+|\\.)";
            const hidden = new RegExp("(?<![\\w.@-])([A-Za-z][A-Za-z0-9._-]*?)" + AT + "([A-Za-z0-9][A-Za-z0-9-]*(?:" + DOT + "[A-Za-z0-9][A-Za-z0-9-]*)*" + DOT + "[A-Za-z]{2,})(?![\\w-])", "gi");
            const WEBMAIL = /^(?:gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|rediffmail|rediff|gmx|yandex|mail|zohomail|fastmail|tutanota|qq|163)$/i;
            const MAILBOX = /^(?:support|info|hr|admin|sales|contact|help|noreply|no-reply|no_reply|team|office|careers|jobs|billing|accounts?|enquiry|enquiries|hello|mail|marketing|ops|security|service|services|webmaster|postmaster|feedback|press|media|legal|finance|payroll|recruitment|hiring|it|devops|alerts|notifications)$/i;
            const normWsE = (x) => x.replace(/\s+/g, " ").trim();
            const leftNormE = normWsE(leftText);
            let hm2;
            while ((hm2 = hidden.exec(rightText)) !== null) {
                const whole = hm2[0];
                if (/@/.test(whole)) continue;
                const bracketAt = /[\[({]\s*at\s*[\])}]/i.test(whole);
                if (!bracketAt && !(/\sdot\s/i.test(whole) && /[._]/.test(hm2[1]))) continue;
                if (!leftNormE.includes(normWsE(whole))) continue;
                const local = hm2[1];
                const labels = hm2[2].split(new RegExp(DOT, "i")).filter(Boolean);
                if (labels.length < 2) continue;
                const n = labels.length;
                const company = (n >= 3 && /^(?:co|com|org|net|ac|gov|edu|or|ne)$/i.test(labels[n - 2]) && labels[n - 1].length === 2) ? labels[n - 3] : labels[n - 2];
                if (/^[A-Za-z]+(?:[._-][A-Za-z]+){0,3}$/.test(local) && !MAILBOX.test(local)) setDirect(local, "Person Name", "pt-person", 90);
                if (company && company.length >= 2 && !WEBMAIL.test(company) && /[A-Za-z]/.test(company)) setDirect(company, "Business Name", "pt-business", 90);
            }
        }

        // Step 7: Scan for SHA-1 (40 hex) and SHA-256 (64 hex) hashes identical in BOTH left & right
        // Rule: SHA is Credentials, only marked if same in both panes
        const shaRegex = /\b[0-9a-fA-F]{40}\b|\b[0-9a-fA-F]{64}\b/g;
        const rightShas = rightText.match(shaRegex) || [];
        for (const sha of rightShas) {
            if (leftText.includes(sha)) {
                addTarget(sha, "Credentials", "pt-credentials", 95);
            }
        }

        // Step 7B (v10.5.1): IP addresses identical on both sides (IPv4 and IPv6; MAC addresses and version strings excluded).
        {
            const ipv4 = rightText.match(/(?<![\w.:-])(?:\d{1,3}\.){3}\d{1,3}(?![\w.]|:\d{1,2}\b(?!\d))/g) || [];
            const ipv6 = rightText.match(/(?<![\w:])(?:[0-9a-fA-F]{1,4}:){2,7}:?(?:[0-9a-fA-F]{1,4})?(?:::)?(?:[0-9a-fA-F]{1,4})?(?![\w:])/g) || [];
            for (const ip of ipv4.concat(ipv6)) {
                const t = ip.replace(/[.:]+$/, "");
                if (!isIpAddressFormat(t) || !leftText.includes(t)) continue;
                if (/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(t)) continue;                         // MAC address
                const line = lineContaining(t, rightText);
                const escIp = t.replace(/\./g, "\\.");
                // Version / section / price numbers that happen to have four parts are not IP addresses.
                if (new RegExp("\\b(?:v(?:ersion)?|ver|release|build|section|sec|clause|chapter|ch|step|figure|fig|table|para|rule|item|rs|inr|price|cost)\\.?[\\s:=#]*" + escIp, "i").test(line)) continue;
                if (new RegExp(escIp + "\\s*(?:kg|g|km|m|cm|mm|ml|l|%|units?|pcs|inr|usd|rs)\\b", "i").test(line)) continue;
                // All four parts below 10 ("3.2.1.4") looks like numbering unless the line talks about networks.
                if (t.includes(".") && t.split(".").every(o => Number(o) < 10) && !/\b(?:ip|host|server|addr|address|gateway|dns|subnet|proxy|ping|allow(?:ed)?|deny|connect|nat|vpn|router|lan|wan|cidr|inet)\b|[=@]\s*$/i.test(line.slice(0, line.indexOf(t)))) continue;
                addTarget(t, "IP Address", "pt-ip", 90);
            }
        }

        // Step 7C (v10.5.1): bank account numbers behind an account-number key, identical on both sides.
        {
            const acRe = /(?:account[\s_]*(?:no|number|num)\.?|acc[\s_]*no\.?|a\/c\s*(?:no\.?)?|acct\.?[\s_]*(?:no\.?)?)["']?\s*[:#.=\-|]?\s*\|?\s*["']?(\d[\d -]{6,22}\d)/gi;
            let am;
            while ((am = acRe.exec(rightText)) !== null) {
                const raw = am[1].trim();
                const digits = raw.replace(/\D/g, "");
                if (digits.length < 9 || digits.length > 18) continue;
                if (!leftText.includes(raw)) continue;
                addTarget(raw, "Account Number", "pt-account", 99, true);   // beats the 12-digit Credentials rule
            }
        }

        // Step 7C2 (v10.5.4): account-number COLUMNS in pipe tables ("| Account No | IFSC |" then "| 5020... | ... |").
        {
            for (let i = 0; i < rightLines.length; i++) {
                const hdr = rightLines[i].trim();
                if (!hdr.startsWith("|") && !/,|\t/.test(hdr)) continue;
                // pipe tables and CSV / TSV headers
                const sep = hdr.startsWith("|") ? "|" : (hdr.includes("\t") ? "\t" : ",");
                const hc = hdr.split(sep).map(x => x.trim());
                const col = hc.findIndex(h => /^(?:account[\s_]*(?:no\.?|number|num)|acc[\s_]*no|a\/c\s*(?:no\.?)?|acct\.?\s*(?:no\.?)?|bank\s*account(?:\s*(?:no\.?|number))?)$/i.test(h));
                if (col < 0) continue;
                for (let j = i + 1; j < Math.min(rightLines.length, i + 500); j++) {
                    const row = rightLines[j].trim();
                    if (sep === "|" ? !row.startsWith("|") : !row.includes(sep)) break;
                    const cells = row.split(sep).map(x => x.trim());
                    const v = cells[col] || "";
                    const digits = v.replace(/[\s-]/g, "");
                    if (/^\d{9,18}$/.test(digits) && leftText.includes(v)) addTarget(v, "Account Number", "pt-account", 96, true);
                }
            }
        }

        // Step 7D (v10.5.1): well-known secret formats identical on both sides, whatever key (or renamed key) they sit behind.
        {
            const secretRe = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bglpat-[A-Za-z0-9_-]{20}\b|\bnpm_[A-Za-z0-9]{36}\b|\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
            for (const s of (rightText.match(secretRe) || [])) {
                if (leftText.includes(s)) addTarget(s, "Credentials", "pt-credentials", 98, true);
            }
        }

        // Step 8: Direct scan for Person Names that exist identically in BOTH left and right documents
        // Rule: "name should be same on left and right then only we can label it has person name"
        // User example: "like left side rithan right side rithan then verify in browser urself and annotate as person name"
        
        // 8A: Key-value patterns ("name": "...", @author: ..., Committer: ..., Applicant: ...)
        const kvNameRegex = /(?:(?:@|["'])?(?:full_?name|employee_?name|candidate_?name|patient_?name|author|committer|maintainer|applicant|assignee|owner|name|signed-off-by)[\s"']*[:=]?\s*["']?)([^"'\n\r,;|<()]+)/gi;
        let kvm;
        while ((kvm = kvNameRegex.exec(rightText)) !== null) {
            const pCandidate = cleanWord(kvm[1]);
            // Cheap pre-filter: a person's name is 1-5 words of letters only (no digits). On JSON exports with
            // thousands of "name": "item123" values, skipping the expensive checks keeps the scan fast.
            if (!/^\p{L}[\p{L}'.\- ]{1,60}$/u.test(pCandidate) || pCandidate.split(/\s+/).length > 5) continue;
            if (pCandidate.length >= 3 && !isInfraOrServerTerm(pCandidate) && !isBusinessName(pCandidate, pCandidate, "")) {
                if (leftText.includes(pCandidate) && isPersonName(pCandidate, kvm[0])) {
                    addTarget(pCandidate, "Person Name", "pt-person", 90);
                }
            }
        }

        // 8B: Markdown Table Cells for Person Names
        for (let i = 0; i < rightLines.length; i++) {
            const rLine = rightLines[i].trim();
            if (!rLine.startsWith("|") || !rLine.endsWith("|")) continue;
            if (/^\|[\s\-:|]+\|$/.test(rLine)) continue;
            const nextLine = (i + 1 < rightLines.length) ? rightLines[i + 1].trim() : "";
            if (/^\|[\s\-:|]+\|$/.test(nextLine)) continue;
            if (/\b(?:s\.?n\.?|emp\s*id|employee\s*id|full\s*name|phone\s*number|department|description|status|action|serial)\b/i.test(rLine) && !/^\s*\|\s*\d+\s*\|/.test(rLine)) continue;
            const rCells = rLine.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            for (const cell of rCells) {
                const cWord = cleanWord(cell);
                if (cWord.length >= 3 && !/^\d+$/.test(cWord) && !isInfraOrServerTerm(cWord) && !isBusinessName(cWord, cWord, rLine)) {
                    if (isPersonName(cWord, rLine) && leftText.includes(cWord)) {
                        addTarget(cWord, "Person Name", "pt-person", 90);
                    }
                }
            }
        }

        // 8C: Standalone Person Names occurring in prose / text (identical in both left and right)
        // Matches capitalized multi-part names (e.g. "Himanshu Gupta", "Jiveshwar Sharma")
        // (v10.5.1) words on the SAME line only: "Sneha Iyer\nAccount Number" used to swallow the next line.
        const nameCandidates = rightText.match(/\b[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,3}\b/g) || [];
        for (const nc of nameCandidates) {
            const startsWithGiven = KNOWN_GIVEN_NAMES.has(nc.split(/\s+/)[0].toLowerCase());   // "Dhruv Bajaj": Bajaj is also a brand
            if (nc.length >= 4 && !isInfraOrServerTerm(nc) && (startsWithGiven || !isBusinessName(nc, nc, "")) && !isFieldLabelOrHeader(nc) && !hasNonEntityWord(nc)) {
                if (isPersonName(nc, "") && leftText.includes(nc)) {
                    addTarget(nc, "Person Name", "pt-person", 85);
                }
            }
        }

        // 8C2 (v10.5.1): names with an initial ("R. Krishnan", "Anand K.") and ALL-CAPS name headers ("RAHUL VERMA").
        {
            const distinctive = (w) => KNOWN_GIVEN_NAMES.has(w.toLowerCase()) || (!isCommonWord(w) && !PLACES.has(w.toLowerCase()) && !isCalendarWord(w) && !KNOWN_BUSINESS_NAMES.has(w.toLowerCase()) && !TECH_TOOLS.has(w.toLowerCase()));
            const initialRe = /\b[A-Z]\.[ \t]?[A-Z][a-z]{2,}(?:[ \t][A-Z][a-z]{2,})?\b|\b[A-Z][a-z]{2,}(?:[ \t][A-Z][a-z]{2,})?[ \t][A-Z]\.(?![\w])/g;
            for (const m of (rightText.match(initialRe) || [])) {
                const words = m.split(/[\s.]+/).filter(w => w.length > 1);
                if (words.length && words.every(distinctive) && words.some(w => KNOWN_GIVEN_NAMES.has(w.toLowerCase()) || !isCommonWord(w)) && leftText.includes(m)) {
                    addTarget(m, "Person Name", "pt-person", 86);
                }
            }
            for (const rawLine of rightLines) {
                const ln = rawLine.trim();
                if (!/^[A-Z]{2,}(?:[ \t]+[A-Z]\.?)?(?:[ \t]+[A-Z]{2,}){1,2}$/.test(ln)) continue;
                const ws = ln.split(/\s+/).filter(w => w.length > 1);
                // At least one word must be a known given name / surname; no ordinary words ("EXPERIENCE SUMMARY").
                if (!ws.some(w => KNOWN_GIVEN_NAMES.has(w.toLowerCase()))) continue;
                if (ws.some(w => isCommonWord(w.toLowerCase()) && !KNOWN_GIVEN_NAMES.has(w.toLowerCase()))) continue;
                if (leftText.includes(ln)) addTarget(ln, "Person Name", "pt-person", 86);
            }
        }

        // 8F (v11.1.0): the value of a NAME FIELD ("Customer Name: Asha Bansal", "Account Holder: ...",
        // "Father's Name: ...", "Nominee - ...", JSON "full_name": "...") identical on both sides is a Person Name,
        // even when the names are not in the name list.
        {
            const FIELD = /(?:^|[\s|,{;"'(])(?:customer|full|first|last|employee|candidate|student|patient|applicant|account\s*holder|holder|card\s*holder|contact\s*person|father'?s?|mother'?s?|spouse|husband'?s?|wife'?s?|guardian|nominee|beneficiary|insured|policy\s*holder|parent'?s?|teacher|agent|reviewer|approver|assignee|reporter|author|owner|manager|signatory|witness)?[\s_]*(?:name|holder|nominee|beneficiary|signatory|witness)?["']?\s*[:=\-]\s*["']?([A-Z][a-z'\-]+(?:[ \t]+[A-Z][a-z'\-]+){0,3}|[A-Z][A-Z'\-]+(?:[ \t]+[A-Z][A-Z'\-]+){1,3})(?=["',;|)}\s]|$)/gm;
            const KEY_OK = /(?:name|holder|nominee|beneficiary|signatory|witness|insured|guardian|spouse|author|assignee|reporter|approver|reviewer)\s*["']?\s*[:=\-]\s*["']?$/i;
            for (const line of rightLines) {
                if (line.length > 400) continue;
                FIELD.lastIndex = 0;
                let m;
                while ((m = FIELD.exec(line)) !== null) {
                    const v = m[1];
                    const keyPart = line.slice(Math.max(0, m.index), m.index + m[0].length - v.length);
                    if (!KEY_OK.test(keyPart)) continue;
                    if (/(?:company|business|bank|file|product|project|branch|course|batch|plan|domain|host|server|app|repo|brand|store|shop|school|college|university|hospital|city|state|country|place|event|team|group|channel|document|sheet|vendor|merchant)\s*[_\s]*name/i.test(keyPart)) continue;
                    if (isOrdinaryPhrase(v) || PLACES.has(v.toLowerCase()) || isLanguageWord(v) || containsKnownBusiness(v) || isFieldLabelOrHeader(v)) continue;
                    if (!leftText.includes(v)) continue;
                    addTarget(v, "Person Name", "pt-person", 87, true);
                }
            }
        }

        // 8G (v11.1.0): the name right after a greeting ("Hi Asha,", "Dear Harsh,", "Thanks Imran!") identical on both
        // sides is a Person Name - also names that are ordinary words elsewhere (Harsh, Asha, Rose).
        {
            const GREET = /(?:^|[\n>]|\s)(?:Hi|Hello|Hey|Dear|Thanks|Thank you|Regards|Cheers)[,!]?[ \t]+([A-Z][a-z'\-]+(?:[ \t]+[A-Z][a-z'\-]+){0,2})(?=[ \t]*[,!.\n:]|[ \t]*$)/g;
            const NOT_NAME = /^(?:team|all|everyone|sir|madam|ma'am|guys|folks|there|friends|colleagues|customer|user|both|again|you|so|for|in|advance|a|lot|and|the|again)$/i;
            let gm;
            while ((gm = GREET.exec(rightText)) !== null) {
                const v = gm[1];
                const ws = v.split(/\s+/);
                if (ws.some(w => NOT_NAME.test(w) || isCalendarWord(w) || PLACES.has(w.toLowerCase()) || isLanguageWord(w) || isHonorific(w))) continue;
                // at least one word must be a (possibly ambiguous) known name or not an ordinary word
                if (!ws.some(w => KNOWN_GIVEN_NAMES.has(w.toLowerCase()) || !isCommonWord(w))) continue;
                if (!new RegExp("(?:Hi|Hello|Hey|Dear|Thanks|Thank you|Regards|Cheers)[,!]?[ \\t]+" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}])", "u").test(leftText)) continue;
                addTarget(v, "Person Name", "pt-person", 87, true);
            }
        }

        // 8D: Single Given Names from KNOWN_GIVEN_NAMES identical in both left and right (e.g. Kartik, Jesus, Thomas)
        const singleWordCandidates = rightText.match(/\b[A-Z][a-z]{2,}\b/g) || [];
        for (const sw of singleWordCandidates) {
            const lower = sw.toLowerCase();
            // (v11.2.0) a surname that is also a brand ("Bajaj", "Tata") right after a first name is part of a person's name
            const afterFirstName = KNOWN_BUSINESS_NAMES.has(lower) && KNOWN_GIVEN_NAMES.has(lower) &&
                new RegExp("\\b[A-Z][a-z]{2,}[ \\t]+" + sw + "\\b").test(rightText) &&
                !new RegExp("\\b(?:" + Array.from(CO_WORDS_FOR_SURNAME).join("|") + ")[ \\t]+" + sw + "\\b", "i").test(rightText);
            if ((isKnownGivenNameWord(lower) || afterFirstName) && !isFieldLabelOrHeader(sw) && !hasNonEntityWord(sw)) {
                if (leftText.includes(sw) && (afterFirstName || isPersonName(sw, rightText))) {
                    addTarget(sw, "Person Name", "pt-person", 85);
                }
            }
        }

        // Step 9: Scan for Date of Birth (DOB)
        // User rule: "if dob date of birth then it should be labeled as date"
        const dobPatterns = [
            /(?:dob|d\.o\.b\.?|date\s+of\s+birth|birth\s*date|birthdate|born\s+on)[\s:=|]+([0-9]{1,4}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{1,4}|[0-9]{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\s+[0-9]{2,4})/gi,
            /(?:["']?(?:dob|date_of_birth|birth_date|birthdate)["']?\s*[:=]\s*["'])([^"'\n\r]+)["']/gi
        ];
        for (const pat of dobPatterns) {
            let dm;
            while ((dm = pat.exec(rightText)) !== null) {
                const dVal = (dm[1] || "").trim();
                if (isDateFormat(dVal)) {
                    addTarget(dVal, "Date", "pt-date", 95);
                }
            }
        }

        const rDocLines = rightText.split('\n');
        for (let li = 0; li < rDocLines.length; li++) {
            const line = rDocLines[li];
            if (/\|\s*(?:dob|date\s+of\s+birth|birth\s*date)\s*\|/i.test(line)) {
                const headerCells = line.split('|').map(c => c.trim().toLowerCase());
                const dobColIdx = headerCells.findIndex(c => /^(?:dob|date\s+of\s+birth|birth\s*date)$/i.test(c));
                if (dobColIdx !== -1) {
                    for (let r = li + 1; r < Math.min(rDocLines.length, li + 50); r++) {
                        const rowLine = rDocLines[r];
                        if (!rowLine.includes('|')) break;
                        const rowCells = rowLine.split('|').map(c => c.trim());
                        if (rowCells[dobColIdx]) {
                            const cellVal = rowCells[dobColIdx];
                            if (isDateFormat(cellVal)) {
                                addTarget(cellVal, "Date", "pt-date", 95);
                            }
                        }
                    }
                }
            }
        }

        // Step 9: Scan for Real-World Vehicle Number Plates identical in BOTH left & right
        // Rule: "vechile number plate only should follow format it have real world number plates only marked"
        const plateRegex = /\b([A-Z]{2}[ -]?\d{1,2}[A-Z]?[ -]?[A-Z]{1,3}[ -]?\d{4}|\d{2}[ -]?BH[ -]?\d{4}[ -]?[A-Z]{1,2})\b/gi;
        let pMatch;
        while ((pMatch = plateRegex.exec(rightText)) !== null) {
            const plate = pMatch[1].trim();
            if (isVehiclePlateFormat(plate) && leftText.includes(plate)) {
                addTarget(plate, "Vehicle Number Plate", "pt-vehicle", 92);
            }
        }

        // (v11.4.0) Postal codes (Postal Code, Indonesian Postal Code, Brazilian CEP). A number alone says nothing, so a postal
        // code is labeled only when a key ("Pincode: 560087", "postal_code": "...", "Kode pos 12190") or a table / CSV column
        // header names it. Inside an address line the whole line is the Address instead.
        {
            const KEY = "postal[\\s_-]*code|post[\\s_-]*code|postcode|zip[\\s_-]*code|zipcode|zip|pin[\\s_-]*code|pincode|kode[\\s_-]*pos|kodepos|cep";
            const HEADER_RE = new RegExp("^(?:" + KEY + ")$", "i");
            const postalLabel = (key, v, line) => {
                const k = key.toLowerCase().replace(/[\s_-]/g, "");
                if (k === "kodepos" || (/\bindonesia\b/i.test(line) && /^\d{5}$/.test(v))) return LBL_KODEPOS;
                if (k === "cep" || (/\bbra[sz]il\b/i.test(line) && /^\d{5}-\d{3}$/.test(v))) return /^\d{5}-?\d{3}$/.test(v) ? LBL_CEP : LBL_POSTAL;
                return LBL_POSTAL;
            };
            const fit = (raw) => {   // "94105 and more" -> "94105"
                let v = (raw || "").trim().replace(/^["']|["']$/g, "");
                for (let k = 0; k < 4 && v && !isPostalCodeShape(v); k++) v = v.replace(/[ -]+[^ -]*$/, "");
                return isPostalCodeShape(v) ? v : null;
            };
            const kv = new RegExp("(?:^|[\\s{,\"'(|])[\"']?(" + KEY + ")[\"']?\\s*(?:no\\.?|number)?\\s*[:=\\-]?\\s*[\"']?([A-Za-z0-9][A-Za-z0-9 -]{0,10}[A-Za-z0-9])", "gim");
            let km;
            while ((km = kv.exec(rightText)) !== null) {
                const v = fit(km[2]);
                if (v && leftText.includes(v)) addTarget(v, postalLabel(km[1], v, lineContaining(v, rightText)), "pt-address", 97);
            }
            const lines = rightText.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const ln = lines[i];
                const delim = ln.includes("|") ? "|" : ln.includes("\t") ? "\t" : ln.includes(",") ? "," : null;
                if (!delim) continue;
                const head = ln.split(delim).map(c => c.trim().replace(/^["']|["']$/g, ""));
                const col = head.findIndex(c => HEADER_RE.test(c));
                if (col < 0) continue;
                for (let r = i + 1; r < lines.length && r <= i + 5000; r++) {
                    const row = lines[r];
                    if (!row.trim()) continue;
                    if (!row.includes(delim)) break;
                    if (/^[\s|:\-]+$/.test(row)) continue;   // markdown separator row
                    const cells = row.split(delim);
                    if (cells.length !== head.length) continue;
                    const v = fit(cells[col]);
                    if (v && leftText.includes(v)) addTarget(v, postalLabel(head[col], v, row), "pt-address", 97);
                }
            }
        }

        // Step 10: Scan for Complete Addresses identical in BOTH left & right
        // Rule: "for address there should be complete address eg 12, MG Road, Pune 411001 and both left and right should be then only it should be labeled as adress otherwise no need to mark"
        const addrCandidateRegex = /(?:(?:#?\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?|plot(?:\s*no\.?)?\s*\d+|flat(?:\s*no\.?)?\s*\d+|door(?:\s*no\.?)?\s*\d+|house(?:\s*no\.?)?\s*\d+)[,\s]+[a-zA-Z0-9\s,\.\-']+(?:road|rd|street|st|lane|ln|crescent|cres|avenue|ave|nagar|layout|colony|sector|block|cross|main|marg|chowk|rasta)[,\s]+[a-zA-Z\s]+[,\s]+[1-9][0-9]{5})/gi;
        let aMatch;
        while ((aMatch = addrCandidateRegex.exec(rightText)) !== null) {
            const addr = aMatch[0].trim();
            if (isCompleteAddress(addr) && leftText.includes(addr)) {
                addTarget(addr, "Address", "pt-address", 85);
            }
        }
        // Address blocks: consecutive address-like lines ("937 X Road" / "Sector 127, Noida," / "Uttar Pradesh" / "India").
        // A line is only labeled when its WHOLE block is identical on both sides; if any part of the address was
        // scrubbed (street changed, PIN removed), the remaining identical fragment ("Sector 127, Noida") is NOT an
        // Address - the address was redacted, so nothing is labeled.
        const normWs = (s) => s.replace(/\s+/g, " ").trim();
        const leftNorm = normWs(leftText);
        const isAddrLine = (l) => { const t = l.trim(); return t.length > 0 && t.length <= 120 && !t.includes("|") && (looksLikeAddressPart(t) || containsPlace(t) || /^(?:[A-Z][a-z]+\s?){1,3},?$/.test(t) && containsPlace(t)); };
        const blockAround = (i) => {
            let a = i, b = i;
            while (a - 1 >= 0 && isAddrLine(rightLines[a - 1]) && i - a < 5) a--;
            while (b + 1 < rightLines.length && isAddrLine(rightLines[b + 1]) && b - i < 5) b++;
            return rightLines.slice(a, b + 1).map(l => l.trim()).filter(Boolean);
        };
        for (let i = 0; i < rightLines.length; i++) {
            const raw = rightLines[i];
            // Table rows: test each cell on its own so the header cell ("Address |") never becomes part of the label.
            const isRow = raw.includes("|");
            const pieces = isRow ? raw.split("|") : [raw];
            for (const piece of pieces) {
                // (v10.5.4) a field label in front ("Ship to: ", "Address: ") is not part of the address.
                let cand = piece.replace(/^[\s\-:]+/, "").replace(/^[A-Za-z][A-Za-z /]{1,24}:\s*(?=\S)/, "").replace(/[\s\-:]+$/, "").trim();
                // (v10.5.4) an address inside a sentence ("Delivered to 5th Floor, ..., Hyderabad 500081 yesterday"):
                // keep only the part from the first house / floor / plot number to the PIN code.
                {
                    const inner = cand.length > 400 ? null : cand.match(/(?:\b(?:flat|plot|house|h\.?\s?no|door|no\.|shop|unit)\s*[#\w-]*|#\s*\d|\b\d+[a-z]?(?:st|nd|rd|th)?\b)[^\n]*?\b[1-9]\d{2}\s?\d{3}\b/i);
                    if (inner && inner[0].length < cand.length && inner[0].length >= 15 && isCompleteAddress(inner[0]) && !isCompleteAddress(cand.replace(inner[0], "").trim() || "x")) {
                        if (cand.indexOf(inner[0]) > 0 || cand.length > cand.indexOf(inner[0]) + inner[0].length) cand = inner[0];
                    }
                }
                if (cand.length >= 15 && isCompleteAddress(cand) && leftText.includes(cand)) {
                    if (!isRow) {
                        const block = blockAround(i);
                        if (block.length > 1 && !leftNorm.includes(normWs(block.join(" ")))) continue;   // part of a scrubbed address
                    }
                    addTarget(cand, "Address", "pt-address", 85);
                }
            }
        }
        // Multi-line addresses identical on both sides: label each line of the block.
        for (let i = 0; i < rightLines.length; i++) {
            if (!isAddrLine(rightLines[i]) || (i > 0 && isAddrLine(rightLines[i - 1]))) continue;   // start of a block only
            const block = blockAround(i);
            if (block.length < 2) continue;
            const joined = block.join(", ");
            if (!isCompleteAddress(joined) && !isCompleteAddress(block.join(" "))) continue;
            if (!leftNorm.includes(normWs(block.join(" ")))) continue;
            for (const l of block) addTarget(l.replace(/[,\s]+$/, ""), "Address", "pt-address", 85, true);
        }
        // (v11.4.0) Partial addresses count too: a street on its own ("MG Road", "221B Baker Street, London", "Rua Augusta
        // 1500", "Jl. Sudirman No. 12") with whatever place names follow it on the line. A city, state, country or PIN alone
        // is still not an address. Same rules as above: identical on both sides, never a fragment of a scrubbed address.
        {
            const re = new RegExp(PARTIAL_ADDRESS_SOURCE, "g");
            const lines = rightText.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.length > 400 || /[{};=<>]/.test(line)) continue;
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(line)) !== null) {
                    const cand = m[0].replace(/[,\s]+$/, "");
                    if (!isPartialAddress(cand) || !leftText.includes(cand)) continue;
                    let covered = false;
                    for (const t of targetMap.values()) if (t.label === "Address" && t.text !== cand && t.text.includes(cand)) { covered = true; break; }
                    if (covered) continue;
                    const block = blockAround(i);
                    if (block.length > 1 && !leftNorm.includes(normWs(block.join(" ")))) continue;   // part of a scrubbed address
                    addTarget(cand, "Address", "pt-address", 84, true);
                }
            }
        }

        // Step 11: Credential key-value lines ("Password - x", "PAN: y", "OTP is 123456").
        // Rule: the value is labeled Credentials ONLY when the same key carries the same value on both sides.
        // A changed value is correctly scrubbed and gets no label at all.
        {
            const leftCred = new Map();   // value -> true when it appears as a credential value on the left
            for (const l of leftText.split("\n")) for (const cv of credentialValuesInLine(l)) leftCred.set(cv.value, true);
            for (const l of rightText.split("\n")) {
                for (const cv of credentialValuesInLine(l)) {
                    if (leftCred.has(cv.value)) addTarget(cv.value, "Credentials", "pt-credentials", 98, true);
                }
            }
        }

        // Step 11B: Name lists ("Invited Aman Baurasi, Amlen Lakra, ..."): when most names in a run were scrubbed,
        // the parts that were kept identical ("Baurasi", "Shivam") are real name parts -> Person Name.
        {
            const leftWords = new Set((leftText.match(/[A-Za-z][A-Za-z'-]+/g) || []));
            for (const line of rightText.split("\n")) {
                const words = line.match(/[A-Za-z][A-Za-z'-]+/g) || [];
                let run = [];
                const flush = () => {
                    if (run.length >= 4) {
                        // (v10.5.3) only words that replaced a NAME count. "Microsoft Verorydelt, Pixelforge, Google" replaced
                        // ordinary words (Office, Photoshop), so Microsoft / Google are not kept name parts.
                        const scrubbed = run.filter(w => !leftWords.has(w) && __ptScrubbedNameWords.has(w)).length;
                        const capitalised = run.filter(w => /^[A-Z]/.test(w)).length;   // a list of NAMES, not code identifiers
                        if (scrubbed >= 2 && scrubbed >= run.length / 3 && capitalised >= Math.max(3, run.length * 0.6)) {
                            for (const w of run) if (leftWords.has(w) && w.length >= 4 && !isCommonWord(w) && !isCalendarWord(w) && !isLanguageWord(w) &&
                                !KNOWN_BUSINESS_NAMES.has(w.toLowerCase()) && !TECH_TOOLS.has(w.toLowerCase())) addTarget(w, "Person Name", "pt-person", 85);
                        }
                    }
                    run = [];
                };
                for (const w of words) {
                    const nameLike = (/^[A-Z][a-z'-]+$/.test(w) || /^[a-z]{3,}$/.test(w)) && !isCommonWord(w) && !isCalendarWord(w) && !PLACES.has(w.toLowerCase());
                    if (nameLike) run.push(w); else flush();
                }
                flush();
            }
        }

        // Step 12: Unchanged names on lines shaped like lines whose name WAS scrubbed (e.g. one slide per person:
        // "# Furkan" -> "# Arcorahale" was scrubbed, so the unchanged "# Joaquim" is a Person Name too).
        if (__ptNameShapes.size > 0) {
            const leftLineSet = new Set(leftText.split("\n").map(l => l.trim()));
            for (const raw of rightText.split("\n")) {
                const line = raw.trim();
                if (!line || !leftLineSet.has(line)) continue;
                for (const shape of __ptNameShapes) {
                    const [pre, post] = shape.split("\u0000");
                    const norm = line.replace(/\d+/g, "#");
                    if (!norm.startsWith(pre) || !norm.endsWith(post) || norm.length <= pre.length + post.length) continue;
                    const name = line.slice(pre.length, line.length - post.length).trim();
                    if (looksLikeProperNounPhrase(name) && !/\b(?:inc|ltd|llc|llp|plc|pvt|corp|technologies|solutions)\b/i.test(name)) {
                        addTarget(name, "Person Name", "pt-person", 85);
                    }
                }
            }
        }

        // (v11.3.5) A link is one label: an e-mail address or IP address that only occurs inside a labeled link
        // ("https://user:pass@git.acme.io/r.git", "https://203.0.113.45/admin") is part of that link, not a second label.
        {
            const urlTexts = Array.from(targetMap.values()).filter(t => t.label === "URL/Link").map(t => t.text);
            if (urlTexts.length > 0) {
                const spans = [];
                for (const u of urlTexts) {
                    let i = rightText.indexOf(u);
                    while (i !== -1) { spans.push([i, i + u.length]); i = rightText.indexOf(u, i + 1); }
                }
                for (const [key, t] of targetMap) {
                    if (t.label !== "Email Address" && t.label !== "IP Address") continue;
                    const occ = occurrencesOf(t.text, rightText);
                    if (occ.length > 0 && occ.every(i => spans.some(([a, b]) => i >= a && i < b))) targetMap.delete(key);
                }
            }
        }

        // (v11.4.4) A changed ordinary date is Overscrubbed: only a date of birth may be scrubbed. The label covers the changed
        // part of the date ("12 March 2025" -> "19 April 2025": "19 April"; "12-03-2025" -> "19-04-2025": "19-04"); when only the
        // day changed, the whole date (a bare "19" would also match other numbers on the page). A changed DOB gets no label.
        {
            const MON = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
            const DATE_SRC = "(?:\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?\\s+" + MON + "(?:,?\\s+\\d{4})?|" + MON + "\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)";
            const DATE_IN = new RegExp("(?<![\\w/.-])" + DATE_SRC + "(?![\\w/-]|\\.\\d)", "gi");
            const DATE_ALL = new RegExp("^" + DATE_SRC + "$", "i");
            const DOB_RE = /\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date|birthday|born|date_of_birth|birth_date|birthdate)\b/i;
            const lLines = leftText.split("\n");
            for (const rLine of rightText.split("\n")) {
                if (rLine.length > 1000) continue;
                DATE_IN.lastIndex = 0;
                let dm;
                while ((dm = DATE_IN.exec(rLine)) !== null) {
                    const dr = dm[0];
                    const P = rLine.slice(0, dm.index), Sx = rLine.slice(dm.index + dr.length);
                    let dl = null, lLine = null;
                    for (const l of lLines) {
                        if (l.length > P.length + Sx.length && l.startsWith(P) && l.endsWith(Sx)) {
                            const mid = l.slice(P.length, l.length - Sx.length);
                            if (mid !== dr && DATE_ALL.test(mid)) { dl = mid; lLine = l; break; }
                        }
                    }
                    if (!dl || DOB_RE.test(rLine) || DOB_RE.test(lLine)) continue;
                    const tok = (x) => x.match(/\d+|[A-Za-z]+\.?|[^A-Za-z\d]+/g) || [];
                    const lt = tok(dl), rt = tok(dr);
                    let span = dr;
                    if (lt.length === rt.length) {
                        let a = 0, b = rt.length - 1;
                        while (a < rt.length && lt[a] === rt[a]) a++;
                        while (b > a && lt[b] === rt[b]) b--;
                        span = rt.slice(a, b + 1).join("").trim();
                        if (/^\d{1,3}$/.test(span) || span.length < 2) span = dr;
                    }
                    const ex = targetMap.get(span);
                    if (!ex || ex.priority < 70) targetMap.set(span, { text: span, label: "Overscrubbed", cls: "pt-overscrub", priority: 70 });
                    for (const [k, t] of targetMap) if (t.label === "Overscrubbed" && k !== span && span.includes(k) && dr.includes(k)) targetMap.delete(k);
                }
            }
        }

        // (v11.4.0) The old "Contact Number" label is split: every phone found by the older scans (tables, key-value lines)
        // gets Indian Mobile Number or International Phone Number.
        for (const t of targetMap.values()) if (t.label === "Contact Number") t.label = phoneLabelFor(t.text) || LBL_INTL_PHONE;

        const __result = Array.from(targetMap.values()).sort((a, b) => b.text.length - a.text.length);
        // Words that replaced a NAME (scrubbed names) travel with the result (also through the cache) for the mistake check.
        __result.scrubbedNames = new Set([...__ptScrubbedNameWords, ...__ptNameCellWords]);
        __result.ordinaryWords = new Set(__ptOrdinaryOrigins);
        return __result;

    }

    if (typeof window !== 'undefined') {
        window.__pt_extractDynamicTargets = extractDynamicTargets;
    }


    function applyAllTargetsInSinglePass(rightPane, targets) {
        if (!targets || targets.length === 0) return 0;

        const lookup = new Map();
        const numTargets = [];
        const wordTargets = [];
        const urlTargets = [];

        for (const t of targets) {
            lookup.set(t.text, t);
            lookup.set(t.text.toLowerCase(), t);
            const escaped = t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (t.label === "URL/Link" || /^https:\/\//i.test(t.text)) urlTargets.push(escaped);
            else if (/^\d+$/.test(t.text)) numTargets.push(escaped);
            else wordTargets.push(escaped);
        }

        const patternParts = [];
        if (urlTargets.length > 0) {
            urlTargets.sort((a, b) => b.length - a.length);
            // (v11.3.5) a link followed by sentence punctuation ("... https://a.io/x." / "https://a.io/x, then") is still that link
            patternParts.push('(?<![a-zA-Z0-9_-])(?:' + urlTargets.join('|') + ')(?=[.,;:!?]*(?:[\\s"\'<>\\]\\)]|$))');
        }
        if (numTargets.length > 0) {
            numTargets.sort((a, b) => b.length - a.length);
            patternParts.push('(?<!\\d)(?:' + numTargets.join('|') + ')(?!\\d)');
        }
        if (wordTargets.length > 0) {
            wordTargets.sort((a, b) => b.length - a.length);
            patternParts.push('\\b(?:' + wordTargets.join('|') + ')\\b');
        }
        if (patternParts.length === 0) return 0;

        const combinedRegex = new RegExp(patternParts.join('|'), 'gi');
        const walker = document.createTreeWalker(rightPane, NodeFilter.SHOW_TEXT, null, false);
        const tasks = [];
        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent || parent.closest("#pt-floating-bar, button, .labels-bar")) continue;
            if (parent.classList.contains("pt-tag") || parent.closest(".pt-tag")) continue;

            // If text node is already inside a platform annotation that correctly matches this target, skip it
            const existingAnnotation = parent.closest(PLATFORM_MARK_SELECTOR);
            if (existingAnnotation && !existingAnnotation.classList.contains("pt-tag") && !existingAnnotation.closest("#pt-floating-bar")) {
                let cleanAnn = "";
                try {
                    const clone = existingAnnotation.cloneNode(true);
                    for (const own of clone.querySelectorAll(".pt-tag")) own.replaceWith(own.ownerDocument.createTextNode(own.textContent));
                    const pts = clone.querySelectorAll("svg, i, [class*='anticon']");
                    for (let b = 0; b < pts.length; b++) pts[b].remove();
                    const childEls = clone.querySelectorAll("*");
                    for (let b = 0; b < childEls.length; b++) {
                        const ct = (childEls[b].textContent || "").trim();
                        if (LABEL_NAME_SET.has(ct.toLowerCase()) || /^[\u00D7\u2715xX]$/.test(ct)) {
                            childEls[b].remove();
                        }
                    }
                    cleanAnn = (clone.textContent || "").trim();
                } catch (e) {
                    cleanAnn = (existingAnnotation.textContent || "").trim();
                }
                if (!cleanAnn) cleanAnn = (existingAnnotation.textContent || "").trim();
                cleanAnn = cleanAnn.replace(/[\r\n\t]+/g, ' ').replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
                const annText = cleanAnn;
                let expected = lookup.get(annText) || lookup.get(annText.toLowerCase()) || lookup.get(cleanAnn) || lookup.get(cleanAnn.toLowerCase());
                if (!expected && (cleanAnn.includes('-') || cleanAnn.includes('/') || cleanAnn.includes('_') || cleanAnn.includes(' '))) {
                    const subWords = cleanAnn.split(/[\-_/\s]+/).filter(w => w.length >= 2);
                    const allOverscrub = subWords.length > 0 && subWords.every(sw => {
                        const m = lookup.get(sw) || lookup.get(sw.toLowerCase());
                        return m && m.label === "Overscrubbed";
                    });
                    if (allOverscrub) {
                        expected = { label: "Overscrubbed" };
                    } else {
                        for (const sw of subWords) {
                            const m = lookup.get(sw) || lookup.get(sw.toLowerCase());
                            if (m && m.label === "Overscrubbed") {
                                expected = m;
                                break;
                            }
                        }
                    }
                }
                const assignedCat = detectAssignedCategory(existingAnnotation);
                const isAnnotatedOverscrub = assignedCat === "Overscrubbed";
                if (expected) {
                    const expLabel = expected.label.toLowerCase();
                    const matches = assignedCat ? (assignedCat.toLowerCase() === expLabel || (expLabel.includes("cred") && assignedCat.toLowerCase().includes("cred")) || (expLabel.includes("overscrub") && isAnnotatedOverscrub)) : true;
                    if (matches) {
                        // Already correctly annotated by the user or platform: keep extension tag invisible
                        continue;
                    }
                } else if (isAnnotatedOverscrub) {
                    // Valid overscrubbed annotation: keep extension tag invisible
                    continue;
                }
            }

            const val = node.nodeValue;
            if (!val || val.length < 2) continue;

            combinedRegex.lastIndex = 0;
            const nodeMatches = [];
            let m;
            while ((m = combinedRegex.exec(val)) !== null) {
                const matchText = m[0];
                const targetObj = lookup.get(matchText) || lookup.get(matchText.toLowerCase()) || lookup.get(matchText.toUpperCase());
                if (targetObj) {
                    if (targetObj.label === "Person Name" && matchText[0] !== matchText[0].toUpperCase()) continue;
                    if (targetObj.label !== "URL/Link") {
                        let tokStart = m.index;
                        while (tokStart > 0 && !/\s/.test(val[tokStart - 1])) tokStart--;
                        let tokEnd = m.index + matchText.length;
                        while (tokEnd < val.length && !/\s/.test(val[tokEnd])) tokEnd++;
                        const fullToken = val.slice(tokStart, tokEnd);
                        if (isPartOfUrl(fullToken) || fullToken.includes("://") || /\.[a-z]{2,}(?:\/|$)/i.test(fullToken)) {
                            continue;
                        }
                        // User rule: "in mail it is crtly srubbed then it should not be marked"
                        if (targetObj.label === "Overscrubbed" && (fullToken.includes("@") || isEmailAddressFormat(fullToken.replace(/^[<"'\s]+|[>"'\s]+$/g, '')))) {
                            continue;
                        }
                    }
                    nodeMatches.push({ idx: m.index, length: matchText.length, text: matchText, target: targetObj });
                }
            }
            if (nodeMatches.length > 0) tasks.push({ node, matches: nodeMatches });
        }

        let totalApplied = 0;
        for (const task of tasks) {
            for (let i = task.matches.length - 1; i >= 0; i--) {
                const m = task.matches[i];
                try {
                    const span = document.createElement("span");
                    span.className = `pt-tag ${m.target.cls}`;
                    span.textContent = m.text;
                    span.setAttribute("data-label", m.target.label);
                    span.title = `${m.target.label}: ${m.text}`;

                    const after = task.node.splitText(m.idx);
                    after.nodeValue = after.nodeValue.substring(m.length);
                    task.node.parentNode.insertBefore(span, after);
                    totalApplied++;
                } catch (e) {}
            }
        }
        return totalApplied;
    }


    function getAnnotationFingerprint(pane) {
        if (!pane) return "";
        const root = (pane.closest("[class*='col'], [class*='pane'], [class*='document'], [class*='editor']") || pane.parentElement || pane);
        const marks = root.querySelectorAll(PLATFORM_MARK_SELECTOR);
        // (v10.4.2) No root.innerHTML: serialising the whole document every 1.5 s was expensive on long documents.
        let fp = marks.length + ":" + root.querySelectorAll("[class*='ant-tag'], [class*='annotation'], mark").length + ":";
        for (let i = 0; i < marks.length; i++) {
            const m = marks[i];
            if (m.classList.contains("pt-tag") || m.id === "pt-floating-bar" || m.closest("#pt-floating-bar")) continue;
            fp += `${m.textContent || ''}_${m.className || ''}_${m.getAttribute('data-label') || ''}_${m.getAttribute('data-entity') || ''}_${m.getAttribute('data-type') || ''}_${m.getAttribute('data-category') || ''}_${m.getAttribute('data-annotation') || ''}_${m.getAttribute('aria-label') || ''}_${m.getAttribute('title') || ''}_${m.getAttribute('style') || ''};`;
        }
        // (v10.4.5) Labels applied by the reviewer can be plain inline-styled spans (coloured background) that
        // match none of the selectors above. Without them, applying or changing a label did not trigger a
        // re-audit, so the suggestion stayed and no mistake outline appeared.
        const styled = pane.querySelectorAll("span[style], [style*='background']");
        fp += "|S" + styled.length + ":";
        for (let i = 0; i < styled.length; i++) {
            const s = styled[i];
            if (s.classList.contains("pt-tag")) continue;
            fp += (s.className || "") + "~" + (s.getAttribute("style") || "") + "~" + (s.textContent || "").slice(0, 40) + ";";
        }
        return fp;
    }



    function paneSnapshot(leftPane, rightPane) {
        // Plain string concatenation + native === comparison: far cheaper than hashing every character in JS
        // (which took ~60 ms per pane on long documents, on every 1.5 s heartbeat).
        return (leftPane.textContent || "") + "\u0001" + (rightPane.textContent || "") + "###" + getAnnotationFingerprint(rightPane);
    }

    // ==================================================================
    // Large-document mode (v10.4.3)
    // On long documents the auditor only analyses and tags the part of the document that is on screen
    // (plus a margin above and below), and re-runs when you scroll. Work is proportional to the screen,
    // not to the document, so the browser never hangs however long the document is.
    // ==================================================================
    const VIEWPORT_MODE_CHARS = 60000;      // right document longer than this -> viewport mode
    const VIEWPORT_MODE_LINES = 1500;
    const VIEWPORT_MARGIN_LINES = 150;      // extra lines analysed above and below the visible part
    const BLOCK_TAGS = new Set(["P", "DIV", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE", "DT", "DD", "TABLE", "UL", "OL", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGCAPTION", "CAPTION", "BR", "HR"]);

    // Text of a pane split into lines WITHOUT forcing a layout (innerText does). Each line remembers the
    // block element it came from, so visible lines can be found and tagged.
    function readPaneLines(pane) {
        const segs = [];   // { el, text }
        const blockOf = new Map();
        const nearestBlock = (el) => {
            const hit = blockOf.get(el);
            if (hit) return hit;
            let b = el;
            while (b && b !== pane && !BLOCK_TAGS.has(b.tagName)) b = b.parentElement;
            const res = b || pane;
            blockOf.set(el, res);
            return res;
        };
        const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, null, false);
        let node, cur = null;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent || parent.closest("#pt-floating-bar")) continue;
            const blk = nearestBlock(parent);
            if (!cur || cur.el !== blk) { cur = { el: blk, text: "" }; segs.push(cur); }
            cur.text += node.nodeValue;
        }
        const lines = [], lineEl = [];
        for (const s of segs) {
            for (const part of s.text.split("\n")) { lines.push(part); lineEl.push(s.el); }
        }
        return { lines, lineEl, text: lines.join("\n") };
    }

    // Indices [first, last] of the lines whose block is on screen (binary search on block positions).
    function visibleLineRange(pane, info) {
        const pr = pane.getBoundingClientRect();
        const top = Math.max(0, pr.top), bottom = Math.min(window.innerHeight || pr.bottom, pr.bottom);
        const n = info.lines.length;
        if (n === 0) return [0, -1];
        const rectOf = (i) => info.lineEl[i].getBoundingClientRect();
        let lo = 0, hi = n - 1;
        while (lo < hi) {                    // first line whose block bottom is below the top edge
            const mid = (lo + hi) >> 1;
            if (rectOf(mid).bottom < top) lo = mid + 1; else hi = mid;
        }
        let last = lo;
        while (last + 1 < n && rectOf(last + 1).top <= bottom) last++;
        return [lo, last];
    }

    // Map a right-side line range to the matching left-side range using identical lines as anchors.
    function matchingLeftRange(leftLines, rightLines, ra, rb) {
        const L = leftLines.map(s => s.trim()), R = rightLines.map(s => s.trim());
        const ms = myersMatches(L, R, 3000) || [];
        let la = 0, lb = L.length - 1;
        if (ms.length === 0) {
            const k = L.length / Math.max(1, R.length);
            return [Math.max(0, Math.floor(ra * k) - VIEWPORT_MARGIN_LINES), Math.min(L.length - 1, Math.ceil(rb * k) + VIEWPORT_MARGIN_LINES)];
        }
        for (const [i, j] of ms) { if (j <= ra) la = i; if (j >= rb) { lb = i; break; } }
        return [la, lb];
    }

    // Adaptive pacing: a run that took N ms is not repeated by the background heartbeat for at least 4 x N ms,
    // and edits are debounced for at least N ms, so a slow document can never keep the page busy.

    function runDynamicAutoAnnotation() {
        if (isModifyingDOM) return;
        if (isUserMouseDown) return;

        const onScreen = isAnnotationReviewScreen();

        if (!onScreen) {
            ensurePill();
            updatePillState();
            cachedLeftPane = null;
            cachedRightPane = null;
            lastAnnotatedSnapshot = "";
            return;
        }

        window.__pt_auto_active = true;
        ensurePill();

        // Only short header-like elements: "[class*='doc']" used to match the document container itself, so the whole
        // document text was copied and compared on every run.
        const fileHeaders = Array.from(document.querySelectorAll("h1, h2, h3, [class*='title'], [class*='file']"))
            .filter(e => e.childElementCount <= 6).map(e => (e.textContent || "").trim().slice(0, 200)).filter(Boolean).slice(0, 30).join("__");
        const currentSig = `${location.href}__${fileHeaders}`;
        if (lastTaskSignature && currentSig !== lastTaskSignature) {
            cachedLeftPane = null;
            cachedRightPane = null;
            lastAnnotatedSnapshot = "";
        }
        lastTaskSignature = currentSig;

        const { leftPane, rightPane } = getPanes();
        if (!leftPane || !rightPane) return;

        // Content fingerprint check: If visible text AND platform annotations haven't changed, skip DOM re-annotation!
        const currentSnapshot = paneSnapshot(leftPane, rightPane);
        if (lastAnnotatedSnapshot && currentSnapshot === lastAnnotatedSnapshot) {
            updatePillState();
            return;
        }

        // Long documents: show a status first and give the browser one frame to paint it before the heavy work.
        if (!__ptYieldedOnce && (rightPane.textContent || "").length > LARGE_DOC_CHARS) {
            __ptYieldedOnce = true;
            const st = document.getElementById("pt-status-text");
            if (st) st.textContent = "Analysing large document\u2026";
            setTimeout(runDynamicAutoAnnotation, 40);
            return;
        }
        __ptYieldedOnce = false;
        const __runStart = Date.now();

        // Disconnect observer while modifying DOM so our own edits never trigger an observer loop!
        if (window.__pt_observer) {
            window.__pt_observer.disconnect();
        }
        isModifyingDOM = true;
        try {
            // Clean up existing tags cleanly
            // (v11.0.0) UNWRAP our old suggestion spans: move their children out, then drop the span. The old code
            // replaced each span with plain text, which deleted anything inside it - including a label the editor
            // had drawn inside our span. Only the touched parents are normalised, not the whole document.
            const existingTags = rightPane.querySelectorAll(".pt-tag");
            const touched = new Set();
            for (let i = existingTags.length - 1; i >= 0; i--) {
                const t = existingTags[i];
                const parent = t.parentNode;
                if (!parent) continue;
                while (t.firstChild) parent.insertBefore(t.firstChild, t);
                parent.removeChild(t);
                touched.add(parent);
            }
            for (const p of touched) { try { if (p.isConnected) p.normalize(); } catch (e) {} }

            // Size check without layout: long documents use viewport mode.
            const rightTC = rightPane.textContent || "";
            let leftText, rightText, targets, windowEls = null;
            if (rightTC.length > VIEWPORT_MODE_CHARS) {
                const lInfo = readPaneLines(leftPane), rInfo = readPaneLines(rightPane);
                leftText = lInfo.text;
                rightText = rInfo.text;
                if (rInfo.lines.length > VIEWPORT_MODE_LINES || rightText.length > VIEWPORT_MODE_CHARS) {
                    const [va, vb] = visibleLineRange(rightPane, rInfo);
                    const ra = Math.max(0, va - VIEWPORT_MARGIN_LINES), rb = Math.min(rInfo.lines.length - 1, vb + VIEWPORT_MARGIN_LINES);
                    const [la, lb] = matchingLeftRange(lInfo.lines, rInfo.lines, ra, rb);
                    const lWin = lInfo.lines.slice(la, lb + 1).join("\n");
                    const rWin = rInfo.lines.slice(ra, rb + 1).join("\n");
                    targets = extractDynamicTargets(leftPane, rightPane, { left: lWin, right: rWin });
                    windowEls = Array.from(new Set(rInfo.lineEl.slice(ra, rb + 1)));
                    // Tag only the blocks in the window (outermost ones; nested blocks are covered by their parent).
                    const winSet = new Set(windowEls);
                    windowEls = windowEls.filter(el => { for (let p = el.parentElement; p && p !== rightPane; p = p.parentElement) if (winSet.has(p)) return false; return true; });
                    for (const el of windowEls) applyAllTargetsInSinglePass(el, targets);
                    __ptViewportInfo = { ra, rb, total: rInfo.lines.length };
                } else {
                    targets = extractDynamicTargets(leftPane, rightPane, { left: leftText, right: rightText });
                    applyAllTargetsInSinglePass(rightPane, targets);
                    __ptViewportInfo = null;
                }
            } else {
                // Read each pane's text ONCE per run (innerText forces a layout of the whole document).
                // innerText keeps line breaks; where it is unavailable, rebuild lines from the block elements.
                leftText = leftPane.innerText != null ? leftPane.innerText : readPaneLines(leftPane).text;
                rightText = rightPane.innerText != null ? rightPane.innerText : readPaneLines(rightPane).text;
                targets = extractDynamicTargets(leftPane, rightPane, { left: leftText, right: rightText });
                applyAllTargetsInSinglePass(rightPane, targets);
                __ptViewportInfo = null;
            }

            // Label check: judge every label you applied (see LABEL CHECK above).
            try { runLabelCheck(rightPane, leftText, rightText, targets, windowEls); } catch (e) { __ptLastError = String(e && e.stack || e); }

            // Save snapshot with platform annotation fingerprint after pass (using reflow-free textContent)
            lastAnnotatedSnapshot = paneSnapshot(leftPane, rightPane);
            updatePillState();
            if (__ptViewportInfo) {
                const st = document.getElementById("pt-status-text");
                if (st && st.textContent.indexOf("lines") < 0) st.title = "Large document: auditing lines " + (__ptViewportInfo.ra + 1) + "-" + (__ptViewportInfo.rb + 1) + " of " + __ptViewportInfo.total + " (follows your scrolling)";
            }
            __ptLastError = null;
        } catch (err) {
            // Never let one bad page break the auditor: report once, remember the page so the heartbeat does not
            // retry the same failing content in a loop, and keep the bar usable.
            __ptLastError = String(err && err.stack || err);
            console.warn("[PeakTalent] audit skipped on this page:", err);
            try { lastAnnotatedSnapshot = paneSnapshot(leftPane, rightPane); } catch (e) {}
            const st = document.getElementById("pt-status-text");
            if (st) { st.textContent = "Audit error (Alt+Shift+D)"; st.title = "The auditor hit an unexpected page layout. Press Alt+Shift+D and send the console output."; }
        } finally {
            isModifyingDOM = false;
            lastRunMs = Date.now() - __runStart;
            lastRunEnd = Date.now();
            // Purge any pending mutations caused by our own DOM modifications before reconnecting
            if (window.__pt_observer) {
                window.__pt_observer.takeRecords();
                window.__pt_observer.observe(document.body, { 
                    childList: true, 
                    subtree: true, 
                    characterData: true, 
                    attributes: true, 
                    attributeFilter: ["class", "style", "data-label", "data-entity", "data-type", "data-category", "data-annotation", "aria-label", "title"] 
                });
            }
        }
    }

    // High-Efficiency Debounce Trigger (prevents thrashing while typing or editing)
    function triggerUpdate(delay = 120) {
        if (!window.__pt_auto_active) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        delay = Math.max(delay, Math.min(lastRunMs, 3000));
        debounceTimer = setTimeout(() => {
            runDynamicAutoAnnotation();
        }, delay);
    }

    // 1. Focused DOM Mutation Observer (Observes only external DOM changes)
    const observer = new MutationObserver((mutations) => {
        if (!window.__pt_auto_active || isModifyingDOM) return;
        let shouldUpdate = false;
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.type === "characterData") {
                const parent = m.target.parentElement;
                if (!parent || (!parent.classList.contains("pt-tag") && parent.id !== "pt-floating-bar" && !parent.closest("#pt-floating-bar"))) {
                    shouldUpdate = true;
                    break;
                }
            } else if (m.type === "childList" && m.addedNodes.length > 0) {
                for (let j = 0; j < m.addedNodes.length; j++) {
                    const n = m.addedNodes[j];
                    if (n.nodeType === 1 && !n.classList.contains("pt-tag") && !n.classList.contains("pt-mistake-box") && n.id !== "pt-floating-bar" && n.id !== "pt-diag-panel" && !n.closest("#pt-floating-bar, #pt-diag-panel")) {
                        shouldUpdate = true;
                        break;
                    }
                }
            } else if (m.type === "attributes") {
                const target = m.target;
                if (target && !target.classList.contains("pt-tag") && !target.classList.contains("pt-mistake-box") && target.id !== "pt-floating-bar" && !target.closest("#pt-floating-bar")) {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) break;
        }
        if (shouldUpdate) {
            // (v10.6.1) A change INSIDE the right document (you applied, changed or removed a label) always re-runs
            // the mistake check. Labels drawn with CSS classes only did not change the change-detection snapshot,
            // so the check was skipped and no red outline appeared.
            const rp = cachedRightPane;
            if (rp && mutations.some(m => m.target && (m.target === rp || rp.contains(m.target)) &&
                !(m.target.classList && m.target.classList.contains("pt-tag")))) {
                lastAnnotatedSnapshot = "";
            }
            triggerUpdate(120);
        }
    });
    observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        characterData: true, 
        attributes: true, 
        attributeFilter: ["class", "style", "data-label", "data-entity", "data-type", "data-category", "data-annotation", "aria-label", "title"] 
    });
    window.__pt_observer = observer;

    // 2. User Interaction Listeners (Immediate response on labeling / clicking with zero lag)
    ptOn(document, "mousedown", () => {
        isUserMouseDown = true;
    }, { capture: true, passive: true });

    // One debounced rescan per interaction. The platform's own DOM updates after a click are picked up by the
    // MutationObserver, so the old 40ms + 200ms + 450ms triple re-run is unnecessary.
    const onPointerDone = () => {
        isUserMouseDown = false;
        lastAnnotatedSnapshot = "";
        triggerUpdate(250);
    };
    ptOn(document, "mouseup", onPointerDone, { capture: true, passive: true });
    ptOn(document, "click", onPointerDone, { capture: true, passive: true });

    ptOn(document, "keyup", () => triggerUpdate(250), { capture: true, passive: true });
    ptOn(document, "visibilitychange", () => {
        if (!document.hidden) triggerUpdate(100);
    });
    ptOn(window, "focus", () => triggerUpdate(100));

    // Keyboard shortcuts: Alt+Shift+A = re-audit now, Alt+Shift+H = hide / show the floating bar.
    // (Cmd/Ctrl+Shift+A is taken by the browser's tab search, so Alt is used.)
    function forceRescan() {
        window.__pt_auto_active = true;
        lastAnnotatedSnapshot = "";
        runDynamicAutoAnnotation();
    }
    // Alt+Shift+D: print what the auditor sees, for bug reports (no document text leaves the browser).
    function printDiagnostics() {
        const lines = [];
        const fmt = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch (x) { return String(v); } })();
        const out = (...a) => { console.log(...a); lines.push(a.map(fmt).join(' ')); };
        const { leftPane, rightPane } = getPanes();
        const ident = (el) => el ? (el.tagName + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "")) : "none";
        out("[PeakTalent] v" + PT_VERSION + " diagnostics");
        out("  browser:", navigator.userAgent);
        out("  running as:", (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) ? "browser extension" : "userscript / console");
        out("  review screen:", isAnnotationReviewScreen(), "| panes:", ident(leftPane), "/", ident(rightPane), "| right text:", rightPane ? (rightPane.textContent || "").length : 0, "chars | last run:", lastRunMs + " ms");
        out("  suggestions on screen:", document.querySelectorAll(".pt-tag").length, "| mistakes:", __ptcMistakes.length);
        try {
            const s = __ptLabelStats;
            if (s) out("  not checked:", labelsNotChecked(), "| errors:", s.errors | 0, "| unread:", s.unread | 0, "| unsure (shared colour):", s.ambiguous | 0, "| too short:", (s.skipped || {}).tooShort | 0, "| too long:", (s.skipped || {}).tooLong | 0, "| checked:", s.checked | 0, s.lastError ? "| last check error: " + s.lastError : "");
        } catch (e) {}
        if (__ptLastError) out("  last error:", __ptLastError);
        try {
            __ptPalette.t = 0;
            const pal = learnPalette();
            out("  label colours: " + (__ptPalette.learned || 0) + " of 13 read from the chips, the rest built-in");
            const byName = {};
            for (const p of pal) (byName[p.name] = byName[p.name] || []).push((p.builtin ? "builtin " : "") + "rgb(" + p.rgb.join(",") + ")");
            for (const k of Object.keys(byName)) out("    " + k + ": " + byName[k].slice(0, 3).join(" | "));
            const chip = Array.from(document.querySelectorAll("span, div, button")).find(x => (x.textContent || "").trim() === "Date" && x.childElementCount <= 3);
            if (chip) { const cs = getComputedStyle(chip); out("  raw 'Date' chip style:", cs.backgroundColor, "|", cs.color, "|", cs.borderTopColor, "| dot:", chip.querySelector("*") ? getComputedStyle(chip.querySelector("*")).backgroundColor : "-"); }
        } catch (e) { out("  palette read failed:", String(e)); }
        if (__ptLabelStats) out("  label check:", __ptLabelStats);
        out("  labels learned from the label dialog:", __ptDialogLabels.size);
        if (rightPane) {
            const marks = Array.from(rightPane.querySelectorAll("mark")).slice(0, 15);
            out("  first <mark> labels in the right document (text | raw colours | label read | verdict):");
            for (const m of marks) {
                const cs = getComputedStyle(m);
                out("    " + JSON.stringify((m.textContent || "").trim().slice(0, 30)) + " | bg " + cs.backgroundColor + " | img " + String(cs.backgroundImage).slice(0, 80) + " | border " + cs.borderBottomWidth + " " + cs.borderBottomColor +
                    " | read: " + (detectAssignedCategory(m) || "(none)") + " | " + (m.getAttribute("data-ptc") || "-") + (m.getAttribute("data-ptc-expected") ? " -> " + m.getAttribute("data-ptc-expected") : ""));
            }
            if (!marks.length) {
                const any = Array.from(rightPane.querySelectorAll("span, u, ins, a, b, em, strong")).filter(x => !x.classList.contains("pt-tag")).slice(0, 8);
                out("  no <mark> elements; first inline elements:");
                for (const x of any) out("    " + x.outerHTML.slice(0, 200));
            }
        }
        return lines.join("\n");
    }
    // A panel with the diagnostics text and a Copy button (nothing is sent anywhere).
    function showDiagnostics() {
        const text = printDiagnostics() || "";
        let panel = document.getElementById("pt-diag-panel");
        if (panel) panel.remove();
        panel = document.createElement("div");
        panel.id = "pt-diag-panel";
        panel.setAttribute("style", "position:fixed;z-index:2147483646;right:24px;top:80px;width:min(760px,90vw);height:min(70vh,640px);background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;font:12px/1.4 ui-monospace,Menlo,monospace");
        panel.innerHTML = '<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #334155"><b style="flex:1">PeakTalent auditor - diagnostics</b><button id="pt-diag-copy" style="cursor:pointer">Copy</button><button id="pt-diag-close" style="cursor:pointer">Close</button></div>';
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.readOnly = true;
        ta.setAttribute("style", "flex:1;margin:0;padding:10px;background:#0f172a;color:#e2e8f0;border:0;resize:none;font:inherit;white-space:pre");
        panel.appendChild(ta);
        document.body.appendChild(panel);
        document.getElementById("pt-diag-close").onclick = () => panel.remove();
        document.getElementById("pt-diag-copy").onclick = () => {
            ta.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (e) {}
            if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
            document.getElementById("pt-diag-copy").textContent = "Copied";
        };
    }
    function toggleBarVisibility() {
        const bar = document.getElementById("pt-floating-bar");
        if (bar) bar.style.setProperty("display", bar.style.display === "none" ? "inline-flex" : "none", "important");
    }
    ptOn(document, "keydown", (e) => {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
        const k = (e.code || "").replace("Key", "").toUpperCase() || (e.key || "").toUpperCase();
        if (k === "A") { e.preventDefault(); forceRescan(); }
        else if (k === "H") { e.preventDefault(); toggleBarVisibility(); }
        else if (k === "D") { e.preventDefault(); showDiagnostics(); }
    }, { capture: true });

    // Toolbar popup "Re-Audit" button (Chrome / Edge / Brave extension only).
    let __ptMessageListener = null;
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        __ptMessageListener = (msg, _sender, sendResponse) => {
            if (msg && msg.action === "rescan") { forceRescan(); sendResponse({ ok: true }); }
            else if (msg && msg.action === "diagnostics") { let t = ""; try { t = printDiagnostics(); } catch (e) { t = "diagnostics failed: " + e; } sendResponse({ ok: true, text: t }); }
            else if (msg && msg.action === "status") {
                let nc = 0, er = 0, am = 0;
                try { nc = labelsNotChecked(); er = (__ptLabelStats && __ptLabelStats.errors) | 0; am = (__ptLabelStats && __ptLabelStats.ambiguous) | 0; } catch (e) {}
                sendResponse({ ok: true, onReviewScreen: isAnnotationReviewScreen(), active: !!window.__pt_auto_active,
                               tags: document.querySelectorAll("span.pt-tag").length,
                               mistakes: __ptcMistakes.length, errors: er, ambiguous: am, notChecked: nc });
            }
        };
        chrome.runtime.onMessage.addListener(__ptMessageListener);
    }

    // 3. Navigation & Route Changes (originals are kept so cleanup can restore them)
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () { const r = origPush.apply(this, arguments); triggerUpdate(100); return r; };
    history.replaceState = function () { const r = origReplace.apply(this, arguments); triggerUpdate(100); return r; };
    ptOn(window, "popstate", () => triggerUpdate(100));
    ptOn(window, "hashchange", () => triggerUpdate(100));

    // 4. Lightweight Heartbeat (every 1500ms): auto-detects screen presence & platform annotations
    window.__pt_interval = setInterval(() => {
        if (!isModifyingDOM && !isUserMouseDown && Date.now() - lastRunEnd >= lastRunMs * 4) {
            const onScreen = isAnnotationReviewScreen();
            if (!onScreen) {
                cachedLeftPane = null;
                cachedRightPane = null;
                lastAnnotatedSnapshot = "";
                updatePillState();
            } else {
                updatePillState();
                if (window.__pt_auto_active) {
                    const { leftPane, rightPane } = getPanes();
                    if (leftPane && rightPane) {
                        const currentSnapshot = paneSnapshot(leftPane, rightPane);
                        if (currentSnapshot !== lastAnnotatedSnapshot) {
                            triggerUpdate(100);
                        }
                    }
                }
            }
        }
    }, 1500);

    window.__pt_cleanup = function () {
        for (const [t, type, fn, opts] of __ptListeners) { try { t.removeEventListener(type, fn, opts); } catch (e) {} }
        __ptListeners.length = 0;
        if (history.pushState !== origPush) history.pushState = origPush;
        if (history.replaceState !== origReplace) history.replaceState = origReplace;
        if (__ptMessageListener) { try { chrome.runtime.onMessage.removeListener(__ptMessageListener); } catch (e) {} }
        if (window.__pt_interval) { clearInterval(window.__pt_interval); window.__pt_interval = null; }
        if (window.__pt_observer) { window.__pt_observer.disconnect(); window.__pt_observer = null; }
        if (debounceTimer) clearTimeout(debounceTimer);
        try { __dialogObserver.disconnect(); } catch (e) {}
        window.__pt_cleanup = null;
    };
    window.__pt_rescan = forceRescan;

    // Test hook: only exposed when a test runner sets window.__PT_TEST__ before loading the script.
    if (window.__PT_TEST__) {
        window.__PT__ = {
            extractDynamicTargets, classifyDiff, isCredentialsFormat, isVehiclePlateFormat, isDateFormat,
            isIpAddressFormat, isAccountNumberFormat, isBusinessName, isPersonName, isTokenInBusinessContext,
            isCompleteAddress, diffTokensGlobalLCS, applyAllTargetsInSinglePass, VERSION: PT_VERSION,
            stats: () => ({ lastRunMs, viewport: __ptViewportInfo }), parseColourToRgba, labelStats: () => __ptLabelStats
        };
    }

    runDynamicAutoAnnotation();
    console.log("[PeakTalent] Precision Engine v" + PT_VERSION + " is active.");
})();

