const CACHE_NAME = 'tb-training-v1';

const APP_SHELL = [
    '/Palestra/',
    '/Palestra/index.html',
    '/Palestra/chi-sono.html',
    '/Palestra/login.html',
    '/Palestra/prenotazioni.html',
    '/Palestra/dove-sono.html',
    '/Palestra/admin.html',
    '/Palestra/css/style.css',
    '/Palestra/css/admin.css',
    '/Palestra/css/login.css',
    '/Palestra/css/prenotazioni.css',
    '/Palestra/css/chi-sono.css',
    '/Palestra/css/dove-sono.css',
    '/Palestra/js/ui.js',
    '/Palestra/js/data.js',
    '/Palestra/js/calendar.js',
    '/Palestra/js/booking.js',
    '/Palestra/js/auth.js',
    '/Palestra/js/admin.js',
    '/Palestra/js/chart-mini.js',
    '/Palestra/images/logo-tb---nero.jpg',
    '/Palestra/manifest.json',
];

// Installazione: mette in cache l'app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Attivazione: rimuove cache vecchie
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch: Cache First per asset statici, Network First per navigazione
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignora richieste non-GET e richieste esterne (Supabase, Google, ecc.)
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // Network First per le pagine HTML — sempre aggiornate se online
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Cache First per CSS, JS, immagini
    event.respondWith(
        caches.match(request)
            .then(cached => cached || fetch(request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                return response;
            }))
    );
});
