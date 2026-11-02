/**
 * 不具合の直しで「落ちるテストが先」を守らせるフック（docs/pr-and-linear.md）を見張る。
 *
 * 1. 控えの道具（scripts/dev/red-test.mjs）: 落ちたときだけ「落ちるのを見た」と控える
 * 2. フック（scripts/dev/red-test-gate.mjs）: 直しの作業で、控えが無いまま直しのコードを書こうとすると止める
 * 3. 通常の実装・テスト・文書は止めない。読めないときは通す
 * 4. .claude/settings.json がフックを書き込みの直前につないでいる
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dir, root } from "./paths.mjs";

const ok = (label, actual, expected) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
};
const GATE = path.join(root, "scripts/dev/red-test-gate.mjs");
const TOOL = path.join(root, "scripts/dev/red-test.mjs");
const env = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();

/** 使い捨てのリポジトリを、指定の枝で作る。 */
function repo(name, branch) {
  const top = path.join(dir, name);
  mkdirSync(path.join(top, "src/lib/comments"), { recursive: true });
  mkdirSync(path.join(top, "tests/checks"), { recursive: true });
  writeFileSync(path.join(top, "src/lib/comments/comments.ts"), "export const a = 1;\n");
  git(top, "init", "--quiet", "-b", "main");
  git(top, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", ".");
  git(top, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "base");
  if (branch !== "main") git(top, "checkout", "--quiet", "-b", branch);
  return top;
}
/** フックを、Claude Code が渡すのと同じ形の入力で走らせる。 */
function gate(top, file, tool = "Edit") {
  const input = { tool_name: tool, cwd: top, tool_input: { file_path: path.isAbsolute(file) ? file : path.join(top, file), old_string: "a", new_string: "b" } };
  const result = spawnSync("node", [GATE], { cwd: top, env, input: JSON.stringify(input), encoding: "utf8" });
  return { code: result.status, stderr: result.stderr };
}
const tool = (top, ...args) => {
  const result = spawnSync("node", [TOOL, ...args], { cwd: top, env, encoding: "utf8" });
  return { code: result.status, out: result.stdout + result.stderr };
};

console.log("--- 直しの枝: 落ちるテストを見せる前は直しのコードを止める ---");
const fix = repo("fix", "fix/pages-12");
const blocked = gate(fix, "src/lib/comments/comments.ts");
ok("直しのコードへの Edit は止まる（終了コード 2）", blocked.code, 2);
ok("先にテストを書くよう案内する", ["落ちるテスト", "scripts/dev/red-test.mjs", "再現できない"].map((words) => blocked.stderr.includes(words)), [true, true, true]);
ok("新しいファイルへの Write も止まる", gate(fix, "src/app/api/comments/route.ts", "Write").code, 2);
ok("テスト（検査表）は書ける", gate(fix, "tests/checks/check-comments.mjs", "Write").code, 0);
ok("テスト（tests/・*.spec.*・*.test.*）は書ける", [gate(fix, "tests/e2e/comments.spec.mjs").code, gate(fix, "src/lib/comments/comments.test.ts").code, gate(fix, "apps/desktop/src/engine/__tests__/a.ts").code], [0, 0, 0]);
ok("文書は書ける", [gate(fix, "docs/pr-and-linear.md").code, gate(fix, "AGENTS.md").code], [0, 0]);
ok("リポジトリの外（下書きの置き場など）は見ない", gate(fix, path.join(dir, "outside/notes.ts"), "Write").code, 0);
ok("書き込み以外の道具は見ない", gate(fix, "src/lib/comments/comments.ts", "Read").code, 0);

console.log("\n--- 落ちるのを見せたら通す ---");
writeFileSync(path.join(fix, "tests/checks/passes.mjs"), "process.exit(0);\n");
writeFileSync(path.join(fix, "tests/checks/fails.mjs"), "console.log('NG   2 回目が 500');process.exit(1);\n");
const green = tool(fix, "--", "node", "tests/checks/passes.mjs");
ok("通ってしまうテストは「落ちるのを見た」にならない（終了コード 1）", green.code, 1);
ok("通ってしまったと言う", green.out.includes("落ちませんでした"), true);
ok("通ってしまった後も、直しのコードは止まったまま", gate(fix, "src/lib/comments/comments.ts").code, 2);
const red = tool(fix, "--", "node", "tests/checks/fails.mjs");
ok("落ちたテストは控える（終了コード 0）", red.code, 0);
ok("PR の本文に写すものを言う", ["先に落ちたテスト", "node tests/checks/fails.mjs"].map((words) => red.out.includes(words)), [true, true]);
ok("落ちるのを見せた後は、直しのコードを書ける", gate(fix, "src/lib/comments/comments.ts").code, 0);
ok("控えは git の管理の外（作業ツリーを汚さない）", git(fix, "status", "--porcelain").includes("red-test"), false);
ok("いまの状態を見られる", tool(fix, "status").out.includes("node tests/checks/fails.mjs"), true);
git(fix, "checkout", "--quiet", "-b", "fix/pages-13");
ok("控えは枝ごと（別の直しの枝では、また止まる）", gate(fix, "src/lib/comments/comments.ts").code, 2);

console.log("\n--- 再現できない不具合: 理由を書けば通す ---");
const once = repo("once", "hotfix/storage-timeout");
ok("理由が空では通さない", tool(once, "--cannot-reproduce", "  ").code, 1);
ok("理由を書かないままでは止まる", gate(once, "src/lib/comments/comments.ts").code, 2);
ok("理由を書けば控える", tool(once, "--cannot-reproduce", "保管庫側の一時的な障害で、手元で起こせない").code, 0);
ok("理由を書いた後は、直しのコードを書ける", gate(once, "src/lib/comments/comments.ts").code, 0);

console.log("\n--- 直しではない通常の実装は邪魔しない ---");
const feature = repo("feature", "feature/pages-60");
ok("機能の枝では止めない", [gate(feature, "src/lib/comments/comments.ts").code, gate(feature, "src/app/create/page.tsx", "Write").code], [0, 0]);
ok("main でも止めない", gate(repo("main", "main"), "src/lib/comments/comments.ts").code, 0);
ok("機能の枝でも「直しを始める」と言えば止まる", [tool(feature, "start").code, gate(feature, "src/lib/comments/comments.ts").code], [0, 2]);
ok("やめる（控えを消す）と元どおり通る", [tool(feature, "clear").code, gate(feature, "src/lib/comments/comments.ts").code], [0, 0]);

console.log("\n--- 読めないときは通す（作業を巻き添えにしない） ---");
const raw = (input, cwd = fix) => spawnSync("node", [GATE], { cwd, env, input, encoding: "utf8" }).status;
ok("入力が JSON でない", raw("こわれた入力"), 0);
ok("入力が空", raw(""), 0);
ok("ファイルの指定が無い", raw(JSON.stringify({ tool_name: "Edit", tool_input: {} })), 0);
ok("git の管理の外", spawnSync("node", [GATE], { cwd: dir, env, input: JSON.stringify({ tool_name: "Write", cwd: dir, tool_input: { file_path: path.join(dir, "src/lib/x.ts") } }), encoding: "utf8" }).status, 0);
writeFileSync(path.join(git(fix, "rev-parse", "--absolute-git-dir"), "pages-red-test.json"), "{こわれた控え");
ok("控えが壊れていたら「見ていない」と読む（直しの枝では止まる）", gate(fix, "src/lib/comments/comments.ts").code, 2);

console.log("\n--- 設定がフックをつないでいる ---");
const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
const groups = settings.hooks.PreToolUse ?? [];
ok("書き込みの直前のフックは 1 つだけ", groups.length, 1);
ok("書き込みの道具にだけ掛かる", groups[0]?.matcher, "Write|Edit|NotebookEdit");
const command = groups[0]?.hooks?.[0]?.command ?? "";
ok("脚本が無い版（古い枝）では何もせず通す", /\[ -f "\$f" \] \|\| exit 0/.test(command), true);
ok("フックの実体は scripts/dev/red-test-gate.mjs", command.includes("scripts/dev/red-test-gate.mjs"), true);
const wired = (top, file) => spawnSync("sh", ["-c", command], { cwd: top, env: { ...env, CLAUDE_PROJECT_DIR: root }, input: JSON.stringify({ tool_name: "Edit", cwd: top, tool_input: { file_path: path.join(top, file) } }), encoding: "utf8" }).status;
ok("書いてあるとおりに走らせて、直しの枝で止まる・機能の枝で通る", [wired(once, "src/lib/a.ts"), wired(repo("wired", "fix/x"), "src/lib/a.ts"), wired(repo("plain", "feature/x"), "src/lib/a.ts")], [0, 2, 0]);
ok("フックは秘密にも通信にも触れない", ["fetch(", "process.env.AUTH", "op run", "https://"].some((words) => readFileSync(GATE, "utf8").includes(words)), false);
