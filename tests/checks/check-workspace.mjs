import assert from "node:assert/strict";
import { createDeckEditHarness } from "./deck-edit-harness.mjs";
const h = await createDeckEditHarness();
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log("OK  " + name);
  } catch (error) {
    failures++;
    console.log("NG  " + name + ": " + error.stack);
  }
}
const request = (data, origin = "http://localhost") =>
  new Request("http://localhost/api/workspace", {
    method: "POST",
    headers: { origin, host: "localhost", "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const plain =
  "<html><head><title>企画資料</title></head><body><h1>企画資料</h1></body></html>";
try {
  await test("通常の記事を分類", () =>
    assert.equal(h.api.classifyDocument(plain), "page"));
  await test("清書文書を分類", () =>
    assert.equal(
      h.api.classifyDocument("<main data-clean-copy-document></main>"),
      "document",
    ));
  await test("旧清書文書を分類", () =>
    assert.equal(
      h.api.classifyDocument(
        '<article data-clean-copy-source-id="a"></article>',
      ),
      "document",
    ));
  await test("スライドの分類を優先", () =>
    assert.equal(
      h.api.classifyDocument(
        "<body data-deck><main data-clean-copy-document></main></body>",
      ),
      "deck",
    ));
  await test("コメントや文字中の目印を分類に使わない", () =>
    assert.equal(
      h.api.classifyDocument(
        '<!-- <body data-deck> --><script>"data-clean-copy-document"</script>',
      ),
      "page",
    ));
  await test("検索は全角英数とかなを正規化", () =>
    assert.equal(h.api.foldWorkspaceText("ＡＢＣはーねす"), "abcハーネス"));
  const made = await h.seed(plain),
    page = "internal/example/design";
  const reader = {
    kind: "member",
    email: "reader@example.test",
    name: "閲覧者",
    image: null,
    organization: h.owner.organization,
  };
  const coowner = {
    kind: "member",
    email: "collaborator@example.test",
    name: "共同作成者",
    image: null,
    organization: h.owner.organization,
  };
  await test("作成時に本文とは別の分類を保存", async () => {
    const rows = await h.api.workspaceRows(h.organization, h.owner);
    assert.equal(rows[0].kind, "page");
    assert.equal(rows[0].mine, true);
    assert.equal(rows[0].editable, true);
  });
  await test("閲覧できるだけの人を作成者にしない", async () => {
    const rows = await h.api.workspaceRows(h.organization, reader);
    assert.equal(rows[0].mine, false);
    assert.equal(rows[0].editable, false);
  });
  await test("未ログインのお気に入りを拒否", async () =>
    assert.equal(
      (
        await h.as(null, () =>
          h.api.workspaceMutation(
            request({ action: "favorite", page, selected: true }),
          ),
        )
      ).status,
      401,
    ));
  await test("外部サイトからの書込を拒否", async () =>
    assert.equal(
      (
        await h.as(h.owner, () =>
          h.api.workspaceMutation(
            request(
              { action: "favorite", page, selected: true },
              "https://outside.test",
            ),
          ),
        )
      ).status,
      403,
    ));
  await test("お気に入りの再送は一件", async () => {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await h.as(h.owner, () =>
            h.api.workspaceMutation(
              request({ action: "favorite", page, selected: true }),
            ),
          )
        ).status,
        200,
      );
    assert.equal(
      (await h.pg.query("select * from page_favorites")).rows.length,
      1,
    );
  });
  await test("お気に入りは本人にだけ表示", async () => {
    assert.equal((await h.api.workspaceRows(h.organization, h.owner))[0].favorite, true);
    assert.equal((await h.api.workspaceRows(h.organization, reader))[0].favorite, false);
  });
  await test("棚に必要な資料だけを返す", async () => {
    assert.equal((await h.api.workspaceRows(h.organization, h.owner, "mine")).length, 1);
    assert.equal((await h.api.workspaceRows(h.organization, reader, "mine")).length, 0);
    assert.equal((await h.api.workspaceRows(h.organization, h.owner, "favorites")).length, 1);
    assert.equal((await h.api.workspaceRows(h.organization, reader, "favorites")).length, 0);
  });
  await test("空のお気に入りでは資料・許可・申請を読まない", async () => {
    globalThis.__deckQueries = [];
    try {
      assert.deepEqual(await h.api.workspaceRows(h.organization, reader, "favorites"), []);
      assert.deepEqual(globalThis.__deckQueries.map(q => q.table), ["page_favorites"]);
    } finally { delete globalThis.__deckQueries; }
  });
  await test("外観を本人のアカウントへ保存", async () => {
    assert.equal(
      (
        await h.as(h.owner, () =>
          h.api.workspaceMutation(
            request({ action: "appearance", value: "dark" }),
          ),
        )
      ).status,
      200,
    );
    assert.equal(await h.api.readAppearance(h.owner.email), "dark");
    assert.equal(await h.api.readAppearance(reader.email), "system");
  });
  await test("本人の指定を偽装できない", async () =>
    assert.equal(
      (
        await h.as(h.owner, () =>
          h.api.workspaceMutation(
            request({
              action: "appearance",
              value: "light",
              owner_email: reader.email,
            }),
          ),
        )
      ).status,
      400,
    ));
  await h.pg.query("update pages set visibility='restricted' where id=$1", [
    made.page.id,
  ]);
  await test("閲覧権限のない資料は一覧から消える", async () =>
    assert.equal((await h.api.workspaceRows(h.organization, reader)).length, 0));
  await test("お気に入りに残っても閲覧権限を失えば返さない", async () => {
    await h.pg.query("insert into page_favorites(owner_email,page_id) values($1,$2)", [reader.email, made.page.id]);
    assert.deepEqual(await h.api.workspaceRows(h.organization, reader, "favorites"), []);
  });
  await test("閲覧不可の資料をお気に入りに追加できない", async () =>
    assert.equal(
      (
        await h.as(reader, () =>
          h.api.workspaceMutation(
            request({ action: "favorite", page, selected: true }),
          ),
        )
      ).status,
      404,
    ));
  await h.pg.query(
    "insert into page_permissions(page_id,grantee_kind,member_email,role,added_by) values($1,'member',$2,'owner',$3)",
    [made.page.id, coowner.email, h.owner.email],
  );
  await test("有効な共同作成者だけ共同編集に表示", async () => {
    const rows = await h.api.workspaceRows(h.organization, coowner);
    assert.equal(rows[0].collaborator, true);
    assert.equal(rows[0].editable, true);
    assert.equal(rows[0].mine, false);
    assert.equal((await h.api.workspaceRows(h.organization, coowner, "mine")).length, 1);
  });
  await h.pg.query("update pages set visibility='internal' where id=$1", [
    made.page.id,
  ]);
  await test("古い共同所有の記録だけでは編集を許可しない", async () =>
    assert.equal((await h.api.workspaceRows(h.organization, coowner))[0].collaborator, false));
  await h.pg.query("delete from page_catalog");
  await test("分類がなくても資料は一覧に残る", async () =>
    assert.equal((await h.api.workspaceRows(h.organization, h.owner))[0].kind, "unknown"));
  await test("同じ本文の再投稿が分類を修復する", async () => {
    await h.seed(plain);
    assert.equal((await h.api.workspaceRows(h.organization, h.owner))[0].kind, "page");
  });
  await test("古い分類規則を現在の分類として扱わない", async () => {
    await h.pg.query("update page_catalog set classifier_version=0");
    assert.equal((await h.api.workspaceRows(h.organization, h.owner))[0].kind, "unknown");
  });
  await test("1000件超の閲覧制限付き資料も許可された分を欠落させない", async () => {
    await h.pg.exec(
      "insert into pages(page_slug,visibility,title,created_by) select 'internal/bulk/'||n,'restricted','大量資料 '||n,'importer@example.test' from generate_series(1,1100) n",
    );
    await h.pg.query(
      "insert into page_permissions(page_id,grantee_kind,member_email,role,added_by) select id,'member',$1,'viewer',$2 from pages where page_slug like 'internal/bulk/%'",
      [reader.email, h.owner.email],
    );
    assert.equal((await h.api.workspaceRows(h.organization, reader)).length, 1101);
    await h.pg.query("insert into page_favorites(owner_email,page_id) select $1,id from pages where page_slug like 'internal/bulk/%'", [reader.email]);
    const favorites = await h.api.workspaceRows(h.organization, reader, "favorites");
    assert.equal(favorites.length, 1101);
    assert.ok(favorites.every(row => row.favorite));
    for(let i=1;i<favorites.length;i++) {
      const previous=favorites[i-1], current=favorites[i];
      assert.ok((current.updatedAt.localeCompare(previous.updatedAt) || previous.id.localeCompare(current.id)) <= 0);
    }
    await h.pg.exec(
      "update pages set deleted_at=now() where page_slug like 'internal/bulk/%'",
    );
  });
  await test("大量の分類を 1 本で取得し、現在の版だけを返す", async () => {
    await h.pg.exec("insert into pages(page_slug,visibility,title,created_by,current_version_id) select 'internal/classified/'||n,'internal','分類資料 '||n,'importer@example.test',repeat('a',40) from generate_series(1,205) n");
    await h.pg.exec("insert into page_catalog(page_id,version_id,classifier_version,kind) select id,current_version_id,1,'deck' from pages where page_slug like 'internal/classified/%'");
    await h.pg.exec("insert into page_catalog(page_id,version_id,classifier_version,kind) select id,repeat('b',40),1,'page' from pages where page_slug like 'internal/classified/%'");
    const query = h.pg.query.bind(h.pg);
    let active = 0, peak = 0, calls = 0;
    h.pg.query = async (sql, ...args) => {
      if (!sql.includes('from "page_catalog"') && !sql.includes('"current_page_kinds"')) return query(sql, ...args);
      calls++; active++; peak = Math.max(peak, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 10));
        return await query(sql, ...args);
      } finally { active--; }
    };
    try {
      const rows = await h.api.workspaceRows(h.organization, reader);
      const classified = rows.filter(row => row.page.startsWith("internal/classified/"));
      assert.equal(classified.length, 205);
      assert.ok(classified.every(row => row.kind === "deck"));
      // 目印の一覧を本文で渡す保存先の関数 1 本（40 件ずつ 4 本並べて 6 回、だったのをやめた・docs/design/app-speed.md）
      assert.equal(peak, 1);
      assert.equal(calls, 1);
      calls = 0;
      assert.deepEqual(await h.api.workspaceRows(h.organization, reader, "mine"), []);
      assert.equal(calls, 0);
    } finally {
      h.pg.query = query;
      await h.pg.exec("update pages set deleted_at=now() where page_slug like 'internal/classified/%'");
    }
  });
  await test("本人まわりをまとめて読む関数は、1 本ずつ読むのと同じ答えを返す（GitHub の鍵の欄は返さない）", async () => {
    const email = "bundle-reader@example.test";
    const other = "bundle-other@example.test";
    await h.pg.exec("insert into pages(page_slug,visibility,title,created_by) select 'internal/bundle/'||n,'internal','まとめ '||n,'importer@example.test' from generate_series(1,3) n");
    const pageIds = (await h.pg.query("select id from pages where page_slug like 'internal/bundle/%' order by id")).rows.map((row) => row.id);
    assert.equal(pageIds.length, 3);
    await h.pg.query("insert into admins(email) values ($1)", [email]);
    await h.pg.query("insert into workspace_preferences(owner_email, appearance) values ($1, 'dark')", [email]);
    for (const id of [...pageIds].reverse()) await h.pg.query("insert into page_favorites(owner_email, page_id) values ($1, $2)", [email, id]);
    await h.pg.query("insert into page_favorites(owner_email, page_id) values ($1, $2)", [other, pageIds[0]]);
    await h.pg.query("insert into page_view_optouts(viewer_email) values ($1)", [email]);
    await h.pg.query(`insert into recording_github_connections(owner_email, github_user_id, github_login, encrypted_credentials, expires_at, refresh_expires_at, revision)
      values ($1, 4242, 'reader', 'SECRET-CREDENTIALS', now() + interval '1 hour', now() + interval '30 days', gen_random_uuid())`, [email]);
    try {
      const read = async (who) => (await h.pg.query("select public.workspace_member_reads($1) as v", [who])).rows[0].v;
      const mine = await read(email);
      const theirs = await read("nobody@example.test");
      assert.equal(mine.admin, true);
      assert.equal(theirs.admin, false);
      assert.equal(mine.preferences.appearance, "dark");
      assert.equal(theirs.preferences, null);
      // 星は本人の分だけ・目印の順（savedFavorites と同じ）
      assert.deepEqual(mine.favorites, [...pageIds].sort());
      assert.equal(mine.view_optout, true);
      assert.equal(theirs.view_optout, false);
      assert.equal(mine.github_link.github_user_id, 4242);
      assert.equal(mine.github_link.revoked_at, null);
      assert.equal(theirs.github_link, null);
      assert.ok(!JSON.stringify(mine).includes("SECRET-CREDENTIALS"));
      assert.ok(!("encrypted_credentials" in mine.github_link));
      const last = (await h.pg.query("select id from pages where deleted_at is null order by id desc limit 1")).rows[0].id;
      assert.equal(mine.last_page_id, last);
      const grants = (await h.pg.query("select * from member_page_grants($1)", [email])).rows;
      assert.equal(mine.grants.length, grants.length);
      const sources = (await h.pg.query("select * from recording_page_sources()")).rows;
      assert.equal(mine.recording_sources.length, sources.length);
      for (const key of ["recording_grants", "catalog", "access_memory"]) assert.ok(Array.isArray(mine[key]), key);
      assert.ok("access_generation" in mine && "latest_delivery" in mine);
    } finally {
      await h.pg.query("delete from recording_github_connections where owner_email = $1", [email]);
      await h.pg.query("delete from page_view_optouts where viewer_email = $1", [email]);
      await h.pg.query("delete from page_favorites where owner_email in ($1, $2)", [email, other]);
      await h.pg.query("delete from workspace_preferences where owner_email = $1", [email]);
      await h.pg.query("delete from admins where email = $1", [email]);
      await h.pg.exec("update pages set deleted_at=now() where page_slug like 'internal/bundle/%'");
    }
  });
  await test("未解決のコメントと今の版の形式は、一覧を本文で渡す関数 1 本で、1 本ずつ読むのと同じ行を返す", async () => {
    await h.pg.exec("insert into pages(page_slug,visibility,title,created_by,current_version_id) select 'internal/open/'||n,'internal','未解決 '||n,'importer@example.test',repeat(n::text,40) from generate_series(1,3) n");
    await h.pg.exec("insert into page_catalog(page_id,version_id,classifier_version,kind) select id,current_version_id,1,'deck' from pages where page_slug like 'internal/open/%'");
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email) values ('internal/open/1','未解決','a@example.test'), ('internal/open/2','未解決','a@example.test'), ('internal/elsewhere','よそ','a@example.test')`);
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email, resolved_at) values ('internal/open/1','解決済み','a@example.test', now())`);
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email, parent_id) select 'internal/open/1','返信','b@example.test', id from page_comments where body = '未解決' and page_slug = 'internal/open/1'`);
    const pages = (await h.pg.query("select id, page_slug, current_version_id from pages where page_slug like 'internal/open/%' order by id")).rows;
    const slugs = pages.map((page) => page.page_slug);
    const viaFunction = (await h.pg.query("select id from open_page_comments($1::text::jsonb)", [JSON.stringify(slugs)])).rows.map((row) => row.id).sort();
    const direct = (await h.pg.query("select id from page_comments where page_slug = any($1) and parent_id is null and resolved_at is null and deleted_at is null", [slugs])).rows.map((row) => row.id).sort();
    assert.deepEqual(viaFunction, direct);
    assert.equal(viaFunction.length, 2);
    const ids = pages.map((page) => page.id), versions = pages.map((page) => page.current_version_id);
    const kinds = (await h.pg.query("select page_id, version_id, kind from current_page_kinds($1::text::jsonb, $2::text::jsonb, 1) order by page_id, version_id", [JSON.stringify(ids), JSON.stringify(versions)])).rows;
    const directKinds = (await h.pg.query("select page_id, version_id, kind from page_catalog where page_id = any($1) and version_id = any($2) and classifier_version = 1 order by page_id, version_id", [ids, versions])).rows;
    assert.deepEqual(kinds, directKinds);
    assert.equal(kinds.length, 3);
    assert.deepEqual((await h.pg.query("select * from open_page_comments('[]'::jsonb)")).rows, []);
  });
  await test("ホームの 1 段目の関数は、今までの読み方の答えを全部含む（候補・未解決・自分の親・返信・返信の親）", async () => {
    const me = "home-first@example.test", other = "home-other@example.test";
    await h.pg.exec(`insert into pages(page_slug,visibility,title,created_by,current_version_id) values
      ('internal/home1/mine','internal','自分の資料',' Home-First@example.test ',repeat('1',40)),
      ('internal/home1/shared','restricted','共同の資料','${other}',repeat('2',40)),
      ('internal/home1/others','internal','よその資料','${other}',repeat('3',40))`);
    const shared = (await h.pg.query("select id from pages where page_slug = 'internal/home1/shared'")).rows[0].id;
    await h.pg.query("insert into page_permissions(page_id, grantee_kind, member_email, role) values ($1, 'member', $2, 'owner')", [shared, me]);
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email) values
      ('internal/home1/mine','未解決','${other}'), ('internal/home1/shared','共同の未解決','${other}'), ('internal/home1/others','よそ','${other}')`);
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email) values ('internal/home1/others','自分の親','${me}')`);
    await h.pg.exec(`insert into page_comments(page_slug, body, author_email, parent_id) select 'internal/home1/others','返信','${other}', id from page_comments where body = '自分の親'`);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const reads = (await h.pg.query("select public.home_comment_reads($1, $2, $3) as v", [me, me, since])).rows[0].v;
    assert.deepEqual([...reads.candidate_slugs].sort(), ["internal/home1/mine", "internal/home1/shared"]);
    assert.deepEqual(reads.open_comments.map((row) => row.body).sort(), ["共同の未解決", "未解決"]);
    const legacyOwn = (await h.pg.query("select id from page_comments where parent_id is null and deleted_at is null and author_email = $1", [me])).rows.map((row) => row.id);
    assert.deepEqual([...reads.my_parent_ids].sort(), legacyOwn.sort());
    const legacyReplies = (await h.pg.query("select id from page_comments where parent_id is not null and deleted_at is null and created_at > $1", [since])).rows.map((row) => row.id);
    assert.deepEqual(reads.replies.map((row) => row.id).sort(), legacyReplies.sort());
    assert.deepEqual(reads.parents.map((row) => row.body), ["自分の親"]);
    await h.pg.exec("update pages set deleted_at=now() where page_slug like 'internal/home1/%'");
  });
  await test("出やすい資料の形式は、今の版の形式と同じで、形式の無い資料も「確かめた」として返す", async () => {
    const me = "kinds-reader@example.test";
    await h.pg.exec("insert into pages(page_slug,visibility,title,created_by,current_version_id) select 'internal/kinds/'||n,'internal','形式 '||n,'kinds-reader@example.test',repeat(n::text,40) from generate_series(1,3) n");
    await h.pg.exec("insert into page_catalog(page_id,version_id,classifier_version,kind) select id,current_version_id,1,'deck' from pages where page_slug in ('internal/kinds/1','internal/kinds/2')");
    await h.pg.exec("insert into page_catalog(page_id,version_id,classifier_version,kind) select id,repeat('9',40),1,'page' from pages where page_slug = 'internal/kinds/1'");
    const rows = (await h.pg.query("select p.page_slug, k.kind from member_page_kinds($1, 10, 1) k join pages p on p.id = k.page_id where p.page_slug like 'internal/kinds/%' order by p.page_slug", [me])).rows;
    assert.deepEqual(rows, [{ page_slug: "internal/kinds/1", kind: "deck" }, { page_slug: "internal/kinds/2", kind: "deck" }, { page_slug: "internal/kinds/3", kind: null }]);
    const recent = (await h.pg.query("select count(*)::int as n from member_page_kinds('nobody@example.test', 2, 1)")).rows[0].n;
    assert.equal(recent, 2);
    await h.pg.exec("update pages set deleted_at=now() where page_slug like 'internal/kinds/%'");
  });
  await test("分類保存に失敗しても本文の版は保存済み", async () => {
    await h.pg.exec("drop table page_catalog");
    const result = await h.seed(plain.replace("企画資料", "新企画"));
    assert.ok(result.versionId);
  });
  await test("個人設定の保存表はすべてRLS有効", async () => {
    const result = await h.pg.query(
      "select relname,relrowsecurity from pg_class where relname in ('page_favorites','workspace_preferences')",
    );
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every((r) => r.relrowsecurity));
  });
} finally {
  await h.close();
}
process.exitCode = failures ? 1 : 0;
