# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

## このリポジトリの決まり（配布版の Pages）

受講生が自分の Vercel・Neon に置いて使う、1 人 1 サイトの資料置き場。導入と使い方は [README.md](README.md)、見た目の決まりは [DESIGN.md](DESIGN.md)。
ここに書いてあるファイルと検査は、全部このリポジトリに実在する。無いものを前提に書かない。

### 置き場（どこに何があるか）

ルートに置くのは案内（README・AGENTS・DESIGN・LICENSE）と設定だけ。動かすものは `src/`、確かめるものは `tests/`、人が叩く道具は `scripts/`、読むものは `docs/`。

- `src/app/` 画面と API（Next.js の App Router）。`src/auth.ts`・`src/proxy.ts`・`src/instrumentation.ts` もここ。
- `src/lib/` サーバー側の部品。分野ごとのフォルダ（`access/` `identity/` `pages/` `revisions/` `comments/` `deck/` `page-agent/` `workspace/` `organization/` `settings/` `logging/` `html/` `i18n/` など）。台帳の JSON も分野のフォルダの中（`settings/environment.json`・`organization/tenant-tables.json`・`logging/log-ledger.json`）。
- `src/widget/` ブラウザ側の束ね元（`comments/` `reading/` `editor/` `deck/` `shared/`）。`src/widget/dist/` は組み立て結果で、`pnpm build:widget` が作り直す（git にも入れてある）。
- `src/templates/` 実行時に読む雛形（HTML と JSON）。`src/deck-design/` はスライドの共通部品の元（`pnpm build:deck-design` が `src/templates/deck-design.html` に貼る）。
- `.claude/skills/` 受講生が AI に頼むスキル。`.claude-plugin/` はこのリポジトリ自体を Claude Code のプラグイン `pages` にする設定で、`scripts/setup/skills.mjs`（`personal.mjs configure` からも呼ぶ）が本人の Claude Code の設定に書き足し、Cursor（`~/.cursor/skills`）・Codex（`~/.agents/skills`）へ近道を張る。どれも写しを作らずこのフォルダを読むので、スキルの手順書は「いま開いているフォルダは別の場所」を前提に `<リポジトリ>/…` で書く（見張りは `tests/unit/skills-connection.test.mjs`）。
- `bin/` 投稿コマンドとエージェントの口。`vendor/` 外から取ってきてそのまま配るもの。`db/migrations/` PostgreSQL の移行。`public/` は空（資料の中身を置かない）。
- `tests/checks/` 検査表（`check-*.mjs`・控えの `baseline.json`・架空の資料 `fixtures/`・ブラウザで見る `browser/`）。`tests/unit/` node の単体テスト。`tests/e2e/` Playwright。`tests/support/` テストの土台（使い捨てのアプリ・保存先）。
- `scripts/build/` 組み立て。`scripts/generate/` 見本・カタログの生成。`scripts/setup/` 設置（診断・初期化・控え）。`scripts/dev/` 手元で動かす道具と red-test の門。`scripts/ci/` 検査の番人（`run-checks`・変えた分だけの選択・依存と大きさの見張り）。`scripts/rules/` 台帳の決まり（機能のスイッチ・ログ）。`scripts/i18n/` 文言の道具。
- `docs/guides/` 決まり（i18n・ログ・機能のスイッチ・検証・スライドの見た目）。`docs/design/` 設計メモ。`docs/evidence/` 計測の控え。
- git に入れてある生成物（スライドの部品・コメント部品・スクリプトの許可表）は `pnpm build:generated` で正しい順にまとめて作り直す。後のものが前のものを中に含むので、個別に作るときもこの順（`build:deck-design` → `build:widget` → `document-policy`）。依存の更新で検査が「組み立て直すと変わる」と落ちたら、まずこれ。
- 新しいファイルは、この区分のどれかに置く。ルート直下と `src/lib/` `src/widget/` の直下には足さない。

### 最初に

- 設置した本人の環境だけを使う。提供元のサーバーへ通信する口・提供元の宛先の既定値を足さない（番人は `tests/checks/check-distribution-clean.mjs`）。
- サーバー側で有料の AI・外部 API を呼ばない。AI は本人の手元（Claude Code / Cursor）で動く。
- 設定が足りないときは閉じる側で止め、設置の案内（`src/lib/settings/setup-error.ts`・README の章を指す）を出す。鍵の値を画面・ログ・応答に出さない。
- コードを直す人が手元で動かすのは `pnpm dev:local`（使い捨ての PostgreSQL・画像はファイルの置き場・本人としてログイン省略。リポジトリの写しの上で動くので、直しは自動で写しへ届く）。`.env.local` に本物の鍵を置くのは Google ログインを試すときだけ。

### ページと素材

- ページの呼び名は `internal/**`（招待した人だけ・既定）と `public/**`（門なし公開）の 2 系統だけ。保存先の `visibility` が `restricted` でも呼び名は `internal/...` のまま（呼び名を動かすと素材の置き場が動いて画像が割れる）。
- **見てよいかを決めるのは `src/lib/access/access.ts` の `canViewPage` ただ 1 つ。** 入口（画面・素材・コメント・OGP・履歴）ごとに書き比べない。公開ページの道具（コメント・履歴）の可否も `canUsePageTools` ただ 1 つ。直せる人は `canEditPage` ただ 1 つ。
- 素材は Vercel Blob に **必ず `access: "private"`** で置き、鍵は `<visibility>/<slug>/<相対パス>`（`src/lib/pages/assets.ts` が正本）。素材もページ HTML も静的配信せず、必ず Route Handler（`src/app/internal` / `src/app/public`）を通す。`public/` に資料の中身を置かない。
- 素材はサーバーが中身を受け取って置く（`src/app/api/pages/upload`。1 ファイル 4MB）。ブラウザから保管庫へ直接上げない。
- HTML 内の相対パスは配信時の `<base>` が支える（`withAssetBase`）。投稿時に URL を書き換えない。Tailwind / Lucide / Mermaid は `vendor/` から配り、保管庫の HTML は外の行き先のまま、配信時にだけ付け替える（`withVendorScripts`）。
- 保存される HTML は `src/lib/html/document-security.ts` で検査し、配信時にも実行制限を掛ける。許可表は信頼できる雛形から作った `src/templates/document-policy.json`（雛形を変えたら `node scripts/build/document-policy.mjs`）。受信した HTML を自動で許可しない。
- 全ページ常時 noindex（応答の頭・meta・robots.txt の三枚重ね）。招待した人だけのページの OGP に題名・要約を載せない。

### 本文と履歴

- 正本は PostgreSQL の `pages` / `page_revisions`。積むのは `src/lib/pages/store.ts` の `commitRevision`、読むのは `src/lib/revisions/revisions.ts`。版は**追記専用**で、保存先の番人が書き換えと削除を拒否する。直しは新しい版として積む。
- 版の目印は「親の目印 + 呼び名 + 版番号 + 書いた人 + 時刻 + 本文」から計算した 40 桁（`src/lib/revisions/version-id.ts`）。材料の順序と形を変えない。
- ブラウザの編集（`src/app/api/pages/edit`）・手元の AI の口（`src/app/api/pages/agent`）・投稿（`bin/pages-publish.mjs`）はどれも同じ `commitRevision` を通る。保存には土台の版の目印（`baseVersionId`）が必須で、ずれていたら 409（黙って後勝ちにしない）。
- ページを直すときは先にいまの本文を取り寄せる（`pages-publish get` → `src/app/api/pages/source`）。白紙から書き直す導線を作らない。
- スライド（deck）は HTML そのものが正本（`<body data-deck>` → `<main data-deck-slides>` → `<section data-deck-slide>`。`src/lib/deck/deck.ts` が目印の SSoT・実行部は `src/templates/deck.html` をページに丸ごと貼る）。公開のスライドの共有カードの絵は枚そのものを描く（`src/lib/deck/card/card.ts`・`src/lib/deck/card/card-image.ts`・入口は `src/app/api/og` だけ。招待した人だけのページに絵を渡さない）。新しいスライドの見た目は `docs/guides/deck-design.md`・`src/lib/deck/design/design.ts`・`src/deck-design/`（`pnpm build:deck-design` で貼る一式を作る）。編集は HTML の変更箇所だけを操作として保存する（`src/lib/deck/edit/model.ts` / `src/lib/deck/edit/source.ts`）。

- コメントの一覧は、見ている間だけ数秒ごとに読み直す。いつ読み直すかは `src/widget/comments/live.ts` ただ 1 つが決め、数は `src/lib/comments/live-refresh.ts` の定数だけ（放置したタブで保存先を起こし続けない。設計は `docs/design/live-comments.md`・番人は `tests/checks/check-live-refresh.mjs`）。
- 清書の「新しい版があります」（`src/widget/reading/page-latest.ts`）は自分では聞きに行かず、この読み直しの答えの `currentVersion` を受け取るだけ。読んでいた場所の控えと戻し（読み込み直し・版を移る・幅・目次から戻る）は `src/widget/reading/position.ts` ただ 1 つ。読み上げは端末の中の声だけでサーバーを呼ばず、声と速さはブラウザにだけ控える（`src/lib/read-aloud/settings.ts`）。番人は `tests/checks/check-reading-place.mjs`。

### 名乗りと鍵

- 認証は Auth.js v5（Google）。`src/auth.ts` の `signIn` は Google が確かめたアドレスかだけを見る。設置した本人（`PAGES_OWNER_EMAIL`）が持ち主、ほかの人は招待された資料だけを見る（`src/lib/organization/member-organization.ts`・`src/lib/settings/site-settings.ts`）。
- コメントの「誰が書いたか」はサーバーだけが決める（`src/lib/identity/identity.ts`）。応答にメールアドレスを載せず、自分のものかは `mine` で返す。
- 投稿の認証は投稿用の鍵（`src/lib/identity/publish-tokens.ts`・保管庫にはハッシュだけ）。**「トークン」という語を人に見せない**（画面・コマンドの出力・エラー文に出さない）。鍵の持ち主は `currentIdentity` でも本人として名乗る（`currentIdentity` がヘッダも読む。入口ごとに `ownerFromRequest` を足さない）。コメントの読み書き・解決・履歴・本文の直しなど、画面でログインした本人ができることは、既にある鍵のままでできる（再発行は要らない）。投稿・取り寄せ・素材の口だけは鍵専用（`ownerFromRequest`）。CLI のコメント操作は `pages-publish comments`。
- 投稿コマンドの控えは `~/.config/<deployment.json の configDir>/` の下だけ。ツールやリポジトリの名前を変えるときも、ここ 1 か所と README を直す。

### 設定・機能・ログ

- 環境変数の正本は `src/lib/settings/environment.json`。`.env.example` と設置の診断（`scripts/setup/personal.mjs doctor`）はここから作る（`node -e 'import("./scripts/setup/environment.mjs").then(m=>...)'` で書き出す）。読む名前を足したら台帳にも足す（`check-features.mjs` が落とす）。
- 機能の台帳は `src/lib/settings/features.ts`。入口は `featureAvailable` / `featureEnabled` で引く。機能のスイッチ（出す日を選ぶ環境変数）は `docs/guides/feature-switches.md` の決まりで、台帳は `src/lib/settings/environment.json` の `featureSwitch`。
- ツールの名前は `PAGES_SITE_NAME`（`src/lib/settings/site-settings.ts` の `siteName`）。タブ・ログイン画面・サイドバー・共有カードはここから引き、名前を書き写さない。
- サーバーのログは `src/lib/logging/server-log.ts` の `logEvent` ただ 1 つ（決まりは `docs/guides/server-logs.md`）。生の `console.*` を書かない。入口（`src/app/**/route.ts`）は `routeLog` で包み、`src/lib/logging/log-ledger.json` に載せる。添える項目は `src/lib/logging/log-fields.json` / `src/lib/logging/log-record.ts` の一覧にあるものだけ。
- 画面に出る文はすべて辞書から引く（`src/lib/i18n/messages/ja/<分野>.ts` と同じ鍵の `en/`。手引きは `docs/guides/i18n.md`）。字を継ぎ足して文を作らず、`{name}` の差し込みで 1 文にする。

### DB

- 移行は `db/migrations/`（接続は PostgreSQL だけ）。新しい設置は `scripts/setup/database.mjs init` が全部を順に当てる。既存の移行ファイルは書き換えない（直すときは打ち消す移行を足す）。
- 変更は「足す → 移す → 縮める」の段を踏む。列・表を消す、名前を変える、NOT NULL を付けるのは別の変更に分ける。
- 新しい表を作るなら、同じファイルで RLS を有効にする。通常運転の役割（`pages_runtime_…`）の権限は初期化が付ける。
- 組織に属する表は `orgDb(organization)`（`src/lib/db/database.ts`）からしか触らない。台帳は `src/lib/organization/tenant-tables.json`。この設置の組織は 1 つ（`src/lib/organization/scope.ts` の `FIRST_ORGANIZATION`）。

### 直したら確かめる

- `pnpm check:changed`（変えたファイルに関係する検査表だけ）→ `pnpm verify`（点検 → 検査表 → 組み立て）。合否の正本は CI の全検査（`.github/workflows/quality.yml`）。
- 検査表は `tests/checks/` に置き、`scripts/ci/run-checks.mjs` が全部走らせる。**項目数が控え（`tests/checks/baseline.json`）より減ったら失敗**。項目を増やしたときだけ `pnpm check --update`。検査が使う HTML は `tests/checks/fixtures/` の架空の資料。
- ブラウザの通し検査は `pnpm test:e2e`（`tests/e2e/`・Playwright。サーバーは `tests/support/serve-app.mjs` が使い捨ての PostgreSQL で起こす）。本物の PostgreSQL の確認は `pnpm test:postgres`。node の単体テストは `pnpm test:runner`。
- TypeScript は厳格運用。`any` と `as` によるキャスト逃げを使わない。

### 不具合の直し方

1. 事実（再現の手順・出た文面・件数）と推測を分けて書く。
2. 不具合を再現する落ちるテストを先に書き、落ちるのを確かめる（`node scripts/dev/red-test.mjs -- <テストのコマンド>`）。
3. 直す。
4. 同じテストが通るのを確かめる。先に書いたテストを削ったり弱めたりしない。

枝の名前が `fix/…` のとき、Claude Code は 2 より前に本体を直そうとすると止める（`.claude/settings.json` → `scripts/dev/red-test-gate.mjs`）。

### デザイン原則（UI の新規作成・修正・レビューのすべてに常時適用）

具体のトークンは DESIGN.md が正本。UI に触る前に読む。

1. 階層の第一言語はタイポグラフィと余白。線・囲み・帯・色はデフォルトで悪。
2. 色の用途は 3 つに制限（ベース 90% / アクセント 8% / シグナル 2%）。色で階層・カテゴリを作らない。
3. スケール外の値を発明しない。余白・フォント・角丸は定義済みトークンのみ。
4. 役割ごとに正規部品は 1 つ。似た部品を新設しない。
5. パッチワーク禁止。指摘箇所だけ直さず、SSoT まで遡って全体で揃える。
6. UI に絵文字を使わない。アイコンは SVG（Lucide）。
7. 押した結果は返事を待たずに映す。動かすのは透明度・位置・色だけ。長さとカーブは `src/lib/settings/ui-motion.ts` の目盛りだけ（番人は `tests/checks/check-ui-motion.mjs`）。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
