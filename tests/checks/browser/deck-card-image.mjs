/**
 * スライドの共有カードの絵（src/lib/deck/card/card-image.ts）を、本物の Chromium で描いて確かめる。
 *
 *   1. 旧い実行部（src/templates/deck.html）の見本と、新しい実行部（deck-design）の見本の両方で、
 *      1 枚目が 1280×720 の PNG になる（縮めも伸ばしもしない）
 *   2. 枚を指せば（slide: 2）別の絵になる（1 枚目と 1 バイトも同じでない・白紙でない）
 *   3. 枚数を超えた番号は最後の枚になる（実行部の丸めと同じ向き）
 *   4. 道具（vendor）は自分の宛先から取り、文書そのものはネットワークへ出ない
 *
 * 保管庫にも Slack にも繋がない。vendor だけを配る小さなサーバーを手元に立てる。
 * 描いた絵は /tmp/deck-card-qa/ に残す（目で確かめるため）。
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { databaseStub, dir, root } from "../paths.mjs";

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const { default: sharp } = await import("sharp");

const output = "/tmp/deck-card-qa";
await mkdir(output, { recursive: true });

/** 枚に貼る写真の代わり。見分けやすい 1 色（マゼンタ）で塗った 1 枚 */
const PHOTO_COLOR = { r: 255, g: 0, b: 255 };
const PHOTO = await sharp({ create: { width: 800, height: 450, channels: 3, background: PHOTO_COLOR } }).png().toBuffer();
// 組み立てたものはリポジトリの中（.test-build・git の対象外）へ置く。外に置くと、描く部品が
// 実行時に読む playwright・sharp を node_modules から見つけられない
const built = `${root}/.test-build/deck-card`;
await mkdir(built, { recursive: true });

// ログイン・cookie・保管庫への接ぎ口だけ差し替えて、描く部品を取り出す
await writeFile(
  `${dir}/deck-card-stub.mjs`,
  `export const ALLOWED_DOMAIN = "example.com";\n` +
    "export const auth = async () => null;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    "export const headers = async () => ({ get: () => null });\n" +
    'export const createClient = () => { throw new Error("検査では保管庫に繋がない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/deck/card/card-image.ts`, `${root}/src/lib/pages/content.ts`, `${root}/src/lib/deck/card/card.ts`],
  outdir: built,
  entryNames: "deck-card-[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*", "playwright", "playwright-core", "sharp", "@sparticuz/chromium"],
  alias: {
    "@/auth": `${dir}/deck-card-stub.mjs`,
    "next/headers": `${dir}/deck-card-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/deck-card-stub.mjs`),
  },
});
const { renderDeckSlideImage, snapshotDocument, closeDeckCardBrowser } = await import(`${built}/deck-card-card-image.mjs`);
const { withoutDeckNotes } = await import(`${built}/deck-card-content.mjs`);
const { deckSlideHtmls } = await import(`${built}/deck-card-card.mjs`);

// vendor だけを配る。文書（/public/…/）は描く側が自分で応えるので、ここへは来ない
const VENDOR_FILES = {
  "tailwind.js": "vendor/tailwindcss/tailwind.js",
  "lucide.js": "vendor/lucide/lucide.js",
  "mermaid.js": "vendor/mermaid/mermaid.js",
  "echarts.js": "vendor/echarts/echarts.js",
};
const served = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  served.push(url.pathname);
  const parts = url.pathname.split("/").filter(Boolean);
  let file = null;
  let type = "application/javascript; charset=utf-8";
  // 枚の中の素材。公開の宛先（/public/<呼び名>/<ファイル>）から名乗り無しで取れることを模す
  if (url.pathname === "/public/example/deck-image/photo.png") {
    response.writeHead(200, { "content-type": "image/png" }).end(PHOTO);
    return;
  }
  if (parts[0] === "vendor" && parts[1] === "deck-fonts" && parts.length === 3) {
    file = path.join(root, "vendor/deck-fonts", parts[2]);
    type = "font/woff2";
  } else if (parts[0] === "vendor" && VENDOR_FILES[parts[1]]) {
    file = path.join(root, VENDOR_FILES[parts[1]]);
  }
  if (file === null) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": type }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const pngSize = (png) => {
  assert.equal(png.subarray(1, 4).toString(), "PNG", "PNG の頭");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};
/** 白紙でないか。濃淡のばらつきが無ければ何も描けていない。 */
const painted = async (png) => {
  const { channels } = await sharp(png).stats();
  return channels.some((channel) => channel.stdev > 8);
};

let failed = 0;
const ok = (label, actual, expected) => {
  const good = actual === expected;
  if (!good) failed += 1;
  console.log(`${good ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const FIXTURES = [
  // 旧い実行部（src/templates/deck.html）だけの見本
  { name: "deck", file: "tests/checks/fixtures/internal/example/deck.html", slides: 6 },
  // 新しい実行部（deck-design）の見本
  { name: "deck-design-report", file: "tests/checks/fixtures/internal/example/deck-design-report.html", slides: 6 },
  // 図（Mermaid）とグラフ（ECharts）を実際に描く見本（道具は vendor から取る）
  // （雛形の但し書きの注釈にも `<section data-deck-slide>` の字面があるので、字面の数は 64・枚は 63）
  { name: "deck-format-catalog", file: "tests/checks/fixtures/internal/example/deck-format-catalog.html", slides: 63 },
];

try {
  for (const fixture of FIXTURES) {
    console.log(`\n--- ${fixture.name} ---`);
    const html = withoutDeckNotes(await readFile(`${root}/${fixture.file}`, "utf8"));
    const pageHref = `${origin}/public/example/${fixture.name}`;
    const count = fixture.slides;
    ok("見本に枚がある", count > 1, true);

    const prepared = snapshotDocument(html, pageHref);
    ok("配信と同じ基準（base）が入る", prepared.includes(`<base href="${pageHref}/">`), true);
    ok("撮るための指定が head の中に入る", prepared.indexOf("data-sp-deck-card") < prepared.indexOf("</head>"), true);

    const first = await renderDeckSlideImage({ html, pageHref, slide: 1 });
    ok("1 枚目が描ける", first !== null, true);
    if (first === null) continue;
    const firstPng = Buffer.from(first);
    await writeFile(`${output}/${fixture.name}-1.png`, firstPng);
    ok("1 枚目の寸法", JSON.stringify(pngSize(firstPng)), JSON.stringify({ width: 1280, height: 720 }));
    ok("1 枚目が白紙でない", await painted(firstPng), true);

    const second = await renderDeckSlideImage({ html, pageHref, slide: 2 });
    ok("2 枚目が描ける", second !== null, true);
    if (second === null) continue;
    const secondPng = Buffer.from(second);
    await writeFile(`${output}/${fixture.name}-2.png`, secondPng);
    ok("2 枚目の寸法", JSON.stringify(pngSize(secondPng)), JSON.stringify({ width: 1280, height: 720 }));
    ok("2 枚目は 1 枚目と別の絵", firstPng.equals(secondPng), false);
    ok("2 枚目が白紙でない", await painted(secondPng), true);

    const last = await renderDeckSlideImage({ html, pageHref, slide: count });
    const beyond = await renderDeckSlideImage({ html, pageHref, slide: count + 50 });
    ok("枚数を超えた番号は最後の枚", last !== null && beyond !== null && Buffer.from(last).equals(Buffer.from(beyond)), true);
    if (last !== null) await writeFile(`${output}/${fixture.name}-last.png`, Buffer.from(last));

    // 図（Mermaid）やグラフ（ECharts）のある枚は、描き終わるのを待ってから撮る
    const slides = deckSlideHtmls(html);
    ok("枚の切り出しの数が本文と合う", slides.length, fixture.slides);
    const drawnKinds = [
      ["グラフ", slides.findIndex((slide) => /\sdata-dd-chart(?:[\s=>/]|$)/.test(slide))],
      ["図", slides.findIndex((slide) => /class="[^"]*\bmermaid\b/.test(slide))],
    ];
    for (const [kind, at] of drawnKinds) {
      if (at < 0) continue;
      const drawn = await renderDeckSlideImage({ html, pageHref, slide: at + 1 });
      ok(`${kind}のある枚（${at + 1} 枚目）が描ける`, drawn !== null, true);
      if (drawn !== null) {
        const drawnPng = Buffer.from(drawn);
        await writeFile(`${output}/${fixture.name}-${kind === "図" ? "diagram" : "chart"}.png`, drawnPng);
        ok(`${kind}のある枚が白紙でない`, await painted(drawnPng), true);
      }
    }
  }

  console.log("\n--- 枚の中の画像 ---");
  console.log("   素材は公開の宛先（<base> から /public/<呼び名>/ へ解ける）から取る。遅れて読む画像（loading=lazy）も、その枚を見せてから撮る");
  {
    const base = withoutDeckNotes(await readFile(`${root}/tests/checks/fixtures/internal/example/deck.html`, "utf8"));
    // 3 枚目の先頭に写真を置く（1 枚目ではないので、実行部は遅れて読む印を付ける）
    let seen = 0;
    const html = base.replace(/<section data-deck-slide>/g, (tag) => (++seen === 3 ? `${tag}<img src="photo.png" alt="" style="display:block;width:800px;height:450px">` : tag));
    ok("写真を 3 枚目に置けた", seen >= 3, true);
    const pageHref = `${origin}/public/example/deck-image`;
    const third = await renderDeckSlideImage({ html, pageHref, slide: 3 });
    ok("写真のある枚が描ける", third !== null, true);
    if (third !== null) {
      const png = Buffer.from(third);
      await writeFile(`${output}/deck-image-3.png`, png);
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      let magenta = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] > 240 && data[i + 1] < 16 && data[i + 2] > 240) magenta += 1;
      }
      ok("写真の画素が絵に写っている（800×450 のうち 9 割以上）", magenta >= 800 * 450 * 0.9, true);
      ok("写真は公開の宛先から取りに来た", served.includes("/public/example/deck-image/photo.png"), true);
    }
  }

  console.log("\n--- 通信 ---");
  // 文書は描く側が保管庫の本文で応える。素材（`/public/<呼び名>/<画像>`）は公開の宛先へ取りに来てよい
  ok("文書そのものを取りに来ていない", served.some((p) => FIXTURES.some((fixture) => p === `/public/example/${fixture.name}/`)), false);
  ok("道具は自分の宛先から取る", served.some((p) => p.startsWith("/vendor/")), true);
  ok("枚の無い本文は null", await renderDeckSlideImage({ html: "<html><body data-deck><main data-deck-slides></main></body></html>", pageHref: `${origin}/public/example/empty`, slide: 1 }), null);
} finally {
  await closeDeckCardBrowser();
  server.close();
}

console.log(`\n絵は ${output}/ に置いた`);
console.log(failed === 0 ? "すべて合格" : `${failed} 件 不合格`);
if (failed > 0) process.exit(1);
