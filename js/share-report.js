// ===== 活動実績のテキスト・画像共有 =====
import { COLOR, SERIES, PRIMITIVE } from './theme.js';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

function formatDuration(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}時間${minutes ? `${minutes}分` : ''}` : `${minutes}分`;
}

export function summarizeRecords(records) {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const totalDuration = sorted.reduce((sum, record) => sum + (Number(record.duration) || 0), 0);
    const totalDistribution = sorted.reduce((sum, record) => sum + (Number(record.distributionCount) || 0), 0);
    const locations = new Map();
    for (const record of sorted) {
        const key = `${record.area} ／ ${record.spot}`;
        const row = locations.get(key) || { name: key, count: 0, duration: 0, distribution: 0 };
        row.count += 1;
        row.duration += Number(record.duration) || 0;
        row.distribution += Number(record.distributionCount) || 0;
        locations.set(key, row);
    }
    return {
        startDate: sorted[0]?.date || '',
        endDate: sorted.at(-1)?.date || '',
        count: sorted.length,
        totalDuration,
        totalDistribution,
        averageRate: totalDuration ? (totalDistribution / totalDuration).toFixed(2) : '-',
        locations: [...locations.values()].sort((a, b) => b.distribution - a.distribution),
    };
}

export function buildReportText(records) {
    const summary = summarizeRecords(records);
    const range = summary.startDate === summary.endDate ? summary.startDate : `${summary.startDate}〜${summary.endDate}`;
    const locationLines = summary.locations.slice(0, 10).map(row => (
        `・${row.name}：${row.count}回、${formatDuration(row.duration)}、${row.distribution.toLocaleString()}枚`
    ));
    return [
        '【街頭活動実績】',
        '',
        `期間：${range}`,
        `活動回数：${summary.count}回`,
        `合計活動時間：${formatDuration(summary.totalDuration)}`,
        `総配布枚数：${summary.totalDistribution.toLocaleString()}枚`,
        '',
        '場所別実績',
        ...locationLines,
    ].join('\n');
}

// ===== 画像生成の共通部品 =====
// 表・ランキング・地図など、Canvasを持たないダッシュボードも同じ体裁の画像にする。
const IMG = {
    bg: COLOR.surface,
    bar: SERIES.primary,
    ink: COLOR.ink,
    muted: COLOR.inkSecondary,
    faint: COLOR.inkMuted,
    line: COLOR.line,
    sunken: COLOR.sunken,
    accent: COLOR.accent,
};
const IMG_PAD = 54;
const IMG_MIN_WIDTH = 1080;
const IMG_MAX_WIDTH = 2200;

let measureContext = null;

function measureCtx() {
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    return measureContext;
}

function imgFont(weight, size) {
    return `${weight} ${size}px "Noto Sans JP", sans-serif`;
}

function fitText(ctx, text, maxWidth) {
    const value = String(text ?? '');
    if (maxWidth <= 0 || ctx.measureText(value).width <= maxWidth) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
}

function canvasToBlob(canvas, message = '画像を作成できませんでした。') {
    return new Promise((resolve, reject) => canvas.toBlob(blob => (
        blob ? resolve(blob) : reject(new Error(message))
    ), 'image/png'));
}

function headerHeight(subtitle) {
    return subtitle ? 156 : 120;
}

// 注記は日本語で折り返し位置が取れないため、幅を測りながら1文字ずつ詰める
function wrapText(ctx, text, maxWidth, maxLines = 2) {
    const value = String(text ?? '');
    if (!value) return [];
    const lines = [];
    let current = '';
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (current && ctx.measureText(current + char).width > maxWidth) {
            if (lines.length === maxLines - 1) {
                // 最終行は残り全部を入れて、入りきらない分だけ省略する
                lines.push(fitText(ctx, value.slice(index - current.length), maxWidth));
                return lines;
            }
            lines.push(current);
            current = char;
        } else {
            current += char;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * 見出し・注記付きの共有画像を作る汎用ヘルパー。
 * draw(ctx, x, y, width, height) に本文の描画を任せる。
 */
export async function createFramedImage({ title, subtitle = '', note = '', width, height, draw }) {
    await document.fonts?.ready;
    const top = headerHeight(subtitle);
    const canvasWidth = Math.min(IMG_MAX_WIDTH, Math.max(IMG_MIN_WIDTH, Math.ceil(width) + IMG_PAD * 2));
    const gauge = measureCtx();
    gauge.font = imgFont(400, 22);
    const noteLines = wrapText(gauge, note, canvasWidth - IMG_PAD * 2, 2);
    const bottom = 64 + noteLines.length * 30;
    // 本文が上限幅に収まらないときは縮小して描く（切れた画像を共有しないため）
    const scale = Math.min(1, (canvasWidth - IMG_PAD * 2) / width);
    const drawWidth = width * scale;
    const drawHeight = height * scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = Math.ceil(top + drawHeight + bottom);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = IMG.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = IMG.bar;
    ctx.fillRect(0, 0, canvas.width, 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IMG.ink;
    ctx.font = imgFont(700, 46);
    ctx.fillText(fitText(ctx, title, canvas.width - IMG_PAD * 2), IMG_PAD, 86);
    if (subtitle) {
        ctx.fillStyle = IMG.muted;
        ctx.font = imgFont(400, 24);
        ctx.fillText(fitText(ctx, subtitle, canvas.width - IMG_PAD * 2), IMG_PAD, 126);
    }

    ctx.save();
    ctx.translate(Math.round((canvas.width - drawWidth) / 2), top);
    ctx.scale(scale, scale);
    await draw(ctx, 0, 0, width, height);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IMG.muted;
    ctx.font = imgFont(400, 22);
    noteLines.forEach((line, index) => {
        ctx.fillText(line, IMG_PAD, canvas.height - 58 - (noteLines.length - 1 - index) * 30);
    });
    ctx.fillStyle = IMG.faint;
    ctx.font = imgFont(400, 20);
    ctx.fillText(`作成日 ${new Date().toLocaleDateString('ja-JP')}`, IMG_PAD, canvas.height - 24);

    return canvasToBlob(canvas);
}

function normalizeCell(cell) {
    if (cell && typeof cell === 'object') {
        return {
            text: String(cell.text ?? ''),
            bg: cell.bg || '',
            color: cell.color || IMG.ink,
            bold: Boolean(cell.bold),
            align: cell.align || '',
        };
    }
    return { text: String(cell ?? ''), bg: '', color: IMG.ink, bold: false, align: '' };
}

function drawCellText(ctx, text, x, width, centerY, align) {
    const inner = width - 32;
    if (align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(fitText(ctx, text, inner), x + width - 16, centerY);
    } else if (align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(fitText(ctx, text, inner), x + width / 2, centerY);
    } else {
        ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, text, inner), x + 16, centerY);
    }
}

/**
 * 表形式のダッシュボード（サマリー・クロス集計・ヒートマップ）を画像にする。
 * columns: [{ label, align, min, max }] / rows: [[cell, ...]]
 * cell は文字列、または { text, bg, color, bold, align }。
 */
export async function createTableImage({ title, subtitle = '', columns, rows, note = '', maxRows = 30 }) {
    await document.fonts?.ready;
    const gauge = measureCtx();
    const headFont = imgFont(700, 24);
    const bodyFont = imgFont(400, 24);
    const shown = rows.slice(0, maxRows);
    const omitted = rows.length - shown.length;

    const widths = columns.map((column, index) => {
        gauge.font = headFont;
        let width = gauge.measureText(String(column.label ?? '')).width;
        gauge.font = bodyFont;
        for (const row of shown) width = Math.max(width, gauge.measureText(normalizeCell(row[index]).text).width);
        return Math.max(column.min ?? 96, Math.min(Math.ceil(width) + 34, column.max ?? 380));
    });
    // 列が多いときは広い列から詰めて、画像が横に伸びすぎないようにする
    const available = IMG_MAX_WIDTH - IMG_PAD * 2;
    let total = widths.reduce((sum, width) => sum + width, 0);
    while (total > available) {
        const widest = widths.indexOf(Math.max(...widths));
        if (widths[widest] <= 110) break;
        widths[widest] -= 20;
        total -= 20;
    }

    const rowHeight = 52;
    const headHeight = 60;
    const notes = [note, omitted > 0 ? `ほか${omitted}行は省略しています。` : ''].filter(Boolean).join('　');

    return createFramedImage({
        title,
        subtitle,
        note: notes,
        width: total,
        height: headHeight + shown.length * rowHeight,
        draw(ctx, x, y) {
            ctx.textBaseline = 'middle';
            let cursor = x;
            columns.forEach((column, index) => {
                ctx.fillStyle = IMG.sunken;
                ctx.fillRect(cursor, y, widths[index], headHeight);
                ctx.fillStyle = IMG.muted;
                ctx.font = headFont;
                drawCellText(ctx, String(column.label ?? ''), cursor, widths[index], y + headHeight / 2, column.align);
                cursor += widths[index];
            });
            ctx.fillStyle = IMG.accent;
            ctx.fillRect(x, y + headHeight - 3, total, 3);

            shown.forEach((row, rowIndex) => {
                const rowY = y + headHeight + rowIndex * rowHeight;
                cursor = x;
                columns.forEach((column, index) => {
                    const cell = normalizeCell(row[index]);
                    if (cell.bg) {
                        ctx.fillStyle = cell.bg;
                        ctx.fillRect(cursor, rowY, widths[index], rowHeight);
                    }
                    ctx.fillStyle = cell.color;
                    ctx.font = imgFont(cell.bold ? 700 : 400, 24);
                    drawCellText(ctx, cell.text, cursor, widths[index], rowY + rowHeight / 2, cell.align || column.align);
                    cursor += widths[index];
                });
                ctx.fillStyle = IMG.line;
                ctx.fillRect(x, rowY + rowHeight - 1, total, 1);
            });
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
        },
    });
}

// 上位3件は金・銀・銅ではなく、主色の濃さで差をつける。
// 順位は順序のある情報なので、色相を変えると順序が読めなくなる。
// 背景の濃さに応じて数字の色を反転させ、どの順位でも文字を読めるようにする。
const RANK_STYLES = [
    { bg: PRIMITIVE.blue900, ink: COLOR.inkInverse },
    { bg: PRIMITIVE.blue700, ink: COLOR.inkInverse },
    { bg: PRIMITIVE.blue200, ink: COLOR.ink },
];

/**
 * ランキング表示のダッシュボードを画像にする。
 * items: [{ name, primary, secondary }]
 */
export async function createRankingImage({ title, subtitle = '', items, note = '', maxItems = 12 }) {
    const shown = items.slice(0, maxItems);
    const omitted = items.length - shown.length;
    const rowHeight = 96;
    const notes = [note, omitted > 0 ? `ほか${omitted}件は省略しています。` : ''].filter(Boolean).join('　');

    return createFramedImage({
        title,
        subtitle,
        note: notes,
        width: IMG_MIN_WIDTH - IMG_PAD * 2,
        height: Math.max(rowHeight, shown.length * rowHeight),
        draw(ctx, x, y, width) {
            shown.forEach((item, index) => {
                const rowY = y + index * rowHeight;
                const rank = RANK_STYLES[index] || { bg: IMG.sunken, ink: IMG.muted };
                ctx.beginPath();
                ctx.fillStyle = rank.bg;
                ctx.arc(x + 30, rowY + 44, 27, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = rank.ink;
                ctx.font = imgFont(700, 26);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(index + 1), x + 30, rowY + 45);

                ctx.textAlign = 'left';
                ctx.fillStyle = IMG.ink;
                ctx.font = imgFont(600, 28);
                ctx.fillText(fitText(ctx, item.name, width - 96), x + 80, rowY + 32);
                ctx.fillStyle = IMG.muted;
                ctx.font = imgFont(400, 23);
                ctx.fillText(fitText(ctx, item.secondary || '', width - 96), x + 80, rowY + 68);

                if (item.primary) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = IMG.accent;
                    ctx.font = imgFont(700, 30);
                    ctx.fillText(item.primary, x + width, rowY + 46);
                    ctx.textAlign = 'left';
                }
                ctx.fillStyle = IMG.line;
                ctx.fillRect(x, rowY + rowHeight - 1, width, 1);
            });
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
        },
    });
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
}

export async function createReportImage(records) {
    await document.fonts?.ready;
    const summary = summarizeRecords(records);
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = COLOR.canvas;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(0, 0, canvas.width, 18);
    ctx.fillStyle = COLOR.ink;
    ctx.font = '700 58px "Noto Sans JP", sans-serif';
    ctx.fillText('街頭活動実績', 70, 120);
    ctx.fillStyle = COLOR.inkSecondary;
    ctx.font = '400 28px "Noto Sans JP", sans-serif';
    const range = summary.startDate === summary.endDate ? summary.startDate : `${summary.startDate} 〜 ${summary.endDate}`;
    ctx.fillText(range, 70, 170);

    const cards = [
        ['活動回数', `${summary.count}回`],
        ['合計時間', formatDuration(summary.totalDuration)],
        ['総配布枚数', `${summary.totalDistribution.toLocaleString()}枚`],
        ['平均配布係数', `${summary.averageRate}枚/分`],
    ];
    cards.forEach(([label, value], index) => {
        const x = 70 + (index % 2) * 475;
        const y = 230 + Math.floor(index / 2) * 170;
        ctx.fillStyle = COLOR.surface;
        roundedRect(ctx, x, y, 435, 138, 18);
        ctx.fillStyle = COLOR.inkSecondary;
        ctx.font = '500 25px "Noto Sans JP", sans-serif';
        ctx.fillText(label, x + 28, y + 43);
        ctx.fillStyle = COLOR.accent;
        ctx.font = '700 43px "Noto Sans JP", sans-serif';
        ctx.fillText(value, x + 28, y + 102);
    });

    ctx.fillStyle = COLOR.ink;
    ctx.font = '700 34px "Noto Sans JP", sans-serif';
    ctx.fillText('場所別実績', 70, 625);
    const top = summary.locations.slice(0, 6);
    const max = Math.max(...top.map(row => row.distribution), 1);
    top.forEach((row, index) => {
        const y = 685 + index * 92;
        ctx.fillStyle = COLOR.ink;
        ctx.font = '600 27px "Noto Sans JP", sans-serif';
        const name = row.name.length > 25 ? `${row.name.slice(0, 24)}…` : row.name;
        ctx.fillText(name, 70, y);
        ctx.fillStyle = COLOR.inkSecondary;
        ctx.font = '400 22px "Noto Sans JP", sans-serif';
        ctx.fillText(`${row.count}回・${formatDuration(row.duration)}・${row.distribution.toLocaleString()}枚`, 70, y + 33);
        ctx.fillStyle = COLOR.line;
        ctx.fillRect(620, y - 25, 360, 26);
        ctx.fillStyle = COLOR.accent;
        ctx.fillRect(620, y - 25, 360 * (row.distribution / max), 26);
    });
    ctx.fillStyle = COLOR.inkMuted;
    ctx.font = '400 20px "Noto Sans JP", sans-serif';
    ctx.fillText(`作成日 ${new Date().toLocaleDateString('ja-JP')}`, 70, 1300);

    return canvasToBlob(canvas);
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

export async function shareText(text) {
    if (navigator.share) {
        try {
            await navigator.share({ title: '街頭活動実績', text });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled';
        }
    }
    await copyText(text);
    return 'copied';
}

export async function shareImage(blob, text = '') {
    const file = new File([blob], `街頭活動実績_${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ title: '街頭活動実績', text, files: [file] });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled';
        }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
}

export function openShareDialog(records) {
    if (!records?.length) return;
    document.getElementById('share-report-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'share-report-modal';
    modal.className = 'modal-overlay';
    const initialText = buildReportText(records);
    modal.innerHTML = `<div class="modal-sheet share-modal-sheet">
      <div class="modal-head"><div><div class="modal-title">活動実績を共有</div><div class="modal-sub">共有前に文章を編集できます。</div></div><button class="btn btn-secondary btn-sm" id="share-close">閉じる</button></div>
      <textarea class="form-textarea share-preview" id="share-text" rows="12">${esc(initialText)}</textarea>
      <div class="share-actions">
        <button class="btn btn-primary" id="share-text-button">テキストを共有</button>
        <button class="btn btn-secondary" id="share-image-button">画像を共有</button>
      </div>
      <div class="map-status text-sm" id="share-status" aria-live="polite"></div>
    </div>`;
    document.body.appendChild(modal);
    const imagePromise = createReportImage(records);
    const close = () => modal.remove();
    document.getElementById('share-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.getElementById('share-text-button').addEventListener('click', async () => {
        const result = await shareText(document.getElementById('share-text').value);
        document.getElementById('share-status').textContent = result === 'copied' ? '共有機能を利用できないため、文章をコピーしました。' : '';
    });
    document.getElementById('share-image-button').addEventListener('click', async () => {
        const button = document.getElementById('share-image-button');
        button.disabled = true;
        try {
            const result = await shareImage(await imagePromise, document.getElementById('share-text').value);
            document.getElementById('share-status').textContent = result === 'downloaded' ? '画像をダウンロードしました。LINEなどへ添付してください。' : '';
        } catch (error) {
            document.getElementById('share-status').textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
}

/** Chart.js のCanvasを見出し付きの共有画像にする。 */
export function createChartImage(sourceCanvas, title, { subtitle = '', note = '' } = {}) {
    if (!sourceCanvas) return Promise.reject(new Error('グラフを読み込めていないため画像を作成できません。'));
    const width = IMG_MIN_WIDTH - IMG_PAD * 2;
    const ratio = sourceCanvas.height / Math.max(sourceCanvas.width, 1);
    const height = Math.min(820, Math.max(420, Math.round(width * ratio)));
    return createFramedImage({
        title,
        subtitle,
        note,
        width,
        height,
        draw(ctx, x, y) {
            ctx.drawImage(sourceCanvas, x, y, width, height);
        },
    });
}

/** 複数のCanvasを縦に並べて1枚の共有画像にする。 */
export function createChartsImage(charts, title, { subtitle = '', note = '' } = {}) {
    const items = (charts || []).filter(item => item?.canvas);
    if (!items.length) return Promise.reject(new Error('グラフを読み込めていないため画像を作成できません。'));
    const width = IMG_MIN_WIDTH - IMG_PAD * 2;
    const captionHeight = 44;
    const gap = 36;
    const sized = items.map(item => {
        const ratio = item.canvas.height / Math.max(item.canvas.width, 1);
        return { ...item, height: Math.min(520, Math.max(300, Math.round(width * ratio))) };
    });
    const height = sized.reduce((sum, item) => sum + captionHeight + item.height, 0) + gap * (sized.length - 1);

    return createFramedImage({
        title,
        subtitle,
        note,
        width,
        height,
        draw(ctx, x, y) {
            let cursor = y;
            for (const item of sized) {
                if (item.caption) {
                    ctx.fillStyle = IMG.ink;
                    ctx.font = imgFont(600, 28);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(fitText(ctx, item.caption, width), x, cursor + 30);
                }
                cursor += captionHeight;
                ctx.drawImage(item.canvas, x, cursor, width, item.height);
                cursor += item.height + gap;
            }
        },
    });
}

/**
 * 画像を作ってからプレビュー付きで共有するダイアログ。
 * createBlob は Promise<Blob> を返す関数。
 */
export function openImageShareDialog(title, createBlob) {
    document.getElementById('share-chart-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'share-chart-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-sheet share-modal-sheet">
      <div class="modal-head"><div><div class="modal-title">${esc(title)}を共有</div><div class="modal-sub">画像を確認してから共有できます。</div></div><button class="btn btn-secondary btn-sm" id="share-chart-close">閉じる</button></div>
      <img class="share-chart-preview" id="share-chart-preview" alt="${esc(title)}の共有画像" hidden>
      <button class="btn btn-primary btn-full" id="share-chart-button" disabled>この画像を共有</button>
      <div class="map-status text-sm" id="share-chart-status" aria-live="polite">画像を作成しています…</div>
    </div>`;
    document.body.appendChild(modal);

    let previewUrl = '';
    const close = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); modal.remove(); };
    document.getElementById('share-chart-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });

    const status = () => document.getElementById('share-chart-status');
    return Promise.resolve()
        .then(createBlob)
        .then(blob => {
            if (!modal.isConnected) return;
            previewUrl = URL.createObjectURL(blob);
            const preview = document.getElementById('share-chart-preview');
            preview.src = previewUrl;
            preview.hidden = false;
            status().textContent = '';
            const button = document.getElementById('share-chart-button');
            button.disabled = false;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    const result = await shareImage(blob, title);
                    status().textContent = result === 'downloaded' ? '画像をダウンロードしました。' : '';
                } finally {
                    button.disabled = false;
                }
            });
        })
        .catch(error => {
            if (modal.isConnected) status().textContent = error?.message || '画像を作成できませんでした。';
        });
}
