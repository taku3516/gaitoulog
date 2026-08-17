// ===== スポット別活動量マップ =====

import * as spotStore from './spot-store.js';
import { createFramedImage } from './share-report.js';
import { COLOR, PRIMITIVE } from './theme.js';

const CENTER = [35.6092, 139.7302];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SIZE = 256;
const METRIC_LABELS = { distribution: '総配布枚数', duration: '合計活動時間', count: '活動回数' };
let activeMap = null;
// 共有画像は表示中の地図と同じ集計・同じ配色で描き直すため、直近の描画内容を保持する
let lastDraw = null;
// 描画直後のサイズ再計算。作り直しで地図が入れ替わったら実行しない
let resizeTimer = null;

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

// 活動量は大小のある1つの量なので、色相は変えずに濃さだけで示す。
// 以前は 青→オレンジ→赤 と色相を変えていたが、この並びには大小の順序が
// 無いため、どちらが多いのかを凡例なしに読み取れなかった。
// 面積（半径）と濃さの二重表現にして、色が読めない場合でも大小が分かるようにする。
function markerStyle(ratio) {
    return {
        radius: 7 + Math.sqrt(ratio) * 22,
        color: PRIMITIVE.blue1000,
        fillColor: PRIMITIVE.blue900,
        fillOpacity: .25 + ratio * .60,
    };
}

export function renderActivityMap(container, allRecords) {
    if (!container || !window.L) {
        if (container) container.innerHTML = '<div class="empty-state-text">地図を読み込めませんでした。</div>';
        return null;
    }
    lastDraw = null;
    if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
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

    function periodLabel() {
        const period = document.getElementById('activity-map-period').value;
        if (period === 'this-month') return `期間：${currentYearMonth()}（今月）`;
        if (period === 'last-month') return `期間：${currentYearMonth(-1)}（先月）`;
        if (period === 'custom') {
            const start = document.getElementById('activity-map-start').value;
            const end = document.getElementById('activity-map-end').value;
            if (!start && !end) return '期間：全期間';
            return `期間：${start || '開始日未指定'} 〜 ${end || '終了日未指定'}`;
        }
        return '期間：全期間';
    }

    function redraw() {
        layer.clearLayers();
        const metric = document.getElementById('activity-map-metric').value;
        const rows = aggregate(filteredRecords());
        const max = Math.max(...rows.map(row => row[metric]), 1);
        lastDraw = { rows, metric, max, periodLabel: periodLabel() };
        for (const row of rows) {
            const ratio = row[metric] / max;
            const { radius, color, fillColor, fillOpacity } = markerStyle(ratio);
            const marker = window.L.circleMarker([row.spot.lat, row.spot.lng], {
                radius,
                color,
                weight: 2,
                fillColor,
                fillOpacity,
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
    resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (activeMap === map) map.invalidateSize();
    }, 0);
    return map;
}

// タイルは共有画像用に取得し直す。表示中の地図はCORS設定を変えずそのまま動かす。
function loadTile(url) {
    return new Promise(resolve => {
        const image = new Image();
        const timer = setTimeout(() => resolve(null), 8000);
        const done = value => { clearTimeout(timer); resolve(value); };
        image.crossOrigin = 'anonymous';
        image.onload = () => done(image);
        image.onerror = () => done(null);
        image.src = url;
    });
}

/** 表示中の活動量マップを共有用のPNGにする。 */
export async function createActivityMapImage(title = '活動量マップ') {
    const map = activeMap;
    if (!map || !lastDraw) throw new Error('地図を読み込めていないため画像を作成できません。');

    const size = map.getSize();
    const baseZoom = map.getZoom();
    // 画面が小さいときは1段深いズームのタイルを使い、共有画像の解像度を確保する
    const zoom = Math.min(baseZoom + (size.x < 700 ? 1 : 0), 19);
    const factor = 2 ** (zoom - baseZoom);
    const origin = map.project(map.containerPointToLatLng([0, 0]), zoom);
    const width = Math.round(size.x * factor);
    const height = Math.round(size.y * factor);

    const tiles = [];
    const tileCount = 2 ** zoom;
    for (let tx = Math.floor(origin.x / TILE_SIZE); tx <= Math.floor((origin.x + width) / TILE_SIZE); tx++) {
        for (let ty = Math.floor(origin.y / TILE_SIZE); ty <= Math.floor((origin.y + height) / TILE_SIZE); ty++) {
            if (ty < 0 || ty >= tileCount) continue;
            const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
            tiles.push({
                x: tx,
                y: ty,
                url: TILE_URL.replace('{z}', zoom).replace('{x}', wrappedX).replace('{y}', ty),
            });
        }
    }
    const images = await Promise.all(tiles.map(tile => loadTile(tile.url)));

    const { rows, metric, max, periodLabel } = lastDraw;
    const metricLabel = METRIC_LABELS[metric] || metric;
    const labeled = [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, 5);
    const note = [
        rows.length
            ? `円の大きさと色が${metricLabel}を表します。${rows.length}スポットを表示しています。`
            : '座標と結び付いた活動記録がありません。',
        images.some(Boolean) ? '' : '地図タイルを取得できなかったため、背景なしで出力しています。',
    ].filter(Boolean).join('');

    return createFramedImage({
        title,
        subtitle: `${periodLabel}　｜　指標：${metricLabel}`,
        note,
        width,
        height,
        draw(ctx, x, y) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.clip();
            ctx.fillStyle = COLOR.sunken;
            ctx.fillRect(x, y, width, height);
            images.forEach((image, index) => {
                if (!image) return;
                ctx.drawImage(
                    image,
                    Math.round(x + tiles[index].x * TILE_SIZE - origin.x),
                    Math.round(y + tiles[index].y * TILE_SIZE - origin.y),
                    TILE_SIZE,
                    TILE_SIZE,
                );
            });

            for (const row of rows) {
                const ratio = row[metric] / max;
                const style = markerStyle(ratio);
                const point = map.project([row.spot.lat, row.spot.lng], zoom);
                const cx = x + point.x - origin.x;
                const cy = y + point.y - origin.y;
                ctx.beginPath();
                ctx.arc(cx, cy, style.radius * factor, 0, Math.PI * 2);
                ctx.globalAlpha = style.fillOpacity;
                ctx.fillStyle = style.fillColor;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.lineWidth = 2 * factor;
                ctx.strokeStyle = style.color;
                ctx.stroke();
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.round(13 * factor)}px "Noto Sans JP", sans-serif`;
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            const placed = [];
            const labelHeight = 18 * factor;
            for (const row of labeled) {
                const point = map.project([row.spot.lat, row.spot.lng], zoom);
                const ratio = row[metric] / max;
                const text = row.spot.spot;
                const half = ctx.measureText(text).width / 2;
                // 画像の端で名前が切れないように、中央位置を内側へ寄せる
                const labelX = Math.min(Math.max(x + point.x - origin.x, x + half + 8), x + width - half - 8);
                const labelY = y + point.y - origin.y - markerStyle(ratio).radius * factor - 10 * factor;
                const box = { left: labelX - half, right: labelX + half, top: labelY - labelHeight / 2, bottom: labelY + labelHeight / 2 };
                // 近接スポットの名前が重なって読めなくなるものは省く
                if (placed.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
                placed.push(box);
                ctx.strokeText(text, labelX, labelY);
                ctx.fillStyle = COLOR.ink;
                ctx.fillText(text, labelX, labelY);
            }

            ctx.textAlign = 'right';
            ctx.font = '400 18px "Noto Sans JP", sans-serif';
            const credit = '© OpenStreetMap contributors';
            const creditWidth = ctx.measureText(credit).width + 16;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.fillRect(x + width - creditWidth, y + height - 26, creditWidth, 26);
            ctx.fillStyle = COLOR.inkSecondary;
            ctx.fillText(credit, x + width - 8, y + height - 13);
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        },
    });
}
