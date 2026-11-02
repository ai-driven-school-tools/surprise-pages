/**
 * 部品の脆弱性の検査。判断は audit-rules.mjs。
 *
 *   node scripts/ci/deps/audit.mjs                 いまある指摘を一覧にする（赤にしない）
 *   node scripts/ci/deps/audit.mjs --base <コミット> そのコミットに無く、いまの作業場にだけある指摘が「高」以上なら赤
 *
 * CI では取り込み先のコミットを AUDIT_BASE で渡す。固定ファイルが取り込み先と同じなら通信せずに終わる
 * （部品を変えていない PR に時間を足さない）。比べる側を調べられなかったときは赤（確かめていないものを通さない）。
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LOCKFILES, countBySeverity, describe, findingsOf, introduced, verdict } from "./audit-rules.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
if (args.some((arg, index) => arg !== "--base" && index !== baseFlag + 1) || (baseFlag !== -1 && !args[baseFlag + 1])) {
  throw new Error("引数が正しくありません（使えるのは --base <コミット> だけ）");
}
const base = (baseFlag !== -1 ? args[baseFlag + 1] : process.env.AUDIT_BASE) || "";
if (base && !/^[\w./-]+$/.test(base)) throw new Error("比べるコミットの指定が正しくありません");

const git = async (...parts) => (await run("git", parts, { cwd: root, maxBuffer: 64 * 1024 * 1024 })).stdout;

/** pnpm は指摘があると 0 以外で終わるので、終了コードではなく出力を読む。通信の失敗は 1 度だけやり直す。 */
async function auditAt(cwd) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const output = await run("pnpm", ["audit", "--json"], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 60000 })
        .then((result) => result.stdout, (error) => (typeof error.stdout === "string" && error.stdout.trim() ? error.stdout : Promise.reject(error)));
      return findingsOf(JSON.parse(output));
    } catch (error) { last = error; }
  }
  throw new Error(`脆弱性の検査を実行できませんでした: ${last instanceof Error ? last.message.split("\n")[0] : String(last)}`);
}

/** 取り込み先の固定ファイル。浅い取得で手元に無ければ、その 1 コミットだけ取りに行く。無いファイルは空。 */
async function baseLockfile(file) {
  try { await git("cat-file", "-e", `${base}^{commit}`); }
  catch { await git("fetch", "--no-tags", "--depth=1", "origin", base); }
  try { return await git("show", `${base}:${file}`); } catch { return ""; }
}

const annotate = (level, title, message) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level} title=${title}::${message.replace(/\r?\n/g, " ")}`);
};
const summary = (text) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`); };

if (!base) {
  // 一覧だけ。main への取り込みと手元での確認に使う。調べられなくても赤にしない（知らせの役目は更新の提案が持つ）。
  for (const { directory, name } of LOCKFILES) {
    try {
      const rows = await auditAt(path.join(root, directory));
      console.log(`--- ${name}（${directory}）: ${JSON.stringify(countBySeverity(rows))}`);
      for (const row of rows) console.log(`  ${describe(row)}`);
    } catch (error) {
      console.log(`--- ${name}（${directory}）: 調べられなかった（${error.message}）`);
      annotate("warning", "部品の脆弱性を調べられなかった", `${name}: ${error.message}`);
    }
  }
  process.exit(0);
}

let failed = false;
for (const { directory, name } of LOCKFILES) {
  const file = path.posix.join(directory, "pnpm-lock.yaml").replace(/^\.\//, "");
  const now = existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : "";
  const before = await baseLockfile(file);
  if (now === before) { console.log(`OK  ${name}: 部品は取り込み先と同じ（調べる差が無い）`); continue; }
  if (!now) { console.log(`OK  ${name}: 固定ファイルが無くなった`); continue; }
  const scratch = mkdtempSync(path.join(tmpdir(), "pages-audit-"));
  try {
    let known = [];
    if (before) { writeFileSync(path.join(scratch, "pnpm-lock.yaml"), before); known = await auditAt(scratch); }
    const { blocking, warnings } = verdict(introduced(await auditAt(path.join(root, directory)), known));
    for (const row of warnings) {
      console.log(`警告 ${name}: ${describe(row)}`);
      annotate("warning", "この PR で入った部品に脆弱性の指摘（中以下）", `${name}: ${describe(row)}`);
    }
    for (const row of blocking) {
      console.log(`NG  ${name}: ${describe(row)}`);
      annotate("error", "この PR で入った部品に既知の脆弱性", `${name}: ${describe(row)}`);
    }
    if (blocking.length) {
      failed = true;
      summary(`### この PR で入った部品に既知の脆弱性（${name}）\n\n${blocking.map((row) => `- ${describe(row)}`).join("\n")}\n\n直った版へ上げるか、その部品を入れない形にする。`);
    } else console.log(`OK  ${name}: この PR が持ち込んだ「高」以上の指摘は無い（中以下 ${warnings.length} 件）`);
  } catch (error) {
    failed = true;
    console.log(`NG  ${name}: ${error.message}`);
    annotate("error", "部品の脆弱性を調べられなかった", `${name}: ${error.message}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
process.exit(failed ? 1 : 0);
