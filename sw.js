/* ============================================================================
   בית המטפלים · Service Worker (site-wide PWA)
   ----------------------------------------------------------------------------
   היסטוריה: הקובץ הזה נולד צר — הוא שירת רק את משחק ה-NLP תחת השם
   'nlp-game-v3'. מ-2026-08-29 הוא מכסה את כל מעטפת האתר, בלי לשנות את
   ההתנהגות שהמשחק כבר הסתמך עליה (network-first + precache של נכסי המשחק).

   🔴 CACHE_NAME — כלל ברזל:
   כל שינוי ב-JS/CSS/HTML של הפרויקט מחייב העלאת המספר כאן. ה-activate
   מוחק כל cache ששמו שונה, ולכן זה מה שמפנה את הגרסה הקודמת מהמכשיר.
   בלי העלאה, משתמש חוזר ממשיך לרוץ על קוד ישן — כולל קוד שכבר תוקן.

   אסטרטגיה: network-first לכל בקשה נתפסת. רשת קודם, קאש רק כשאין רשת.
   ============================================================================ */

const CACHE_NAME = 'bvm-shell-v1';   // ⬅️ מעלים בכל שינוי קוד. קודם: nlp-game-v3

/* מעטפת האתר + נכסי משחק ה-NLP (הרשימה המקורית, נשמרה במלואה).
   addAll הוא אטומי — קובץ אחד שנופל מפיל את כל ההתקנה, ולכן כאן נכנסים
   רק נתיבים שאנחנו בטוחים שקיימים. */
const ASSETS_TO_CACHE = [
    // ── מעטפת האתר ──────────────────────────────────────────────
    '/',
    '/index.html',
    '/manifest.json',
    '/css/theme.css',
    '/pages/course-library-v2.html',
    '/pages/login.html',
    '/pages/free-portal.html',
    '/assets/pwa/icon-192.png',
    '/assets/pwa/icon-512.png',
    '/assets/pwa/apple-touch-icon-180.png',
    '/assets/pwa/favicon-32.png',
    '/assets/pwa/favicon-16.png',
    '/css/install-prompt.css',
    '/js/pwa-register.js',
    '/js/install-prompt.js',

    // ── משחק ה-NLP (הרשימה שהייתה כאן קודם) ─────────────────────
    '/pages/nlp-game.html',
    '/css/nlp-game.css',
    '/js/nlp-game.js',
    '/js/nlp-game-data.js',
    '/js/nlp-game-data-m1.js',
    '/js/nlp-game-data-m2.js',
    '/js/nlp-game-data-m3.js',
    '/js/nlp-game-data-m4.js',
    '/js/nlp-game-data-m5.js',
    '/js/nlp-game-data-m6.js',
    '/js/nlp-game-data-m7.js',
    '/js/nlp-game-leaderboard.js',
    '/assets/logo-square.png',
    '/assets/mentor-ram.webp'
];

/* ============================================================================
   רשימת אי-תפיסה — מה שלעולם לא נכנס לקאש
   ============================================================================
   הסיבה: ה-service worker רואה כל בקשה שיוצאת מהדף. תשובת Supabase
   שנשמרת בקאש = נתונים של משתמש אחד שעלולים לחזור למשתמש אחר, או מצב
   התחברות ישן שמוגש אחרי התנתקות. אלה עוברים לרשת ישירות, בלי מגע. */

const NEVER_CACHE_HOSTS = [
    'supabase.co',
    'supabase.in',
    'googleapis.com',
    'gstatic.com',
    'youtube.com',
    'youtube-nocookie.com',
    'ytimg.com',
    'googletagmanager.com',
    'google-analytics.com',
    'facebook.net',
    'clarity.ms',
    'cloudflare.com',
    'jsdelivr.net',
    'cdnjs.cloudflare.com',
    'ipify.org'
];

/* מדיה כבדה — לא ממלאים את מכסת האחסון של הטלפון בווידאו/אודיו. */
const HEAVY_MEDIA_RE = /\.(mp4|webm|mov|m4v|ogv|mp3|m4a|wav|ogg|zip|pdf)(\?|$)/i;

/* נתיבי API/פונקציות גם כשהם על אותו origin (פרוקסי/רי-רייט). */
const API_PATH_RE = /\/(functions|rest|auth|realtime|storage)\/v\d/i;

function shouldBypass(request) {
    // 1. כל בקשה שאינה GET (POST/PUT/PATCH/DELETE) — לעולם לא נוגעים.
    if (request.method !== 'GET') return true;

    // 2. בקשות טווח (וידאו שנגרר) — קאש שובר אותן.
    if (request.headers.has('range')) return true;

    let url;
    try { url = new URL(request.url); } catch (e) { return true; }

    // 3. כל מה שאינו http/https (chrome-extension וכו').
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

    // 4. cross-origin — כולל Supabase, יוטיוב, CDN, אנליטיקס.
    if (url.origin !== self.location.origin) return true;

    // 5. הגנת חגורה-ושלייקס: גם אם משהו מהאלה יגיע כ-same-origin.
    if (NEVER_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) return true;

    // 6. נתיבי API על אותו origin.
    if (API_PATH_RE.test(url.pathname)) return true;

    // 7. מדיה כבדה.
    if (HEAVY_MEDIA_RE.test(url.pathname)) return true;

    return false;
}

/* ============================================================================
   מחזור החיים
   ============================================================================ */

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // addAll נופל כולו על קובץ אחד חסר. cache.add פר-קובץ עם catch
            // מבטיח שהתקנה לא נכשלת בגלל נכס בודד שטרם נפרס (למשל אייקון).
            .then(cache => Promise.all(
                ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => null))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

/* pwa-register.js שולח את ההודעה הזו כשהמשתמש לוחץ "רענן" בבאנר העדכון. */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ============================================================================
   fetch — network-first, עם רשימת אי-תפיסה
   ============================================================================ */

self.addEventListener('fetch', (event) => {
    if (shouldBypass(event.request)) return;   // לא respondWith = הדפדפן מטפל לבד

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // רק תשובות תקינות מאותו origin נשמרות.
                // opaque (type 'opaque') ו-206 חלקיות לא נכנסות לקאש.
                if (response && response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, clone))
                        .catch(() => {});
                }
                return response;
            })
            .catch(() => caches.match(event.request).then(hit => {
                if (hit) return hit;
                // ניווט בלי רשת ובלי עותק שמור — מגישים את דף הבית מהקאש.
                if (event.request.mode === 'navigate') return caches.match('/index.html');
                return Response.error();
            }))
    );
});
