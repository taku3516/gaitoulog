# Googleログインによる複数端末同期 — 導入手順

このアプリは既定ではブラウザ内（IndexedDB / localStorage）にのみデータを保存します。
以下の設定を行うと、**Googleでログインした場合にかぎり**、複数端末間でデータが同期されるようになります。

ログインは任意です。設定しない場合も、ログインしない場合も、アプリはこれまでどおり動作します。

---

## 全体像

| 層 | ファイル | 役割 |
| --- | --- | --- |
| 設定 | `data/firebase-config.js` | Firebase のウェブ設定値。既定は `enabled: false` |
| 同期 | `js/sync/app-sync.js` | Firebase SDK の読み込み、認証、Firestore 同期 |
| 橋渡し | `js/sync/bridge.js` | アプリ本体とクラウドの唯一の接点 |
| ルール | `firebase/firestore.rules` | サーバー側の権限・入力検証 |
| 検査 | `scripts/check-firebase-config.mjs` | 設定漏れ・秘密情報混入の検出 |

アプリ本体（`js/store.js` や各画面）は Firebase を一切参照しません。

---

## 1. Firebase プロジェクトを作成する

1. [Firebase コンソール](https://console.firebase.google.com/) で「プロジェクトを追加」
2. プロジェクト名を入力（例: `gaitoulog`）
3. Google アナリティクスは不要（オフでよい）

## 2. Google ログインを有効化する

1. 左メニュー **Authentication** →「始める」
2. **Sign-in method** タブ → **Google** を選択 → 有効にする
3. プロジェクトのサポートメールを選択して保存

## 3. 承認済みドメインを追加する

1. **Authentication** → **Settings** → **承認済みドメイン**
2. 公開先のドメインを追加する

   - GitHub Pages の場合: `taku3516.github.io`
   - `localhost` は既定で登録済み（ローカル確認用）

> ここに無いドメインからのログインは `auth/unauthorized-domain` で失敗します。

## 4. Firestore を作成する

1. 左メニュー **Firestore Database** →「データベースの作成」
2. **本番環境モード** を選択（テストモードは全公開なので使わない）
3. ロケーションは `asia-northeast1`（東京）などを選択

## 5. セキュリティルールを公開する

1. **Firestore Database** → **ルール** タブ
2. このリポジトリの `firebase/firestore.rules` の内容をすべて貼り付ける
3. 「公開」

このルールは次を保証します。

- 認証済み本人の `users/{uid}/...` 以外はすべて拒否
- Google ログイン以外のプロバイダを拒否
- ドキュメントIDの形式（`^[a-zA-Z0-9_-]{1,80}$`）
- フィールド構成（`hasOnly`）、型、件数上限、文字数上限
- `schemaVersion == 1` と `syncedAt == request.time`

> **記録の項目を追加したときは、必ずこの手順をやり直してください。**
> ルールの許可リスト（`hasOnly`）に無い項目を含む記録は書き込みが拒否され、
> クラウドの内容で画面が作り直されたときに、その記録が端末から消えたように見えます。
> `node scripts/check-firebase-config.mjs` を実行すると、アプリが送る項目と
> `firebase/firestore.rules` の許可リストのズレを検出できます。

## 6. ウェブアプリの設定値を貼り付ける

1. **プロジェクトの設定**（歯車）→ 「マイアプリ」→ ウェブアプリ（`</>`）を追加
2. 表示される `firebaseConfig` の値を `data/firebase-config.js` に転記
3. `enabled` を `true` に変更

```js
window.GAITOULOG_FIREBASE_SYNC = Object.freeze({
    enabled: true,
    sdkVersion: '12.16.0',
    firebaseConfig: Object.freeze({
        apiKey: 'AIza....',
        authDomain: 'gaitoulog.firebaseapp.com',
        projectId: 'gaitoulog',
        appId: '1:123456789:web:abcdef',
        messagingSenderId: '123456789',
    }),
    appCheck: Object.freeze({ enabled: false, enterpriseSiteKey: '' }),
});
```

> **これらの値は秘密情報ではありません。** ウェブアプリの設定値は公開される前提のもので、
> 実際の防御はセキュリティルールと承認済みドメインが担います。
> 一方、**サービスアカウントの JSON / `private_key` / OAuth クライアントシークレットは絶対にコミットしないでください。**

## 7. 設定を検査する

```bash
node scripts/check-sensitive-data.mjs
node scripts/check-firebase-config.mjs
```

秘密情報・個人情報らしき文字列、設定漏れ、ルールファイルの不備を検出します。
検出時も秘密値そのものは表示せず、ファイル名・行番号・種類だけを表示します。

コミット前の自動検査を有効にするため、このリポジトリで一度だけ次を実行してください。

```bash
git config core.hooksPath .githooks
git config user.email "GitHubの数値ID+ユーザー名@users.noreply.github.com"
```

GitHub Actionsでも、pushとpull requestのたびに現在のファイルとGit履歴を検査します。
検査を回避するための `--no-verify` は使用しないでください。

### ルールのテスト（任意）

Firestore エミュレータでセキュリティルールを実際に検証できます（Java が必要）。

```bash
cd firebase
npm install --no-save firebase-tools firebase @firebase/rules-unit-testing

# 別のターミナルでエミュレータを起動
npx firebase emulators:start --only firestore --project demo-gaitoulog

# テストを実行
node rules.test.mjs
```

他人の `uid` パスへの読み書きが拒否されること、未知のフィールド・型違い・
文字数超過・件数超過が拒否されることを確認します。

---

## 8. 2台での動作確認

1. 端末A でアプリを開き、ログインせずに活動記録をいくつか入力する
2. 設定タブ →「Googleでログイン」
   → 入力済みの記録がクラウドへ引き上げられる（**消えないこと**を確認）
3. 端末B で同じ Google アカウントでログイン
   → 端末A の記録が表示されることを確認
4. 端末B で記録を1件追加
   → 数秒以内に端末A の一覧へ反映されることを確認
5. 端末B で記録を1件削除
   → 数秒以内に端末A からも消えることを確認
6. 端末A で「ログアウト」
   → **手順1で入力したログイン前の状態**に戻ることを確認
7. 端末A で再ログイン
   → クラウドの内容が再び表示されることを確認

### ログインの持続について

既定は**非永続ログイン**（`browserSessionPersistence`）です。ブラウザのタブを閉じるとログアウトされます。
「この端末でログイン状態を維持する」にチェックを入れた場合のみ `browserLocalPersistence` になります。
共用端末では、チェックを入れないでください。

Firestore のブラウザ永続キャッシュは有効化していません。ログアウト時にはクラウド由来のデータを
端末から消し、ログイン前のローカルデータへ戻します。

---

## 9. App Check（任意）

不正なクライアントからの API 利用を抑止したい場合に設定します。

1. Google Cloud で reCAPTCHA Enterprise のサイトキーを作成
2. Firebase コンソール → **App Check** → ウェブアプリに reCAPTCHA Enterprise を登録
3. `data/firebase-config.js` の `appCheck` を設定

```js
appCheck: Object.freeze({ enabled: true, enterpriseSiteKey: '6Lxxxx....' }),
```

`enabled: false` のときは App Check の SDK 自体を読み込みません。

---

## 10. データの削除と費用管理

### 利用者によるデータ削除

設定タブ →「クラウドのデータとアカウントを削除」から、次が順に実行されます。

1. Google の再ログインによる本人確認（`reauthenticateWithPopup`）
2. Firestore 上の全ドキュメントの削除（バッチ分割）
3. Authentication アカウントの削除（`deleteUser`）
4. ページの再読み込み

### 費用

想定される利用規模（1人あたり数千件の記録）では Firestore の無料枠に十分収まります。
念のため以下を設定しておくと安全です。

1. Google Cloud コンソール → **お支払い** → **予算とアラート**
2. 少額（例: 1,000円）の予算としきい値アラートを設定

Firestore の課金は主に**読み取り回数**で発生します。このアプリは `onSnapshot` による
差分購読を使っているため、起動時に全件を1回読み、以降は変更分のみになります。

---

## 保存されるデータについて

Firestore に保存されるのは、活動記録そのもの（日時・場所・配布枚数などの入力値）と
アカウント名の一覧だけです。メールアドレスや閲覧履歴は保存しません。

ただし、活動記録には**備考欄やボランティア名**など、入力次第で個人情報になりうる項目が含まれます。
これらはあなたの Firebase プロジェクト内に保存され、あなたの Google アカウントからのみ読み書きできます。
共同で運用する場合は、ボランティア名の扱いについて事前に合意しておくことをおすすめします。

---

## うまく動かないとき

| 症状 | 確認すること |
| --- | --- |
| 設定タブに同期の項目が出ない | `data/firebase-config.js` の `enabled` が `true` か |
| `auth/unauthorized-domain` | 手順3の承認済みドメインに公開URLのホスト名を追加したか |
| ログイン画面が出ない | ブラウザのポップアップブロックを解除したか |
| `Missing or insufficient permissions` | 手順5のルールを「公開」したか |
| 記録が同期されない | ブラウザの開発者ツールのコンソールにエラーが出ていないか |
| 取り込んだ記録がすぐ消える／「保存が拒否されました」と出る | ルールが古い可能性。`node scripts/check-firebase-config.mjs` を実行し、手順5でルールを公開し直す |
| 削除したアカウントや記録が再読み込みで戻る | 手順5のルールを公開し直したうえで、一度ログアウト→ログインし直す |
