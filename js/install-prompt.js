/* ============================================================================
 * install-prompt.js — ההזמנה להוסיף את בית המטפלים למסך הבית
 * נבנה 2026-08-27
 *
 * שני מסלולים שאין ביניהם שום דבר משותף חוץ מהטקסט:
 *
 *   אנדרואיד / כרום
 *     הדפדפן יורה 'beforeinstallprompt'. תופסים אותו, מבטלים את הבאנר
 *     הדיפולטי של הדפדפן ושומרים את האירוע בצד. הפס שלנו מוצג בעברית,
 *     ובלחיצה מפעילים את האירוע השמור. שם, ורק שם, יש כפתור שבאמת עושה משהו.
 *
 *   אייפון / ספארי
 *     אין 'beforeinstallprompt'. אין שום ממשק תכנותי. הדרך היחידה עוברת
 *     דרך כפתור השיתוף של ספארי ואז "הוסף למסך הבית". לכן במסלול הזה
 *     הרכיב **מסביר בלבד**, עם אייקון השיתוף המוכר מצויר ב-SVG.
 *     🔴 אסור להעמיד כאן כפתור שמתחזה לפעולה. הוא לא יעבוד, והמאזין יחשוב שנשבר.
 *
 * חוקי חוויה (הלל):
 *   • לא מציקים. לא בשנייה הראשונה של הביקור הראשון. צריך סימן מעורבות אמיתי.
 *   • סירוב נזכר לשבועיים. התקנה נזכרת לתמיד.
 *   • באפליקציה שכבר על מסך הבית לא מוצג שום דבר מזה.
 *   • בלי ספירה לאחור, בלי "רק היום", בלי לחץ.
 *   • בלי מונחים טכניים בטקסט שהמאזין רואה.
 *
 * אפס תלות חיצונית. וניל. אם משהו לא נתמך, הכל נכשל בשקט והפורטל ממשיך כרגיל.
 *
 * כיבוי גלובלי: window.INSTALL_PROMPT_CONFIG = { enabled: false }
 * ============================================================================ */

(function () {
    'use strict';

    // ─── מפתח אחסון משלנו בלבד. לא נוגעים במפתחות של מודולים אחרים ─────────
    var STATE_KEY = 'bvm_install_prompt_v1';
    var SESSION_KEY = 'bvm_install_prompt_session_v1';

    var DEFAULT_CONFIG = {
        enabled: true,
        debug: false,

        // שבועיים אחרי סירוב. חוזרים רק אז.
        snoozeDays: 14,

        // הרצפה: כמה שניות המאזין חייב להיות בדף לפני שמותר להציג משהו.
        // גם מי שגלל את כל הדף בשלוש שניות לא רואה כלום לפני זה.
        minSecondsOnPage: 8,

        // שער המעורבות. מספיק שאחד מהשלושה מתקיים:
        //   · ביקור שני ומעלה
        //   · גלילה מעבר לאחוז הזה
        //   · שהייה בדף מעבר למספר השניות הזה
        minVisits: 2,
        scrollPercent: 45,
        dwellSeconds: 30,

        // עמודים שההזמנה לא נכנסת אליהם (כלי ניהול, מסכי כניסה, מסמכים פנימיים).
        excludePaths: [
            '/admin', 'admin.html', 'admin-v2.html', 'admin-4fa6eb0937.html',
            'login.html', 'login-v2.html', 'dev-login-local.html',
            'popup-preview.html', '404.html', 'פנקס-'
        ],

        cssHref: '/css/install-prompt.css',

        // מקורות הסרטון לפי מכשיר. נדפקו-לאחור אם קובץ חסר: הקישור
        // פשוט לא יוצג (ראה videoSrc()), במקום לפתוח נגן ריק.
        videoSrcAndroid: '/assets/videos/install-android.mp4',
        videoSrcIOS: '/assets/videos/install-iphone.mp4'
    };

    var CFG = DEFAULT_CONFIG;
    try {
        var override = window.INSTALL_PROMPT_CONFIG;
        if (override && typeof override === 'object') {
            for (var k in override) {
                if (Object.prototype.hasOwnProperty.call(override, k)) CFG[k] = override[k];
            }
        }
    } catch (e) { /* קונפיג פגום לא מפיל את הקובץ */ }

    function log() {
        if (!CFG.debug) return;
        try { console.log.apply(console, ['[install-prompt]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    // ========================================================================
    // הטקסט. במקום אחד, כדי שאפשר יהיה לערוך בלי לחפש בקוד.
    // בלי "התקנה", בלי מונחים טכניים. המאזין צריך להבין שהוא מקבל את
    // הפורטל כאפליקציה על המסך.
    // ========================================================================
    var TEXT = {
        bannerTitle: 'רוצה את בית המטפלים על מסך הבית?',
        bannerSub: 'השיעורים והתרגול בלחיצה אחת.\nבלי לחפש כל פעם מחדש בדפדפן.',
        bannerPrimary: 'להוסיף למסך הבית',
        bannerGhost: 'לא עכשיו',

        sheetTitle: 'ככה שמים את בית המטפלים על המסך',
        sheetLead: 'שני צעדים קטנים באייפון.\nאחרי זה הפורטל מחכה לך שם כמו כל אפליקציה אחרת.',
        step1Before: 'לוחצים על כפתור השיתוף',
        step1After: 'בסרגל התחתון של ספארי.',
        step2Before: 'גוללים ובוחרים',
        step2Quote: 'הוסף למסך הבית',
        step2After: 'ואז מאשרים.',
        sheetNote: 'זה לא תופס מקום ולא דורש שום הרשמה נוספת.\nאפשר להסיר מהמסך מתי שרוצים.',
        sheetPrimary: 'הבנתי, תודה',

        closeLabel: 'סגירה',
        regionLabel: 'הזמנה להוסיף את בית המטפלים למסך הבית',

        watchLink: 'לא מסתדרים? רואים כאן',
        videoTitle: 'ככה שומרים את זה על המסך',
        videoRegionLabel: 'סרטון הסבר',

        // המסלול השלישי (לא אנדרואיד-עם-אירוע, לא ספארי-באייפון). מוצג רק
        // אם יש סרטון להראות — ראה showFallback().
        fallbackLead: 'בדפדפן הזה אי אפשר להוסיף אוטומטית.\nזה קורה בעיקר בגלישה בסתר.\nאפשר לנסות שוב בגלישה רגילה, ובינתיים ככה זה עובד.',
        fallbackPrimary: 'הבנתי, תודה'
    };

    // ========================================================================
    // אייקונים — SVG מוטבע. אפס בקשות רשת, אפס תלות בתיקיית הנכסים.
    // ========================================================================

    // אייקון השיתוף של iOS: ריבוע פתוח למעלה עם חץ שיוצא ממנו.
    // currentColor כדי שיירש את צבע האקסנט מה-CSS.
    var SHARE_SVG =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
            '<path d="M12 3.2 L12 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M8.2 6.9 L12 3.1 L15.8 6.9" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M6.6 10.4 H5.4 A1.4 1.4 0 0 0 4 11.8 V19.6 A1.4 1.4 0 0 0 5.4 21 H18.6 ' +
                'A1.4 1.4 0 0 0 20 19.6 V11.8 A1.4 1.4 0 0 0 18.6 10.4 H17.4" ' +
                'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

    // הגליף של הפס: מסך טלפון עם ריבוע מודגש, כלומר "אייקון על המסך".
    var PHONE_SVG =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
            '<rect x="5" y="2.6" width="14" height="18.8" rx="2.2" stroke="currentColor" stroke-width="1.8"/>' +
            '<rect x="8.4" y="6.6" width="7.2" height="7.2" rx="1.2" fill="currentColor"/>' +
            '<path d="M10 17.6 H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        '</svg>';

    // עיגול עם משולש נגינה. משמש רק כאייקון ליד קישור "רואים כאן" — לא כפקד נגינה עצמו.
    var PLAY_SVG =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
            '<circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.6"/>' +
            '<path d="M10.2 8.6 L15.6 12 L10.2 15.4 Z" fill="currentColor"/>' +
        '</svg>';

    // ========================================================================
    // מצב מקומי. localStorage עלול לזרוק (מצב פרטי, חסימת אחסון) — הכל בתוך try.
    // ========================================================================
    function now() { return Date.now(); }

    function loadState() {
        try {
            var raw = localStorage.getItem(STATE_KEY);
            if (!raw) return {};
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) { return {}; }
    }

    var state = loadState();

    function saveState() {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    // ספירת ביקורים: פעם אחת לכל סשן דפדפן, לא לכל עמוד שנטען.
    function countVisit() {
        try {
            if (sessionStorage.getItem(SESSION_KEY) === '1') return;
            sessionStorage.setItem(SESSION_KEY, '1');
        } catch (e) {
            // אין sessionStorage? סופרים בכל זאת. עדיף להגזים בביקורים
            // מאשר לא לספור לעולם ולא להציע כלום.
        }
        state.visits = (state.visits || 0) + 1;
        saveState();
    }

    // ========================================================================
    // זיהוי סביבה
    // ========================================================================
    function isStandalone() {
        try {
            if (window.navigator && window.navigator.standalone === true) return true;  // אייפון
            if (window.matchMedia) {
                if (window.matchMedia('(display-mode: standalone)').matches) return true;
                if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
                if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
            }
            if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
        } catch (e) {}
        return false;
    }

    function ua() {
        try { return navigator.userAgent || ''; } catch (e) { return ''; }
    }

    function isIOS() {
        try {
            var u = ua();
            if (/iPad|iPhone|iPod/.test(u)) return true;
            // אייפד מודרני מציג את עצמו כמק. הריבוי מגע מסגיר אותו.
            if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
        } catch (e) {}
        return false;
    }

    // ספארי בלבד. בדפדפן אחר על אייפון, ובדפדפן המובנה של אינסטגרם או פייסבוק,
    // אי אפשר להוסיף למסך הבית, ואז עדיף לא להציג הוראות שלא יעבדו.
    function isIOSSafari() {
        if (!isIOS()) return false;
        var u = ua();
        if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(u)) return false;
        if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|Snapchat|TikTok|LinkedInApp/i.test(u)) return false;
        return /Safari/i.test(u);
    }

    // מקור הסרטון לפי מכשיר. ריק אם לא הוגדר — כך שהקישור פשוט לא יוצג
    // (ראה renderWatchLink) במקום לפתוח נגן ריק.
    function videoSrc() {
        return isIOS() ? CFG.videoSrcIOS : CFG.videoSrcAndroid;
    }

    function onExcludedPath() {
        try {
            var path = (location.pathname || '').toLowerCase();
            for (var i = 0; i < CFG.excludePaths.length; i++) {
                if (path.indexOf(String(CFG.excludePaths[i]).toLowerCase()) !== -1) return true;
            }
        } catch (e) {}
        return false;
    }

    // מודל אחר כבר תופס את המסך? מחכים לתור. מנוע הפופ-אפים הוא הבעלים.
    function screenIsBusy() {
        try {
            return !!document.querySelector('.eap-overlay, .ip-overlay, .pp-wrap');
        } catch (e) { return false; }
    }

    // ========================================================================
    // שער הטופס — אדם שממלא טופס עכשיו הוא הבעלים של המסך
    // ========================================================================
    // 🔴 נמדד ב-22.09.2026 בשער ה-QA, לא הוסק: מבקר חדש בטלפון שלוחץ
    //    "אני רוצה גישה לפורטל" מדלג ל-`#register`, והדילוג עצמו חוצה את
    //    `scrollPercent: 45` — כלומר **תנאי ההפעלה של הבאנר מתלכד בדיוק עם
    //    הגעת המבקר לטופס ההרשמה**. `document.elementFromPoint` על מרכז שדה
    //    הטלפון החזיר `DIV.ip-banner` ולא את ה-INPUT, ועל תיבת אישור התנאים
    //    החזיר `BUTTON.ip-btn`. שני השדות הם חובה להרשמה, ולכן מסך ההמרה
    //    הראשון של כל מבקר חדש בטלפון היה חסום עד שהוא מזהה את הבאנר.
    // ⚑ למה גאומטריה ולא `#register`: אותה התנגשות קיימת בכל טופס בתחתית
    //    מסך — חתימת חוזה, שאלון, כניסה. שער לפי מזהה אחד היה מתקן מקרה
    //    אחד ומשאיר את השאר. וזה גם למה זה לא תיקון z-index: העלאת הבאנר
    //    רק מחליפה מי מכסה את מי.
    var FIELD_ZONE = 0.55;   // הבאנר חי בתחתית המסך (נמדד: 209px מתוך 844)

    function fieldsInBannerZone() {
        try {
            var vh = window.innerHeight || 0;
            if (!vh) return false;
            var zoneTop = vh * FIELD_ZONE;
            var nodes = document.querySelectorAll('input, select, textarea');
            for (var i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                if (el.type === 'hidden' || el.disabled || el.readOnly) continue;
                var b = el.getBoundingClientRect();
                if (!b.width || !b.height) continue;      // לא מוצג בפועל
                if (b.bottom <= zoneTop) continue;        // מעל אזור הבאנר
                if (b.top >= vh) continue;                // מתחת לקפל
                return true;
            }
            return false;
        } catch (e) { return false; }   // ספק ⇒ לא חוסמים את ההזמנה
    }

    // הבאנר כבר פתוח והמבקר גלל לתוך טופס: מפנים מקום **בלי לרשום סירוב**.
    // hide('dismissed') היה משתיק את ההזמנה לשבועיים על גלילה תמימה.
    //
    // ⚑ למה שעון ולא אירוע גלילה: נמדד ב-22.09.2026 שבדף הזה נורה **אירוע
    //    גלילה אחד בלבד על פני שתי גלילות מלאות** — קפיצת עוגן, גלילה
    //    תכנותית ומיקוד בשדה מזיזים את הפריסה בלי לירות `scroll` אמין.
    //    מנגנון פינוי שתלוי באירוע היה נכשל בשקט בדיוק במקרה שהוא נועד לו.
    //    השעון רץ **רק כל עוד הבאנר פתוח** ומכבה את עצמו כשהוא נעלם.
    var yieldTimer = null;

    function startYieldWatch() {
        if (yieldTimer) return;
        try { yieldTimer = setInterval(yieldToForms, 300); } catch (e) {}
    }

    function stopYieldWatch() {
        if (!yieldTimer) return;
        try { clearInterval(yieldTimer); } catch (e) {}
        yieldTimer = null;
    }

    function yieldToForms() {
        try {
            var el = document.querySelector('.ip-banner.is-open');
            if (!el) { stopYieldWatch(); return; }
            var shouldYield = fieldsInBannerZone();
            if (shouldYield && el.getAttribute('data-ip-yield') !== '1') {
                el.setAttribute('data-ip-yield', '1');
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            } else if (!shouldYield && el.getAttribute('data-ip-yield') === '1') {
                el.removeAttribute('data-ip-yield');
                el.style.visibility = '';
                el.style.pointerEvents = '';
            }
        } catch (e) {}
    }

    // ========================================================================
    // שערי הצגה
    // ========================================================================
    // 🔴 שער קשיח. **אין דרך לעקוף אותו**, גם לא דרך InstallPrompt.show()
    //    שמשמש לבדיקות. הכלל "באפליקציה שכבר על המסך לא מוצג כלום" הוא מוחלט,
    //    ולכן הוא לא יושב באותה פונקציה עם שערי הנימוס שכן ניתנים לעקיפה.
    function hardBlocked() {
        if (!CFG.enabled) return 'כבוי בקונפיג';
        if (isStandalone()) return 'כבר על מסך הבית';
        if (state.installedAt) return 'כבר נוסף בעבר';
        if (onExcludedPath()) return 'עמוד מוחרג';
        return null;
    }

    // שער הנימוס: סירוב נזכר לשבועיים. נעקף בבדיקה ידנית בלבד.
    function snoozed() {
        if (!state.dismissedAt) return null;
        var days = (now() - state.dismissedAt) / 86400000;
        if (days < CFG.snoozeDays) return 'נסגר לפני ' + Math.round(days) + ' ימים';
        return null;
    }

    function blocked() { return hardBlocked() || snoozed(); }

    function scrolledEnough() {
        try {
            var doc = document.documentElement;
            var reach = (window.pageYOffset || doc.scrollTop || 0) + window.innerHeight;
            var height = Math.max(doc.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
            if (height <= window.innerHeight) return false;   // דף קצר: הגלילה לא אומרת כלום
            return (reach / height) * 100 >= CFG.scrollPercent;
        } catch (e) { return false; }
    }

    // ========================================================================
    // רינדור — הפס של אנדרואיד
    // ========================================================================
    function ensureStyles() {
        try {
            if (document.getElementById('ip-css')) return;
            if (document.querySelector('link[href*="install-prompt.css"]')) return;
            var link = document.createElement('link');
            link.id = 'ip-css';
            link.rel = 'stylesheet';
            link.href = CFG.cssHref;
            document.head.appendChild(link);
        } catch (e) {}
    }

    var openBanner = null;
    var openSheet = null;

    function remember(kind) {
        if (kind === 'dismissed') { state.dismissedAt = now(); saveState(); }
        if (kind === 'installed') { state.installedAt = now(); saveState(); }
    }

    function showBanner(deferredEvent) {
        if (openBanner) return;
        ensureStyles();

        var el = document.createElement('div');
        el.className = 'ip-banner';
        el.setAttribute('role', 'region');
        el.setAttribute('dir', 'rtl');
        el.setAttribute('lang', 'he');
        el.setAttribute('aria-label', TEXT.regionLabel);

        el.innerHTML =
            '<button type="button" class="ip-banner-close"></button>' +
            '<div class="ip-banner-row">' +
                '<span class="ip-banner-glyph" aria-hidden="true">' + PHONE_SVG + '</span>' +
                '<div class="ip-banner-text">' +
                    '<strong class="ip-banner-title"></strong>' +
                    '<span class="ip-banner-sub"></span>' +
                '</div>' +
            '</div>' +
            '<div class="ip-banner-actions">' +
                '<button type="button" class="ip-btn ip-btn-primary"></button>' +
                '<button type="button" class="ip-btn ip-btn-ghost"></button>' +
            '</div>' +
            '<div class="ip-banner-watch"></div>';

        // טקסטים דרך textContent. שום מחרוזת לא נכנסת כ-HTML.
        var closeBtn = el.querySelector('.ip-banner-close');
        closeBtn.setAttribute('aria-label', TEXT.closeLabel);
        closeBtn.appendChild(document.createTextNode('×'));
        el.querySelector('.ip-banner-title').textContent = TEXT.bannerTitle;
        setMultiline(el.querySelector('.ip-banner-sub'), TEXT.bannerSub);

        var primary = el.querySelector('.ip-btn-primary');
        var ghost = el.querySelector('.ip-btn-ghost');
        primary.textContent = TEXT.bannerPrimary;
        ghost.textContent = TEXT.bannerGhost;
        renderWatchLink(el.querySelector('.ip-banner-watch'));

        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('is-open'); });

        function hide(kind) {
            if (!openBanner) return;
            openBanner = null;
            document.removeEventListener('keydown', onKey, true);
            el.classList.remove('is-open');
            remember(kind);
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 260);
            log('הפס נסגר:', kind);
        }

        function onKey(ev) {
            if (ev.key === 'Escape' || ev.key === 'Esc') hide('dismissed');
        }

        closeBtn.addEventListener('click', function () { hide('dismissed'); });
        ghost.addEventListener('click', function () { hide('dismissed'); });

        primary.addEventListener('click', function () {
            // הרגע היחיד שבו יש באמת מה להפעיל. אנדרואיד/כרום בלבד.
            try {
                if (!deferredEvent || typeof deferredEvent.prompt !== 'function') {
                    hide('dismissed');
                    return;
                }
                primary.disabled = true;
                deferredEvent.prompt();

                var choice = deferredEvent.userChoice;
                if (choice && typeof choice.then === 'function') {
                    choice.then(function (res) {
                        var outcome = res && res.outcome;
                        log('בחירת המשתמש:', outcome);
                        // 'accepted' — נסגר לתמיד. 'dismissed' — נסגר לשבועיים.
                        hide(outcome === 'accepted' ? 'installed' : 'dismissed');
                    }).catch(function () { hide('dismissed'); });
                } else {
                    hide('dismissed');
                }
            } catch (err) {
                log('כשל בהפעלת חלון הדפדפן', err);
                hide('dismissed');
            }
            // האירוע השמור הוא חד פעמי. אחרי שהופעל הוא לא שווה כלום.
            deferred = null;
        });

        document.addEventListener('keydown', onKey, true);
        openBanner = { hide: hide };
        log('הפס הוצג');
    }

    // טקסט עם שבירת שורה, בלי innerHTML
    function setMultiline(node, text) {
        var parts = String(text).split('\n');
        for (var i = 0; i < parts.length; i++) {
            if (i > 0) node.appendChild(document.createElement('br'));
            node.appendChild(document.createTextNode(parts[i]));
        }
    }

    // ========================================================================
    // רינדור — גיליון ההסבר של האייפון
    // ========================================================================
    function focusables(root) {
        var sel = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) {
            return el.offsetParent !== null || el === document.activeElement;
        });
    }

    function showSheet() {
        if (openSheet) return;
        ensureStyles();

        var lastFocused = document.activeElement;
        var titleId = 'ip-title-' + now();
        var leadId = 'ip-lead-' + now();

        var overlay = document.createElement('div');
        overlay.className = 'ip-overlay';

        var sheet = document.createElement('div');
        sheet.className = 'ip-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', titleId);
        sheet.setAttribute('aria-describedby', leadId);
        sheet.setAttribute('dir', 'rtl');
        sheet.setAttribute('lang', 'he');
        sheet.tabIndex = -1;

        sheet.innerHTML =
            '<button type="button" class="ip-close"></button>' +
            '<div class="ip-grip" aria-hidden="true"></div>' +
            '<h2 class="ip-title" id="' + titleId + '"></h2>' +
            '<p class="ip-lead" id="' + leadId + '"></p>' +
            '<ol class="ip-steps">' +
                '<li class="ip-step">' +
                    '<span class="ip-step-num" aria-hidden="true">1</span>' +
                    '<span class="ip-step-text" data-step="1"></span>' +
                '</li>' +
                '<li class="ip-step">' +
                    '<span class="ip-step-num" aria-hidden="true">2</span>' +
                    '<span class="ip-step-text" data-step="2"></span>' +
                '</li>' +
            '</ol>' +
            '<p class="ip-note"></p>' +
            '<div class="ip-sheet-actions">' +
                '<button type="button" class="ip-btn ip-btn-primary"></button>' +
            '</div>' +
            '<div class="ip-sheet-watch"></div>';

        var closeBtn = sheet.querySelector('.ip-close');
        closeBtn.setAttribute('aria-label', TEXT.closeLabel);
        closeBtn.appendChild(document.createTextNode('×'));

        sheet.querySelector('.ip-title').textContent = TEXT.sheetTitle;
        setMultiline(sheet.querySelector('.ip-lead'), TEXT.sheetLead);

        // צעד 1: טקסט, אייקון השיתוף המוכר, המשך טקסט.
        var s1 = sheet.querySelector('[data-step="1"]');
        s1.appendChild(document.createTextNode(TEXT.step1Before + ' '));
        var shareIcon = document.createElement('span');
        shareIcon.className = 'ip-share-inline';
        shareIcon.setAttribute('aria-hidden', 'true');
        shareIcon.innerHTML = SHARE_SVG;
        s1.appendChild(shareIcon);
        s1.appendChild(document.createTextNode(' ' + TEXT.step1After));

        // צעד 2: הכיתוב המדויק שהוא מחפש בתפריט, בתוך מסגרת.
        var s2 = sheet.querySelector('[data-step="2"]');
        s2.appendChild(document.createTextNode(TEXT.step2Before + ' '));
        var quote = document.createElement('span');
        quote.className = 'ip-quote';
        quote.textContent = TEXT.step2Quote;
        s2.appendChild(quote);
        s2.appendChild(document.createTextNode(' ' + TEXT.step2After));

        setMultiline(sheet.querySelector('.ip-note'), TEXT.sheetNote);

        var okBtn = sheet.querySelector('.ip-btn-primary');
        okBtn.textContent = TEXT.sheetPrimary;
        renderWatchLink(sheet.querySelector('.ip-sheet-watch'));

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        try {
            document.documentElement.classList.add('ip-locked');
            document.body.classList.add('ip-locked');
        } catch (e) {}

        requestAnimationFrame(function () { overlay.classList.add('is-open'); });

        function close(kind) {
            if (!openSheet) return;
            openSheet = null;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('is-open');
            try {
                document.documentElement.classList.remove('ip-locked');
                document.body.classList.remove('ip-locked');
            } catch (e) {}
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 220);
            try { if (lastFocused && lastFocused.focus) lastFocused.focus(); } catch (e) {}
            // באייפון אין דרך לדעת אם הוא באמת הוסיף. כל סגירה נחשבת סירוב
            // ומשתיקה לשבועיים. אם הוא כן הוסיף, הביקור הבא כבר יהיה
            // בתוך האפליקציה ואז השער הראשון עוצר בכל מקרה.
            remember('dismissed');
            log('הגיליון נסגר:', kind);
        }

        function onKey(ev) {
            // נגן הסרטון עלול להיפתח מעל הגיליון הזה ומאזין לאותו document.
            // שני המאזינים נרשמים באותה שיטה על אותו אלמנט, ושניהם היו רצים
            // באותה לחיצה — כלומר Escape/Tab היו מטפלים גם בגיליון שמתחת
            // ותוקעים את הפוקוס בו. כשהנגן פתוח, הוא הדיאלוג העליון והיחיד.
            if (openVideo) return;

            if (ev.key === 'Escape' || ev.key === 'Esc') {
                ev.preventDefault();
                close('dismissed');
                return;
            }
            if (ev.key !== 'Tab') return;

            // מלכודת פוקוס: Tab לא יוצא מהגיליון
            var items = focusables(sheet);
            if (!items.length) { ev.preventDefault(); return; }
            var first = items[0], last = items[items.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault(); first.focus();
            } else if (!sheet.contains(document.activeElement)) {
                ev.preventDefault(); first.focus();
            }
        }

        closeBtn.addEventListener('click', function () { close('dismissed'); });
        okBtn.addEventListener('click', function () { close('accepted'); });
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) close('dismissed');
        });
        document.addEventListener('keydown', onKey, true);

        setTimeout(function () { try { sheet.focus(); } catch (e) {} }, 30);

        openSheet = { close: close };
        log('הגיליון הוצג');
    }

    // ========================================================================
    // רינדור — קישור "רואים כאן" + נגן הסרטון
    //
    // הבאנר והגיליון לא יודעים איפה הם — הם רק קוראים ל-renderWatchLink()
    // וזורקים לו מכל שהם רוצים שהקישור ייתלה בו. אם אין מקור סרטון
    // למכשיר הזה, שום קישור לא נוסף (עדיף היעדר קישור מקישור מת).
    // ========================================================================
    function renderWatchLink(container) {
        var src = videoSrc();
        if (!src) return;

        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'ip-watch-link';
        var icon = document.createElement('span');
        icon.className = 'ip-watch-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = PLAY_SVG;
        link.appendChild(icon);
        link.appendChild(document.createTextNode(TEXT.watchLink));
        link.addEventListener('click', function (ev) {
            ev.preventDefault();
            showVideo(src);
        });
        container.appendChild(link);
    }

    var openVideo = null;

    function showVideo(src) {
        if (openVideo) return;
        ensureStyles();

        var lastFocused = document.activeElement;
        var titleId = 'ip-vtitle-' + now();

        var overlay = document.createElement('div');
        overlay.className = 'ip-overlay ip-video-overlay';

        var sheet = document.createElement('div');
        sheet.className = 'ip-sheet ip-video-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', titleId);
        sheet.setAttribute('dir', 'rtl');
        sheet.setAttribute('lang', 'he');
        sheet.tabIndex = -1;

        sheet.innerHTML =
            '<button type="button" class="ip-close"></button>' +
            '<h2 class="ip-title ip-video-title" id="' + titleId + '"></h2>' +
            '<div class="ip-video-wrap"><video class="ip-video" controls playsinline webkit-playsinline preload="metadata"></video></div>';

        var closeBtn = sheet.querySelector('.ip-close');
        closeBtn.setAttribute('aria-label', TEXT.closeLabel);
        closeBtn.appendChild(document.createTextNode('×'));
        sheet.querySelector('.ip-video-title').textContent = TEXT.videoTitle;

        var video = sheet.querySelector('.ip-video');
        video.setAttribute('aria-label', TEXT.videoRegionLabel);
        video.src = src;

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        try {
            document.documentElement.classList.add('ip-locked');
            document.body.classList.add('ip-locked');
        } catch (e) {}

        requestAnimationFrame(function () { overlay.classList.add('is-open'); });

        function close() {
            if (!openVideo) return;
            openVideo = null;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('is-open');
            try { video.pause(); } catch (e) {}
            try {
                document.documentElement.classList.remove('ip-locked');
                document.body.classList.remove('ip-locked');
            } catch (e) {}
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 220);
            try { if (lastFocused && lastFocused.focus) lastFocused.focus(); } catch (e) {}
            log('נגן הסרטון נסגר');
        }

        // stopImmediatePropagation בכל מקש: הנגן עלול להיפתח מעל הגיליון של
        // האייפון, ושני הדיאלוגים מאזינים לאותו document באותה שיטה בדיוק —
        // stopPropagation לבד לא מונע מאזין אחר על **אותו** אלמנט מלרוץ.
        // בלעדיה Escape/Tab היו מטפלים גם בדיאלוג שמתחת, וגוררים פוקוס לשם בטעות.
        function onKey(ev) {
            if (ev.key === 'Escape' || ev.key === 'Esc') {
                ev.preventDefault(); ev.stopImmediatePropagation(); close(); return;
            }
            if (ev.key !== 'Tab') return;
            ev.stopImmediatePropagation();
            var items = focusables(sheet);
            if (!items.length) { ev.preventDefault(); return; }
            var first = items[0], last = items[items.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault(); first.focus();
            } else if (!sheet.contains(document.activeElement)) {
                ev.preventDefault(); first.focus();
            }
        }

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) close();
        });
        document.addEventListener('keydown', onKey, true);

        setTimeout(function () { try { sheet.focus(); } catch (e) {} }, 30);

        openVideo = { close: close };
        log('נגן הסרטון נפתח:', src);
    }

    // ========================================================================
    // רינדור — המסלול השלישי (לא אנדרואיד-עם-אירוע, לא ספארי-באייפון)
    //
    // אין לנו הוראות מדויקות להציע כאן — לא ידוע לנו למה בדיוק הדפדפן לא
    // נתן אירוע התקנה (הדוגמה השכיחה: גלישה בסתר באנדרואיד, שם כרום חוסם
    // את beforeinstallprompt בכוונה). לכן זה **לא** מעמיד תפריט-הוראות
    // מזויף. זה רק מסביר בכנות שההוספה האוטומטית לא זמינה, ומציע את מה
    // שכן יש: הסרטון. לכן זה קיים רק אם videoSrc() מחזיר משהו — בלי סרטון
    // אין כאן ערך שמצדיק דיאלוג, ועדיף השקט הישן.
    // ========================================================================
    var openFallback = null;

    function showFallback() {
        var src = videoSrc();
        if (!src || openFallback) return;
        ensureStyles();

        var lastFocused = document.activeElement;
        var titleId = 'ip-ftitle-' + now();
        var leadId = 'ip-flead-' + now();

        var overlay = document.createElement('div');
        overlay.className = 'ip-overlay';

        var sheet = document.createElement('div');
        sheet.className = 'ip-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', titleId);
        sheet.setAttribute('aria-describedby', leadId);
        sheet.setAttribute('dir', 'rtl');
        sheet.setAttribute('lang', 'he');
        sheet.tabIndex = -1;

        sheet.innerHTML =
            '<button type="button" class="ip-close"></button>' +
            '<div class="ip-grip" aria-hidden="true"></div>' +
            '<h2 class="ip-title" id="' + titleId + '"></h2>' +
            '<p class="ip-lead" id="' + leadId + '"></p>' +
            '<div class="ip-sheet-watch"></div>' +
            '<div class="ip-sheet-actions">' +
                '<button type="button" class="ip-btn ip-btn-primary"></button>' +
            '</div>';

        var closeBtn = sheet.querySelector('.ip-close');
        closeBtn.setAttribute('aria-label', TEXT.closeLabel);
        closeBtn.appendChild(document.createTextNode('×'));

        sheet.querySelector('.ip-title').textContent = TEXT.bannerTitle;
        setMultiline(sheet.querySelector('.ip-lead'), TEXT.fallbackLead);
        renderWatchLink(sheet.querySelector('.ip-sheet-watch'));

        var okBtn = sheet.querySelector('.ip-btn-primary');
        okBtn.textContent = TEXT.fallbackPrimary;

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        try {
            document.documentElement.classList.add('ip-locked');
            document.body.classList.add('ip-locked');
        } catch (e) {}

        requestAnimationFrame(function () { overlay.classList.add('is-open'); });

        function close(kind) {
            if (!openFallback) return;
            openFallback = null;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('is-open');
            try {
                document.documentElement.classList.remove('ip-locked');
                document.body.classList.remove('ip-locked');
            } catch (e) {}
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 220);
            try { if (lastFocused && lastFocused.focus) lastFocused.focus(); } catch (e) {}
            remember('dismissed');
            log('ה-fallback נסגר:', kind);
        }

        function onKey(ev) {
            if (openVideo) return;   // הנגן פתוח מעליו — הוא הבעלים היחיד
            if (ev.key === 'Escape' || ev.key === 'Esc') {
                ev.preventDefault();
                close('dismissed');
                return;
            }
            if (ev.key !== 'Tab') return;
            var items = focusables(sheet);
            if (!items.length) { ev.preventDefault(); return; }
            var first = items[0], last = items[items.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault(); first.focus();
            } else if (!sheet.contains(document.activeElement)) {
                ev.preventDefault(); first.focus();
            }
        }

        closeBtn.addEventListener('click', function () { close('dismissed'); });
        okBtn.addEventListener('click', function () { close('accepted'); });
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) close('dismissed');
        });
        document.addEventListener('keydown', onKey, true);

        setTimeout(function () { try { sheet.focus(); } catch (e) {} }, 30);

        openFallback = { close: close };
        log('ה-fallback הוצג');
    }

    // ========================================================================
    // התזמורת — מי מוצג, מתי, ורק פעם אחת בסשן
    // ========================================================================
    var deferred = null;          // אירוע ה-beforeinstallprompt השמור
    var shownThisSession = false;
    var startedAt = now();
    var timers = [];

    function secondsOnPage() { return (now() - startedAt) / 1000; }

    function engaged() {
        if ((state.visits || 0) >= CFG.minVisits) return 'ביקור חוזר';
        if (scrolledEnough()) return 'גלל מספיק';
        if (secondsOnPage() >= CFG.dwellSeconds) return 'שהה מספיק';
        return null;
    }

    function maybeShow(force) {
        try {
            if (shownThisSession) return;

            // השער הקשיח נבדק תמיד, גם ב-force.
            var hard = hardBlocked();
            if (hard) { log('לא מוצג (שער קשיח):', hard); return; }

            if (!force) {
                var soft = snoozed();
                if (soft) { log('לא מוצג:', soft); return; }
                if (secondsOnPage() < CFG.minSecondsOnPage) return;   // רצפת הזמן
                if (!engaged()) return;
                if (screenIsBusy()) return;                            // מודל אחר על המסך
                if (fieldsInBannerZone()) return;                      // ממלא טופס עכשיו
            }

            if (deferred) {
                shownThisSession = true;
                clearTimers();
                showBanner(deferred);
            } else if (isIOSSafari()) {
                shownThisSession = true;
                clearTimers();
                showSheet();
            } else if (videoSrc()) {
                // לא אנדרואיד-עם-אירוע ולא ספארי-באייפון (למשל גלישה בסתר
                // באנדרואיד, שם כרום חוסם את האירוע בכוונה). אין הוראות
                // מדויקות להציע, אבל יש סרטון — עדיף הסבר כן מהשתיקה הישנה.
                shownThisSession = true;
                clearTimers();
                showFallback();
            }
            // מרגע שמשהו על המסך — שומרים שלא ישב על טופס.
            // 🔴 חייב לשבת **אחרי כל שלושת המסלולים** ולא בתוך אחד מהם:
            //    נמדד ב-22.09.2026 שכשחיברתי את השומר רק למסלול `deferred`,
            //    טעינה שבה `beforeinstallprompt` לא נורה הציגה את אותו
            //    `.ip-banner` דרך showFallback() — בלי שומר, והבאנר חזר לכסות
            //    את שדה הטלפון. אותה תקלה בדיוק, במסלול שלא נבדק.
            if (shownThisSession) startYieldWatch();

            // שום דבר להציע בכלל (אין סרטון, ואין מסלול זמין): שקט.
        } catch (e) {
            log('שגיאה בבדיקת ההצגה', e);   // הפורטל ממשיך כרגיל
        }
    }

    function clearTimers() {
        for (var i = 0; i < timers.length; i++) {
            try { clearTimeout(timers[i]); } catch (e) {}
        }
        timers = [];
        try { window.removeEventListener('scroll', onScroll); } catch (e) {}
    }

    var scrollTick = false;
    function onScroll() {
        yieldToForms();        // מיידי — באנר פתוח לא ישב על טופס אפילו רבע שנייה
        if (scrollTick) return;
        scrollTick = true;
        setTimeout(function () { scrollTick = false; maybeShow(false); }, 400);
    }

    function init() {
        try {
            if (!CFG.enabled) return;

            countVisit();

            // כבר על מסך הבית? לא נרשמים לשום דבר ולא מרנדרים כלום.
            if (isStandalone()) { log('רץ מתוך מסך הבית. שקט מוחלט.'); return; }

            // אנדרואיד/כרום: תופסים את האירוע ומונעים את הבאנר הדיפולטי.
            window.addEventListener('beforeinstallprompt', function (ev) {
                try {
                    ev.preventDefault();
                    deferred = ev;
                    log('האירוע נתפס ונשמר');
                    maybeShow(false);
                } catch (e) {}
            });

            // נוסף בהצלחה דרך הדפדפן: לא מציעים לעולם יותר.
            window.addEventListener('appinstalled', function () {
                remember('installed');
                if (openBanner) openBanner.hide('installed');
                if (openSheet) openSheet.close('installed');
                if (openFallback) openFallback.close('installed');
                clearTimers();
                log('נוסף למסך הבית');
            });

            // עבר למצב אפליקציה תוך כדי: מסירים מיד כל מה שמוצג.
            try {
                var mq = window.matchMedia('(display-mode: standalone)');
                var onModeChange = function (ev) {
                    if (!ev.matches) return;
                    if (openBanner) openBanner.hide('installed');
                    if (openSheet) openSheet.close('installed');
                    if (openFallback) openFallback.close('installed');
                };
                if (mq.addEventListener) mq.addEventListener('change', onModeChange);
                else if (mq.addListener) mq.addListener(onModeChange);
            } catch (e) {}

            var why = blocked();
            if (why) { log('לא נרשם לטריגרים:', why); return; }

            window.addEventListener('scroll', onScroll, { passive: true });
            timers.push(setTimeout(function () { maybeShow(false); }, CFG.minSecondsOnPage * 1000 + 200));
            timers.push(setTimeout(function () { maybeShow(false); }, CFG.dwellSeconds * 1000 + 200));
        } catch (e) {
            log('כשל באתחול', e);   // הפורטל ממשיך כרגיל
        }
    }

    // API קטן לבדיקות ידניות מהקונסול. לא נדרש לתפעול השוטף.
    window.InstallPrompt = {
        show: function () { maybeShow(true); },
        // שער הטופס — חשוף כדי שאפשר יהיה לאמת אותו בדפדפן במקום להסיק.
        zone: function () { return { fieldsInZone: fieldsInBannerZone(), watching: !!yieldTimer }; },
        yieldNow: function () { yieldToForms(); return document.querySelector('.ip-banner') ? document.querySelector('.ip-banner').getAttribute('data-ip-yield') : null; },
        state: function () { return { stored: loadState(), hasEvent: !!deferred, standalone: isStandalone(), iosSafari: isIOSSafari() }; },
        reset: function () {
            try { localStorage.removeItem(STATE_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
            state = {};
            shownThisSession = false;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
