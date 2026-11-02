#!/usr/bin/env node
/**
 * 組み立てのあとに、**公開で配る物の全体**に対応表（source map・`.map`）が 1 本も無いことを数える。
 *
 * Sentry へ対応表を送る組み立てでは、送ったあとに配る物から消す（next.config.ts の deleteSourcemapsAfterUpload）。
 * 消し忘れると、元のコードが誰にでも読める。配った 1 本を開いて 404 を見るだけでは全体の証明にならず、
 * Vercel の配備のファイル一覧は元のコードの一覧で配る物ではない（Git からの配備には無い）ので、組み立ての場で全部を数える。
 *
 * 数えるのは、そのまま配られる置き場（`.next/static` と `public`）。サーバーの中（`.next/server`）は配られないので数えない。
 *
 * **読めなかったものを 0 件と言わない。** 置き場の中で読めない場所・想定外の近道（symlink）があれば数えられないとして
 * 止める。`.next/static` が無い・空・js と css が 0 本なら、組み立てを数えていないので止める。`public` が無いのは
 * 「無い」（ENOENT）のときだけ許す。1 本でも `.map` があれば組み立てを止める。結果は組み立ての記録に 1 行で残る
 * （閲覧の鍵の `run.mjs logs --kind build` で読める）。
 */
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC_DIRS = [
  { dir: ".next/static", required: true },
  { dir: "public", required: false },
];

/** 数えられない状態。0 件として扱わず、組み立てを止める。 */
export class UncountedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UncountedError";
  }
}

function walk(dir, base, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new UncountedError(`読めない場所があります（${path.relative(base, dir) || "."}・${error?.code ?? "不明"}）。数えられないので 0 件と言いません`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new UncountedError(`想定外の近道（symlink）があります（${path.relative(base, full)}）。先を数えずに 0 件と言わないため止めます`);
    if (entry.isDirectory()) walk(full, base, found);
    else if (entry.isFile()) found.push(full);
    else throw new UncountedError(`ファイルでも置き場でもないものがあります（${path.relative(base, full)}）`);
  }
}

export function countPublicSourcemaps(base = root) {
  const result = { scanned: [], files: 0, scripts: 0, maps: [] };
  for (const { dir, required } of PUBLIC_DIRS) {
    const full = path.join(base, dir);
    let stat;
    try {
      stat = lstatSync(full);
    } catch (error) {
      if (!required && error?.code === "ENOENT") continue;
      throw new UncountedError(`${dir} を確かめられません（${error?.code ?? "不明"}）。${required ? "組み立てのあとに走らせてください" : ""}`);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new UncountedError(`${dir} が置き場ではありません（近道かファイル）。数えられないので止めます`);
    result.scanned.push(dir);
    const found = [];
    walk(full, base, found);
    const scripts = found.filter((file) => /\.(m?js|css)$/.test(file)).length;
    if (required && scripts === 0) throw new UncountedError(`${dir} に js と css が 1 本もありません。組み立てを数えていないので 0 件と言いません`);
    result.files += found.length;
    result.scripts += scripts;
    result.maps.push(...found.filter((file) => file.endsWith(".map")).map((file) => path.relative(base, file)));
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let result;
  try {
    result = countPublicSourcemaps();
  } catch (error) {
    console.error(`公開の配り物の対応表: 数えられませんでした。${error instanceof Error ? error.message : "不明"}`);
    process.exit(1);
  }
  console.log(`公開の配り物の対応表（.map）: ${result.maps.length} 件（${result.scanned.join("・")} の ${result.files} ファイル・うち js と css ${result.scripts} 本を数えた）`);
  if (result.maps.length > 0) {
    console.error(`公開で配る置き場に対応表が残っています。元のコードが誰にでも読めるので組み立てを止めます: ${result.maps.slice(0, 5).join(" ")}${result.maps.length > 5 ? " ほか" : ""}`);
    process.exit(1);
  }
}
