/**
 * 「戻る」「進む」が、いま押せるか。
 *
 * 読むのは 2 か所——ワークスペースの窓の上端（`src/app/_components/window-history.tsx`）と、ページの上端の
 * 現在地の行（`src/widget/reading/location-bar.ts`）。同じ答えを同じ読み方で出す。
 *
 * ブラウザの Navigation API を読む。無いブラウザでは「戻れるか」は履歴の長さからしか分からず、
 * 「進めるか」は知る手立てが無い（進めない、と答える）。戻る・進むのボタンを出すのは
 * デスクトップアプリ（中身は Chromium）だけなので、そちらでは必ず正しく読める。
 */
export type HistorySteps = { readonly back: boolean; readonly forward: boolean };

type Entry = { readonly url: string | null; readonly index: number };
type NavigationLike = {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly currentEntry: Entry | null;
  entries(): readonly Entry[];
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
};

function isNavigationLike(value: unknown): value is NavigationLike {
  if (typeof value !== "object" || value === null) return false;
  return (
    "canGoBack" in value &&
    typeof value.canGoBack === "boolean" &&
    "canGoForward" in value &&
    typeof value.canGoForward === "boolean" &&
    "entries" in value &&
    typeof value.entries === "function" &&
    "addEventListener" in value &&
    typeof value.addEventListener === "function"
  );
}

function navigationOf(view: Window): NavigationLike | null {
  const value: unknown = Reflect.get(view, "navigation");
  return isNavigationLike(value) ? value : null;
}

export const NO_STEPS: HistorySteps = { back: false, forward: false };

export function readHistorySteps(view: Window): HistorySteps {
  const navigation = navigationOf(view);
  if (navigation !== null) return { back: navigation.canGoBack, forward: navigation.canGoForward };
  return { back: view.history.length > 1, forward: false };
}

/**
 * 押せるかどうかが変わるたびに知らせる。返すのは、見張りをやめる関数。
 *
 * 戻る操作で控えから出し直された画面（bfcache）は、出し直しでは移動の知らせが来ないので `pageshow` でも読み直す。
 *
 * 知らせはその場で流さず、いまの処理が済んでから 1 回にまとめて流す。移動の知らせ（`currententrychange`）は
 * `pushState` の中で同期で届き、その `pushState` を Next は描画を当てている最中（`useInsertionEffect`）に呼ぶ。
 * その場で流すと、読み手が描画の最中に描き直しを頼むことになる（React の警告
 * 「useInsertionEffect must not schedule updates.」）。
 */
export function watchHistorySteps(view: Window, onChange: () => void): () => void {
  const navigation = navigationOf(view);
  let waiting = false;
  let stopped = false;
  const later = (): void => {
    if (waiting) return;
    waiting = true;
    queueMicrotask(() => {
      waiting = false;
      if (!stopped) onChange();
    });
  };
  navigation?.addEventListener("currententrychange", later);
  view.addEventListener("pageshow", later);
  view.addEventListener("popstate", later);
  return () => {
    stopped = true;
    navigation?.removeEventListener("currententrychange", later);
    view.removeEventListener("pageshow", later);
    view.removeEventListener("popstate", later);
  };
}

/**
 * 1 つ前に見ていた画面の URL。同じサイトの画面でなければ null。
 *
 * `reachable` は「戻る」で着けるか。履歴に 1 つ前が無いとき（リンクを新しいタブで開いた）は、
 * 来た元（referrer）を答えるが、戻っては着けない。Navigation API が無いブラウザでは履歴の中身を
 * 読めないので、来た元があって履歴が 2 つ以上なら着けるとみなす。
 */
export function previousUrl(view: Window): { readonly url: URL; readonly reachable: boolean } | null {
  const navigation = navigationOf(view);
  const current = navigation?.currentEntry ?? null;
  if (navigation !== null && current !== null) {
    const before = navigation.entries().find((entry) => entry.index === current.index - 1);
    const url = sameSiteUrl(view, before?.url ?? null);
    if (url !== null) return { url, reachable: true };
  }
  const url = sameSiteUrl(view, view.document.referrer);
  return url === null ? null : { url, reachable: navigation === null && view.history.length > 1 };
}

function sameSiteUrl(view: Window, value: string | null): URL | null {
  if (value === null || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.origin === view.location.origin ? url : null;
  } catch {
    return null;
  }
}
