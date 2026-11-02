"use client";
/**
 * キーボードの近道の受け口。ワークスペースに 1 つだけ置き、`keydown` を 1 か所で聞いて台帳と照らす
 * （押し方の正本は `src/lib/workspace/keyboard-shortcuts.ts`、画面が使う部品は `shortcuts.tsx`）。
 *
 * 見送るとき（どれも「キーを横取りしない」ため）:
 *   - 部品が自分でキーを使った（`preventDefault` 済み）
 *   - 焦点がメニュー・一覧・ダイアログなど、キーを自分で使う部品の中にある／ダイアログが開いている
 *   - 文字を打っている（修飾キー付きで、台帳が入力中も効くとしたものだけ通す）
 *   - 日本語の変換の途中
 *
 * `?` の一覧もここが持つ。どの画面でも開けて、いまの画面で効くものだけを並べる。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  IDLE,
  KEY_OWNING_ROLES,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  advance,
  bindingsOf,
  isTypingElement,
  shortcutLabel,
  type MatchState,
  type ShortcutId,
} from "../../lib/workspace/keyboard-shortcuts";
import { Modal } from "./controls";
import { useT } from "./i18n";
import { SUBHEADING } from "./styles";
import {
  ShortcutKeys,
  ShortcutRegistryContext,
  useApplePlatform,
  useShortcutAvailable,
  type ShortcutRegistry,
} from "./shortcuts";

/** 画面で受ける近道。 */
const WEB_BINDINGS = bindingsOf(SHORTCUTS.filter((definition) => definition.surface === "web"));
const KEY_OWNING = [...KEY_OWNING_ROLES.map((role) => `[role="${role}"]`), '[data-shortcuts="off"]'].join(",");
/** 開いているダイアログ（Radix は開いている間 data-state="open" を立てる）。焦点がどこにあっても近道を止める。 */
const OPEN_MODAL = '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]';

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<ShortcutId, { readonly current: () => void }[]>());
  const listeners = useRef(new Set<() => void>());
  const revision = useRef(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const apple = useApplePlatform();

  const registry = useMemo<ShortcutRegistry>(() => {
    const changed = () => {
      revision.current += 1;
      for (const listener of listeners.current) listener();
    };
    return {
      register(id, run) {
        handlers.current.set(id, [...(handlers.current.get(id) ?? []), run]);
        changed();
        return () => {
          const rest = (handlers.current.get(id) ?? []).filter((one) => one !== run);
          if (rest.length === 0) handlers.current.delete(id);
          else handlers.current.set(id, rest);
          changed();
        };
      },
      available: (id) => handlers.current.has(id),
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
      version: () => revision.current,
      openHelp: () => setHelpOpen(true),
    };
  }, []);

  // 一覧を開く操作は、受け口そのものが持つ（どの画面でも開ける）
  useEffect(() => registry.register("help", { current: () => setHelpOpen(true) }), [registry]);

  useEffect(() => {
    if (apple === null) return;
    let state: MatchState = IDLE;
    const onKey = (event: KeyboardEvent) => {
      // 部品が自分で使ったキー（Escape でメニューを閉じた、など）は拾わない
      if (event.defaultPrevented) {
        state = IDLE;
        return;
      }
      const focused = deepActiveElement();
      const target = event.target instanceof Element ? event.target : focused;
      if (target?.closest(KEY_OWNING) || document.querySelector(OPEN_MODAL) !== null) {
        state = IDLE;
        return;
      }
      const result = advance(
        state,
        {
          key: event.key,
          code: event.code,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
        },
        event.timeStamp,
        WEB_BINDINGS.filter((binding) => handlers.current.has(binding.id)),
        { apple, typing: isTypingElement(focused instanceof HTMLElement ? focused : null) },
      );
      state = result.state;
      if (result.kind === "none") return;
      // 待っている「g」も、当たったキーも、下へ流さない（字が入る・ブラウザが別の操作をする、を起こさない）
      event.preventDefault();
      // 押しっぱなしの繰り返しで、移動や一覧の開閉を連打しない
      if (result.kind === "pending" || event.repeat) return;
      const stack = handlers.current.get(result.id);
      stack?.[stack.length - 1]?.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [apple]);

  return (
    <ShortcutRegistryContext.Provider value={registry}>
      {children}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </ShortcutRegistryContext.Provider>
  );
}

/** 焦点のある要素。Shadow DOM の中まで降りる（document.activeElement は影の入口を指すだけ）。 */
function deepActiveElement(): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/** 一覧。いまの画面で効くものだけを出す（検索欄の無い画面に「検索欄へ移る」を出さない）。 */
function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const available = useShortcutAvailable();
  const t = useT();
  // 自分の環境の修飾キーだけを言う（Mac の人に Ctrl の話をしない）
  const modifier = useApplePlatform() === false ? "Ctrl" : "⌘";
  const groups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    items: SHORTCUTS.filter(
      (definition) => definition.surface === "web" && definition.group === group.id && available(definition.id),
    ),
  })).filter((group) => group.items.length > 0);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("workspace.keyboardShortcuts")}
      description={t("shortcuts.whileTyping", { modifier })}
    >
      <div className="ws-shortcut-groups">
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className={SUBHEADING}>{t(group.labelKey)}</h3>
            <dl>
              {group.items.map((definition) => (
                <div key={definition.id} className="ws-shortcut-row">
                  <dt>{shortcutLabel(definition, t)}</dt>
                  <dd>
                    <ShortcutKeys id={definition.id} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
