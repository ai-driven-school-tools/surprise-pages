import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { dir, root } from "./paths.mjs";

let fails = 0;
const ok = (label, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}${pass ? "" : `: ${JSON.stringify(actual)}（期待 ${JSON.stringify(expected)}）`}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
async function bundle(file, name) {
  await build({ entryPoints: [`${root}/${file}`], outfile: `${dir}/${name}.mjs`, bundle: true, platform: "node", format: "esm" });
  return import(`${dir}/${name}.mjs?at=${Date.now()}`);
}
async function bundleLogoRoute() {
  const stub = `${root}/tests/checks/fixtures/deck-design/store.mjs`;
  await build({
    stdin: { contents: `export { POST } from './src/app/api/pages/logo/route';`, resolveDir: root },
    outfile: `${dir}/deck-logo-route.mjs`, bundle: true, platform: "node", format: "esm",
    plugins: [{ name: "memory-only", setup(builder) {
      builder.onResolve(
        { filter: /supabase$|database$|pages\/cache$|^\.\/cache$|^@vercel\/blob$|^@\/lib\/(identity\/identity|access\/access|comments\/comments)$|^\.\/comments$|^@\/auth$|^next\/headers$/ },
        () => ({ path: stub }),
      );
    } }],
  });
  return import(`${dir}/deck-logo-route.mjs?at=${Date.now()}`);
}

const focus = await bundle("src/lib/deck/design/focus.ts", "deck-focus-lib");
const logo = await bundle("src/lib/deck/media/logo.ts", "deck-logo-lib");
const custom = await bundle("src/lib/deck/edit/customization-html.ts", "deck-customization-html");
const customDom = await bundle("src/lib/deck/edit/customization-dom.ts", "deck-customization-dom");
const imageSize = await bundle("src/lib/html/image-dimensions.ts", "deck-image-dimensions");
const markdown = await bundle("src/lib/pages/markdown.ts", "deck-customization-markdown");
const htmlText = await bundle("src/lib/html/text.ts", "deck-customization-text");
const anchor = await bundle("src/widget/comments/anchor.ts", "deck-customization-anchor");
const focusEditor = await bundle("src/widget/deck/edit/focus-editor.ts", "deck-focus-editor-regression");
const logoApi = await bundleLogoRoute();

const authoredFocus = {
  version: 1,
  guidedByDefault: false,
  slides: {
    opening: { steps: [
      { id: "claim", title: "結論", supplement: "読み手にも残す補足", actions: [
        { id: "emphasize-claim", kind: "emphasize", targets: [{ slideId: "opening", kind: "element", id: "claim" }] },
      ] },
      { id: "compare", actions: [
        { id: "compare-cells", kind: "compare", targets: [
          { slideId: "opening", kind: "cell", id: "before" },
          { slideId: "opening", kind: "cell", id: "after" },
        ] },
      ] },
    ] },
    evidence: { steps: [{ id: "period", actions: [
      { id: "range", kind: "range", targets: [{ slideId: "evidence", kind: "range", id: "q1" }] },
    ] }] },
  },
};
const authoredLogo = {
  version: 1,
  asset: null,
  document: logo.DEFAULT_LOGO_PRESENTATION,
  slides: {},
};
const brandedLogo = logo.deckLogoSchema.parse({ ...authoredLogo,
  asset: {path:"logo.svg",contentType:"image/svg+xml",intrinsicWidth:1000,intrinsicHeight:210,mark:{x:0,y:0,width:.214,height:1}},
  document:{...logo.DEFAULT_LOGO_PRESENTATION,placement:"bottom-right",size:14.375,offsetX:52,offsetY:32},
  layouts:{cover:{placement:"top-left",size:18.75,offsetX:64,offsetY:112},closing:{placement:"top-center",variant:"mark",size:5,offsetX:0,offsetY:144}}
});
ok("枚の役割で表紙ロゴを選ぶ",logo.effectiveLogo(brandedLogo,logo.emptyLogoOverrides(),"later","cover").presentation.placement,"top-left");
ok("本文ロゴは採用した右下位置",[logo.effectiveLogo(brandedLogo,logo.emptyLogoOverrides(),"body").presentation.offsetX,logo.effectiveLogo(brandedLogo,logo.emptyLogoOverrides(),"body").presentation.offsetY],[52,32]);
ok("結びのマークは正式画像の指定範囲で比率を保つ",Math.round(logo.deckLogoRatio(logo.effectiveLogo(brandedLogo,logo.emptyLogoOverrides(),"end","closing"))*1000),981);
ok("1枚だけの指定は役割より優先",logo.effectiveLogo(brandedLogo,{version:1,document:{},slides:{end:{placement:"hidden"}}},"end","closing").presentation.placement,"hidden");
ok("レイアウトだけの保存設定も保持対象",logo.hasLogoOverrides({...logo.emptyLogoOverrides(),layouts:brandedLogo.layouts}));
ok("画像からはみ出すマーク範囲は断る",logo.logoRegionSchema.safeParse({x:.9,y:0,width:.2,height:1}).success,false);
const brandedPortable={kind:logo.DECK_LOGO_PORTABLE_KIND,version:1,contentType:"image/svg+xml",dataUrl:"data:image/svg+xml;base64,PHN2Zy8+",mark:brandedLogo.asset.mark,layouts:brandedLogo.layouts,document:brandedLogo.document,slides:{}};
ok("持ち運びでも表紙と結びとマーク範囲を保持",[logo.importPortableLogo(logo.exportPortableLogo(brandedPortable)).mark,logo.importPortableLogo(logo.exportPortableLogo(brandedPortable)).layouts],[brandedPortable.mark,brandedPortable.layouts]);
const themes = await bundle("src/lib/deck/design/theme-source.ts", "deck-logo-theme-source");
const editSource = await bundle("src/lib/deck/edit/source.ts", "deck-logo-edit-source");
const vendors = await bundle("src/lib/html/vendor-scripts.ts", "deck-logo-vendors");
// この版には会社のテーマの一覧が無い（src/templates/deck-company-themes.json は空）。テーマの適用そのものは
// 利用者が保存したテーマで使い続けるので、同じ形のテーマを検査の中で 2 つ用意して確かめる。
const school = {stamp:{id:"9e5f4cb2-f428-47d5-bb16-87f489d609aa",version:"0ce39a2f-359b-4466-8c96-9665cdfefff1",name:"見本の学校"},snapshot:{appearance:{background:"#ffffff",accent:"#0d6ca7",secondary:"#223a49",decoration:"none",intensity:40,x:85,y:20,scale:100,angle:135,motion:false,typography:"school",ornament:"school"},logo:{asset:{path:"assets/example-logo.svg",contentType:"image/svg+xml",intrinsicWidth:1000,intrinsicHeight:210,mark:{x:0,y:0,width:0.214,height:1}},presentation:{placement:"bottom-right",size:14.375,opacity:100,offsetX:52,offsetY:32,nudgeX:0,nudgeY:0,color:"original",backplate:false,variant:"full"},layouts:{cover:{placement:"top-left",size:18.75,offsetX:64,offsetY:112,variant:"full"},closing:{placement:"top-center",size:5,offsetX:0,offsetY:144,variant:"mark"}}}}};
const previousStock = JSON.parse(await readFile(`${root}/tests/checks/fixtures/deck-design/previous-school-kit.json`,"utf8"));
const previousKit = gunzipSync(Buffer.from(previousStock.gzip,"base64")).toString();
const legacyDoc = `<html><head><script type="application/json" data-deck-design>${JSON.stringify({version:1,document:school.snapshot.appearance,slides:{}})}</script><script type="application/json" data-deck-logo>${JSON.stringify(authoredLogo)}</script>${previousKit}</head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="first" data-deck-node="first"><h1 data-deck-node="first-title">旧資料</h1></section></main></body></html>`;
const upgrade = themes.themeOperations(legacyDoc,school.snapshot,school.stamp);
const upgraded = editSource.applyDeckEditOperations(legacyDoc,upgrade);
ok("旧資料へのテーマ適用は標準CSSと描画処理も同時更新",upgrade.filter(op=>op.kind==="setting"&&op.name.startsWith("design-")).map(op=>op.name),["design-style","design-runtime"]);
ok("配信用URLの表示にも同じテーマ操作を適用できる",editSource.applyDeckEditOperations(vendors.withVendorScripts(legacyDoc),upgrade).html,vendors.withVendorScripts(upgraded.html));
ok("新しい配置を旧描画処理のまま保存しない",editSource.deckSourceSetting(upgraded.html,"design-runtime")===editSource.deckSourceSetting(legacyDoc,"design-runtime"),false);
const schoolAuthoredDoc=upgraded.html.replace(JSON.stringify(authoredLogo),JSON.stringify(brandedLogo));
const otherTheme={stamp:{id:"9a5e8700-7f08-4f26-991e-bce554a2f71a",version:"ee624bb9-a2b6-41cb-9a71-a76db9ac2001",name:"見本の会社"},snapshot:{appearance:{background:"#fbfcfe",accent:"#1b2530",secondary:"#8b9cad",decoration:"diagonal",intensity:80,x:85,y:16,scale:100,angle:130,motion:true,typography:"soft",ornament:"none"},logo:{asset:{path:"assets/example-mark.svg",contentType:"image/svg+xml",intrinsicWidth:377,intrinsicHeight:112},presentation:{placement:"top-right",size:12,opacity:100,offsetX:40,offsetY:40,nudgeX:0,nudgeY:0,color:"original",backplate:false}}}};
const changedTheme=editSource.applyDeckEditOperations(schoolAuthoredDoc,themes.themeOperations(schoolAuthoredDoc,otherTheme.snapshot,otherTheme.stamp));
ok("テーマと描画更新の取り消し・別テーマで役割配置の解除",[editSource.applyDeckEditOperations(upgraded.html,upgraded.inverse).html,themes.documentTheme(changedTheme.html).logo.layouts],[legacyDoc,{}]);
ok("独自の描画処理をテーマ適用で上書きしない",throws(()=>themes.themeOperations(legacyDoc.replace('data-deck-design-runtime="3"','data-custom-runtime="3"'),school.snapshot,school.stamp)));
const htmlOf = (slides = `
  <section data-deck-slide data-deck-id="opening">
    <h1 data-dd-element-id="claim">結論</h1><table><tr><td data-dd-cell-id="before">前</td><td data-dd-cell-id="after">後</td></tr></table>
  </section>
  <section data-deck-slide data-deck-id="evidence"><div data-dd-range-id="q1">1〜3月</div></section>`) =>
  `<!doctype html><html><head><title>例</title>` +
  `<script type="application/json" data-deck-focus>${JSON.stringify(authoredFocus)}</script>` +
  `<script type="application/json" data-deck-logo>${JSON.stringify(authoredLogo)}</script>` +
  `</head><body data-deck><main data-deck-slides>${slides}</main></body></html>`;

const focusOverrides = {
  version: 1,
  guided: true,
  slides: {
    opening: { order: ["compare", "claim", "missing-step"], steps: {
      claim: { title: "更新した結論" },
      missingStep: { actions: [{ id: "orphan", kind: "emphasize", targets: [{ slideId: "gone", kind: "row", id: "lost" }] }] },
    } },
  },
};
// Correct the intentionally separate stable key without relying on array position.
focusOverrides.slides.opening.steps["missing-step"] = focusOverrides.slides.opening.steps.missingStep;
delete focusOverrides.slides.opening.steps.missingStep;
const logoOverrides = {
  version: 1,
  asset: { path: "_deck/logo-123.png", contentType: "image/png" },
  document: { placement: "bottom-right", opacity: 80 },
  slides: { evidence: { placement: "watermark", nudgeX: 1 } },
};

console.log("--- 1. 安定した目印と原稿更新 ---");
const original = htmlOf();
const saved = custom.withDeckCustomization(original, { version: 1, focus: focusOverrides, logo: logoOverrides });
const source = custom.readDeckCustomizationHtml(saved);
ok("手順の並べ替えを目印で反映", source.focus.effective.slides.get("opening").map((step) => step.id), ["compare", "claim", "missing-step"]);
ok("利用者が足した手順を保持", source.focus.effective.slides.get("opening")[2].actions[0].id, "orphan");
ok("見つからない対象を警告", source.focus.effective.invalidTargets.map((item) => item.reason), ["slide"]);
ok("見つからない対象を別のものへ付け替えない", source.focus.effective.invalidTargets[0].target.id, "lost");
const crossSlide = {
  ...authoredFocus,
  slides: { ...authoredFocus.slides, opening: { steps: [{ id: "cross", actions: [{
    id: "cross-action", kind: "emphasize", targets: [{ slideId: "evidence", kind: "range", id: "q1" }],
  }] }] } },
};
const crossHtml = original.replace(JSON.stringify(authoredFocus), JSON.stringify(crossSlide));
ok("別の枚を指す対象は有効に見せない", custom.readDeckCustomizationHtml(crossHtml).focus.effective.invalidTargets[0].reason, "cross-slide");
const typoFocus = { ...authoredFocus, slides: { typo: { steps: [] } } };
const typoLogo = { ...authoredLogo, slides: { typo: { placement: "hidden" } } };
ok("原稿側の焦点に存在しない枚IDがあれば断る", throws(() => custom.readDeckCustomizationHtml(original.replace(JSON.stringify(authoredFocus), JSON.stringify(typoFocus)))));
ok("原稿側のロゴに存在しない枚IDがあれば断る", throws(() => custom.readDeckCustomizationHtml(original.replace(JSON.stringify(authoredLogo), JSON.stringify(typoLogo)))));
ok("読み手向け補足を発表者メモ外で保持", source.focus.effective.slides.get("opening")[1].supplement, "読み手にも残す補足");
const serverText = htmlText.htmlBodyText(original);
ok("サーバーの本文抽出にも公開補足を枚の順で残す", serverText.indexOf("読み手にも残す補足") > serverText.indexOf("結論") && serverText.indexOf("読み手にも残す補足") < serverText.indexOf("1〜3月"));
ok("ロゴ素材を保持一覧へ足せる", custom.deckLogoAssetPaths(saved), ["_deck/logo-123.png"]);
const focusOnly = custom.withDeckCustomization(original, { version: 1, focus: focusOverrides });
const logoOnly = custom.withDeckCustomization(original, { version: 1, logo: logoOverrides });

const reordered = htmlOf(`
  <section data-deck-slide data-deck-id="evidence"><div data-dd-range-id="q1">更新した期間</div></section>
  <section data-deck-slide data-deck-id="opening"><h1 data-dd-element-id="claim">更新した結論</h1><td data-dd-cell-id="before">前</td><td data-dd-cell-id="after">後</td></section>`);
const inherited = custom.inheritDeckCustomizations(saved, reordered);
const refreshed = custom.readDeckCustomizationHtml(inherited);
ok("枚を並べ替えても焦点設定を維持", refreshed.focus.overrides, focusOverrides);
ok("枚を並べ替えてもロゴ設定を維持", refreshed.logo.overrides, logoOverrides);
ok("同じ更新を繰り返しても同じ", custom.inheritDeckCustomizations(inherited, reordered), inherited);
const deletedFocus = { ...authoredFocus, slides: { opening: authoredFocus.slides.opening } };
const deleted = htmlOf(`<section data-deck-slide data-deck-id="opening"><h1 data-dd-element-id="claim">結論</h1><td data-dd-cell-id="before">前</td><td data-dd-cell-id="after">後</td></section>`)
  .replace(JSON.stringify(authoredFocus), JSON.stringify(deletedFocus));
const afterDelete = custom.readDeckCustomizationHtml(custom.inheritDeckCustomizations(saved, deleted));
ok("消えた枚のロゴ指定を無効のまま保持", afterDelete.logo.invalidSlideIds, ["evidence"]);
ok("消えた焦点対象を無効のまま保持", afterDelete.focus.effective.invalidTargets.some((item) => item.target.slideId === "gone"));
ok("設定を失う旧形式への更新を断る", throws(() => custom.inheritDeckCustomizations(saved, "<body data-deck><p>旧形式</p></body>")));
const publishRoute = await readFile(`${root}/src/app/api/pages/route.ts`, "utf8");
const prepareRoute = await readFile(`${root}/src/app/api/pages/prepare/route.ts`, "utf8");
ok("投稿後の素材整理に保存済みロゴを足す", publishRoute.includes("deckLogoAssetPaths(result.html)"));
ok("過去版のロゴも投稿前に非公開の写しへ凍結", prepareRoute.includes("await copy(asset.pathname, target, { access: \"private\""));
ok("ブラウザ保存だけを通った過去版ロゴも片付けない", publishRoute.includes("!pathname.startsWith(`${prefix}${DECK_LOGO_ASSET_PREFIX}`)"));

console.log("--- 2. 型・ブラウザの読み書き・持ち運び ---");
ok("対象10種が契約にある", Object.keys(focus.DECK_TARGET_MARKS), ["element", "row", "column", "cell", "series", "point", "range", "region", "node", "edge"]);
ok("説明なしの注釈を断る", focus.focusActionSchema.safeParse({ id: "a", kind: "annotation", targets: [{ slideId: "opening", kind: "element", id: "claim" }] }).success, false);
ok("拡大率の上限を守る", focus.focusActionSchema.safeParse({ id: "a", kind: "zoom", targets: [{ slideId: "opening", kind: "element", id: "claim" }], zoom: { scale: 5, x: 50, y: 50 } }).success, false);
ok("ロゴの1px調整だけ通す", logo.logoPresentationPatchSchema.safeParse({ nudgeX: 2 }).success, false);
const portable = { kind: "surprise-pages-deck-logo", version: 1, contentType: "image/png", dataUrl: "data:image/png;base64,YQ==", document: { opacity: 75 }, slides: {} };
ok("持ち運び用設定に画像本体を含む", logo.importPortableLogo(logo.exportPortableLogo(portable)), portable);
const iconBytes = new Uint8Array(await readFile(`${root}/src/app/icon.svg`));
ok("SVGの元の縦横比を読む", imageSize.imageDimensions(iconBytes, "image/svg+xml"), { width: 32, height: 32 });
const pngBytes = new Uint8Array(24); pngBytes.set([0x89, 0x50, 0x4e, 0x47], 0); pngBytes.set([0, 0, 1, 64, 0, 0, 0, 96], 16);
ok("PNGの透明余白を含む大きさを読む", imageSize.imageDimensions(pngBytes, "image/png"), { width: 320, height: 96 });
globalThis.__deckStore = { page: { title: "例" }, revisions: [], race: false };
globalThis.__deckViewer = { kind: "member", email: "owner@example.test", name: "Owner" };
globalThis.__deckAssets = new Map();
const uploadedResponse = await logoApi.POST(new Request("http://localhost/api/pages/logo?page=internal/example/design&name=icon.svg", {
  method: "POST", body: iconBytes, headers: { "Content-Type": "image/svg+xml", "Content-Length": String(iconBytes.byteLength) },
}));
const uploadedBody = await uploadedResponse.json();
ok("ロゴ送信は編集権限を通って非公開保管", [uploadedResponse.status, uploadedBody.asset.intrinsicWidth, uploadedBody.asset.intrinsicHeight], [201, 32, 32]);
ok("ブラウザへ保管庫の直接鍵を返さない", Object.keys(uploadedBody).sort(), ["asset", "size"]);
globalThis.__deckViewer = { kind: "member", email: "reader@example.test", name: "Reader" };
ok("閲覧だけの人はロゴを送れない", (await logoApi.POST(new Request("http://localhost/api/pages/logo?page=internal/example/design&name=icon.svg", { method: "POST", body: iconBytes }))).status, 404);
delete globalThis.__deckStore; delete globalThis.__deckViewer; delete globalThis.__deckAssets;

const dom = new JSDOM(saved);
const docSource = customDom.readDeckCustomization(dom.window.document);
ok("ブラウザとサーバーが同じ焦点設定を読む", docSource.focus.overrides, source.focus.overrides);
customDom.writeDeckFocusOverrides(dom.window.document, focus.emptyFocusOverrides());
customDom.writeDeckLogoOverrides(dom.window.document, logo.emptyLogoOverrides());
ok("ブラウザで保存設定を解除", dom.window.document.querySelectorAll("[data-deck-focus-overrides],[data-deck-logo-overrides]").length, 0);
dom.window.close();

const editorWindow = new JSDOM("<body></body>", { url: "http://localhost/" }).window;
globalThis.window = editorWindow; globalThis.document = editorWindow.document;
const editorMaster = new editorWindow.DOMParser().parseFromString(original, "text/html");
const editorFrame = editorWindow.document.createElement("iframe"); editorWindow.document.body.append(editorFrame);
editorFrame.contentDocument.write(original);
const previewEvents = [];
editorFrame.contentDocument.addEventListener("surprise:deck-focus-preview", (event) => previewEvents.push(event.detail));
const focusUi = focusEditor.createDeckFocusEditor({
  authored: authoredFocus,
  overrides: focus.emptyFocusOverrides(),
  ids: ["opening", "evidence"],
  master: editorMaster,
  frame: editorFrame,
  changed: () => {},
});
editorWindow.document.body.append(focusUi.root);
[...focusUi.root.querySelectorAll("button")].find((button) => button.textContent === "手順を追加").click();
const addedPreview = previewEvents.at(-1);
ok("新しい手順を足した時点で同じ手順をプレビュー", typeof addedPreview.stepId === "string" && addedPreview.stepId.startsWith("step-"));
const focusKind = focusUi.root.querySelector('select[aria-label="見せ方"]');
focusKind.value = "emphasize"; focusKind.dispatchEvent(new editorWindow.Event("change"));
[...focusUi.root.querySelectorAll("button")].find((button) => button.textContent.includes("要素：結論")).click();
ok("対象を変えても新しい手順のプレビューを維持", previewEvents.at(-1).stepId, addedPreview.stepId);
editorWindow.close(); delete globalThis.window; delete globalThis.document;

console.log("--- 3. 発表中の移動は中央の1か所 ---");
const template = await readFile(`${root}/src/templates/deck.html`, "utf8");
const afterNote = template.indexOf("-->") + 3;
const embed = template.slice(template.indexOf("<style", afterNote), template.lastIndexOf("</script>") + 9);
const navFocus = { version: 1, guidedByDefault: true, slides: {
  one: { steps: [{ id: "one-a", title: "判断の根拠", supplement: "読み手に残す公開補足", actions: [{ id: "overview-one", kind: "overview", targets: [] }] }] },
  two: { steps: [] },
} };
const navHtml = `<!doctype html><html><head><script type="application/json" data-deck-focus>${JSON.stringify(navFocus)}</script></head><body data-deck><main data-deck-slides>
  <section data-deck-slide data-deck-id="one"><h1>一</h1></section>
  <section data-deck-slide data-deck-id="two"><h1>二</h1></section>
</main>${embed}</body></html>`;
const nav = new JSDOM(navHtml, { runScripts: "dangerously", url: "https://example.test/internal/deck" });
const applied = [];
nav.window.document.addEventListener("surprise:deck-focus-apply", (event) => applied.push(event.detail));
nav.window.document.dispatchEvent(new nav.window.CustomEvent("surprise:deck-focus-ready", { detail: {
  guided: true,
  slides: {
    one: [{ id: "one-a", title: "判断の根拠", supplement: "読み手に残す公開補足", actions: [] }, { id: "one-b", actions: [] }],
    two: [{ id: "two-a", actions: [] }, { id: "two-b", actions: [] }],
  },
} }));
const present = [...nav.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("プレゼンを始める"));
ok("通常の読み表示に公開補足を残す", nav.window.document.querySelector("[data-deck-focus-supplements]").textContent, "判断の根拠: 読み手に残す公開補足");
ok("印刷用の補足ページに枚番号と題名を付ける", nav.window.document.querySelector("[data-deck-focus-supplement-page] h2").textContent, "補足 — 1枚目: 一");
ok("補足のない枚には印刷ページを足さない", nav.window.document.querySelectorAll("[data-deck-focus-supplement-page]").length, 1);
present.click();
ok("開始時は最初の手順", applied.at(-1).stepId, "one-a");
ok("公開補足を発表者ノートと別に表示", nav.window.document.querySelector("[data-deck-focus-supplement]").textContent, "読み手に残す公開補足");
const supplementMarkdown = markdown.pageToMarkdown({ root: nav.window.document, title: null, url: "" });
ok("Markdownにも公開補足を1回だけ残す", supplementMarkdown.split("読み手に残す公開補足").length - 1, 1);
globalThis.document = nav.window.document;
globalThis.NodeFilter = nav.window.NodeFilter;
globalThis.Node = nav.window.Node;
globalThis.Element = nav.window.Element;
globalThis.Text = nav.window.Text;
const browserCommentText = anchor.buildTextIndex().text.replace(/\s+/g, " ").trim();
const extractedServerText = htmlText.htmlBodyText(navHtml).replace(/\s+/g, " ").trim();
ok("保存原稿・サーバー抽出・ブラウザ索引で公開補足の順が同じ", browserCommentText, extractedServerText);
delete globalThis.document; delete globalThis.NodeFilter; delete globalThis.Node; delete globalThis.Element; delete globalThis.Text;
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
ok("次は同じ枚の次の手順", applied.at(-1).stepId, "one-b");
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
ok("手順の後に次の枚へ進む", applied.at(-1).stepId, "two-a");
ok("次の枚へ進むと前の焦点を解除", applied.some((item) => item.slideId === "one" && item.stepId === null));
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
ok("戻ると前の枚の最後の手順", applied.at(-1).stepId, "one-b");
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "o", bubbles: true }));
ok("一覧を開ける", nav.window.document.documentElement.hasAttribute("data-deck-overview"));
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "o", bubbles: true }));
ok("一覧から同じ手順へ戻る", applied.at(-1).stepId, "one-b");
nav.window.document.dispatchEvent(new nav.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
ok("Escapeで発表を終える", nav.window.document.documentElement.hasAttribute("data-deck-mode"), false);
ok("読む表示は焦点を残さない", applied.at(-1).stepId, null);
ok("キー移動の受け口は1か所", (embed.match(/addEventListener\("keydown"/g) ?? []).length, 1);
ok("深いリンクと現在見ている枚を同じ入口で選ぶ", embed.includes("enterPresent(startIndex())"));
ok("開始操作は読んでいる位置から動かない", embed.includes("position: sticky"));
nav.window.close();

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails ? 1 : 0;
