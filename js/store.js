// ===== データストア (IndexedDB + Async Wrapper) =====
import { enrichRecord } from './calculations.js';

const DB_NAME = 'StreetActivityLogsDB';
const DB_VERSION = 3; // v3: ログイン前のローカルデータを退避するストアを追加
const STORE_NAME = 'records';
const GUEST_STORE = 'guestRecords';

// 複数議員対応
const POLITICIAN_KEY = 'streetActivityLog_currentPoliticianId';
const ALL_POLITICIANS_KEY = 'streetActivityLog_allPoliticians';

let currentPoliticianId = localStorage.getItem(POLITICIAN_KEY) || 'default';
let politicians = JSON.parse(localStorage.getItem(ALL_POLITICIANS_KEY)) || [
    { id: 'default', name: '標準アカウント' }
];

// ===== 変更通知 =====
// 同期モジュールが「何がどう変わったか」を受け取るための購読口。
// ストア自身はクラウドのことを一切知らない。
const changeListeners = new Set();

export function onChange(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
}

function emitChange(event) {
    changeListeners.forEach(fn => {
        try { fn(event); } catch (e) { console.error('onChange listener failed:', e); }
    });
}

export function getCurrentPoliticianId() {
    return currentPoliticianId;
}

export function setCurrentPoliticianId(id) {
    currentPoliticianId = id;
    localStorage.setItem(POLITICIAN_KEY, id);
}

export function getPoliticians() {
    return [...politicians];
}

export function addPolitician(name) {
    const id = 'pol_' + Date.now().toString(36);
    politicians.push({ id, name, updatedAt: new Date().toISOString() });
    localStorage.setItem(ALL_POLITICIANS_KEY, JSON.stringify(politicians));
    emitChange({ type: 'politicians', politicians: getPoliticians() });
    return id;
}

/**
 * アカウントを1つ削除する。そのアカウントの活動記録もあわせて削除する。
 * 最後の1つは削除できない（アプリが表示するアカウントが無くなるため）。
 * @returns {Promise<{removed: boolean, reason?: 'last'|'notFound', deletedRecordCount?: number}>}
 */
export async function removePolitician(id) {
    if (!politicians.some(p => p.id === id)) return { removed: false, reason: 'notFound' };
    if (politicians.length <= 1) return { removed: false, reason: 'last' };

    const deletedRecordCount = await removeRecordsOfPolitician(id);

    politicians = politicians.filter(p => p.id !== id);
    localStorage.setItem(ALL_POLITICIANS_KEY, JSON.stringify(politicians));
    if (currentPoliticianId === id) setCurrentPoliticianId(politicians[0].id);
    emitChange({ type: 'politicians', politicians: getPoliticians(), removedId: id });
    return { removed: true, deletedRecordCount };
}

/** アカウントごとの記録件数を { politicianId: 件数 } で返す */
export async function countRecordsByPolitician() {
    const counts = {};
    for (const r of await getAllRaw()) {
        const key = r.politicianId || 'default';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

/** 指定アカウントの記録をすべて削除し、削除件数を返す */
async function removeRecordsOfPolitician(id) {
    const targetIds = (await getAllRaw())
        .filter(r => (r.politicianId || 'default') === id)
        .map(r => r.id);
    if (targetIds.length) await bulkRemove(targetIds);
    return targetIds.length;
}

/**
 * アカウント一覧をまるごと差し替える（同期モジュール専用。変更通知は出さない）。
 */
export function replacePoliticians(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    politicians = list;
    localStorage.setItem(ALL_POLITICIANS_KEY, JSON.stringify(politicians));
    if (!politicians.some(p => p.id === currentPoliticianId)) {
        setCurrentPoliticianId(politicians[0]?.id || 'default');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// IndexedDB Helper
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(GUEST_STORE)) {
                db.createObjectStore(GUEST_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// マイグレーション (localStorage -> IndexedDB)
export async function migrateFromLocalStorage() {
    const oldData = localStorage.getItem('streetActivityLogs');
    const migratedFlag = localStorage.getItem('streetActivityLogs_migrated_idb2');
    if (oldData && !migratedFlag) {
        try {
            const parsed = JSON.parse(oldData);
            const db = await initDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            parsed.forEach(r => {
                if (!r.politicianId) r.politicianId = 'default';
                store.put(r);
            });
            await new Promise(r => tx.oncomplete = r);
            localStorage.setItem('streetActivityLogs_migrated_idb2', 'true');
        } catch(e) { console.error('Migration failed:', e); }
    }
}

export async function getAll() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
             // currentPoliticianId でフィルタ
             const all = request.result || [];
             resolve(all.filter(r => (r.politicianId || 'default') === currentPoliticianId));
        };
        request.onerror = () => reject(request.error);
    });
}

// IndexedDB上の全てのデータを取得（エクスポートなどの用途）
export async function getAllRaw() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function getById(id) {
    const all = await getAll();
    return all.find(r => r.id === id) || null;
}

export async function save(record) {
    const enriched = enrichRecord({
        ...record,
        id: generateId(),
        politicianId: currentPoliticianId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(enriched);
        tx.oncomplete = () => { emitChange({ type: 'upsert', records: [enriched] }); resolve(enriched); };
        tx.onerror = () => reject(tx.error);
    });
}

export async function update(id, updates) {
    const record = await getById(id);
    if (!record) return null;
    const updated = enrichRecord({ ...record, ...updates, updatedAt: new Date().toISOString() });
    
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(updated);
        tx.oncomplete = () => { emitChange({ type: 'upsert', records: [updated] }); resolve(updated); };
        tx.onerror = () => reject(tx.error);
    });
}

export async function remove(id) {
    return bulkRemove([id]);
}

export async function bulkImport(newRecords) {
    const enriched = newRecords.map(r => enrichRecord({
        ...r,
        id: generateId() + Math.random().toString(36).substr(2, 4),
        politicianId: r.politicianId || currentPoliticianId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));
    
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        enriched.forEach(r => store.put(r));
        tx.oncomplete = () => { emitChange({ type: 'upsert', records: enriched }); resolve(enriched.length); };
        tx.onerror = () => reject(tx.error);
    });
}

export async function bulkRemove(ids) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => { emitChange({ type: 'delete', ids }); resolve(); };
        tx.onerror = () => reject(tx.error);
    });
}

// ===== ログイン前ローカルデータの退避 / 復元 =====
// ログイン中はクラウドの内容をローカルへ写して表示する。
// ログアウトしたときにログイン前の状態へ正確に戻せるよう、
// クラウドに切り替える直前のデータを別ストアへ退避しておく。

const GUEST_POLITICIANS_KEY = 'streetActivityLog_guestPoliticians';
const GUEST_STASHED_KEY = 'streetActivityLog_guestStashed';
const GUEST_MERGED_KEY = 'streetActivityLog_guestMergedUids';

export function hasGuestSnapshot() {
    return localStorage.getItem(GUEST_STASHED_KEY) === 'true';
}

/**
 * この退避データを、指定のクラウドアカウントへ既にマージ済みか。
 * マージは1つの退避につき1回だけ。毎回やり直すと、退避後に削除した
 * アカウントや記録がクラウドへ復活してしまう。
 */
export function hasGuestMergedInto(uid) {
    return getGuestMergedUids().includes(uid);
}

export function markGuestMergedInto(uid) {
    const uids = getGuestMergedUids();
    if (uids.includes(uid)) return;
    uids.push(uid);
    localStorage.setItem(GUEST_MERGED_KEY, JSON.stringify(uids));
}

function getGuestMergedUids() {
    try {
        const parsed = JSON.parse(localStorage.getItem(GUEST_MERGED_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** 現在のローカルデータをゲスト用ストアへ退避する（既に退避済みなら何もしない） */
export async function stashGuestSnapshot() {
    if (hasGuestSnapshot()) return;
    const records = await getAllRaw();
    const db = await initDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(GUEST_STORE, 'readwrite');
        const guest = tx.objectStore(GUEST_STORE);
        guest.clear();
        records.forEach(r => guest.put(r));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem(GUEST_POLITICIANS_KEY, JSON.stringify(politicians));
    localStorage.setItem(GUEST_STASHED_KEY, 'true');
    // 新しい退避なので、マージ済みの記録もやり直す
    localStorage.removeItem(GUEST_MERGED_KEY);
}

/** 退避しておいたゲスト状態を読み出す（マージ処理用） */
export async function getGuestSnapshot() {
    if (!hasGuestSnapshot()) return null;
    const db = await initDB();
    const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(GUEST_STORE, 'readonly');
        const req = tx.objectStore(GUEST_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
    let guestPoliticians = [];
    try { guestPoliticians = JSON.parse(localStorage.getItem(GUEST_POLITICIANS_KEY)) || []; } catch { /* 破損時は空扱い */ }
    return { records, politicians: guestPoliticians };
}

/** ゲスト状態へ戻し、クラウド由来のデータをこの端末から消す */
export async function restoreGuestSnapshot() {
    // 退避が無いのに実行すると、現在のデータを消してしまうので必ず確認する
    if (!hasGuestSnapshot()) return false;
    const snapshot = await getGuestSnapshot();
    const db = await initDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, GUEST_STORE], 'readwrite');
        const main = tx.objectStore(STORE_NAME);
        main.clear();
        (snapshot?.records || []).forEach(r => main.put(r));
        tx.objectStore(GUEST_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
    if (snapshot?.politicians?.length) replacePoliticians(snapshot.politicians);
    localStorage.removeItem(GUEST_POLITICIANS_KEY);
    localStorage.removeItem(GUEST_STASHED_KEY);
    localStorage.removeItem(GUEST_MERGED_KEY);
    return true;
}

/**
 * クラウドの内容でローカルの表示用データを差し替える（同期モジュール専用）。
 * 変更通知は出さない（クラウドへの書き戻しループを避けるため）。
 */
export async function replaceAllRecords(records) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const main = tx.objectStore(STORE_NAME);
        main.clear();
        records.forEach(r => main.put(r));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearAllForCurrentPolitician() {
    const all = await getAll();
    const ids = all.map(r => r.id);
    return bulkRemove(ids);
}

const INIT_FLAG_KEY = 'streetActivityLogs_initialized_v2';

export async function initIfEmpty(dummyRecords) {
    await migrateFromLocalStorage();
    
    const alreadyInitialized = localStorage.getItem(INIT_FLAG_KEY);
    if (alreadyInitialized) return;

    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = () => {
            if (req.result === 0) {
                const enriched = dummyRecords.map(r => enrichRecord({
                    ...r,
                    id: generateId() + Math.random().toString(36).substr(2, 4),
                    politicianId: 'default',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }));
                const writeTx = db.transaction(STORE_NAME, 'readwrite');
                const writeStore = writeTx.objectStore(STORE_NAME);
                enriched.forEach(r => writeStore.put(r));
                writeTx.oncomplete = () => {
                    localStorage.setItem(INIT_FLAG_KEY, 'true');
                    resolve();
                };
                writeTx.onerror = () => reject(writeTx.error);
            } else {
                localStorage.setItem(INIT_FLAG_KEY, 'true');
                resolve();
            }
        };
        req.onerror = () => reject(req.error);
    });
}

export async function getRecentLocations(limit = 5) {
    const records = await getAll();
    records.sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set();
    const result = [];
    for (const r of records) {
        const key = `${r.area}|${r.spot}`;
        if (!seen.has(key)) { seen.add(key); result.push({ area: r.area, locality: r.locality || '', spot: r.spot }); if (result.length >= limit) break; }
    }
    return result;
}

export async function getRecentThemes() {
    const counts = {};
    for (const r of await getAll()) {
        if (r.themes) for (const t of r.themes) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export async function getRecentMaterials() {
    const counts = {};
    for (const r of await getAll()) {
        if (r.materials) for (const m of r.materials) counts[m] = (counts[m] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export async function getUniqueAreas() {
    return [...new Set((await getAll()).map(r => r.area).filter(Boolean))];
}

export async function getUniqueLocalities() {
    return [...new Set((await getAll()).map(r => r.locality).filter(Boolean))];
}

export async function getUniqueSpots() {
    return [...new Set((await getAll()).map(r => r.spot).filter(Boolean))];
}

/**
 * おすすめ活動候補の計算ロジック
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} startStr 'HH:mm'
 * @param {string} area フィルタ用（任意）
 * @param {string} spot フィルタ用（任意）
 * @returns {Promise<Array>}
 */
export async function getRecommendations(dateStr, startStr, area = '', spot = '') {
    const allRecords = await getAll();
    if (!dateStr || !startStr || allRecords.length === 0) return [];

    const d = new Date(dateStr);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    const hour = parseInt(startStr.split(':')[0], 10);

    let candidates = allRecords.filter(r => {
        let score = 0;
        if (r.dayOfWeek === dayOfWeek) score += 1;
        if (r.hour != null && Math.abs(r.hour - hour) <= 2) score += 1;
        if (area && r.area === area) score += 2;
        if (spot && r.spot === spot) score += 3;
        r._matchScore = score;
        return score >= 2;
    });

    const bestBySpot = {};
    for (const c of candidates) {
        const key = `${c.area}|${c.spot}`;
        const prev = bestBySpot[key];
        const rate = c.distributionRate || 0;
        if (!prev || rate > (prev.distributionRate || 0)) {
            bestBySpot[key] = c;
        }
    }

    return Object.values(bestBySpot).sort((a, b) => {
        return (b.distributionRate || 0) - (a.distributionRate || 0) || b._matchScore - a._matchScore;
    }).slice(0, 10);
}
