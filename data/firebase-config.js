// ===== Firebase 同期の設定 =====
//
// ここに入れるのは Firebase の「ウェブアプリ設定値」だけです。
// これらは公開されることを前提とした値で、秘密情報ではありません。
// （実際の防御は Firestore セキュリティルールと承認済みドメインで行います）
//
// サービスアカウントのJSON、private_key、OAuthクライアントシークレットは
// 絶対にこのファイルにもリポジトリにも置かないでください。
//
// 設定手順は docs/firebase-sync-setup.md を参照。

window.GAITOULOG_FIREBASE_SYNC = Object.freeze({
    // false にすると同期UIが一切表示されず、アプリは従来どおり動作する。
    enabled: true,

    sdkVersion: '12.16.0',

    firebaseConfig: Object.freeze({
        apiKey: 'AIzaSyD5ATQmwYmoYur31NxfdOl_WxQbup0a3jE',
        authDomain: 'gaitoulog.firebaseapp.com',
        projectId: 'gaitoulog',
        appId: '1:1054043325148:web:faf7b49a8b0fc85c056a19',
        messagingSenderId: '1054043325148',
    }),

    // App Check（reCAPTCHA Enterprise）を使う場合のみ true にする
    appCheck: Object.freeze({
        enabled: false,
        enterpriseSiteKey: '',
    }),
});
