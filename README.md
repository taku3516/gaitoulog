# 街頭活動ログ

品川区での街頭演説・街頭活動を記録し、振り返りや次回の活動計画に役立てるためのWebアプリ（PWA）です。

**公開アプリ:** [街頭活動ログを開く](https://gaitoulog.firebaseapp.com/)

> ホーム画面に追加して使う場合は、必ず上のURLから追加してください。
> 旧URL（`taku3516.github.io/gaitoulog/`）のままだと、Googleログインが完了できません。理由は
> [docs/firebase-sync-setup.md](docs/firebase-sync-setup.md) を参照してください。

## 主な機能

- 活動日時、場所、配布数、反応、メモなどの記録・編集・削除
- メモ文章から日付、時間帯、活動場所、配布数を読み取る入力補助
- 品川区内の活動場所カタログを利用した地域・地区の自動設定
- 活動履歴のフリーワード検索、絞り込み、CSV入出力
- 過去の記録を複製して、場所や段取りを引き継いだ入力
- 活動予定の登録と、当日のリマインド・Googleカレンダーや端末カレンダーへの登録
- 曜日・時間帯・場所・反応などの集計とグラフ表示
- 累積配布枚数と目標ペースの進捗、活動時間の長さ別の効率、ご無沙汰スポットの確認
- 分析の各ダッシュボードをPNG画像にして共有
- 週次・月次の振り返りレポート（前の期間との比較つき）
- 全データのバックアップと復元
- 過去の実績を基にした活動候補の提案
- 複数の活動者・アカウントの切り替え
- ホーム画面への追加に対応したPWA
- GoogleログインとFirestoreによる任意の複数端末同期

## データ保存とプライバシー

- ログインしない場合、活動データは利用中のブラウザ内（IndexedDBなど）に保存されます。
- Googleログインと同期を有効にした場合、活動データはログインした本人専用のFirestore領域にも保存されます。
- GitHubリポジトリへ活動記録が自動送信・保存されることはありません。
- メモや氏名などに個人情報を入力する場合は、必要最小限にしてください。共用端末では、利用後のログアウトやブラウザデータの管理にも注意してください。
- FirebaseのWeb設定には公開を前提とした識別情報が含まれますが、秘密鍵、サービスアカウント、管理用トークンなどはリポジトリへ保存しません。

詳しい設定と安全上の注意は、[SECURITY.md](SECURITY.md)と[Firebase同期設定ガイド](docs/firebase-sync-setup.md)を参照してください。

## 基本的な使い方

1. 公開アプリをブラウザで開きます。
2. 「入力」で活動内容を登録します。定型的なメモから項目を補完することもできます。
3. 「一覧」で過去の記録を確認・修正します。
4. 「おすすめ」と「分析」で、次回候補や活動傾向を確認します。
5. 複数端末で同期する場合のみ、「設定」からGoogleログインを利用します。

## ローカルでの実行

ビルドは不要です。リポジトリのルートで静的Webサーバーを起動してください。

```sh
python3 -m http.server 8080
```

その後、ブラウザで `http://localhost:8080` を開きます。JavaScriptモジュールやService Workerを利用するため、HTMLファイルを直接開く方法ではなく、HTTPサーバー経由で確認してください。

## セキュリティ検査

コミット前やPull Requestでは、秘密情報・個人情報らしき文字列とFirebase設定を自動検査します。手動でも次のコマンドで確認できます。

```sh
node scripts/check-sensitive-data.mjs
node scripts/check-sensitive-data.mjs --history
node scripts/check-firebase-config.mjs
node --test scripts/check-sensitive-data.test.mjs
node --test js/sync/auth-environment.test.mjs
```

検査で問題が見つかった場合は、値を削除しただけで公開済みとは限りません。[SECURITY.md](SECURITY.md)に従い、該当する認証情報の失効・再発行も行ってください。

## 主なファイル

| パス | 役割 |
| --- | --- |
| `index.html` | アプリ画面の入口 |
| `js/` | 入力、保存、同期、集計などの処理 |
| `data/` | 地域データと公開可能なFirebase Web設定 |
| `firebase/` | Firestoreのルールとインデックス |
| `firebase.json` / `.firebaserc` | Firebase Hostingへの公開設定 |
| `docs/` | 導入・運用ガイド |
| `scripts/` | 設定検査と秘密情報検査 |
| `SECURITY.md` | 秘密情報・個人情報の取り扱い方針 |

## 公開

正式な公開先は Firebase Hosting（<https://gaitoulog.firebaseapp.com/>）です。
Googleログインを成立させるには、アプリの公開ドメインと `authDomain` が同じである必要があるためです。

```sh
firebase deploy --only hosting
```

GitHub Pages（`taku3516.github.io/gaitoulog/`）への自動公開も当面は残していますが、
そちらではホーム画面のアプリからGoogleログインを完了できません。
