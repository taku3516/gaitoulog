// ===== アプリ本体とクラウド同期の橋渡し =====
//
// アプリ本体（store / 各画面）は Firebase を知らない。
// ここが両者の唯一の接点で、公開するのは window.GAITOULOG_SYNC_BRIDGE だけ。

import * as store from '../store.js';

const CLOUD_ACTIVE_KEY = 'streetActivityLog_cloudActive';

let cloudActive = localStorage.getItem(CLOUD_ACTIVE_KEY) === 'true';

// クラウド由来でローカルが書き換わったときに画面を作り直してもらうための購読口
const applyListeners = new Set();

export function onCloudStateApplied(listener) {
    applyListeners.add(listener);
    return () => applyListeners.delete(listener);
}

function notifyApplied() {
    applyListeners.forEach(fn => {
        try { fn(); } catch (e) { console.error('cloud apply listener failed:', e); }
    });
}

export function isCloudActive() {
    return cloudActive;
}

function cloud() {
    return window.GAITOULOG_CLOUD;
}

// ---- 同期モジュールから呼ばれる口 ----

window.GAITOULOG_SYNC_BRIDGE = Object.freeze({
    /** ログイン前のローカルデータを退避する（初回マージの材料になる） */
    stashGuestState: () => store.stashGuestSnapshot(),

    /** 退避しておいたゲスト状態を返す */
    getGuestState: () => store.getGuestSnapshot(),

    /** この退避データを指定アカウントへマージ済みか（初回マージを1度だけにする） */
    hasGuestMerged: (uid) => store.hasGuestMergedInto(uid),

    /** マージ済みとして記録する */
    markGuestMerged: (uid) => store.markGuestMergedInto(uid),

    /** いま画面に出ている状態 */
    getCurrentState: async () => ({
        records: await store.getAllRaw(),
        politicians: store.getPoliticians(),
    }),

    setCloudActive: (value) => {
        cloudActive = Boolean(value);
        if (cloudActive) localStorage.setItem(CLOUD_ACTIVE_KEY, 'true');
        else localStorage.removeItem(CLOUD_ACTIVE_KEY);
    },

    /** クラウドの内容で表示用データを差し替える */
    applyCloudState: async (next) => {
        if (!next) return;
        await store.replaceAllRecords(next.records || []);
        if (next.politicians?.length) store.replacePoliticians(next.politicians);
        notifyApplied();
    },

    /** ログアウト時: ログイン前のローカル状態へ戻す */
    restoreGuestState: async () => {
        const restored = await store.restoreGuestSnapshot();
        if (restored) notifyApplied();
        return restored;
    },
});

// ---- アプリ本体の変更をクラウドへ流す ----
// ログイン中でなければ何もしない（従来どおりローカルだけで完結する）。

store.onChange((event) => {
    if (!cloudActive || !event) return;
    const c = cloud();
    if (!c) return;

    switch (event.type) {
        case 'upsert':
            c.recordsChanged(event.records);
            break;
        case 'delete':
            c.recordsDeleted(event.ids);
            break;
        case 'politicians':
            c.politiciansChanged(event.politicians);
            break;
    }
});
