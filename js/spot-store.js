// ===== スポットマスタ（標準スポット + 利用者追加スポット） =====
// 標準スポットは location-catalog.js に同梱し、利用者追加分だけを端末・Firebaseで同期する。

import { getPresetSpots } from './location-catalog.js';

const CUSTOM_SPOTS_KEY = 'streetActivityLog_customSpots_v1';
const GUEST_SPOTS_KEY = 'streetActivityLog_guestCustomSpots_v1';
const BASELINE_VERSION = '2026-08-13';
const changeListeners = new Set();

function readList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeCustomSpots(spots, { notify = false } = {}) {
    const cleaned = spots.map(normalizeCustomSpot).filter(Boolean).filter(spot => !isLegacyBaselineSpot(spot));
    localStorage.setItem(CUSTOM_SPOTS_KEY, JSON.stringify(cleaned));
    if (notify) emitChange({ type: 'spots', spots: cleaned });
    return cleaned;
}

function makeId() {
    return `spot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function cleanText(value, maxLength = 100) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeCoordinate(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function normalizeCustomSpot(input) {
    if (!input || typeof input !== 'object') return null;
    const id = cleanText(input.id, 80);
    const area = cleanText(input.area);
    const spot = cleanText(input.spot);
    const lat = normalizeCoordinate(input.lat, -90, 90);
    const lng = normalizeCoordinate(input.lng, -180, 180);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !area || !spot || lat === null || lng === null) return null;
    return {
        id,
        area,
        locality: cleanText(input.locality),
        spot,
        lat,
        lng,
        source: 'custom',
        archived: Boolean(input.archived),
        deleted: Boolean(input.deleted),
        baselineVersion: cleanText(input.baselineVersion, 20),
        createdAt: cleanText(input.createdAt, 30) || new Date().toISOString(),
        updatedAt: cleanText(input.updatedAt, 30) || new Date().toISOString(),
    };
}

export function onChange(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
}

function emitChange(event) {
    changeListeners.forEach(listener => {
        try { listener(event); } catch (error) { console.error('spot change listener failed:', error); }
    });
}

function isLegacyBaselineSpot(spot) {
    if (spot.baselineVersion) return false;
    const preset = getPresetSpots().find(item => item.id === spot.id)
        || getPresetSpots().find(item => (
            item.area === spot.area
            && item.locality === spot.locality
            && item.spot === spot.spot
        ));
    if (!preset) return false;
    return Math.abs(preset.lat - spot.lat) <= 0.00012
        && Math.abs(preset.lng - spot.lng) <= 0.00012;
}

export function getCustomSpots({ includeArchived = false, includeDeleted = false } = {}) {
    const spots = readList(CUSTOM_SPOTS_KEY)
        .map(normalizeCustomSpot)
        .filter(Boolean)
        .filter(spot => !isLegacyBaselineSpot(spot));
    return spots.filter(spot => (includeArchived || !spot.archived) && (includeDeleted || !spot.deleted));
}

export function getAllSpots({ includeArchived = false } = {}) {
    const presets = getPresetSpots();
    // 非表示の標準ピン上書きも先に統合し、元の標準ピンが復活しないよう最後に絞り込む。
    const custom = getCustomSpots({ includeArchived: true, includeDeleted: true });
    const presetIds = new Set(presets.map(spot => spot.id));
    const overrides = new Map(custom.filter(spot => presetIds.has(spot.id)).map(spot => [spot.id, spot]));
    const mergedPresets = presets.map(preset => {
        const override = overrides.get(preset.id);
        return override ? { ...preset, ...override, isPresetOverride: true } : preset;
    });
    const added = custom.filter(spot => !presetIds.has(spot.id));
    return [...mergedPresets, ...added].filter(spot => !spot.deleted && (includeArchived || !spot.archived));
}

export function getSpotById(id) {
    return getAllSpots({ includeArchived: true }).find(spot => spot.id === id) || null;
}

export function findSpot(area, locality, name) {
    const a = cleanText(area);
    const l = cleanText(locality);
    const s = cleanText(name);
    const all = getAllSpots({ includeArchived: true });
    const exact = all.find(spot => (
        spot.area === a && spot.spot === s && (!l || !spot.locality || spot.locality === l)
    ));
    if (exact) return exact;

    // 旧データは地区が「品川区」一括だったため、スポット名が一意なら地区をまたいで対応する。
    const sameName = all.filter(spot => spot.spot === s);
    if (sameName.length === 1) return sameName[0];

    const legacyAliases = {
        '武蔵小山駅前': '武蔵小山駅前ロータリー',
        '中延駅前': '中延駅前交差点',
        '旗の台駅前': '旗の台駅東口改札前',
        '大井町駅前': '大井町駅デッキ上',
        '戸越銀座商店街': '戸越銀座駅前',
        '五反田駅前': '五反田駅東口',
        '目黒駅前（品川区側）': '目黒駅前',
    };
    const alias = legacyAliases[s];
    return alias ? all.find(spot => spot.spot === alias) || null : null;
}

export function addCustomSpot(values) {
    const now = new Date().toISOString();
    const spot = normalizeCustomSpot({ ...values, id: makeId(), baselineVersion: BASELINE_VERSION, createdAt: now, updatedAt: now, source: 'custom' });
    if (!spot) throw new Error('スポット情報が不正です。');
    const spots = getCustomSpots({ includeArchived: true, includeDeleted: true });
    spots.push(spot);
    writeCustomSpots(spots, { notify: true });
    return spot;
}

export function updateCustomSpot(id, updates) {
    const spots = getCustomSpots({ includeArchived: true, includeDeleted: true });
    const index = spots.findIndex(spot => spot.id === id);
    if (index === -1) return null;
    const updated = normalizeCustomSpot({ ...spots[index], ...updates, id, baselineVersion: BASELINE_VERSION, updatedAt: new Date().toISOString() });
    if (!updated) throw new Error('スポット情報が不正です。');
    spots[index] = updated;
    writeCustomSpots(spots, { notify: true });
    return updated;
}

/**
 * 既存スポットを同じIDのまま更新する。
 * 標準スポットは利用者側の上書きデータとして保存するため、標準マスタ自体は変更しない。
 */
export function saveSpotChanges(id, updates) {
    const current = getSpotById(id);
    if (!current) return null;
    const existing = getCustomSpots({ includeArchived: true, includeDeleted: true }).find(spot => spot.id === id);
    if (existing) return updateCustomSpot(id, updates);

    const now = new Date().toISOString();
    const override = normalizeCustomSpot({
        ...current,
        ...updates,
        id,
        source: 'custom',
        baselineVersion: BASELINE_VERSION,
        createdAt: now,
        updatedAt: now,
    });
    if (!override) throw new Error('スポット情報が不正です。');
    const spots = getCustomSpots({ includeArchived: true, includeDeleted: true });
    spots.push(override);
    writeCustomSpots(spots, { notify: true });
    return { ...current, ...override, isPresetOverride: id.startsWith('preset_') };
}

/** 標準スポットに保存した上書きだけを削除し、元の名称・位置へ戻す。 */
export function resetPresetSpot(id) {
    if (!String(id).startsWith('preset_')) return false;
    const spots = getCustomSpots({ includeArchived: true, includeDeleted: true });
    const next = spots.filter(spot => spot.id !== id);
    if (next.length === spots.length) return false;
    writeCustomSpots(next, { notify: true });
    return true;
}

export function archiveCustomSpot(id, archived = true) {
    return updateCustomSpot(id, { archived });
}

/**
 * ピンを削除する。追加ピンは実データを消し、標準ピンは同期可能な削除印を保存する。
 * 活動記録は削除せず、そこに保存済みのスポット名も変更しない。
 */
export function deleteSpot(id) {
    const current = getSpotById(id);
    if (!current) return false;
    const spots = getCustomSpots({ includeArchived: true, includeDeleted: true });

    if (!String(id).startsWith('preset_')) {
        const next = spots.filter(spot => spot.id !== id);
        if (next.length === spots.length) return false;
        writeCustomSpots(next, { notify: true });
        return true;
    }

    const now = new Date().toISOString();
    const tombstone = normalizeCustomSpot({
        ...current,
        id,
        source: 'custom',
        archived: false,
        deleted: true,
        baselineVersion: BASELINE_VERSION,
        createdAt: spots.find(spot => spot.id === id)?.createdAt || now,
        updatedAt: now,
    });
    const next = spots.filter(spot => spot.id !== id);
    next.push(tombstone);
    writeCustomSpots(next, { notify: true });
    return true;
}

/** クラウド同期専用。変更通知を出さずに利用者追加スポットを差し替える。 */
export function replaceCustomSpots(spots) {
    return writeCustomSpots(Array.isArray(spots) ? spots : [], { notify: false });
}

export function stashGuestSpots() {
    if (localStorage.getItem(GUEST_SPOTS_KEY) !== null) return;
    localStorage.setItem(GUEST_SPOTS_KEY, JSON.stringify(getCustomSpots({ includeArchived: true, includeDeleted: true })));
}

export function getGuestSpots() {
    return readList(GUEST_SPOTS_KEY).map(normalizeCustomSpot).filter(Boolean).filter(spot => !isLegacyBaselineSpot(spot));
}

export function restoreGuestSpots() {
    if (localStorage.getItem(GUEST_SPOTS_KEY) === null) return false;
    replaceCustomSpots(getGuestSpots());
    localStorage.removeItem(GUEST_SPOTS_KEY);
    return true;
}
