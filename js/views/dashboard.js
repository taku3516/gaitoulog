// ===== ダッシュボード =====
import * as store from '../store.js';

const Chart = window.Chart;
let chartInstances = [];

function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances = [];
}

function avg(arr) {
    return arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
}

const DASHBOARD_PREFS_KEY = 'streetActivityLogs_dashboardPrefs';
let hiddenCharts = JSON.parse(localStorage.getItem(DASHBOARD_PREFS_KEY) || '[]');
const DASHBOARD_ORDER_KEY = 'streetActivityLogs_dashboardOrder';
let sortConfig = { key: 'count', order: 'desc' };

const CHART_CONFIGS = [
    { id: 'monthly', title: '月別推移' },
    { id: 'location', title: '場所別 配布枚数' },
    { id: 'weather', title: '天候別 平均配布係数' },
    { id: 'daytime', title: '曜日×時間帯 配布係数' },
    { id: 'summary-month', title: '月別サマリー' },
    { id: 'summary-location', title: '場所別サマリー' },
    { id: 'crosstab', title: '場所×月 クロス集計' },
    { id: 'ranking-location', title: '場所ランキング' }
];

export async function render(container) {
    destroyCharts();
    const records = await store.getAll();

    if (records.length === 0) {
        container.innerHTML = `
            <div class="view-container">
                <div class="section-title">📊 分析ダッシュボード</div>
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
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

    const isHidden = (id) => hiddenCharts.includes(id) ? 'display:none;' : '';

    function renderInternal() {
        const sortedLocations = Object.entries(byLocation).map(([loc, d]) => ({
            loc, ...d, avg: avg(d.rates)
        })).sort((a, b) => {
            const valA = sortConfig.key === 'avg' ? (a.avg === '-' ? -1 : parseFloat(a.avg)) : a[sortConfig.key];
            const valB = sortConfig.key === 'avg' ? (b.avg === '-' ? -1 : parseFloat(b.avg)) : b[sortConfig.key];
            return sortConfig.order === 'desc' ? (valB - valA || 0) : (valA - valB || 0);
        });

        const sortIcon = (key) => sortConfig.key === key ? (sortConfig.order === 'desc' ? '▼' : '▲') : '';

        let defaultOrder = CHART_CONFIGS.map(c => c.id);
        let chartOrder = JSON.parse(localStorage.getItem(DASHBOARD_ORDER_KEY) || JSON.stringify(defaultOrder));
        CHART_CONFIGS.forEach(c => { if (!chartOrder.includes(c.id)) chartOrder.push(c.id); });

        const blocks = {
            'monthly': `<div class="chart-container toggle-target" data-id="monthly" style="${isHidden('monthly')}"><div class="chart-title"><div>📈 月別推移</div><div class="drag-handle" title="並び替え">≡</div></div><div class="chart-canvas-wrapper"><canvas id="chart-monthly"></canvas></div></div>`,
            'location': `<div class="chart-container toggle-target" data-id="location" style="${isHidden('location')}">
        <div class="chart-title"><div>📍 場所別 配布枚数</div><div class="drag-handle" title="並び替え">≡</div></div>
        <div class="data-table-wrapper" style="margin-bottom:0;">
            <div style="min-width: ${Math.max(600, Object.keys(byLocation).length * 60)}px; height: 300px;">
                <canvas id="chart-location"></canvas>
            </div>
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-top:4px;">(横スクロールで全地点を確認できます)</div>
      </div>`,
            'weather': `<div class="chart-container toggle-target" data-id="weather" style="${isHidden('weather')}"><div class="chart-title"><div>🌤️ 天候別 平均配布係数</div><div class="drag-handle" title="並び替え">≡</div></div><div class="chart-canvas-wrapper"><canvas id="chart-weather"></canvas></div></div>`,
            'daytime': `<div class="chart-container toggle-target" data-id="daytime" style="${isHidden('daytime')}"><div class="chart-title"><div>🗓️ 曜日×時間帯 配布係数</div><div class="drag-handle" title="並び替え">≡</div></div><div class="data-table-wrapper">
        <table class="data-table heatmap-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--bg-card); box-shadow: 2px 0 4px rgba(0,0,0,0.05);">曜日</th>${hours.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dayNames.map(d => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--bg-card);font-weight:600;border-right:1px solid var(--border-color); box-shadow: 2px 0 4px rgba(0,0,0,0.05);">${d}</td>${hours.map(h => {
        const cell = dayTimeGrid[d]?.[h];
        if (!cell || cell.rates.length === 0) return '<td style="background:#f8fafc;color:#cbd5e1;text-align:center;font-size:0.7rem;">-</td>';
        const a = avg(cell.rates);
        const aNum = parseFloat(a);
        let bgColor = '#eff6ff';
        let textColor = '#1e40af';
        if (aNum >= 3.0) { bgColor = '#1e3a8a'; textColor = '#fff'; }
        else if (aNum >= 2.0) { bgColor = '#2563eb'; textColor = '#fff'; }
        else if (aNum >= 1.0) { bgColor = '#60a5fa'; textColor = '#fff'; }
        else if (aNum >= 0.5) { bgColor = '#bfdbfe'; textColor = '#1e40af'; }
        return `<td style="background:${bgColor};color:${textColor};text-align:center;font-weight:700;">${a}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></div>`,
            'summary-month': `<div class="chart-container toggle-target" data-id="summary-month" style="${isHidden('summary-month')}"><div class="chart-title"><div>📅 月別サマリー</div><div class="drag-handle" title="並び替え">≡</div></div><div class="data-table-wrapper">
        <table class="data-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--bg-card);box-shadow: 2px 0 4px rgba(0,0,0,0.05);">月</th><th>回数</th><th>時間(分)</th><th>配布枚数</th><th>平均係数</th></tr></thead>
        <tbody>${monthKeys.map(m => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border-color);box-shadow: 2px 0 4px rgba(0,0,0,0.05);">${m}</td><td>${byMonth[m].count}</td><td>${byMonth[m].duration}</td><td>${byMonth[m].dist.toLocaleString()}</td><td>${avg(byMonth[m].rates)}</td></tr>`).join('')}</tbody></table></div></div>`,
            'summary-location': `<div class="chart-container toggle-target" data-id="summary-location" style="${isHidden('summary-location')}">
        <div class="chart-title"><div>📍 場所別サマリー</div><div class="drag-handle" title="並び替え">≡</div></div>
        <div class="data-table-wrapper" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
            <thead style="position: sticky; top: 0; z-index: 20;">
                <tr>
                    <th style="position:sticky;left:0;z-index:21;background:var(--bg-card);box-shadow: 2px 0 4px rgba(0,0,0,0.05);">場所</th>
                    <th class="sortable" data-sort="count">回数 ${sortIcon('count')}</th>
                    <th class="sortable" data-sort="duration">時間 ${sortIcon('duration')}</th>
                    <th class="sortable" data-sort="dist">枚数 ${sortIcon('dist')}</th>
                    <th class="sortable" data-sort="avg">係数 ${sortIcon('avg')}</th>
                </tr>
            </thead>
            <tbody>${sortedLocations.map(d => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border-color);font-weight:600;box-shadow: 2px 0 4px rgba(0,0,0,0.05); white-space: normal; min-width:100px;">${d.loc}</td><td>${d.count}</td><td>${d.duration}</td><td>${d.dist.toLocaleString()}</td><td>${d.avg}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>`,
            'crosstab': `<div class="chart-container toggle-target" data-id="crosstab" style="${isHidden('crosstab')}"><div class="chart-title"><div>📊 場所×月 クロス集計（配布枚数）</div><div class="drag-handle" title="並び替え">≡</div></div><div class="data-table-wrapper">
        <table class="data-table"><thead><tr><th style="position:sticky;left:0;z-index:10;background:var(--bg-card);box-shadow: 2px 0 4px rgba(0,0,0,0.05);">場所</th>${monthKeys.map(m => `<th>${m}</th>`).join('')}<th>合計</th></tr></thead>
        <tbody>${allLocs.map(loc => `<tr><td style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border-color);font-weight:600;box-shadow: 2px 0 4px rgba(0,0,0,0.05); white-space: normal; min-width:100px;">${loc}</td>${monthKeys.map(m => `<td>${crossTable[loc][m].dist || '-'}</td>`).join('')}<td style="font-weight:700; background:var(--bg-input);">${byLocation[loc].dist.toLocaleString()}</td></tr>`).join('')}</tbody></table></div></div>`,
            'ranking-location': `<div class="chart-container toggle-target" data-id="ranking-location" style="${isHidden('ranking-location')}"><div class="chart-title"><div>🏆 場所ランキング（配布係数）</div><div class="drag-handle" title="並び替え">≡</div></div>
        ${locationRanking.map((loc, i) => `<div class="ranking-item"><div class="ranking-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</div><div class="ranking-info"><div class="ranking-name">${loc.name}</div><div class="ranking-stat">係数: <span style="font-weight:600;color:var(--text-primary);">${loc.avgRate}</span> ｜ 配布: ${loc.dist.toLocaleString()}枚 ｜ ${loc.count}回</div></div></div>`).join('')}
      </div>`
        };

        const sortedChartsHTML = chartOrder.map(id => blocks[id] || '').join('');

        container.innerHTML = `
    <div class="view-container">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--spacing-sm);">
        <div class="section-title" style="border:none; margin:0; padding:0;">📊 分析ダッシュボード</div>
        <button id="btn-prefs" class="btn btn-secondary btn-sm" style="min-height:30px; padding:4px 8px;">⚙️ 表示設定</button>
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:var(--spacing-md);">
           👤 ${store.getPoliticians().find(p => p.id === store.getCurrentPoliticianId())?.name || ''}
      </div>

      <div id="prefs-panel" style="display:none; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:var(--spacing-md); margin-bottom:var(--spacing-md);">
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

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--spacing-sm);margin-bottom:var(--spacing-md);">
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
        Chart.defaults.color = '#4a5a6a';  Chart.defaults.borderColor = 'rgba(80,129,181,0.1)';
        Chart.defaults.font.family = "'Noto Sans JP', sans-serif";

        if (!hiddenCharts.includes('monthly')) {
            const mc = document.getElementById('chart-monthly');
            if (mc) {
                const ch = new Chart(mc, {
                    type: 'line', data: {
                        labels: monthKeys, datasets: [
                            { label: '配布枚数', data: monthKeys.map(m => byMonth[m].dist), borderColor: '#5081b5', backgroundColor: 'rgba(80,129,181,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
                            { label: '活動回数', data: monthKeys.map(m => byMonth[m].count), borderColor: '#3a6a9e', fill: false, tension: 0.3, yAxisID: 'y1' },
                            { label: '平均係数', data: monthKeys.map(m => { const r = byMonth[m].rates; return r.length > 0 ? parseFloat((r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)) : 0; }), borderColor: '#4caf50', fill: false, tension: 0.3, yAxisID: 'y1' },
                        ]
                    }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } } }, scales: { y: { type: 'linear', position: 'left', title: { display: true, text: '配布枚数' }, beginAtZero: true, ticks: { stepSize: 100, maxTicksLimit: 10 } }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '回数/係数' }, beginAtZero: true, ticks: { stepSize: 1, maxTicksLimit: 10 } } } }
                }); chartInstances.push(ch);
            }
        }

        if (!hiddenCharts.includes('location')) {
            const lc = document.getElementById('chart-location');
            if (lc) { const le = Object.entries(byLocation).sort((a, b) => b[1].dist - a[1].dist); const ch = new Chart(lc, { type: 'bar', data: { labels: le.map(([n]) => n), datasets: [{ label: '配布枚_dist', data: le.map(([, d]) => d.dist), backgroundColor: 'rgba(80,129,181,0.6)', borderColor: '#5081b5', borderWidth: 1, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }); chartInstances.push(ch); }
        }

        if (!hiddenCharts.includes('weather')) {
            const wc = document.getElementById('chart-weather');
            if (wc) { const we = Object.entries(byWeather); const wColors = { '晴': '#ffa726', '曇': '#78909c', '雨': '#42a5f5', '雪': '#e0e0e0', '未設定': '#555' }; const ch = new Chart(wc, { type: 'bar', data: { labels: we.map(([w]) => w), datasets: [{ label: '平均配布係数', data: we.map(([, d]) => d.rates.length > 0 ? parseFloat((d.rates.reduce((a, b) => a + b, 0) / d.rates.length).toFixed(2)) : 0), backgroundColor: we.map(([w]) => wColors[w] || '#555'), borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: '枚/分' } } } } }); chartInstances.push(ch); }
        }
    }

    renderInternal();
    initCharts();
}
