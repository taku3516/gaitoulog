// ===== 一覧画面 =====
import * as store from '../store.js';
import { exportToCSV } from '../utils/csv-export.js';
import { parseCSV, readCSVFile } from '../utils/csv-import.js';

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

    function getWeatherEmoji(w) { return { '晴': '☀️', '曇': '☁️', '雨': '🌧️', '雪': '❄️' }[w] || ''; }

    const WEATHER_OPTS = ['晴', '曇', '雨', '雪'];

    function renderList() {
        // Render Filters
        const filtersAreaHTML = areas.length === 0 ? '' : `
            <div style="margin-bottom: 8px;">
                <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: 4px;">エリア絞り込み（複数選択）</div>
                <div class="tag-group">
                    ${areas.map(a => `<button type="button" class="tag filter-area-btn ${selectedAreas.includes(a) ? 'selected' : ''}" data-val="${a}">${a}</button>`).join('')}
                </div>
            </div>
        `;
        const filtersWeatherHTML = `
            <div style="margin-bottom: 8px;">
                <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: 4px;">天候絞り込み（複数選択）</div>
                <div class="tag-group">
                    ${WEATHER_OPTS.map(w => `<button type="button" class="tag filter-weather-btn ${selectedWeathers.includes(w) ? 'selected' : ''}" data-val="${w}">${getWeatherEmoji(w)} ${w}</button>`).join('')}
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
      <div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">記録がありません</div></div>
    ` : filtered.map(r => `
      <div class="list-card" style="display: flex; align-items: stretch; padding: 0;">
        <div style="padding: 16px 12px; display: flex; align-items: center; border-right: 1px solid var(--border-color); background: var(--bg-input);">
          <input type="checkbox" class="bulk-cb" data-id="${r.id}" ${selectedForDelete.has(r.id) ? 'checked' : ''} style="width:20px; height:20px; accent-color: var(--accent-primary);">
        </div>
        <div class="list-card-content" data-id="${r.id}" style="padding: 16px; flex: 1;">
            <div class="list-card-top"><div>
            <div class="list-card-location">${r.area} / ${r.spot}</div>
            <div class="list-card-date">${r.date}（${r.dayOfWeek}） ${r.startTime}〜${r.endTime} ${r.weather ? getWeatherEmoji(r.weather) : ''}</div>
            </div></div>
            <div class="list-card-stats">
            <div class="stat-chip">📄 <span class="stat-value">${r.distributionCount}</span>枚</div>
            <div class="stat-chip">⏱️ <span class="stat-value">${r.duration || '-'}</span>分</div>
            <div class="stat-chip">📈 <span class="stat-value">${r.distributionRate != null ? r.distributionRate : '-'}</span>枚/分</div>
            ${r.volunteerCount > 0 ? `<div class="stat-chip">👥 <span class="stat-value">${r.volunteerCount}</span>名</div>` : ''}
            </div>
            ${(r.themes?.length > 0) ? `<div class="list-card-tags">${r.themes.map(t => `<span class="mini-tag">${t}</span>`).join('')}</div>` : ''}
            ${r.hasTrouble ? '<div style="margin-top:6px;"><span class="badge badge-warning">⚠️ トラブル</span></div>' : ''}
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
            modal.style = 'position:fixed; top:0; left:0; right:0; bottom:0; z-index:1000; background:rgba(0,0,0,0.5); display:flex; align-items:flex-end;';
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div style="background:var(--bg-card); width:100%; border-radius:var(--radius-lg) var(--radius-lg) 0 0; padding:var(--spacing-lg); padding-bottom:calc(var(--spacing-xl) + var(--safe-bottom)); animation: slideUp 0.3s ease;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--spacing-md);">
                    <div>
                        <div style="font-size:var(--font-size-lg); font-weight:700;">${record.spot}</div>
                        <div style="font-size:var(--font-size-sm); color:var(--text-muted);">${record.date} (${record.dayOfWeek})</div>
                    </div>
                    <button id="close-modal" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
                </div>
                <div style="background:var(--bg-input); border-radius:var(--radius-md); padding:var(--spacing-md); margin-bottom:var(--spacing-lg); display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);">
                    <div><span style="font-size:var(--font-size-xs); color:var(--text-muted);">配布枚数</span><br><span style="font-weight:700;">${record.distributionCount}</span> 枚</div>
                    <div><span style="font-size:var(--font-size-xs); color:var(--text-muted);">配布効率</span><br><span style="font-weight:700;">${record.distributionRate || '-'}</span> 枚/分</div>
                    <div><span style="font-size:var(--font-size-xs); color:var(--text-muted);">活動時間</span><br><span style="font-weight:700;">${record.duration || '-'}</span> 分</div>
                    <div><span style="font-size:var(--font-size-xs); color:var(--text-muted);">天候</span><br><span style="font-weight:700;">${record.weather || '-'}</span></div>
                </div>
                ${record.memo ? `<div style="margin-bottom:var(--spacing-lg);"><span style="font-size:var(--font-size-xs); color:var(--text-muted);">メモ</span><br><p style="font-size:var(--font-size-sm);">${record.memo}</p></div>` : ''}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--spacing-md);">
                    <button id="modal-edit" class="btn btn-primary">✏️ 編集する</button>
                    <button id="modal-delete" class="btn btn-secondary" style="color:var(--accent-error); border-color:var(--accent-error);">🗑️ 削除</button>
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
    <div class="view-container">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="section-title" style="margin-bottom:0; border:none; padding:0;">📋 活動一覧</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">
           👤 ${store.getPoliticians().find(p => p.id === store.getCurrentPoliticianId())?.name || ''}
        </div>
      </div>
      <hr style="border:0; border-top:2px solid var(--border-color); margin: 8px 0 16px 0;">

      <div class="filter-bar" style="align-items:flex-start;">
        <select class="filter-select" id="filter-period"><option value="all">全期間</option><option value="this-month">今月</option><option value="last-month">先月</option><option value="custom">期間指定</option></select>
        <select class="filter-select" id="filter-sort"><option value="date-desc">新しい順</option><option value="date-asc">古い順</option><option value="rate-desc">配布係数順</option><option value="count-desc">配布枚数順</option><option value="duration-desc">活動時間順</option></select>
      </div>

      <div id="custom-range" style="display:none; margin-bottom: var(--spacing-md);">
        <div class="form-row">
          <div class="form-group"><label class="form-label">開始日</label><input type="date" class="form-input" id="filter-start" /></div>
          <div class="form-group"><label class="form-label">終了日</label><input type="date" class="form-input" id="filter-end" /></div>
        </div>
      </div>

      <!-- 3-1 Multi Selector Area -->
      <div id="multi-filters-container" style="margin-bottom: var(--spacing-md); padding-bottom: 12px; border-bottom: 1px solid var(--border-color);"></div>

      <div style="display:flex;flex-wrap:wrap; gap:8px; justify-content:space-between;align-items:center;margin-bottom:var(--spacing-md);">
        <div><span id="list-count" class="badge">0件</span></div>
        <div style="display:flex;gap:var(--spacing-sm); flex-wrap:wrap;">
          <button class="btn btn-danger btn-sm" id="btn-bulk-delete" style="display:none;"></button>
          <button class="btn btn-danger btn-sm" id="btn-delete-all" style="background:transparent; color:var(--accent-error); border:1px solid var(--accent-error);">全件削除</button>
          <button class="btn btn-secondary btn-sm" id="btn-import">📤 取込</button>
          <button class="btn btn-secondary btn-sm" id="btn-export">📥 出力</button>
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
                (errors.length > 0 ? `\n\n⚠️ ${errors.length}件のエラー:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...他${errors.length - 5}件` : ''}` : '') +
                '\n\nよろしいですか？';
            if (!confirm(confirmMsg)) return;

            const count = await store.bulkImport(records);
            alert(`✅ ${count}件のデータをインポートしました。`);
            allRecords = await store.getAll();
            renderList();
        } catch (err) {
            alert('CSVファイルの読み込みに失敗しました。\n' + err.message);
        }
    });

    renderList();
}
