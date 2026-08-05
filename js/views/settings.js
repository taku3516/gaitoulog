// ===== 設定画面（Googleログインと端末間同期） =====
// クラウド同期が未設定（enabled: false）のときは同期UIを一切表示しない。

import { icon } from '../utils/icons.js';

let unsubscribe = null;
let rememberDevice = false;

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

export async function render(container) {
    dispose();

    function statusLine(state) {
        const message = state.message || STATUS_TEXT[state.status] || '';
        if (!message) return '<div class="status-line"></div>';
        const modifier = state.status === 'error' ? ' is-error' : state.status === 'synced' ? ' is-done' : '';
        const mark = state.status === 'error' ? 'alert' : state.status === 'synced' ? 'check' : 'refresh';
        return `<div class="status-line${modifier}">${icon(mark, { size: 14 })}<span>${escapeHtml(message)}</span></div>`;
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
                        クラウド上の活動記録とアカウント情報をすべて削除し、この連携を解除します。
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
                ${syncSection}
            </div>
        `;
        attachHandlers();
    }

    function attachHandlers() {
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
