/**
 * ブラウザへ配る量を、組み立て結果から測って控えと比べる。判断は rules.mjs。
 *
 *   pnpm build && node scripts/ci/bundle-size/measure.mjs            比べる（増えていたら警告。赤にしない）
 *   pnpm build && node scripts/ci/bundle-size/measure.mjs --update   控え（baseline.json）を取り直す
 *
 * 測る入口:
 *   画面 /…        その画面を開いたときに最初に読む JavaScript と CSS（全画面共通の分を含む）
 *   全チャンクの合計 あとから読む分も含めた、アプリの JavaScript と CSS の全部
 *   コメントの部品・画像の部品  社内ページと公開ページに差し込む 2 本（src/widget/dist。コメントの部品は入口と、最初に必ず読む分けた部品の合計）
 * 外から取ってくるのをやめた道具（vendor/）は、1 本ずつの上限が別にある（scripts/build/vendor.mjs の maxBytes）。
 *
 * 増えても赤にしないが、**測れなかったときは赤**（組み立ての形が変わって見張りが黙って止まるのを防ぐ）。
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { UNIT, allowance, compare, kb, parseBaseline, screenName, signed } from "./rules.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const BASELINE = path.join(root, "scripts/ci/bundle-size/baseline.json");
const next = path.join(root, ".next");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--update")) throw new Error("引数が正しくありません（使えるのは --update だけ）");

const sizes = new Map();
function gzipped(file) {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(file), { level: 9 }).length);
  return sizes.get(file);
}
const total = (files) => [...new Set(files)].reduce((sum, file) => sum + gzipped(path.join(next, file)), 0);

function walk(directory, keep, found = []) {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) walk(full, keep, found);
    else if (keep(full)) found.push(full);
  }
  return found;
}

function measure() {
  if (!existsSync(path.join(next, "build-manifest.json"))) throw new Error("組み立て結果（.next）がありません。先に pnpm build");
  const shared = JSON.parse(readFileSync(path.join(next, "build-manifest.json"), "utf8")).rootMainFiles;
  if (!Array.isArray(shared) || !shared.length) throw new Error("全画面共通の読み込みが見つかりません");
  const measured = {};
  // 画面ごとの読み込みは、組み立てが画面の隣に書き出す一覧にある。中身は代入文なので、空の入れ物の中で読む。
  for (const file of walk(path.join(next, "server/app"), (name) => name.endsWith("page_client-reference-manifest.js"))) {
    const sandbox = { globalThis: {} };
    vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
    for (const [key, manifest] of Object.entries(sandbox.globalThis.__RSC_MANIFEST ?? {})) {
      if (key.startsWith("/_")) continue;
      const scripts = Object.values(manifest.entryJSFiles ?? {}).flat();
      const styles = Object.values(manifest.entryCSSFiles ?? {}).flat().map((entry) => entry.path);
      measured[`画面 ${screenName(key)}`] = total([...shared, ...scripts, ...styles]);
    }
  }
  if (!Object.keys(measured).length) throw new Error("画面ごとの読み込みの一覧が見つかりません");
  const chunks = path.join(next, "static/chunks");
  measured["全チャンクの合計"] = walk(chunks, (name) => /\.(js|css)$/.test(name)).reduce((sum, file) => sum + gzipped(file), 0);
  // 入口と、入口が最初に必ず読む部品（静かに import するもの）。編集を始めたときだけ読む部品（import(...)）は数えない
  const widgetDir = path.join(root, "src/widget/dist");
  const firstLoad = (file, seen = new Set()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    const text = readFileSync(path.join(widgetDir, file), "utf8");
    for (const found of text.matchAll(/(?:^|[;}\s])import(?:[^"'()]*?from)?\s*["']\.\/(comments-widget-chunk-[A-Z0-9]+\.js)["']/g)) firstLoad(found[1], seen);
    return seen;
  };
  measured["コメントの部品"] = [...firstLoad("comments-widget.js")].reduce((sum, file) => sum + gzipped(path.join(widgetDir, file)), 0);
  measured["画像の部品"] = gzipped(path.join(root, "src/widget/dist/page-images.js"));
  return Object.fromEntries(Object.entries(measured).sort(([a], [b]) => a.localeCompare(b, "ja")));
}

const measured = measure();
if (args.includes("--update")) {
  writeFileSync(BASELINE, `${JSON.stringify({ unit: UNIT, entries: measured }, null, 2)}\n`);
  console.log(`控えを取り直した（${Object.keys(measured).length} 入口）`);
  process.exit(0);
}

const baseline = parseBaseline(readFileSync(BASELINE, "utf8"));
const { grown, added, removed, shrunk } = compare(baseline, measured);
const lines = Object.entries(measured).map(([name, bytes]) => {
  const was = baseline[name];
  return `${name.padEnd(28, " ")} ${kb(bytes).padStart(9)}  ${was === undefined ? "控えなし" : `控え ${kb(was)}（${signed(bytes - was)}・余裕 ${kb(allowance(was))}）`}`;
});
console.log(`ブラウザへ配る量（${UNIT}）\n${lines.join("\n")}`);

const warnings = [
  ...grown.map((row) => `${row.name}: ${kb(row.was)} → ${kb(row.bytes)}（${signed(row.bytes - row.was)}）`),
  ...added.map((row) => `${row.name}: 控えに無い入口（${kb(row.bytes)}）`),
  ...removed.map((row) => `${row.name}: 控えにあるのに測れなかった（控え ${kb(row.was)}）`),
];
for (const row of shrunk) console.log(`減った ${row.name}: ${kb(row.was)} → ${kb(row.bytes)}（控えを取り直すと、次に増えたときに気づける）`);
const HOW = "増やすと決めたら PR の本文に理由を書き、pnpm build && node scripts/ci/bundle-size/measure.mjs --update で控えを取り直す";
for (const warning of warnings) {
  console.log(`警告 ${warning}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=ブラウザへ配る量が基準より増えた::${warning}。${HOW}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, warnings.length
    ? `### ブラウザへ配る量が基準より増えた\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n\n${HOW}。\n`
    : `ブラウザへ配る量: 基準の範囲内（${Object.keys(measured).length} 入口）\n`);
}
console.log(warnings.length ? `\n基準より増えた入口が ${warnings.length} 件（警告だけ。検査は通す）。${HOW}` : "\n基準の範囲内");
