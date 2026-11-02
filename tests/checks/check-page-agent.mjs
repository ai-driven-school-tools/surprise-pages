import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDeckEditHarness } from "./deck-edit-harness.mjs";
const h = await createDeckEditHarness();
let count = 0;
const test = async (name, fn) => {
  await fn();
  console.log(`OK  ${name}`);
  count++;
};
const page = "internal/example/design";
const call = async (body, viewer = h.owner) => {
  const r = await h.as(viewer, () =>
    h.api.agent(
      new Request("http://127.0.0.1/api/pages/agent", {
        method: "POST",
        body: JSON.stringify({ page, ...body }),
      }),
    ),
  );
  return { status: r.status, ...(await r.json()) };
};
// 保存される本文は仕掛けの検査（src/lib/html/document-security.ts）を通るので、配布の雛形の一式（src/templates/deck-design.html）と設計の設定を持つ資料にする
const designKit = await readFile(new URL("../../src/templates/deck-design.html", import.meta.url), "utf8");
const designJson = /<script type="application\/json" data-deck-design>[\s\S]*?<\/script>/.exec(await readFile(new URL("./fixtures/internal/example/deck-design-presentation.html", import.meta.url), "utf8"))?.[0] ?? "";
const saved = await h.seed(
  `<!doctype html><html><head><title>資料</title>${designJson.replace(/"slides":\{[\s\S]*\}\}<\/script>$/, '"slides":{}}</script>')}${designKit}</head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="one"><h1>見出し</h1><p>本文</p></section></main></body></html>`,
);
let overview, detail, id, op;
try {
  await test("概要の読取はHTMLを返さず履歴も増やさない", async () => {
    overview = await call({ action: "read" });
    assert.equal(overview.status, 200);
    assert.equal(overview.versionId, saved.versionId);
    assert.equal(overview.html, undefined);
    assert.equal(
      (await h.pg.query("select count(*) from page_revisions")).rows[0].count,
      1,
    );
  });
  await test("指定の版の枚だけを読む", async () => {
    detail = await call({
      action: "read",
      view: "detail",
      versionId: overview.versionId,
      target: overview.slides[0].id,
    });
    assert.equal(detail.status, 200);
    assert.equal(
      detail.nodes.find((n) => n.tag === "p").textRuns[0].text,
      "本文",
    );
  });
  await test("他の接続先と無権限の変更を拒否する", async () => {
    assert.equal(
      (
        await call({
          action: "read",
          page: "https://attacker.invalid/internal/example/design",
        })
      ).status,
      400,
    );
    assert.equal(
      (await call({ action: "prepare", baseVersionId: saved.versionId }, null))
        .status,
      401,
    );
  });
  await test("変更案の準備は本文を保存しない", async () => {
    id = randomUUID();
    op = {
      kind: "text",
      target: detail.nodes.find((n) => n.tag === "h1").id,
      run: 0,
      before: "見出し",
      after: "新しい見出し",
    };
    const r = await call({
      action: "prepare",
      id,
      baseVersionId: overview.versionId,
      operations: [op],
      summary: "見出しを改善",
      client: "Codex",
    });
    assert.equal(r.status, "prepared");
    assert.equal(
      (await h.pg.query("select count(*) from page_revisions")).rows[0].count,
      1,
    );
  });
  await test("検査していない変更は反映しない", async () => {
    assert.equal(
      (await call({ action: "apply", id })).code,
      "verification_required",
    );
  });
  await test("検査と保存は同じ内容に結びつく", async () => {
    const preview = await call({ action: "preview", id });
    assert.equal(preview.status, 200);
    assert.match(preview.afterHtml, /新しい見出し/);
    const verification = {
      digest: preview.digest,
      baseVersionId: preview.baseVersionId,
      status: "passed",
      slides: preview.slides,
      issues: [],
    };
    assert.equal(
      (await call({ action: "verify", id, verification })).status,
      "passed",
    );
    const r = await call({ action: "apply", id });
    assert.equal(r.status, "saved");
  });
  await test("再送は同じ保存結果を返す", async () => {
    const r = await call({ action: "apply", id });
    assert.equal(r.replayed, true);
    assert.equal(
      (await h.pg.query("select count(*) from page_revisions")).rows[0].count,
      2,
    );
  });
  await test("履歴は依頼が変えた前後を返す", async () => {
    const r = await call({ action: "history", id });
    assert.equal(r.item.summary, "見出しを改善");
    assert.equal(r.slides.length, 1);
  });
  await test("別の人の変更を残して取り消せる", async () => {
    const latest = await call({ action: "read" });
    const p = detail.nodes.find((n) => n.tag === "p");
    await h.as(h.owner, () =>
      h.api.PATCH(
        new Request("http://127.0.0.1/api/pages/deck-edit", {
          method: "PATCH",
          body: JSON.stringify({
            page,
            sessionId: randomUUID(),
            operationId: randomUUID(),
            baseVersionId: latest.versionId,
            operations: [
              {
                kind: "text",
                target: p.id,
                run: 0,
                before: "本文",
                after: "別の人の本文",
              },
            ],
          }),
        }),
      ),
    );
    const head = await call({ action: "read" });
    const undo = await call({
      action: "revert",
      undoId: id,
      baseVersionId: head.versionId,
    });
    assert.equal(undo.status, "prepared");
    const preview = await call({ action: "preview", id: undo.id });
    await call({
      action: "verify",
      id: undo.id,
      verification: {
        digest: preview.digest,
        baseVersionId: preview.baseVersionId,
        status: "passed",
        slides: preview.slides,
        issues: [],
      },
    });
    assert.equal(
      (await call({ action: "apply", id: undo.id })).status,
      "saved",
    );
    const html = (
      await h.pg.query(
        "select html from page_revisions order by version_number desc limit 1",
      )
    ).rows[0].html;
    assert.match(html, />見出し</);
    assert.match(html, /別の人の本文/);
  });
  await test("偽の変更前の値を受け付けない", async () => {
    const r = await call({
      action: "prepare",
      baseVersionId: overview.versionId,
      operations: [{ ...op, before: "存在しない値" }],
    });
    assert.equal(r.status, 409);
  });

  const apply = async (requestId) => {
    const p = await call({ action: "preview", id: requestId });
    assert.equal(p.status, 200, JSON.stringify(p));
    await call({
      action: "verify",
      id: requestId,
      verification: {
        digest: p.digest,
        baseVersionId: p.baseVersionId,
        status: "passed",
        slides: p.slides,
        issues: [],
      },
    });
    return call({ action: "apply", id: requestId });
  };
  await test("同じ箇所を順に直す一括変更を保存できる", async () => {
    const head = await call({ action: "read" });
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      client: "Codex",
      operations: [
        { ...op, before: "見出し", after: "見出し甲" },
        { ...op, before: "見出し甲", after: "見出し甲乙" },
      ],
    });
    assert.equal((await apply(d.id)).status, "saved");
  });
  await test("送信者名では同対象の衝突停止を回避できない", async () => {
    const head = await call({ action: "read" });
    const one = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      client: "browser",
      operations: [{ ...op, before: "見出し甲乙", after: "見出し甲乙 一人目" }],
    });
    const two = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      client: "browser",
      operations: [{ ...op, before: "見出し甲乙", after: "見出し甲乙 二人目" }],
    });
    await apply(one.id);
    assert.equal(
      (await call({ action: "preview", id: two.id })).code,
      "conflict",
    );
  });
  await test("一括変更の後半が不正なら前半も保存しない", async () => {
    const head = await call({ action: "read" });
    const r = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "style",
          target: op.target,
          property: "color",
          before: null,
          after: "#123456",
        },
        { ...op, target: "missing-node", before: "なし", after: "変更" },
      ],
    });
    assert.equal(r.status, 409);
    assert.equal((await call({ action: "read" })).versionId, head.versionId);
  });
  await test("期限切れの下書き削除後も保存済み番号を使い回せない", async () => {
    await h.pg.query("delete from page_edit_drafts where id=$1", [id]);
    const head = await call({ action: "read" });
    const r = await call({
      action: "prepare",
      id,
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "style",
          target: op.target,
          property: "color",
          before: null,
          after: "#abcdef",
        },
      ],
    });
    assert.equal(r.code, "id_reused");
    assert.equal((await call({ action: "apply", id })).replayed, true);
  });
  await test("異なる所有者の変更案は番号だけでは取得できない", async () => {
    await h.pg.query(`insert into organization_members(organization_id,email,role,added_by) values ('00000000-0000-4000-8000-000000000001',$1,'admin',$2) on conflict (organization_id,email) do update set role='admin'`, [
      "other@example.test",
      h.owner.email,
    ]);
    const head = await call({ action: "read" });
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "style",
          target: op.target,
          property: "color",
          before: null,
          after: "#123456",
        },
      ],
    });
    const other = { ...h.owner, email: "other@example.test" };
    assert.equal(
      (await call({ action: "preview", id: d.id }, other)).status,
      404,
    );
  });
  await test("未検査の枚を残したまま合格にできない", async () => {
    const head = await call({ action: "read" });
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "style",
          target: op.target,
          property: "font-size",
          before: null,
          after: "36px",
        },
      ],
    });
    const p = await call({ action: "preview", id: d.id });
    assert.equal(
      (
        await call({
          action: "verify",
          id: d.id,
          verification: {
            digest: p.digest,
            baseVersionId: p.baseVersionId,
            status: "passed",
            slides: [],
            issues: [],
          },
        })
      ).code,
      "incomplete_verification",
    );
  });
  await test("問題を含む検査報告を成功扱いしない", async () => {
    const head = await call({ action: "read" });
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "style",
          target: op.target,
          property: "font-size",
          before: null,
          after: "36px",
        },
      ],
    });
    const p = await call({ action: "preview", id: d.id });
    assert.equal(
      (
        await call({
          action: "verify",
          id: d.id,
          verification: {
            digest: p.digest,
            baseVersionId: p.baseVersionId,
            status: "passed",
            slides: p.slides,
            issues: [
              { slideId: p.slides[0], kind: "overflow", message: "はみ出し" },
            ],
          },
        })
      ).status,
      "failed",
    );
    assert.equal(
      (await call({ action: "apply", id: d.id })).code,
      "verification_required",
    );
  });
  await test("初回の配色変更を保存し未設定へ取り消せる", async () => {
    const head = await call({ action: "read" });
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "setting-field",
          target: "deck-document",
          name: "appearance",
          path: ["document", "accent"],
          before: null,
          after: "#ff0000",
        },
      ],
    });
    assert.equal(d.status, "prepared", JSON.stringify(d));
    await apply(d.id);
    const latest = await call({ action: "read" });
    const undo = await call({
      action: "revert",
      baseVersionId: latest.versionId,
      undoId: d.id,
    });
    assert.equal((await apply(undo.id)).status, "saved");
    const detail = await call({
      action: "read",
      view: "detail",
      target: overview.slides[0].id,
    });
    assert.deepEqual(detail.appearance, {});
  });
  await test("読み取るだけでは未設定の配色を保存しない", async () => {
    const before = await call({ action: "read" });
    await call({ action: "read", view: "detail", target: before.slides[0].id });
    assert.equal((await call({ action: "read" })).versionId, before.versionId);
  });
  await test("過去の版への復元は新しい履歴として残る", async () => {
    const head = await call({ action: "read" });
    const d = await call({
      action: "restore",
      baseVersionId: head.versionId,
      versionId: saved.versionId,
      summary: "初版へ戻す",
    });
    assert.equal((await apply(d.id)).status, "saved");
    const newest = await call({ action: "read" });
    assert.notEqual(newest.versionId, saved.versionId);
    assert.ok((await call({ action: "history", id })).item);
  });
  await test("下書きの期限が過ぎたら反映できない", async () => {
    const head = await call({ action: "read" }),
      details = await call({
        action: "read",
        view: "detail",
        target: head.slides[0].id,
      });
    const n = details.nodes.find((n) => n.tag === "h1");
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "text",
          target: n.id,
          run: 0,
          before: n.textRuns[0].text,
          after: "期限の検査",
        },
      ],
    });
    await h.pg.query(
      "update page_edit_drafts set expires_at=now()-interval '4 days' where id=$1",
      [d.id],
    );
    assert.equal(
      (await call({ action: "apply", id: d.id })).code,
      "draft_expired",
    );
  });

  await test("同じグラフの別の値を同時に更新できる", async () => {
    const doc = (await h.api.newDeckDocument()).replace(
      "</main>",
      h.api.authorSlide("chart", "data-slide") +
        h.api.authorSlide("comparison", "other-slide") +
        "</main>",
    );
    await h.seed(doc);
    const head = await call({ action: "read" }),
      detail = await call({
        action: "read",
        view: "detail",
        target: "data-slide",
      });
    const chart = detail.nodes.find((n) => n.chart),
      series = chart.chart.data.series[0];
    const changes = series.data.slice(0, 2).map((point, i) => ({
      kind: "chart-value",
      target: chart.id,
      seriesId: series.id,
      pointId: point.id,
      before: point.value,
      after: 80 + i,
    }));
    const first = await call({
        action: "prepare",
        baseVersionId: head.versionId,
        operations: [changes[0]],
      }),
      second = await call({
        action: "prepare",
        baseVersionId: head.versionId,
        operations: [changes[1]],
      });
    await apply(first.id);
    await apply(second.id);
    const now = await call({
      action: "read",
      view: "detail",
      target: chart.id,
    });
    assert.deepEqual(
      now.nodes[0].chart.data.series[0].data.slice(0, 2).map((p) => p.value),
      [80, 81],
    );
  });
  await test("グラフの空欄とゼロを区別し履歴から戻せる", async () => {
    const head = await call({ action: "read" }),
      detail = await call({
        action: "read",
        view: "detail",
        target: "data-slide",
      }),
      chart = detail.nodes.find((n) => n.chart),
      series = chart.chart.data.series[0];
    const operations = series.data.slice(0, 2).map((point, i) => ({
      kind: "chart-value",
      target: chart.id,
      seriesId: series.id,
      pointId: point.id,
      before: point.value,
      after: i === 0 ? null : 0,
    }));
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations,
    });
    await apply(d.id);
    const next = await call({
      action: "read",
      view: "detail",
      target: chart.id,
    });
    assert.equal(next.nodes[0].chart.data.series[0].data[0].value, undefined);
    assert.equal(next.nodes[0].chart.data.series[0].data[1].value, 0);
  });
  await test("別の枚が変わっただけなら検査結果を再利用できる", async () => {
    const head = await call({ action: "read" }),
      a = await call({ action: "read", view: "detail", target: "opening" }),
      b = await call({ action: "read", view: "detail", target: "other-slide" });
    const first = a.nodes.find((n) => n.tag === "h1"),
      other = b.nodes.find((n) => n.tag === "h1");
    const prepare = async (n, text) =>
      call({
        action: "prepare",
        baseVersionId: head.versionId,
        operations: [
          {
            kind: "text",
            target: n.id,
            run: 0,
            before: n.textRuns[0].text,
            after: text,
          },
        ],
      });
    const one = await prepare(first, "検査した見出し"),
      two = await prepare(other, "別の枚の更新");
    const preview = await call({ action: "preview", id: one.id });
    await call({
      action: "verify",
      id: one.id,
      verification: {
        digest: preview.digest,
        baseVersionId: preview.baseVersionId,
        status: "passed",
        slides: preview.slides,
        issues: [],
      },
    });
    await apply(two.id);
    assert.equal((await call({ action: "apply", id: one.id })).status, "saved");
  });
  await test("原稿の対応不明な箇所を未対応として保持する", async () => {
    const head = await call({ action: "read" }),
      detail = await call({
        action: "read",
        view: "detail",
        target: "opening",
      }),
      n = detail.nodes.find((n) => n.tag === "h1");
    const source = (
      await call({ action: "read", view: "source", target: "opening" })
    ).source.html;
    const incoming =
      "<!doctype html><html><head></head><body data-deck><main data-deck-slides>" +
      source.replace("検査した見出し", "原稿の新しい見出し") +
      "</main></body></html>";
    const d = await call({
      action: "reimport",
      baseVersionId: head.versionId,
      html: incoming,
      targets: [n.id, "not-found"],
    });
    assert.equal(d.unresolved.length, 1);
    await apply(d.id);
    const history = await call({ action: "history", id: d.id });
    assert.equal(history.verification.unresolved.length, 1);
  });
  await test("過去の画像を復元しても現在の素材を上書きしない", async () => {
    const oldBytes = Buffer.from("old asset"),
      liveBytes = Buffer.from("live asset");
    const source =
      '<!doctype html><html><head><title>画像の履歴</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="photo"><img src="photo.png" alt="写真"></section></main></body></html>';
    const old = await h.seed(source);
    globalThis.__deckAssets.set(
      `internal/example/design/@archive/${old.versionId}/photo.png`,
      { bytes: oldBytes, options: { contentType: "image/png" } },
    );
    globalThis.__deckAssets.set("internal/example/design/photo.png", {
      bytes: liveBytes,
      options: { contentType: "image/png" },
    });
    await h.seed(source.replace("写真", "今の写真"));
    const head = await call({ action: "read" });
    const d = await call({
      action: "restore",
      baseVersionId: head.versionId,
      versionId: old.versionId,
    });
    assert.equal((await apply(d.id)).status, "saved");
    const detail = await call({
      action: "read",
      view: "detail",
      target: (await call({ action: "read" })).slides[0].id,
    });
    const image = detail.nodes.find((n) => n.tag === "img");
    assert.ok(image.src.startsWith("_deck/media-"));
    assert.deepEqual(
      globalThis.__deckAssets.get("internal/example/design/" + image.src).bytes,
      oldBytes,
    );
    assert.deepEqual(
      globalThis.__deckAssets.get("internal/example/design/photo.png").bytes,
      liveBytes,
    );
  });

  await test("共有の描画条件が変わったら再検査を求める", async () => {
    await h.seed(await h.api.newDeckDocument());
    const head = await call({ action: "read" }),
      detail = await call({
        action: "read",
        view: "detail",
        target: "opening",
      }),
      n = detail.nodes.find((n) => n.tag === "h1");
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        {
          kind: "text",
          target: n.id,
          run: 0,
          before: n.textRuns[0].text,
          after: "検査後の変更",
        },
      ],
    });
    const p = await call({ action: "preview", id: d.id });
    await call({
      action: "verify",
      id: d.id,
      verification: {
        digest: p.digest,
        baseVersionId: p.baseVersionId,
        status: "passed",
        slides: p.slides,
        issues: [],
      },
    });
    const row = (
      await h.pg.query(
        "select html from page_revisions order by version_number desc limit 1",
      )
    ).rows[0];
    // 置き換えるのは本物の body の札だけ（雛形の実行部の中にも `<body` の字面があり、そこを変えると仕掛けの検査で止まる）
    await h.seed(row.html.replace(/<body(?= [^>]*data-deck)/, '<body style="font-size:100px"'));
    assert.equal(
      (await call({ action: "apply", id: d.id })).code,
      "recheck_required",
    );
  });
  await test("凍結がない古い画像を現在画像で代用しない", async () => {
    const source =
      '<!doctype html><html><head><title>未凍結画像</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="old"><img src="unarchived.png"></section></main></body></html>';
    const old = await h.seed(source);
    globalThis.__deckAssets.set("internal/example/design/unarchived.png", {
      bytes: Buffer.from("current"),
      options: { contentType: "image/png" },
    });
    await h.seed(source.replace("未凍結画像", "現在画像"));
    const head = await call({ action: "read" });
    const result = await call({
      action: "restore",
      baseVersionId: head.versionId,
      versionId: old.versionId,
    });
    assert.equal(result.code, "restore_unavailable");
    assert.equal((await call({ action: "read" })).versionId, head.versionId);
  });

  await test("文章の構造変更で同じ文字を別の位置へ付け替えない", async () => {
    const html = h.api.prepareDeckEdit(
      '<html><head><title>構造</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="s"><p>A<span>中央</span>A</p></section></main></body></html>',
    ).html;
    await h.seed(html);
    const head = await call({ action: "read" }),
      detail = await call({
        action: "read",
        view: "detail",
        target: head.slides[0].id,
      }),
      p = detail.nodes.find((n) => n.tag === "p");
    await h.seed(html.replace(">A<span", "><span"));
    const d = await call({
      action: "prepare",
      baseVersionId: head.versionId,
      operations: [
        { kind: "text", target: p.id, run: 0, before: "A", after: "変更" },
      ],
    });
    assert.equal(d.code, "conflict");
    assert.match(d.error, /構造/);
  });

  await test('取り消しの衝突にも元・最新・今回の案を返す',async()=>{
    await h.seed(await h.api.newDeckDocument());const head=await call({action:'read'}),detail=await call({action:'read',view:'detail',target:'opening'}),n=detail.nodes.find(n=>n.tag==='h1');const first=await call({action:'prepare',baseVersionId:head.versionId,operations:[{kind:'text',target:n.id,run:0,before:n.textRuns[0].text,after:'先の変更'}]});await apply(first.id);const next=await call({action:'read'});const second=await call({action:'prepare',baseVersionId:next.versionId,operations:[{kind:'text',target:n.id,run:0,before:'先の変更',after:'後からの変更'}]});await apply(second.id);const last=await call({action:'read'});const undo=await call({action:'revert',baseVersionId:last.versionId,undoId:first.id});assert.equal(undo.code,'conflict');assert.ok(undo.details.id);assert.equal(undo.details.conflict.conflicts[0].current,'後からの変更');assert.equal((await call({action:'read'})).versionId,last.versionId);
  });
} finally {
  await h.close();
}
assert.equal(count, 30);
