import type {} from "../lib/deck/render-contract";

/** A transient first-paint curtain. The real document keeps its measurable layout. */
export function beginDeckLoading(): void {
  if (!document.head.querySelector('script[data-deck-design]') || document.deckLoading) return;
  const root = document.documentElement;
  root.setAttribute("data-deck-loading", "");
  let finished = false;
  let status: HTMLElement | undefined;
  let main: HTMLElement | null = null;
  let wasInert = false;
  whenDeckParsed(() => {
    if (finished || !document.body) return;
    main = document.querySelector<HTMLElement>('main[data-deck-slides]');
    wasInert = main?.hasAttribute("inert") ?? false;
    main?.setAttribute("inert", "");
    status = document.createElement("p");
    status.setAttribute("data-deck-toolbar", "");
    status.setAttribute("role", "status");
    status.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);";
    status.textContent = "資料を準備しています";
    document.body.append(status);
  });
  const events = new AbortController();
  const stopNavigation = () => { if (document.deckLoading) document.deckLoading.interacted = true; };
  window.addEventListener("wheel", stopNavigation, { passive: true, signal: events.signal });
  window.addEventListener("touchstart", stopNavigation, { passive: true, signal: events.signal });
  window.addEventListener("pointerdown", stopNavigation, { passive: true, signal: events.signal });
  window.addEventListener("keydown", stopNavigation, { signal: events.signal });
  window.addEventListener("hashchange", stopNavigation, { signal: events.signal });
  // Native history restoration owns the position when returning to this document.
  const navigation = performance.getEntriesByType("navigation")[0];
  const restored = navigation instanceof PerformanceNavigationTiming && navigation.type === "back_forward";
  document.deckLoading = {
    interacted: restored,
    finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      document.deckLayout?.settleInitial?.();
      root.removeAttribute("data-deck-loading");
      document.querySelector('main[data-deck-slides]')?.removeAttribute("aria-busy");
      if (!wasInert) main?.removeAttribute("inert");
      status?.remove();
      events.abort();
    },
  };
  // A broken custom script must never leave the document permanently hidden.
  const timeout = window.setTimeout(() => document.deckLoading?.finish(), 4000);
  window.addEventListener("pagehide", () => document.deckLoading?.finish(), { once: true });
}

export async function waitForDeckImages(slide: HTMLElement | undefined): Promise<void> {
  if (!slide) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all([...slide.querySelectorAll("img")].map(image => {
      image.loading = "eager";
      return image.decode().catch(() => {});
    })),
    new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); }),
  ]);
  clearTimeout(timer);
}

/** Do not wait for deferred companion libraries to lay out the document. */
export function whenDeckParsed(run: () => void): void {
  if (document.readyState !== "loading") { run(); return; }
  const parsed = () => {
    if (document.readyState === "loading") return;
    document.removeEventListener("readystatechange", parsed);
    run();
  };
  document.addEventListener("readystatechange", parsed);
}


/** Subscribe before awaiting fonts: DOMContentLoaded can already have fired later. */
export function waitForDeckCharts(): Promise<boolean> {
  if (Reflect.get(window, "echarts")) return Promise.resolve(true);
  const script = document.querySelector<HTMLScriptElement>('script[data-deck-companion="echarts-6.1.0"]');
  if (!script) return Promise.resolve(false);
  return new Promise(resolve => {
    const done = (loaded: boolean) => {
      clearTimeout(timer);
      script.removeEventListener("load", loadedScript);
      script.removeEventListener("error", failedScript);
      resolve(loaded);
    };
    const loadedScript = () => done(Boolean(Reflect.get(window, "echarts")));
    const failedScript = () => done(false);
    const timer = setTimeout(failedScript, 2000);
    script.addEventListener("load", loadedScript, { once: true });
    script.addEventListener("error", failedScript, { once: true });
  });
}


export function waitForDeckLayout(): Promise<void> {
  if (document.deckLayout) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("surprise:deck-layout-ready", done);
      if (document.deckLayout) resolve(); else reject(new Error("スライドの配置を準備できませんでした"));
    };
    const timer = setTimeout(done, 2000);
    document.addEventListener("surprise:deck-layout-ready", done, { once: true });
  });
}
