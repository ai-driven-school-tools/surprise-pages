/**
 * スライドの真ん中の大きい画面とレイヤーの一覧の右クリック（要素の操作）。左の一覧の「スライドの操作」と同じ見た目（.ds-menu）と同じキーで出す。
 * 字を直している間はブラウザのメニュー（字のコピー）に任せる（呼ぶ側の ../canvas.ts が出さない）。
 * 並びは Keynote と同じく 編集／配置／グループ／ロック を区切りで分け、削除は一番下。いまできない操作は出さない
 * （右の欄のボタンだけでは「グループを解除」などが見つからなかった）。保存の操作の種類は新しく作らず、右の欄と同じ入口を呼ぶ。
 */
import { deckIcon, type DeckIcon } from "../ui";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";

export type DeckAlign = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DeckElementCommand = "cut" | "copy" | "paste" | "duplicate" | "group" | "ungroup" | "delete";

/** メニューの 1 行が行う操作。 */
export type DeckElementMenuAction = DeckElementCommand | "select-all" | "front" | "back" | DeckAlign | "distribute-horizontal" | "distribute-vertical" | "lock" | "unlock";

export type DeckElementMenuRow = { action: DeckElementMenuAction; label: string; icon: DeckIcon | null; keys?: string; danger?: true };

/** メニューを組む材料。`count` は選んでいる物の数（0 は何も無い所の右クリック）。 */
export type DeckElementMenuState = {
  count: number;
  /** 選んだ物に位置を固定した物があるか。 */
  locked: boolean;
  /** 選んでいる 1 つがグループか。 */
  grouped: boolean;
  /** 貼れる要素の写しがあるか。 */
  canPaste: boolean;
};

const ALIGNS = ["left", "center", "right", "top", "middle", "bottom"] as const satisfies readonly DeckAlign[];
const isAlign = (value: DeckElementMenuAction): value is DeckAlign => ALIGNS.some((mode) => mode === value);

/** メニューの並びを区切りごとに組む（描かない・検査はこれを直に呼ぶ）。空の区切りは返さない。 */
export function elementMenuSections(state: DeckElementMenuState): DeckElementMenuRow[][] {
  const paste: DeckElementMenuRow = { action: "paste", label: t("deckEditor.elementMenu.paste"), icon: null, keys: "⌘V" };
  const copy: DeckElementMenuRow = { action: "copy", label: t("deckEditor.elementMenu.copy"), icon: "copy", keys: "⌘C" };
  if (state.count === 0) return [[...(state.canPaste ? [paste] : []), { action: "select-all", label: t("deckEditor.elementMenu.selectAll"), icon: null }]];
  // 固定した物は「固定を解除」と写すだけ（動かす・変える操作は出さない）
  if (state.locked) return [[copy], [{ action: "unlock", label: t("deckEditor.inspector.unlock"), icon: "lock" }]];
  const sections: DeckElementMenuRow[][] = [
    [
      { action: "cut", label: t("deckEditor.elementMenu.cut"), icon: null, keys: "⌘X" },
      copy,
      ...(state.canPaste ? [paste] : []),
      { action: "duplicate", label: t("deckEditor.dialogs.duplicate"), icon: "copy", keys: "⌘D" },
    ],
    [
      { action: "front", label: t("deckEditor.inspector.bringForward"), icon: "front" },
      { action: "back", label: t("deckEditor.inspector.sendBackward"), icon: "back" },
      // 1 つだけならスライドに揃える。読み上げで分かるよう名前に「スライドの」を添える
      ...ALIGNS.map((mode): DeckElementMenuRow => ({ action: mode, label: state.count === 1 ? t("deckEditor.align.toSlide", { action: t(`deckEditor.inspector.${mode}`) }) : t(`deckEditor.inspector.${mode}`), icon: null })),
      ...(state.count >= 3 ? [
        { action: "distribute-horizontal", label: t("deckEditor.inspector.distributeHorizontal"), icon: null },
        { action: "distribute-vertical", label: t("deckEditor.inspector.distributeVertical"), icon: null },
      ] satisfies DeckElementMenuRow[] : []),
    ],
    [
      ...(state.count >= 2 ? [{ action: "group", label: t("deckEditor.inspector.group"), icon: null } satisfies DeckElementMenuRow] : []),
      ...(state.count === 1 && state.grouped ? [{ action: "ungroup", label: t("deckEditor.inspector.ungroup"), icon: null } satisfies DeckElementMenuRow] : []),
    ],
    [{ action: "lock", label: t("deckEditor.inspector.lock"), icon: "lock" }],
    [{ action: "delete", label: t("deckEditor.dialogs.delete"), icon: "trash", keys: "⌫", danger: true }],
  ];
  return sections.filter((section) => section.length);
}

/** メニューの 1 行を、編集画面の操作へつなぐ。 */
export function runElementMenuAction(action: DeckElementMenuAction, handlers: {
  command: (command: DeckElementCommand) => void;
  align: (mode: DeckAlign) => void;
  distribute: (vertical: boolean) => void;
  reorder: (direction: "front" | "back") => void;
  lock: (locked: boolean) => void;
  selectAll: () => void;
}): void {
  if (action === "select-all") handlers.selectAll();
  else if (action === "front" || action === "back") handlers.reorder(action);
  else if (action === "distribute-horizontal" || action === "distribute-vertical") handlers.distribute(action === "distribute-vertical");
  else if (action === "lock" || action === "unlock") handlers.lock(action === "lock");
  else if (isAlign(action)) handlers.align(action);
  else handlers.command(action);
}

/** 要素の操作のメニューを、押した位置（画面の座標）に出す。開いたメニューは `opened` に渡し、最初の行にキーを移す。 */
export function elementMenu(options: {
  screen: HTMLElement;
  at: { x: number; y: number };
  state: DeckElementMenuState;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  run: (action: DeckElementMenuAction) => void;
  close: (restore: boolean) => void;
  opened: (menu: HTMLElement) => void;
}): void {
  const menu = el("div", "ds-menu ds-element-menu");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("deckEditor.elementMenu.title"));
  elementMenuSections(options.state).forEach((section, index) => {
    if (index) { const rule = el("div", "ds-menu-separator"); rule.setAttribute("role", "separator"); menu.append(rule); }
    for (const row of section) {
      const item = options.button(row.label, () => { options.close(true); options.run(row.action); }, "ds-menu-item");
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", t("deckEditor.elementMenu.action", { action: row.label }));
      if (row.keys) item.append(el("kbd", undefined, row.keys));
      if (row.icon) item.prepend(deckIcon(row.icon));
      else { const blank = el("span", "icon"); blank.setAttribute("aria-hidden", "true"); item.prepend(blank); } // 絵の無い行も字の頭をそろえる
      if (row.danger) item.classList.add("ds-danger");
      menu.append(item);
    }
  });
  options.screen.append(menu);
  menu.style.left = `${Math.max(8, Math.min(options.at.x, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(options.at.y, window.innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const root = menu.getRootNode(), active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    const index = items.findIndex((item) => item === active);
    if (event.key === "Escape") { event.preventDefault(); options.close(true); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); (event.key === "Home" ? items[0] : items.at(-1))?.focus(); }
    else if (event.key === "Tab") options.close(false);
  });
  menu.querySelector<HTMLElement>("button")?.focus();
  options.opened(menu);
}

/** 区切りの線（.ds-menu の中だけ）。区切りは余白と細い線 1 本で、行の囲みは足さない。 */
export const ELEMENT_MENU_CSS = `
.ds-element-menu { max-height:calc(100vh - 16px); overflow:auto; width:232px; }
.ds-menu-separator { height:1px; margin:4px 0; background:var(--border); }
.ds-element-menu .ds-menu-item.ds-danger { margin-top:0; border-top:0; border-radius:4px; }
`;
