// v21 のキャッシュにはHTTPキャッシュ経由で取得した古い応答が混じっている
// 可能性があるため、名前を変えて丸ごと作り直す
const CACHE_NAME = 'street-activity-log-v22';

// 認証・API通信はキャッシュしない（トークン付きの応答を残さないため）
const NO_CACHE_HOSTS = [
    'accounts.google.com',
    'oauth2.googleapis.com',
    'www.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com',
    'apis.google.com',
    'tile.openstreetmap.org',
];

// Firebase のログイン用ページ（リダイレクト方式で経由する）もキャッシュしない。
// 古い応答を返すとログインが完了しなくなる。
function isAuthTraffic(url) {
    return url.hostname.endsWith('.firebaseapp.com') || url.pathname.startsWith('/__/auth/');
}

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/theme.js',
    './js/store.js',
    './js/calculations.js',
    './js/dummy-data.js',
    './js/validation.js',
    './js/location-catalog.js',
    './js/spot-store.js',
    './js/activity-timer.js',
    './js/map-picker.js',
    './js/activity-map.js',
    './js/share-report.js',
    './js/report.js',
    './js/schedule.js',
    './js/utils/backup.js',
    './js/memo-parser.js',
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
    './js/sync/auth-environment.js',
    './data/firebase-config.js',
    './data/spot-coordinates.js',
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
    const cacheable = event.request.method === 'GET'
        && !NO_CACHE_HOSTS.includes(url.hostname)
        && !isAuthTraffic(url);

    if (!cacheable) return; // ブラウザ既定の処理に任せる

    // ネットワーク優先だが、fetch をそのまま呼ぶとHTTPキャッシュを経由するため、
    // Cache-Control が長いと「取りに行ったつもりで古い応答」を掴む。
    // 実際にデプロイ済みの変更が端末に届かない事象が起きたので、
    // 自分のオリジンの部品には cache:'no-cache' を付けて必ず確認させる。
    // 'no-store' ではないので、内容が同じなら304で済み転送量は増えない。
    //
    // ナビゲーションは対象外にする。Request を init 付きで作り直すと
    // mode が navigate から same-origin に変わり、リダイレクトの扱いが
    // 変わってしまうため（ログインの復帰経路に影響し得る）。
    // ページ本体の鮮度は firebase.json の no-cache ヘッダー側で担保する。
    const revalidate = event.request.mode !== 'navigate' && url.origin === self.location.origin;
    const request = revalidate ? new Request(event.request, { cache: 'no-cache' }) : event.request;

    event.respondWith(fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
            .catch(() => {}); // 保存に失敗しても応答自体は返す
        return response;
    }).catch(() => caches.match(event.request)));
});
