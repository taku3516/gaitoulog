// ===== 設定画面（Googleログインと端末間同期） =====
// クラウド同期が未設定（enabled: false）のときは同期UIを一切表示しない。

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
    connecting: '接続しています...',
    syncing: '同期しています...',
    synced: '同期済み',
    error: '',
};

export async function render(container) {
    dispose();

    function statusLine(state) {
        const message = state.message || STATUS_TEXT[state.status] || '';
        if (!message) return '';
        const color = state.status === 'error' ? 'var(--status-error)'
            : state.status === 'synced' ? 'var(--accent-success)'
            : 'var(--text-muted)';
        const icon = state.status === 'error' ? '⚠️'
            : state.status === 'synced' ? '✅'
            : '🔄';
        return `<span style="color: ${color};">${icon} ${escapeHtml(message)}</span>`;
    }

    function renderBody() {
        const api = cloud();
        const state = api ? api.getState() : { available: false, status: 'idle', message: '', user: null, busy: false };

        let syncSection = '';

        if (!state.available) {
            // 未設定: 同期UIは出さない。アプリは従来どおり動く。
            syncSection = `
                <div class="card">
                    <div class="card-title" style="margin-bottom: 12px;">☁️ 端末間の同期</div>
                    <p style="font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.7; margin: 0;">
                        この端末では同期機能が設定されていません。活動記録はこの端末の中だけに保存されます。
                    </p>
                    <p style="font-size: var(--font-size-xs); color: var(--text-muted); margin: 12px 0 0; line-height: 1.6;">
                        設定方法は <code>docs/firebase-sync-setup.md</code> を参照してください。
                    </p>
                </div>
            `;
        } else if (!state.user) {
            syncSection = `
                <div class="card">
                    <div class="card-title" style="margin-bottom: 12px;">☁️ 端末間の同期</div>
                    <p style="font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.7; margin: 0 0 16px;">
                        Googleでログインすると、すべてのアカウントの活動記録がクラウドに保存され、
                        同じGoogleアカウントでログインした他の端末と自動的に同期されます。
                    </p>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 16px; cursor: pointer;">
                        <input type="checkbox" id="remember-device" ${rememberDevice ? 'checked' : ''}
                            style="width: 18px; height: 18px; accent-color: var(--accent-primary);">
                        この端末でログイン状態を維持する
                    </label>
                    <button class="btn btn-primary btn-full" id="cloud-signin" ${state.busy ? 'disabled' : ''}>
                        Googleでログイン
                    </button>
                    <div style="font-size: var(--font-size-xs); margin-top: 10px; min-height: 1.2em;" aria-live="polite">
                        ${statusLine(state)}
                    </div>
                    <p style="font-size: var(--font-size-xs); color: var(--text-muted); margin: 12px 0 0; line-height: 1.6;">
                        ログインは任意です。ログインしない場合も、これまでどおりこの端末だけで利用できます。
                        Gmailやドライブなど、他のGoogleサービスへのアクセス権は要求しません。
                    </p>
                </div>
            `;
        } else {
            syncSection = `
                <div class="card">
                    <div class="card-title" style="margin-bottom: 12px;">☁️ 端末間の同期</div>
                    <div style="font-size: var(--font-size-sm); color: var(--text-primary); font-weight: 600;">
                        ${escapeHtml(state.user.displayName || 'ログイン中')}
                    </div>
                    <div style="font-size: var(--font-size-xs); margin-top: 8px; min-height: 1.2em;" aria-live="polite">
                        ${statusLine(state)}
                    </div>
                    <button class="btn btn-secondary btn-full" id="cloud-signout" style="margin-top: 12px;" ${state.busy ? 'disabled' : ''}>
                        ログアウト
                    </button>
                    <p style="font-size: var(--font-size-xs); color: var(--text-muted); margin: 12px 0 0; line-height: 1.6;">
                        ログアウトすると、この端末はログイン前のローカルの記録に戻ります。
                        クラウド上のデータは残り、次にログインしたときに再び同期されます。
                    </p>
                </div>

                <div class="card" style="margin-top: var(--spacing-md); border: 1px solid #fee2e2;">
                    <div class="card-title" style="margin-bottom: 8px; color: var(--status-error);">🗑️ クラウドのデータを削除</div>
                    <p style="font-size: var(--font-size-xs); color: var(--text-secondary); line-height: 1.7; margin: 0 0 12px;">
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
            <div class="view-container" id="settings-root">
                <div class="section-title">⚙️ 設定</div>
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
