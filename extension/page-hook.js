// PeakTalent Auditor - page hook (v11.6.0).
// Runs inside the page (Chrome: content script with "world": "MAIN", at document_start; userscript: page context) so it can
// see the review data the dashboard itself downloads. It reads ONLY the label list and the annotation spans of
// GET .../annotation-review and of the dashboard's own add / change / remove requests, and hands them to the auditor with
// window.postMessage. It never makes a request, never reads the document links (signed S3 URLs), tokens or headers, and
// never changes what the dashboard sends or receives.
(function () {
    'use strict';
    if (window.__ptHookInstalled) return;
    window.__ptHookInstalled = true;

    const REVIEW_RE = /\/api\/v1\/tasks\/[^/]+\/annotation-review(?:\/annotations(?:\/([^/?#]+))?)?\/?(?:[?#]|$)/;
    const post = (type, data) => { try { window.postMessage({ source: 'pt-auditor-hook', type, data }, window.location.origin); } catch (e) {} };
    const span = (a) => ({ id: a.id || null, label_id: a.label_id, start: a.start, end: a.end, text: typeof a.text === 'string' ? a.text : '' });

    function onReview(json) {
        if (!json || !Array.isArray(json.labels)) return;
        const data = {
            labels: json.labels.map(l => ({ id: l.id, title: l.title, slug: l.slug, color: l.color })),
            right: (json.right_annotations || []).map(span),
            left: (json.left_annotations || []).map(span),
        };
        window.__ptReviewData = data;   // for a console build pasted after the page loaded
        post('review', data);
    }

    function handle(url, method, reqBody, resText) {
        try {
            const m = REVIEW_RE.exec(url || '');
            if (!m) return;
            method = (method || 'GET').toUpperCase();
            const isAnnotations = /\/annotation-review\/annotations/.test(url);
            if (!isAnnotations && method === 'GET') { onReview(JSON.parse(resText)); return; }
            if (!isAnnotations) return;
            const id = m[1] || null;
            if (method === 'POST' && !id) {
                const body = typeof reqBody === 'string' ? JSON.parse(reqBody) : null;
                const res = resText ? JSON.parse(resText) : {};
                const spans = (body && Array.isArray(body.spans)) ? body.spans : [];
                const ids = Array.isArray(res.ids) ? res.ids : [];
                post('added', spans.map((s, i) => Object.assign(span(s), { id: ids[i] || null })));
            } else if (method === 'DELETE' && id) {
                post('removed', { id });
            } else if ((method === 'PATCH' || method === 'PUT') && id) {
                const body = typeof reqBody === 'string' ? JSON.parse(reqBody) : null;
                if (body && body.label_id) post('changed', { id, label_id: body.label_id });
            }
        } catch (e) { /* never disturb the dashboard */ }
    }

    // fetch
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const method = (init && init.method) || (input && input.method) || 'GET';
            const body = init && typeof init.body === 'string' ? init.body : null;
            const p = origFetch.apply(this, arguments);
            if (REVIEW_RE.test(url)) {
                p.then(res => { try { res.clone().text().then(t => handle(url, method, body, t)).catch(() => {}); } catch (e) {} }).catch(() => {});
            }
            return p;
        };
    }

    // XMLHttpRequest
    const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XHR) {
        const open = XHR.open, send = XHR.send;
        XHR.open = function (method, url) { this.__ptReq = { method, url: String(url || '') }; return open.apply(this, arguments); };
        XHR.send = function (body) {
            const req = this.__ptReq;
            if (req && REVIEW_RE.test(req.url)) {
                req.body = typeof body === 'string' ? body : null;
                this.addEventListener('load', () => {
                    try {
                        if (this.status < 200 || this.status >= 300) return;
                        const text = (this.responseType === '' || this.responseType === 'text') ? this.responseText
                            : this.responseType === 'json' ? JSON.stringify(this.response) : '';
                        handle(req.url, req.method, req.body, text);
                    } catch (e) {}
                });
            }
            return send.apply(this, arguments);
        };
    }
})();
