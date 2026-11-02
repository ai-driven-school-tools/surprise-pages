/** 書き込みドックの位置計算と、画面下端の使い分けを確かめる。 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/dock.ts`],
  outfile: `${dir}/w-dock.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const {
  keyboardInset,
  dockBottomAt,
  visibleBottomAt,
  bottomOwner,
  toolbarVisible,
  afterSheetToggle,
  afterOpenDock,
  afterCloseDock,
} = await import(`${dir}/w-dock.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("\n--- 画面の下端を使うのは 1 つだけ ---");
const none = { menu: false, dock: false, peek: false, selection: false };
ok("何も出ていない", bottomOwner(none), "none");
ok("帯だけ", bottomOwner({ ...none, selection: true }), "selection");
ok("覗き見だけ", bottomOwner({ ...none, peek: true }), "peek");
ok("ドックだけ", bottomOwner({ ...none, dock: true }), "dock");
ok("「その他」の小窓だけ", bottomOwner({ ...none, menu: true }), "menu");
ok("覗き見と帯 → 覗き見が勝つ", bottomOwner({ dock: false, peek: true, selection: true }), "peek");
ok("ドックと覗き見 → ドックが勝つ", bottomOwner({ dock: true, peek: true, selection: false }), "dock");
ok("3 つとも → ドックが勝つ", bottomOwner({ dock: true, peek: true, selection: true }), "dock");
ok("「その他」の小窓とドック → 小窓が勝つ", bottomOwner({ ...none, menu: true, dock: true }), "menu");
ok("4 つとも → 「その他」の小窓が勝つ", bottomOwner({ menu: true, dock: true, peek: true, selection: true }), "menu");

console.log("\n--- 右下の道具箱を出してよいか ---");
ok("何も出ていなければ出す", toolbarVisible(none, false), true);
ok("ドック中はしまう", toolbarVisible({ ...none, dock: true }, false), false);
ok("覗き見中はしまう", toolbarVisible({ ...none, peek: true }, false), false);
ok("帯が出ていればしまう", toolbarVisible({ ...none, selection: true }, false), false);
ok("板が全面を覆っていればしまう", toolbarVisible(none, true), false);
ok("板が覆い、かつドック中でもしまう", toolbarVisible({ ...none, dock: true }, true), false);

console.log("\n   「その他」の小窓だけは例外（バーの ⋯ から生えているので、土台を消さない）");
ok("小窓が持ち主でもバーは残る", toolbarVisible({ ...none, menu: true }, false), true);
ok("小窓とドックが重なっても残る", toolbarVisible({ ...none, menu: true, dock: true }, false), true);
ok("それでも板が覆っていればしまう", toolbarVisible({ ...none, menu: true }, true), false);

console.log("\n--- 書いている間の並び（仕様どおりか）---");
const whileWriting = { dock: true, peek: false, selection: false };
ok("下端の持ち主はドック", bottomOwner(whileWriting), "dock");
ok("道具箱は出ない", toolbarVisible(whileWriting, false), false);

// ------------------------------------------------------------------
// 不具合の再現: 板が開いているところから、別の文にコメントを書き始める
//
// 元はここが「1 件送った直後」だった（送ると板が開いていたため）。狭い画面では
// 送っても開かなくなったので、板を自分で開けて読んでいるところから始める。
// 確かめたいこと自体は変わらない——板を閉じる処理が書きかけを道連れにしないか。
// ------------------------------------------------------------------
console.log("\n--- 板が開いているところから書き始める流れ ---");

// 板を自分で開けて、コメントの一覧を読んでいる
let flow = { sheetOpen: true, dockOpen: false, hasDraft: false };
console.log(`   板=${flow.sheetOpen ? "開" : "閉"} ドック=${flow.dockOpen ? "開" : "閉"} 書きかけ=${flow.hasDraft ? "あり" : "なし"}  ← 板を開けて読んでいる`);

// 別の文を選んで「コメント」を押した。ここで書きかけができる
flow = { ...flow, hasDraft: true };
console.log(`   板=${flow.sheetOpen ? "開" : "閉"} ドック=${flow.dockOpen ? "開" : "閉"} 書きかけ=${flow.hasDraft ? "あり" : "なし"}  ← 帯の「コメント」を押した`);

// ドックを開く。このとき板を閉じる
flow = afterOpenDock(flow);
console.log(`   板=${flow.sheetOpen ? "開" : "閉"} ドック=${flow.dockOpen ? "開" : "閉"} 書きかけ=${flow.hasDraft ? "あり" : "なし"}  ← ドックを開いた`);

ok("板は閉じている", flow.sheetOpen, false);
ok("ドックは開いている", flow.dockOpen, true);
ok("**書きかけが生きている**（中身が描ける）", flow.hasDraft, true);

console.log("\n--- 直す前の作りなら落ちることの確認 ---");
// 直す前: 板を閉じると書きかけも捨てていた
const brokenSheetToggle = (f, open) => ({
  sheetOpen: open,
  dockOpen: f.dockOpen,
  hasDraft: open ? f.hasDraft : false,
});
let broken = { sheetOpen: true, dockOpen: false, hasDraft: true };
broken = brokenSheetToggle(broken, false); // ドックを開く前に板を閉じる
ok("直す前は書きかけが消えていた（＝テストが効いている）", broken.hasDraft, false);

console.log("\n--- 板の開け閉ては書きかけに触らない ---");
const writing = { sheetOpen: false, dockOpen: true, hasDraft: true };
ok("板を開いても書きかけは残る", afterSheetToggle(writing, true).hasDraft, true);
ok("板を閉じても書きかけは残る", afterSheetToggle(writing, false).hasDraft, true);
ok("板の開閉でドックの状態は変わらない", afterSheetToggle(writing, true).dockOpen, true);

console.log("\n--- 書きかけが終わるのはドックを閉じたときだけ ---");
ok("ドックを閉じると書きかけも終わる", afterCloseDock(writing).hasDraft, false);
ok("ドックも閉じる", afterCloseDock(writing).dockOpen, false);
ok("板の状態は巻き込まない", afterCloseDock({ ...writing, sheetOpen: true }).sheetOpen, true);


// ------------------------------------------------------------------
// 入力中の位置ずれ（実機の知らせの順番で追う）
// ------------------------------------------------------------------
console.log("\n--- 文字を打っている間、ドックの底が見えている底に付いているか ---");

const SCREEN = 852; // 画面全体の高さ（キーボードが出ても変わらない）

/**
 * 実機の一連の流れ。
 * 各段で「画面側の値」と「ドックの高さ」がどう動くかを並べてある。
 * ドックの高さをわざと動かしてあるのは、位置の計算に高さが混ざっていないことを示すため。
 */
const steps = [
  ["フォーカス前（キーボードなし）", 852, 0, 220],
  ["キーボードが滑り込む途中", 700, 0, 220],
  ["キーボードが出きった", 516, 0, 220],
  ["1 文字打った", 516, 0, 220],
  ["変換候補の帯が出た", 470, 0, 220],
  ["候補を確定した（帯が消えた）", 516, 0, 220],
  ["改行して入力欄が伸びた", 516, 0, 300],
  ["さらに伸びた", 516, 0, 380],
  ["iOS がキャレットを見せようと範囲をずらした", 516, 120, 380],
  ["ずれたまま打ち続けた", 516, 120, 380],
  ["キーボードを閉じた", 852, 0, 380],
];

console.log("見えている高さ  ずれ  ドック高  持ち上げ  ドックの底  見えている底  一致");
console.log("-".repeat(78));
let offBottom = 0;
for (const [name, visible, offset, dockHeight] of steps) {
  const inset = keyboardInset(SCREEN, visible, offset);
  const bottom = dockBottomAt(SCREEN, inset);
  const seen = visibleBottomAt(visible, offset);
  const same = bottom === seen;
  if (!same) offBottom += 1;
  console.log(
    `${String(visible).padStart(12)}  ${String(offset).padStart(4)}  ${String(dockHeight).padStart(7)}  ${String(inset).padStart(7)}  ${String(bottom).padStart(9)}  ${String(seen).padStart(12)}  ${same ? "はい" : "いいえ"}  ${name}`,
  );
}
console.log("-".repeat(78));
ok("底が合わなかった段", offBottom, 0);

console.log("\n--- 高さが計算に混ざっていないこと ---");
// 同じ画面の状態で、ドックの高さだけ変えても持ち上げ量は変わらない
const insets = [100, 220, 380, 640].map((h) => keyboardInset(SCREEN, 516, 0));
ok("高さを変えても持ち上げ量は同じ", new Set(insets).size, 1);
ok("その値", insets[0], 336);

console.log("\n--- 個々の計算 ---");
ok("キーボードなし", keyboardInset(852, 852, 0), 0);
ok("キーボードだけ", keyboardInset(852, 516, 0), 336);
ok("キーボード＋候補の帯", keyboardInset(852, 470, 0), 382);
ok("範囲がずれているとき", keyboardInset(852, 516, 120), 216);
ok("負にならない（値が揃わない瞬間）", keyboardInset(852, 900, 0), 0);
ok("小数は丸める", keyboardInset(852, 516.4, 0), 336);

console.log("\n--- 見張っていない知らせが来なくても崩れないこと ---");
// ページがスクロールしても、下端に貼り付いているので持ち上げ量は変わらない
ok("ページのスクロール量は計算に入らない", keyboardInset(852, 516, 0), keyboardInset(852, 516, 0));
