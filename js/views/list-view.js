// ===== 一覧画面 =====
import * as store from '../store.js';
import { exportToCSV } from '../utils/csv-export.js';
import { parseCSV, readCSVFile } from '../utils/csv-import.js';
import { icon, weatherIcon } from '../utils/icons.js';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/** 値が入っている項目だけを { ラベル: 値 } の並びにする */
function detailRows(record) {
    const rows = [];
    const push = (label, value, unit = '') => {
        if (value === '' || value === null || value === undefined) return;
        rows.push({ label, value: String(value), unit });
    };

    push('参加人数', record.volunteerCount > 0 ? record.volunteerCount : '', ' 名');
    push('参加者', record.volunteerNames);
    push('気温', record.temperature, ' ℃');
    push('実施形態', [record.formType, record.micType, record.groupType].filter(Boolean).join(' / '));
    push('テーマ', (record.themes || []).join('・'));
    push('配布物', (record.materials || []).join('・'));
    push('声かけ数', record.approachCount, ' 人');
    push('立ち止まり', record.stopCount, ' 人');
    push('受取拒否', record.refusalCount, ' 人');
    push('受取率', record.acceptRate);
    push('新規連絡先', record.newContactCount, ' 件');
    push('寄附/カンパ', record.donationCount, ' 件');
    push('QR/URL誘導', record.qrCount, ' 件');
    push('住所', record.address);
    if (record.hasTrouble) push('トラブル', record.troubleNote || 'あり');

    return rows;
}

export async function render(container, { onEdit }) {
    const areas = await store.getUniqueAreas();
    let filterPeriod = 'all', sortBy = 'date-desc', customStart = '', customEnd = '';

    // 3-1. 複数選択用配列
    let selectedAreas = [];
    let selectedWeathers = [];
    let selectedForDelete = new Set();

    let allRecords = await store.getAll();

    function toggleSelection(array, item) {
        const idx = array.indexOf(item);
        if (idx === -1) array.push(item);
        else array.splice(idx, 1);
        renderList();
    }

    function applyFilters() {
        let filtered = allRecords;
        const now = new Date();
        if (filterPeriod === 'this-month') {
            const ym = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            filtered = filtered.filter(r => r.yearMonth === ym);
        } else if (filterPeriod === 'last-month') {
            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const ym = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            filtered = filtered.filter(r => r.yearMonth === ym);
        } else if (filterPeriod === 'custom' && customStart && customEnd) {
            filtered = filtered.filter(r => r.date >= customStart && r.date <= customEnd);
        }

        if (selectedAreas.length > 0) filtered = filtered.filter(r => selectedAreas.includes(r.area));
        if (selectedWeathers.length > 0) filtered = filtered.filter(r => selectedWeathers.includes(r.weather));

        switch (sortBy) {
            case 'date-desc': filtered.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)); break;
            case 'date-asc': filtered.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)); break;
            case 'rate-desc': filtered.sort((a, b) => (b.distributionRate || 0) - (a.distributionRate || 0)); break;
            case 'count-desc': filtered.sort((a, b) => (b.distributionCount || 0) - (a.distributionCount || 0)); break;
            case 'duration-desc': filtered.sort((a, b) => (b.duration || 0) - (a.duration || 0)); break;
        }
        return filtered;
    }

    const weatherMark = (w) => (weatherIcon(w) ? icon(weatherIcon(w), { size: 13 }) : '');

    const WEATHER_OPTS = ['晴', '曇', '雨', '雪'];

    function renderList() {
        // Render Filters
        const filtersAreaHTML = areas.length === 0 ? '' : `
            <div style="margin-bottom: 12px;">
                <div class="filter-heading">地区</div>
                <div class="tag-group">
                    ${areas.map(a => `<button type="button" class="tag filter-area-btn ${selectedAreas.includes(a) ? 'selected' : ''}" data-val="${a}">${a}</button>`).join('')}
                </div>
            </div>
        `;
        const filtersWeatherHTML = `
            <div>
                <div class="filter-heading">天候</div>
                <div class="tag-group">
                    ${WEATHER_OPTS.map(w => `<button type="button" class="tag filter-weather-btn ${selectedWeathers.includes(w) ? 'selected' : ''}" data-val="${w}">${weatherMark(w)} ${w}</button>`).join('')}
                </div>
            </div>
        `;
        document.getElementById('multi-filters-container').innerHTML = filtersAreaHTML + filtersWeatherHTML;

        // Re-attach filter events
        document.querySelectorAll('.filter-area-btn').forEach(btn => btn.addEventListener('click', () => toggleSelection(selectedAreas, btn.dataset.val)));
        document.querySelectorAll('.filter-weather-btn').forEach(btn => btn.addEventListener('click', () => toggleSelection(selectedWeathers, btn.dataset.val)));

        const filtered = applyFilters();

        // 3-2. 一括削除UI
        document.getElementById('list-results').innerHTML = filtered.length === 0 ? `
      <div class="empty-state"><div class="empty-state-icon">${icon('list', { size: 32 })}</div><div class="empty-state-text">記録がありません</div></div>
    ` : filtered.map(r => `
      <div class="list-card">
        <div class="list-card-select">
          <input type="checkbox" class="bulk-cb" data-id="${r.id}" ${selectedForDelete.has(r.id) ? 'checked' : ''} aria-label="選択">
        </div>
        <div class="list-card-content" data-id="${r.id}">
            <div class="list-card-location">${esc(r.area)} ／ ${esc(r.spot)}</div>
            <div class="list-card-date">${esc(r.date)}（${esc(r.dayOfWeek)}）${esc(r.startTime)}〜${esc(r.endTime)}${r.weather ? weatherMark(r.weather) : ''}</div>
            <div class="list-card-stats">
              <span class="stat-chip">${icon('page')}<span class="stat-value">${r.distributionCount}</span>枚</span>
              <span class="stat-chip">${icon('clock')}<span class="stat-value">${r.duration || '-'}</span>分</span>
              <span class="stat-chip">${icon('trend')}<span class="stat-value">${r.distributionRate != null ? r.distributionRate : '-'}</span>枚/分</span>
              ${r.volunteerCount > 0 ? `<span class="stat-chip">${icon('users')}<span class="stat-value">${r.volunteerCount}</span>名</span>` : ''}
            </div>
            ${(r.themes?.length > 0) ? `<div class="list-card-tags">${r.themes.map(t => `<span class="mini-tag">${esc(t)}</span>`).join('')}</div>` : ''}
            ${r.hasTrouble ? `<div class="list-card-tags"><span class="badge badge-warning">トラブルあり</span></div>` : ''}
        </div>
      </div>
    `).join('');

        document.getElementById('list-count').textContent = `${filtered.length}件`;

        // Edit entry action
        document.querySelectorAll('.list-card-content').forEach(card => card.addEventListener('click', () => {
             const record = allRecords.find(r => r.id === card.dataset.id);
             if (record) showDetailModal(record);
        }));

        // Checkbox state tracking
        document.querySelectorAll('.bulk-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) selectedForDelete.add(id);
                else selectedForDelete.delete(id);
                updateBulkActionUI();
            });
        });
        updateBulkActionUI();
    }

    function showDetailModal(record) {
        let modal = document.getElementById('detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'detail-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        // 地区と地名は同じ値でも両方そのまま出す
        const place = [record.area, record.locality].filter(Boolean);
        const rows = detailRows(record);

        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-sheet">
                <div class="modal-head">
                    <div>
                        <div class="modal-title">${esc(record.spot)}</div>
                        <div class="modal-sub">${esc(place.join('｜'))}｜${esc(record.date)}（${esc(record.dayOfWeek)}）${esc(record.startTime)}〜${esc(record.endTime)}</div>
                    </div>
                    <button id="close-modal" class="btn btn-secondary btn-sm" aria-label="閉じる">${icon('close', { size: 15 })}</button>
                </div>
                <div class="detail-grid">
                    <div><span class="detail-label">配布枚数</span><span class="detail-value">${esc(record.distributionCount)}</span><span class="detail-unit"> 枚</span></div>
                    <div><span class="detail-label">配布効率</span><span class="detail-value">${record.distributionRate ?? '-'}</span><span class="detail-unit"> 枚/分</span></div>
                    <div><span class="detail-label">活動時間</span><span class="detail-value">${record.duration ?? '-'}</span><span class="detail-unit"> 分</span></div>
                    <div><span class="detail-label">天候</span><span class="detail-value">${esc(record.weather || '-')}</span></div>
                </div>
                ${rows.length ? `
                <div class="detail-list">
                    ${rows.map(r => `
                        <div class="detail-list-row">
                            <span class="detail-label">${esc(r.label)}</span>
                            <span class="detail-list-value">${esc(r.value)}${r.unit ? `<span class="detail-unit">${esc(r.unit)}</span>` : ''}</span>
                        </div>
                    `).join('')}
                </div>` : ''}
                ${record.memo ? `<div style="margin-bottom:var(--s4);"><span class="detail-label">メモ</span><p class="text-sm" style="margin:4px 0 0; white-space:pre-wrap;">${esc(record.memo)}</p></div>` : ''}
                <div class="modal-actions">
                    <button id="modal-edit" class="btn btn-primary">${icon('edit', { size: 16 })}編集する</button>
                    <button id="modal-delete" class="btn btn-danger">${icon('trash', { size: 16 })}削除</button>
                </div>
            </div>
        `;

        modal.querySelector('#close-modal').addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
        modal.querySelector('#modal-edit').addEventListener('click', () => { modal.style.display = 'none'; onEdit(record.id); });
        modal.querySelector('#modal-delete').addEventListener('click', async () => {
            if(confirm('この記録を削除しますか？')) {
                await store.remove(record.id);
                modal.style.display = 'none';
                allRecords = await store.getAll();
                renderList();
            }
        });
    }

    function updateBulkActionUI() {
        const btnDeleteMsg = document.getElementById('btn-bulk-delete');
        if (selectedForDelete.size > 0) {
            btnDeleteMsg.style.display = 'inline-block';
            btnDeleteMsg.textContent = `選択中を削除 (${selectedForDelete.size})`;
        } else {
            btnDeleteMsg.style.display = 'none';
        }
    }

    container.innerHTML = `
    <div>
      <div class="list-toolbar" style="margin-bottom: var(--s4);">
        <h2 class="section-title" style="margin:0;">${icon('list', { size: 19 })}活動一覧</h2>
        <span class="stat-chip">${icon('user')}${store.getPoliticians().find(p => p.id === store.getCurrentPoliticianId())?.name || ''}</span>
      </div>

      <div class="filter-bar">
        <select class="filter-select" id="filter-period"><option value="all">全期間</option><option value="this-month">今月</option><option value="last-month">先月</option><option value="custom">期間指定</option></select>
        <select class="filter-select" id="filter-sort"><option value="date-desc">新しい順</option><option value="date-asc">古い順</option><option value="rate-desc">配布係数順</option><option value="count-desc">配布枚数順</option><option value="duration-desc">活動時間順</option></select>
      </div>

      <div id="custom-range" style="display:none; margin-bottom: var(--s3);">
        <div class="form-row">
          <div class="form-group"><label class="form-label">開始日</label><input type="date" class="form-input" id="filter-start" /></div>
          <div class="form-group"><label class="form-label">終了日</label><input type="date" class="form-input" id="filter-end" /></div>
        </div>
      </div>

      <!-- 3-1 Multi Selector Area -->
      <div id="multi-filters-container"></div>
      <div class="divider"></div>

      <div class="list-toolbar">
        <span id="list-count" class="badge">0件</span>
        <div class="list-toolbar-actions">
          <button class="btn btn-danger btn-sm" id="btn-bulk-delete" style="display:none;"></button>
          <button class="btn btn-danger btn-sm" id="btn-delete-all">全件削除</button>
          <button class="btn btn-secondary btn-sm" id="btn-import">${icon('upload')}取込</button>
          <button class="btn btn-secondary btn-sm" id="btn-export">${icon('download')}出力</button>
        </div>
      </div>
      <input type="file" id="csv-file-input" accept=".csv" style="display:none;" />

      <div id="list-results"></div>
    </div>
  `;

    document.getElementById('filter-period').addEventListener('change', (e) => { filterPeriod = e.target.value; document.getElementById('custom-range').style.display = filterPeriod === 'custom' ? 'block' : 'none'; renderList(); });
    document.getElementById('filter-sort').addEventListener('change', (e) => { sortBy = e.target.value; renderList(); });

    const si = document.getElementById('filter-start'), ei = document.getElementById('filter-end');
    if (si) si.addEventListener('change', () => { customStart = si.value; renderList(); });
    if (ei) ei.addEventListener('change', () => { customEnd = ei.value; renderList(); });

    document.getElementById('btn-export').addEventListener('click', () => { const f = applyFilters(); if (f.length === 0) { alert('エクスポートするデータがありません。'); return; } exportToCSV(f); });

    // 3-2 Bulk Delete
    document.getElementById('btn-bulk-delete').addEventListener('click', async () => {
        if (!confirm(`選択した ${selectedForDelete.size} 件を削除しますか？\n(対象議員: ${store.getCurrentPoliticianId()})`)) return;
        await store.bulkRemove(Array.from(selectedForDelete));
        selectedForDelete.clear();
        allRecords = await store.getAll();
        renderList();
    });

    document.getElementById('btn-delete-all').addEventListener('click', async () => {
        const filtered = applyFilters();
        if (filtered.length === 0) return;
        if (!confirm(`!!警告!!\n\n現在表示されている ${filtered.length} 件の記録をすべて削除しますか？\n対象議員: ${store.getCurrentPoliticianId()}`)) return;

        await store.bulkRemove(filtered.map(r => r.id));
        selectedForDelete.clear();
        allRecords = await store.getAll();
        renderList();
    });

    // CSVインポート
    const fileInput = document.getElementById('csv-file-input');
    document.getElementById('btn-import').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const csvText = await readCSVFile(file);
            const { records, errors } = parseCSV(csvText);

            if (records.length === 0) {
                alert('インポートできるデータがありません。\n' + (errors.length > 0 ? errors.join('\n') : ''));
                return;
            }
            const confirmMsg = `${records.length}件のデータをインポートします。` +
                (errors.length > 0 ? `\n\n${errors.length}件のエラー:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...他${errors.length - 5}件` : ''}` : '') +
                '\n\nよろしいですか？';
            if (!confirm(confirmMsg)) return;

            const count = await store.bulkImport(records);
            alert(`${count}件のデータを取り込みました。`);
            allRecords = await store.getAll();
            renderList();
        } catch (err) {
            alert('CSVファイルの読み込みに失敗しました。\n' + err.message);
        }
    });

    renderList();
}
