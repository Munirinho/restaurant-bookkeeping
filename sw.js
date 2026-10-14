const CACHE_NAME = 'restrobooks-v12';
const ASSETS = [
    'index.html',
    'style.css',
    'app.js',
    'firebase.js',
    'manifest.json',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const req = e.request;

    // Navigation requests: always try the network first so app updates arrive
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                return response;
            }).catch(() => caches.match(req).then(cached => cached || caches.match('index.html')))
        );
        return;
    }

    // firebase-config.js is injected per deploy — always prefer the fresh
    // network copy so a fixed config reaches users immediately (offline:
    // fall back to whatever was cached, app still works without cloud).
    if (req.url.indexOf('firebase-config.js') !== -1) {
        e.respondWith(
            fetch(req).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                return response;
            }).catch(() => caches.match(req))
        );
        return;
    }

    // Static assets: cache-first for speed and offline
    e.respondWith(
        caches.match(req).then(cached => {
            return cached || fetch(req).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                return response;
            }).catch(() => cached || caches.match('index.html'));
        })
    );
});