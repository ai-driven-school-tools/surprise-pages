/**
 * 配布物のスキルを、別のフォルダの Claude Code・Cursor・Codex からも呼べるようにする。
 *
 * 写しは作らない。どれも配布物のフォルダ（.claude/skills）をその場で読むので、git pull した直しは次に開いたときから効く。
 *
 *   Claude Code … 本人の設定（~/.claude/settings.json）に置き場とプラグインを書き足す。次に起動したとき、
 *                  Claude Code が置き場（このリポジトリの .claude-plugin/）を登録してプラグインを読む
 *   Cursor      … ~/.cursor/skills/<スキル名> に近道を張る
 *   Codex       … ~/.agents/skills/<スキル名> に近道を張る
 *
 * 書き足すだけで、本人のほかの設定・ほかのスキルは触らない。同じ名前の本物のフォルダや別の近道があれば残して知らせる。
 * 何度打っても同じ結果になる。提供元のサーバーへは通信しない。
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** プラグインの名前と置き場の名前。正本は .claude-plugin/ の 2 つ（ここに書き写さない）。 */
export function pluginIdentity(root) {
  const marketplace = readJson(path.join(root, ".claude-plugin", "marketplace.json"));
  const plugin = readJson(path.join(root, ".claude-plugin", "plugin.json"));
  return { marketplace: marketplace.name, plugin: plugin.name, id: `${plugin.name}@${marketplace.name}` };
}

/** .claude/skills の下で SKILL.md を持つフォルダ（_shared のような共有の置き場は含まない）。本人が足したスキルも入る。 */
export function skillNames(root) {
  const base = path.join(root, ".claude", "skills");
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(base, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

/** Claude Code の本人の設定へ、置き場とプラグインを書き足す。読めない設定は書き換えずに止まる。 */
export function connectClaude({ root, configDir }) {
  const file = path.join(configDir, "settings.json");
  const { marketplace, id } = pluginIdentity(root);
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = readJson(file);
    } catch {
      return { ok: false, line: `Claude Code: ${file} が JSON として読めないため、書き足しませんでした（手で直してからもう一度打ってください）` };
    }
    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
      return { ok: false, line: `Claude Code: ${file} の形が想定と違うため、書き足しませんでした` };
    }
  }
  const source = { source: "directory", path: root };
  const known = settings.extraKnownMarketplaces?.[marketplace]?.source;
  const enabled = settings.enabledPlugins?.[id] === true;
  if (known?.source === source.source && known?.path === source.path && enabled) {
    return { ok: true, line: "Claude Code: 設定済みです" };
  }
  const marketplaces = typeof settings.extraKnownMarketplaces === "object" && settings.extraKnownMarketplaces !== null ? settings.extraKnownMarketplaces : {};
  const plugins = typeof settings.enabledPlugins === "object" && settings.enabledPlugins !== null && !Array.isArray(settings.enabledPlugins) ? settings.enabledPlugins : {};
  const next = {
    ...settings,
    extraKnownMarketplaces: { ...marketplaces, [marketplace]: { source } },
    enabledPlugins: { ...plugins, [id]: true },
  };
  mkdirSync(configDir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
  renameSync(temporary, file);
  return { ok: true, line: "Claude Code: 設定に書き足しました（次に起動したときから、どのフォルダでも使えます）" };
}

function linkTarget(link) {
  try {
    return path.resolve(path.dirname(link), readlinkSync(link));
  } catch {
    return null;
  }
}

/** 近道の置き場（Cursor・Codex）へ、スキルごとの近道を張る。 */
export function connectLinks({ root, destination, label, platform = process.platform }) {
  const skills = path.join(root, ".claude", "skills");
  const names = skillNames(root);
  const notes = [];
  let ready = 0;
  mkdirSync(destination, { recursive: true });

  // 自分が張った近道のうち、先が無くなったもの（名前を変えたスキルなど）だけを片づける
  for (const entry of readdirSync(destination)) {
    const link = path.join(destination, entry);
    if (!lstatSync(link).isSymbolicLink()) continue;
    const target = linkTarget(link);
    if (target !== null && target.startsWith(skills + path.sep) && !existsSync(target)) {
      rmSync(link);
      notes.push(`${label}: ${entry} の古い近道を片づけました`);
    }
  }

  for (const name of names) {
    const source = path.join(skills, name);
    const link = path.join(destination, name);
    let stat = null;
    try {
      stat = lstatSync(link);
    } catch {
      stat = null;
    }
    if (stat === null) {
      symlinkSync(source, link, platform === "win32" ? "junction" : "dir");
      ready += 1;
    } else if (stat.isSymbolicLink() && linkTarget(link) === source) {
      ready += 1;
    } else {
      notes.push(`${label}: ${name} は同じ名前の${stat.isSymbolicLink() ? "別の近道" : "フォルダ"}があるため触りませんでした（${link}）`);
    }
  }
  return { ok: ready === names.length, line: `${label}: ${names.length} 件中 ${ready} 件の近道がそろっています（${destination}）`, notes };
}

export function connectSkills({ root = repositoryRoot, home = homedir(), env = process.env, platform = process.platform } = {}) {
  const claude = connectClaude({ root, configDir: env.CLAUDE_CONFIG_DIR || path.join(home, ".claude") });
  const cursor = connectLinks({ root, destination: path.join(home, ".cursor", "skills"), label: "Cursor", platform });
  const codex = connectLinks({ root, destination: path.join(home, ".agents", "skills"), label: "Codex", platform });
  return {
    ok: claude.ok && cursor.ok && codex.ok,
    lines: [claude.line, cursor.line, ...cursor.notes, codex.line, ...codex.notes],
    skills: skillNames(root),
  };
}

export function printConnection(result) {
  for (const line of result.lines) console.log(`  ${line}`);
  console.log(`  使えるスキル: ${result.skills.join(" / ")}`);
  console.log("  開いている Claude Code・Cursor・Codex は、一度閉じて開き直すと読み込まれます。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log("スキルを Claude Code・Cursor・Codex につなぎます。");
    const result = connectSkills();
    printConnection(result);
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error("スキルをつなげませんでした。配布物のフォルダが欠けていないか、ホームフォルダに書き込めるかを確かめてください。");
    process.exitCode = 1;
  }
}
