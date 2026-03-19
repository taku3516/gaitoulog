// ===== データストア (IndexedDB + Async Wrapper) =====
import { enrichRecord } from './calculations.js';

const DB_NAME = 'StreetActivityLogsDB';
const DB_VERSION = 2; // Migrate from v1 if needed
const STORE_NAME = 'records';

// 複数議員対応
const POLITICIAN_KEY = 'streetActivityLog_currentPoliticianId';
let currentPoliticianId = localStorage.getItem(POLITICIAN_KEY) || 'default';

export function getCurrentPoliticianId() {
    return currentPoliticianId;
}

export function setCurrentPoliticianId(id) {
    currentPoliticianId = id;
    localStorage.setItem(POLITICIAN_KEY, id);
}

// 議員一覧（マスタ）
export const POLITICIANS = [
    { id: 'default', name: '標準アカウント' },
    { id: 'politician_a', name: '議員A' },
    { id: 'politician_b', name: '議員B' }
];

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
