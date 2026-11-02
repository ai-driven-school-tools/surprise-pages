#!/usr/bin/env node
/**
 * 体感速度の比例の線の控え（tests/checks/browser/app-speed-baseline.json）を、CI の結果から取り直す。
 *
 *   gh run download <実行の番号> -n app-speed-results -D <置き場1>
 *   gh run download <別の実行の番号> -n app-speed-results -D <置き場2>
 *   node tests/support/app-speed-baseline.mjs <置き場1>/speed.json <置き場2>/speed.json
 *
 * 控えは**CI の台で測った数**から作る（手元の Mac は速いので、手元の数で作ると CI が毎回赤になる）。
 * **2 回以上の結果を渡し、項目ごとに大きいほうを控えにする。** CI の台は回によって揺れ（資料の道具箱は同じコードで 0.51〜0.88 秒）、
 * たまたま速かった 1 回を控えにすると、何も遅くしていない PR が比例の線に掛かる（2026-10-08 に実際に起きた）。
 * 測り直した結果（firstAttempt）も 1 回と数える。
 * 取り直すのは、速くした PR が main に入ったあとと、わざと遅くしてよいと決めたときだけ（理由を PR に書く・docs/design/app-speed.md）。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { baselineFrom } from "../checks/browser/app-speed-budget.mjs";

const sources = process.argv.slice(2);
const results = await Promise.all(sources.map(async (source) => JSON.parse(await readFile(source, "utf8"))));
const conditions = (result) => JSON.stringify([result.dwellMs, result.dbRttMs, result.dbWorkers, result.dbCostMs]);
/** 絶対の線（歯止め）には掛かっていない結果だけを使う。比例の線だけの外れは、控えが速すぎた印なので使ってよい。 */
const usable = (result) => typeof result.testedCommit === "string" && result.dwellMs === 300 && typeof result.dbWorkers === "number"
  && typeof result.dbCostMs === "number" && Array.isArray(result.misses) && result.misses.every((miss) => miss.includes("控え"));
if (results.length === 0 || !results.every(usable) || new Set(results.map(conditions)).size !== 1) {
  console.error("CI の既定の条件（とどまる 300ms）で、絶対の線に掛からなかった結果を、同じ条件で渡してください");
  process.exit(1);
}
const summaries = results.flatMap((result) => [result.summary, ...(result.firstAttempt ? [result.firstAttempt.summary] : [])]);
if (summaries.length < 2) {
  console.error("CI の結果を 2 回分以上渡してください（1 回だけだと、たまたま速かった回が控えになる）");
  process.exit(1);
}
const medians = {};
for (const one of summaries.map(baselineFrom)) {
  for (const [scene, keys] of Object.entries(one)) {
    for (const [key, value] of Object.entries(keys)) medians[scene] = { ...medians[scene], [key]: Math.max(medians[scene]?.[key] ?? 0, value) };
  }
}
const first = results[0];
const target = fileURLToPath(new URL("../checks/browser/app-speed-baseline.json", import.meta.url));
const baseline = {
  measuredCommits: [...new Set(results.map((result) => result.testedCommit))],
  runs: summaries.length,
  dbRttMs: first.dbRttMs, dbWorkers: first.dbWorkers, dbCostMs: first.dbCostMs, rounds: first.rounds,
  medians,
};
await writeFile(target, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`控えを取り直しました（CI の結果 ${summaries.length} 回分の、項目ごとの大きいほう）`);
