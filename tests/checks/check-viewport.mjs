/**
 * キーボードが出たときの持ち上げ量と当て直しを、2 つの環境で確かめる。
 *
 *   iOS 型   … innerHeight が「見えている高さ」に縮む
 *   Chrome 型 … innerHeight は紙の高さのまま
 *
 * どちらでも同じ答えになることが要。片方でしか合わない式は使わない。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/dock.ts`],
  outfile: `${dir}/vp-dock.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { keyboardInset, visibleBottomFor, correctedShift, needsCorrection } = await import(
  `${dir}/vp-dock.mjs`
);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

const PAPER = 852;   // 紙の高さ（clientHeight）。キーボードでは縮まない
const KEYBOARD = 336;

/** 環境の作り分け */
const envs = [
  {
    name: "iOS 型（ずれなし）",
    // innerHeight は見えている高さに縮む
    innerHeight: (vv) => vv.height,
    clientHeight: () => PAPER,
    offsetTop: 0,
    restingBottom: () => PAPER, // 測った底は紙の物差し
  },
  {
    name: "iOS 型（ずれあり 120）",
    innerHeight: (vv) => vv.height,
    clientHeight: () => PAPER,
    offsetTop: 120,
    restingBottom: () => PAPER,
  },
  {
    name: "iOS 型（窓の物差し）",
    innerHeight: (vv) => vv.height,
    clientHeight: () => PAPER,
    offsetTop: 0,
    restingBottom: (vv) => vv.height, // 測った底が窓の物差しの端末
  },
  {
    name: "Chrome 型",
    innerHeight: () => PAPER,
    clientHeight: () => PAPER,
    offsetTop: 0,
    restingBottom: () => PAPER,
  },
];

console.log("=== 1. 持ち上げ量（キーボードなし → 0 / あり → キーボードの高さ）===\n");
console.log("環境                     状態          innerHeight  clientHeight  持ち上げ  期待");
console.log("-".repeat(88));
let wrongInset = 0;
for (const env of envs) {
  for (const [label, vvHeight, want] of [
    ["キーボードなし", PAPER, 0],
    ["キーボードあり", PAPER - KEYBOARD - env.offsetTop, KEYBOARD],
  ]) {
    const vv = { height: vvHeight, offsetTop: label === "キーボードなし" ? 0 : env.offsetTop };
    const inner = env.innerHeight(vv);
    const client = env.clientHeight();
    const inset = keyboardInset(client, vv.height, vv.offsetTop);
    if (inset !== want) wrongInset += 1;
    console.log(
      `${env.name.padEnd(24)} ${label.padEnd(14)} ${String(inner).padStart(11)}  ${String(client).padStart(12)}  ${String(inset).padStart(8)}  ${String(want).padStart(4)}`,
    );
  }
}
console.log("-".repeat(88));
ok("持ち上げ量を誤った例", wrongInset, 0);

console.log("\n   参考: 直す前の式（innerHeight を紙の高さとして使う）だとどうなるか");
for (const env of envs) {
  const vv = { height: PAPER - KEYBOARD - env.offsetTop, offsetTop: env.offsetTop };
  const wrong = keyboardInset(env.innerHeight(vv), vv.height, vv.offsetTop);
  console.log(`   ${env.name.padEnd(24)} → ${String(wrong).padStart(4)}px（正しくは ${KEYBOARD}px）`);
}
const iosWrong = keyboardInset(PAPER - KEYBOARD, PAPER - KEYBOARD, 0);
ok("iOS 型では 0 になってしまっていた（症状と一致）", iosWrong, 0);

console.log("\n=== 2. 閉ループの当て直し（わざと 30px ずらす）===\n");
console.log("環境                     測った底  窓の底  1コマ後の底  残りのずれ");
console.log("-".repeat(70));
let unresolved = 0;
for (const env of envs) {
  const vv = { height: PAPER - KEYBOARD - env.offsetTop, offsetTop: env.offsetTop };
  const resting = env.restingBottom(vv);
  // 30px ずれた持ち上げ量を注入
  const injected = -(resting - visibleBottomFor(resting, env.clientHeight(), vv.height, vv.offsetTop)) + 30;

  const dockBottom = resting + injected;
  const want = visibleBottomFor(resting, env.clientHeight(), vv.height, vv.offsetTop);
  const next = needsCorrection(dockBottom, want) ? correctedShift(injected, dockBottom, want) : injected;
  const after = resting + next;
  const left = Math.abs(after - want);
  if (left >= 0.5) unresolved += 1;
  console.log(
    `${env.name.padEnd(24)} ${String(dockBottom).padStart(8)}  ${String(want).padStart(6)}  ${String(after).padStart(10)}  ${left.toFixed(1).padStart(9)}`,
  );
}
console.log("-".repeat(70));
ok("1 コマで直りきらなかった例", unresolved, 0);

console.log("\n=== 3. 物差しの見分け ===\n");
const vvKb = { height: PAPER - KEYBOARD, offsetTop: 0 };
ok(
  "紙の物差しの端末（底が紙の高さ）",
  visibleBottomFor(PAPER, PAPER, vvKb.height, vvKb.offsetTop),
  vvKb.height,
);
ok(
  "窓の物差しの端末（底が窓の高さ）",
  visibleBottomFor(vvKb.height, PAPER, vvKb.height, vvKb.offsetTop),
  vvKb.height,
);
const shifted = { height: 400, offsetTop: 120 };
ok(
  "紙の物差し＋ずれあり",
  visibleBottomFor(PAPER, PAPER, shifted.height, shifted.offsetTop),
  520,
);
ok(
  "窓の物差し＋ずれあり（ずれを足さない）",
  visibleBottomFor(shifted.height, PAPER, shifted.height, shifted.offsetTop),
  400,
);
ok("キーボードなしならどちらでも同じ", visibleBottomFor(PAPER, PAPER, PAPER, 0), PAPER);

console.log("\n=== 4. 圧縮モードの発動（持ち上げ量 > 0 で入る）===\n");
let wrongCompact = 0;
for (const env of envs) {
  for (const [label, vvHeight, wantCompact] of [
    ["キーボードなし", PAPER, false],
    ["キーボードあり", PAPER - KEYBOARD - env.offsetTop, true],
  ]) {
    const vv = { height: vvHeight, offsetTop: label === "キーボードなし" ? 0 : env.offsetTop };
    const inset = keyboardInset(env.clientHeight(), vv.height, vv.offsetTop);
    const compact = inset > 0;
    if (compact !== wantCompact) wrongCompact += 1;
  }
}
ok("圧縮モードの入り外れを誤った例", wrongCompact, 0);
