/**
 * スライドの共有カードの絵（src/lib/deck/card/card-image.ts）が、Vercel の上で実行時に読むものを
 * 組み立ての前に `.deck-card-runtime/` へ用意する。
 *
 *   bin/    … Lambda 向けに固めた Chromium（@sparticuz/chromium の bin をそのまま写す）
 *   fonts/  … 日本語の書体（Noto Sans JP・Noto Serif JP）を TTF に戻したもの
 *
 * node_modules の中を直に関数の包みへ入れると、pnpm の繋ぎ（symlink）越しのファイルになり、
 * Vercel が包みを断る。写したものはふつうのファイル。
 *
 * 書体は vendor/deck-fonts にある woff2（配信用）を TTF に戻す。Chromium の書体の仕組み（fontconfig）は
 * woff2 を読めない。Lambda 向けの Chromium は欧文の書体しか持たないので、これが無いと日本語が「□」で出る。
 * 外から取りに行かない——出どころは vendor/ の 1 か所（manifest.json）。
 */
import { copyFile, mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const target = path.join(root, ".deck-card-runtime");

/** TTF に戻す書体。fontconfig の落ち先として使うので、字の多いゴシックと明朝の 2 つだけ。 */
const FONT_IDS = ["noto-sans-jp", "noto-serif-jp"];

// 1. Chromium の bin をそのまま写す（展開は実行時に /tmp へ）
// 直接の依存なので root の node_modules に繋ぎがある（package.json は exports に無く解決できない）
const binSource = path.join(root, "node_modules/@sparticuz/chromium/bin");
const binTarget = path.join(target, "bin");
await mkdir(binTarget, { recursive: true });
let copied = 0;
for (const name of await readdir(binSource)) {
  const from = path.join(binSource, name);
  const to = path.join(binTarget, name);
  const [a, b] = await Promise.all([stat(from), stat(to).catch(() => null)]);
  if (b === null || b.size !== a.size) {
    await copyFile(from, to);
    copied += 1;
  }
}

// 2. 書体を TTF に戻す
const { decompress } = require("wawoff2");
const manifest = JSON.parse(await readFile(path.join(root, "vendor/deck-fonts/manifest.json"), "utf8"));
const fontTarget = path.join(target, "fonts");
await mkdir(fontTarget, { recursive: true });
let fonts = 0;
for (const id of FONT_IDS) {
  const face = manifest.find((item) => item.id === id);
  if (face === undefined) throw new Error(`vendor/deck-fonts/manifest.json に ${id} が無い`);
  const to = path.join(fontTarget, `${id}.ttf`);
  const marker = path.join(fontTarget, `${id}.source`);
  const before = await readFile(marker, "utf8").catch(() => null);
  if (before === face.sha256 && (await stat(to).catch(() => null)) !== null) continue;
  const woff2 = await readFile(path.join(root, "vendor/deck-fonts", face.file));
  const ttf = await decompress(new Uint8Array(woff2));
  await writeFile(to, ttf);
  await writeFile(marker, face.sha256);
  fonts += 1;
}

console.log(`.deck-card-runtime に Chromium（写し ${copied} 件）と書体（戻し ${fonts} 件）を用意しました`);
