/**
 * スキルが組むページを、サーバーの保存時の検査（src/lib/html/document-security.ts の documentProblems）がそのまま受け取るかの検査表。
 *
 * 起きたこと: 許可表（src/templates/document-policy.json）は src/templates/ の雛形だけから作られていて、スキルがページを組む額縁
 * （.claude/skills/_shared/references/base.html）の仕掛けが入っていなかった。社内版は組織の設定で検査を飛ばせるので気づけず、
 * 配布版では清書（clean-copy）も図解（explain-page）も投稿が全部「未確認の仕掛け」で断られた。
 * 清書の試験は投稿を偽物に差し替えて回すので、サーバーが受け取るかは誰も見ていなかった。
 *
 * ここで見ること:
 *   1. 許可表が材料と食い違っていない（材料を直して作り直し忘れたら落ちる。scripts/build/document-policy.mjs --check）
 *   2. スキルの見本の HTML（.claude/skills の references/ の下）が全部通る（新しい額縁を足して許可表に入れ忘れたら落ちる）
 *   3. 清書の本物の変換器（.claude/skills/clean-copy/scripts/run.py）で同梱の原本を組んだページが全部通る
 *      （図の一式・表示形式の違いで混ざる仕掛けも含めて、投稿の直前と同じものを見る）
 */
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { dir, root } from "./paths.mjs";

const run = promisify(execFile);
let failures = 0;
function check(label, test) {
  try { test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}

const out = `${dir}/skill-pages.cjs`;
await build({ stdin: { contents: `export { documentProblems, documentPolicy } from "./src/lib/html/document-security";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "error" });
const { documentProblems, documentPolicy } = createRequire(import.meta.url)(out);
process.env.PAGES_EDITION = "personal";
process.env.PAGES_SITE_URL ??= "https://pages.example.com";

console.log("--- 許可表が材料と一致する ---");
const policy = spawnSync(process.execPath, [`${root}/scripts/build/document-policy.mjs`, "--check"], { encoding: "utf8" });
check("許可表が材料から作り直したものと同じ", () => assert.equal(policy.status, 0, policy.stderr.trim()));
const policySources = JSON.parse(readFileSync(`${root}/src/templates/document-policy.json`, "utf8")).sources.map((one) => one.name);
check("スキルの額縁が許可表の材料に入っている", () => assert.ok(policySources.includes("base.html"), policySources.join(", ")));

console.log("--- スキルの見本が保存時の検査を通る ---");
const skills = `${root}/.claude/skills`;
const references = readdirSync(skills, { recursive: true, encoding: "utf8" })
  .map((name) => name.split(path.sep).join("/"))
  .filter((name) => name.endsWith(".html") && name.split("/").includes("references") && !name.split("/").includes("fixtures"));
check("見本の HTML が見つかる", () => assert.ok(references.includes("_shared/references/base.html"), references.join(", ")));
for (const name of references) {
  const html = readFileSync(`${skills}/${name}`, "utf8");
  check(`${name} は断られない`, () => assert.deepEqual(documentProblems(html), []));
}

console.log("--- 保存時に通した外の見た目は、配信時の実行制限でも読める ---");
// 保存時の検査が外の見た目（Google Fonts の書体の指定）を通しても、配信時の制限で止めると、
// 書体だけ黙って代わりのもので出て、ブラウザに違反の記録が残る（2026-10-13、清書のページで見つかった）
const directives = new Map(documentPolicy("<p>本文</p>").split(";").map((one) => one.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
for (const name of references) {
  const html = readFileSync(`${skills}/${name}`, "utf8");
  const sheets = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)].map((tag) => /\bhref="([^"]+)"/.exec(tag[0])?.[1]).filter((href) => href?.startsWith("https://"));
  for (const href of sheets) {
    const origin = new URL(href).origin;
    check(`${name} の見た目の指定（${origin}）を配信時に読める`, () => assert.ok(directives.get("style-src")?.includes(origin), directives.get("style-src")?.join(" ")));
    if (origin === "https://fonts.googleapis.com") {
      check(`${name} の書体の本体（https://fonts.gstatic.com）を配信時に読める`, () => assert.ok(directives.get("font-src")?.includes("https://fonts.gstatic.com"), directives.get("font-src")?.join(" ")));
    }
  }
}

console.log("--- 清書の変換器で組んだページが保存時の検査を通る ---");
const python = ["python3", "python"].find((command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
check("Python が使える", () => assert.ok(python, "python3 も python も見つかりません"));
const fixtures = `${skills}/clean-copy/fixtures`;
const cases = readdirSync(fixtures)
  .filter((name) => existsSync(`${fixtures}/${name}/case.json`))
  .map((name) => ({ name, ...JSON.parse(readFileSync(`${fixtures}/${name}/case.json`, "utf8")) }))
  // 止まる判定の既定案を当てる原本は、了承を経てから組むので、投稿の 1 本道（publish）では組めない
  .filter((one) => one.convert !== false && !one.apply_defaults);
// 表示形式ごとに額縁へ差し込むものが変わるので、全部の形式を 1 度は通す
const runs = [
  ...cases.map((one) => ({ name: one.name, layout: one.layout ?? "default", public: one.public === true })),
  { name: "01-basic", layout: "manuscript", public: false },
  { name: "02-mermaid", layout: "manuscript", public: false },
];
check("試す原本が揃っている", () => assert.ok(runs.some((one) => one.name === "02-mermaid") && runs.some((one) => one.layout === "script"), runs.map((one) => one.name).join(", ")));
const results = python ? await Promise.all(runs.map(async (one) => {
  const work = mkdtempSync(`${dir}/clean-copy-`);
  const argv = [
    `${skills}/clean-copy/scripts/run.py`, "publish", `${fixtures}/${one.name}/in.md`, "--dry-run", "--no-git",
    "--slug", `checks/${one.name}`, "--layout", one.layout,
    "--out", `${work}/page-out`, "--work", `${work}/work.md`, "--report", `${work}/report.json`,
    ...(one.public ? ["--public", "--yes-public"] : []),
  ];
  const { stdout } = await run(python, argv, { cwd: work, maxBuffer: 32 * 1024 * 1024 }).catch((error) => ({ stdout: error.stdout ?? "" }));
  let report = {};
  try { report = JSON.parse(stdout); } catch { report = { error: stdout.slice(0, 200) }; }
  const page = existsSync(`${work}/page-out/index.html`) ? readFileSync(`${work}/page-out/index.html`, "utf8") : null;
  return { ...one, report, page };
})) : [];
for (const one of results) {
  const label = `${one.name}（${one.layout}${one.public ? "・公開" : ""}）`;
  check(`${label} が組める`, () => assert.ok(one.report.ok === true && one.page !== null, String(one.report.error ?? "")));
  check(`${label} は断られない`, () => assert.deepEqual(one.page === null ? ["組めていない"] : documentProblems(one.page), []));
}

if (failures > 0) process.exit(1);
