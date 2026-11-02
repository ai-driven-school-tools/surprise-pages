// i18n-keep-file: 保存済みページに貼る動画の再生部品（src/templates/deck.html・deck-design.html に束ねる）。1 字も変えない
import { releaseDeckVideo } from "./video-source";
import { DECK_YOUTUBE_VIEW } from "../deck";
import { isYouTubeId } from "./youtube-id";

type Player = { destroy(): void; playVideo(): void; pauseVideo(): void };
type PlayerOptions = {
  videoId: string; host: string; playerVars: Record<string, string | number>;
  events: { onReady: (event: { target: Player }) => void; onError: (event: { data: number }) => void; onStateChange: (event: { data: number }) => void };
};
declare global { interface Window { YT?: { Player: new (element: HTMLElement, options: PlayerOptions) => Player }; onYouTubeIframeAPIReady?: () => void } }
type PlaybackState = {
  player: Player | null; generation: number; timer?: ReturnType<typeof setTimeout>;
  holder: HTMLElement; button: HTMLButtonElement; idle: () => void;
};
const PRIMARY = "pointer-events:auto;font:inherit;line-height:inherit;cursor:pointer;border:0;border-radius:8px;padding:12px 24px;background:var(--dd-text,CanvasText);color:var(--dd-bg,Canvas);text-decoration:none";
const SECONDARY = "pointer-events:auto;font:inherit;color:inherit;text-underline-offset:4px";

/** Playback controls are disposable view state, never authored content or comment text. */
export function installDeckYouTube(doc: Document): void {
  const view = doc.defaultView;
  if (!view || doc.body.hasAttribute("data-deck-youtube-ready")) return;
  doc.body.setAttribute("data-deck-youtube-ready", "");
  const print = doc.createElement("style"); print.textContent = `@media print { [${DECK_YOUTUBE_VIEW}]{display:none!important;} }`; doc.head.append(print);
  const states = new Map<HTMLElement, PlaybackState>();
  let loading: Promise<void> | null = null;
  function sdk(): Promise<void> {
    if (view!.YT?.Player) return Promise.resolve();
    loading ??= new Promise<void>((resolve, reject) => {
      const previous = view!.onYouTubeIframeAPIReady;
      const script = doc.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.referrerPolicy = "strict-origin-when-cross-origin";
      const fail = () => { loading = null; clearTimeout(timeout); script.remove(); reject(new Error("YouTubeに接続できません")); };
      const timeout = setTimeout(fail, 15000);
      view!.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); resolve(); };
      script.onerror = fail; doc.head.append(script);
    });
    return loading;
  }
  function stop(root: HTMLElement): void {
    const state = states.get(root);
    if (!state || !state.player && !state.holder.firstChild && !state.button.disabled) return;
    state.generation++; clearTimeout(state.timer); state.player?.destroy(); state.player = null;
    state.holder.replaceChildren(); state.holder.style.pointerEvents = "none"; state.idle();
  }
  function allowed(root: HTMLElement): boolean {
    const rect = root.getBoundingClientRect();
    return root.isConnected && !doc.hidden && !doc.documentElement.hasAttribute("data-deck-overview") && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < view!.innerHeight && (doc.documentElement.getAttribute("data-deck-mode") !== "present" || !!root.closest("[data-deck-current]"));
  }
  function check() { for (const root of states.keys()) if (!allowed(root)) stop(root); }
  function refresh() {
    for (const root of doc.querySelectorAll<HTMLElement>("[data-deck-youtube]")) {
      const id = root.getAttribute("data-deck-youtube");
      if (states.has(root) || !isYouTubeId(id)) continue;
      const chrome = doc.createElement("div"); chrome.setAttribute(DECK_YOUTUBE_VIEW, "");
      chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;font-size:20px;line-height:1.5;background:var(--dd-surface,Canvas);color:var(--dd-text,CanvasText);gap:16px;text-align:center;padding:32px";
      const title = doc.createElement("span"); title.style.fontWeight = "600";
      const status = doc.createElement("span"); status.setAttribute("role", "status"); status.style.maxWidth = "90%";
      const actions = doc.createElement("div"); actions.style.cssText = "display:flex;gap:24px;align-items:center;justify-content:center;flex-wrap:wrap";
      const button = doc.createElement("button"); button.type = "button"; button.style.cssText = PRIMARY;
      const link = doc.createElement("a"); link.href = `https://www.youtube.com/watch?v=${id}`; link.target = "_blank"; link.rel = "noopener noreferrer";
      const holder = doc.createElement("div"); holder.style.cssText = "position:absolute;inset:0;pointer-events:none";
      function idle() {
        title.textContent = root.getAttribute("aria-label") || "YouTube動画";
        status.textContent = ""; status.hidden = true;
        button.hidden = false; button.disabled = false; button.textContent = "再生"; button.setAttribute("aria-label", "YouTubeを再生");
        link.textContent = "YouTubeで開く"; link.style.cssText = SECONDARY;
      }
      const state: PlaybackState = { player: null, generation: 0, holder, button, idle }; states.set(root, state);
      function unavailable(kind: "connection" | "blocked" | "missing" | "environment") {
        const focused = doc.activeElement === button || holder.contains(doc.activeElement);
        stop(root); status.hidden = false;
        if (kind === "connection") {
          title.textContent = "YouTubeに接続できませんでした";
          status.textContent = "通信を確認してから、もう一度お試しください。";
          button.textContent = "もう一度試す"; button.setAttribute("aria-label", "YouTubeの再生を再試行");
        } else {
          button.hidden = true; link.style.cssText = PRIMARY;
          title.textContent = kind === "blocked" ? "YouTubeで再生してください" : kind === "missing" ? "動画を見つけられません" : "このページでは再生できません";
          status.textContent = kind === "blocked" ? "投稿者の設定により、このページ内では再生できません。" : kind === "missing" ? "削除されたか、非公開に変更された可能性があります。" : "YouTubeを開くと、動画の状態を確認できます。";
          link.textContent = kind === "missing" ? "YouTubeで確認" : "YouTubeで開く";
        }
        if (focused) (button.hidden ? link : button).focus();
      }
      link.addEventListener("click", () => stop(root));
      button.onclick = async () => {
        idle();
        const generation = ++state.generation;
        button.disabled = true; status.hidden = false; status.textContent = "YouTubeに接続しています…";
        try {
          await sdk(); if (generation !== state.generation || !allowed(root)) return;
          const mount = doc.createElement("div"); holder.replaceChildren(mount); holder.style.pointerEvents = "auto";
          const Player = view!.YT?.Player; if (!Player) throw new Error("Player unavailable");
          state.player = new Player(mount, {
            videoId: id, host: "https://www.youtube-nocookie.com", playerVars: { origin: new URL(doc.baseURI).origin, playsinline: 1, rel: 0 },
            events: {
              onReady: ({ target }) => { if (generation !== state.generation) { target.destroy(); return; } clearTimeout(state.timer); button.hidden = true; button.disabled = false; status.hidden = true; target.playVideo(); },
              onError: ({ data }) => { if (generation === state.generation) unavailable(data === 100 ? "missing" : data === 101 || data === 150 ? "blocked" : data === 5 ? "connection" : "environment"); },
              onStateChange: ({ data }) => {
                if (data !== 1 || generation !== state.generation) return;
                for (const other of states.keys()) if (other !== root) stop(other);
                if (doc.deckPauseVideos) doc.deckPauseVideos(); else for (const video of doc.querySelectorAll("video")) releaseDeckVideo(video);
              },
            },
          });
          const iframe = holder.querySelector("iframe");
          if (iframe) { iframe.style.cssText = "width:100%;height:100%;border:0"; iframe.referrerPolicy = "strict-origin-when-cross-origin"; }
          state.timer = setTimeout(() => { if (generation === state.generation && button.disabled) unavailable("connection"); }, 15000);
        } catch { if (generation === state.generation) unavailable("connection"); }
      };
      idle(); actions.append(button, link); chrome.append(title, status, actions, holder); root.append(chrome);
    }
    for (const root of states.keys()) if (!root.isConnected) { stop(root); states.delete(root); }
    check();
  }
  const observer = new view.MutationObserver(refresh); observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-deck-current", "data-studio-active"] });
  const modeObserver = new view.MutationObserver(check); modeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-deck-mode", "data-deck-overview"] });
  view.addEventListener("beforeprint", () => { for (const root of states.keys()) stop(root); });
  doc.addEventListener("visibilitychange", check); doc.addEventListener("scroll", check, { capture: true, passive: true }); view.addEventListener("resize", check);
  doc.addEventListener("play", event => { if (event.target instanceof view.HTMLVideoElement) for (const root of states.keys()) stop(root); }, true);
  view.addEventListener("pagehide", () => { for (const root of states.keys()) stop(root); observer.disconnect(); modeObserver.disconnect(); }); refresh();
}
