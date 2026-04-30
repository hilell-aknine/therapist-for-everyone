/**
 * PWA Bootstrap — Beit V'Metaplim Portal
 *
 * Two responsibilities:
 *  1. Register the service worker (`/sw.js`).
 *  2. Show a custom install prompt:
 *     - Android/Chrome: catches `beforeinstallprompt`, shows a custom banner.
 *     - iOS Safari: shows manual instructions ("שתף → הוסף למסך הבית").
 *
 * Banner appears after 30 seconds of active session. State persisted in
 * localStorage so we don't pester users who already installed or dismissed.
 */
(function () {
    'use strict';

    // ----- service worker registration ----------------------------------------
    // Register early so caching kicks in on first visit. Skip on `file://`.
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(reg => {
                    // Listen for updates and prompt new SW to activate immediately.
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    });
                })
                .catch(err => console.warn('[PWA] SW registration failed:', err));
        });
    }

    const STORAGE_DISMISSED = 'pwa_install_dismissed_at';
    const STORAGE_INSTALLED = 'pwa_installed';
    const SHOW_AFTER_MS = 30 * 1000;
    const REMIND_AFTER_DAYS = 14;

    // ----- detection helpers ---------------------------------------------------
    const isStandalone = () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

    const wasRecentlyDismissed = () => {
        const ts = localStorage.getItem(STORAGE_DISMISSED);
        if (!ts) return false;
        const days = (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24);
        return days < REMIND_AFTER_DAYS;
    };

    const wasInstalled = () => localStorage.getItem(STORAGE_INSTALLED) === '1';

    // ----- styling -------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('pwa-install-styles')) return;
        const css = `
        .pwa-install-banner {
            position: fixed;
            inset-inline: 16px;
            bottom: calc(16px + env(safe-area-inset-bottom, 0px));
            background: linear-gradient(135deg, #003B46 0%, #00606B 100%);
            color: #E8F1F2;
            padding: 16px 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.35);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Heebo', system-ui, sans-serif;
            transform: translateY(120%);
            transition: transform .35s cubic-bezier(.2,.9,.3,1);
            max-width: 480px;
            margin-inline: auto;
        }
        .pwa-install-banner.show { transform: translateY(0); }
        .pwa-install-banner__icon {
            width: 44px;
            height: 44px;
            flex-shrink: 0;
            border-radius: 10px;
            background: #D4AF37;
            display: grid;
            place-items: center;
            font-size: 22px;
        }
        .pwa-install-banner__body {
            flex: 1;
            min-width: 0;
        }
        .pwa-install-banner__title {
            font-weight: 700;
            font-size: 15px;
            line-height: 1.3;
            margin-bottom: 2px;
        }
        .pwa-install-banner__text {
            font-size: 13px;
            line-height: 1.4;
            opacity: .85;
        }
        .pwa-install-banner__actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        .pwa-install-banner__btn {
            min-height: 44px;
            min-width: 44px;
            padding: 0 14px;
            border-radius: 10px;
            border: none;
            font-family: inherit;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
        }
        .pwa-install-banner__btn--primary {
            background: #D4AF37;
            color: #003B46;
        }
        .pwa-install-banner__btn--ghost {
            background: transparent;
            color: #E8F1F2;
            opacity: .7;
        }
        .pwa-install-modal {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.65);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 10001;
            display: flex;
            align-items: flex-end;
            justify-content: center;
        }
        .pwa-install-modal__sheet {
            background: #003B46;
            color: #E8F1F2;
            border-radius: 18px 18px 0 0;
            padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0px));
            width: 100%;
            max-width: 480px;
            font-family: 'Heebo', system-ui, sans-serif;
            box-shadow: 0 -8px 40px rgba(0,0,0,.5);
        }
        .pwa-install-modal__title {
            font-weight: 700;
            font-size: 18px;
            margin-bottom: 12px;
            color: #D4AF37;
        }
        .pwa-install-modal__step {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 14px;
            font-size: 15px;
            line-height: 1.5;
        }
        .pwa-install-modal__num {
            background: #D4AF37;
            color: #003B46;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-weight: 700;
            font-size: 14px;
            flex-shrink: 0;
        }
        .pwa-install-modal__close {
            min-height: 48px;
            width: 100%;
            background: rgba(232,241,242,.1);
            color: #E8F1F2;
            border: none;
            border-radius: 12px;
            font-family: inherit;
            font-size: 15px;
            font-weight: 600;
            margin-top: 8px;
            cursor: pointer;
        }
        @media (prefers-reduced-motion: reduce) {
            .pwa-install-banner { transition: none; }
        }
        `;
        const style = document.createElement('style');
        style.id = 'pwa-install-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ----- Android / Chrome banner --------------------------------------------
    let deferredPrompt = null;

    function buildAndroidBanner() {
        const banner = document.createElement('div');
        banner.className = 'pwa-install-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'התקן את האפליקציה');
        banner.innerHTML = `
            <div class="pwa-install-banner__icon" aria-hidden="true">📲</div>
            <div class="pwa-install-banner__body">
                <div class="pwa-install-banner__title">להוסיף למסך הבית?</div>
                <div class="pwa-install-banner__text">פותחים את הפורטל בקליק אחד, כמו אפליקציה</div>
            </div>
            <div class="pwa-install-banner__actions">
                <button type="button" class="pwa-install-banner__btn pwa-install-banner__btn--primary" data-action="install">התקן</button>
                <button type="button" class="pwa-install-banner__btn pwa-install-banner__btn--ghost" data-action="dismiss" aria-label="סגור">לא תודה</button>
            </div>
        `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => banner.classList.add('show'));

        banner.querySelector('[data-action="install"]').addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                localStorage.setItem(STORAGE_INSTALLED, '1');
            } else {
                localStorage.setItem(STORAGE_DISMISSED, String(Date.now()));
            }
            deferredPrompt = null;
            banner.remove();
        });

        banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
            localStorage.setItem(STORAGE_DISMISSED, String(Date.now()));
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 350);
        });
    }

    // ----- iOS Safari modal ----------------------------------------------------
    function buildIosModal() {
        const modal = document.createElement('div');
        modal.className = 'pwa-install-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'הוראות התקנה');
        modal.innerHTML = `
            <div class="pwa-install-modal__sheet">
                <div class="pwa-install-modal__title">התקן את הפורטל למסך הבית</div>
                <div class="pwa-install-modal__step"><span class="pwa-install-modal__num">1</span><span>לחץ על כפתור <strong>שיתוף</strong> בתחתית הדפדפן (ריבוע עם חץ למעלה ⬆️)</span></div>
                <div class="pwa-install-modal__step"><span class="pwa-install-modal__num">2</span><span>גלול ובחר <strong>"הוסף למסך הבית"</strong> (Add to Home Screen)</span></div>
                <div class="pwa-install-modal__step"><span class="pwa-install-modal__num">3</span><span>לחץ <strong>הוסף</strong> בפינה הימנית-עליונה</span></div>
                <button type="button" class="pwa-install-modal__close">הבנתי, נחמד</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.pwa-install-modal__close').addEventListener('click', () => {
            localStorage.setItem(STORAGE_DISMISSED, String(Date.now()));
            modal.remove();
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                localStorage.setItem(STORAGE_DISMISSED, String(Date.now()));
                modal.remove();
            }
        });
    }

    function buildIosTriggerBanner() {
        const banner = document.createElement('div');
        banner.className = 'pwa-install-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'התקן את האפליקציה');
        banner.innerHTML = `
            <div class="pwa-install-banner__icon" aria-hidden="true">📲</div>
            <div class="pwa-install-banner__body">
                <div class="pwa-install-banner__title">להוסיף למסך הבית?</div>
                <div class="pwa-install-banner__text">פותחים את הפורטל כמו אפליקציה</div>
            </div>
            <div class="pwa-install-banner__actions">
                <button type="button" class="pwa-install-banner__btn pwa-install-banner__btn--primary" data-action="show">איך?</button>
                <button type="button" class="pwa-install-banner__btn pwa-install-banner__btn--ghost" data-action="dismiss" aria-label="סגור">סגור</button>
            </div>
        `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => banner.classList.add('show'));

        banner.querySelector('[data-action="show"]').addEventListener('click', () => {
            banner.remove();
            buildIosModal();
        });
        banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
            localStorage.setItem(STORAGE_DISMISSED, String(Date.now()));
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 350);
        });
    }

    // ----- bootstrap -----------------------------------------------------------
    function shouldShow() {
        if (isStandalone()) return false;
        if (wasInstalled()) return false;
        if (wasRecentlyDismissed()) return false;
        return true;
    }

    function init() {
        if (!shouldShow()) return;
        injectStyles();

        // Android / Chrome
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            deferredPrompt = e;
            setTimeout(() => {
                if (shouldShow() && deferredPrompt) buildAndroidBanner();
            }, SHOW_AFTER_MS);
        });

        // iOS Safari fallback
        if (isIOS() && isSafari()) {
            setTimeout(() => {
                if (shouldShow()) buildIosTriggerBanner();
            }, SHOW_AFTER_MS);
        }

        // Track installs
        window.addEventListener('appinstalled', () => {
            localStorage.setItem(STORAGE_INSTALLED, '1');
            deferredPrompt = null;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
