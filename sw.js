const CACHE_NAME = 'palestra-v6';

const APP_SHELL = [
    '/',
    '/chi-sono.html',
    '/login.html',
    '/prenotazioni.html',
    '/dove-sono.html',
    '/admin.html',
    '/css/style.css',
    '/css/admin.css',
    '/css/login.css',
    '/css/prenotazioni.css',
    '/css/chi-sono.css',
    '/css/dove-sono.css',
    '/js/ui.js',
    '/js/data.js',
    '/js/calendar.js',
    '/js/booking.js',
    '/js/auth.js',
    '/js/admin.js',
    '/js/chart-mini.js',
    '/js/push.js',
    '/images/logo-tb---nero.jpg',
    '/manifest.json',
];

// Installazione: cacha ogni file singolarmente — se uno manca non blocca tutto
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                APP_SHELL.map(url =>
                    cache.add(url).catch(() => console.warn('[SW] Skip:', url))
                )
            )
        ).then(() => self.skipWaiting())
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

// Push: riceve notifiche dal server (Supabase Edge Function)
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Thomas Bresciani';
    const options = {
        body: data.body || '',
        icon: '/images/logo-tb---nero.jpg',
        badge: '/images/logo-tb---nero.jpg',
        tag: data.tag || 'tb-push',
        renotify: true,
        data: { url: data.url || '/prenotazioni.html' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// Notifiche: porta in primo piano la finestra app al click
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const appClient = clients.find(c => c.url.includes('thomasbresciani.com'));
            if (appClient) return appClient.focus();
            return self.clients.openWindow('/prenotazioni.html');
        })
    );
});

// Fetch: Network First per HTML, Cache First per asset statici
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignora richieste non-GET e risorse esterne (Supabase, Google Fonts, ecc.)
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // Network First per le pagine HTML
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
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});
