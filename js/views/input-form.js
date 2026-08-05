// ===== 入力画面（品川区カスタマイズ版） =====
import * as store from '../store.js';
import { validateRecord } from '../validation.js';
import { icon } from '../utils/icons.js';

const THEME_OPTIONS = ['子育て', '防災', '福祉', '交通', '教育', '財政', 'まちづくり'];
const WEATHER_OPTIONS = ['晴', '曇', '雨', '雪'];
const FORM_TYPES = ['定点', '流し'];
const MIC_TYPES = ['マイク有', 'マイク無'];
const GROUP_TYPES = ['単独', '複数'];

// 固定エリア (2-2)
const FIXED_AREAS = ['品川', '大崎', '荏原', '大井', '八潮'];

// 品川区の主要スポット（プリセット）
const PRESET_SPOTS = [
    { area: '大井', spot: '大井町駅前' },
    { area: '荏原', spot: '武蔵小山駅前' },
    { area: '荏原', spot: '戸越銀座商店街' },
    { area: '荏原', spot: '旗の台駅前' },
    { area: '大崎', spot: '五反田駅前' },
    { area: '大崎', spot: '目黒駅前（品川区側）' },
    { area: '品川', spot: '青物横丁駅前' },
    { area: '大井', spot: '西大井駅前' },
    { area: '荏原', spot: '中延駅前' },
    { area: '品川', spot: '品川シーサイド駅前' },
];

let editingId = null;
let allRecordsCache = [];

export function setEditingId(id) { editingId = id; }

export async function render(container, { onSaved }) {
    const record = editingId ? await store.getById(editingId) : null;
    const isEdit = !!record;
    
    // Fetch async data
    const recentLocations = await store.getRecentLocations(5);
    const uniqueSpots = await store.getUniqueSpots();
    const recentThemes = await store.getRecentThemes();
    const recentMaterials = await store.getRecentMaterials(); // (2-3) 過去入力ベース
    allRecordsCache = await store.getAll();

    // テーマタグ (2-4)
    const ALL_THEMES = [...new Set([...THEME_OPTIONS, ...recentThemes])];

    // 表示用の場所リスト: 最近使った場所 + プリセット（重複除去）
    const locationTags = [];
    const seen = new Set();
    for (const loc of [...recentLocations, ...PRESET_SPOTS]) {
        const key = `${loc.area}|${loc.spot}`;
        if (!seen.has(key)) { seen.add(key); locationTags.push(loc); }
        if (locationTags.length >= 8) break;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowH = new Date().getHours().toString().padStart(2, '0');
    const nowM = (Math.floor(new Date().getMinutes() / 15) * 15).toString().padStart(2, '0');

    container.innerHTML = `
    <div>
      <h2 class="section-title">${icon('edit', { size: 19 })}${isEdit ? '記録を編集' : '新しい記録'}</h2>
      <form id="activity-form" novalidate>
        <div class="card">
          <div class="card-title" style="margin-bottom: var(--s4);">${icon('pinned')}基本情報</div>
          <div class="form-group">
            <label class="form-label">実施日<span class="required">*</span></label>
            <input type="date" class="form-input" id="f-date" value="${record?.date || today}" required />
            <div class="form-error" id="err-date"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">開始時間<span class="required">*</span></label>
              <input type="time" class="form-input" id="f-startTime" value="${record?.startTime || nowH + ':' + nowM}" required />
              <div class="form-error" id="err-startTime"></div>
            </div>
            <div class="form-group">
              <label class="form-label">終了時間<span class="required">*</span></label>
              <input type="time" class="form-input" id="f-endTime" value="${record?.endTime || ''}" required />
              <div class="form-error" id="err-endTime"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="checkbox-group"><input type="checkbox" id="f-nextDay" ${record?.nextDay ? 'checked' : ''} /> 翌日跨ぎ</label>
          </div>

          <div class="quick-tags">
            <div class="quick-tags-title">${icon('pin', { size: 14 })}よく使う場所</div>
            <div class="tag-group" id="quick-locations">
              ${locationTags.map(loc => `<button type="button" class="tag ${(record?.area === loc.area && record?.spot === loc.spot) ? 'selected' : ''}" data-area="${loc.area}" data-spot="${loc.spot}">${loc.spot}</button>`).join('')}
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">エリア<span class="required">*</span></label>
              <!-- 2-2. エリアの選択肢を固定化 -->
              <select class="form-select" id="f-area">
                <option value="">選択してください</option>
                ${FIXED_AREAS.map(a => `<option value="${a}" ${record?.area === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
              <div class="form-error" id="err-area"></div>
            </div>
            <div class="form-group">
              <label class="form-label">スポット<span class="required">*</span></label>
              <input type="text" class="form-input" id="f-spot" value="${record?.spot || ''}" placeholder="例：大井町駅前" list="spot-list" />
              <datalist id="spot-list">${[...new Set([...uniqueSpots, ...PRESET_SPOTS.map(s => s.spot)])].map(s => `<option value="${s}">`).join('')}</datalist>
              <div class="form-error" id="err-spot"></div>
            </div>
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
    
    // 2-1. 基本情報の選択リセット仕様
    container.querySelectorAll('#quick-locations .tag').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('selected')) {
                // アンタップ時はリセット
                btn.classList.remove('selected');
                document.getElementById('f-area').value = '';
                document.getElementById('f-spot').value = '';
            } else {
                document.getElementById('f-area').value = btn.dataset.area;
                document.getElementById('f-spot').value = btn.dataset.spot;
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
        area: v('f-area').trim(), spot: v('f-spot').trim(), distributionCount: n('f-distributionCount'),
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
    else { await store.save(data); onSaved('created'); }
}
