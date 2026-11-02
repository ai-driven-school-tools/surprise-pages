import { isPersonalEdition, siteOrigin } from "@/lib/settings/site-settings";
import { readFileSync } from "node:fs";
import path from "node:path";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";

/**
 * 投稿コマンドそのものを配る受け口。
 *
 * なぜ要るか。クラウドの作業場（Cursor のクラウドエージェントなど）は毎回まっさらで、
 * 投稿コマンドが無い。取ってくる先は非公開の置き場（GitHub）しか無く、会社の入室
 * ルールでそこへ届かない席がある。すると「投稿コマンドが無い → 名乗りも作れない
 * （作れるのは投稿コマンドだけ）」で、どちらも動かなくなる。ここはその輪を切る。
 *
 * **合図（ログイン）を求めないのは意図的。** 求めると、名乗りを持っていない席は
 * 取り寄せられず、名乗りを作る唯一の道具も取り寄せられない——同じ輪に戻る。
 *
 * 配ってよい理由は 1 つだけ。**この 3 本に鍵が 1 つも入っていない**こと。
 * 取った人にできるのは中身を読むことだけで、投稿には名乗りが要る。名乗りは
 * 会社の Google アカウントでしか作れない（`src/auth.ts` の門）。
 *
 * だから守る線も 1 つだけ。**配る名前を増やさない。** 一覧を外から決められる形
 * （要求された名前をそのまま道筋にする）へ書き換えないこと。書き換えた瞬間、
 * ここは「設定でも鍵でも読み出せる窓口」になる。検査表がこの一覧を見張っている。
 */

/** 配る現物。ここに載っているものだけを配る（名前は URL の一区切りそのもの）。 */
const CLI_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  "pages-publish": { file: "bin/pages-publish", type: "text/plain; charset=utf-8" },
  "pages-publish.mjs": { file: "bin/pages-publish.mjs", type: "text/javascript; charset=utf-8" },
};

/**
 * 持たせる長さ。中身は入れ替わる（この置き場が新しくなれば変わる）ので、短く。
 *
 * 全員に同じものを配る場所なので、配信網に載せてよい。
 */
const BRIEF = "public, max-age=300";

function readAll(): Record<string, string> {
  const loaded: Record<string, string> = {};
  for (const [name, one] of Object.entries(CLI_FILES)) {
    try {
      loaded[name] = readFileSync(path.join(process.cwd(), one.file), "utf8");
    } catch {
      // 読めなければ配らない（下で 404 になる）。ここで throw すると全ページが道連れになる
    }
  }
  return loaded;
}

/**
 * 現物を 1 度だけ読んで、以後は使い回す。
 *
 * ここへ置いてよいのは「全員に同じもの」だけ（この実行環境では 1 つの入れ物の中で
 * 複数の要求が同時に走り、モジュールの変数はその全員で共有される）。この 3 本は
 * 誰に配っても同じものなので置いてよい。
 */
const CLI_SOURCES: Record<string, string> = readAll();

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<Response> {
  return routeLog("/cli/[name]", _request, async () => {
    const { name } = await context.params;
    const one = CLI_FILES[name];
    const body = CLI_SOURCES[name];
    if (one === undefined || body === undefined) {
      return new Response("not found", { status: 404 });
    }

    const first = body.startsWith("#!") ? body.indexOf("\n") + 1 : 0;
    const prefix = `process.env.PAGES_EDITION = "personal"; process.env.PAGES_HOST = ${JSON.stringify(isPersonalEdition() ? siteOrigin() : "")};\n`;
    const source = isPersonalEdition() && name === "pages-publish.mjs"
      ? body.slice(0, first) + prefix + body.slice(first)
      : body;
    return new Response(source, {
      headers: {
        "content-type": one.type,
        "cache-control": BRIEF,
      },
    });
  });
}
