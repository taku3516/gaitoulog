const CACHE_NAME = 'street-activity-log-v7';

// 認証・API通信はキャッシュしない（トークン付きの応答を残さないため）
const NO_CACHE_HOSTS = [
    'accounts.google.com',
    'oauth2.googleapis.com',
    'www.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com',
];

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
    './js/utils/icons.js',
    './js/views/input-form.js',
    './js/views/list-view.js',
    './js/views/recommendations.js',
    './js/views/dashboard.js',
    './js/views/settings.js',
    './js/sync/bridge.js',
    './js/sync/app-sync.js',
    './data/firebase-config.js',
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
    const url = new URL(event.request.url);
    const cacheable = event.request.method === 'GET' && !NO_CACHE_HOSTS.includes(url.hostname);

    if (!cacheable) return; // ブラウザ既定の処理に任せる

    event.respondWith(fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
            .catch(() => {}); // 保存に失敗しても応答自体は返す
        return response;
    }).catch(() => caches.match(event.request)));
});
