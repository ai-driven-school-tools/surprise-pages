import type { WorkspaceAppearance } from "@/lib/workspace/settings";

/**
 * 画面の明暗を `<html>` に映す（外枠が描くたびに、設定の画面が押した瞬間に）。
 *
 * 外枠（workspace-shell.tsx）はサーバーから届いた値で、設定の画面（settings-screen.tsx）は押した値で呼ぶ。
 * 届くのを待たずに押した瞬間に色が変わり、届けば同じ値がもう一度当たるだけ。失敗したら前の値で呼び戻す。
 */
export function applyAppearance(appearance: WorkspaceAppearance): void {
  const root = document.documentElement;
  root.dataset.appearance = appearance;
  root.classList.toggle(
    "dark",
    appearance === "dark" ||
      (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches),
  );
}
