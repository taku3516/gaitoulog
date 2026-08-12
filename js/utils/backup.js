// ===== 全データのバックアップと復元 =====
// CSVは活動記録だけを扱うため、機種変更や端末紛失に備えて
// アカウント・スポット・端末設定まで含めた丸ごとの控えを作る。

import * as store from '../store.js';
import * as spotStore from '../spot-store.js';
import { todayISO } from '../calculations.js';

const FORMAT = 'gaitoulog-backup';
const VERSION = 1;

// 端末に持っている設定。値は文字列のまま出し入れする。
const LOCAL_KEYS = [
    'streetActivityLogs_dashboardPrefs',
    'streetActivityLogs_dashboardOrder',
    'streetActivityLogs_distributionGoals',
    'streetActivityLog_plans',
];

export async function buildBackup() {
    const settings = {};
    for (const key of LOCAL_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) settings[key] = value;
    }
    return {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        politicians: store.getPoliticians(),
        currentPoliticianId: store.getCurrentPoliticianId(),
        records: await store.getAllRaw(),
        customSpots: spotStore.getCustomSpots({ includeArchived: true, includeDeleted: true }),
        settings,
    };
}

export async function downloadBackup() {
    const backup = await buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    // ファイル名は英数字にする。日本語のみのファイル名は拡張子ごと落とすブラウザがある。
    anchor.download = `gaitoulog-backup-${todayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return backup;
}

export function readBackupFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                resolve(JSON.parse(String(reader.result)));
            } catch {
                reject(new Error('バックアップファイルを読み取れませんでした。'));
            }
        };
        reader.onerror = () => reject(new Error('ファイルを開けませんでした。'));
        reader.readAsText(file);
    });
}

/** 取り込む前に中身を確認する。壊れたファイルで既存データを消さないため。 */
export function inspectBackup(backup) {
    if (!backup || typeof backup !== 'object') throw new Error('バックアップの形式が違います。');
    if (backup.format !== FORMAT) throw new Error('このアプリのバックアップファイルではありません。');
    if (!Array.isArray(backup.records)) throw new Error('バックアップに活動記録が含まれていません。');
    if (Number(backup.version) > VERSION) throw new Error('新しい形式のバックアップです。アプリを更新してください。');

    const politicians = Array.isArray(backup.politicians) ? backup.politicians.filter(p => p?.id && p?.name) : [];
    return {
        recordCount: backup.records.length,
        politicianCount: politicians.length,
        spotCount: Array.isArray(backup.customSpots) ? backup.customSpots.length : 0,
        exportedAt: backup.exportedAt || '',
    };
}

/**
 * バックアップの内容で端末のデータを置き換える。
 * 部分的に戻すと記録とアカウントの対応が壊れるため、まとめて入れ替える。
 */
export async function restoreBackup(backup) {
    inspectBackup(backup);

    const politicians = (backup.politicians || []).filter(p => p?.id && p?.name);
    if (politicians.length > 0) store.replacePoliticians(politicians);

    const records = backup.records.filter(record => record?.id && record?.date);
    await store.replaceAllRecords(records);

    if (Array.isArray(backup.customSpots)) spotStore.replaceCustomSpots(backup.customSpots);

    const settings = backup.settings || {};
    for (const key of LOCAL_KEYS) {
        if (typeof settings[key] === 'string') localStorage.setItem(key, settings[key]);
    }

    const target = politicians.find(p => p.id === backup.currentPoliticianId) || politicians[0];
    if (target) store.setCurrentPoliticianId(target.id);

    return { recordCount: records.length, politicianCount: politicians.length };
}
