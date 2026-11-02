import { build } from "esbuild";
import {buildPageImages} from "./page-images.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * コメント機能のウィジェットを、入口 1 本と、あとから読む部品（src/widget/dist/comments-widget-chunk-*.js）にまとめる。
 *
 * 出来上がりは 2 つ。どちらも git に入れてあるので、この手順を踏まなくてもデプロイは通る。
 * 中身を直すときは src/widget/*.ts のほうを直す。
 *
 *   src/widget/dist/comments-widget.js … 縮めた本体
 *   src/widget/dist/stamp.json         … 中身から決まる短い印（**印の出どころはここ 1 つ**）
 *
 * 印は「中身が変わったら名前も変わる」ようにするためのもの。
 * 名前が変われば古いものを 1 年持たせても事故らないので、配信側は印つきの行き先を
 * 長期・immutable で配る。差し込む側（src/lib/pages/content.ts）と配る側の両方が stamp.json を読む。
 *
 * 縮めるのは esbuild の minify ひとつだけ。ソースマップは出さない:
 *   - 出すと本体と同じくらいの大きさの .map が増え、git にも関数バンドルにも乗る
 *   - 配るには行き先をもう 1 つ用意することになり、社外にも読める口が増える
 *   - 手元では src/widget/*.ts をそのまま読めるし、`pnpm build:widget` で縮めない版も作れる
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

/** 配る本体の置き場。配信側（src/app/comments-widget.js）もここを読む。 */
export const WIDGET_FILE = path.join(root, "src/widget/dist/comments-widget.js");
/** 印の置き場。差し込む側と配る側が、そろってここを読む。 */
export const STAMP_FILE = path.join(root, "src/widget/dist/stamp.json");

/**
 * 中身から印を決める。
 *
 * 同じ中身なら必ず同じ印、1 文字でも違えば違う印。URL の一部になるので、
 * 英小文字と数字だけの短い形にそろえる。
 */
export function stampOf(source) {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

/**
 * ウィジェットを組み立てて、出来上がった中身をそのまま返す。
 *
 * 縮めない版も作れるようにしてあるのは、検査表が「配っているものが本当に縮んでいるか」を
 * 同じ設定で作った縮めない版と見比べて確かめるため。
 */
export async function buildWidget({ outfile = WIDGET_FILE, minify = true } = {}) {
  const outdir = path.dirname(outfile);
  const name = path.basename(outfile, ".js");
  // 前の組み立てで分けた部品を消す（名前に中身の印が入るので、残すと積もる）
  for (const file of await readdir(outdir).catch(() => [])) {
    if (file.startsWith(chunkPrefix(name))) await rm(path.join(outdir, file));
  }
  const result = await build({
    entryPoints: { [name]: path.join(root, "src/widget/comments/comments.ts") },
    outdir,
    bundle: true,
    // 入口 1 本と、あとから読む部品に分ける（docs/design/app-speed.md の「道具箱の部品を分ける」）。
    // スライドの直接編集の部品（見本集・縮小図を含めて 3MB 超）は編集を始めるときに読み（src/widget/editor/editor.ts の openDeckEdit）、
    // 記事を読むだけの人には送らない。ページへは `<script type="module">` で差し込む（src/lib/pages/content.ts）
    format: "esm",
    splitting: true,
    chunkNames: `${chunkPrefix(name)}[hash]`,
    target: ["es2020"],
    charset: "utf8",
    legalComments: "none",
    minify,
    write: false,
    banner: {
      js: "/* 生成物。直接編集しない。元のコードは src/widget/*.ts、作り直しは `pnpm build:widget`。 */",
    },
  });
  let entry = null;
  for (const file of result.outputFiles) {
    // Zod's generated helper templates contain indented blank lines. esbuild preserves
    // those spaces inside the bundle, which makes the tracked artifact fail diff checks.
    const clean = file.text.replace(/[ \t]+$/gm, "");
    await writeFile(file.path, clean);
    if (path.resolve(file.path) === path.resolve(outfile)) entry = Buffer.from(clean);
  }
  if (entry === null) throw new Error("ウィジェットの入口を組み立てられませんでした");
  return entry;
}

/** 分けた部品の名前の頭。配る側（src/app/comments-widget.js）はこの頭と中身の印だけの名前を受ける。 */
export function chunkPrefix(name = path.basename(WIDGET_FILE, ".js")) {
  return `${name}-chunk-`;
}

/**
 * 入口が読み込みの最初に必ず取りに行く部品（静的な import をたどった全部）。差し込む側（src/lib/pages/content.ts）が
 * 入口と同時に取りに行かせる（modulepreload）ので、入口を読み終えてから部品を頼む 1 往復が消える。
 * あとから読む部品（import()）は数えない——読むだけの人に送らないために分けたもの。
 */
export function staticChunks(outfile = WIDGET_FILE) {
  const dir = path.dirname(outfile);
  const found = [];
  const queue = [path.basename(outfile)];
  while (queue.length > 0) {
    const text = readFileSync(path.join(dir, queue.shift()), "utf8");
    // 縮めた形では `from"./…"`、縮めない形では `from "./…"`。どちらも静的な import だけを拾う（`import("./…")` は拾わない）
    for (const match of text.matchAll(/(?:\bfrom|\bimport)\s*"\.\/([^"]+\.js)"/g)) {
      if (found.includes(match[1])) continue;
      found.push(match[1]);
      queue.push(match[1]);
    }
  }
  return found.sort();
}

/** 組み立て直して、本体と印の両方を書き出す。 */
async function main() {
  await buildPageImages();
  // 見本集の生成器と生成物が食い違っていないかの確認。配布用リポジトリには生成物だけを入れる
  // （生成器が読む見本の原本は配らない）ので、生成器があるときだけ確かめる。
  const library = path.join(root, "scripts/build/deck-library.mjs");
  if (existsSync(library)) execFileSync(process.execPath, [library, "--check"], { stdio: "inherit" });
  const source = await buildWidget();
  const stamp = stampOf(source);
  await writeFile(STAMP_FILE, `${JSON.stringify({ stamp, preload: staticChunks() }, null, 2)}\n`);
  const kb = (source.length / 1024).toFixed(1);
  console.log(`src/widget/dist/comments-widget.js を作りました（${kb} KB・印 ${stamp}）`);
}

// 直に叩かれたときだけ組み立てる。検査表は stampOf と buildWidget を借りに来るだけなので、
// 読み込んだ拍子に src/widget/dist を書き換えられると困る。
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
