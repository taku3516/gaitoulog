// ===== ダミーデータ生成（品川区版） =====

// 品川区の主要な街頭活動スポット
const SPOTS = [
    { area: '品川区', spot: '大井町駅前' },
    { area: '品川区', spot: '武蔵小山駅前' },
    { area: '品川区', spot: '戸越銀座商店街' },
    { area: '品川区', spot: '旗の台駅前' },
    { area: '品川区', spot: '五反田駅前' },
    { area: '品川区', spot: '目黒駅前（品川区側）' },
    { area: '品川区', spot: '青物横丁駅前' },
    { area: '品川区', spot: '西大井駅前' },
    { area: '品川区', spot: '中延駅前' },
    { area: '品川区', spot: '品川シーサイド駅前' },
];

const weathers = ['晴', '曇', '雨', '晴', '曇', '晴'];
const themeOptions = ['子育て', '防災', '福祉', '交通', '教育', '財政', 'まちづくり'];
const materialOptions = ['政策ビラA', '号外', '名刺', '政策ビラB', 'チラシ'];
const formTypes = ['定点', '流し'];
const micTypes = ['マイク有', 'マイク無'];
const groupTypes = ['単独', '複数'];
const volunteerNames = ['田中', '佐藤', '鈴木', '高橋', '伊藤', '渡辺', '山本', '中村'];

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomPicks(arr, min = 1, max = 3) {
    const count = min + Math.floor(Math.random() * (max - min + 1));
    return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}
function randomInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pad(n) { return n.toString().padStart(2, '0'); }

export function generateDummyData() {
    const records = [];
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];

    for (let i = 0; i < 10; i++) {
        const ym = months[i % months.length];
        const day = randomInt(1, 28);
        const date = `${ym}-${pad(day)}`;
        const startHour = randomInt(7, 17);
        const startMin = randomPick([0, 15, 30, 45]);
        const durationMin = randomInt(30, 120);
        const endTotalMin = startHour * 60 + startMin + durationMin;
        const endHour = Math.min(Math.floor(endTotalMin / 60), 23);
        const endMin = endTotalMin % 60;
        const startTime = `${pad(startHour)}:${pad(startMin)}`;
        const endTime = `${pad(endHour)}:${pad(endMin)}`;

        const { area, spot } = SPOTS[i % SPOTS.length];
        const dist = randomInt(50, 500);
        const volCount = randomInt(0, 5);
        const volNames = volCount > 0 ? randomPicks(volunteerNames, 1, volCount).join('、') : '';
        const weather = randomPick(weathers);
        const temp = weather === '晴' ? randomInt(15, 30) : weather === '雨' ? randomInt(8, 18) : randomInt(10, 25);
        const themes = randomPicks(themeOptions, 1, 3);
        const materials = randomPicks(materialOptions, 1, 2);
        const approachCount = randomInt(dist, dist * 3);
        const stopCount = randomInt(5, Math.floor(dist * 0.5));
        const refusalCount = randomInt(0, Math.floor(approachCount * 0.3));

        records.push({
            date, startTime, endTime, nextDay: false, area, spot,
            distributionCount: dist, volunteerCount: volCount, volunteerNames: volNames,
            memo: `${spot}での活動。反応良好。`,
            weather, temperature: temp,
            formType: randomPick(formTypes), micType: randomPick(micTypes), groupType: randomPick(groupTypes),
            address: '', lat: null, lng: null,
            themes, materials,
            approachCount, stopCount, refusalCount,
            newContactCount: randomInt(0, 10), donationCount: randomInt(0, 3), qrCount: randomInt(0, 20),
            hasTrouble: i === 3,
            troubleNote: i === 3 ? '近隣住民から騒音の苦情あり。音量を下げて対応。' : '',
            photos: [],
        });
    }
    return records;
}
