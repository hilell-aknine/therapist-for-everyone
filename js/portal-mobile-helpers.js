/**
 * Portal Mobile Helpers — Beit V'Metaplim course-library.html
 *
 * Augments the existing portal with mobile-only behavior. Activates only
 * when viewport ≤ 1024px so desktop behavior is untouched.
 *
 *  - body.modal-open scroll lock when any .modal-overlay.active appears
 *  - #aiChat fullscreen overlay on mobile (toggle via .ai-fullscreen class)
 *  - Sidebar: ESC closes, swipe-right closes, aria-expanded stays in sync
 */
(function () {
    'use strict';

    const MOBILE_QUERY = window.matchMedia('(max-width: 1024px)');
    const isMobile = () => MOBILE_QUERY.matches;

    // ----- 1. body.modal-open scroll lock -------------------------------------
    function syncModalOpenClass() {
        const anyOpen = document.querySelector('.modal-overlay.active');
        document.body.classList.toggle('modal-open', !!anyOpen);
    }

    function watchModals() {
        const overlays = document.querySelectorAll('.modal-overlay');
        if (!overlays.length) return;
        const observer = new MutationObserver(syncModalOpenClass);
        overlays.forEach(o => observer.observe(o, { attributes: true, attributeFilter: ['class', 'style'] }));
        // Initial sync in case page loads with a modal already open.
        syncModalOpenClass();
    }

    // ----- 2. AI chat fullscreen on mobile ------------------------------------
    function watchAiChat() {
        const aiChat = document.getElementById('aiChat');
        if (!aiChat) return;

        const apply = () => {
            const visible = aiChat.style.display !== 'none' &&
                            getComputedStyle(aiChat).display !== 'none';
            if (isMobile() && visible) {
                aiChat.classList.add('ai-fullscreen');
                injectAiCloseButton(aiChat);
            } else {
                aiChat.classList.remove('ai-fullscreen');
            }
        };

        const observer = new MutationObserver(apply);
        observer.observe(aiChat, { attributes: true, attributeFilter: ['style', 'class'] });
        MOBILE_QUERY.addEventListener('change', apply);
        apply();
    }

    function injectAiCloseButton(aiChat) {
        if (aiChat.querySelector('.ai-mobile-close')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-mobile-close';
        btn.setAttribute('aria-label', 'סגור צ\'אט');
        btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
        Object.assign(btn.style, {
            position: 'absolute',
            top: '0.5rem',
            insetInlineStart: '0.5rem',
            width: '44px',
            height: '44px',
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.08)',
            cursor: 'pointer',
            zIndex: '5',
            fontSize: '1.1rem',
            display: 'none' // shown only via CSS when .ai-fullscreen
        });
        // CSS: only show when fullscreen (mobile).
        const style = document.createElement('style');
        style.textContent = `
            #aiChat.ai-fullscreen { position: fixed !important; }
            #aiChat.ai-fullscreen .ai-mobile-close { display: flex !important; align-items: center; justify-content: center; }
        `;
        document.head.appendChild(style);
        aiChat.style.position = aiChat.style.position || 'relative';
        aiChat.appendChild(btn);

        btn.addEventListener('click', () => {
            // Click an existing back/close mechanism if present, else find a tab to switch to.
            const lessonTab = document.querySelector('[data-tab="lesson"], .tab-btn[data-target="lesson"]');
            if (lessonTab) lessonTab.click();
            else aiChat.classList.remove('ai-fullscreen');
        });
    }

    // ----- 3. Sidebar enhancements --------------------------------------------
    function getSidebar() { return document.getElementById('sidebar'); }
    function getToggle()  { return document.getElementById('mobileSidebarToggle'); }
    function isSidebarOpen() {
        const s = getSidebar();
        return !!s && (s.classList.contains('open') || s.classList.contains('active'));
    }

    function syncAriaExpanded() {
        const t = getToggle();
        if (t) t.setAttribute('aria-expanded', isSidebarOpen() ? 'true' : 'false');
    }

    function closeSidebar() {
        if (typeof window.toggleSidebar === 'function' && isSidebarOpen()) {
            window.toggleSidebar();
        }
    }

    function watchSidebar() {
        const sidebar = getSidebar();
        if (!sidebar) return;
        const observer = new MutationObserver(syncAriaExpanded);
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        syncAriaExpanded();

        // ESC key closes sidebar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isSidebarOpen()) closeSidebar();
        });

        // Swipe-right closes sidebar (RTL: drawer enters from right, swiping right pushes it out)
        let startX = null, startY = null;
        sidebar.addEventListener('touchstart', (e) => {
            if (!isMobile()) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
        }, { passive: true });
        sidebar.addEventListener('touchend', (e) => {
            if (startX === null) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            // Horizontal swipe right (≥60px) and not mostly vertical (so we don't hijack scroll).
            if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) closeSidebar();
            startX = startY = null;
        }, { passive: true });
    }

    // ----- bootstrap -----------------------------------------------------------
    function init() {
        watchModals();
        watchAiChat();
        watchSidebar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
