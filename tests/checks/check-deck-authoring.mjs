import assert from "node:assert/strict";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";
import { createDeckEditHarness } from "./deck-edit-harness.mjs";
await build({
  stdin: {
    contents: `export * from './src/lib/deck/edit/source';export * from './src/lib/deck/authoring';export * from './src/widget/deck/edit/sync';export * from './src/lib/deck/design/chart-source';export * from './src/lib/deck/design/html';`,
    resolveDir: root,
  },
  outfile: `${dir}/deck-authoring.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
});
const m = await import(`${dir}/deck-authoring.mjs`);
let fails = 0;
async function test(label, fn) {
  try {
    await fn();
    console.log("OK  " + label);
  } catch (error) {
    fails++;
    console.log("NG  " + label + ": " + error.message);
  }
}
const source = m.prepareDeckEdit(
  '<!doctype html><html><head><title>原稿</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="opening"><h1>最初の一枚</h1></section></main><script>/* unchanged */</script></body></html>',
).html;
const original = m.deckSourceChildren(source, "deck-root")[0];
const insert = {
  kind: "fragment",
  target: "new-slide",
  parentId: "deck-root",
  beforeId: null,
  before: null,
  after: m.authorSlide("comparison", "new-slide"),
};
await test("枚を追加しても元の文章と仕掛けを変えない", () => {
  const r = m.applyDeckEditOperations(source, [insert]);
  assert.ok(r.html.includes(m.deckSourceFragment(source, original).html));
  assert.ok(r.html.endsWith("<script>/* unchanged */</script></body></html>"));
  assert.equal(m.applyDeckEditOperations(r.html, r.inverse).html, source);
});
for (const layout of m.AUTHORING_LAYOUTS)
  await test(`${layout.label}を原本の操作で追加・復元できる`, () => {
    const op = { ...insert, after: m.authorSlide(layout.id, "new-slide") },
      r = m.applyDeckEditOperations(source, [op]);
    assert.equal(m.applyDeckEditOperations(r.html, r.inverse).html, source);
  });
await test("枚の並べ替えを原文のまま取り消せる", () => {
  const added = m.applyDeckEditOperations(source, [insert]).html,
    before = m.deckSourceChildren(added, "deck-root"),
    r = m.applyDeckEditOperations(added, [
      {
        kind: "order",
        target: "deck-root",
        before,
        after: [...before].reverse(),
      },
    ]);
  assert.equal(m.applyDeckEditOperations(r.html, r.inverse).html, added);
});
await test("古い並びで他人の追加を消さない", () => {
  const added = m.applyDeckEditOperations(source, [insert]).html;
  assert.throws(() =>
    m.applyDeckEditOperations(added, [
      {
        kind: "order",
        target: "deck-root",
        before: [original],
        after: [original],
      },
    ]),
  );
});
await test("他人が直した枚を削除しない", () => {
  const part = m.deckSourceFragment(source, original);
  assert.throws(() =>
    m.applyDeckEditOperations(source, [
      {
        kind: "fragment",
        target: original,
        parentId: "deck-root",
        beforeId: null,
        before: part.html.replace("最初", "古い"),
        after: null,
      },
    ]),
  );
});
await test("最後の一枚も取り消せる空の資料になる", () => {
  const part = m.deckSourceFragment(source, original),
    r = m.applyDeckEditOperations(source, [
      {
        kind: "fragment",
        target: original,
        parentId: "deck-root",
        beforeId: null,
        before: part.html,
        after: null,
      },
    ]);
  assert.equal(r.nodes.length, 0);
  assert.equal(m.applyDeckEditOperations(r.html, r.inverse).html, source);
});
await test("構造操作で実行コードや編集表示を持ち込めない", () => {
  for (const extra of [
    "<script>alert(1)</script>",
    '<img onerror="alert(1)">',
    '<base href="https://evil.test">',
    "<div data-deck-canvas-input></div>",
  ])
    assert.throws(() =>
      m.applyDeckEditOperations(source, [
        {
          ...insert,
          after: insert.after.replace("</section>", extra + "</section>"),
        },
      ]),
    );
});
await test("追加対象の重複した目印を拒否する", () =>
  assert.throws(() =>
    m.applyDeckEditOperations(source, [
      {
        ...insert,
        after: insert.after.replace(
          'data-deck-node="new-slide-title"',
          `data-deck-node="${original}"`,
        ),
      },
    ]),
  ));
await test("資料名変更は本文に触れず取り消せる", () => {
  const r = m.applyDeckEditOperations(source, [
    {
      kind: "setting",
      target: "deck-document",
      name: "title",
      before: "原稿",
      after: "新しい資料",
    },
  ]);
  assert.equal(m.applyDeckEditOperations(r.html, r.inverse).html, source);
});
await test("配色設定の競合を止める", () =>
  assert.throws(() =>
    m.applyDeckEditOperations(source, [
      {
        kind: "setting",
        target: "deck-document",
        name: "appearance",
        before: "stale",
        after: '{"version":1,"document":{},"slides":{}}',
      },
    ]),
  ));
await test("グラフは空欄とゼロを区別し、重複ラベルも保持する", () => {
  const raw = m.authorChart("chart", "line", [
    ["項目", "値"],
    ["同じ", ""],
    ["同じ", "0"],
    ["次", "38"],
  ]);
  const json = raw.match(
      /<script[^>]*data-dd-chart-source[^>]*>([\s\S]*?)<\/script>/,
    )[1],
    data = m.readDeckChartSource(json).series[0].data;
  assert.equal(data[0].value, undefined);
  assert.equal(data[1].value, 0);
  assert.equal(data[2].value, 38);
  assert.deepEqual(
    data.map((d) => d.x),
    [0, 1, 2],
  );
});
await test("数値でないグラフや負の円グラフを断る", () => {
  assert.throws(() =>
    m.authorChart("chart", "bar", [
      ["項目", "値"],
      ["a", "abc"],
    ]),
  );
  assert.throws(() =>
    m.authorChart("chart", "pie", [
      ["項目", "値"],
      ["a", "-2"],
    ]),
  );
});
await test("複製で本文・行・セル・系列・点の目印を新しくする", () => {
  const raw = m.authorSlide("chart", "chart-slide"),
    copy = m.cloneDeckFragment(raw, "copy");
  assert.notEqual(copy.ids["chart-slide"], "chart-slide");
  const a = m.readDeckChartSource(
      raw.match(
        /<script[^>]*data-dd-chart-source[^>]*>([\s\S]*?)<\/script>/,
      )[1],
    ),
    b = m.readDeckChartSource(
      copy.html.match(
        /<script[^>]*data-dd-chart-source[^>]*>([\s\S]*?)<\/script>/,
      )[1],
    );
  assert.equal(b.series[0].id, copy.ids[a.series[0].id]);
  assert.equal(b.series[0].data[0].id, copy.ids[a.series[0].data[0].id]);
});
await test("未送信の取り消しは保存を待たずにキューから外れる", () => {
  const q = new m.DeckEditQueue("v1");
  q.enqueue(["A"], "a", false, ["undo A"]);
  assert.ok(q.canUndo);
  q.undo("u");
  assert.equal(q.dirty, false);
  assert.ok(q.canRedo);
  q.redo("r");
  assert.deepEqual(q.next().operations, ["A"]);
});
await test("送信中の取り消しも、同じ保存の再送を壊さない", () => {
  const q = new m.DeckEditQueue("v1");
  q.enqueue(["A"], "a", false, ["undo A"]);
  const request = q.next();
  q.undo("u");
  q.failed("network");
  assert.deepEqual(q.next().operations, request.operations);
  q.acknowledge("v2", ["undo A"]);
  assert.deepEqual(q.next().operations, ["undo A"]);
  q.acknowledge("v3", ["A"]);
  assert.equal(q.canUndo, false);
  assert.ok(q.canRedo);
});
await test("復元できない独自の仕掛けを含む枚は削除前に止める", () => {
  const old = m.prepareDeckEdit(
    '<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="s"><style>p{color:red}</style><p>独自の資料</p></section></main></body></html>',
  ).html;
  const part = m.deckSourceFragment(old, "s");
  assert.throws(() =>
    m.applyDeckEditOperations(old, [
      {
        kind: "fragment",
        target: "s",
        parentId: "deck-root",
        beforeId: null,
        before: part.html,
        after: null,
      },
    ]),
  );
});
await test("目印と同じ表示名も複製で書き換えない", () => {
  const raw = m.authorChart("chart", "bar", [
      ["項目", "chart-series-0"],
      ["chart-point-0-0", "20"],
    ]),
    copy = m.cloneDeckFragment(raw, "copy"),
    json = copy.html.match(
      /<script[^>]*data-dd-chart-source[^>]*>([\s\S]*?)<\/script>/,
    )[1],
    value = m.readDeckChartSource(json);
  assert.equal(value.series[0].label, "chart-series-0");
  assert.equal(value.categories[0], "chart-point-0-0");
  assert.equal(value.series[0].data[0].label, "chart-point-0-0");
  assert.notEqual(value.series[0].id, "chart-series-0");
  const focus = m.remapDeckReferences(
    {
      title: "s",
      actions: [{ targets: [{ slideId: "s", id: "a" }], annotation: "a" }],
    },
    { s: "new-s", a: "new-a" },
  );
  assert.equal(focus.title, "s");
  assert.equal(focus.actions[0].annotation, "a");
  assert.equal(focus.actions[0].targets[0].slideId, "new-s");
});
await test("複数の削除と復元で要素間の空白も元どおりにする", () => {
  const prepared = m.prepareDeckEdit(
    '<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="s"><p data-deck-node="a">A</p>  <p data-deck-node="b">B</p>\n<p data-deck-node="c">C</p><aside data-deck-notes>秘密</aside></section></main></body></html>',
  ).html;
  const ops = ["b", "a"].map((id) => {
    const p = m.deckSourceFragment(prepared, id);
    return {
      kind: "fragment",
      target: id,
      parentId: "s",
      beforeId: p.beforeId,
      before: p.html,
      after: null,
    };
  });
  const changed = m.applyDeckEditOperations(prepared, ops);
  assert.equal(
    m.applyDeckEditOperations(changed.html, changed.inverse).html,
    prepared,
  );
});
const h = await createDeckEditHarness();
try {
  const requestId = crypto.randomUUID(),
    request = (data = { requestId }, headers = {}) =>
      new Request("http://localhost/api/pages/deck-edit/create", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(data),
      });
  await test("未ログインでは新しい資料を作れない", async () =>
    assert.equal(
      (await h.as(null, () => h.api.createDeck(request()))).status,
      401,
    ));
  await test("別サイトから新しい資料を作れない", async () =>
    assert.equal(
      (
        await h.as(h.owner, () =>
          h.api.createDeck(
            request({ requestId }, { origin: "https://evil.test" }),
          ),
        )
      ).status,
      403,
    ));
  await test("作成先や公開をブラウザから指定できない", async () =>
    assert.equal(
      (
        await h.as(h.owner, () =>
          h.api.createDeck(request({ requestId, visibility: "public" })),
        )
      ).status,
      400,
    ));
  await test("新規資料は社内限定で、一回だけ作成される", async () => {
    const first = await h.as(h.owner, () => h.api.createDeck(request()));
    assert.equal(first.status, 201);
    const a = await first.json(),
      second = await h.as(h.owner, () => h.api.createDeck(request()));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), a);
    const rows = await h.pg.query("select visibility,created_by from pages");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].visibility, "internal");
    assert.equal(rows.rows[0].created_by, h.owner.email);
    assert.equal(
      (await h.pg.query("select id from page_revisions")).rows.length,
      1,
    );
  });
  await test("新規資料の共通描画と型を検証する", async () => {
    const html = await h.api.newDeckDocument();
    assert.equal(m.readDeckDesignHtml(html).ids.length, 1);
    const prepared = m.prepareDeckEdit(html),
      r = m.applyDeckEditOperations(prepared.html, [insert]);
    await h.seed(r.html);
    assert.ok(r.html.includes('data-deck-design-runtime="3"'));
  });
  await test("全枚を削除した資料も保存できる", async () => {
    const html = await h.api.newDeckDocument(),
      prepared = m.prepareDeckEdit(html),
      part = m.deckSourceFragment(prepared.html, "opening");
    const r = m.applyDeckEditOperations(prepared.html, [
      {
        kind: "fragment",
        target: "opening",
        parentId: "deck-root",
        beforeId: null,
        before: part.html,
        after: null,
      },
    ]);
    await h.seed(r.html);
    assert.equal(m.readDeckDesignHtml(r.html).ids.length, 0);
  });
} finally {
  await h.close();
}
process.exitCode = fails ? 1 : 0;
