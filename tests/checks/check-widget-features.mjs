import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { writeFile, readFile } from "node:fs/promises";
import { root, dir } from "./paths.mjs";
import { readWidgetSource } from "./widget-source.mjs";

const dom = new JSDOM("<!doctype html><body><p>比較の本文</p></body>", {
  url: "https://example.test/internal/example/test", pretendToBeVisual: true,
});
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "NodeFilter", "Range"])
  globalThis[key] = dom.window[key];
let disconnects = 0;
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() { disconnects += 1; }
};
dom.window.matchMedia = () => ({ matches: false });
const pending = [];
globalThis.__widgetFeatureRequest = (kind) => new Promise(resolve => pending.push({ kind, resolve }));
const stub = `${dir}/widget-feature-api.mjs`;
await writeFile(stub, [
  "loadRedline", "loadVersions", "loadPageAccess", "loadSlackChannels", "savePageAccess", "shareToSlack",
].map(name => `export const ${name} = () => globalThis.__widgetFeatureRequest(${JSON.stringify(name)});`).join("\n"));
await build({
  stdin: { contents: `export {createWidgetLifetime} from './src/widget/shared/widget-lifetime';
export {createCommentSharing} from './src/widget/comments/sharing';
export {createCommentHistory} from './src/widget/comments/history';`, resolveDir: root },
  outfile: `${dir}/widget-features.mjs`, bundle: true, platform: "node", format: "esm",
  plugins: [{ name: "feature-api", setup(b) {
    b.onResolve({ filter: /^\.\/api$|\/shared\/api$/ }, () => ({ path: stub }));
  } }],
});
const { createWidgetLifetime, createCommentSharing, createCommentHistory } = await import(`${dir}/widget-features.mjs`);
function checked(label, action) { action(); console.log(`OK  ${label}`); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

console.log("--- 終了した画面の仕事を止める ---");
const lifetime = createWidgetLifetime();
let calls = 0;
dom.window.addEventListener("feature-test", () => calls++, { signal: lifetime.signal });
dom.window.dispatchEvent(new dom.window.Event("feature-test"));
lifetime.timeout(() => calls++, 10);
lifetime.interval(() => calls++, 10);
lifetime.frame(() => calls++);
lifetime.dispose();
lifetime.dispose();
dom.window.dispatchEvent(new dom.window.Event("feature-test"));
await pause(40);
checked("終了後は操作の監視・待ち時間・繰り返し・次の描画が動かない", () => assert.equal(calls, 1));
checked("終了後に追加された待機処理も動かない", () => {
  assert.equal(lifetime.timeout(() => calls++, 0), 0);
  assert.equal(lifetime.interval(() => calls++, 0), 0);
  assert.equal(lifetime.frame(() => calls++), 0);
});
const running = createWidgetLifetime();
let completed = 0;
running.timeout(() => completed++, 0);
const cancelled = running.timeout(() => completed++, 0);
running.clearTimeout(cancelled);
await pause(10);
checked("表示中の処理は実行され、取り消した処理だけ止まる", () => assert.equal(completed, 1));
running.dispose();

console.log("--- 遅れて届く共有設定 ---");
let renders = 0;
const noop = () => {};
const shared = { view: "comments", busy: false, slug: "internal/example/test", features: { sharing: true }, visibility: "internal", personal: false };
const sharing = createCommentSharing({ state: shared, setOpen: noop, render: () => renders++,
  renderPanelBody: noop, handleFailure: noop, showError: noop, pushToast: () => "toast", actionButton: noop,
  barLink: null, narrowLink: null });
const access = sharing.openAccess();
shared.view = "versions";
pending.shift().resolve({ ok: false, status: 500, message: "読み取り失敗" });
await access;
checked("共有設定の古い失敗で別の画面を閉じない", () => assert.equal(shared.view, "versions"));
const afterClose = sharing.openAccess();
sharing.dispose();
const beforeRender = renders;
pending.shift().resolve({ ok: true, value: { scope: "internal" } });
await afterClose;
checked("終了後に届いた共有設定は表示も状態も更新しない", () => {
  assert.equal(sharing.state.access, null); assert.equal(renders, beforeRender);
});

console.log("--- 同じ2版を続けて比較したときの逆順応答 ---");
const older = { sha: "a".repeat(40), committedAt: "2026-09-18", author: null };
const newer = { sha: "b".repeat(40), committedAt: "2026-09-18", author: null };
const context = { state: { view: "comments", slug: shared.slug, outcomes: new Map(), outcomesFor: null,
  features: { history: true }, currentVersion: newer.sha }, render: () => renders++, fillOutcomes: async () => {},
  outcomeTargetVersion: () => newer.sha, readingNavigation: null };
// Unused connections remain explicit no-ops; real comparison and redline code run.
const history = createCommentHistory(new Proxy(context, { get: (target, key) => key in target ? target[key] : noop }));
history.state.versions = [newer, older];
const first = history.startCompare(older, newer, false);
const second = history.startCompare(older, newer, false);
const diff = { identical: true, changes: [], images: { added: [], removed: [] } };
pending[1].resolve({ ok: true, value: diff });
await second;
const current = history.state.compare;
const renderAfterSecond = renders;
pending[0].resolve({ ok: true, value: { ...diff, identical: false } });
await first;
pending.length = 0;
checked("先に送った比較の結果が後の比較を上書きしない", () => {
  assert.equal(history.state.compare, current); assert.equal(current.diff, diff); assert.equal(renders, renderAfterSecond);
});
const third = history.startCompare(older, newer, false);
history.clearCompare();
pending.shift().resolve({ ok: true, value: diff });
await third;
checked("比較を閉じたあとに届いても再表示しない", () => assert.equal(history.state.compare, null));
const versions = history.ensureVersions(); // cached versions need no request
assert.deepEqual(await versions, [newer, older]);
history.dispose();
checked("比較の監視を終了時に解除する", () => assert.ok(disconnects > 0));

console.log("--- 分割先も実装の検査に含める ---");
const inspected = await readWidgetSource();
for (const name of ["createCommentSharing", "createCommentOrigin", "createCommentHistory", "createCommentList", "createCommentSelection"])
  checked(`${name} の実装を1度だけ読む`, () => assert.equal((inspected.match(new RegExp(`export function ${name}\\(`, "g")) ?? []).length, 1));
const entry = await readFile(`${root}/src/widget/comments/comments.ts`, "utf8");
checked("実際の入口と原稿の図を控える処理も検査する", () => {
  assert.ok(inspected.startsWith(entry));
  assert.equal((inspected.match(/keepMermaidSource\(document\)/g) ?? []).length, 1);
});
dom.window.close();
