# セキュリティ方針

このリポジトリとGitHub Pagesの配信物は公開情報です。公開できない情報は、ソースコード・設定・ドキュメント・テストデータ・Git履歴に保存しません。

## 保存・コミットしてはいけない情報

- サービスアカウントJSON、秘密鍵、証明書秘密鍵
- OAuthクライアントシークレット、アクセストークン、更新トークン
- GitHub、AWS、OpenAI、Slack、Stripe等の秘密キー
- パスワード、Cookie、セッションID
- 実在人物の氏名と連絡先、メールアドレス、電話番号、住所を含む活動データ
- CSV、Excel、SQLite、バックアップ等の実データファイル
- 個人用メールアドレスを含むGitコミット作者情報

Firebase Webアプリの `apiKey`、`authDomain`、`projectId`、`appId` はブラウザへ配布される公開設定値です。ただし、そのAPIキーはGoogle Cloud Consoleで必要なFirebase APIのみに制限し、Firestore Security Rulesと承認済みドメインを必ず設定します。Gemini等、秘密扱いが必要なAPIキーをブラウザ設定へ入れてはいけません。

## 自動検査

作業中に次を実行します。

```bash
node scripts/check-sensitive-data.mjs
node scripts/check-firebase-config.mjs
```

コミット前フックは、次の設定を一度行うと有効になります。

```bash
git config core.hooksPath .githooks
git config user.email "GitHubの数値ID+ユーザー名@users.noreply.github.com"
```

フックはステージ済みファイルとGit作者メール設定を検査し、検出した値自体は画面へ表示しません。GitHub Actionsは、現在のファイル、最新コミットの作者メール、取得可能な全Git履歴のファイル内容をpush／pull requestごとに検査します。

## アプリの活動記録

利用者がアプリへ入力した記録は、ブラウザのIndexedDBと、ログイン時は本人のFirebase領域に保存されます。Gitリポジトリには保存されません。備考、ボランティア名、住所には必要最小限の情報だけを入力し、共有端末ではログイン状態を維持しないでください。

設定画面のバックアップファイルには、全アカウントの活動記録が備考やボランティア名を含めてそのまま入ります。共有フォルダやチャットへ置かず、端末内か本人だけがアクセスできる保存先で管理してください。

## 流出を発見した場合

1. 該当キーやトークンを提供元で直ちに無効化・再発行する
2. Firebase／クラウドのアクセスログと請求状況を確認する
3. ファイルを削除するだけでなく、必要に応じてGit履歴からも除去する
4. 修正した履歴を公開先へ反映し、利用者へ影響を案内する

履歴の書き換えだけでは秘密情報は無効になりません。必ず先に認証情報を失効させます。
