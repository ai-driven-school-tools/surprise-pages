/**
 * 検査表が使う置き場。
 *
 * どの検査表も「リポジトリの根」と「途中の作り物を置く場所」の 2 つだけ要る。
 * 手元の絶対パスを書くと、人が変わった途端に全部動かなくなるので、
 * 自分の居場所から数えて決める。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

/** リポジトリの根（このファイルから 2 つ上）。末尾の / は付けない。 */
export const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

/**
 * 途中の作り物（TypeScript を組み立て直したもの）の置き場。
 * リポジトリの中には作らない。消えても次に走らせれば作り直される。
 */
export const dir = mkdtempSync(`${tmpdir()}/surprise-pages-checks-`);
process.once("exit", () => rmSync(dir, { recursive: true, force: true }));

/** 保存先の通信だけ差し替え、既存の業務テストは同じまま実行する。組織で絞った口（orgDb）も同じ偽の保存先へつなぐ（絞りそのものは check-tenant-scope.mjs が見る）。 */
export function databaseStub(source) {
  const output = source.replace(/\.mjs$/, "-database.mjs");
  writeFileSync(output, `import { createClient } from ${JSON.stringify(source)}; export const getDb = () => createClient(); export const orgDb = () => createClient();\n`);
  return output;
}

/**
 * 閲覧の可否の部品（src/lib/access/access.ts）は、述語・関門・名簿の操作に分けてある。
 * 中身を文字で確かめる検査は、分けた全部をまとめて 1 つとして読む。
 */
export const ACCESS_SOURCES = ["src/lib/access/access.ts", "src/lib/access/rules.ts", "src/lib/access/gates.ts", "src/lib/access/roster.ts", "src/lib/access/rows.ts"];
export function readAccessSource() {
  return ACCESS_SOURCES.map((file) => readFileSync(`${root}/${file}`, "utf8")).join("\n");
}

/**
 * 社内版（company）の振る舞いを確かめる検査表のための、esbuild の差し替え。
 *
 * 個人配布版のリポジトリは deployment.json に personal を焼き込んであり、PAGES_EDITION では社内版へ戻せない
 * （戻せないのは本番の決まり。src/lib/settings/site-settings.ts の resolveEdition）。複数の組織の土台など社内版の道は
 * コードとして残しているので、その振る舞いを見る検査表だけ、組み立てのときに deployment.json を company の写しへ差し替える。
 * 差し替えるのは検査の組み立て物の中だけで、本物の deployment.json と配信物には触らない。
 * PAGES_EDITION=personal を渡せば、今までどおり配布版の道も同じ組み立て物で確かめられる。
 */
export const companyDeployment = {
  name: "company-deployment",
  setup(build) {
    build.onResolve({ filter: /(^|\/)deployment\.json$/ }, () => ({ path: "company-deployment", namespace: "company-deployment" }));
    build.onLoad({ filter: /.*/, namespace: "company-deployment" }, () => ({ contents: '{"edition":"company"}', loader: "json" }));
  },
};
