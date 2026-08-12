// ===== 設定画面（Googleログインと端末間同期） =====
// クラウド同期が未設定（enabled: false）のときは同期UIを一切表示しない。

import { icon } from '../utils/icons.js';
import * as store from '../store.js';
import * as spotStore from '../spot-store.js';
import { openMapPicker } from '../map-picker.js';
import { downloadBackup, readBackupFile, inspectBackup, restoreBackup } from '../utils/backup.js';

let unsubscribe = null;
let rememberDevice = false;
let accountRows = [];
let customSpotRows = [];
let sampleCount = 0;

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function cloud() {
    return window.GAITOULOG_CLOUD;
}

const STATUS_TEXT = {
    idle: '',
    connecting: '接続しています…',
    syncing: '同期しています…',
    synced: '同期済み',
    error: '',
};

/** アカウント一覧と記録件数を読み込む */
async function loadAccounts() {
    const counts = await store.countRecordsByPolitician();
    const currentId = store.getCurrentPoliticianId();
    accountRows = store.getPoliticians().map(p => ({
        id: p.id,
        name: p.name,
        count: counts[p.id] || 0,
        isCurrent: p.id === currentId,
    }));
    customSpotRows = spotStore.getCustomSpots({ includeArchived: true });
    sampleCount = await store.countSampleRecords();
}

export async function render(container, { onAccountsChanged } = {}) {
    dispose();
    await loadAccounts();

    function statusLine(state) {
        const message = state.message || STATUS_TEXT[state.status] || '';
        if (!message) return '<div class="status-line"></div>';
        const modifier = state.status === 'error' ? ' is-error' : state.status === 'synced' ? ' is-done' : '';
        const mark = state.status === 'error' ? 'alert' : state.status === 'synced' ? 'check' : 'refresh';
        return `<div class="status-line${modifier}">${icon(mark, { size: 14 })}<span>${escapeHtml(message)}</span></div>`;
    }

    function accountsSection() {
        const onlyOne = accountRows.length <= 1;
        const rows = accountRows.map(a => `
            <div class="account-row">
                <div class="account-info">
                    <div class="account-name">
                        ${escapeHtml(a.name)}
                        ${a.isCurrent ? '<span class="badge">使用中</span>' : ''}
                    </div>
                    <div class="account-meta">記録 ${a.count}件</div>
                </div>
                <button class="btn btn-danger btn-sm account-delete" data-id="${escapeHtml(a.id)}" ${onlyOne ? 'disabled' : ''}>
                    ${icon('trash', { size: 15 })}削除
                </button>
            </div>
        `).join('');

        return `
            <div class="card">
                <div class="card-title">${icon('users')}アカウント</div>
                <p class="text-xs text-muted" style="margin: 10px 0 12px; line-height: 1.8;">
                    アカウントを削除すると、そのアカウントの活動記録もすべて削除されます。この操作は取り消せません。
                    ${onlyOne ? '<br>アカウントが1つのときは削除できません。' : ''}
                </p>
                <div class="account-list">${rows}</div>
            </div>
        `;
    }

    function spotsSection() {
        const rows = customSpotRows.length ? customSpotRows.map(spot => `
            <div class="account-row">
                <div class="account-info">
                    <div class="account-name">${escapeHtml(spot.spot)}${spot.archived ? '<span class="badge">非表示</span>' : ''}</div>
                    <div class="account-meta">${spot.id.startsWith('preset_') ? '標準ピン変更' : '追加ピン'} ／ ${escapeHtml(spot.area)}${spot.locality ? ` ／ ${escapeHtml(spot.locality)}` : ''}</div>
                </div>
                <div class="spot-row-actions">
                  <button class="btn btn-secondary btn-sm spot-edit" data-id="${escapeHtml(spot.id)}">編集</button>
                  <button class="btn btn-secondary btn-sm spot-archive" data-id="${escapeHtml(spot.id)}" data-archived="${spot.archived}">${spot.archived ? '再表示' : '非表示'}</button>
                  <button class="btn btn-danger btn-sm spot-delete" data-id="${escapeHtml(spot.id)}">削除</button>
                </div>
            </div>`).join('') : '<p class="text-sm text-muted" style="margin:10px 0 0;">追加・変更したスポットはまだありません。</p>';
        return `<div class="card">
          <div class="card-title">${icon('pin')}追加スポット</div>
          <p class="text-xs text-muted" style="margin:10px 0 12px;line-height:1.8;">標準ピンの位置・名称を変更したり、新しいピンを追加できます。変更はすべてのアカウントで共通です。Googleログイン中は端末間で同期されます。</p>
          <button class="btn btn-primary btn-full" id="spot-map-manage" style="margin-bottom:12px;">地図でピンを追加・編集</button>
          <div class="account-list">${rows}</div>
        </div>`;
    }

    function sampleSection() {
        if (sampleCount === 0) return '';
        return `<div class="card">
          <div class="card-title">${icon('alert')}サンプルデータ</div>
          <p class="text-xs text-muted" style="margin:10px 0 12px;line-height:1.8;">
            お試し用のサンプル記録が${sampleCount}件あります。実際の活動を記録し始めたら削除してください。
            集計やグラフ、共有する画像にもサンプルが混ざります。
          </p>
          <button class="btn btn-danger btn-full" id="sample-delete">サンプル${sampleCount}件を削除</button>
        </div>`;
    }

    function attachSampleHandlers() {
        document.getElementById('sample-delete')?.addEventListener('click', async () => {
            if (!confirm(`サンプル記録${sampleCount}件を削除します。ご自身で入力した記録は残ります。よろしいですか？`)) return;
            const removed = await store.removeSampleRecords();
            await loadAccounts();
            if (document.getElementById('settings-root')) renderBody();
            alert(`サンプル${removed}件を削除しました。`);
        });
    }

    function attachBackupHandlers() {
        const status = message => {
            const element = document.getElementById('backup-status');
            if (element) element.textContent = message;
        };

        document.getElementById('backup-export')?.addEventListener('click', async () => {
            try {
                const backup = await downloadBackup();
                status(`${backup.records.length}件の記録を書き出しました。`);
            } catch (error) {
                status(`書き出しに失敗しました：${error.message}`);
            }
        });

        const fileInput = document.getElementById('backup-file-input');
        document.getElementById('backup-import')?.addEventListener('click', () => {
            if (!fileInput) return;
            fileInput.value = '';
            fileInput.click();
        });
        fileInput?.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                const backup = await readBackupFile(file);
                const info = inspectBackup(backup);
                const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString('ja-JP') : '不明';
                const message = `このバックアップで端末のデータを置き換えます。\n\n`
                    + `作成日時：${when}\n`
                    + `活動記録：${info.recordCount}件\n`
                    + `アカウント：${info.politicianCount}件\n`
                    + `追加スポット：${info.spotCount}件\n\n`
                    + '現在この端末にある記録・アカウント・スポットは失われます。続行しますか？';
                if (!confirm(message)) return;
                const result = await restoreBackup(backup);
                alert(`${result.recordCount}件の記録を復元しました。画面を読み込み直します。`);
                location.reload();
            } catch (error) {
                status(`復元できませんでした：${error.message}`);
            }
        });
    }

    function backupSection(signedIn) {
        return `<div class="card">
          <div class="card-title">${icon('download')}バックアップ</div>
          <p class="text-xs text-muted" style="margin:10px 0 12px;line-height:1.8;">
            すべてのアカウントの活動記録、追加スポット、表示設定、配布目標を1つのファイルに書き出します。
            機種変更や端末の紛失に備えた控えとして保存してください。CSVの出力は活動記録だけが対象です。
          </p>
          <div class="backup-actions">
            <button class="btn btn-primary" id="backup-export">${icon('download', { size: 15 })}バックアップを保存</button>
            <button class="btn btn-secondary" id="backup-import">${icon('upload', { size: 15 })}バックアップから復元</button>
          </div>
          <input type="file" id="backup-file-input" accept="application/json,.json" style="display:none;" />
          <p class="text-xs" style="margin:12px 0 0;line-height:1.8;color:var(--critical);">
            復元すると、この端末の記録・アカウント・スポットはバックアップの内容に置き換わります。復元前の内容は戻せません。
            ${signedIn ? '<br>同期にログイン中の復元はこの端末だけに反映され、クラウドの内容で上書きされることがあります。復元する前にログアウトしてください。' : ''}
          </p>
          <div class="text-xs" id="backup-status" aria-live="polite" style="margin-top:8px;"></div>
        </div>`;
    }

    function renderBody() {
        const api = cloud();
        const state = api ? api.getState() : { available: false, status: 'idle', message: '', user: null, busy: false };

        let syncSection = '';

        if (!state.available) {
            // 未設定: 同期UIは出さない。アプリは従来どおり動く。
            syncSection = `
                <div class="card">
                    <div class="card-title">${icon('cloud')}端末間の同期</div>
                    <p class="text-sm" style="margin: 12px 0 0; color: var(--ink-secondary);">
                        この端末では同期が設定されていません。活動記録はこの端末の中だけに保存されます。
                    </p>
                    <p class="text-xs text-muted" style="margin: 8px 0 0;">
                        設定方法は <code>docs/firebase-sync-setup.md</code> を参照してください。
                    </p>
                </div>
            `;
        } else if (!state.user) {
            syncSection = `
                <div class="card">
                    <div class="card-title">${icon('cloud')}端末間の同期</div>
                    <p class="text-sm" style="margin: 12px 0 16px; color: var(--ink-secondary);">
                        Googleでログインすると、すべてのアカウントの活動記録がクラウドに保存され、
                        同じGoogleアカウントでログインした他の端末と自動的に同期されます。
                    </p>
                    <label class="checkbox-group" style="margin-bottom: 12px;">
                        <input type="checkbox" id="remember-device" ${rememberDevice ? 'checked' : ''}>
                        この端末でログイン状態を維持する
                    </label>
                    <button class="btn btn-primary btn-full" id="cloud-signin" ${state.busy ? 'disabled' : ''}>
                        Googleでログイン
                    </button>
                    <div style="margin-top: 10px;" aria-live="polite">${statusLine(state)}</div>
                    <p class="text-xs text-muted" style="margin: 12px 0 0;">
                        ログインは任意です。ログインしない場合も、これまでどおりこの端末だけで利用できます。
                        Gmailやドライブなど、他のGoogleサービスへのアクセス権は要求しません。
                    </p>
                </div>
            `;
        } else {
            syncSection = `
                <div class="card">
                    <div class="card-title">${icon('cloud')}端末間の同期</div>
                    <div style="margin-top: 12px; font-weight: 700;">
                        ${escapeHtml(state.user.displayName || 'ログイン中')}
                    </div>
                    <div style="margin-top: 6px;" aria-live="polite">${statusLine(state)}</div>
                    <button class="btn btn-secondary btn-full" id="cloud-signout" style="margin-top: 14px;" ${state.busy ? 'disabled' : ''}>
                        ログアウト
                    </button>
                    <p class="text-xs text-muted" style="margin: 12px 0 0;">
                        ログアウトすると、この端末はログイン前の記録に戻ります。
                        クラウド上のデータは残り、次にログインしたときに再び同期されます。
                    </p>
                </div>

                <div class="card">
                    <div class="card-title" style="color: var(--critical);">${icon('trash')}クラウドのデータを削除</div>
                    <p class="text-xs" style="margin: 10px 0 12px; color: var(--ink-secondary); line-height: 1.8;">
                        クラウド上の活動記録、アカウント情報、追加スポットをすべて削除し、この連携を解除します。
                        確認のためGoogleの再ログインを求められます。この操作は取り消せません。
                    </p>
                    <button class="btn btn-danger btn-full" id="cloud-delete" ${state.busy ? 'disabled' : ''}>
                        クラウドのデータとアカウントを削除
                    </button>
                </div>
            `;
        }

        container.innerHTML = `
            <div id="settings-root">
                <h2 class="section-title">${icon('settings', { size: 19 })}設定</h2>
                ${sampleSection()}
                ${accountsSection()}
                ${spotsSection()}
                ${backupSection(Boolean(state.user))}
                ${syncSection}
            </div>
        `;
        attachHandlers();
    }

    function attachHandlers() {
        attachSampleHandlers();
        attachBackupHandlers();
        document.querySelectorAll('.account-delete').forEach(btn => {
            btn.addEventListener('click', () => handleDeleteAccount(btn.dataset.id));
        });
        document.querySelectorAll('.spot-archive').forEach(btn => {
            btn.addEventListener('click', async () => {
                spotStore.archiveCustomSpot(btn.dataset.id, btn.dataset.archived !== 'true');
                await loadAccounts();
                if (document.getElementById('settings-root')) renderBody();
            });
        });
        document.querySelectorAll('.spot-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const target = customSpotRows.find(spot => spot.id === btn.dataset.id);
                if (!target) return;
                const message = `「${target.spot}」のピンを削除します。\n活動記録は削除されません。\nこの操作は取り消せません。続行しますか？`;
                if (!confirm(message)) return;
                spotStore.deleteSpot(target.id);
                await loadAccounts();
                if (document.getElementById('settings-root')) renderBody();
            });
        });
        document.getElementById('spot-map-manage')?.addEventListener('click', () => openSpotManager());
        document.querySelectorAll('.spot-edit').forEach(btn => {
            btn.addEventListener('click', () => openSpotManager(btn.dataset.id));
        });

        document.getElementById('remember-device')?.addEventListener('change', (e) => {
            rememberDevice = e.target.checked;
        });

        document.getElementById('cloud-signin')?.addEventListener('click', () => {
            cloud()?.signIn({ remember: rememberDevice });
        });

        document.getElementById('cloud-signout')?.addEventListener('click', () => {
            if (!confirm('ログアウトしますか？\nこの端末の表示はログイン前の記録に戻ります。')) return;
            cloud()?.signOut();
        });

        document.getElementById('cloud-delete')?.addEventListener('click', () => {
            if (!confirm('クラウド上のすべてのデータとアカウントを削除します。\nこの操作は取り消せません。続行しますか？')) return;
            cloud()?.deleteAccountAndData();
        });
    }

    function openSpotManager(initialSpotId = '') {
        openMapPicker({
            manage: true,
            initialSpotId,
            onSaved: async () => {
                await loadAccounts();
                if (document.getElementById('settings-root')) renderBody();
            },
        });
    }

    async function handleDeleteAccount(id) {
        const target = accountRows.find(a => a.id === id);
        if (!target) return;

        const message = `アカウント「${target.name}」を削除します。\n`
            + (target.count > 0 ? `このアカウントの活動記録 ${target.count}件 もあわせて削除されます。\n` : '')
            + (target.isCurrent ? '削除後は別のアカウントに切り替わります。\n' : '')
            + '\nこの操作は取り消せません。続行しますか？';
        if (!confirm(message)) return;

        const result = await store.removePolitician(id);
        if (!result.removed) {
            alert(result.reason === 'last'
                ? 'アカウントが1つのときは削除できません。'
                : 'このアカウントは見つかりませんでした。');
            return;
        }

        await loadAccounts();
        if (document.getElementById('settings-root')) renderBody();
        onAccountsChanged?.();
    }

    renderBody();

    // 同期状態が変わったら表示を更新する（別画面へ移っていたら何もしない）
    unsubscribe = cloud()?.onStateChange(() => {
        if (document.getElementById('settings-root')) renderBody();
    }) || null;
}

/** 別画面へ移動するときに購読を解除する */
export function dispose() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
