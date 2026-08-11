// 既存スポットの座標候補をNominatimから1件ずつ取得するメンテナンス用スクリプト。
// 公開APIへの負荷を避けるため1.1秒以上間隔を空け、結果は再利用できる形で保存する。

import { readFile, writeFile } from 'node:fs/promises';
import { LOCATION_CATALOG, getPresetSpotId } from '../js/location-catalog.js';

const WAIT_MS = 1100;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const forceRetry = new Set(['大森駅水神口']);
let previous = [];
try {
    previous = JSON.parse(await readFile(new URL('../data/spot-geocode-review.json', import.meta.url), 'utf8'));
} catch { /* 初回実行 */ }

function simplifiedName(location) {
    const name = location.spot;
    const aliases = {
        'ライフ御殿山店前': 'ライフ 東五反田店',
        'イオン品川シーサイド店前': 'イオンスタイル品川シーサイド',
        'オーケー青物横丁店前': 'オーケー 青物横丁店',
        'セブンイレブン南品川三丁目店前交差点': 'セブンイレブン 南品川3丁目店',
        '五反田JPビル前交差点': '五反田JPビルディング',
        '五反田東急ストア前': '東急ストア 五反田店',
        '大井町阪急前': '阪急大井町ガーデン',
        '大森駅水神口': '大森駅',
        '業務スーパー武蔵小山店前': '業務スーパー 武蔵小山店',
        '武蔵小山マック前': 'マクドナルド 武蔵小山店',
        '武蔵小山練り歩き': '武蔵小山駅',
        'みずほ銀行戸越支店前交差点': 'みずほ銀行 戸越支店',
        'オオゼキ旗の台店前': 'オオゼキ 旗の台店',
        'オオゼキ戸越銀座店前': 'オオゼキ 戸越銀座店',
        'パトリア品川前': 'パトリア品川',
        '八潮団地': '八潮パークタウン',
    };
    if (aliases[name]) return aliases[name];
    const station = name.match(/([^線]+?駅)/)?.[1];
    if (station) return station.replace(/^(モノレール|りんかい線|東急)/, '');
    return name
        .replace(/店前交差点$/, '店')
        .replace(/前交差点$/, '')
        .replace(/交差点$/, '')
        .replace(/デッキ上$/, '')
        .replace(/ロータリー$/, '')
        .replace(/前$/, '')
        .trim();
}

for (let index = 0; index < LOCATION_CATALOG.length; index += 1) {
    const location = LOCATION_CATALOG[index];
    const existing = previous.find(item => item.id === getPresetSpotId(location));
    if (!forceRetry.has(location.spot) && existing?.candidates?.some(candidate => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng))) {
        results.push(existing);
        console.log(`[${index + 1}/${LOCATION_CATALOG.length}] ${location.spot}: 既存候補を再利用`);
        continue;
    }
    const lookupName = simplifiedName(location);
    const query = [lookupName, location.locality, '品川区', '東京都', '日本'].filter(Boolean).join(', ');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '3');
    url.searchParams.set('countrycodes', 'jp');

    let candidates = [];
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'gaitoulog-spot-maintenance/1.0 (https://github.com/taku3516/gaitoulog)',
                'Accept-Language': 'ja',
            },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        candidates = (await response.json()).map(item => ({
            lat: Number(item.lat),
            lng: Number(item.lon),
            displayName: item.display_name,
            type: item.type,
            importance: item.importance,
        }));
    } catch (error) {
        candidates = [{ error: error.message }];
    }

    results.push({
        id: getPresetSpotId(location),
        area: location.area,
        locality: location.locality || '',
        spot: location.spot,
        query,
        candidates,
    });
    console.log(`[${index + 1}/${LOCATION_CATALOG.length}] ${location.spot}: ${candidates[0]?.displayName || candidates[0]?.error || '候補なし'}`);
    if (index < LOCATION_CATALOG.length - 1) await pause(WAIT_MS);
}

await writeFile(new URL('../data/spot-geocode-review.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log('data/spot-geocode-review.json に候補を保存しました。内容を確認してから採用してください。');
