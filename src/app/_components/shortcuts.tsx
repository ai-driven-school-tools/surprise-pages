"use client";
/**
 * キーボードの近道の、画面側の部品。押し方の正本は `src/lib/workspace/keyboard-shortcuts.ts`、キーを受けるのは
 * `shortcut-provider.tsx`（ワークスペースに 1 つだけ置く）。
 *
 *   - `useShortcut(id, 操作)` ……その画面が出ている間だけ、台帳の近道に操作を結ぶ。同じ近道を後から結んだ画面が勝つ
 *   - `ShortcutKeys` ……キーの札（⌘ / Ctrl を環境で出し分ける）。吹き出し・一覧・検索欄の印で同じ見た目にする
 *
 * 画面ごとにページ全体のキー（keydown）を聞く処理を書かない（入力中・変換中・ダイアログの中で見送る決まりが
 * 画面ごとにばらける）。このファイルは next にも、言語の受け口（`i18n.tsx`）のほかの部品にも寄りかからない（`controls.tsx` から読まれ、
 * デスクトップアプリの画面も同じ部品を読む。受け口の外では、近道は何もせず札も出ない）。
 */
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  isApplePlatform,
  keyCaps,
  shortcutById,
  type ShortcutId,
} from "../../lib/workspace/keyboard-shortcuts";
import { useT } from "./i18n";

export type ShortcutRegistry = {
  register(id: ShortcutId, run: { readonly current: () => void }): () => void;
  available(id: ShortcutId): boolean;
  subscribe(listener: () => void): () => void;
  version(): number;
  openHelp(): void;
};

export const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

/** 新しいブラウザは navigator.userAgentData.platform を持つ（型の定義にはまだ無いので、形を確かめて読む）。 */
function platformHint(): string {
  const data: unknown = Reflect.get(navigator, "userAgentData");
  const platform: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "platform") : null;
  return typeof platform === "string" && platform.length > 0 ? platform : navigator.platform;
}

function noSubscription(): () => void {
  return () => undefined;
}

/**
 * Apple の機械か。サーバーでは分からないので null（札を出さない）。描いたあとで決まる。
 * 一度決まった値は変わらないので、購読は空でよい。
 */
export function useApplePlatform(): boolean | null {
  return useSyncExternalStore(
    noSubscription,
    () => isApplePlatform(platformHint(), navigator.userAgent),
    () => null,
  );
}

/**
 * その画面が出ている間だけ、近道に操作を結ぶ。返すのは「いま効いているか」（受け口の外では false）。
 * 操作は毎回の描画で最新に差し替わる（古い state を握ったまま呼ばない）。
 */
export function useShortcut(id: ShortcutId, run: () => void, enabled = true): boolean {
  const registry = useContext(ShortcutRegistryContext);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (registry === null || !enabled) return;
    return registry.register(id, latest);
  }, [registry, id, enabled]);
  return registry !== null && enabled;
}

/** 近道が、いまどこかの画面に結ばれているか（一覧に出すかどうか）。結び直されるたびに描き直す。 */
export function useShortcutAvailable(): (id: ShortcutId) => boolean {
  const registry = useContext(ShortcutRegistryContext);
  const version = useSyncExternalStore(
    registry?.subscribe ?? noSubscription,
    () => registry?.version() ?? 0,
    () => 0,
  );
  return useCallback(
    (id: ShortcutId) => registry !== null && version >= 0 && registry.available(id),
    [registry, version],
  );
}

/** 一覧を開く（マウスで来た人の入口）。受け口の外では null。 */
export function useOpenShortcutHelp(): (() => void) | null {
  return useContext(ShortcutRegistryContext)?.openHelp ?? null;
}

/**
 * キーの札。押し方が 2 つ以上あれば「または」で並べ、続けて押す形は「のあと」でつなぐ。
 * 環境が分かるまで（サーバーで描くとき）は何も出さない——⌘ と Ctrl を取り違えた札を一瞬でも見せない。
 */
export function ShortcutKeys({
  id,
  first = false,
}: {
  id: ShortcutId;
  /** 押し方の 1 つめだけを出す（吹き出しのように狭いところ）。 */
  first?: boolean;
}) {
  const apple = useApplePlatform();
  const t = useT();
  if (apple === null) return null;
  const keys = shortcutById(id).keys;
  return (
    <span className="ws-keys">
      {(first ? keys.slice(0, 1) : keys).map((one, index) => (
        <Fragment key={one}>
          {index > 0 ? <span className="ws-keys-word">{t("shortcuts.or")}</span> : null}
          {keyCaps(one, apple).map((caps, step) => (
            <Fragment key={step}>
              {step > 0 ? <span className="ws-keys-word">{t("shortcuts.then")}</span> : null}
              {caps.map((cap) => (
                <kbd key={cap} className="ws-kbd">
                  {cap}
                </kbd>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
