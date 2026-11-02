/**
 * 窓の上端の取り決めと、ページの上端の現在地の行。
 *
 * 同じ値・同じ読み方を 2 か所（ワークスペースの CSS・道具箱）が持つので、片方だけ直したときに落とす。
 * 配布版にはデスクトップアプリが無い。窓の枠の値（env(titlebar-area-*)）を読む作りは汎用の配置として残してあり、
 * ふつうのブラウザでは値が 0 になって何も変わらない。
 */
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

for (const [name, file] of [["window-titlebar", "workspace/window-titlebar"], ["workspace-ink", "workspace/ink"], ["workspace-places", "workspace/places"], ["history-steps", "revisions/history-steps"]]) {
  await build({ entryPoints: [`${root}/src/lib/${file}.ts`], outfile: `${dir}/titlebar-${name}.mjs`, bundle: true, format: "esm", platform: "node" });
}
const titlebar = await import(`${dir}/titlebar-window-titlebar.mjs`);
const { WORKSPACE_INK } = await import(`${dir}/titlebar-workspace-ink.mjs`);
const places = await import(`${dir}/titlebar-workspace-places.mjs`);
const steps = await import(`${dir}/titlebar-history-steps.mjs`);
const read = (file) => readFileSync(`${root}/${file}`, "utf8");

let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
}

console.log("--- 1. 窓の上端の値（src/lib/workspace/window-titlebar.ts と src/app/globals.css） ---");
const css = read("src/app/globals.css");
ok("高さは押す部品（32px）の上下に 6px ずつ", titlebar.TITLEBAR_HEIGHT, 44);
ok("CSS の高さは、ブラウザが知らせる値を同じ書き方で読む", css.includes(`--titlebar-h: ${titlebar.TITLEBAR_HEIGHT_CSS};`), true);
ok("CSS の左の幅も同じ書き方で読む", css.includes(`--titlebar-x: ${titlebar.TITLEBAR_START_CSS};`), true);
ok("戻る・進むの幅は 2 か所で同じ", css.includes(`--titlebar-history: min(${titlebar.HISTORY_WIDTH}px, calc(var(--titlebar-x) * 999));`), true);
ok("窓の枠が無ければ、どの値も 0 に落ちる", [titlebar.TITLEBAR_HEIGHT_CSS, titlebar.TITLEBAR_START_CSS].every((value) => /^env\(titlebar-area-[a-z]+, 0px\)$/.test(value)), true);
ok("画面の頭は、帯があればその下", css.includes("--ws-top: max(1.25rem, calc(var(--titlebar-h) + 0.5rem));"), true);
ok("戻る・進むを出すかは CSS だけで決める（入れ物の幅）", [/\.ws-window-history \{\s*display: none;/.test(css), /@container \(min-width: 1px\) \{\s*\.ws-window-history \{\s*display: flex;/.test(css)], [true, true]);
ok("帯の中の押す部品は、つかむ場所から外す", /a,\s*button,[\s\S]{0,200}\{\s*app-region: no-drag;/.test(css), true);

console.log("\n--- 2. 墨（src/lib/workspace/ink.ts と src/app/globals.css） ---");
const tone = (block) => ({
  text: /--ws-text: (#[0-9a-f]+);/.exec(block)?.[1],
  muted: /--ws-muted: (#[0-9a-f]+);/.exec(block)?.[1],
  lineMix: Number(/--ws-line-mix: (\d+)%;/.exec(block)?.[1]),
  hoverMix: Number(/--ws-hover-mix: (\d+)%;/.exec(block)?.[1]),
  pressMix: Number(/--ws-press-mix: (\d+)%;/.exec(block)?.[1]),
});
const lightBlock = css.slice(css.indexOf("--ws-bg: #fff;"), css.indexOf('[data-appearance="dark"] {'));
const darkBlock = css.slice(css.indexOf('[data-appearance="dark"] {'), css.indexOf("@media (prefers-color-scheme: dark)"));
ok("明るい側の墨は CSS と同じ", WORKSPACE_INK.light, tone(lightBlock));
ok("暗い側の墨は CSS と同じ", WORKSPACE_INK.dark, tone(darkBlock));

console.log("\n--- 3. 場所の正本（src/lib/workspace/places.ts） ---");
const shell = read("src/app/_components/workspace-shell.tsx");
ok("サイドバーは場所の正本から組む", [shell.includes("WORKSPACE_PLACES"), /href: "\/(favorites|library|me)"/.test(shell)], [true, false]);
ok("道筋から場所を引ける（名前は辞書から・既定は日本語）", ["/", "/mine", "/library", "/favorites", "/activity"].map((path) => { const place = places.placeOfPath(path); return place && places.placeLabel(place); }), ["ホーム", "自分の資料", "この組織 の資料", "お気に入り", "自分の活動"]);
// 録音の場所は配布版に無い（録音の機能ごと外した）
ok("場所でない道筋は引かない", ["/settings", "/internal/seed/article", "/librarian", "/activity/x", "/recordings", "/recordings/abc"].map((path) => places.placeOfPath(path)), [null, null, null, null, null, null]);
ok("「会社」と言わず組織の名前で言う（個人配布版は組織の名前が設置した本人の名前）", [places.placeLabel(places.LIBRARY_PLACE, undefined, "見本商事"), places.placeLabel(places.LIBRARY_PLACE, undefined, "taro"), places.placeLabel(places.HOME_PLACE, undefined, "見本商事")], ["見本商事 の資料", "taro の資料", "ホーム"]);

console.log("\n--- 4. 戻る先の読み方（src/lib/revisions/history-steps.ts） ---");
const fakeWindow = ({ entries, index, referrer = "", length = 1 }) => ({
  location: { origin: "https://pages.example" },
  document: { referrer },
  history: { length },
  ...(entries === undefined ? {} : { navigation: { canGoBack: index > 0, canGoForward: index < entries.length - 1, currentEntry: { url: entries[index], index }, entries: () => entries.map((url, at) => ({ url, index: at })), addEventListener() {}, removeEventListener() {} } }),
});
const previous = (view) => { const found = steps.previousUrl(view); return found === null ? null : [found.url.pathname + found.url.search, found.reachable]; };
ok("1 つ前が同じサイトなら、その URL へ戻れる", previous(fakeWindow({ entries: ["https://pages.example/library?q=a", "https://pages.example/internal/x"], index: 1 })), ["/library?q=a", true]);
ok("新しいタブで開いたときは、来た元は分かるが戻れない", previous(fakeWindow({ entries: ["https://pages.example/internal/x"], index: 0, referrer: "https://pages.example/" })), ["/", false]);
ok("よそのサイトから来たときは、戻る先にしない", previous(fakeWindow({ entries: ["https://pages.example/internal/x"], index: 0, referrer: "https://slack.example/x" })), null);
ok("履歴を読めないブラウザでは、来た元と履歴の長さで代える", [previous(fakeWindow({ referrer: "https://pages.example/activity", length: 3 })), previous(fakeWindow({ referrer: "https://pages.example/activity", length: 1 }))], [["/activity", true], ["/activity", false]]);
ok("押せるかどうかを読む", [steps.readHistorySteps(fakeWindow({ entries: ["https://pages.example/", "https://pages.example/internal/x"], index: 0 })), steps.readHistorySteps(fakeWindow({ length: 2 }))], [{ back: false, forward: true }, { back: true, forward: false }]);

// 画面の移動（pushState）は React が描画を当てている最中に呼ばれ、ブラウザはその場で「移動した」と知らせてくる。
// その場で読み手に流すと、描画の最中に描き直しを頼むことになる（React の警告「useInsertionEffect must not schedule updates.」）。
const watched = (() => {
  const listeners = new Map();
  const view = {
    ...fakeWindow({ entries: ["https://pages.example/", "https://pages.example/internal/x"], index: 0 }),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  view.navigation.addEventListener = (type, listener) => listeners.set(type, listener);
  view.navigation.removeEventListener = (type) => listeners.delete(type);
  return { view, fire: (type) => listeners.get(type)?.(), listening: () => [...listeners.keys()].sort() };
})();
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
let told = 0;
const stopWatching = steps.watchHistorySteps(watched.view, () => { told++; });
watched.fire("currententrychange");
const duringMove = told;
await turn();
ok("移動の知らせは、その場では流さず、移動が済んでから流す", [duringMove, told], [0, 1]);
watched.fire("currententrychange");
watched.fire("popstate");
await turn();
ok("続けて届いた知らせは 1 回にまとめる", told, 2);
watched.fire("pageshow");
await turn();
ok("控えから出し直されたときも知らせる", told, 3);
watched.fire("currententrychange");
stopWatching();
await turn();
ok("見張りをやめたあとは、待たせていた知らせも流さない", [told, watched.listening()], [3, []]);

console.log("\n--- 5. 現在地の行（src/widget/reading/location-bar.ts） ---");
const bar = read("src/widget/reading/location-bar.ts");
const barStyles = read("src/widget/reading/location-bar-styles.ts");
const widget = read("src/widget/comments/comments.ts");
ok("高さは窓の上端と同じ値を読む", [barStyles.includes("height: ${TITLEBAR_HEIGHT}px;"), bar.includes('topInset.set("location", TITLEBAR_HEIGHT)')], [true, true]);
ok("色はワークスペースの墨から採る（道具箱の色を使わない）", [barStyles.includes("WORKSPACE_INK.light"), barStyles.includes("WORKSPACE_INK.dark"), /var\(--(accent|surface|text)\)/.test(barStyles)], [true, true, false]);
ok("戻る・進むを出すかは CSS だけで決める", [/\.steps \{ display: none; \}/.test(barStyles), /@container \(min-width: 1px\) \{\s*\.steps \{ display: flex; \}/.test(barStyles)], [true, true]);
ok("紙に刷るときは出さない", /@media print \{\s*:host \{ display: none !important; \}/.test(barStyles), true);
ok("来た一覧なら、移動ではなく履歴を戻る", /if \(!this\.from\.viaBack \|\|[^\n]+return;\s*event\.preventDefault\(\);\s*window\.history\.back\(\);/.test(bar), true);
ok("直に開いたときの戻る先は、組織の資料（自分の資料と言わない）", /return \{ label: placeLabel\(LIBRARY_PLACE, t\), href: LIBRARY_PLACE\.href, viaBack: false \};/.test(bar), true);
ok("よその画面の中にはめ込まれているときは出さない", bar.includes("if (window.top !== window.self) return null;"), true);
// アプリの中のブラウザ（iOS）の見分けは配布版に無い
ok("アプリの中のブラウザの印を読まない", /appViewerFromTag/.test(widget), false);
ok("答えを待ってから出すときは、会社の人にだけ", widget.includes('const member = state.viewer !== null && state.viewer.kind === "member";'), true);
ok("発表中は隠す", read("src/widget/deck/deck.ts").includes("${present} ${LOCATION_TAG}"), true);

console.log("\n--- 6. 上端の帯の持ち主（src/widget/reading/top-inset.ts） ---");
const sources = ["src/widget/comments/history.ts", "src/widget/reading/nav.ts", "src/widget/reading/location-bar.ts", "src/widget/comments/comments.ts", "src/widget/comments/selection.ts"];
ok("本文の上の余白を書くのは持ち主だけ", sources.filter((file) => /style\.(paddingTop|scrollPaddingTop) =/.test(read(file))), []);
ok("帯は自分の高さを届けるだけ", [read("src/widget/comments/history.ts").includes('topInset.set("compare", height)'), read("src/widget/reading/nav.ts").includes('topInset.set("reading", readingTop)')], [true, true]);
const tokens = read("src/widget/shared/tokens.ts");
ok("道具箱の全面の画面は、窓の題名の帯の下から始める", [tokens.includes("--titlebar-h: ${TITLEBAR_HEIGHT_CSS};"), read("src/widget/shared/styles.ts").includes("inset: var(--titlebar-h) 0 0 0;")], [true, true]);

console.log("\n--- 7. 配信 ---");
// アプリの中のブラウザに配る紙（札の印・別の照合の印）とデスクトップアプリは配布版に無い。札にも照合の印にも残っていないことだけ見る
ok("札にアプリの印を付けない", /APP_VIEWER_ATTR|data-viewer/.test(read("src/lib/pages/content.ts")), false);
ok("アプリ向けの別の紙を作らない", /"-app"/.test(read("src/lib/pages/cache.ts")), false);

if (failures > 0) {
  console.log(`\n${failures} 件の不一致`);
  process.exit(1);
}
console.log("\nすべて一致");
