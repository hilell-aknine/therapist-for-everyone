// Service Worker — Beit V'Metaplim Portal PWA
// Hybrid strategy: cache-first for static assets, network-first for HTML.
const CACHE_VERSION = 'portal-v3-2026-04-30';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Pre-cached on install. Keep this list lean — large lists slow installs.
const PRECACHE_ASSETS = [
    '/',
    '/manifest.json',
    '/css/theme.css',
    '/css/components.css',
    '/css/accessibility.css',
    '/pages/course-library.html',
    '/pages/profile.html',
    '/pages/login.html',
    '/pages/nlp-game.html',
    '/js/supabase-client.js',
    '/supabase-config.js',
    '/js/pwa-install.js',
    '/assets/pwa-icon-192.png',
    '/assets/pwa-icon-512.png',
    '/assets/apple-touch-icon-180.png',
    '/assets/logo-square.png',
    '/assets/logo.png',
    '/assets/mentor-ram.png',
    '/assets/free-portal-hero.png',
    '/assets/portal-video-thumbnail.png',
    // NLP game (kept for backward compatibility)
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
    '/js/nlp-game-leaderboard.js'
];

// Hosts we never intercept — auth + analytics + video must always go through.
const PASSTHROUGH_HOSTS = [
    'supabase.co',
    'supabase.in',
    'googleapis.com',
    'gstatic.com',
    'google-analytics.com',
    'googletagmanager.com',
    'youtube.com',
    'youtu.be',
    'ytimg.com',
    'challenges.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => {
                // Don't fail install if a single asset is missing.
                console.warn('[SW] precache partial failure:', err);
            }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

function isPassthrough(url) {
    return PASSTHROUGH_HOSTS.some(h => url.hostname.endsWith(h));
}

function isHtmlRequest(req) {
    return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

function isStaticAsset(url) {
    return /\.(css|js|png|jpg|jpeg|svg|woff2?|ttf|ico|webp)$/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Always go to network for auth/api/video/analytics — never cache.
    if (isPassthrough(url)) return;

    // HTML: network-first with cache fallback (so users get fresh content but offline still works).
    if (isHtmlRequest(req)) {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(RUNTIME_CACHE).then(c => c.put(req, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(req).then(hit => hit || caches.match('/pages/course-library.html')))
        );
        return;
    }

    // Static assets: cache-first with background revalidation (stale-while-revalidate).
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(req).then(cached => {
                const networkFetch = fetch(req).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(STATIC_CACHE).then(c => c.put(req, clone));
                    }
                    return res;
                }).catch(() => cached);
                return cached || networkFetch;
            })
        );
        return;
    }

    // Default: try network, fall back to cache.
    event.respondWith(
        fetch(req).catch(() => caches.match(req))
    );
});

// Allow page to trigger immediate activation of a new SW version.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
