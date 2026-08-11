# セキュリティ確認レポート

## 概要

2026年8月11日、作業ツリーの現行28ファイルに加え、GitHubから取得した公開 `main`（`5589ca9`、30ファイル）と取得可能な全Git履歴のファイル内容を検査しました。公開してはいけない秘密鍵、サービスアカウントJSON、OAuthクライアントシークレット、アクセストークン、実在人物の連絡先はファイル内容から検出されませんでした。

`data/firebase-config.js` のFirebase Web設定はブラウザへ配布される公開識別子です。秘密情報ではありませんが、API制限・Firestore Security Rules・承認済みドメインの実運用設定はリポジトリ外にあるため、Firebase／Google Cloud Consoleで別途確認が必要です。

## 対応済み

### SBP-001: 将来の秘密情報・個人情報混入を自動で阻止

- 重要度: High
- 場所: `scripts/check-sensitive-data.mjs:19-180`
- 対応: `scripts/check-sensitive-data.mjs` を追加
- 検査範囲: 現行ファイル、ステージ済みファイル、全Git履歴
- 保護: 検出結果へ秘密値を出さず、ファイル名・行番号・種類だけを表示
- 自動化: `.githooks/pre-commit` と `.github/workflows/security.yml`

### SBP-002: 秘密情報・実データの無視設定が不足

- 重要度: Medium
- 場所: `.gitignore:6-32`
- 対応: `.env`、鍵、サービスアカウント、CSV、Excel、DB、バックアップ、`private/`、`exports/` を追加
- 補足: `git add -f` のような強制追加にも、コミット前検査とCIで対応

### SBP-003: 設定検査が検査対象JavaScriptを実行

- 重要度: High
- 場所: `scripts/check-firebase-config.mjs:27-110`
- 旧実装: `new Function` による設定ファイル評価
- 影響: 未信頼の設定変更を検査すると、開発者権限でコードが実行される可能性
- 対応: JavaScriptを実行せず、固定形式のリテラル値だけを解析する方式へ変更

## 現在の注意事項

### SBP-004: Gitコミット作者の個人用メールアドレスが履歴に含まれる

- 重要度: Medium
- 場所: 公開 `main` のコミットメタデータ
- 状況: 調査時点の21コミットすべてでGitHub noreply形式ではない作者メールを確認
- 対応: この作業ツリーの `user.email` をGitHub noreply形式へ変更し、検査スクリプトで設定値と最新コミットを自動確認
- 未対応: 既存 `main` 履歴から完全に除くには全履歴の書き換えとforce pushが必要なため、自動実施しない

### SBP-005: Firebaseの実運用設定はリポジトリだけでは確認できない

- 重要度: Medium
- 場所: `data/firebase-config.js:18-29`、`firebase/firestore.rules:14-112`
- 確認事項:
  - ブラウザAPIキーを必要なFirebase APIだけに制限
  - Gemini／Generative Language API等を許可しない
  - 承認済みドメインを必要最小限に限定
  - 公開中のFirestoreルールが `firebase/firestore.rules` と一致
  - 必要に応じてApp Checkを有効化

## 個人情報の扱い

`js/dummy-data.js` の姓は生成用の一般的な例示データで、連絡先や個人を特定する組み合わせはありません。利用者が入力する活動記録はIndexedDB／本人用Firestoreに保存され、GitHubへは保存されません。CSV出力をリポジトリ内へ置いた場合は、無視設定と自動検査がコミットを防止します。
