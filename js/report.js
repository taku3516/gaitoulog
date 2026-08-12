// ===== 期間レポート（週次・月次の振り返り） =====
// 期間の実績を、同じ長さの前の期間と比べてまとめる。
// 共有は既存の共有部品（テキスト・画像）をそのまま使う。

import { todayISO } from './calculations.js';
import { createFramedImage, openImageShareDialog, shareText } from './share-report.js';

function toDayNumber(dateStr) {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
}

function fromDayNumber(day) {
    const date = new Date(day * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    return fromDayNumber(toDayNumber(dateStr) + days);
}

function formatDuration(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}時間${minutes ? `${minutes}分` : ''}` : `${minutes}分`;
}

/** 週は月曜はじまり。日曜の getDay() は 0 なので 7 として扱う。 */
function startOfWeek(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
    return addDays(dateStr, 1 - weekday);
}

function startOfMonth(dateStr) {
    return `${dateStr.slice(0, 7)}-01`;
}

function endOfMonth(dateStr) {
    const [year, month] = dateStr.split('-').map(Number);
    return fromDayNumber(Date.UTC(year, month, 0) / 86400000);
}

/** 期間の候補。値は { start, end, label } を返す。 */
export function periodPresets(base = todayISO()) {
    const thisWeek = startOfWeek(base);
    const lastWeek = addDays(thisWeek, -7);
    const thisMonth = startOfMonth(base);
    const lastMonthEnd = addDays(thisMonth, -1);
    return {
        'this-week': { label: '今週', start: thisWeek, end: addDays(thisWeek, 6) },
        'last-week': { label: '先週', start: lastWeek, end: addDays(lastWeek, 6) },
        'this-month': { label: '今月', start: thisMonth, end: endOfMonth(base) },
        'last-month': { label: '先月', start: startOfMonth(lastMonthEnd), end: lastMonthEnd },
    };
}

function summarize(records) {
    const duration = records.reduce((sum, r) => sum + (Number(r.duration) || 0), 0);
    const distribution = records.reduce((sum, r) => sum + (Number(r.distributionCount) || 0), 0);
    const days = new Set(records.map(r => r.date)).size;
    return {
        count: records.length,
        days,
        duration,
        distribution,
        rate: duration > 0 ? Number((distribution / duration).toFixed(2)) : 0,
    };
}

function locationRows(records) {
    const map = new Map();
    for (const record of records) {
        const name = `${record.area} ／ ${record.spot}`;
        const row = map.get(name) || { name, count: 0, distribution: 0, duration: 0 };
        row.count += 1;
        row.distribution += Number(record.distributionCount) || 0;
        row.duration += Number(record.duration) || 0;
        map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.distribution - a.distribution);
}

function deltaText(current, previous, unit = '', digits = 0) {
    if (previous === 0) return current === 0 ? '前期間と同じ' : '前期間は実績なし';
    const diff = current - previous;
    const percent = Math.round((diff / previous) * 100);
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    const value = Math.abs(diff).toFixed(digits);
    return `前期間比 ${sign}${Number(value).toLocaleString()}${unit}（${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(percent)}%）`;
}

/** 指定期間と、その直前の同じ長さの期間を比べたレポートを作る。 */
export function buildPeriodReport(allRecords, { start, end, label }) {
    const inRange = (from, to) => allRecords.filter(r => r.date >= from && r.date <= to);
    const length = toDayNumber(end) - toDayNumber(start) + 1;
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(length - 1));

    const records = inRange(start, end);
    const previousRecords = inRange(previousStart, previousEnd);
    const current = summarize(records);
    const previous = summarize(previousRecords);
    const locations = locationRows(records);

    return {
        label,
        start,
        end,
        length,
        previousStart,
        previousEnd,
        current,
        previous,
        locations,
        deltas: {
            count: deltaText(current.count, previous.count, '回'),
            distribution: deltaText(current.distribution, previous.distribution, '枚'),
            duration: deltaText(current.duration, previous.duration, '分'),
            rate: deltaText(current.rate, previous.rate, '枚/分', 2),
        },
    };
}

export function buildReportText(report) {
    const range = `${report.start} 〜 ${report.end}`;
    const lines = [
        `【街頭活動レポート ${report.label}】`,
        '',
        `期間：${range}`,
        `活動回数：${report.current.count}回（${report.current.days}日）`,
        `合計活動時間：${formatDuration(report.current.duration)}`,
        `総配布枚数：${report.current.distribution.toLocaleString()}枚`,
        `平均配布係数：${report.current.rate}枚/分`,
        '',
        `前の期間（${report.previousStart} 〜 ${report.previousEnd}）との比較`,
        `・活動回数 ${report.deltas.count}`,
        `・配布枚数 ${report.deltas.distribution}`,
        `・配布係数 ${report.deltas.rate}`,
    ];
    if (report.locations.length > 0) {
        lines.push('', '場所別の実績');
        for (const row of report.locations.slice(0, 5)) {
            lines.push(`・${row.name}：${row.count}回、${row.distribution.toLocaleString()}枚`);
        }
    }
    return lines.join('\n');
}

export function createReportImage(report) {
    const width = 972;
    const cardHeight = 150;
    const listTop = 40;
    const rows = report.locations.slice(0, 5);
    const height = cardHeight * 2 + 40 + listTop + Math.max(rows.length, 1) * 76 + 30;

    return createFramedImage({
        title: `街頭活動レポート ${report.label}`,
        subtitle: `${report.start} 〜 ${report.end}`,
        note: `前の期間（${report.previousStart} 〜 ${report.previousEnd}）と比べています。`,
        width,
        height,
        draw(ctx, x, y) {
            const cards = [
                ['活動回数', `${report.current.count}回`, report.deltas.count],
                ['合計時間', formatDuration(report.current.duration), report.deltas.duration],
                ['総配布枚数', `${report.current.distribution.toLocaleString()}枚`, report.deltas.distribution],
                ['平均配布係数', `${report.current.rate}枚/分`, report.deltas.rate],
            ];
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            cards.forEach(([label, value, delta], index) => {
                const cardX = x + (index % 2) * (width / 2 + 10);
                const cardY = y + Math.floor(index / 2) * (cardHeight + 20);
                const cardWidth = width / 2 - 10;
                ctx.fillStyle = '#f1f1f0';
                ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
                ctx.fillStyle = '#55595a';
                ctx.font = '500 25px "Noto Sans JP", sans-serif';
                ctx.fillText(label, cardX + 26, cardY + 44);
                ctx.fillStyle = '#1f4d63';
                ctx.font = '700 44px "Noto Sans JP", sans-serif';
                ctx.fillText(value, cardX + 26, cardY + 98);
                ctx.fillStyle = '#8a8f90';
                ctx.font = '400 21px "Noto Sans JP", sans-serif';
                ctx.fillText(delta, cardX + 26, cardY + 130);
            });

            const listY = y + cardHeight * 2 + 20 + 40;
            ctx.fillStyle = '#1a1c1b';
            ctx.font = '700 32px "Noto Sans JP", sans-serif';
            ctx.fillText('場所別の実績', x, listY);

            if (rows.length === 0) {
                ctx.fillStyle = '#8a8f90';
                ctx.font = '400 24px "Noto Sans JP", sans-serif';
                ctx.fillText('この期間の活動記録はありません。', x, listY + 50);
                return;
            }
            const max = Math.max(...rows.map(row => row.distribution), 1);
            rows.forEach((row, index) => {
                const rowY = listY + 58 + index * 76;
                ctx.fillStyle = '#1a1c1b';
                ctx.font = '600 26px "Noto Sans JP", sans-serif';
                const name = row.name.length > 24 ? `${row.name.slice(0, 23)}…` : row.name;
                ctx.fillText(name, x, rowY);
                ctx.fillStyle = '#55595a';
                ctx.font = '400 21px "Noto Sans JP", sans-serif';
                ctx.fillText(`${row.count}回・${row.distribution.toLocaleString()}枚`, x, rowY + 28);
                ctx.fillStyle = '#e0e0dd';
                ctx.fillRect(x + 560, rowY - 22, width - 560, 22);
                ctx.fillStyle = '#1f4d63';
                ctx.fillRect(x + 560, rowY - 22, (width - 560) * (row.distribution / max), 22);
            });
        },
    });
}

/** レポートの期間を選び、文章と画像で共有するダイアログ。 */
export function openReportDialog(allRecords) {
    const presets = periodPresets();
    let selected = 'this-month';
    let custom = { start: presets['this-month'].start, end: presets['this-month'].end };

    document.getElementById('report-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'report-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-sheet share-modal-sheet">
      <div class="modal-head">
        <div><div class="modal-title">期間レポート</div><div class="modal-sub">期間を選ぶと、前の同じ長さの期間と比べます。</div></div>
        <button class="btn btn-secondary btn-sm" id="report-close">閉じる</button>
      </div>
      <div class="chart-controls">
        <select class="filter-select" id="report-period" aria-label="期間">
          ${Object.entries(presets).map(([key, value]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${value.label}</option>`).join('')}
          <option value="custom">期間指定</option>
        </select>
      </div>
      <div class="chart-controls" id="report-range" hidden>
        <input type="date" class="filter-select" id="report-start" value="${custom.start}" aria-label="開始日">
        <input type="date" class="filter-select" id="report-end" value="${custom.end}" aria-label="終了日">
      </div>
      <pre class="report-preview" id="report-preview"></pre>
      <div class="share-actions">
        <button class="btn btn-primary" id="report-share-text">テキストを共有</button>
        <button class="btn btn-secondary" id="report-share-image">画像を共有</button>
      </div>
      <div class="map-status text-sm" id="report-status" aria-live="polite"></div>
    </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('report-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });

    function currentRange() {
        if (selected === 'custom') {
            const start = document.getElementById('report-start').value;
            const end = document.getElementById('report-end').value;
            return { label: '期間指定', start, end };
        }
        return presets[selected];
    }

    function refresh() {
        const range = currentRange();
        const status = document.getElementById('report-status');
        if (!range.start || !range.end || range.start > range.end) {
            document.getElementById('report-preview').textContent = '';
            status.textContent = '開始日と終了日を正しい順で選んでください。';
            return null;
        }
        status.textContent = '';
        const report = buildPeriodReport(allRecords, range);
        document.getElementById('report-preview').textContent = buildReportText(report);
        return report;
    }

    document.getElementById('report-period').addEventListener('change', event => {
        selected = event.target.value;
        document.getElementById('report-range').hidden = selected !== 'custom';
        refresh();
    });
    document.getElementById('report-start').addEventListener('change', refresh);
    document.getElementById('report-end').addEventListener('change', refresh);

    document.getElementById('report-share-text').addEventListener('click', async () => {
        const text = document.getElementById('report-preview').textContent;
        if (!text) return;
        const result = await shareText(text);
        document.getElementById('report-status').textContent = result === 'copied'
            ? '共有機能を利用できないため、文章をコピーしました。' : '';
    });
    document.getElementById('report-share-image').addEventListener('click', () => {
        const report = refresh();
        if (!report) return;
        openImageShareDialog(`レポート ${report.label}`, () => createReportImage(report));
    });

    refresh();
    return { close };
}
