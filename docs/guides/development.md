# 配布物に手を入れる人へ（手元で動かす・確かめる・仕組みを知る）

AI に改造させるときも、人が直すときも、ここから入ります。決まりは [AGENTS.md](../../AGENTS.md)。受講生の設置と使い方は [README.md](../../README.md)。

## 手元だけで動かす（Vercel・Neon・Google なしで）

```bash
pnpm dev:local
```

使い捨ての PostgreSQL をこのパソコンの中に作って配布版として初期化し、`http://127.0.0.1:3148` に起動します。画像や動画の置き場もこのパソコンの中のファイル（Vercel Blob の代わり）なので、投稿・閲覧・コメント・スライドの編集・画像の追加まで、Vercel と Neon なしで一通り試せます。設置した本人（`owner@example.com`）としてログインを省いて入れるので、投稿・共有・コメント・編集・管理画面まで試せます。終了（Ctrl+C）すると保存先ごと消えます。

本物の Google ログインを手元で試すときは、`.env.local` に README 第 3-9 章の設定（`DATABASE_URL` は手元の PostgreSQL）を入れて `pnpm dev` で起動し、Google Cloud の戻り先に `http://localhost:3000/api/auth/callback/google` を足します。

## 直したら確かめる

```bash
pnpm check:changed   # 変えたファイルに関係する検査表だけ（数秒〜）
pnpm verify          # 書き方の点検 → 検査表（全部）→ 組み立て
pnpm test:runner     # node の単体テスト
pnpm test:postgres   # 本物の PostgreSQL で初期化・権限・復旧を確かめる
pnpm test:e2e        # ブラウザの通し検査（Playwright。初回は pnpm exec playwright install chromium）
```

検査表は `tests/checks/` にあり、項目数が控え（`tests/checks/baseline.json`）より減ったら失敗します。配る前の番人（`tests/checks/check-distribution-clean.mjs`）は、提供元の宛先や社名が README と LICENSE 以外に残っていたら止めます。

GitHub に push すると、`.github/workflows/quality.yml` が同じ検査を回します。

## どう作られているか

- 本文と履歴の正本は PostgreSQL の `pages` / `page_revisions`（版は追記専用）。保存は `src/lib/pages/store.ts`、閲覧の可否は `src/lib/access/access.ts` の `canViewPage` ただ 1 つ。
- 画像は非公開の Blob に置き、配信は必ず Route Handler（`src/app/internal` / `src/app/public`）を通す。
- 設定の正本は `src/lib/settings/environment.json`（`.env.example` と診断はここから作る）。機能の台帳は `src/lib/settings/features.ts`。
- 画面の文はすべて `src/lib/i18n/messages/` の辞書から引く（日本語・英語）。
- 設計の背景は `docs/` にある（決まりは `docs/guides/`、設計メモは `docs/design/`）。見た目の決まりは [DESIGN.md](../../DESIGN.md)。

置き場の地図:

```
src/        動かすもの   app/（画面と API）  lib/（サーバー側の部品。分野ごと）  widget/（ブラウザ側）  templates/（実行時に読む雛形）
tests/      確かめるもの checks/（検査表）  unit/（単体テスト）  e2e/（ブラウザの通し検査）  support/（テストの土台）
scripts/    人が叩く道具 build/  generate/  setup/  dev/  ci/  rules/  i18n/
docs/       読むもの     guides/（決まり）  design/（設計メモ）  evidence/（計測の控え）
bin/        投稿コマンド      vendor/  外から取ってきて配るもの      db/migrations/  PostgreSQL の移行
```

詳しい区分は [AGENTS.md](../../AGENTS.md) の「置き場」。
