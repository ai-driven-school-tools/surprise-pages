import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./paths.mjs";

/** Follow the feature modules actually connected to an entry, once per file.
 * Structural checks must inspect the implementation after a responsibility moves. */
/** comments.ts が束ねる対話の部品（旧 comment-widget-*）。 */
const COMMENT_PARTS = ["history", "widget-list", "origin", "live", "selection", "sharing", "types"];
/** deck/workspace/workspace.ts が束ねる画面の部品（旧 deck-workspace-*）。 */
const WORKSPACE_PARTS = ["data", "design", "dialogs", "inspector", "navigation", "styles", "types"];

export async function readWidgetSource(entry = "src/widget/comments/comments.ts") {
  const visited = new Set();
  async function read(file) {
    if (visited.has(file)) return "";
    visited.add(file);
    const source = await readFile(file, "utf8");
    // 入口の隣にある同じ機能の部品だけを追う（comments/ の対話の部品と deck/workspace/ の画面の部品）
    const siblings = /\/comments$/.test(path.dirname(file)) ? COMMENT_PARTS : /\/deck\/workspace$/.test(path.dirname(file)) ? WORKSPACE_PARTS : [];
    const imports = [...source.matchAll(/from\s+["'](\.\/[^"'/]+)["']/g)].filter((match) => siblings.includes(match[1].slice(2)));
    const children = [];
    for (const match of imports) {
      children.push(await read(path.resolve(path.dirname(file), `${match[1]}.ts`)));
    }
    // Keep the legacy structural checks independent of the factory nesting level.
    const inspected = file === path.resolve(root, entry) ? source : source.replace(/^  /gm, "");
    return [inspected, ...children].join("\n");
  }
  return read(path.resolve(root, entry));
}
