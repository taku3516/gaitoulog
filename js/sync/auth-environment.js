// ===== ログイン環境の判定 =====
//
// ポップアップでのGoogleログインは、認証ページがアプリと別ドメインだと
// ホーム画面のアプリ（standalone表示）で結果を返せず、白い画面のまま止まる。
// 公開先を Firebase Hosting に移して同一ドメインにそろえたことで解消したため、
// 既定はポップアップ方式。応答が無いときだけリダイレクト方式へ切り替える。
//
// ここには「判定」だけを置く。Firebase には依存しないので node でテストできる。

const STANDALONE_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** リダイレクトの途中経過を有効とみなす時間（これを過ぎた記録は捨てる） */
export const REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;

/** 時計のずれを許す幅（未来の時刻が入っていても、この範囲なら受け入れる） */
const CLOCK_SKEW_MS = 60 * 1000;

/** ホーム画面のアプリとして起動しているか */
export function isStandaloneDisplay(win = globalThis) {
    if (!win) return false;

    // iOS Safari は display-mode に長く対応しなかったため、独自プロパティも見る
    if (win.navigator?.standalone === true) return true;

    if (typeof win.matchMedia !== 'function') return false;
    return STANDALONE_MODES.some(mode => {
        try {
            return win.matchMedia(`(display-mode: ${mode})`).matches === true;
        } catch {
            return false; // 未対応の問い合わせで落とさない
        }
    });
}

/**
 * リダイレクト前に保存しておいた意図を読み戻す。
 * 壊れている・古い・未来の時刻が入っている場合は null を返す。
 */
export function parsePendingRedirect(raw, now = Date.now()) {
    if (typeof raw !== 'string' || raw === '') return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const startedAt = Number(parsed.startedAt);
    if (!Number.isFinite(startedAt)) return null;
    if (now - startedAt > REDIRECT_MAX_AGE_MS) return null;
    if (startedAt - now > CLOCK_SKEW_MS) return null;

    return {
        purpose: parsed.purpose === 'deleteAccount' ? 'deleteAccount' : 'signIn',
        remember: parsed.remember === true,
        startedAt,
    };
}
