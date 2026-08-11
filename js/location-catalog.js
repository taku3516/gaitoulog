// 品川区内の街頭活動スポット。保存形式との互換性のため、地区は area キーで扱う。
export const LOCATION_CATALOG = [
    { area: '品川', locality: '北品川', spot: '北品川駅前' },
    { area: '品川', locality: '北品川', spot: '新馬場駅前' },
    { area: '品川', locality: '北品川', spot: '新馬場交差点' },
    { area: '品川', locality: '北品川', spot: 'ライフ御殿山店前' },
    { area: '品川', locality: '西品川', spot: '下神明駅前' },
    { area: '品川', locality: '東品川', spot: 'モノレール天王洲アイル駅' },
    { area: '品川', locality: '東品川', spot: 'りんかい線天王洲アイル駅' },
    { area: '品川', locality: '東品川', spot: '品川シーサイド駅前' },
    { area: '品川', locality: '東品川', spot: 'イオン品川シーサイド店前' },
    { area: '品川', locality: '南品川', spot: '青物横丁駅前' },
    { area: '品川', locality: '南品川', spot: 'オーケー青物横丁店前' },
    { area: '品川', locality: '南品川', spot: 'セブンイレブン南品川三丁目店前交差点' },
    { area: '大崎', locality: '大崎', spot: '大崎駅前交番前交差点' },
    { area: '大崎', locality: '大崎', spot: '大崎駅南改札口前' },
    { area: '大崎', locality: '大崎', spot: '大崎広小路駅前' },
    { area: '大崎', locality: '上大崎', spot: '目黒駅前' },
    { area: '大崎', locality: '西五反田', spot: 'オオゼキ目黒不動前店前' },
    { area: '大崎', locality: '西五反田', spot: '五反田JPビル前交差点' },
    { area: '大崎', locality: '西五反田', spot: '不動前駅前' },
    { area: '大崎', locality: '東五反田', spot: '五反田駅西口' },
    { area: '大崎', locality: '東五反田', spot: '五反田駅前交番前' },
    { area: '大崎', locality: '東五反田', spot: '五反田駅東口' },
    { area: '大崎', locality: '東五反田', spot: '五反田東急ストア前' },
    { area: '大井', locality: '大井', spot: '大井町駅デッキ上' },
    { area: '大井', locality: '大井', spot: '大井町駅ヨーカドー前' },
    { area: '大井', locality: '大井', spot: '大井町駅阪急口' },
    { area: '大井', locality: '大井', spot: '大井町阪急前' },
    { area: '大井', locality: '大井', spot: '東急大井町駅前' },
    { area: '大井', locality: '大井', spot: '品川区役所前交差点' },
    { area: '大井', locality: '勝島', spot: 'ウィラ大井前' },
    { area: '大井', locality: '勝島', spot: '大井競馬場前駅前' },
    { area: '大井', locality: '西大井', spot: '西大井駅前' },
    { area: '大井', locality: '東大井', spot: '鮫洲駅前' },
    { area: '大井', locality: '東大井', spot: '立会川駅前' },
    { area: '大井', locality: '南大井', spot: '大森駅水神口' },
    { area: '大井', locality: '南大井', spot: '大森海岸駅前' },
    { area: '荏原', locality: '荏原', spot: 'スクエア荏原前交差点' },
    { area: '荏原', locality: '小山', spot: 'オオゼキ武蔵小山店前' },
    { area: '荏原', locality: '小山', spot: '業務スーパー武蔵小山店前' },
    { area: '荏原', locality: '小山', spot: '西小山駅前' },
    { area: '荏原', locality: '小山', spot: '武蔵小山マック前' },
    { area: '荏原', locality: '小山', spot: '武蔵小山駅前ロータリー' },
    { area: '荏原', locality: '小山', spot: '武蔵小山練り歩き' },
    { area: '荏原', locality: '戸越', spot: 'みずほ銀行戸越支店前交差点' },
    { area: '荏原', locality: '戸越', spot: '戸越駅前' },
    { area: '荏原', locality: '戸越', spot: '戸越銀座交差点' },
    { area: '荏原', locality: '戸越', spot: '戸越公園駅前' },
    { area: '荏原', locality: '戸越', spot: '文化堂戸越銀座店前' },
    { area: '荏原', locality: '中延', spot: '荏原町駅前' },
    { area: '荏原', locality: '中延', spot: '中延駅前交差点' },
    { area: '荏原', locality: '中延', spot: '東急中延駅前' },
    { area: '荏原', locality: '旗の台', spot: 'イオンタウン旗の台前' },
    { area: '荏原', locality: '旗の台', spot: 'オオゼキ旗の台店前' },
    { area: '荏原', locality: '旗の台', spot: '旗の台駅東口改札前' },
    { area: '荏原', locality: '旗の台', spot: '旗の台駅南口改札前' },
    { area: '荏原', locality: '東中延', spot: '荏原中延駅前' },
    { area: '荏原', locality: '平塚', spot: 'オオゼキ戸越銀座店前' },
    { area: '荏原', locality: '平塚', spot: '戸越銀座駅前' },
    { area: '八潮', locality: '八潮', spot: 'パトリア品川前' },
    { area: '八潮', locality: '八潮', spot: '八潮団地' },
];

export function findLocationBySpot(spot) {
    const normalized = String(spot || '').trim();
    return LOCATION_CATALOG.find(location => location.spot === normalized) || null;
}

export function findLocationInText(text) {
    const normalized = String(text || '');
    return [...LOCATION_CATALOG]
        .sort((a, b) => b.spot.length - a.spot.length)
        .find(location => normalized.includes(location.spot)) || null;
}
