const CACHE_NAME = 'street-activity-log-v3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/store.js',
    './js/calculations.js',
    './js/dummy-data.js',
    './js/validation.js',
    './js/utils/csv-export.js',
    './js/utils/csv-import.js',
    './js/views/input-form.js',
    './js/views/list-view.js',
    './js/views/recommendations.js',
    './js/views/dashboard.js',
    './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
    }).catch(() => caches.match(event.request)));
});
