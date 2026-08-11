// ===== スポット別活動量マップ =====

import * as spotStore from './spot-store.js';

const CENTER = [35.6092, 139.7302];
let activeMap = null;

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

function currentYearMonth(offset = 0) {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function aggregate(records) {
    const result = new Map();
    for (const record of records) {
        const spot = (record.spotId && spotStore.getSpotById(record.spotId))
            || spotStore.findSpot(record.area, record.locality, record.spot);
        if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) continue;
        const row = result.get(spot.id) || { spot, count: 0, duration: 0, distribution: 0, latestDate: '' };
        row.count += 1;
        row.duration += Number(record.duration) || 0;
        row.distribution += Number(record.distributionCount) || 0;
        if (!row.latestDate || record.date > row.latestDate) row.latestDate = record.date;
        result.set(spot.id, row);
    }
    return [...result.values()];
}

export function renderActivityMap(container, allRecords) {
    if (!container || !window.L) {
        if (container) container.innerHTML = '<div class="empty-state-text">地図を読み込めませんでした。</div>';
        return null;
    }
    if (activeMap) {
        try { activeMap.remove(); } catch { /* 既にDOMが破棄済み */ }
        activeMap = null;
    }
    container.innerHTML = `
      <div class="activity-map-controls">
        <select class="filter-select" id="activity-map-metric">
          <option value="distribution">総配布枚数</option>
          <option value="duration">合計活動時間</option>
          <option value="count">活動回数</option>
        </select>
        <select class="filter-select" id="activity-map-period">
          <option value="all">全期間</option>
          <option value="this-month">今月</option>
          <option value="last-month">先月</option>
          <option value="custom">期間指定</option>
        </select>
      </div>
      <div class="activity-map-range" id="activity-map-range" hidden>
        <input type="date" class="filter-select" id="activity-map-start" aria-label="開始日">
        <input type="date" class="filter-select" id="activity-map-end" aria-label="終了日">
      </div>
      <div class="activity-map-canvas" id="activity-map-canvas"></div>
      <div class="activity-map-legend"><span>小</span><i></i><i></i><i></i><i></i><span>大</span></div>
      <div class="text-xs text-muted" id="activity-map-note"></div>`;

    const map = window.L.map('activity-map-canvas').setView(CENTER, 13);
    activeMap = map;
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layer = window.L.layerGroup().addTo(map);

    function filteredRecords() {
        const period = document.getElementById('activity-map-period').value;
        if (period === 'this-month') return allRecords.filter(record => record.yearMonth === currentYearMonth());
        if (period === 'last-month') return allRecords.filter(record => record.yearMonth === currentYearMonth(-1));
        if (period === 'custom') {
            const start = document.getElementById('activity-map-start').value;
            const end = document.getElementById('activity-map-end').value;
            return allRecords.filter(record => (!start || record.date >= start) && (!end || record.date <= end));
        }
        return allRecords;
    }

    function redraw() {
        layer.clearLayers();
        const metric = document.getElementById('activity-map-metric').value;
        const rows = aggregate(filteredRecords());
        const max = Math.max(...rows.map(row => row[metric]), 1);
        for (const row of rows) {
            const ratio = row[metric] / max;
            const radius = 7 + Math.sqrt(ratio) * 22;
            const opacity = .30 + ratio * .55;
            const marker = window.L.circleMarker([row.spot.lat, row.spot.lng], {
                radius,
                color: '#1f4d63',
                weight: 2,
                fillColor: ratio > .66 ? '#9b2c2c' : ratio > .33 ? '#c08a2e' : '#1f4d63',
                fillOpacity: opacity,
            }).addTo(layer);
            marker.bindPopup(`<strong>${esc(row.spot.spot)}</strong><br>${esc(row.spot.area)}${row.spot.locality ? ` ／ ${esc(row.spot.locality)}` : ''}<hr>
              活動回数：${row.count}回<br>合計時間：${row.duration.toLocaleString()}分<br>総配布枚数：${row.distribution.toLocaleString()}枚<br>最終活動日：${esc(row.latestDate || '-')}`);
        }
        document.getElementById('activity-map-note').textContent = rows.length
            ? `${rows.length}スポットを表示しています。円の大きさと色が活動量を表します。`
            : '座標と結び付いた活動記録がありません。入力地図でスポットを選択すると表示されます。';
    }

    document.getElementById('activity-map-metric').addEventListener('change', redraw);
    document.getElementById('activity-map-period').addEventListener('change', event => {
        document.getElementById('activity-map-range').hidden = event.target.value !== 'custom';
        redraw();
    });
    document.getElementById('activity-map-start').addEventListener('change', redraw);
    document.getElementById('activity-map-end').addEventListener('change', redraw);
    redraw();
    setTimeout(() => map.invalidateSize(), 0);
    return map;
}
