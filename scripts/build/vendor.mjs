import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * ページが外から取ってきていた 3 本を、自前で配れるようにする。
 *
 * 組み立ては無い。取ってきたものを **1 バイトも削らず** そのまま置いてあるので、
 * ここがするのは「中身から印を計算して書き出す」だけ。
 * 印の考え方はコメント機能の部品（scripts/build/widget.mjs）とまったく同じ:
 * 名前に中身の印が入っていれば、1 年持たせても古いものが残らない。
 *
 *   vendor/tailwindcss/tailwind.js … 見た目の指定を作る道具（3.4.17・MIT）
 *   vendor/lucide/lucide.js        … 絵記号（1.31.0・ISC）
 *   vendor/mermaid/mermaid.js      … 図（流れ図・順序図）を文字から描く道具（11.17.2・MIT）
 *   vendor/echarts/echarts.js      … グラフを SVG で描く道具（6.1.0・Apache-2.0）
 *   vendor/stamp.json              … 中身から決まる印（**印の出どころはここ 1 つ**）
 *
 * **中身を減らさないのが肝**。ページは AI が自由に書くので、こちらが
 * 「使ってよいクラス・絵記号」を決め打ちすると、新しいものを使った瞬間に黙って崩れる。
 * 置き場所を自前へ移すだけにして、書ける幅は 1 ミリも狭めない。
 *
 * 版を上げるときは、下の一覧の `version` と `source` を直し、その URL から取り直して
 * ファイルを差し替え、`pnpm build:vendor` で印を取り直す。ライセンス表記も一緒に差し替える。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

/** 印の置き場。差し込む側（src/lib/pages/content.ts）と配る側（src/app/vendor）が、そろってここを読む。 */
export const VENDOR_STAMP_FILE = path.join(root, "vendor/stamp.json");

/**
 * 配る 3 本。`name` はそのまま URL の一区切りになる（`/vendor/<name>/<印>`）。
 *
 * `source` は取ってきた場所。**版を固定した URL** を書く。雛形が指しているのは
 * 版の付かない URL（`https://cdn.tailwindcss.com` と `https://unpkg.com/lucide@latest`）で、
 * それぞれ下の版へ転送される。転送先を書いておかないと、後から同じものを取り直せない。
 *
 * `maxBytes` は「取り込みが化けていないか」を見るための上限。**1 本ずつ持たせる**——
 * 全体で 1 つの上限にすると、太い部品を足すたびに細い部品の見張りまで緩む
 * （図の道具だけ桁が 1 つ大きい）。
 */
export const VENDOR_PARTS = [
  {
    name: "tailwind.js",
    file: "vendor/tailwindcss/tailwind.js",
    version: "3.4.17",
    source: "https://cdn.tailwindcss.com/3.4.17",
    /** 雛形が指している、版の付かない行き先。配信時にここを見つけて差し替える。 */
    cdn: "https://cdn.tailwindcss.com",
    license: "MIT",
    licenseFile: "vendor/tailwindcss/LICENSE",
    maxBytes: 1024 * 1024,
  },
  {
    name: "lucide.js",
    file: "vendor/lucide/lucide.js",
    version: "1.31.0",
    source: "https://unpkg.com/lucide@1.31.0/dist/umd/lucide.min.js",
    cdn: "https://unpkg.com/lucide@latest",
    license: "ISC",
    licenseFile: "vendor/lucide/LICENSE",
    maxBytes: 1024 * 1024,
  },
  /*
   * 図（流れ図・順序図など）を文字から描く道具。
   *
   * 配り元には形が 2 つあり、**全種類が入ったひとかたまり**（UMD・こちら）と、
   * 本体が種類ごとの小分けを後から取りに行く形（ESM の mermaid.esm.min.mjs）がある。
   * 後者は本体 1 本を置いても、図の種類ぶんの小分けを外へ取りに行ってしまうので、
   * 「外から取らず自前で配る」を守れない。だからひとかたまりのほうを置く。
   */
  {
    name: "mermaid.js",
    file: "vendor/mermaid/mermaid.js",
    version: "11.17.2",
    source: "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js",
    cdn: "https://cdn.jsdelivr.net/npm/mermaid",
    license: "MIT",
    licenseFile: "vendor/mermaid/LICENSE",
    maxBytes: 6 * 1024 * 1024,
  },
  {
    name: "echarts.js",
    file: "vendor/echarts/echarts.js",
    version: "6.1.0",
    source: "https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js",
    cdn: "https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js",
    license: "Apache License",
    licenseFile: "vendor/echarts/LICENSE",
    maxBytes: 2 * 1024 * 1024,
  },
];

/**
 * 中身から印を決める。
 *
 * コメント機能の部品と同じ決め方（sha256 の頭 12 文字）。同じ中身なら必ず同じ印、
 * 1 文字でも違えば違う印。URL の一部になるので英小文字と数字だけの短い形にそろえる。
 */
export function stampOf(source) {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

/** 置いてある現物を読む。 */
export function readVendorPart(part) {
  return readFileSync(path.join(root, part.file));
}

/** いまの現物から、書き出すべき印の一覧を作る。 */
export function vendorStamps() {
  return Object.fromEntries(
    VENDOR_PARTS.map((part) => {
      const source = readVendorPart(part);
      return [part.name, { stamp: stampOf(source), version: part.version, bytes: source.length }];
    }),
  );
}

/** 印を書き出す。 */
function main() {
  const stamps = vendorStamps();
  writeFileSync(VENDOR_STAMP_FILE, `${JSON.stringify(stamps, null, 2)}\n`);
  for (const part of VENDOR_PARTS) {
    const { stamp, bytes } = stamps[part.name];
    console.log(`${part.file}（${(bytes / 1024).toFixed(1)} KB・${part.version}・印 ${stamp}）`);
  }
}

// 直に叩かれたときだけ書き出す。検査表は一覧と印の計算を借りに来るだけなので、
// 読み込んだ拍子に vendor/stamp.json を書き換えられると困る。
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
