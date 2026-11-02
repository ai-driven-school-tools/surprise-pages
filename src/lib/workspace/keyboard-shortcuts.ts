/**
 * キーボードの近道の正本。**どのキーで何が起きるか**はここにだけ書く。
 *
 * 読む側は 2 つ:
 *   - ワークスペースの画面（`src/app/_components/shortcuts.tsx`）……キーを受けて、登録された操作を呼ぶ。一覧の画面もここから作る
 *   - 検査表（`tests/checks/check-shortcuts.mjs`）……重なり・ブラウザが先に取るキーとの衝突を落とす
 *
 * 画面ごとに `keydown` を書き足して近道を増やさない。増やすときは台帳に 1 行足し、
 * 使う画面で `useShortcut` を呼ぶだけにする（一覧の画面は台帳から付いてくる）。
 *
 * このファイルは DOM にも React にも寄りかからない（画面と検査表の 2 か所から読むため）。
 *
 * ## 書き方
 *
 *   "mod+k"   ⌘K（Mac）/ Ctrl+K（Windows・Linux）。Mac とそれ以外で同じ役のキーは mod で書く
 *   "?"       記号は 1 字で書く。Shift は字そのものに含まれる（JIS でも US でも「?」の字で見る）
 *   "g h"     空白で区切ると「G を押して、続けて H」
 */

import { defaultTranslate } from "../i18n/default";
import type { MessageKey } from "../i18n/messages/types";
import type { Translate } from "../i18n/translate";

export type ShortcutGroup = "general" | "go";
/** web: Pages の画面がキーを受ける。 */
export type ShortcutSurface = "web";

export type ShortcutDefinition<Id extends string = string> = {
  /** 台帳の中で 1 つだけの名前。 */
  readonly id: Id;
  /** 押し方。2 つ以上あれば、どれでも同じ操作になる（一覧には並べて出す）。 */
  readonly keys: readonly string[];
  /** 何が起きるかを動詞で（辞書の鍵）。一覧とメニューに出す。字にするのは `shortcutLabel`。 */
  readonly labelKey: MessageKey;
  readonly group: ShortcutGroup;
  readonly surface: ShortcutSurface;
  /**
   * 文字を打っている最中（入力欄・本文の編集）にも効かせるか。修飾キー付きの押し方にだけ効く——
   * 修飾キーの無い押し方（`/`・`g h`）は、打ち込んだ字を横取りしないよう入力中は必ず見送る。
   */
  readonly whileTyping?: boolean;
};

export const SHORTCUT_GROUPS: readonly { readonly id: ShortcutGroup; readonly labelKey: MessageKey }[] = [
  { id: "general", labelKey: "shortcuts.groups.general" },
  { id: "go", labelKey: "shortcuts.groups.go" },
];

export const SHORTCUTS = [
  { id: "help", keys: ["?", "mod+/"], labelKey: "shortcuts.labels.help", group: "general", surface: "web", whileTyping: true },
  { id: "search", keys: ["/"], labelKey: "shortcuts.labels.search", group: "general", surface: "web" },
  { id: "go-home", keys: ["g h"], labelKey: "shortcuts.labels.goHome", group: "go", surface: "web" },
  { id: "go-files", keys: ["g m"], labelKey: "shortcuts.labels.goFiles", group: "go", surface: "web" },
  { id: "go-favorites", keys: ["g f"], labelKey: "shortcuts.labels.goFavorites", group: "go", surface: "web" },
  { id: "go-activity", keys: ["g a"], labelKey: "shortcuts.labels.goActivity", group: "go", surface: "web" },
  { id: "go-library", keys: ["g l"], labelKey: "shortcuts.labels.goLibrary", group: "go", surface: "web" },
  { id: "go-settings", keys: ["g s"], labelKey: "shortcuts.labels.goSettings", group: "go", surface: "web" },
] as const satisfies readonly ShortcutDefinition[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

/** 続けて押す 2 つめを待つ時間。これを過ぎたら 1 つめは忘れる。 */
export const SEQUENCE_TIMEOUT_MS = 1500;

// ---------------------------------------------------------------------------
// 押し方の読み取り
// ---------------------------------------------------------------------------

export type Stroke = {
  readonly key: string;
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
};

const MODIFIERS = new Set(["mod", "ctrl", "alt", "shift", "meta"]);
/** 名前で書くキー。それ以外は 1 字でなければならない。 */
const NAMED_KEYS = new Set(["Escape", "Enter", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space"]);

/** 1 打ぶん（`mod+shift+r`）を読む。書き方が違えば例外（台帳の書き損じを、検査表が起動時に拾う）。 */
export function parseStroke(text: string): Stroke {
  const parts = text === "+" ? ["+"] : text.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts);
  for (const one of mods) if (!MODIFIERS.has(one)) throw new Error(`知らない修飾キー: ${one}（${text}）`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  if (mods.size !== parts.length) throw new Error(`修飾キーが重なっている: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  if (!(NAMED_KEYS.has(key) || [...key].length === 1)) throw new Error(`知らないキー: ${key}（${text}）`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  if (mods.has("mod") && (mods.has("meta") || mods.has("ctrl"))) throw new Error(`mod と meta/ctrl は一緒に書かない: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  const letter = /^[a-z]$/i.test(key);
  if (letter && key !== key.toLowerCase()) throw new Error(`字は小文字で書く（Shift は shift+ で書く）: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  if (isSymbol(key) && mods.has("shift")) throw new Error(`記号に shift+ は書かない（字そのもので書く）: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  return { key, mod: mods.has("mod"), ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift"), meta: mods.has("meta") };
}

/** 押し方 1 つ（`g h`）を、打の並びとして読む。 */
export function parseKeys(text: string): Stroke[] {
  const strokes = text.trim().split(/\s+/).map(parseStroke);
  if (strokes.length > 2) throw new Error(`続けて押すのは 2 打まで: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  if (strokes.length === 2 && strokes.some(hasModifier)) throw new Error(`続けて押す形に修飾キーは混ぜない: ${text}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  return strokes;
}

function isSymbol(key: string): boolean {
  return [...key].length === 1 && !/^[a-z0-9]$/i.test(key) && key !== " ";
}

export function hasModifier(stroke: Stroke): boolean {
  return stroke.mod || stroke.ctrl || stroke.alt || stroke.meta;
}

/** 環境に合わせて、mod を ⌘ か Ctrl に読み替えた本当の組み合わせ。 */
export function resolveStroke(stroke: Stroke, apple: boolean): { key: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean } {
  return { key: stroke.key, meta: stroke.meta || (stroke.mod && apple), ctrl: stroke.ctrl || (stroke.mod && !apple), alt: stroke.alt, shift: stroke.shift };
}

// ---------------------------------------------------------------------------
// 押されたキーとの照合
// ---------------------------------------------------------------------------

/** 照合に要るぶんだけを KeyboardEvent から写したもの（DOM なしで検査できるように）。 */
export type KeyPress = {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** 日本語の変換の途中。この間のキーは字を組み立てているだけなので、何にも当てない。 */
  readonly isComposing: boolean;
  readonly keyCode?: number;
};

/**
 * 1 打が当たっているか。
 *
 * - 修飾キーは**ぴったり**同じときだけ。⌘ が余計に混ざった押し方（⌘W など）を拾って、別の操作を起こさない
 * - 字は打ち込まれた字（`key`）で見る。配列を入れ替えている人（Dvorak など）が H を押したら H として扱う。
 *   ただし Option を押していて字が化けたとき（Mac の ⌥H は「˙」になる）と、ローマ字ではない配列のときは
 *   キーの位置（`code`）に落とす——そうしないと、その人には押しようが無い
 * - 記号は字そのもので見て、Shift は問わない（「?」は US でも JIS でも Shift と一緒に出る字で、Shift は字に含まれる）
 */
export function strokeMatches(stroke: Stroke, press: KeyPress, apple: boolean): boolean {
  const want = resolveStroke(stroke, apple);
  if (press.metaKey !== want.meta || press.ctrlKey !== want.ctrl || press.altKey !== want.alt) return false;
  if (/^[a-z]$/.test(want.key)) {
    if (press.shiftKey !== want.shift) return false;
    const typed = press.key.toLowerCase();
    if (/^[a-z]$/.test(typed)) return typed === want.key;
    return press.code === `Key${want.key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(want.key)) {
    if (press.shiftKey !== want.shift) return false;
    return press.key === want.key || press.code === `Digit${want.key}`;
  }
  if (isSymbol(want.key)) return press.key === want.key;
  if (press.shiftKey !== want.shift) return false;
  return press.key === (want.key === "Space" ? " " : want.key);
}

/** 変換の途中か（Safari は isComposing を立てずに keyCode 229 だけを送ってくる）。 */
export function composing(press: KeyPress): boolean {
  return press.isComposing || press.keyCode === 229;
}

/** 修飾キーそのものを押しただけ（⌘ を押し下げた瞬間など）。続けて押す形の途中を壊さないよう、何もしない。 */
export function modifierOnly(press: KeyPress): boolean {
  return ["Meta", "Control", "Alt", "Shift", "CapsLock", "Fn", "OS", "Hyper", "Super"].includes(press.key);
}

// ---------------------------------------------------------------------------
// 続けて押す形（g h）の追跡
// ---------------------------------------------------------------------------

export type Binding<Id extends string = string> = { readonly id: Id; readonly strokes: readonly Stroke[]; readonly whileTyping: boolean };

/** 台帳の押し方を、照合の材料に開く（押し方 1 つにつき 1 行）。 */
export function bindingsOf<Id extends string>(definitions: readonly ShortcutDefinition<Id>[]): Binding<Id>[] {
  return definitions.flatMap((definition) => definition.keys.map((keys) => ({ id: definition.id, strokes: parseKeys(keys), whileTyping: definition.whileTyping === true })));
}

export type MatchState = { readonly pending: readonly Stroke[]; readonly since: number };
export const IDLE: MatchState = { pending: [], since: 0 };

export type MatchResult<Id extends string = string> =
  /** 当たった。呼ぶ側はキーの既定の動き（字の入力・ブラウザの操作）を止めて、操作を呼ぶ */
  | { readonly kind: "matched"; readonly id: Id; readonly state: MatchState }
  /** 続きを待っている。キーは食べる（「g」が下の何かに届いて別の動きをしないように） */
  | { readonly kind: "pending"; readonly state: MatchState }
  /** 何にも当たらない。キーは素通しする */
  | { readonly kind: "none"; readonly state: MatchState };

/**
 * 1 打ぶん進める。純関数（時刻と、いまの状態を受けて、次の状態を返す）。
 *
 * - `typing`: 焦点が入力欄にある。修飾キーの無い押し方は見送り、`whileTyping` の押し方だけを見る
 * - 待っている途中で関係の無いキーが来たら、待ちを捨てて、そのキーを頭から見直す
 *   （「g」のあとに「?」を押した人には、一覧を開く）
 */
export function advance<Id extends string>(state: MatchState, press: KeyPress, now: number, bindings: readonly Binding<Id>[], options: { apple: boolean; typing: boolean }): MatchResult<Id> {
  if (composing(press) || modifierOnly(press)) return { kind: "none", state };
  const live = state.pending.length > 0 && now - state.since <= SEQUENCE_TIMEOUT_MS ? state.pending : [];
  const usable = bindings.filter((binding) => !options.typing || (binding.whileTyping && binding.strokes.every(hasModifier)));

  const attempt = (prefix: readonly Stroke[]): MatchResult<Id> | null => {
    const depth = prefix.length;
    const candidates = usable.flatMap((binding) => {
      const stroke = binding.strokes[depth];
      if (stroke === undefined || !prefix.every((one, index) => sameStroke(one, binding.strokes[index])) || !strokeMatches(stroke, press, options.apple)) return [];
      return [{ binding, stroke }];
    });
    const complete = candidates.find(({ binding }) => binding.strokes.length === depth + 1);
    if (complete !== undefined) return { kind: "matched", id: complete.binding.id, state: IDLE };
    const [first] = candidates;
    if (first === undefined) return null;
    return { kind: "pending", state: { pending: [...prefix, first.stroke], since: now } };
  };

  if (live.length > 0) {
    const continued = attempt(live);
    if (continued !== null) return continued;
  }
  return attempt([]) ?? { kind: "none", state: IDLE };
}

function sameStroke(a: Stroke, b: Stroke | undefined): boolean {
  return b !== undefined && a.key === b.key && a.mod === b.mod && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta;
}

// ---------------------------------------------------------------------------
// 見せ方（一覧・吹き出し・OS のメニュー・読み上げ）
// ---------------------------------------------------------------------------

const KEY_NAMES: Readonly<Record<string, { apple: string; other: string }>> = {
  Escape: { apple: "esc", other: "Esc" },
  Enter: { apple: "↩", other: "Enter" },
  Tab: { apple: "⇥", other: "Tab" },
  Backspace: { apple: "⌫", other: "Backspace" },
  Delete: { apple: "⌦", other: "Delete" },
  ArrowUp: { apple: "↑", other: "↑" },
  ArrowDown: { apple: "↓", other: "↓" },
  ArrowLeft: { apple: "←", other: "←" },
  ArrowRight: { apple: "→", other: "→" },
  Space: { apple: "space", other: "Space" },
};

/**
 * 押し方 1 つを、キーの札の並びにする。外側の配列が「続けて押す」、内側が「一緒に押す」。
 *
 *   "mod+shift+r"  Mac: [["⇧", "⌘", "R"]]     Windows: [["Ctrl", "Shift", "R"]]
 *   "g h"          どちらも [["G"], ["H"]]
 *
 * Mac の修飾キーの並びは OS のメニューと同じ ⌃ ⌥ ⇧ ⌘（見慣れた順と違うと読み違える）。
 */
export function keyCaps(keys: string, apple: boolean): string[][] {
  return parseKeys(keys).map((stroke) => {
    const real = resolveStroke(stroke, apple);
    const caps: string[] = apple
      ? [real.ctrl ? "⌃" : "", real.alt ? "⌥" : "", real.shift ? "⇧" : "", real.meta ? "⌘" : ""]
      : [real.ctrl ? "Ctrl" : "", real.meta ? "Win" : "", real.alt ? "Alt" : "", real.shift ? "Shift" : ""];
    const named = KEY_NAMES[real.key];
    caps.push(named === undefined ? real.key.toUpperCase() : apple ? named.apple : named.other);
    return caps.filter((cap) => cap !== "");
  });
}

/** 読み上げに渡す `aria-keyshortcuts` の値。続けて押す形はこの属性で書けないので外す。無ければ null。 */
export function ariaKeyShortcuts(definition: Pick<ShortcutDefinition, "keys">, apple: boolean): string | null {
  const values = definition.keys
    .map(parseKeys)
    .flatMap((strokes) => (strokes.length === 1 && strokes[0] !== undefined ? [strokes[0]] : []))
    .map((stroke) => {
      const real = resolveStroke(stroke, apple);
      const key = real.key === "Space" ? "Space" : /^[a-z]$/.test(real.key) ? real.key.toUpperCase() : real.key;
      return [real.ctrl ? "Control" : "", real.alt ? "Alt" : "", real.shift ? "Shift" : "", real.meta ? "Meta" : "", key].filter((part) => part !== "").join("+");
    });
  return values.length === 0 ? null : values.join(" ");
}

/**
 * Electron のメニューに渡す accelerator。台帳の 1 つめの押し方から作る。
 * mod は CmdOrCtrl（Mac は ⌘、Windows は Ctrl）。続けて押す形はメニューに書けないので断る。
 */
export function electronAccelerator(id: ShortcutId): string {
  const definition = shortcutById(id);
  const strokes = parseKeys(definition.keys.find((keys) => parseKeys(keys).every(hasModifier)) ?? "");
  const [stroke] = strokes;
  if (strokes.length !== 1 || stroke === undefined) throw new Error(`メニューに書ける押し方が無い: ${id}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  const key = /^[a-z]$/.test(stroke.key) ? stroke.key.toUpperCase() : stroke.key;
  return [stroke.mod ? "CmdOrCtrl" : "", stroke.ctrl ? "Ctrl" : "", stroke.meta ? "Command" : "", stroke.alt ? "Alt" : "", stroke.shift ? "Shift" : "", key].filter((part) => part !== "").join("+");
}

export function shortcutById(id: ShortcutId): ShortcutDefinition {
  const found = SHORTCUTS.find((definition) => definition.id === id);
  if (found === undefined) throw new Error(`台帳に無い近道: ${id}`); // i18n-keep: 台帳の書き損じを開発者に知らせる内部の例外
  return found;
}

/**
 * 近道の名前（一覧・吹き出し・OS のメニュー）。辞書を引く関数を渡さなければ日本語
 * （デスクトップアプリのメニューは画面の言語を知らないので、既定のまま呼ぶ）。
 */
export function shortcutLabel(shortcut: ShortcutId | Pick<ShortcutDefinition, "labelKey">, translate: Translate = defaultTranslate): string {
  return translate(typeof shortcut === "string" ? shortcutById(shortcut).labelKey : shortcut.labelKey);
}

/**
 * Apple の機械か。⌘ を使うか Ctrl を使うかを決める。iPad に外付けのキーボードを付けた人も ⌘ の側。
 * 渡すのは `navigator.userAgentData?.platform`（あれば）と `navigator.platform`・`navigator.userAgent`。
 */
export function isApplePlatform(platform: string, userAgent: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform) || /Mac OS X|iPhone|iPad/.test(userAgent);
}

// ---------------------------------------------------------------------------
// 焦点がどこにあるか
// ---------------------------------------------------------------------------

/** 字を打つ場所か。ここでは修飾キーの無い近道を見送る。 */
export function isTypingElement(element: { tagName: string; isContentEditable?: boolean; type?: string; readOnly?: boolean } | null): boolean {
  if (element === null) return false;
  if (element.isContentEditable === true) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  // 押すだけの input（チェック・ボタン類）は字を打たない
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes((element.type ?? "text").toLowerCase());
}

/**
 * キーを自分で使う部品の役割。この中に焦点があるときは、近道を一切出さない
 * （メニューの頭文字で項目へ飛ぶ・一覧を矢印で動く・ダイアログの中を操作する、を横取りしない）。
 */
export const KEY_OWNING_ROLES = ["menu", "menubar", "listbox", "combobox", "grid", "tree", "treegrid", "dialog", "alertdialog", "application", "slider", "spinbutton"] as const;
