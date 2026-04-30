// Service Worker for NLP Game PWA
const CACHE_NAME = 'nlp-game-v1';
const ASSETS_TO_CACHE = [
    '/pages/nlp-game.html',
    '/css/nlp-game.css',
    '/css/theme.css',
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
    '/assets/mentor-ram.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
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

self.addEventListener('fetch', (event) => {
    // Network-first strategy: try network, fall back to cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
