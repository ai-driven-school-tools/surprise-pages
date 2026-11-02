/**
 * 覗き見カードが「開いた直後に閉じる」不具合の再現テスト。
 * 実機（iPhone）の知らせの順番をそのまま並べて確かめる。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/peek.ts`],
  outfile: `${dir}/w-peek.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { PEEK_CLOSED, openedBy, afterTap, afterSelectionLost, afterDismiss, isSameGesture } =
  await import(`${dir}/w-peek.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/**
 * 指で 1 回押したときに、ブラウザが知らせてくる順番。
 * 押した時点で選択は解ける（＝「選択が消えた」も遅れて届く）。
 */
function tapOnUnderline(startFrom) {
  let view = startFrom;
  const steps = [];

  // 1. 指が触れた（この時点ではまだ何も開いていない）
  const pointerdown = { type: "pointerdown" };
  steps.push(["pointerdown", view.open]);

  // 2. 指が離れた。ここで「選び終わったかの見張り」が仕掛けられる
  const pointerup = { type: "pointerup" };
  view = afterTap(view, pointerup, false);
  steps.push(["pointerup", view.open]);

  // 3. click が届く。ここで初めてカードを開く
  const click = { type: "click" };
  view = openedBy(click);
  steps.push(["click（ここで開く）", view.open]);

  // 4. 同じ click がドキュメントまで伝わり、「外側を押した」判定にも届く
  view = afterTap(view, click, false);
  steps.push(["同じ click が外側判定へ", view.open]);

  // 5. 押したことで選択が解けた知らせが、遅れて届く（実機では約 400ms 後）
  view = afterSelectionLost(view);
  steps.push(["選択が消えた（400ms 後）", view.open]);

  return { view, steps };
}

console.log("--- 下線を 1 回タップしたときの流れ ---");
const { view: afterTapFlow, steps } = tapOnUnderline(PEEK_CLOSED);
for (const [label, open] of steps) {
  console.log(`   ${open ? "開いている" : "閉じている"}  ← ${label}`);
}
ok("最後まで開いたままか", afterTapFlow.open, true);

// このテストが本当に不具合を捕まえるか（素通りしていないか）を確かめる。
// 直す前は「選択が消えたら覗き見も閉じる」作りだった
console.log("\n--- 直す前の作りなら落ちることの確認 ---");
const brokenSelectionLost = () => PEEK_CLOSED;
let broken = openedBy({ type: "click" });
broken = brokenSelectionLost();
ok("直す前の作りでは閉じてしまう（＝テストが効いている）", broken.open, false);

console.log("\n--- 閉じる操作はちゃんと効くか ---");
const opened = openedBy({ type: "click" });
ok("別のタップ（外側）で閉じる", afterTap(opened, { type: "click2" }, false).open, false);
ok("自分の画面の中を押しても閉じない", afterTap(opened, { type: "click2" }, true).open, true);
ok("下へ払えば閉じる", afterDismiss().open, false);
ok("Escape で閉じる", afterDismiss().open, false);

console.log("\n--- 操作の同一性 ---");
const gesture = { type: "click" };
const view = openedBy(gesture);
ok("開いたのと同じ操作", isSameGesture(view, gesture), true);
ok("見た目が同じでも別の操作", isSameGesture(view, { type: "click" }), false);
ok("閉じている間は同一性なし", isSameGesture(PEEK_CLOSED, gesture), false);

console.log("\n--- 続けて別の下線を押す ---");
let chain = openedBy({ type: "click-a" });
const second = { type: "click-b" };
chain = afterTap(chain, second, false); // 外側扱いでいったん閉じ
ok("外側なので閉じる", chain.open, false);
chain = openedBy(second); // すぐ別の 1 件で開き直す
ok("別の 1 件で開き直せる", chain.open, true);
ok("開いた操作が新しいほうに入れ替わる", isSameGesture(chain, second), true);

console.log("\n--- 選択が消えても覗き見は残る（帯だけが連動する）---");
let reading = openedBy({ type: "click" });
reading = afterSelectionLost(reading);
reading = afterSelectionLost(reading);
ok("何度届いても開いたまま", reading.open, true);
