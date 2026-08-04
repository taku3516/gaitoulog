// ===== データストア (IndexedDB + Async Wrapper) =====
import { enrichRecord } from './calculations.js';

const DB_NAME = 'StreetActivityLogsDB';
const DB_VERSION = 2; // Migrate from v1 if needed
const STORE_NAME = 'records';

// 複数議員対応
const POLITICIAN_KEY = 'streetActivityLog_currentPoliticianId';
const ALL_POLITICIANS_KEY = 'streetActivityLog_allPoliticians';

let currentPoliticianId = localStorage.getItem(POLITICIAN_KEY) || 'default';
let politicians = JSON.parse(localStorage.getItem(ALL_POLITICIANS_KEY)) || [
    { id: 'default', name: '標準アカウント' }
];

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
    politicians.push({ id, name });
    localStorage.setItem(ALL_POLITICIANS_KEY, JSON.stringify(politicians));
    return id;
}

export function removePolitician(id) {
    if (id === 'default') return false;
    politicians = politicians.filter(p => p.id !== id);
    localStorage.setItem(ALL_POLITICIANS_KEY, JSON.stringify(politicians));
    if (currentPoliticianId === id) setCurrentPoliticianId('default');
    return true;
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
        tx.oncomplete = () => resolve(enriched);
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
        tx.oncomplete = () => resolve(updated);
        tx.onerror = () => reject(tx.error);
    });
}

export async function remove(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
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
        tx.oncomplete = () => resolve(enriched.length);
        tx.onerror = () => reject(tx.error);
    });
}

export async function bulkRemove(ids) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
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
        if (!seen.has(key)) { seen.add(key); result.push({ area: r.area, spot: r.spot }); if (result.length >= limit) break; }
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
