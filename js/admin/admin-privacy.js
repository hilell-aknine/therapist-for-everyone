// admin-privacy.js — FIX-ENGINE F-012 (2026-07-23): מצב דמו לבקשת הלל
// Demo mode: blurs full names, phone numbers and emails across the dashboard
// so Hillel can screen-share the live CRM without exposing customer PII.
// Blur only (filter: blur) — layout stays intact, hover does NOT reveal.
(function () {
    'use strict';

    const STORAGE_KEY = 'adminDemoMode';
    const PHONE_RE = /(?:\+?972[-\s.]?|0)5\d(?:[-\s.]?\d){7}/;
    const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    // Table headers whose column holds PII (שם as word-start to avoid "נרשם" etc.)
    const HEADER_RE = /(?:^|[\s"׳'(])שם|טלפון|נייד|אימייל|מייל|דוא"ל|phone|mail|name/i;

    let _observer = null;
    let _debounce = null;

    function injectStyles() {
        if (document.getElementById('demo-mode-styles')) return;
        const style = document.createElement('style');
        style.id = 'demo-mode-styles';
        style.textContent = [
            'body.demo-mode .demo-blur,',
            'body.demo-mode .perm-user-name,',
            'body.demo-mode .perm-user-email {',
            '  filter: blur(5px) !important;',
            '  user-select: none;',
            '}',
            '#demo-mode-indicator {',
            '  position: fixed; bottom: 16px; left: 16px; z-index: 99999;',
            '  background: #003B46; color: #E8F1F2; border: 1px solid #D4AF37;',
            '  border-radius: 999px; padding: 0.5rem 1rem; font-family: inherit;',
            '  font-size: 0.85rem; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.35);',
            '  direction: rtl;',
            '}',
            '#demo-mode-indicator:hover { background: #00606B; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    // Wrap text nodes containing phones/emails in a blurred span
    function maskTextNodes(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const t = node.nodeValue;
                if (!t || t.length < 6) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || p.closest('script,style,.demo-blur,#demo-mode-indicator')) return NodeFilter.FILTER_REJECT;
                return (PHONE_RE.test(t) || EMAIL_RE.test(t)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            const span = document.createElement('span');
            span.className = 'demo-blur';
            node.parentNode.insertBefore(span, node);
            span.appendChild(node);
        }
    }

    // Blur full-name / phone / email columns in every table, by header text
    function maskTableColumns(root) {
        root.querySelectorAll('table').forEach(table => {
            const headers = table.querySelectorAll('thead th');
            if (!headers.length) return;
            const idx = [];
            headers.forEach((th, i) => { if (HEADER_RE.test(th.textContent || '')) idx.push(i); });
            if (!idx.length) return;
            table.querySelectorAll('tbody tr').forEach(tr => {
                idx.forEach(i => { if (tr.cells[i]) tr.cells[i].classList.add('demo-blur'); });
            });
        });
    }

    function applyMasking() {
        if (!document.body.classList.contains('demo-mode')) return;
        maskTableColumns(document.body);
        maskTextNodes(document.body);
        // tel:/mailto: links may not match text patterns (formatted numbers)
        document.body.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(a => a.classList.add('demo-blur'));
    }

    function startObserver() {
        if (_observer) return;
        // Idempotent passes (wrapped nodes are skipped) → self-mutations settle after one extra run
        _observer = new MutationObserver(() => {
            clearTimeout(_debounce);
            _debounce = setTimeout(applyMasking, 350);
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (_observer) { _observer.disconnect(); _observer = null; }
        clearTimeout(_debounce);
    }

    function showIndicator() {
        if (document.getElementById('demo-mode-indicator')) return;
        const btn = document.createElement('button');
        btn.id = 'demo-mode-indicator';
        btn.type = 'button';
        btn.title = 'לחיצה מכבה את מצב הדמו';
        btn.textContent = '🙈 מצב דמו פעיל — לחץ לכיבוי';
        btn.onclick = () => setActive(false);
        document.body.appendChild(btn);
    }

    function removeIndicator() {
        const el = document.getElementById('demo-mode-indicator');
        if (el) el.remove();
    }

    function isActive() {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }

    function setActive(on) {
        if (on) {
            localStorage.setItem(STORAGE_KEY, '1');
            injectStyles();
            document.body.classList.add('demo-mode');
            showIndicator();
            applyMasking();
            startObserver();
        } else {
            localStorage.removeItem(STORAGE_KEY);
            document.body.classList.remove('demo-mode'); // wrappers stay, blur CSS no longer applies
            removeIndicator();
            stopObserver();
        }
        const cb = document.getElementById('setting-demo-mode');
        if (cb) cb.checked = on;
        if (typeof showToast === 'function') {
            showToast(on ? 'מצב דמו הופעל — שמות, טלפונים ואימיילים מטושטשים' : 'מצב דמו כובה — הנתונים מוצגים כרגיל', 'success');
        }
    }

    function init() {
        if (isActive()) setActive(true);
    }

    window.AdminPrivacy = { isActive, setActive, toggle: () => setActive(!isActive()), apply: applyMasking };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
