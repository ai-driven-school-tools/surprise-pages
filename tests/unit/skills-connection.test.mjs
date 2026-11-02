import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { connectSkills, pluginIdentity, skillNames } from "../../scripts/setup/skills.mjs";

const repository = path.resolve(import.meta.dirname, "..", "..");

/** 架空の配布物（スキル 2 つと共有の置き場）と、空のホームフォルダ。 */
function sandbox() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "skills-connection-")));
  const root = path.join(base, "distribution");
  const home = path.join(base, "home");
  mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(path.join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "example-distribution", plugins: [{ name: "pages", source: "./" }] }));
  writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "pages", skills: "./.claude/skills" }));
  for (const name of ["clean-copy", "read-page"]) {
    mkdirSync(path.join(root, ".claude", "skills", name), { recursive: true });
    writeFileSync(path.join(root, ".claude", "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  }
  mkdirSync(path.join(root, ".claude", "skills", "_shared", "references"), { recursive: true });
  mkdirSync(home);
  return { root, home, env: {}, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test("配布物のスキルは 4 つで、名前とフォルダ名がそろっている", () => {
  const names = skillNames(repository);
  assert.deepEqual(names, ["clean-copy", "explain-deck", "explain-page", "read-page"]);
  for (const name of names) {
    const front = readFileSync(path.join(repository, ".claude", "skills", name, "SKILL.md"), "utf8");
    assert.match(front, new RegExp(`^---\\nname: ${name}\\n`));
  }
});

test("プラグインの置き場の名前は投稿コマンドの控えの名前（deployment.json の configDir）と同じ", () => {
  const { configDir } = JSON.parse(readFileSync(path.join(repository, "deployment.json"), "utf8"));
  assert.deepEqual(pluginIdentity(repository), { marketplace: configDir, plugin: "pages", id: `pages@${configDir}` });
  const plugin = JSON.parse(readFileSync(path.join(repository, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(plugin.skills, "./.claude/skills");
});

test("初めてなら、Claude Code の設定に書き足し、Cursor と Codex に近道を張る", (t) => {
  const box = sandbox();
  t.after(box.cleanup);
  const result = connectSkills(box);
  assert.equal(result.ok, true);
  const settings = JSON.parse(readFileSync(path.join(box.home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(settings.extraKnownMarketplaces["example-distribution"], { source: { source: "directory", path: box.root } });
  assert.equal(settings.enabledPlugins["pages@example-distribution"], true);
  for (const place of [".cursor/skills", ".agents/skills"]) {
    for (const name of ["clean-copy", "read-page"]) {
      assert.equal(readlinkSync(path.join(box.home, place, name)), path.join(box.root, ".claude", "skills", name));
    }
    assert.equal(existsSync(path.join(box.home, place, "_shared")), false, "共有の置き場はスキルではないので張らない");
  }
});

test("本人のほかの設定は残し、何度打っても同じ結果になる", (t) => {
  const box = sandbox();
  t.after(box.cleanup);
  mkdirSync(path.join(box.home, ".claude"));
  const mine = { model: "opus", enabledPlugins: { "other@elsewhere": true }, extraKnownMarketplaces: { elsewhere: { source: { source: "github", repo: "someone/plugins" } } } };
  writeFileSync(path.join(box.home, ".claude", "settings.json"), JSON.stringify(mine));
  connectSkills(box);
  const once = readFileSync(path.join(box.home, ".claude", "settings.json"), "utf8");
  const second = connectSkills(box);
  assert.equal(readFileSync(path.join(box.home, ".claude", "settings.json"), "utf8"), once);
  assert.equal(second.ok, true);
  const settings = JSON.parse(once);
  assert.equal(settings.model, "opus");
  assert.equal(settings.enabledPlugins["other@elsewhere"], true);
  assert.deepEqual(settings.extraKnownMarketplaces.elsewhere, mine.extraKnownMarketplaces.elsewhere);
});

test("CLAUDE_CONFIG_DIR があれば、そちらの設定に書き足す", (t) => {
  const box = sandbox();
  t.after(box.cleanup);
  const configDir = path.join(box.home, "claude-work");
  connectSkills({ ...box, env: { CLAUDE_CONFIG_DIR: configDir } });
  assert.equal(existsSync(path.join(configDir, "settings.json")), true);
  assert.equal(existsSync(path.join(box.home, ".claude", "settings.json")), false);
});

test("読めない設定は書き換えずに止まる", (t) => {
  const box = sandbox();
  t.after(box.cleanup);
  mkdirSync(path.join(box.home, ".claude"));
  writeFileSync(path.join(box.home, ".claude", "settings.json"), "{ 壊れている");
  const result = connectSkills(box);
  assert.equal(result.ok, false);
  assert.equal(readFileSync(path.join(box.home, ".claude", "settings.json"), "utf8"), "{ 壊れている");
});

test("同じ名前の本人のフォルダや別の近道は触らず、自分の古い近道だけ片づける", (t) => {
  const box = sandbox();
  t.after(box.cleanup);
  const cursor = path.join(box.home, ".cursor", "skills");
  mkdirSync(path.join(cursor, "clean-copy"), { recursive: true });
  writeFileSync(path.join(cursor, "clean-copy", "SKILL.md"), "本人のもの");
  symlinkSync(path.join(box.home, "elsewhere"), path.join(cursor, "read-page"));
  symlinkSync(path.join(box.root, ".claude", "skills", "clean-copy-another"), path.join(cursor, "clean-copy-another"));
  const result = connectSkills(box);
  assert.equal(result.ok, false);
  assert.equal(readFileSync(path.join(cursor, "clean-copy", "SKILL.md"), "utf8"), "本人のもの");
  assert.equal(readlinkSync(path.join(cursor, "read-page")), path.join(box.home, "elsewhere"));
  assert.equal(existsSync(path.join(cursor, "clean-copy-another")), false);
  assert.ok(result.lines.some((line) => line.includes("clean-copy は同じ名前のフォルダがある")));
});

test("スキルの手順書は、別のフォルダから呼ばれても配布物の道具に届く書き方になっている", () => {
  const files = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "-z", ".claude/skills"], { cwd: repository, encoding: "utf8" })
    .split("\0").filter((file) => /\.md$/.test(file) && !file.includes("/fixtures/"));
  const stale = [];
  for (const file of files) {
    const lines = readFileSync(path.join(repository, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      // いま開いているフォルダを配布物だと決めつける書き方（node bin/… や ../_shared/…）は、別のフォルダや近道越しでは外れる
      if (/(node|python3) (bin|scripts|\.claude)\/|`\.\.\/_shared\/|^ls \.claude\//.test(line)) stale.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(stale, []);
});

test("Cursor・Codex と同じく近道越しに、別のフォルダから呼んでも、スキルは配布物の額縁と道具を見つける", (t) => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "skills-through-link-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const links = path.join(base, "links");
  const work = path.join(base, "work");
  mkdirSync(links);
  mkdirSync(work);
  for (const name of ["clean-copy", "explain-deck"]) symlinkSync(path.join(repository, ".claude", "skills", name), path.join(links, name));
  writeFileSync(path.join(work, "原本.md"), readFileSync(path.join(repository, ".claude/skills/clean-copy/fixtures/01-basic/in.md")));
  writeFileSync(path.join(work, "deck.html"), readFileSync(path.join(repository, ".claude/skills/explain-deck/fixtures/01-ok/in.html")));
  const run = (args) => {
    try {
      return execFileSync("python3", args, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      return `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
  };
  const copy = run([path.join(links, "clean-copy/scripts/run.py"), "publish", "原本.md", "--slug", "test/link", "--dry-run", "--no-git"]);
  assert.doesNotMatch(copy, /額縁が見つかりません|No such file/);
  const deck = run([path.join(links, "explain-deck/scripts/run.py"), "check", "deck.html"]);
  assert.doesNotMatch(deck, /見つかりません|No such file|Traceback/);
});
