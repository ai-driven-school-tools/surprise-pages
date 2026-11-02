import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

/*
  許可表（src/templates/document-policy.json）を、信頼できる材料の HTML から作る。
    node scripts/build/document-policy.mjs          作り直して書き出す
    node scripts/build/document-policy.mjs --check  書き出さずに、いまの許可表が材料と一致するかだけ見る（検査表が使う）

  材料は下の一覧だけ。雛形（src/templates/）に加えて、スキルがページを組む額縁（.claude/skills/_shared/references/base.html）も入れる。
  スキルの額縁を外すと、清書・図解のページが配布版で全部「未確認の仕掛け」で断られる（社内版は組織の設定で検査を飛ばせるので気づけない）。
  スキルの見本が保存時の検査を通るかは tests/checks/check-skill-pages.mjs が見る。
*/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = [
  "src/templates/page.html", "src/templates/mermaid.html", "src/templates/deck.html", "src/templates/deck-design.html",
  ".claude/skills/_shared/references/base.html",
];
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) throw new Error("引数は --check だけです。材料を足すときはこのファイルの一覧に書きます");
const checking = args.includes("--check");
const scripts = new Set([
  "lucide.createIcons();",
  "window.lucide && window.lucide.createIcons && window.lucide.createIcons();",
]);
function visit(node) {
  if (node.nodeName === "script" && !node.attrs.some((one) => one.name === "src")) {
    const body = node.childNodes.map((one) => one.value ?? "").join("");
    if (body.trim()) scripts.add(body.trim());
  }
  for (const child of node.childNodes ?? []) visit(child);
}
const sources = [];
for (const name of files) {
  const text = await readFile(path.resolve(root, name), "utf8");
  visit(parse(text));
  sources.push({ name: path.basename(name), sha256: createHash("sha256").update(text).digest("hex") });
}
// この操作は開発者がレビューした原本にだけ実行する。投稿時には決して実行しない。
const rulesHash = createHash("sha256").update(await readFile(path.join(root, "src/lib/html/document-security.ts"))).digest("hex");
const target = path.join(root, "src/templates/document-policy.json");
const built = JSON.stringify({ rulesHash, sources, scripts: [...scripts] }, null, 2) + "\n";
if (checking) {
  if ((await readFile(target, "utf8")) !== built) {
    console.error("許可表が材料と食い違っています。材料を確かめてから node scripts/build/document-policy.mjs で作り直してください");
    process.exit(1);
  }
} else {
  await writeFile(target, built);
}
