/**
 * 検査表をまとめて走らせる。
 *
 * 1 枚ずつ手で走らせていたとき、途中で例外が出たファイルが
 * 「そこまでの OK だけを出して静かに終わる」ことに気づけなかった。
 * 実際、覗き見スワイプの検査は 137 項目のうち 66 項目までしか走っていなかった。
 *
 * そこでここが番人になる:
 *   1. ファイルごとの項目数と節の数を数え、**控え（baseline.json）と突き合わせる**
 *      → 前より減っていたら失敗（＝途中で止まったことが必ず表に出る）
 *   2. 例外で落ちても、そのファイルを失敗として記録し、残りは最後まで走らせる
 *   3. 不合格が 1 つでもあれば、終了コードを 0 以外にする
 *
 * 控えを取り直すときだけ `pnpm check --update`（項目を増やしたときに 1 度）。
 *
 * 速くする口（。どれも走らせる検査表の中身は変えない）:
 *   --shard=1/2      所要時間の控え（scripts/ci/check-durations.json）で均して分ける。CI が使う
 *   --jobs=4         同時に走らせる枚数。既定はこの機械の CPU の数（上限 8）。検査表は 1 枚ずつ別のプロセス。
 *                    CI は台の差で揺れないよう --jobs=2 と明示する。揺れが出たら数を下げれば元の動き（1 で 1 枚ずつ）に戻る
 *   --changed        変えたファイルに関係する検査表だけ（`pnpm check:changed`）。関係が分からなければ全部走らせる
 *   --durations      全部を 1 枚ずつ走らせて、所要時間の控えを取り直す
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { failureLines, inspectResult, missingChecks, parseDurations, parseInventory, runPool, shardChecks } from "./check-results.mjs";

const run = promisify(execFile);
/** 検査表の置き場（このファイルの隣）。控えも同じところに置いて一緒に持ち歩く。 */
const dir = fileURLToPath(new URL("../../tests/checks/", import.meta.url)).replace(/\/$/, "");
const BASELINE = `${dir}/baseline.json`;
/** 検査表ごとの所要時間（秒）。分け方の重みにだけ使う。走らせる・走らせないは決めない。 */
const DURATIONS = fileURLToPath(new URL("./check-durations.json", import.meta.url));

/**
 * 互いに重ならないように走らせる検査表（ほかの検査表とは重なってよい）。
 * 上の 4 枚は使い捨ての PostgreSQL を起こす（重く、番号を取り合う）。最後の 1 枚は計算が時間内に戻ることを見る。
 * 重いもの同士が同じ台で重なると、時間を見る検査が揺れる。名前が変わって当たらなくなっても、検査は今までどおり走る。
 */
const ONE_AT_A_TIME = ["check-comment-outcome.mjs"];

const args = process.argv.slice(2);
const valued = (name) => args.filter((arg) => arg.startsWith(`--${name}=`));
const flags = ["--update", "--changed", "--durations"];
if (args.some((arg) => !flags.includes(arg) && !/^--(shard|jobs)=/.test(arg)) || valued("shard").length > 1 || valued("jobs").length > 1) {
  throw Error("検査の引数が正しくありません");
}
const updating = args.includes("--update");
const changed = args.includes("--changed");
const timing = args.includes("--durations");
const shard = valued("shard")[0]?.slice("--shard=".length);
if ((updating || timing) && (shard !== undefined || changed)) throw Error("控えの更新は全検査を実行して行います");
if (shard !== undefined && changed) throw Error("分割と「変えた分だけ」は同時に指定できません");
const jobsArg = valued("jobs")[0]?.slice("--jobs=".length);
if (jobsArg !== undefined && !/^[1-9]\d*$/.test(jobsArg)) throw Error("同時に走らせる数が正しくありません");
if (timing && jobsArg !== undefined && jobsArg !== "1") throw Error("所要時間は 1 枚ずつ走らせて測ります");
// 所要時間を測るときは 1 枚ずつ（並べて走らせると互いに遅くなり、重みがその回の組み合わせで変わる）
const jobs = timing ? 1 : jobsArg !== undefined ? Number(jobsArg) : Math.min(8, availableParallelism());

const previous = parseInventory(await readFile(BASELINE, "utf8"));
const files = (await readdir(dir)).filter((name) => name.startsWith("check-") && name.endsWith(".mjs")).sort();

const missing = missingChecks(previous, files);
let failed = missing.length;
for (const file of missing) console.error(`検査表が消えた: ${file}`);
if (files.length === 0) throw new Error("検査表がありません");

// 重みの控えを読むのは分けるときだけ（壊れた控えで均等割りに落ちない。読めなければ失敗）
let selected = shard === undefined ? files : shardChecks(files, shard, parseDurations(await readFile(DURATIONS, "utf8")));
if (changed) {
  const { changedSelection } = await import("./changed-checks.mjs");
  const selection = await changedSelection(files);
  console.log(selection.reason);
  for (const line of selection.details) console.log(`  ${line}`);
  console.log("");
  selected = selection.files;
  if (selected.length === 0) process.exit(failed === 0 ? 0 : 1);
}

const started = Date.now();
const rows = await runPool(selected, jobs, runCheck, (file) => ONE_AT_A_TIME.includes(file));

async function runCheck(file) {
  let stdout = "";
  let crashed = null;
  const began = Date.now();
  try {
    const result = await run("node", [`${dir}/${file}`], { maxBuffer: 32 * 1024 * 1024, timeout: 180000, killSignal: "SIGKILL" });
    stdout = result.stdout;
  } catch (error) {
    // 途中で落ちても、そこまでの出力は数える。落ちたこと自体を失敗として残す
    stdout = typeof error.stdout === "string" ? error.stdout : "";
    crashed = String(error.stderr ?? error.message).split("\n").filter(line=>line.trim().length>0).slice(-12).join("\n") || "落ちた";
  }
  const seconds = Math.round((Date.now() - began) / 100) / 10;

  const was = previous[file];
  const {ok, ng, sections, shrank, empty} = inspectResult(stdout, was);
  if (empty && crashed === null) crashed = "検査項目がありません";
  if (was === undefined && !updating && crashed === null) crashed = "控えに未登録の検査表です";
  return { file, ok, ng, sections, crashed, shrank, was, seconds, failures: failureLines(stdout) };
}
failed += rows.filter((row) => row.ng > 0 || row.crashed !== null || row.shrank).length;

const pad = (text, width) => String(text).padEnd(width, " ");
const wide = Math.max(...rows.map((row) => row.file.length));
console.log(`検査表 ${rows.length} 枚\n`);
for (const row of rows) {
  const items = row.ok + row.ng;
  const expected = row.was === undefined ? "（控えなし）" : `控え ${row.was.items}`;
  const mark = row.crashed !== null ? "落ちた" : row.ng > 0 ? "不合格" : row.shrank ? "減った" : "合格  ";
  console.log(
    `${mark} ${pad(row.file, wide)}  項目 ${pad(items, 4)} 節 ${pad(row.sections, 3)} ${pad(expected, 9)} ${row.seconds.toFixed(1).padStart(6, " ")}秒` +
      (row.failures.length > 0 ? `\n       └ 落ちた項目:\n${row.failures.map((line) => `         ${line}`).join("\n")}` : "") +
      (row.crashed !== null ? `\n       └ ${row.crashed}` : "") +
      (row.shrank ? `\n       └ 前は 項目 ${row.was.items} / 節 ${row.was.sections} まで走っていた` : ""),
  );
}

const items = rows.reduce((sum, row) => sum + row.ok + row.ng, 0);
const ngs = rows.reduce((sum, row) => sum + row.ng, 0);
const worked = rows.reduce((sum, row) => sum + row.seconds, 0);
console.log(`\n合計 ${items} 項目 / 不合格 ${ngs} / 問題のある検査表 ${failed} 枚`);
console.log(`かかった時間 ${((Date.now() - started) / 1000).toFixed(1)}秒（同時に ${jobs} 枚・1 枚ずつなら ${worked.toFixed(1)}秒ぶん）`);

if (updating && failed === 0) {
  const next = Object.fromEntries(rows.map((row) => [row.file, { items: row.ok + row.ng, sections: row.sections }]));
  await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log("控えを取り直した");
}
if (updating && failed > 0) console.error("不合格のため控えは変更しませんでした");
if (timing && failed === 0) {
  await writeFile(DURATIONS, `${JSON.stringify({ checks: Object.fromEntries(rows.map((row) => [row.file, row.seconds])) }, null, 1)}\n`);
  console.log("所要時間の控えを取り直した");
}
if (timing && failed > 0) console.error("不合格のため所要時間の控えは変更しませんでした");

process.exit(failed === 0 ? 0 : 1);
