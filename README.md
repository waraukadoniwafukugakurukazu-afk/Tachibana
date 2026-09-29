# 橘祭 本番版（Cloudflare Workers + D1 + R2）

この版は、管理画面の変更を全閲覧者へ反映する本番構成です。

## 構成
- `public/` … 公開ページ
- `src/index.js` … API / 認証 / D1 / R2
- D1 … 学祭紹介、日付、ステージ、出店
- R2 … 地図・予定表画像
- Workers Static Assets … HTML/CSS/JS/集合写真

Cloudflareは新規WorkerでStatic Assetsを使えるため、フロントとAPIを1つのWorkerとして公開できます。

## 管理画面
公開後の `/admin.html` からログインします。
パスワードはリポジトリには書かず、Cloudflareの Secret `ADMIN_PASSWORD` に設定します。
ユーザー指定値: `1027`

さらに `SESSION_SECRET` に長いランダム文字列を設定してください。

## GitHub → Cloudflare の最短手順
1. このZIPを展開し、中身を `Tachibana` リポジトリ直下へ入れる。
2. Cloudflare Dashboard → Workers & Pages → Create → Import a repository から `Tachibana` を選ぶ。
3. Build command: `npm install`
4. Deploy command: `npx wrangler deploy`
5. WorkerのBindingsで D1 `DB` と R2 `IMAGES` が作成/接続されていることを確認。
6. Worker Settings → Variables and Secrets で以下を追加:
   - `ADMIN_PASSWORD` = `1027` （Secret）
   - `SESSION_SECRET` = 任意の長いランダム文字列（Secret）
7. 再デプロイ。
8. `/admin.html` を開き、1027でログイン。

`wrangler.jsonc` はD1/R2の自動プロビジョニングを利用できる形です。Dashboard/GitHub deploy時はCloudflare側でリソースが作成される場合があります。もしD1が自動作成されない場合はDashboardで `tachibana-db` を作り、binding名を `DB` にしてください。R2もbucketを作成してbinding名 `IMAGES` で接続してください。

## セキュリティ
`1027` はソースコードに入れていません。Cloudflare Secretとして設定するため、公開HTML/JSから直接見えません。
管理Cookieは HttpOnly / Secure / SameSite=Strict、12時間で期限切れです。

## 補足
DBテーブルはAPI初回アクセス時に自動作成されます。`schema.sql` も同梱しています。
画像は1枚10MBまでです。
