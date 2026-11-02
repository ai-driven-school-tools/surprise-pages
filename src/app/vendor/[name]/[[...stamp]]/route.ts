import { readFileSync } from "node:fs";
import path from "node:path";

import { VENDOR_STAMPS } from "@/lib/pages/content";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";

/**
 * ページが外から取ってきていた 3 本（見た目の指定を作る道具・絵記号・図の道具）を、自前で配る。
 *
 * `public/` に置いて素で配らないのは、このリポジトリの決まり（配信は必ず Route Handler を通す）に
 * そろえるため。中身自体に秘密は無く、誰に配っても同じものなので、長く持たせてよい。
 * 配る仕掛けは、コメント機能の部品を配っている受け口とまったく同じ形にしてある
 * （印つきは 1 年、印なし・印違いは短く）。新しい流儀を増やさない。
 *
 * 行き先は 2 通り。どちらも中身は同じで、持たせる長さだけが違う。
 *
 *   /vendor/<名前>/<印>  … いま差し込んでいるほう。中身が変われば名前も変わるので 1 年・immutable
 *   /vendor/<名前>       … 印なし。入れ替えの途中に古いページから来た要求のために短く持たせる
 *
 * 印は名前の 1 つ下の階層に置いている。Next の受け口は区切りまるごとしか変えられず、
 * `tailwind.<印>.js` のような**途中だけ変わる名前**を受けられないため。
 *
 * `public, max-age=N` と書くと、`s-maxage` を書かなくても Vercel の配信網に載る。
 * ここは全員に同じものを配ってよい場所なので、それでよい（社内ページの本文とは扱いが違う）。
 */

/** 配る現物の置き場。名前は URL に出る一区切りで、scripts/build/vendor.mjs の一覧と同じ。 */
const VENDOR_FILES: Readonly<Record<string, string>> = {
  "tailwind.js": path.join(process.cwd(), "vendor", "tailwindcss", "tailwind.js"),
  "lucide.js": path.join(process.cwd(), "vendor", "lucide", "lucide.js"),
  "mermaid.js": path.join(process.cwd(), "vendor", "mermaid", "mermaid.js"),
  "echarts.js": path.join(process.cwd(), "vendor", "echarts", "echarts.js"),
};

/** 印つきの行き先の持たせ方。名前が中身と一体なので、確認しに戻らせない。 */
const FOREVER = "public, max-age=31536000, immutable";
/** 印なし・印違いの行き先の持たせ方。名前が中身と一体でないので、すぐ確認しに戻らせる。 */
const BRIEF = "public, max-age=300";

function readAll(): Record<string, string> {
  const loaded: Record<string, string> = {};
  for (const [name, file] of Object.entries(VENDOR_FILES)) {
    try {
      loaded[name] = readFileSync(file, "utf8");
    } catch {
      // 読めなければ配らない（下で 404 になる）。ここで throw すると全ページが道連れになる
    }
  }
  return loaded;
}

/**
 * 現物を 1 度だけ読んで、以後は使い回す。
 *
 * **ここ（モジュールの変数）に置いてよいのは「全員に同じもの」だけ。**
 * この実行環境（Vercel Fluid Compute）では 1 つの入れ物の中で複数の要求が同時に走り、
 * モジュールの変数はその全員で共有される。利用者ごとに変わるもの
 * （ログインしている人・cookie・要求ごとの値）をここへ置くと、
 * 別の人の画面にその人のものが出る。この 3 本は誰に配っても同じものなので置いてよい。
 */
const VENDOR_SOURCES: Record<string, string> = readAll();

function missing(message: string): Response {
  return new Response(`/* ${message} */`, {
    status: 404,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string; stamp?: string[] }> },
): Promise<Response> {
  return routeLog("/vendor/[name]/[[...stamp]]", request, async () => {
    const { name, stamp } = await context.params;
    const rest = stamp ?? [];

    if (rest.length > 1) return missing(rt("errors.delivery.vendorRouteMissing"));

    const source = VENDOR_SOURCES[name];
    if (source === undefined) return missing(rt("errors.delivery.vendorPartMissing"));

    // 印が今のものと一致したときだけ長く持たせる。
    // 印違い（入れ替えの途中に古いページから来た要求など）は 404 にせず、
    // 今の中身を短い持ち時間で配る。ここで断ると、そのページの見た目だけが黙って崩れる。
    const forever = rest.length === 1 && rest[0] === VENDOR_STAMPS[name];

    return new Response(source, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": forever ? FOREVER : BRIEF,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
