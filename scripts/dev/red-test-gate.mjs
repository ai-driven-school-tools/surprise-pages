#!/usr/bin/env node
/**
 * 書き込みの直前のフック（Claude Code の PreToolUse・.claude/settings.json）。。
 *
 * 不具合の直しの作業で、落ちるテストを見せる前に直しのコードを書こうとしたら止めて、先にテストを書くよう案内する。
 *
 * 止めるのは次の全部がそろったときだけ。1 つでも欠けたら通す（通常の実装を邪魔しない）:
 *   1. 道具が Write / Edit / NotebookEdit で、相手がこのリポジトリの中
 *   2. 直しの作業である——枝の名前が直しを示す（PR の検査と同じ `isFixBranch`）か、
 *      `node scripts/dev/red-test.mjs start` で直しを始めると言ってある
 *   3. 相手がテストでも文書でもない
 *   4. 落ちるのを見せた控えも、再現できない理由の控えも無い（scripts/dev/red-test.mjs が書く）
 *
 * 入力が読めない・git が答えないなど、判断の材料が無いときは通す。シェル経由の書き換えは見ないので、
 * これは歯止めであって証明ではない。Codex にはフックが無い。どちらにも効く関門は PR の検査（PR body format）。
 *
 * 約束: 標準入力に {tool_name, tool_input:{file_path}}。終了コード 0 で通す、2 と標準エラーで止めて案内を返す。
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { hasProof, locate, readState } from "./red-test.mjs";

/** 枝の名前の区切り（/）ごとに、頭が fix・bugfix・hotfix のものを直しと読む（`fixture-…` は読まない）。 */
const isFixBranch = (branch) => String(branch ?? "").split("/").some((part) => /^(?:hot|bug)?fix(?:$|[-_])/i.test(part));

/** 落ちるテストより先に書いてよい場所（テスト・検査の材料・文書・開発の設定）。 */
const FREE = [/^(scripts\/checks|tests|docs|\.github|\.claude)\//, /(^|\/)(__tests__|tests?|Tests|fixtures|__fixtures__)\//, /\.(test|spec)\.[a-z]+$/i, /\.(md|txt)$/i];

function decide() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (!["Write", "Edit", "NotebookEdit"].includes(input.tool_name)) return null;
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== "string" || !file) return null;
  const target = path.resolve(input.cwd ?? process.cwd(), file);
  // 相手のファイルが居る作業場で判断する（まだ無いフォルダなら、在るところまで上がる）
  let near = path.dirname(target);
  while (!existsSync(near) && path.dirname(near) !== near) near = path.dirname(near);
  const place = locate(near);
  if (!place) return null;
  // 記号リンクをほどいてから比べる（git が答える根はほどいた後の道筋）
  const relative = path.relative(realpathSync(place.top), path.join(realpathSync(near), path.relative(near, target)));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (FREE.some((pattern) => pattern.test(relative))) return null;
  const state = readState(place);
  if (!isFixBranch(place.branch) && !state) return null;
  if (hasProof(state)) return null;
  return { relative, branch: place.branch };
}

let blocked = null;
try {
  blocked = decide();
} catch {
  blocked = null;
}
if (blocked) {
  console.error(
    [
      `止めました: 不具合の直し（枝: ${blocked.branch}）で、落ちるテストを見せる前に ${blocked.relative} を書こうとしています。`,
      "",
      "先にやること（AGENTS.md「不具合の直し方」）:",
      "  1. ログと記録を見に行く（決まりは docs/guides/server-logs.md）",
      "  2. 見た事実と、まだ推測のものを分けて書く",
      "  3. 不具合を再現する落ちるテストを書き、落ちるのを確かめる:",
      "       node scripts/dev/red-test.mjs -- <テストのコマンド>",
      "     （テスト・検査表・文書はこのまま書けます。落ちたら直しのコードを書けるようになります）",
      "",
      "再現できない不具合（外部の障害・一度きりの出来事）のときだけ:",
      '       node scripts/dev/red-test.mjs --cannot-reproduce "<再現できない理由>"',
      "     PR の本文には「再現できない理由」と「代わりに見た記録」を書く。",
      "",
      "これは直しではない、というときは: node scripts/dev/red-test.mjs clear（枝の名前が fix/ などなら、PR の題名と枝を機能のものにする）",
    ].join("\n"),
  );
  process.exit(2);
}
