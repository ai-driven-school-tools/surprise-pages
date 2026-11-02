# 品質の検証

検査の存在・項目数と、実際に保証する動作を混同しない。合否の正本は CI（`.github/workflows/quality.yml`）の全検査。

## 実装済みの入口

| コマンド | 保証する範囲 |
| --- | --- |
| `pnpm verify` | 点検（lint）、検査表の全部、実際の組み立て |
| `pnpm check` | 検査表（`tests/checks/`）を全部。同時に走らせるので手元で 30 秒前後（`--jobs=1` で 1 枚ずつ）。項目数が控え（`tests/checks/baseline.json`）より減ったら失敗 |
| `pnpm check:changed` | 変えたファイル（origin/main との差と未コミット分）に関係する検査表だけ。関係が分からなければ全部走らせる |
| `pnpm test:runner` | node の単体テスト（`tests/unit/*.test.mjs`）。検査の欠落・項目ゼロ・控え破損・途中終了の検出を含む |
| `pnpm test:postgres` | 空の本物の PostgreSQL からの初期化、本人の照合、通常運転の役割の権限、暗号化した控えからの復旧 |
| `pnpm test:e2e` | 本番向けの組み立て＋使い捨ての PostgreSQL で、権限・記事の保存・コメント・スライドの入力・2 人の保存・同じサイトからの書き込みだけを通すことを本物のブラウザで確かめる（`tests/e2e/`） |
| `pnpm test:deck-loading` / `pnpm test:presenter` | スライドの読み込み・画像・発表者画面を本物のブラウザで |
| `pnpm test:app-speed` | 体感速度の測定（CI には入れていない。手元で見たいときだけ） |

ブラウザは `pnpm exec playwright install --with-deps chromium` で準備する。手元の Chrome を使う場合だけ
`PAGES_TEST_CHROME_CHANNEL=chrome pnpm exec playwright test --project=chromium`。

確認用サーバーと並行する場合は `PAGES_TEST_PORT` でポート、`PAGES_TEST_RUNTIME` で人工の入場券の置き場を分ける。

## 安全境界

- ブラウザ用のアプリは一時作業場へ複製し、環境ファイル・Git 履歴・控えを持ち込まない。
- 子プロセスの環境は許可した項目だけ（`tests/support/environment.mjs`）。保存先と署名の鍵は検査ごとに機械生成する。
- ログイン判定を迂回する機能は追加しない。既存の形の署名付きセッションで人工の利用者（設置した本人と招いた人）を再現する（`tests/support/serve-app.mjs`）。
- `.test-runtime/session.json` は人工の入場券だけを持つ一時記録。権限 600 で保存し、終了時に消す。Git と CI の成果物には入れない。
- 本番や外部サービスへの負荷試験はしない。本物の Google ログイン・本物の Blob は、この構成の検証済み対象に含めない。

## 変えた分だけ確かめる（`pnpm check:changed`）

どの検査表を走らせるかは、毎回 `scripts/ci/changed-checks.mjs` が検査表そのものから出す（手で書く対応表は持たない）。

- 検査表と、それが直に読み込む `scripts/` の部品の文面に出てくる道筋
- そこから import でつながるファイル（検査表が組み立て直して動かす `src/lib/` や `src/widget/` の先）
- 文面からは出せない分の控え `scripts/ci/check-inputs.json`（`pnpm check:inputs` で取り直す）

どの検査表にも結び付かないファイルを変えた・消したファイルがある・依存の版や検査の番人そのものを変えた・origin/main が手元に無いときは、選ばずに全部走らせる。

## CI

push と PR のたびに `Quality` が回る。仕事は 6 つ（検査表 2 分割・lint と単体・型と組み立て・PostgreSQL・ブラウザの通し 2 分割・ブラウザの単体）で、最後の `Quality gate` だけを保護された枝の必須検査に登録する。
1 回 10 分前後を目安にし、速度や負荷の測定は入れない（GitHub の無料枠に収めるため）。
