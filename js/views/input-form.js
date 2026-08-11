// ===== 入力画面（品川区カスタマイズ版） =====
import * as store from '../store.js';
import { validateRecord } from '../validation.js';
import { icon } from '../utils/icons.js';
import { LOCATION_CATALOG, findLocationBySpot } from '../location-catalog.js';
import { parseActivityMemo } from '../memo-parser.js';
import * as spotStore from '../spot-store.js';
import * as activityTimer from '../activity-timer.js';
import { openMapPicker } from '../map-picker.js';

const THEME_OPTIONS = ['子育て', '防災', '福祉', '交通', '教育', '財政', 'まちづくり'];
const WEATHER_OPTIONS = ['晴', '曇', '雨', '雪'];
const FORM_TYPES = ['定点', '流し'];
const MIC_TYPES = ['マイク有', 'マイク無'];
const GROUP_TYPES = ['単独', '複数'];

// 固定地区 (保存データでは互換性のため area キーを継続使用)
const FIXED_AREAS = ['品川', '大崎', '荏原', '大井', '八潮'];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

let editingId = null;
let allRecordsCache = [];

export function setEditingId(id) { editingId = id; }

export async function render(container, { onSaved }) {
    const record = editingId ? await store.getById(editingId) : null;
    const isEdit = !!record;
    
    // Fetch async data
    const recentLocations = await store.getRecentLocations(5);
    const uniqueSpots = await store.getUniqueSpots();
    const uniqueLocalities = await store.getUniqueLocalities();
    // 固定地区 + 取込済みデータの地区（CSVの地区が固定リストに無くても編集できるように）
    const areaOptions = [...new Set([...FIXED_AREAS, ...await store.getUniqueAreas()])];
    const recentThemes = await store.getRecentThemes();
    const recentMaterials = await store.getRecentMaterials(); // (2-3) 過去入力ベース
    allRecordsCache = await store.getAll();
    const allSpots = spotStore.getAllSpots();
    const activeTimer = activityTimer.getActiveTimer();
    const currentPoliticianId = store.getCurrentPoliticianId();
    const ownTimer = activeTimer?.politicianId === currentPoliticianId ? activeTimer : null;

    // テーマタグ (2-4)
    const ALL_THEMES = [...new Set([...THEME_OPTIONS, ...recentThemes])];

    // 表示用の場所リスト: 最近使った場所 + プリセット（重複除去）
    const locationTags = [];
    const seen = new Set();
    for (const loc of [...recentLocations, ...allSpots]) {
        const key = `${loc.area}|${loc.spot}`;
        if (!seen.has(key)) {
            seen.add(key);
            const master = loc.id ? loc : spotStore.findSpot(loc.area, loc.locality, loc.spot);
            locationTags.push({ ...loc, id: master?.id || '' });
        }
        if (locationTags.length >= 8) break;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowH = new Date().getHours().toString().padStart(2, '0');
    const nowM = (Math.floor(new Date().getMinutes() / 15) * 15).toString().padStart(2, '0');
    const timerStart = ownTimer ? activityTimer.localDateTimeParts(ownTimer.startedAt) : null;
    const timerEnd = ownTimer?.endedAt ? activityTimer.localDateTimeParts(ownTimer.endedAt) : null;
    const initialSpotId = record?.spotId || ownTimer?.spotId || '';

    container.innerHTML = `
    <div>
      <h2 class="section-title">${icon('edit', { size: 19 })}${isEdit ? '記録を編集' : '新しい記録'}</h2>
      <form id="activity-form" novalidate>
        ${isEdit ? '' : renderTimerCard(activeTimer, ownTimer)}
        ${isEdit ? '' : `
        <div class="card memo-import-card">
          <div class="card-title">${icon('page')}メモから入力</div>
          <p class="section-note memo-import-note">実施日、時間、スポット、配布枚数を含むメモを貼り付けてください。内容を確認してから保存できます。</p>
          <textarea class="form-textarea" id="f-importMemo" rows="4" placeholder="例：8/11 7:30〜9:00 大井町駅デッキ上 150枚"></textarea>
          <button type="button" class="btn btn-secondary btn-full" id="btn-apply-memo">メモを入力欄に反映</button>
          <div class="memo-import-result" id="memo-import-result" role="status" aria-live="polite"></div>
        </div>`}
        <div class="card">
          <div class="card-title" style="margin-bottom: var(--s4);">${icon('pinned')}基本情報</div>
          <div class="form-group">
            <label class="form-label">実施日<span class="required">*</span></label>
            <input type="date" class="form-input" id="f-date" value="${record?.date || timerStart?.date || today}" required />
            <div class="form-error" id="err-date"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">開始時間<span class="required">*</span></label>
              <input type="time" class="form-input" id="f-startTime" value="${record?.startTime || timerStart?.time || nowH + ':' + nowM}" required />
              <div class="form-error" id="err-startTime"></div>
            </div>
            <div class="form-group">
              <label class="form-label">終了時間<span class="required">*</span></label>
              <input type="time" class="form-input" id="f-endTime" value="${record?.endTime || timerEnd?.time || ''}" required />
              <div class="form-error" id="err-endTime"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="checkbox-group"><input type="checkbox" id="f-nextDay" ${(record?.nextDay || (timerStart && timerEnd && timerStart.date !== timerEnd.date)) ? 'checked' : ''} /> 翌日跨ぎ</label>
          </div>

          <div class="quick-tags">
            <div class="quick-tags-title">${icon('pin', { size: 14 })}よく使う場所</div>
            <div class="tag-group" id="quick-locations">
              ${locationTags.map(loc => `<button type="button" class="tag ${((record?.area || ownTimer?.area) === loc.area && (record?.spot || ownTimer?.spot) === loc.spot) ? 'selected' : ''}" data-id="${escapeHtml(loc.id || '')}" data-area="${escapeHtml(loc.area)}" data-locality="${escapeHtml(loc.locality || '')}" data-spot="${escapeHtml(loc.spot)}">${escapeHtml(loc.spot)}</button>`).join('')}
            </div>
          </div>
          ${isEdit ? '' : `<div class="location-map-actions">
            <button type="button" class="btn btn-secondary btn-full" id="btn-open-map">${icon('pin')}地図・現在地から選択</button>
          </div>`}

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">地区<span class="required">*</span></label>
              <!-- 地区の選択肢を固定化 -->
              <select class="form-select" id="f-area">
                <option value="">選択してください</option>
                ${areaOptions.map(a => `<option value="${a}" ${(record?.area || ownTimer?.area) === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
              <div class="form-error" id="err-area"></div>
            </div>
            <div class="form-group">
              <label class="form-label">地名</label>
              <input type="text" class="form-input" id="f-locality" value="${record?.locality || ownTimer?.locality || ''}" placeholder="例：戸越" list="locality-list" />
              <datalist id="locality-list">${uniqueLocalities.map(l => `<option value="${l}">`).join('')}</datalist>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">スポット<span class="required">*</span></label>
            <input type="hidden" id="f-spotId" value="${escapeHtml(initialSpotId)}" />
            <input type="text" class="form-input" id="f-spot" value="${record?.spot || ownTimer?.spot || ''}" placeholder="例：大井町駅デッキ上" list="spot-list" />
            <datalist id="spot-list">${[...new Set([...uniqueSpots, ...allSpots.map(s => s.spot)])].map(s => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
            <div class="form-error" id="err-spot"></div>
          </div>

          <div class="form-group">
            <label class="form-label">配布枚数<span class="required">*</span></label>
            <input type="number" class="form-input" id="f-distributionCount" inputmode="numeric" min="0" value="${record?.distributionCount ?? ''}" placeholder="0" />
            <div class="form-error" id="err-distributionCount"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">ボランティア人数</label>
              <input type="number" class="form-input" id="f-volunteerCount" inputmode="numeric" min="0" value="${record?.volunteerCount ?? 0}" />
            </div>
            <div class="form-group">
              <label class="form-label">参加者名</label>
              <input type="text" class="form-input" id="f-volunteerNames" value="${record?.volunteerNames || ''}" placeholder="田中、佐藤" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">備考メモ</label>
            <textarea class="form-textarea" id="f-memo" rows="2" placeholder="活動の所感など">${record?.memo || ''}</textarea>
          </div>
        </div>

        <!-- 追加情報 -->
        <div class="collapsible" id="sec-additional">
          <div class="collapsible-header"><span class="collapsible-title">${icon('cloud')}追加情報（任意）</span><span class="collapsible-arrow">${icon('chevronDown', { size: 16 })}</span></div>
          <div class="collapsible-body"><div class="collapsible-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">天候</label>
                <select class="form-select" id="f-weather"><option value="">未選択</option>${WEATHER_OPTIONS.map(w => `<option value="${w}" ${record?.weather === w ? 'selected' : ''}>${w}</option>`).join('')}</select>
              </div>
              <div class="form-group">
                <label class="form-label">気温 (°C)</label>
                <input type="number" class="form-input" id="f-temperature" inputmode="numeric" value="${record?.temperature ?? ''}" placeholder="20" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">実施形態</label>
              <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr;">
                <select class="form-select" id="f-formType"><option value="">-</option>${FORM_TYPES.map(f => `<option value="${f}" ${record?.formType === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
                <select class="form-select" id="f-micType"><option value="">-</option>${MIC_TYPES.map(m => `<option value="${m}" ${record?.micType === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
                <select class="form-select" id="f-groupType"><option value="">-</option>${GROUP_TYPES.map(g => `<option value="${g}" ${record?.groupType === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">住所</label>
              <input type="text" class="form-input" id="f-address" value="${record?.address || ''}" placeholder="住所を入力" />
            </div>
            <div class="form-group">
              <label class="form-label">テーマタグ</label>
              <div class="tag-group" id="theme-tags">${ALL_THEMES.map(t => `<button type="button" class="tag ${(record?.themes || []).includes(t) ? 'selected' : ''}" data-theme="${t}">${t}</button>`).join('')}</div>
              <input type="text" class="form-input" id="f-customTheme" style="margin-top:8px;" placeholder="新しいテーマを追加" />
            </div>
            <div class="form-group">
              <label class="form-label">配布物種類</label>
              <!-- 2-3. 配布物タグ (過去入力ベース) -->
              <div class="tag-group" id="material-tags">${recentMaterials.map(m => `<button type="button" class="tag ${(record?.materials || []).includes(m) ? 'selected' : ''}" data-material="${m}">${m}</button>`).join('')}</div>
              <input type="text" class="form-input" id="f-customMaterial" style="margin-top:8px;" placeholder="新しい配布物を追加" />
            </div>
          </div></div>
        </div>

        <!-- 反応・成果 -->
        <div class="collapsible" id="sec-reaction">
          <div class="collapsible-header"><span class="collapsible-title">${icon('users')}反応・成果（任意）</span><span class="collapsible-arrow">${icon('chevronDown', { size: 16 })}</span></div>
          <div class="collapsible-body"><div class="collapsible-content">
            <div class="form-row">
              <div class="form-group"><label class="form-label">声かけ数</label><input type="number" class="form-input" id="f-approachCount" inputmode="numeric" min="0" value="${record?.approachCount ?? ''}" /></div>
              <div class="form-group"><label class="form-label">立ち止まり人数</label><input type="number" class="form-input" id="f-stopCount" inputmode="numeric" min="0" value="${record?.stopCount ?? ''}" /></div>
            </div>
            <div class="form-group"><label class="form-label">受取拒否数</label><input type="number" class="form-input" id="f-refusalCount" inputmode="numeric" min="0" value="${record?.refusalCount ?? ''}" /></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">新規連絡先獲得</label><input type="number" class="form-input" id="f-newContactCount" inputmode="numeric" min="0" value="${record?.newContactCount ?? ''}" /></div>
              <div class="form-group"><label class="form-label">寄附/カンパ件数</label><input type="number" class="form-input" id="f-donationCount" inputmode="numeric" min="0" value="${record?.donationCount ?? ''}" /></div>
            </div>
            <div class="form-group"><label class="form-label">QR/URL誘導数</label><input type="number" class="form-input" id="f-qrCount" inputmode="numeric" min="0" value="${record?.qrCount ?? ''}" /></div>
            <div class="form-group"><label class="checkbox-group"><input type="checkbox" id="f-hasTrouble" ${record?.hasTrouble ? 'checked' : ''} /> トラブル/注意あり</label></div>
            <div class="form-group" id="trouble-note-group" style="display: ${record?.hasTrouble ? 'block' : 'none'}">
              <label class="form-label">トラブル内容</label>
              <textarea class="form-textarea" id="f-troubleNote" rows="2">${record?.troubleNote || ''}</textarea>
            </div>
          </div></div>
        </div>

        <div id="form-warnings" style="display:none;" class="card"></div>

        <div style="margin-top: var(--s6); padding-bottom: calc(var(--s7) + var(--safe-bottom));">
          <button type="submit" class="btn btn-primary btn-full" id="btn-save" style="margin-bottom: var(--s2); height: 50px; font-size: var(--t-base);">
            ${icon('save', { size: 17 })}${isEdit ? '更新する' : '保存する'}
          </button>
          ${isEdit ? `<button type="button" class="btn btn-danger btn-full" id="btn-delete" style="height: 50px;">${icon('trash', { size: 16 })}この記録を削除</button>` : ''}
        </div>
      </form>
    </div>
  `;

    // イベント
    container.querySelectorAll('.collapsible-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));

    const applyLocationForSpot = () => {
        const spotName = document.getElementById('f-spot')?.value;
        const location = allSpots.find(item => item.spot === spotName) || findLocationBySpot(spotName);
        document.getElementById('f-spotId').value = location?.id || '';
        if (!location) return false;
        document.getElementById('f-area').value = location.area;
        document.getElementById('f-locality').value = location.locality;
        return true;
    };

    document.getElementById('f-spot').addEventListener('input', applyLocationForSpot);

    document.getElementById('btn-open-map')?.addEventListener('click', () => {
        openMapPicker({ onSelect: selected => {
            document.getElementById('f-area').value = selected.area;
            document.getElementById('f-locality').value = selected.locality || '';
            document.getElementById('f-spot').value = selected.spot;
            document.getElementById('f-spotId').value = selected.id || '';
            container.querySelectorAll('#quick-locations .tag').forEach(button => button.classList.toggle('selected', button.dataset.id === selected.id));
        }});
    });

    const applyMemoBtn = document.getElementById('btn-apply-memo');
    if (applyMemoBtn) applyMemoBtn.addEventListener('click', () => {
        const memoText = document.getElementById('f-importMemo').value.trim();
        const resultEl = document.getElementById('memo-import-result');
        if (!memoText) {
            resultEl.textContent = 'メモを貼り付けてください。';
            resultEl.className = 'memo-import-result caution visible';
            return;
        }

        const { values, found, missing } = parseActivityMemo(memoText);
        const fieldIds = {
            date: 'f-date', startTime: 'f-startTime', endTime: 'f-endTime', area: 'f-area',
            locality: 'f-locality', spot: 'f-spot', distributionCount: 'f-distributionCount',
        };
        for (const [key, value] of Object.entries(values)) {
            if (value === '' || value === null) continue;
            const field = document.getElementById(fieldIds[key]);
            if (field) field.value = value;
        }

        resultEl.textContent = missing.length
            ? `${found.join('・') || '項目なし'}を反映しました。不足: ${missing.join('・')}`
            : 'すべての必須項目を反映しました。内容を確認して保存してください。';
        resultEl.className = `memo-import-result ${missing.length ? 'caution' : 'success'} visible`;
    });
    
    // 2-1. 基本情報の選択リセット仕様
    container.querySelectorAll('#quick-locations .tag').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('selected')) {
                // アンタップ時はリセット
                btn.classList.remove('selected');
                document.getElementById('f-area').value = '';
                document.getElementById('f-locality').value = '';
                document.getElementById('f-spot').value = '';
                document.getElementById('f-spotId').value = '';
            } else {
                document.getElementById('f-area').value = btn.dataset.area;
                document.getElementById('f-locality').value = btn.dataset.locality || '';
                document.getElementById('f-spot').value = btn.dataset.spot;
                document.getElementById('f-spotId').value = btn.dataset.id || '';
                container.querySelectorAll('#quick-locations .tag').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            }
        });
    });

    // 1-2. タップ/アンタップ リセット＆選択UI統一
    const toggleTag = (e) => e.target.classList.toggle('selected');
    container.querySelectorAll('#theme-tags .tag').forEach(btn => btn.addEventListener('click', toggleTag));
    container.querySelectorAll('#material-tags .tag').forEach(btn => btn.addEventListener('click', toggleTag));

    const troubleCheck = document.getElementById('f-hasTrouble');
    if (troubleCheck) troubleCheck.addEventListener('change', () => {
        document.getElementById('trouble-note-group').style.display = troubleCheck.checked ? 'block' : 'none';
    });

    document.getElementById('activity-form').addEventListener('submit', (e) => { e.preventDefault(); handleSave(onSaved); });

    const deleteBtn = document.getElementById('btn-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (confirm('この記録を削除しますか？')) { await store.remove(editingId); editingId = null; onSaved('deleted'); }
    });

    attachTimerHandlers(container, ownTimer, onSaved);
}

function renderTimerCard(activeTimer, ownTimer) {
    if (activeTimer && !ownTimer) {
        return `<div class="card timer-card is-other-account">
          <div class="card-title">${icon('clock')}別のアカウントで活動中</div>
          <p class="section-note">活動を開始したアカウントに切り替えると、計測を終了できます。</p>
        </div>`;
    }
    if (!ownTimer) {
        return `<div class="card timer-card">
          <div class="timer-card-row">
            <div><div class="card-title">${icon('clock')}活動タイマー</div><p class="section-note">場所を選んでから開始してください。</p></div>
            <button type="button" class="btn btn-primary" id="btn-timer-start">活動を開始</button>
          </div>
          <div class="form-error" id="timer-error"></div>
        </div>`;
    }
    const ended = ownTimer.status === 'ended';
    return `<div class="card timer-card ${ended ? 'is-ended' : 'is-running'}">
      <div class="timer-status-label">${ended ? '終了済み・保存待ち' : '活動中'}</div>
      <div class="timer-location">${escapeHtml(ownTimer.area)} ／ ${escapeHtml(ownTimer.spot)}</div>
      <div class="timer-elapsed" id="timer-elapsed">${activityTimer.formatElapsed(activityTimer.elapsedMilliseconds(ownTimer))}</div>
      <div class="timer-actions">
        ${ended ? '<span class="text-sm text-muted">実績を入力して保存してください。</span>' : `<button type="button" class="btn btn-primary" id="btn-timer-finish">活動を終了</button>`}
        <button type="button" class="btn btn-secondary btn-sm" id="btn-timer-cancel">${ended ? '計測を破棄' : '中止'}</button>
      </div>
    </div>`;
}

function attachTimerHandlers(container, ownTimer, onSaved) {
    const elapsed = document.getElementById('timer-elapsed');
    if (elapsed && ownTimer?.status === 'running') {
        const interval = setInterval(() => {
            if (!document.getElementById('timer-elapsed')) return clearInterval(interval);
            elapsed.textContent = activityTimer.formatElapsed(activityTimer.elapsedMilliseconds(ownTimer));
        }, 1000);
    }

    document.getElementById('btn-timer-start')?.addEventListener('click', async () => {
        const area = document.getElementById('f-area').value.trim();
        const locality = document.getElementById('f-locality').value.trim();
        const spot = document.getElementById('f-spot').value.trim();
        const error = document.getElementById('timer-error');
        if (!area || !spot) {
            error.textContent = '地区とスポットを選択してください。';
            error.classList.add('visible');
            document.getElementById('f-spot').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        try {
            activityTimer.startTimer({
                politicianId: store.getCurrentPoliticianId(),
                spotId: document.getElementById('f-spotId').value,
                area, locality, spot,
            });
            await render(container, { onSaved });
        } catch (timerError) {
            error.textContent = timerError.message;
            error.classList.add('visible');
        }
    });

    document.getElementById('btn-timer-finish')?.addEventListener('click', async () => {
        activityTimer.finishTimer();
        await render(container, { onSaved });
    });

    document.getElementById('btn-timer-cancel')?.addEventListener('click', async () => {
        if (!confirm('この計測を破棄しますか？')) return;
        activityTimer.clearTimer();
        await render(container, { onSaved });
    });
}

function getFormData() {
    const v = id => document.getElementById(id)?.value || '';
    const n = id => { const val = document.getElementById(id)?.value; return val === '' ? '' : Number(val); };
    const c = id => document.getElementById(id)?.checked || false;
    
    const selectedThemes = [...document.querySelectorAll('#theme-tags .tag.selected')].map(t => t.dataset.theme);
    const customTheme = v('f-customTheme').trim();
    if (customTheme && !selectedThemes.includes(customTheme)) selectedThemes.push(customTheme);

    const selectedMaterials = [...document.querySelectorAll('#material-tags .tag.selected')].map(m => m.dataset.material);
    const customMat = v('f-customMaterial').trim();
    if (customMat && !selectedMaterials.includes(customMat)) selectedMaterials.push(customMat);

    return {
        date: v('f-date'), startTime: v('f-startTime'), endTime: v('f-endTime'), nextDay: c('f-nextDay'),
        spotId: v('f-spotId'),
        area: v('f-area').trim(), locality: v('f-locality').trim(), spot: v('f-spot').trim(), distributionCount: n('f-distributionCount'),
        volunteerCount: n('f-volunteerCount'), volunteerNames: v('f-volunteerNames'), memo: v('f-memo'),
        weather: v('f-weather'), temperature: n('f-temperature'),
        formType: v('f-formType'), micType: v('f-micType'), groupType: v('f-groupType'),
        address: v('f-address'), lat: null, lng: null, themes: selectedThemes, materials: selectedMaterials,
        approachCount: n('f-approachCount'), stopCount: n('f-stopCount'), refusalCount: n('f-refusalCount'),
        newContactCount: n('f-newContactCount'), donationCount: n('f-donationCount'), qrCount: n('f-qrCount'),
        hasTrouble: c('f-hasTrouble'), troubleNote: v('f-troubleNote'), photos: [],
    };
}

async function handleSave(onSaved) {
    document.querySelectorAll('.form-error').forEach(el => { el.classList.remove('visible'); el.textContent = ''; });
    document.querySelectorAll('.form-input.error, .form-select.error').forEach(el => el.classList.remove('error'));

    const data = getFormData();
    if (editingId) data.id = editingId;
    const { valid, errors, warnings } = validateRecord(data, allRecordsCache);

    if (!valid) {
        for (const [key, msg] of Object.entries(errors)) {
            const errEl = document.getElementById(`err-${key}`);
            if (errEl) { errEl.textContent = msg; errEl.classList.add('visible'); }
            const inputEl = document.getElementById(`f-${key}`);
            if (inputEl) inputEl.classList.add('error');
        }
        const firstEl = document.getElementById(`f-${Object.keys(errors)[0]}`);
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (warnings.length > 0) {
        const warnEl = document.getElementById('form-warnings');
        if (warnEl) {
            warnEl.style.display = 'block'; warnEl.style.borderColor = 'var(--caution)';
            warnEl.innerHTML = `<div class="card-title" style="color:var(--caution);margin-bottom:8px;">${icon('alert')}確認してください</div>
        ${warnings.map(w => `<div class="text-sm" style="color:var(--ink-secondary);margin-bottom:4px;">・${w}</div>`).join('')}
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button type="button" class="btn btn-primary btn-sm" id="btn-force-save">そのまま保存</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-save">キャンセル</button>
        </div>`;
            document.getElementById('btn-force-save').addEventListener('click', () => doSave(data, onSaved));
            document.getElementById('btn-cancel-save').addEventListener('click', () => { warnEl.style.display = 'none'; });
            warnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }
    await doSave(data, onSaved);
}

async function doSave(data, onSaved) {
    if (editingId) { await store.update(editingId, data); editingId = null; onSaved('updated'); }
    else {
        await store.save(data);
        const timer = activityTimer.getActiveTimer();
        if (timer?.politicianId === store.getCurrentPoliticianId()) activityTimer.clearTimer();
        onSaved('created');
    }
}
