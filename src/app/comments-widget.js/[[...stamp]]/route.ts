import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { COMMENTS_WIDGET_STAMP } from "@/lib/pages/content";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";

/**
 * コメント機能のウィジェットを配る。
 *
 * `public/` に置いて素で配らないのは、このリポジトリの決まり（配信は必ず Route Handler を通す）に
 * そろえるため。中身自体に秘密は無く、誰に配っても同じものなので、長く持たせてよい。
 *
 * 行き先は 2 通り。どちらも中身は同じで、持たせる長さだけが違う。
 *
 *   /comments-widget.js/<印>  … いま差し込んでいるほう。中身が変われば名前も変わるので 1 年・immutable
 *   /comments-widget.js       … 印が付く前からある名前。すでに配られたページが読みに来るので短く持たせる
 *
 * 印は名前の 1 つ下の階層に置いている。Next の受け口は区切りまるごとしか変えられず、
 * `comments-widget.<印>.js` のような**途中だけ変わる名前**を受けられないため。
 *
 * `public, max-age=N` と書くと、`s-maxage` を書かなくても Vercel の配信網に載る。
 * ここは全員に同じものを配ってよい場所なので、それでよい（社内ページの本文とは扱いが違う）。
 */

const WIDGET_FILE = path.join(process.cwd(), "src", "widget", "dist", "comments-widget.js");

/** 印つきの行き先の持たせ方。名前が中身と一体なので、確認しに戻らせない。 */
const FOREVER = "public, max-age=31536000, immutable";
/** 印なし・印違いの行き先の持たせ方。名前が中身と一体でないので、すぐ確認しに戻らせる。 */
const BRIEF = "public, max-age=300";

function readWidget(): string | null {
  try {
    return readFileSync(WIDGET_FILE, "utf8");
  } catch {
    return null;
  }
}

/**
 * 部品の中身を 1 度だけ読んで、以後は使い回す。
 *
 * **ここ（モジュールの変数）に置いてよいのは「全員に同じもの」だけ。**
 * この実行環境（Vercel Fluid Compute）では 1 つの入れ物の中で複数の要求が同時に走り、
 * モジュールの変数はその全員で共有される。利用者ごとに変わるもの
 * （ログインしている人・cookie・要求ごとの値）をここへ置くと、
 * 別の人の画面にその人のものが出る。部品のファイルは誰に配っても同じ 1 本なので置いてよい。
 */
const WIDGET_SOURCE: string | null = readWidget();

/**
 * あとから読む部品（src/widget/dist/comments-widget-chunk-<中身の印>.js）。入口が `./comments-widget-chunk-….js` を読みに来るので、
 * 入口の行き先（/comments-widget.js/<印>）と同じ階層の名前で配る。名前に中身の印が入るので長く持たせてよい。
 * 受けるのはこの形の名前で、実際に組み立てた部品だけ（要求された名前をそのまま道筋にしない）。
 */
const CHUNK_NAME = /^comments-widget-chunk-[A-Z0-9]+\.js$/;
const CHUNKS: ReadonlyMap<string, string> = new Map(
  (() => {
    try {
      return readdirSync(path.dirname(WIDGET_FILE)).filter((name) => CHUNK_NAME.test(name));
    } catch {
      return [];
    }
  })().map((name) => [name, readFileSync(path.join(path.dirname(WIDGET_FILE), name), "utf8")]),
);

/**
 * 印の無い行き先・古い印の行き先に返す小さな読み込み役。入口は分けた部品を自分の行き先からの相対で読むので、
 * 古い行き先で入口そのものを返すと部品が見つからない。今の印の入口を読みに行かせる（従来の `<script defer>` で
 * 読まれても、`type="module"` で読まれても動く形）。
 */
const LOADER = `import(${JSON.stringify(`/comments-widget.js/${COMMENTS_WIDGET_STAMP}`)});\n`;

function javascript(source: string, cacheControl: string): Response {
  return new Response(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ stamp?: string[] }> },
): Promise<Response> {
  return routeLog("/comments-widget.js/[[...stamp]]", request, async () => {
    const { stamp } = await context.params;
    const rest = stamp ?? [];

    if (rest.length > 1) {
      return new Response("/* そのような行き先はありません */", {
        status: 404,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (WIDGET_SOURCE === null) {
      return new Response("/* コメント機能のウィジェットが見つかりません（pnpm build:widget） */", {
        status: 404,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // 印が今のものと一致したときだけ、入口を長く持たせて配る。
    if (rest.length === 1 && rest[0] === COMMENTS_WIDGET_STAMP) return javascript(WIDGET_SOURCE, FOREVER);
    const chunk = rest.length === 1 ? CHUNKS.get(rest[0]) : undefined;
    if (chunk !== undefined) return javascript(chunk, FOREVER);
    // 前の版の部品（公開をまたいで開いたままの画面が、あとから読みに来た）。中身の違うものを返さずに断る。
    // 読み込みが失敗すると、編集の入口が「開けませんでした」と告げる（src/widget/editor/editor.ts の openDeckEdit）
    if (rest.length === 1 && CHUNK_NAME.test(rest[0])) {
      return new Response("/* 前の版の部品です。ページを読み込み直してください */", {
        status: 404,
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }
    // 印違い（入れ替えの途中に古いページから来た要求など）は 404 にせず、
    // 今の入口を読みに行かせる役を短い持ち時間で配る。ここで断ると、そのページのコメントだけが黙って死ぬ。
    return javascript(LOADER, BRIEF);
  });
}
