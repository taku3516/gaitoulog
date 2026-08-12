// ===== ダッシュボード =====
import * as store from '../store.js';
import { icon } from '../utils/icons.js';
import { renderActivityMap, createActivityMapImage } from '../activity-map.js';
import {
    openShareDialog,
    openImageShareDialog,
    createChartImage,
    createChartsImage,
    createTableImage,
    createRankingImage,
} from '../share-report.js';

const Chart = window.Chart;

// グラフの配色。CSSのデザイントークンと同じ値を使い、画面全体で色を揃える。
const C = {
    accent: '#1f4d63',
    accentSoft: 'rgba(31, 77, 99, 0.10)',
    secondary: '#7fa3b0',
    tertiary: '#c08a2e',
    ink: '#55595a',
    line: '#e0e0dd',
    sunken: '#f1f1f0',
    faint: '#c8c8c4',
};
// ヒートマップは色相を変えず、濃度だけで大小を表す
const HEAT = ['#eef2f4', '#d3e0e5', '#a8c2cc', '#6b93a3', '#1f4d63'];
let chartInstances = [];

function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances = [];
}

function avg(arr) {
    return arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
}

// グラフの系列には数値が要るので、記録が無い区分は0として扱う
function avgNum(arr) {
    return arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;
}

const DASHBOARD_PREFS_KEY = 'streetActivityLogs_dashboardPrefs';
let hiddenCharts = JSON.parse(localStorage.getItem(DASHBOARD_PREFS_KEY) || '[]');
const DASHBOARD_ORDER_KEY = 'streetActivityLogs_dashboardOrder';
let sortConfig = { key: 'count', order: 'desc' };

const CHART_CONFIGS = [
    { id: 'monthly', title: '月別推移' },
    { id: 'cumulative', title: '累積配布枚数と目標' },
    { id: 'location', title: '場所別 配布枚数' },
    { id: 'weather', title: '天候別 平均配布係数' },
    { id: 'timeband', title: '時間帯・曜日別 配布係数' },
    { id: 'duration-band', title: '活動時間の長さ別 効率' },
    { id: 'daytime', title: '曜日×時間帯 配布係数' },
    { id: 'summary-month', title: '月別サマリー' },
    { id: 'summary-location', title: '場所別サマリー' },
    { id: 'crosstab', title: '場所×月 クロス集計' },
    { id: 'ranking-location', title: '場所ランキング' },
    { id: 'revisit', title: 'ご無沙汰スポット' },
    { id: 'activity-map', title: '活動量マップ' },
];

// 開始時刻の時間帯。街頭活動の時間の区切りに合わせている。
const TIME_BANDS = [
    { label: '早朝', from: 5, to: 8 },
    { label: '朝', from: 8, to: 10 },
    { label: '午前', from: 10, to: 12 },
    { label: '昼', from: 12, to: 14 },
    { label: '午後', from: 14, to: 17 },
    { label: '夕方', from: 17, to: 19 },
    { label: '夜', from: 19, to: 24 },
    { label: '深夜', from: 0, to: 5 },
];

const DURATION_BANDS = [
    { label: '〜30分', max: 30 },
    { label: '31〜45分', max: 45 },
    { label: '46〜60分', max: 60 },
    { label: '61〜90分', max: 90 },
    { label: '91分〜', max: Infinity },
];

// 配布目標は表示設定と同じく端末ごとに持つ。政治家アカウント単位で切り替える。
const GOAL_KEY = 'streetActivityLogs_distributionGoals';

function readGoals() {
    try { return JSON.parse(localStorage.getItem(GOAL_KEY) || '{}'); } catch { return {}; }
}

function getGoal() {
    const goal = readGoals()[store.getCurrentPoliticianId()];
    return { target: goal?.target ?? '', deadline: goal?.deadline ?? '' };
}

function saveGoal(goal) {
    const all = readGoals();
    all[store.getCurrentPoliticianId()] = goal;
    localStorage.setItem(GOAL_KEY, JSON.stringify(all));
}

function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 日付は文字列のまま扱い、タイムゾーンで1日ずれないようUTCの通し日数で引き算する
function toDayNumber(dateStr) {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
}

function daysBetween(fromDate, toDate) {
    return Math.round(toDayNumber(toDate) - toDayNumber(fromDate));
}

/** 経過日数の目盛りを日付表記へ戻す */
function dateFromOffset(startDate, offset) {
    const date = new Date((toDayNumber(startDate) + offset) * 86400000);
    return `${String(date.getUTCFullYear()).slice(2)}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/**
 * 累積配布枚数と目標ペースの系列、進捗の説明文を作る。
 * 横軸は最初の活動日からの経過日数。日付を等間隔に並べると、
 * 活動していない期間が詰まって目標ペースの線が歪むため。
 * 目標が未設定なら累積の系列だけを返す。
 */
function buildGoalView(cumulative, goal, today) {
    const start = cumulative[0]?.date || '';
    const achieved = cumulative.at(-1)?.total || 0;
    const actual = cumulative.map(row => ({ x: daysBetween(start, row.date), y: row.total }));
    const target = Number(goal.target);
    const lastOffset = actual.at(-1)?.x ?? 0;

    if (!start) return { start, actual, pace: null, maxX: 0, note: '' };
    if (!Number.isFinite(target) || target <= 0 || !goal.deadline) {
        return { start, actual, pace: null, maxX: lastOffset, note: '目標枚数と期日を入れると、目標ペースの線と必要ペースが表示されます。' };
    }
    const span = daysBetween(start, goal.deadline);
    if (span <= 0) {
        return { start, actual, pace: null, maxX: lastOffset, note: `目標期日は最初の活動日（${start}）より後の日付を入れてください。` };
    }

    const pace = [{ x: 0, y: 0 }, { x: span, y: target }];
    const rate = Math.round((achieved / target) * 100);
    const remaining = target - achieved;
    const daysLeft = daysBetween(today, goal.deadline);
    const elapsed = Math.max(1, daysBetween(start, today));
    const currentPace = (achieved / elapsed).toFixed(1);
    const parts = [`達成率 ${rate}%（${achieved.toLocaleString()} / ${target.toLocaleString()}枚）`];
    if (remaining <= 0) parts.push('目標を達成しています。');
    else if (daysLeft <= 0) parts.push(`目標期日（${goal.deadline}）を過ぎています。あと${remaining.toLocaleString()}枚です。`);
    else parts.push(`残り${daysLeft}日であと${remaining.toLocaleString()}枚。1日あたり${Math.ceil(remaining / daysLeft).toLocaleString()}枚が必要です（これまでは1日あたり${currentPace}枚）。`);

    return { start, actual, pace, maxX: Math.max(lastOffset, span), note: parts.join('　') };
}

const DRAG_HANDLE = `<div class="drag-handle" title="並び替え"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg></div>`;

// 全ダッシュボード共通の見出し。すべてのブロックに画像共有ボタンを置く。
function chartHead(iconName, label, shareId) {
    return `<div class="chart-title">
        <div class="chart-title-label">${icon(iconName)}${label}</div>
        <div class="chart-title-actions">
          <button class="btn btn-secondary btn-sm chart-share" data-share="${shareId}" data-label="${label}" title="${label}を画像で共有">画像共有</button>
          ${DRAG_HANDLE}
        </div>
      </div>`;
}

// ヒートマップの濃度段階。表示と共有画像で同じ基準を使う。
function heatStep(value) {
    const rate = parseFloat(value);
    return rate >= 3.0 ? 4 : rate >= 2.0 ? 3 : rate >= 1.0 ? 2 : rate >= 0.5 ? 1 : 0;
}

export async function render(container) {
    destroyCharts();
    const records = await store.getAll();

    if (records.length === 0) {
        container.innerHTML = `
            <div>
                <h2 class="section-title">${icon('chart', { size: 19 })}分析</h2>
                <div class="empty-state">
                    <div class="empty-state-icon">${icon('chart', { size: 32 })}</div>
                    <div class="empty-state-text">データがありません。まず活動を記録してください。</div>
                </div>
            </div>`;
        return;
    }

    const totalCount = records.length;
    const totalDuration = records.reduce((s, r) => s + (r.duration || 0), 0);
    const totalDist = records.reduce((s, r) => s + (r.distributionCount || 0), 0);
    const avgRate = totalDuration > 0 ? (totalDist / totalDuration).toFixed(2) : '-';

    const byMonth = {};
    records.forEach(r => {
        const m = r.yearMonth || '?';
        if (!byMonth[m]) byMonth[m] = { count: 0, duration: 0, dist: 0, rates: [] };
        byMonth[m].count++;
        byMonth[m].duration += (r.duration || 0);
        byMonth[m].dist += (r.distributionCount || 0);
        if (r.distributionRate != null) byMonth[m].rates.push(r.distributionRate);
    });
    const monthKeys = Object.keys(byMonth).sort();
    const periodSubtitle = monthKeys.length
        ? `期間：${monthKeys[0] === monthKeys.at(-1) ? monthKeys[0] : `${monthKeys[0]} 〜 ${monthKeys.at(-1)}`}　｜　活動${totalCount}回・${totalDist.toLocaleString()}枚`
        : '';

    const byLocation = {};
    records.forEach(r => {
        const loc = `${r.area} / ${r.spot}`;
        if (!byLocation[loc]) byLocation[loc] = { count: 0, duration: 0, dist: 0, rates: [] };
        byLocation[loc].count++;
        byLocation[loc].duration += (r.duration || 0);
        byLocation[loc].dist += (r.distributionCount || 0);
        if (r.distributionRate != null) byLocation[loc].rates.push(r.distributionRate);
    });

    const byWeather = {};
    records.forEach(r => {
        const w = r.weather || '未設定';
        if (!byWeather[w]) byWeather[w] = { count: 0, rates: [] };
        byWeather[w].count++;
        if (r.distributionRate != null) byWeather[w].rates.push(r.distributionRate);
    });

    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayTimeGrid = {};
    dayNames.forEach(d => { dayTimeGrid[d] = {}; });
    records.forEach(r => {
        if (r.dayOfWeek && r.hour != null) {
            if (!dayTimeGrid[r.dayOfWeek][r.hour]) dayTimeGrid[r.dayOfWeek][r.hour] = { rates: [] };
            if (r.distributionRate != null) dayTimeGrid[r.dayOfWeek][r.hour].rates.push(r.distributionRate);
        }
    });

    const locationRanking = Object.entries(byLocation).map(([name, d]) => ({
        name, count: d.count, dist: d.dist, avgRate: avg(d.rates)
    })).sort((a, b) => (b.avgRate === '-' ? 0 : Number(b.avgRate)) - (a.avgRate === '-' ? 0 : Number(a.avgRate))).slice(0, 10);

    const crossTable = {};
    const allLocs = Object.keys(byLocation);
    allLocs.forEach(loc => {
        crossTable[loc] = {};
        monthKeys.forEach(m => { crossTable[loc][m] = { count: 0, dist: 0 }; });
    });
    records.forEach(r => {
        const loc = `${r.area} / ${r.spot}`;
        const m = r.yearMonth;
        if (crossTable[loc]?.[m]) {
            crossTable[loc][m].count++;
            crossTable[loc][m].dist += (r.distributionCount || 0);
        }
    });

    const hours = [];
    for (let h = 6; h <= 21; h++) hours.push(h);

    // 時間帯別・曜日別。記録のある区分だけを並べる。
    const byTimeBand = TIME_BANDS.map(band => {
        const matched = records.filter(r => r.hour != null && r.hour >= band.from && r.hour < band.to);
        return {
            label: band.label,
            count: matched.length,
            dist: matched.reduce((s, r) => s + (r.distributionCount || 0), 0),
            rates: matched.filter(r => r.distributionRate != null).map(r => r.distributionRate),
        };
    }).filter(band => band.count > 0);

    const byDayOfWeek = dayNames.map(day => {
        const matched = records.filter(r => r.dayOfWeek === day);
        return {
            label: day,
            count: matched.length,
            dist: matched.reduce((s, r) => s + (r.distributionCount || 0), 0),
            rates: matched.filter(r => r.distributionRate != null).map(r => r.distributionRate),
        };
    }).filter(day => day.count > 0);

    // 1回の活動時間の長さ別。長く続けると効率が落ちるかを見る。
    const byDurationBand = DURATION_BANDS.map((band, index) => {
        const min = index === 0 ? 0 : DURATION_BANDS[index - 1].max;
        const matched = records.filter(r => (r.duration || 0) > min && (r.duration || 0) <= band.max);
        return {
            label: band.label,
            count: matched.length,
            avgDist: matched.length ? Math.round(matched.reduce((s, r) => s + (r.distributionCount || 0), 0) / matched.length) : 0,
            rates: matched.filter(r => r.distributionRate != null).map(r => r.distributionRate),
        };
    }).filter(band => band.count > 0);

    // ご無沙汰スポット。最終活動日からの経過日数が長い順。
    const today = todayISO();
    const revisitRows = Object.entries(byLocation).map(([loc, d]) => {
        const latestDate = records
            .filter(r => `${r.area} / ${r.spot}` === loc)
            .reduce((latest, r) => (r.date > latest ? r.date : latest), '');
        return {
            loc,
            latestDate,
            days: latestDate ? daysBetween(latestDate, today) : null,
            count: d.count,
            dist: d.dist,
            avgRate: avg(d.rates),
        };
    }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

    // 累積配布枚数。活動日ごとに積み上げる。
    const dailyTotals = new Map();
    records.forEach(r => {
        dailyTotals.set(r.date, (dailyTotals.get(r.date) || 0) + (r.distributionCount || 0));
    });
    const activityDates = [...dailyTotals.keys()].sort();
    let running = 0;
    const cumulative = activityDates.map(date => {
        running += dailyTotals.get(date);
        return { date, total: running };
    });

    const isHidden = (id) => hiddenCharts.includes(id) ? 'display:none;' : '';

    function renderInternal() {
        const sortedLocations = Object.entries(byLocation).map(([loc, d]) => ({
            loc, ...d, avg: avg(d.rates)
        })).sort((a, b) => {
            const valA = sortConfig.key === 'avg' ? (a.avg === '-' ? -1 : parseFloat(a.avg)) : a[sortConfig.key];
            const valB = sortConfig.key === 'avg' ? (b.avg === '-' ? -1 : parseFloat(b.avg)) : b[sortConfig.key];
            return sortConfig.order === 'desc' ? (valB - valA || 0) : (valA - valB || 0);
        });

        const sortIcon = (key) => sortConfig.key === key ? (sortConfig.order === 'desc' ? ' ↓' : ' ↑') : '';
        const goal = getGoal();

        // 各ダッシュボードの共有画像。表示中の並び順・絞り込みをそのまま画像にする。
        const shareBuilders = {
            'monthly': () => createChartImage(document.getElementById('chart-monthly'), '月別の推移', { subtitle: periodSubtitle }),
            'location': () => createChartImage(document.getElementById('chart-location'), '場所別の配布枚数', { subtitle: periodSubtitle }),
            'weather': () => createChartImage(document.getElementById('chart-weather'), '天候別の平均配布係数', { subtitle: periodSubtitle }),
            'cumulative': () => createChartImage(document.getElementById('chart-cumulative'), '累積配布枚数と目標', {
                subtitle: periodSubtitle,
                note: buildGoalView(cumulative, getGoal(), today).note,
            }),
            'timeband': () => createChartsImage([
                { canvas: document.getElementById('chart-timeband'), caption: '時間帯別（開始時刻）' },
                { canvas: document.getElementById('chart-dayofweek'), caption: '曜日別' },
            ], '時間帯・曜日別の配布係数', {
                subtitle: periodSubtitle,
                note: '括弧内は活動回数です。回数が少ない区分は差が偶然の可能性があります。',
            }),
            'duration-band': () => createChartImage(document.getElementById('chart-duration-band'), '活動時間の長さ別の効率', {
                subtitle: periodSubtitle,
                note: '1回あたりの活動時間で分けています。括弧内は活動回数です。',
            }),
            'revisit': () => createTableImage({
                title: 'ご無沙汰スポット',
                subtitle: periodSubtitle,
                note: `最終活動日からの経過日数が長い順です。${today}時点。`,
                columns: [
                    { label: '場所', min: 280, max: 460 },
                    { label: '最終活動日', align: 'center', min: 160 },
                    { label: '経過日数', align: 'right', min: 120 },
                    { label: '回数', align: 'right' },
                    { label: '平均係数', align: 'right' },
                ],
                rows: revisitRows.map(row => [
                    { text: row.loc, bold: true },
                    row.latestDate || '-',
                    { text: row.days == null ? '-' : `${row.days}日`, bold: true, color: row.days >= 60 ? '#9b2c2c' : row.days >= 30 ? '#8a5a12' : C.ink },
                    row.count,
                    row.avgRate,
                ]),
                maxRows: 20,
            }),
            'daytime': () => createTableImage({
                title: '曜日×時間帯の配布係数',
                subtitle: periodSubtitle,
                note: '数値は配布係数（枚/分）の平均です。色が濃いほど効率が高い時間帯です。',
                columns: [
                    { label: '曜日', align: 'center', min: 96, max: 120 },
                    ...hours.map(h => ({ label: `${h}時`, align: 'center', min: 76, max: 96 })),
                ],
                rows: dayNames.map(day => [
                    { text: day, bold: true },
                    ...hours.map(hour => {
                        const cell = dayTimeGrid[day]?.[hour];
                        if (!cell || cell.rates.length === 0) return { text: '-', bg: C.sunken, color: C.faint };
                        const rate = avg(cell.rates);
                        const step = heatStep(rate);
                        return { text: rate, bg: HEAT[step], color: step >= 3 ? '#ffffff' : C.accent, bold: true };
                    }),
                ]),
                maxRows: dayNames.length,
            }),
            'summary-month': () => createTableImage({
                title: '月別サマリー',
                subtitle: periodSubtitle,
                columns: [
                    { label: '月', min: 150 },
                    { label: '回数', align: 'right' },
                    { label: '時間(分)', align: 'right' },
                    { label: '配布枚数', align: 'right' },
                    { label: '平均係数', align: 'right' },
                ],
                rows: monthKeys.map(m => [
                    { text: m, bold: true },
                    byMonth[m].count,
                    byMonth[m].duration,
                    byMonth[m].dist.toLocaleString(),
                    avg(byMonth[m].rates),
                ]),
                maxRows: 24,
            }),
            'summary-location': () => createTableImage({
                title: '場所別サマリー',
                subtitle: periodSubtitle,
                note: '画面と同じ並び順で出力しています。',
                columns: [
                    { label: '場所', min: 280, max: 460 },
                    { label: '回数', align: 'right' },
                    { label: '時間(分)', align: 'right' },
                    { label: '配布枚数', align: 'right' },
                    { label: '平均係数', align: 'right' },
                ],
                rows: sortedLocations.map(d => [
                    { text: d.loc, bold: true },
                    d.count,
                    d.duration,
                    d.dist.toLocaleString(),
                    d.avg,
                ]),
            }),
            'crosstab': () => {
                const shownMonths = monthKeys.slice(-12);
                return createTableImage({
                    title: '場所×月 クロス集計',
                    subtitle: periodSubtitle,
                    note: [
                        '数値は配布枚数です。合計の多い場所順に並べています。',
                        monthKeys.length > shownMonths.length ? `直近${shownMonths.length}か月を表示しています。` : '',
                    ].filter(Boolean).join(''),
                    columns: [
                        { label: '場所', min: 280, max: 460 },
                        ...shownMonths.map(m => ({ label: m.slice(2), align: 'right', min: 100 })),
                        { label: '合計', align: 'right', min: 120 },
                    ],
                    rows: allLocs
                        .slice()
                        .sort((a, b) => byLocation[b].dist - byLocation[a].dist)
                        .map(loc => [
                            { text: loc, bold: true },
                            ...shownMonths.map(m => (crossTable[loc][m].dist || '-')),
                            { text: byLocation[loc].dist.toLocaleString(), bold: true, bg: C.sunken },
                        ]),
                });
            },
            'ranking-location': () => createRankingImage({
                title: '場所ランキング',
                subtitle: periodSubtitle,
                note: '大きな数値は配布係数（枚/分）の平均です。',
                items: locationRanking.map(loc => ({
                    name: loc.name,
                    primary: loc.avgRate,
                    secondary: `配布 ${loc.dist.toLocaleString()}枚 ｜ ${loc.count}回`,
                })),
            }),
            'activity-map': () => createActivityMapImage('活動量マップ'),
        };

        let defaultOrder = CHART_CONFIGS.map(c => c.id);
        let chartOrder = JSON.parse(localStorage.getItem(DASHBOARD_ORDER_KEY) || JSON.stringify(defaultOrder));
        CHART_CONFIGS.forEach(c => { if (!chartOrder.includes(c.id)) chartOrder.push(c.id); });

        const blocks = {
            'monthly': `<div class="chart-container toggle-target" data-id="monthly" style="${isHidden('monthly')}">${chartHead('trend', '月別の推移', 'monthly')}<div class="chart-canvas-wrapper"><canvas id="chart-monthly"></canvas></div></div>`,
            'cumulative': `<div class="chart-container toggle-target" data-id="cumulative" style="${isHidden('cumulative')}">${chartHead('trend', '累積配布枚数と目標', 'cumulative')}
        <div class="chart-controls">
          <input type="number" class="filter-select" id="goal-target" inputmode="numeric" min="0" placeholder="目標枚数" value="${goal.target}" aria-label="目標枚数">
          <input type="date" class="filter-select" id="goal-deadline" value="${goal.deadline}" aria-label="目標期日">
        </div>
        <div class="chart-canvas-wrapper"><canvas id="chart-cumulative"></canvas></div>
        <div class="text-xs text-muted" id="cumulative-note" aria-live="polite"></div>
      </div>`,
            'timeband': `<div class="chart-container toggle-target" data-id="timeband" style="${isHidden('timeband')}">${chartHead('clock', '時間帯・曜日別の配布係数', 'timeband')}
        <div class="chart-sub-title">時間帯別（開始時刻）</div>
        <div class="chart-canvas-wrapper"><canvas id="chart-timeband"></canvas></div>
        <div class="chart-sub-title">曜日別</div>
        <div class="chart-canvas-wrapper"><canvas id="chart-dayofweek"></canvas></div>
        <div class="text-xs text-muted">括弧内は活動回数です。回数が少ない区分は差が偶然の可能性があります。</div>
      </div>`,
            'duration-band': `<div class="chart-container toggle-target" data-id="duration-band" style="${isHidden('duration-band')}">${chartHead('chart', '活動時間の長さ別の効率', 'duration-band')}
        <div class="chart-canvas-wrapper"><canvas id="chart-duration-band"></canvas></div>
        <div class="text-xs text-muted">1回あたりの活動時間で分けています。括弧内は活動回数です。</div>
      </div>`,
            'revisit': `<div class="chart-container toggle-target" data-id="revisit" style="${isHidden('revisit')}">${chartHead('alert', 'ご無沙汰スポット', 'revisit')}
        ${revisitRows.slice(0, 10).map(row => `<div class="ranking-item">
            <div class="ranking-info">
              <div class="ranking-name">${row.loc}</div>
              <div class="ranking-stat">最終活動日 ${row.latestDate || '-'} ｜ ${row.count}回 ｜ 係数 ${row.avgRate}</div>
            </div>
            <div class="revisit-days ${row.days >= 60 ? 'critical' : row.days >= 30 ? 'caution' : ''}">
              <span class="revisit-days-value">${row.days ?? '-'}</span><span class="revisit-days-unit">日</span>
            </div>
          </div>`).join('')}
        <div class="text-xs text-muted">最終活動日からの経過日数が長い順です。</div>
      </div>`,
            'location': `<div class="chart-container toggle-target" data-id="location" style="${isHidden('location')}">
        ${chartHead('pin', '場所別の配布枚数', 'location')}
        <div class="data-table-wrapper" style="margin-bottom:0;">
            <div style="min-width: ${Math.max(600, Object.keys(byLocation).length * 60)}px; height: 300px;">
                <canvas id="chart-location"></canvas>
            </div>
        </div>
        <div style="font-size:0.7rem; color:var(--ink-muted); text-align:center; margin-top:4px;">(横スクロールで全地点を確認できます)</div>
      </div>`,
            'weather': `<div class="chart-container toggle-target" data-id="weather" style="${isHidden('weather')}">${chartHead('cloud', '天候別の平均配布係数', 'weather')}<div class="chart-canvas-wrapper"><canvas id="chart-weather"></canvas></div></div>`,
            'daytime': `<div class="chart-container toggle-target" data-id="daytime" style="${isHidden('daytime')}">${chartHead('calendar', '曜日×時間帯の配布係数', 'daytime')}<div class="data-table-wrapper">
        <table class="data-table heatmap-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--surface); box-shadow: 1px 0 0 var(--line);">曜日</th>${hours.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dayNames.map(d => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--surface);font-weight:600;border-right:1px solid var(--line); box-shadow: 1px 0 0 var(--line);">${d}</td>${hours.map(h => {
        const cell = dayTimeGrid[d]?.[h];
        if (!cell || cell.rates.length === 0) return `<td style="background:${C.sunken};color:${C.faint};">-</td>`;
        const a = avg(cell.rates);
        const step = heatStep(a);
        const textColor = step >= 3 ? '#ffffff' : C.accent;
        return `<td style="background:${HEAT[step]};color:${textColor};font-weight:700;">${a}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></div>`,
            'summary-month': `<div class="chart-container toggle-target" data-id="summary-month" style="${isHidden('summary-month')}">${chartHead('calendar', '月別サマリー', 'summary-month')}<div class="data-table-wrapper">
        <table class="data-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--surface);box-shadow: 1px 0 0 var(--line);">月</th><th>回数</th><th>時間(分)</th><th>配布枚数</th><th>平均係数</th></tr></thead>
        <tbody>${monthKeys.map(m => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--surface);border-right:1px solid var(--line);box-shadow: 1px 0 0 var(--line);">${m}</td><td>${byMonth[m].count}</td><td>${byMonth[m].duration}</td><td>${byMonth[m].dist.toLocaleString()}</td><td>${avg(byMonth[m].rates)}</td></tr>`).join('')}</tbody></table></div></div>`,
            'summary-location': `<div class="chart-container toggle-target" data-id="summary-location" style="${isHidden('summary-location')}">
        ${chartHead('pin', '場所別サマリー', 'summary-location')}
        <div class="data-table-wrapper" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
            <thead style="position: sticky; top: 0; z-index: 20;">
                <tr>
                    <th style="position:sticky;left:0;z-index:21;background:var(--surface);box-shadow: 1px 0 0 var(--line);">場所</th>
                    <th class="sortable" data-sort="count">回数 ${sortIcon('count')}</th>
                    <th class="sortable" data-sort="duration">時間 ${sortIcon('duration')}</th>
                    <th class="sortable" data-sort="dist">枚数 ${sortIcon('dist')}</th>
                    <th class="sortable" data-sort="avg">係数 ${sortIcon('avg')}</th>
                </tr>
            </thead>
            <tbody>${sortedLocations.map(d => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--surface);border-right:1px solid var(--line);font-weight:600;box-shadow: 1px 0 0 var(--line); white-space: normal; min-width:100px;">${d.loc}</td><td>${d.count}</td><td>${d.duration}</td><td>${d.dist.toLocaleString()}</td><td>${d.avg}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>`,
            'crosstab': `<div class="chart-container toggle-target" data-id="crosstab" style="${isHidden('crosstab')}">${chartHead('chart', '場所×月 クロス集計', 'crosstab')}<div class="data-table-wrapper">
        <table class="data-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--surface);box-shadow: 1px 0 0 var(--line);">場所</th>${monthKeys.map(m => `<th>${m}</th>`).join('')}<th>合計</th></tr></thead>
        <tbody>${allLocs.map(loc => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--surface);border-right:1px solid var(--line);font-weight:600;box-shadow: 1px 0 0 var(--line); white-space: normal; min-width:100px;">${loc}</td>${monthKeys.map(m => `<td>${crossTable[loc][m].dist || '-'}</td>`).join('')}<td style="font-weight:700; background:var(--surface-sunken);">${byLocation[loc].dist.toLocaleString()}</td></tr>`).join('')}</tbody></table></div></div>`,
            'ranking-location': `<div class="chart-container toggle-target" data-id="ranking-location" style="${isHidden('ranking-location')}">${chartHead('trophy', '場所ランキング', 'ranking-location')}
        ${locationRanking.map((loc, i) => `<div class="ranking-item"><div class="ranking-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</div><div class="ranking-info"><div class="ranking-name">${loc.name}</div><div class="ranking-stat">係数: <span style="font-weight:600;color:var(--ink);">${loc.avgRate}</span> ｜ 配布: ${loc.dist.toLocaleString()}枚 ｜ ${loc.count}回</div></div></div>`).join('')}
      </div>`,
            'activity-map': `<div class="chart-container toggle-target" data-id="activity-map" style="${isHidden('activity-map')}">${chartHead('pin', '活動量マップ', 'activity-map')}<div id="activity-map-root"></div></div>`
        };

        const sortedChartsHTML = chartOrder.map(id => blocks[id] || '').join('');

        container.innerHTML = `
    <div>
      <div class="list-toolbar" style="margin-bottom: var(--s2);">
        <h2 class="section-title" style="margin:0;">${icon('chart', { size: 19 })}分析</h2>
        <div class="list-toolbar-actions"><button id="btn-share-dashboard" class="btn btn-primary btn-sm">${icon('upload', { size: 15 })}共有</button><button id="btn-prefs" class="btn btn-secondary btn-sm">${icon('settings', { size: 15 })}表示設定</button></div>
      </div>
      <div class="stat-chip" style="margin-bottom:var(--s4);">
           ${icon('user')}${store.getPoliticians().find(p => p.id === store.getCurrentPoliticianId())?.name || ''}
      </div>

      <div id="prefs-panel" style="display:none; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-control); padding:var(--s4); margin-bottom:var(--s4);">
        <div style="font-weight:600; margin-bottom:8px;">表示する項目を選択</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${CHART_CONFIGS.map(c => `
             <label class="checkbox-group" style="min-height:auto; font-size:0.85rem;">
               <input type="checkbox" class="pref-cb" data-id="${c.id}" ${!hiddenCharts.includes(c.id) ? 'checked' : ''}>
               ${c.title}
             </label>
          `).join('')}
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-card-value">${totalCount}</div><div class="stat-card-label">活動回数</div></div>
        <div class="stat-card"><div class="stat-card-value">${totalDuration}</div><div class="stat-card-label">合計時間(分)</div></div>
        <div class="stat-card"><div class="stat-card-value">${totalDist.toLocaleString()}</div><div class="stat-card-label">合計枚数</div></div>
        <div class="stat-card"><div class="stat-card-value">${avgRate}</div><div class="stat-card-label">平均係数</div></div>
      </div>

      <div id="sortable-dashboard">
        ${sortedChartsHTML}
      </div>
    </div>
  `;

        // Setting panel toggle
        document.getElementById('btn-prefs').addEventListener('click', () => {
            const panel = document.getElementById('prefs-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('btn-share-dashboard').addEventListener('click', () => openShareDialog(records));
        container.querySelectorAll('.chart-share').forEach(button => button.addEventListener('click', () => {
            const id = button.dataset.share;
            openImageShareDialog(button.dataset.label || '分析', shareBuilders[id]);
        }));

        // 目標の入力。保存してグラフと進捗の説明だけ描き直す。
        ['goal-target', 'goal-deadline'].forEach(id => {
            const input = document.getElementById(id);
            input?.addEventListener('change', () => {
                saveGoal({
                    target: document.getElementById('goal-target')?.value || '',
                    deadline: document.getElementById('goal-deadline')?.value || '',
                });
                initCharts();
            });
        });

        // Config checkboxes
        container.querySelectorAll('.pref-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) hiddenCharts = hiddenCharts.filter(x => x !== id);
                else if (!hiddenCharts.includes(id)) hiddenCharts.push(id);
                localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(hiddenCharts));
                renderInternal();
                initCharts();
            });
        });

        // Sorting
        container.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (sortConfig.key === key) sortConfig.order = sortConfig.order === 'asc' ? 'desc' : 'asc';
                else { sortConfig.key = key; sortConfig.order = 'desc'; }
                renderInternal();
                initCharts();
            });
        });

        // Initialize drag and drop sortable
        const sortableEl = document.getElementById('sortable-dashboard');
        if (sortableEl && window.Sortable) {
            new window.Sortable(sortableEl, {
                handle: '.drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function () {
                    const newOrder = Array.from(sortableEl.children).map(el => el.dataset.id).filter(id => id);
                    if (newOrder.length > 0) {
                        localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(newOrder));
                        initCharts(); // 順番が変わるとCanvasの中身が失われることがあるため再描画
                    }
                }
            });
        }
    }

    function initCharts() {
        destroyCharts();
        Chart.defaults.color = C.ink;  Chart.defaults.borderColor = C.line;
        Chart.defaults.font.family = "'Noto Sans JP', sans-serif";

        if (!hiddenCharts.includes('monthly')) {
            const mc = document.getElementById('chart-monthly');
            if (mc) {
                const ch = new Chart(mc, {
                    type: 'line', data: {
                        labels: monthKeys, datasets: [
                            { label: '配布枚数', data: monthKeys.map(m => byMonth[m].dist), borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.3, yAxisID: 'y' },
                            { label: '活動回数', data: monthKeys.map(m => byMonth[m].count), borderColor: C.secondary, fill: false, tension: 0.3, yAxisID: 'y1' },
                            { label: '平均係数', data: monthKeys.map(m => { const r = byMonth[m].rates; return r.length > 0 ? parseFloat((r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)) : 0; }), borderColor: C.tertiary, fill: false, tension: 0.3, yAxisID: 'y1' },
                        ]
                    }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } } }, scales: { y: { type: 'linear', position: 'left', title: { display: true, text: '配布枚数' }, beginAtZero: true, ticks: { stepSize: 100, maxTicksLimit: 10 } }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '回数/係数' }, beginAtZero: true, ticks: { stepSize: 1, maxTicksLimit: 10 } } } }
                }); chartInstances.push(ch);
            }
        }

        if (!hiddenCharts.includes('location')) {
            const lc = document.getElementById('chart-location');
            if (lc) { const le = Object.entries(byLocation).sort((a, b) => b[1].dist - a[1].dist); const ch = new Chart(lc, { type: 'bar', data: { labels: le.map(([n]) => n), datasets: [{ label: '配布枚_dist', data: le.map(([, d]) => d.dist), backgroundColor: C.accent, borderColor: C.accent, borderWidth: 1, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }); chartInstances.push(ch); }
        }

        if (!hiddenCharts.includes('weather')) {
            const wc = document.getElementById('chart-weather');
            if (wc) { const we = Object.entries(byWeather); const wColors = { '晴': '#c08a2e', '曇': '#8a9296', '雨': '#4a7a94', '雪': '#b8c4c9', '未設定': C.faint }; const ch = new Chart(wc, { type: 'bar', data: { labels: we.map(([w]) => w), datasets: [{ label: '平均配布係数', data: we.map(([, d]) => d.rates.length > 0 ? parseFloat((d.rates.reduce((a, b) => a + b, 0) / d.rates.length).toFixed(2)) : 0), backgroundColor: we.map(([w]) => wColors[w] || '#555'), borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: '枚/分' } } } } }); chartInstances.push(ch); }
        }
        if (!hiddenCharts.includes('cumulative')) {
            const cc = document.getElementById('chart-cumulative');
            const view = buildGoalView(cumulative, getGoal(), today);
            const note = document.getElementById('cumulative-note');
            if (note) note.textContent = view.note;
            if (cc) {
                const datasets = [
                    { label: '累積配布枚数', data: view.actual, borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.2, pointRadius: 2 },
                ];
                if (view.pace) datasets.push({ label: '目標ペース', data: view.pace, borderColor: C.tertiary, borderDash: [6, 6], fill: false, pointRadius: 0, tension: 0 });
                const labelOf = offset => dateFromOffset(view.start, offset);
                const ch = new Chart(cc, {
                    type: 'line',
                    data: { datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'nearest', axis: 'x', intersect: false },
                        plugins: {
                            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
                            tooltip: { callbacks: { title: items => labelOf(items[0].parsed.x) } },
                        },
                        scales: {
                            x: { type: 'linear', min: 0, max: view.maxX || undefined, title: { display: true, text: '日付' }, ticks: { maxTicksLimit: 6, callback: value => labelOf(value) } },
                            y: { beginAtZero: true, title: { display: true, text: '累積枚数' } },
                        },
                    },
                });
                chartInstances.push(ch);
            }
        }

        if (!hiddenCharts.includes('timeband')) {
            const bandChart = (canvas, rows) => {
                if (!canvas || rows.length === 0) return;
                const ch = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: rows.map(row => `${row.label}(${row.count}回)`),
                        datasets: [{ label: '平均配布係数', data: rows.map(row => avgNum(row.rates)), backgroundColor: C.accent, borderRadius: 6 }],
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: '枚/分' } } } },
                });
                chartInstances.push(ch);
            };
            bandChart(document.getElementById('chart-timeband'), byTimeBand);
            bandChart(document.getElementById('chart-dayofweek'), byDayOfWeek);
        }

        if (!hiddenCharts.includes('duration-band')) {
            const dc = document.getElementById('chart-duration-band');
            if (dc && byDurationBand.length > 0) {
                const ch = new Chart(dc, {
                    type: 'bar',
                    data: {
                        labels: byDurationBand.map(band => `${band.label}(${band.count}回)`),
                        datasets: [
                            { label: '平均配布係数', data: byDurationBand.map(band => avgNum(band.rates)), backgroundColor: C.accent, borderRadius: 6, yAxisID: 'y' },
                            { type: 'line', label: '平均配布枚数', data: byDurationBand.map(band => band.avgDist), borderColor: C.tertiary, fill: false, tension: 0.3, yAxisID: 'y1' },
                        ],
                    },
                    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } } }, scales: { y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: '枚/分' } }, y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '枚' } } } },
                });
                chartInstances.push(ch);
            }
        }

        if (!hiddenCharts.includes('activity-map')) {
            const root = document.getElementById('activity-map-root');
            if (root) renderActivityMap(root, records);
        }
    }

    renderInternal();
    initCharts();
}
