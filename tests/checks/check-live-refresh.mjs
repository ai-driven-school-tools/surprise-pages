/**
 * コメントの一覧を「見ている間だけ勝手に読み直す」仕組みの番人。
 *
 * 守るのは 2 つ。
 *   1. いつ読み直すかを決める場所は src/widget/comments/live.ts ただ 1 つ（focus や定期の読み直しが
 *      ほかの部品に戻ってこない）。散ると、放置したタブで保存先（Neon Free）を起こし続ける道が
 *      黙って増える。
 *   2. 間隔・放置の判定・失敗の伸び方の数は src/lib/comments/live-refresh.ts の定数だけ（widget に
 *      数を書き写さない）。
 *
 * 時機の決まりそのものは tests/unit/live-refresh.test.mjs、実際にリロードなしで出ることは
 * tests/e2e/core.spec.mjs が見る。設計は docs/design/live-comments.md。
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./paths.mjs";

function checked(label, action) { action(); console.log(`OK  ${label}`); }
const read = (file) => readFile(path.join(root, file), "utf8");

const folder = "src/widget/comments/";
const files = (await readdir(path.join(root, folder))).filter((name) => name.endsWith(".ts"));
const sources = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await read(`${folder}${name}`)])));
const live = sources["live.ts"];
const comments = sources["comments.ts"];
const rule = await read("src/lib/comments/live-refresh.ts");

console.log("--- 読み直しの時機は live.ts ただ 1 つ ---");
checked("comments.ts は live.ts を起こし、戻ったときの読み直しを自分で持たない", () => {
  assert.match(comments, /createCommentLive\(\{/);
  assert.match(comments, /liveFeature\.start\(\)/);
  assert.doesNotMatch(comments, /addEventListener\(\s*["']focus["']/);
});
checked("編集画面を閉じたときも live.ts を通して読み直す", () => {
  assert.match(comments, /onClosed:\s*\(\)\s*=>\s*liveFeature\.resume\(\)/);
  assert.doesNotMatch(comments, /onClosed:\s*\(\)\s*=>\s*\{?\s*void refresh\(\)/);
});
checked("タブの見え隠れ・戻り・操作を聞くのは live.ts だけ", () => {
  for (const [name, source] of Object.entries(sources)) {
    if (name === "live.ts") continue;
    assert.doesNotMatch(source, /visibilitychange/, `${name} がタブの見え隠れを自分で聞いている`);
    assert.doesNotMatch(source, /addEventListener\(\s*["']focus["']/, `${name} が戻ったときを自分で聞いている`);
  }
  assert.match(live, /visibilitychange/);
  assert.match(live, /addEventListener\("focus"/);
});
checked("定期に一覧を読み直す予約は live.ts と原本の取り込み（origin.ts）だけ", () => {
  for (const [name, source] of Object.entries(sources)) {
    if (name === "live.ts" || name === "origin.ts") continue;
    const schedules = source.includes("lifetime.interval(") || /lifetime\.timeout\([^)]*refresh/.test(source);
    assert.equal(schedules, false, `${name} が定期の読み直しを予約している`);
  }
});

console.log("--- 数は live-refresh.ts の定数だけ ---");
checked("live.ts は純関数に時機を聞き、数を書き写さない", () => {
  assert.match(live, /nextLiveRefreshDelay\(\{/);
  assert.doesNotMatch(live, /\b\d{4,}\b/, "live.ts に 4 桁以上の数（間隔や時間）が直に書いてある");
});
checked("定数は 3 つそろっていて、止まる条件（見えない・編集中・放置）を純関数が持つ", () => {
  for (const key of ["intervalMs", "idleAfterMs", "failureMaxMs"]) assert.match(rule, new RegExp(`\\b${key}:`));
  for (const key of ["visible", "editing", "idleForMs", "failures"]) assert.match(rule, new RegExp(`\\b${key}\\b`));
  assert.match(rule, /return null/);
});
checked("定期の読み直しは失敗を画面に出さず（quiet）、ログインが切れたときだけ知らせる", () => {
  assert.match(live, /tick\(true\)/);
  assert.match(comments, /if \(!options\.quiet \|\| result\.status === 401\) handleFailure\(result\)/);
});
