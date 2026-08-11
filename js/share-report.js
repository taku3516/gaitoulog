// ===== 活動実績のテキスト・画像共有 =====

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
    ctx.fillStyle = '#f6f6f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1f4d63';
    ctx.fillRect(0, 0, canvas.width, 18);
    ctx.fillStyle = '#1a1c1b';
    ctx.font = '700 58px "Noto Sans JP", sans-serif';
    ctx.fillText('街頭活動実績', 70, 120);
    ctx.fillStyle = '#55595a';
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
        ctx.fillStyle = '#ffffff';
        roundedRect(ctx, x, y, 435, 138, 18);
        ctx.fillStyle = '#55595a';
        ctx.font = '500 25px "Noto Sans JP", sans-serif';
        ctx.fillText(label, x + 28, y + 43);
        ctx.fillStyle = '#1f4d63';
        ctx.font = '700 43px "Noto Sans JP", sans-serif';
        ctx.fillText(value, x + 28, y + 102);
    });

    ctx.fillStyle = '#1a1c1b';
    ctx.font = '700 34px "Noto Sans JP", sans-serif';
    ctx.fillText('場所別実績', 70, 625);
    const top = summary.locations.slice(0, 6);
    const max = Math.max(...top.map(row => row.distribution), 1);
    top.forEach((row, index) => {
        const y = 685 + index * 92;
        ctx.fillStyle = '#1a1c1b';
        ctx.font = '600 27px "Noto Sans JP", sans-serif';
        const name = row.name.length > 25 ? `${row.name.slice(0, 24)}…` : row.name;
        ctx.fillText(name, 70, y);
        ctx.fillStyle = '#55595a';
        ctx.font = '400 22px "Noto Sans JP", sans-serif';
        ctx.fillText(`${row.count}回・${formatDuration(row.duration)}・${row.distribution.toLocaleString()}枚`, 70, y + 33);
        ctx.fillStyle = '#e0e0dd';
        ctx.fillRect(620, y - 25, 360, 26);
        ctx.fillStyle = '#1f4d63';
        ctx.fillRect(620, y - 25, 360 * (row.distribution / max), 26);
    });
    ctx.fillStyle = '#8a8f90';
    ctx.font = '400 20px "Noto Sans JP", sans-serif';
    ctx.fillText(`作成日 ${new Date().toLocaleDateString('ja-JP')}`, 70, 1300);

    return new Promise((resolve, reject) => canvas.toBlob(blob => (
        blob ? resolve(blob) : reject(new Error('画像を作成できませんでした。'))
    ), 'image/png'));
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

export async function openChartShareDialog(sourceCanvas, title) {
    if (!sourceCanvas) return;
    const width = 1080;
    const ratio = sourceCanvas.height / Math.max(sourceCanvas.width, 1);
    const chartHeight = Math.min(820, Math.max(420, Math.round(width * ratio)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = chartHeight + 190;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f4d63';
    ctx.fillRect(0, 0, canvas.width, 14);
    ctx.fillStyle = '#1a1c1b';
    ctx.font = '700 46px "Noto Sans JP", sans-serif';
    ctx.fillText(title, 54, 82);
    ctx.drawImage(sourceCanvas, 40, 125, width - 80, chartHeight);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => (
        value ? resolve(value) : reject(new Error('グラフ画像を作成できませんでした。'))
    ), 'image/png'));
    const previewUrl = URL.createObjectURL(blob);

    document.getElementById('share-chart-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'share-chart-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-sheet share-modal-sheet">
      <div class="modal-head"><div><div class="modal-title">${esc(title)}を共有</div><div class="modal-sub">画像を確認してから共有できます。</div></div><button class="btn btn-secondary btn-sm" id="share-chart-close">閉じる</button></div>
      <img class="share-chart-preview" src="${previewUrl}" alt="${esc(title)}の共有画像">
      <button class="btn btn-primary btn-full" id="share-chart-button">この画像を共有</button>
      <div class="map-status text-sm" id="share-chart-status" aria-live="polite"></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => { URL.revokeObjectURL(previewUrl); modal.remove(); };
    document.getElementById('share-chart-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.getElementById('share-chart-button').addEventListener('click', async () => {
        const result = await shareImage(blob, title);
        document.getElementById('share-chart-status').textContent = result === 'downloaded' ? '画像をダウンロードしました。' : '';
    });
}
