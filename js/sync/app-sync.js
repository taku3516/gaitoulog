// ===== Google ログイン + Firestore 同期 =====
//
// アプリ本体は Firebase を一切知らない。やり取りは次の2つのグローバルだけ。
//   - window.GAITOULOG_SYNC_BRIDGE : アプリ側が公開する状態の出し入れ口
//   - window.GAITOULOG_CLOUD       : この module が公開するクラウド操作
//
// 設計上の約束:
//   - ログインは任意。未設定・読込失敗・オフラインでも従来機能を壊さない。
//   - 追加スコープは要求しない（Googleの基本プロフィールのみ）。
//   - 既定は非永続ログイン。Firestoreのブラウザ永続キャッシュも使わない。
//   - 初回マージではクラウドの既存データを絶対に上書きしない。

const CONFIG = window.GAITOULOG_FIREBASE_SYNC;
const DEFAULT_SDK_VERSION = '12.16.0';
const SDK_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const BATCH_LIMIT = 400;
const WRITE_DEBOUNCE_MS = 500;
const SCHEMA_VERSION = 1;

// ---------- 状態 ----------

let state = {
    available: false,   // 同期機能を提供できるか（設定済みか）
    ready: false,       // SDK読込・初期化が済んだか
    user: null,         // { uid, displayName }
    status: 'idle',     // 'idle' | 'connecting' | 'syncing' | 'synced' | 'error'
    message: '',
    busy: false,
};

const stateListeners = new Set();

function setState(patch) {
    state = { ...state, ...patch };
    stateListeners.forEach(fn => {
        try { fn({ ...state }); } catch (e) { console.error('cloud state listener failed:', e); }
    });
}

function getState() {
    return { ...state };
}

function onStateChange(listener) {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
}

// ---------- 設定の検証 ----------

function isConfigured() {
    if (!CONFIG || CONFIG.enabled !== true) return false;
    const c = CONFIG.firebaseConfig || {};
    return ['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof c[k] === 'string' && c[k].trim() !== '');
}

function resolveSdkVersion() {
    const v = CONFIG?.sdkVersion;
    return (typeof v === 'string' && SDK_VERSION_PATTERN.test(v)) ? v : DEFAULT_SDK_VERSION;
}

// ---------- 値の正規化 ----------
// Firestoreへ送る前にここで整える。同じ制約を firestore.rules 側にもかけてある。

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

const STRING_LIMITS = {
    dayOfWeek: 2, yearMonth: 7, startTime: 5, endTime: 5,
    date: 10, area: 100, locality: 100, spot: 100, spotId: 80,
    weather: 20, formType: 20, micType: 20, groupType: 20,
    volunteerNames: 500, troubleNote: 1000, memo: 2000,
    createdAt: 30, updatedAt: 30, politicianId: 80,
};

const NUMBER_LIMITS = {
    hour: 47, duration: 100000, distributionRate: 100000, acceptRate: 100000,
    distributionCount: 1000000, volunteerCount: 100000,
    approachCount: 1000000, stopCount: 1000000, refusalCount: 1000000,
    newContactCount: 1000000, donationCount: 1000000, qrCount: 1000000,
};

const BOOL_FIELDS = ['nextDay', 'hasTrouble'];
const LIST_FIELDS = { themes: 30, materials: 30 };
const LIST_ITEM_MAX_LEN = 60;

function normalizeString(value, maxLen) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed.slice(0, maxLen);
}

function normalizeNumber(value, maxValue) {
    if (value === '' || value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.min(Math.max(num, 0), maxValue);
}

function normalizeList(value, maxItems) {
    if (!Array.isArray(value)) return null;
    const cleaned = [...new Set(
        value.map(v => (typeof v === 'string' ? v.trim().slice(0, LIST_ITEM_MAX_LEN) : ''))
             .filter(Boolean)
    )].slice(0, maxItems);
    return cleaned.length ? cleaned : null;
}

/** レコードをFirestore用に正規化する。送れない場合は null。 */
function normalizeRecord(record) {
    if (!record?.id || !ID_PATTERN.test(record.id)) return null;

    const out = { id: record.id, schemaVersion: SCHEMA_VERSION };

    for (const [field, maxLen] of Object.entries(STRING_LIMITS)) {
        const v = normalizeString(record[field], maxLen);
        if (v !== null) out[field] = v;
    }
    for (const [field, maxValue] of Object.entries(NUMBER_LIMITS)) {
        const v = normalizeNumber(record[field], maxValue);
        if (v !== null) out[field] = v;
    }
    for (const field of BOOL_FIELDS) {
        if (record[field] !== undefined) out[field] = Boolean(record[field]);
    }
    for (const [field, maxItems] of Object.entries(LIST_FIELDS)) {
        const v = normalizeList(record[field], maxItems);
        if (v !== null) out[field] = v;
    }
    // 気温だけは負の値を許す
    if (record.temperature !== '' && record.temperature !== null && record.temperature !== undefined) {
        const t = Number(record.temperature);
        if (Number.isFinite(t)) out.temperature = Math.min(Math.max(t, -100), 100);
    }

    // ルールで必須にしている項目が欠けていたら送らない
    if (!out.politicianId) out.politicianId = 'default';
    if (!out.date || !out.area || !out.spot || out.distributionCount === undefined) return null;

    return out;
}

function normalizePolitician(politician) {
    if (!politician?.id || !ID_PATTERN.test(politician.id)) return null;
    const name = normalizeString(politician.name, 100);
    if (!name) return null;
    const out = { id: politician.id, name, schemaVersion: SCHEMA_VERSION };
    const updatedAt = normalizeString(politician.updatedAt, 30);
    if (updatedAt) out.updatedAt = updatedAt;
    return out;
}

function normalizeSpot(spot) {
    if (!spot?.id || !ID_PATTERN.test(spot.id)) return null;
    const area = normalizeString(spot.area, 100);
    const locality = normalizeString(spot.locality, 100);
    const name = normalizeString(spot.spot, 100);
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    if (!area || !name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    const out = {
        id: spot.id,
        area,
        spot: name,
        lat,
        lng,
        source: 'custom',
        archived: Boolean(spot.archived),
        schemaVersion: SCHEMA_VERSION,
    };
    if (locality) out.locality = locality;
    const createdAt = normalizeString(spot.createdAt, 30);
    const updatedAt = normalizeString(spot.updatedAt, 30);
    if (createdAt) out.createdAt = createdAt;
    if (updatedAt) out.updatedAt = updatedAt;
    return out;
}

/** Firestoreから来たドキュメントをアプリ内部の形へ戻す */
function fromCloud(data) {
    const { schemaVersion, syncedAt, ...rest } = data;
    return rest;
}

// ---------- Firebase SDK の読み込み ----------

let sdk = null;
let firebaseApp = null;
let auth = null;
let db = null;
let initPromise = null;

async function loadSdk() {
    const version = resolveSdkVersion();
    const base = `https://www.gstatic.com/firebasejs/${version}`;
    const [appMod, authMod, storeMod] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),
    ]);
    return { app: appMod, auth: authMod, store: storeMod, base };
}

async function initAppCheck(base) {
    const cfg = CONFIG?.appCheck;
    if (!cfg?.enabled || !cfg.enterpriseSiteKey) return;
    try {
        const mod = await import(`${base}/firebase-app-check.js`);
        mod.initializeAppCheck(firebaseApp, {
            provider: new mod.ReCaptchaEnterpriseProvider(cfg.enterpriseSiteKey),
            isTokenAutoRefreshEnabled: true,
        });
    } catch (e) {
        console.warn('App Check の初期化に失敗しました:', e);
    }
}

async function ensureInitialized() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        setState({ status: 'connecting', message: '接続しています...' });
        sdk = await loadSdk();
        firebaseApp = sdk.app.initializeApp(CONFIG.firebaseConfig);
        // 永続キャッシュは有効化しない（共用端末に同期データを残さないため）
        db = sdk.store.getFirestore(firebaseApp);
        auth = sdk.auth.getAuth(firebaseApp);
        await initAppCheck(sdk.base);
        sdk.auth.onAuthStateChanged(auth, handleAuthStateChanged);
        setState({ ready: true, status: 'idle', message: '' });
    })().catch(err => {
        initPromise = null;
        console.error('Firebase の初期化に失敗しました:', err);
        setState({ status: 'error', message: 'クラウド同期に接続できませんでした。オフラインの可能性があります。' });
        throw err;
    });
    return initPromise;
}

// ---------- 認証 ----------

function bridge() {
    return window.GAITOULOG_SYNC_BRIDGE;
}

async function signIn({ remember = false } = {}) {
    setState({ busy: true, message: '' });
    try {
        await ensureInitialized();
        const { GoogleAuthProvider, signInWithPopup, setPersistence,
                browserLocalPersistence, browserSessionPersistence } = sdk.auth;

        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

        const provider = new GoogleAuthProvider();
        // 追加スコープは要求しない（既定の基本プロフィールのみ）
        provider.setCustomParameters({ prompt: 'select_account' });

        await signInWithPopup(auth, provider);
        // 以降の処理は onAuthStateChanged に集約されている
    } catch (error) {
        if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
            setState({ status: 'idle', message: 'ログインがキャンセルされました。' });
        } else {
            console.error('ログインに失敗しました:', error);
            setState({ status: 'error', message: describeAuthError(error) });
        }
    } finally {
        setState({ busy: false });
    }
}

function describeAuthError(error) {
    switch (error?.code) {
        case 'auth/popup-blocked':
            return 'ログイン画面がブロックされました。ポップアップを許可してください。';
        case 'auth/unauthorized-domain':
            return 'このドメインが Firebase の承認済みドメインに登録されていません。';
        case 'auth/network-request-failed':
            return 'ネットワークに接続できませんでした。';
        default:
            return 'ログインに失敗しました。時間をおいて再度お試しください。';
    }
}

async function signOutUser() {
    setState({ busy: true });
    try {
        await ensureInitialized();
        await sdk.auth.signOut(auth);
    } catch (error) {
        console.error('ログアウトに失敗しました:', error);
        setState({ status: 'error', message: 'ログアウトに失敗しました。' });
    } finally {
        setState({ busy: false });
    }
}

// 認証状態の変化がすべての入口になる
async function handleAuthStateChanged(user) {
    if (user) {
        setState({ user: { uid: user.uid, displayName: user.displayName || '' }, status: 'syncing', message: '同期しています...' });
        try {
            await bridge()?.stashGuestState?.();
            bridge()?.setCloudActive?.(true);
            // 初回マージは退避1つにつき1回だけ。再読み込みのたびにやり直すと、
            // ログイン後に削除したアカウントや記録がクラウドへ復活してしまう。
            if (bridge()?.hasGuestMerged?.(user.uid) !== true) {
                await mergeGuestIntoCloud(user.uid);
                bridge()?.markGuestMerged?.(user.uid);
            }
            startListeners(user.uid);
        } catch (error) {
            console.error('初回同期に失敗しました:', error);
            setState({ status: 'error', message: '同期の開始に失敗しました。' });
        }
    } else {
        stopListeners();
        setState({ user: null, status: 'idle', message: '' });
        bridge()?.setCloudActive?.(false);
        try {
            await bridge()?.restoreGuestState?.();
        } catch (error) {
            console.error('ローカル状態の復元に失敗しました:', error);
        }
    }
}

// ---------- 初回マージ ----------
// クラウドに無いものだけを足す。既にクラウドにあるものは絶対に上書きしない。

async function mergeGuestIntoCloud(uid) {
    const { collection, getDocs, writeBatch, doc, serverTimestamp } = sdk.store;
    const guest = await bridge()?.getGuestState?.();
    if (!guest) return;

    const [recordSnap, politicianSnap, spotSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'records')),
        getDocs(collection(db, 'users', uid, 'politicians')),
        getDocs(collection(db, 'users', uid, 'spots')),
    ]);
    const existingRecords = new Set(recordSnap.docs.map(d => d.id));
    const existingPoliticians = new Set(politicianSnap.docs.map(d => d.id));
    const existingSpots = new Set(spotSnap.docs.map(d => d.id));

    const pending = [];
    for (const record of guest.records || []) {
        if (existingRecords.has(record.id)) continue; // クラウド優先
        const normalized = normalizeRecord(record);
        if (normalized) pending.push({ path: 'records', data: normalized });
    }
    for (const politician of guest.politicians || []) {
        if (existingPoliticians.has(politician.id)) continue;
        const normalized = normalizePolitician(politician);
        if (normalized) pending.push({ path: 'politicians', data: normalized });
    }
    for (const spot of guest.spots || []) {
        if (existingSpots.has(spot.id)) continue;
        const normalized = normalizeSpot(spot);
        if (normalized) pending.push({ path: 'spots', data: normalized });
    }

    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const item of pending.slice(i, i + BATCH_LIMIT)) {
            batch.set(doc(db, 'users', uid, item.path, item.data.id), { ...item.data, syncedAt: serverTimestamp() });
        }
        await batch.commit();
    }
}

// ---------- 受信 ----------

let unsubscribes = [];
let latestRecords = null;
let latestPoliticians = null;
let latestSpots = null;

// ---------- ローカル変更の保護 ----------
// クラウドへの書き込みは少し待ってからまとめて送る（scheduleWrite）。
// その間や、書き込みが拒否されたときに購読側のスナップショットをそのまま
// 適用すると、まだクラウドに無いローカルの変更が消えてしまう。
// 確定していない変更をここで覚えておき、適用時に重ね直す。
const unconfirmedRecords = new Map(); // id -> 正規化済みレコード（未確定の追加・更新）
const unconfirmedDeletes = new Set(); // 未確定の削除
let politiciansWritePending = false;  // アカウント一覧の書き込みが未確定
let spotsWritePending = false;        // スポット一覧の書き込みが未確定

function mergeUnconfirmed(cloudRecords) {
    const byId = new Map(cloudRecords.map(r => [r.id, r]));
    for (const id of unconfirmedDeletes) byId.delete(id);
    for (const [id, record] of unconfirmedRecords) byId.set(id, record);
    return [...byId.values()];
}

function startListeners(uid) {
    stopListeners();
    const { collection, onSnapshot } = sdk.store;

    const handle = (kind) => (snapshot) => {
        const docs = snapshot.docs.map(d => fromCloud(d.data()));
        if (kind === 'records') latestRecords = docs;
        else if (kind === 'politicians') latestPoliticians = docs;
        else latestSpots = docs;

        if (latestRecords === null || latestPoliticians === null || latestSpots === null) return;

        bridge()?.applyCloudState?.({
            records: mergeUnconfirmed(latestRecords),
            // アカウント一覧の書き込みが未確定の間は、クラウド側の古い一覧で上書きしない
            politicians: politiciansWritePending ? null : latestPoliticians,
            spots: spotsWritePending ? null : latestSpots,
        });

        // 自分の書き込みがまだサーバーに届いていない間は「同期済み」にしない
        if (!snapshot.metadata.hasPendingWrites) {
            setState({ status: 'synced', message: '' });
        }
    };

    unsubscribes = [
        onSnapshot(collection(db, 'users', uid, 'records'), handle('records'),
            err => { console.error('records の購読に失敗:', err); setState({ status: 'error', message: '同期が中断されました。' }); }),
        onSnapshot(collection(db, 'users', uid, 'politicians'), handle('politicians'),
            err => { console.error('politicians の購読に失敗:', err); }),
        onSnapshot(collection(db, 'users', uid, 'spots'), handle('spots'),
            err => { console.error('spots の購読に失敗:', err); }),
    ];
}

function stopListeners() {
    unsubscribes.forEach(fn => { try { fn(); } catch { /* 解除失敗は無視 */ } });
    unsubscribes = [];
    latestRecords = null;
    latestPoliticians = null;
    latestSpots = null;
    unconfirmedRecords.clear();
    unconfirmedDeletes.clear();
    politiciansWritePending = false;
    spotsWritePending = false;
}

// ---------- 送信 ----------

const pendingWrites = new Map(); // key -> timer

function scheduleWrite(key, fn) {
    clearTimeout(pendingWrites.get(key));
    pendingWrites.set(key, setTimeout(async () => {
        pendingWrites.delete(key);
        try {
            await fn();
        } catch (error) {
            console.error('クラウドへの保存に失敗しました:', error);
            setState({ status: 'error', message: describeWriteError(error) });
        }
    }, WRITE_DEBOUNCE_MS));
}

function describeWriteError(error) {
    if (error?.code === 'permission-denied') {
        // ルールが古いと、アプリが送る項目がサーバー側で弾かれる
        return 'クラウドへの保存が拒否されました。Firestoreのセキュリティルールが最新か確認してください。';
    }
    return 'クラウドへの保存に失敗しました。この端末のデータは保持されています。';
}

function currentUid() {
    return state.user?.uid || null;
}

/** アプリ本体から呼ばれる: レコードが追加・更新された */
function recordsChanged(records) {
    const uid = currentUid();
    if (!uid || !sdk) return;
    const normalized = (records || []).map(normalizeRecord).filter(Boolean);
    if (!normalized.length) return;

    // サーバーが受け取るまではローカルの内容を正とする
    for (const record of normalized) {
        unconfirmedRecords.set(record.id, record);
        unconfirmedDeletes.delete(record.id);
    }

    setState({ status: 'syncing', message: '' });
    scheduleWrite(`records:${normalized.map(r => r.id).join(',')}`, async () => {
        const { writeBatch, doc, serverTimestamp } = sdk.store;
        for (let i = 0; i < normalized.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            for (const record of normalized.slice(i, i + BATCH_LIMIT)) {
                batch.set(doc(db, 'users', uid, 'records', record.id), { ...record, syncedAt: serverTimestamp() });
            }
            await batch.commit();
        }
        // 保存できたものだけ保護を解除する（その後さらに編集された分は残す）
        for (const record of normalized) {
            if (unconfirmedRecords.get(record.id) === record) unconfirmedRecords.delete(record.id);
        }
    });
}

/** アプリ本体から呼ばれる: レコードが削除された */
function recordsDeleted(ids) {
    const uid = currentUid();
    if (!uid || !sdk) return;
    const valid = (ids || []).filter(id => ID_PATTERN.test(id));
    if (!valid.length) return;

    for (const id of valid) {
        unconfirmedDeletes.add(id);
        unconfirmedRecords.delete(id);
    }

    setState({ status: 'syncing', message: '' });
    scheduleWrite(`delete:${valid.join(',')}`, async () => {
        const { writeBatch, doc } = sdk.store;
        for (let i = 0; i < valid.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            for (const id of valid.slice(i, i + BATCH_LIMIT)) {
                batch.delete(doc(db, 'users', uid, 'records', id));
            }
            await batch.commit();
        }
        for (const id of valid) unconfirmedDeletes.delete(id);
    });
}

/** アプリ本体から呼ばれる: アカウント一覧が変わった */
function politiciansChanged(politicians) {
    const uid = currentUid();
    if (!uid || !sdk) return;
    const normalized = (politicians || []).map(normalizePolitician).filter(Boolean);
    if (!normalized.length) return;

    politiciansWritePending = true;
    scheduleWrite('politicians', async () => {
        const { writeBatch, doc, serverTimestamp, getDocs, collection } = sdk.store;
        const existing = await getDocs(collection(db, 'users', uid, 'politicians'));
        const keep = new Set(normalized.map(p => p.id));

        const batch = writeBatch(db);
        for (const politician of normalized) {
            batch.set(doc(db, 'users', uid, 'politicians', politician.id), { ...politician, syncedAt: serverTimestamp() });
        }
        for (const snap of existing.docs) {
            if (!keep.has(snap.id)) batch.delete(snap.ref);
        }
        await batch.commit();
        politiciansWritePending = false;
    });
}

/** アプリ本体から呼ばれる: 利用者追加スポット一覧が変わった */
function spotsChanged(spots) {
    const uid = currentUid();
    if (!uid || !sdk) return;
    const normalized = (spots || []).map(normalizeSpot).filter(Boolean);

    spotsWritePending = true;
    setState({ status: 'syncing', message: '' });
    scheduleWrite('spots', async () => {
        const { writeBatch, doc, serverTimestamp, getDocs, collection } = sdk.store;
        const existing = await getDocs(collection(db, 'users', uid, 'spots'));
        const keep = new Set(normalized.map(spot => spot.id));

        const operations = [];
        for (const spot of normalized) operations.push({ type: 'set', spot });
        for (const snap of existing.docs) {
            if (!keep.has(snap.id)) operations.push({ type: 'delete', snap });
        }
        for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            for (const operation of operations.slice(i, i + BATCH_LIMIT)) {
                if (operation.type === 'set') {
                    batch.set(doc(db, 'users', uid, 'spots', operation.spot.id), { ...operation.spot, syncedAt: serverTimestamp() });
                } else {
                    batch.delete(operation.snap.ref);
                }
            }
            await batch.commit();
        }
        spotsWritePending = false;
    });
}

// ---------- データとアカウントの削除 ----------

async function deleteAccountAndData() {
    setState({ busy: true, message: '' });
    try {
        await ensureInitialized();
        const user = auth.currentUser;
        if (!user) return;

        const { GoogleAuthProvider, reauthenticateWithPopup, deleteUser } = sdk.auth;
        const { collection, getDocs, writeBatch } = sdk.store;

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);

        stopListeners();

        for (const path of ['records', 'politicians', 'spots']) {
            const snapshot = await getDocs(collection(db, 'users', user.uid, path));
            const docs = snapshot.docs;
            for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
                const batch = writeBatch(db);
                docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        }

        await deleteUser(user);
        window.location.reload();
    } catch (error) {
        if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
            setState({ status: 'idle', message: '削除がキャンセルされました。' });
        } else {
            console.error('アカウント削除に失敗しました:', error);
            setState({ status: 'error', message: 'アカウントの削除に失敗しました。' });
        }
    } finally {
        setState({ busy: false });
    }
}

// ---------- 起動 ----------

window.GAITOULOG_CLOUD = Object.freeze({
    isAvailable: () => state.available,
    getState,
    onStateChange,
    signIn,
    signOut: signOutUser,
    deleteAccountAndData,
    recordsChanged,
    recordsDeleted,
    politiciansChanged,
    spotsChanged,
});

if (isConfigured()) {
    setState({ available: true });
    // ログイン状態の復元のため、起動時に一度だけ初期化する。
    // 失敗してもアプリ本体は従来どおり動作する。
    ensureInitialized().catch(() => {});
} else {
    // 未設定なら何も起きない。同期UIも表示されない。
    setState({ available: false });
}

// 設定未完了・SDK読込失敗のいずれでも、ログイン前のローカルデータが
// クラウドモードのまま取り残されないようにする。
window.addEventListener('load', () => {
    if (!state.available) bridge()?.restoreGuestState?.();
});
