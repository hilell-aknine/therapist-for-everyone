/**
 * PWA register — רושם את /sw.js ומודיע למאזין כשיש גרסה חדשה.
 *
 * שני כללים שהקובץ הזה חייב לקיים:
 * 1. נכשל בשקט. אם ההרשמה לא עובדת (דפדפן ישן, http, הרשאה חסומה,
 *    מצב פרטי) הפורטל ממשיך לעבוד רגיל ושום שגיאה לא מגיעה לקונסול
 *    של מאזין. כל הקובץ עטוף ב-try/catch.
 * 2. אף פעם לא מכריח רענון. הבאנר מציע, המשתמש מחליט.
 *
 * הקובץ נטען מכל עמוד, גם מ-/pages/, ולכן הנתיב ל-sw הוא מוחלט ('/sw.js') —
 * אחרת ה-scope היה נחתך ל-/pages/ ורוב האתר היה נשאר בלי service worker.
 */
(function () {
    'use strict';

    if (window._pwaRegisterDone) return;
    window._pwaRegisterDone = true;

    // לוג רק בפיתוח מקומי. אצל מאזין אמיתי — שקט מוחלט.
    var isLocal = ['localhost', '127.0.0.1', '::1'].indexOf(location.hostname) !== -1;
    function debug(msg) { if (isLocal && window.console) console.log('[pwa] ' + msg); }

    try {
        if (!('serviceWorker' in navigator)) return;

        // service worker רץ רק ב-https או ב-localhost. בכל מצב אחר יוצאים בשקט.
        if (location.protocol !== 'https:' && !isLocal) return;

        var refreshing = false;

        // Was this page already under a service worker when it loaded?
        // This is the difference between "an update took over" (reload is right) and
        // "the worker installed for the first time and claimed me" (reload is a bug).
        // Read it now, before anything can claim the page.
        var hadControllerAtLoad = !!navigator.serviceWorker.controller;

        function showUpdateBanner(waitingWorker) {
            try {
                if (document.getElementById('pwa-update-bar')) return;

                var bar = document.createElement('div');
                bar.id = 'pwa-update-bar';
                bar.setAttribute('dir', 'rtl');
                bar.setAttribute('role', 'status');
                bar.style.cssText = [
                    'position:fixed', 'inset-inline:0', 'bottom:0', 'z-index:2147483000',
                    'display:flex', 'align-items:center', 'justify-content:center',
                    'gap:14px', 'flex-wrap:wrap',
                    'padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
                    // פלטת בית המטפלים: פטרול עמוק + זהב (css/theme.css)
                    'background:#003B46', 'color:#E8F1F2',
                    'border-top:2px solid #D4AF37',
                    'font-family:Heebo, sans-serif', 'font-size:0.95rem', 'line-height:1.4',
                    'box-shadow:0 -6px 18px rgba(0,59,70,0.35)'
                ].join(';');

                var text = document.createElement('span');
                text.textContent = 'יש עדכון חדש לפורטל';

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = 'רענן';
                btn.style.cssText = [
                    'background:#D4AF37', 'color:#003B46', 'border:0', 'border-radius:10px',
                    'padding:8px 22px', 'font-family:Heebo, sans-serif', 'font-size:0.95rem',
                    'font-weight:700', 'cursor:pointer'
                ].join(';');

                var dismiss = document.createElement('button');
                dismiss.type = 'button';
                dismiss.textContent = 'אחר כך';
                dismiss.setAttribute('aria-label', 'סגירת הודעת העדכון');
                dismiss.style.cssText = [
                    'background:transparent', 'color:rgba(232,241,242,0.72)',
                    'border:0', 'font-family:Heebo, sans-serif', 'font-size:0.95rem',
                    'cursor:pointer', 'text-decoration:underline'
                ].join(';');

                btn.addEventListener('click', function () {
                    btn.disabled = true;
                    btn.textContent = 'מרענן…';
                    try {
                        if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                    } catch (e) { /* בשקט */ }
                    // רשת ביטחון: אם controllerchange לא נורה, מרעננים בכל זאת.
                    setTimeout(function () {
                        if (!refreshing) { refreshing = true; location.reload(); }
                    }, 1500);
                });

                dismiss.addEventListener('click', function () {
                    if (bar.parentNode) bar.parentNode.removeChild(bar);
                });

                bar.appendChild(text);
                bar.appendChild(btn);
                bar.appendChild(dismiss);

                if (document.body) document.body.appendChild(bar);
                else document.addEventListener('DOMContentLoaded', function () {
                    document.body.appendChild(bar);
                });
            } catch (e) {
                debug('banner failed: ' + e);
            }
        }

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            // A first-ever visitor arrives with no controller. The worker installs,
            // calls skipWaiting() + clients.claim(), and controllerchange fires even
            // though nothing was updated — reloading here made every new visitor load
            // the whole page twice. Measured 11.09.2026 on the game: two full document
            // loads and the splash video fetched twice, 1.45 MB for a 727 KB file.
            // An update, by contrast, always happens on a page that already had a
            // controller, and there the reload is exactly what we want.
            if (!hadControllerAtLoad) {
                debug('first install claimed this page — not reloading');
                return;
            }
            refreshing = true;
            location.reload();
        });

        function watch(reg) {
            // גרסה שכבר ממתינה (המשתמש פתח טאב חדש אחרי פריסה).
            if (reg.waiting && navigator.serviceWorker.controller) {
                showUpdateBanner(reg.waiting);
            }

            reg.addEventListener('updatefound', function () {
                var incoming = reg.installing;
                if (!incoming) return;
                incoming.addEventListener('statechange', function () {
                    // controller קיים = זו החלפה, לא התקנה ראשונה.
                    // בהתקנה ראשונה אין מה להודיע — הדף כבר עדכני.
                    if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner(incoming);
                    }
                });
            });

            // בדיקת עדכון קלה כשחוזרים לטאב, כדי שמאזין שמשאיר את
            // הפורטל פתוח ימים לא ייתקע על גרסה ישנה.
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') {
                    try { reg.update(); } catch (e) { /* בשקט */ }
                }
            });

            debug('registered, scope: ' + reg.scope);
        }

        function register() {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(watch)
                .catch(function (err) { debug('register failed: ' + err); });
        }

        // נרשמים אחרי load כדי לא להתחרות על רוחב הפס עם טעינת העמוד עצמו.
        if (document.readyState === 'complete') register();
        else window.addEventListener('load', register);

    } catch (e) {
        debug('fatal: ' + e);
    }
})();
