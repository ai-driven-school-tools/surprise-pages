# サーバーのログ

サーバーで何かが失敗したとき、「どの入口で・どの行で・どの要求で」起きたかがログ 1 行で分かるようにする決まり。
同時に、本文・題名・メールアドレス・ページの呼び名はログに出さない。

## 1 行の形

1 件は 1 行の JSON。Vercel は標準の出力をそのまま拾うので、送り先の道具は持たない。

```json
{"time":"2026-10-01T14:27:10.728Z","level":"error","event":"request.unhandled","route":"/devices","requestId":"c025b67db84543bb","organization":"00000000-0000-4000-8000-000000000001","version":"1534efe…","env":"preview","durationMs":12.3,"error":{"kind":"Error","at":"isAdmin (.next/server/chunks/lib_1oobgz0.js:392:155)","stack":["…"],"code":"23505"},"fields":{"method":"GET","routeType":"render","digest":"650147766"}}
```

| 欄 | 何か |
| -- | -- |
| `time` / `level` | 時刻と重さ（`info` / `warn` / `error`）。重さは標準の出力の口（log / warn / error）に対応する |
| `event` | 出来事の名前。`request.failed` のように `.`／`-`／`_` で区切った小文字だけ |
| `route` | **受け口の型**（置き場所。`/internal/[...slug]` のような字面）。実際の道筋は書かない |
| `requestId` | 要求の目印（16 桁の 16 進）。失敗した応答の見出し `x-request-id` と同じ値 |
| `organization` | 要求の組織の目印（uuid だけ）。入口の外では `null`。組織の名前・呼び名・宛先・ドメインは書かない |
| `version` / `env` | 組み立てたコミットと、どの環境か |
| `durationMs` | 入口に入ってからの時間 |
| `error` | 種類・起きた場所（`at`）・場所の一覧・決まった語彙の符号。文面は決めた型（設置の不足）のときだけ |
| `fields` | 添える項目。数と真偽はそのまま、文字は決めた名前と形のものだけ |

正本は `src/lib/logging/log-record.ts`（形と伏せ方。純関数）と `src/lib/logging/server-log.ts`（書き出す口 `logEvent`・入口の外枠 `routeLog`）。
検査は `tests/checks/check-server-log.mjs`。

## 伏せ方は「通してよい項目だけ通す」

「出してはいけない語を探して消す」方式は、知らない形の漏れが素通りする。逆に通してよい形を決め、それ以外は落とす。

- エラーの文面は残さない（保存先の重複の断り文には題名・呼び名・アドレスがそのまま入る）。残すのは種類・場所・符号。
- 受け口は型だけ。問い合わせ・日本語・空白が混ざる値は受け付けない（`route` が null になる）。
- 添える項目は `src/lib/logging/log-record.ts` の `STRING_FIELDS` / `LIST_FIELDS` に載せた名前と形だけ。新しい項目を足すときはそこへ載せる。
- エラーの文面を通してよい型は `SAFE_MESSAGE_KINDS`。固定の文（コードに書いた題）しか持たない型だけ載せる。
- 組織は目印（小文字の uuid）だけ（`organizationIdOf`）。名前・呼び名・宛先・ドメインは利用者の名乗りに近いので、形で落ちる。

## 組織の印

障害を組織ごとに切り分けるため、1 行に要求の組織の目印（`organization`）を載せる。

- **置くのは入口の外枠だけ。** `routeLog`（アプリ向けの窓口は `apiV1`）が入口に入るときに、関所（`src/proxy.ts`・A5）が宛先から決めて付け直した
  見出し `x-pages-organization` を 1 度だけ読み（`currentOrganization()` が読むのと同じ見出し・同じ読み方 `organizationFromHeader`。ログのために
  組織を引き直さない）、要求の目印と同じ道で中のすべての行（裏で走る処理も）に付ける。外枠の外の失敗（画面の描画・操作）は、取りこぼしの受け皿
  （`src/instrumentation.ts`）が同じ見出しから付ける。
  `logEvent` を呼ぶ側は渡さない（渡すと `tests/checks/check-log-rules.mjs` が落ちる。外枠が置く項目の台帳は `src/lib/logging/log-fields.json` の `context`）。
- 見出しの無い要求（関所を通らない配り物・要求の外の脚本）は印なしで書き、要求そのものは止めない（推測で最初の組織に倒さない）。
- 定期処理（`/api/cron/views`）は根の宛先で動くので 最初の組織の目印が付く。中で回す組織ごとの掃除の内訳ではない。
  [監視の手引き](monitoring.md)、1 つの組織だけの急増の知らせは[本番の見張り](production-watch.md)、漏れが疑われるときの手順は[本番の知らせ](incident-response.md)。

## 書き方

```ts
import { logEvent, routeLog, inBackground } from "@/lib/logging/server-log";

// 入口（route.ts）は外枠で包む。字面は自分の置き場所（検査表が突き合わせる）
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/comments", request, async () => {
    // …中で呼ぶ logEvent は、受け口・目印・時間を自動で添える
  });
}

// アプリ向けの窓口は apiV1 が外枠を兼ねる
export const GET = apiV1("/api/v1/health", async () => { … });

// 応答を返したあとに走る処理は、元の要求の目印を連れて行く
after(inBackground("comment-notify", () => notifyComment(…)));

// 1 件書く
logEvent({ level: "error", event: "assets.sweep-failed", error });
logEvent({ level: "info", event: "cron.swept", fields: { step: "page-views", count: removed } });
```

- 既定では、うまくいった要求は書かない。書くのは、投げっぱなしの失敗（`request.crashed`）・5xx の応答（`request.failed`）・
  共通の後始末が受けた失敗（`request.failed`）・入口が捕まえなかった失敗（`request.unhandled`・`src/instrumentation.ts`）。
- スイッチ `PAGES_REQUEST_LOG` が `on` のときだけ、外枠が要求ごとに 1 行（`request.completed`・`info`）を足す。持つのは受け口の型・
  要求の目印・かかった時間・応答の番号（`fields.status`）だけ（。見張りの材料。決まりと量の見積もりは [監視の手引き](monitoring.md) の「ログの送り方」）。
  未設定なら 1 行も足さない。
- Next の合図（転送・見つからない・動的の印。`digest` が数字でない）は失敗ではないので書かない。
- 生の `console.*` を使わない。書くと `tests/checks/check-log-rules.mjs` が落ちる（。免除の一覧と台帳は `src/lib/logging/log-ledger.json`）。
- 入口・定期処理・自動実行を足したら、同じ台帳に「記録する／しない（理由）」を載せる。載せ忘れも同じ検査が落とし、直し方を出す。
- 添える項目（`fields`）は字面の `{ 名前: 値 }` で書く。一覧に無い名前は黙って落ちるので、同じ検査が呼ぶ側を見る。

## 保存先の失敗の符号（`error.code`）の読み方

保存先（`src/lib/db/database.ts`）が返す失敗の値は `{ code, message, status? }`。文面は決まった 1 文だけで、応答の本体・接続先・鍵・ヘッダは持たない。
`code` は次の順で決まり、どれも符号の形（大文字・数字・下線）なので、ログの `error.code` にそのまま残る。

| `code` の形 | 意味 |
| -- | -- |
| `23505`・`57014`・`PGRST205` など | 保存先（PostgreSQL / PostgREST）が自分で付けた符号。あればこれが最優先 |
| `HTTP_401`・`HTTP_503` など | 保存先の符号が無い断り。保存先の手前の受け口（API Gateway）が返した HTTP の状態 |
| `TIMEOUT` | 15 秒待っても応答が無かった |
| `ECONNRESET` などの Node の符号・`FETCH_FAILED` | つながらなかった（応答が無い） |
| `BAD_RESPONSE` | 成功の応答なのに中身が読めなかった |
| `DATABASE` | 上のどれにも当たらない失敗 |

`status` は REST の経路で応答があったときの HTTP の状態（数）。保存先の符号があるときも、何番で返ったかはここに残る。直結の PostgreSQL の経路には付かない。

### 読むだけの要求のやり直し（`database.read-retried`）

REST の経路の**読むだけの要求（GET）に限り**、受け口の一時的な失敗を 1 回だけ、短い決まった待ちのあとでやり直す。
書き込み（POST・PATCH・DELETE。関数の呼び出しも POST）はやり直さない——届いていたら二重の書き込みになる。

- やり直す失敗: 保存先の符号が無い 401・502・503・504・つながらなかったとき。時間切れ（`TIMEOUT`）はやり直さない。
- やり直したら、**成功しても警告を 1 行残す**。受け口の不調を黙って隠さないため。

```json
{"level":"warn","event":"database.read-retried","route":"/","fields":{"method":"GET","status":401,"reason":"http_401","result":"recovered"}}
```

| 項目 | 何か |
| -- | -- |
| `reason` | 1 回目の失敗の符号を小文字にした語（`http_401`・`http_503`・`econnreset`・`fetch_failed`） |
| `status` | 1 回目の HTTP の状態。応答が無かったときは付かない |
| `result` | `recovered`（2 回目で成功）か `failed`（2 回目も失敗。失敗の値の `code` は 2 回目のもの） |

`result: "failed"` が続くなら一時的な不調ではない（鍵が違うなどの設定の誤りは 2 回とも 401）。`recovered` が増えているなら、受け口の側を調べる合図。

## 失敗からログへたどる番号は 2 つ

| どこで起きた失敗か | 利用者・呼び出し側が持つ番号 | ログのどの欄と一致するか |
| -- | -- | -- |
| 入口（API など route.ts） | 失敗した応答の見出し `x-request-id` | `requestId` |
| 画面の描画・操作（Server Actions） | エラー画面の「この番号をお伝えください」（Next の照合用の番号 digest） | `fields.digest` |

```
ブラウザ ──要求──▶ 関所（src/proxy.ts。保存先を読む入口だけ）
                     │ 要求のヘッダ x-pages-request-id に目印を付ける（応答の見出しには触れない）
                     ▼
                 入口の外枠（routeLog）
                     │ 目印をログの requestId に写す（関所を通らなかった要求には、その場で付ける）
                     │ 失敗を書いたときだけ、応答の見出し x-request-id に同じ値を載せる
                     ▼
                 画面の描画の失敗 → 受け皿（src/instrumentation.ts）が digest をログに残す
                     ▼
                 エラー画面（src/app/error.tsx・global-error.tsx）が同じ digest を出す
```

- 送られてきた目印は使わず、関所が必ず付け直す。
- うまくいった応答には何も足さない。配り物（vendor・ウィジェット）や配信網に控えさせる応答を、要求ごとに変えないため。
- エラー画面の番号に digest を使うのは、失敗そのものに結び付いた値だから。「最後に届いた応答の目印」を画面で拾う形は、
  失敗のあとに別の要求（コメントの取得など）が走ると、そちらの番号が出てしまう。
  digest は同じ失敗（同じ文面と場所）なら同じ値になるので、引いた結果は時刻で絞る。
- 画面の操作で起きた失敗（digest が無い）には番号を出さない。サーバーのログが無いので引く先が無い。

## ログの引き方

Vercel の記録（Logs）で、応答の `x-request-id` の値か、エラー画面の番号を検索する。`route` で絞れば、入口の種類ごとの失敗が数えられる。

`error.at` は組み立て物の位置（`.next/server/chunks/…:行:桁`）。元のファイルの行へ結ぶのは、エラーの収集の仕組みを入れるときに
source map を送る形で行う。それまでは、同じコミットを手元で組み立てて該当の位置を開く。
