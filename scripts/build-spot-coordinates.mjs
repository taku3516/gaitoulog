// geocode-spots.mjs のレビュー結果から、地図表示用の候補座標モジュールを生成する。
// 明らかに別地点だった候補は除外し、残りも「候補座標」として後から地図で修正できる前提とする。

import { readFile, writeFile } from 'node:fs/promises';

const review = JSON.parse(await readFile(new URL('../data/spot-geocode-review.json', import.meta.url), 'utf8'));
const excluded = new Set([
    '大森駅水神口', // 大森海岸駅付近の別施設が返ったため
]);
const coordinates = {};

for (const item of review) {
    if (excluded.has(item.spot)) continue;
    const candidate = item.candidates?.find(value => (
        Number.isFinite(value.lat) && Number.isFinite(value.lng)
        && value.lat >= 35.55 && value.lat <= 35.66
        && value.lng >= 139.68 && value.lng <= 139.80
        && String(value.displayName || '').includes('品川区')
    ));
    if (!candidate) continue;
    coordinates[item.id] = {
        lat: candidate.lat,
        lng: candidate.lng,
        status: 'candidate',
    };
}

// 施設名で候補が返らない地点は、同一駅・同一街区の取得済み座標を初期表示に使う。
// 正確な活動位置はアプリの「スポットを追加」からピンを置いて登録できる。
const fallbackNames = {
    'ライフ御殿山店前': '五反田駅東口',
    'イオン品川シーサイド店前': '品川シーサイド駅前',
    'オーケー青物横丁店前': '青物横丁駅前',
    'セブンイレブン南品川三丁目店前交差点': '青物横丁駅前',
    '五反田東急ストア前': '五反田駅東口',
    '大井町阪急前': '大井町駅デッキ上',
    '大森駅水神口': '大森海岸駅前',
    '業務スーパー武蔵小山店前': '武蔵小山駅前ロータリー',
    'みずほ銀行戸越支店前交差点': '戸越駅前',
    'オオゼキ旗の台店前': '旗の台駅東口改札前',
    'オオゼキ戸越銀座店前': '戸越銀座駅前',
    'パトリア品川前': '八潮団地',
};
const reviewByName = new Map(review.map(item => [item.spot, item]));
for (const [targetName, referenceName] of Object.entries(fallbackNames)) {
    const target = reviewByName.get(targetName);
    const reference = reviewByName.get(referenceName);
    const referenceCoordinates = reference && coordinates[reference.id];
    if (target && !coordinates[target.id] && referenceCoordinates) {
        coordinates[target.id] = { lat: referenceCoordinates.lat, lng: referenceCoordinates.lng, status: 'approximate' };
    }
}

const output = `// geocode-spots.mjs から生成。status=candidate は地図上で確認・修正可能な初期座標。\n`
    + `export const SPOT_COORDINATES = ${JSON.stringify(coordinates, null, 2)};\n`;
await writeFile(new URL('../data/spot-coordinates.js', import.meta.url), output, 'utf8');
console.log(`${Object.keys(coordinates).length}件の候補座標を data/spot-coordinates.js に保存しました。`);
