/**
 * 発表者画面の動画・音声（始まり方の決まりは src/lib/deck/media/play.ts）。鳴らすのは 1 枚の枠だけ——観客用の窓が開いていればその表の枠、
 * 開いていなければ手元の現在の枠。裏で先読みしている枠・「次」の見本は鳴らさない（文書の実行部も入れ子の窓では鳴らさない）。
 *
 * - 「スライドに着いたら」のもの（音声の既定）は、表に出た時点で頭から始める。
 * - 「クリックで」のものは、「次へ」の 1 押しごとに文書の順に 1 本ずつ始め（枚は進めない）、全部始めたあとの「次へ」で枚を進める。
 * - 枚を離れたら止めて頭に戻す。
 * - 動画は表に出る前（先読みの枠）と着いた時点で読み込みを始めておく（音つきですぐ始まるように）。
 * 再生を断られたら（音つきの自動再生をブラウザが止めた）、手元の知らせに 1 行出す。
 */
import { activateDeckVideo } from "../../../lib/deck/playback";
import { deckPlayMode } from "../../../lib/deck/media/play";
import { t } from "../../shared/i18n";

function slideIn(doc: Document, id: string): Element | null {
  return [...doc.querySelectorAll("section[data-deck-slide]")].find(slide => slide.getAttribute("data-deck-node") === id) ?? null;
}
function mediaIn(slide: Element): HTMLMediaElement[] {
  return [...slide.querySelectorAll("audio,video")].filter((node): node is HTMLMediaElement => node instanceof (node.ownerDocument.defaultView?.HTMLMediaElement ?? HTMLMediaElement));
}

/** 動画の読み込みを始めておく（止めている間の在り処を戻し、全部読む指定にする）。 */
function prime(media: HTMLMediaElement): void {
  const view = media.ownerDocument.defaultView;
  if (view && media instanceof view.HTMLVideoElement) activateDeckVideo(media);
  if (media.preload !== "auto") { media.preload = "auto"; if (media.readyState === 0) media.load(); }
}

export function presenterMedia(notify: (text: string) => void) {
  let shown: { doc: Document; id: string } | null = null, waiting: HTMLMediaElement[] = [];
  const started = new Set<HTMLMediaElement>();
  function start(media: HTMLMediaElement) {
    prime(media);
    media.muted = media.defaultMuted;
    try { media.currentTime = 0; } catch { /* 読み込み前は頭から */ }
    started.add(media);
    void media.play().then(() => { if (!waiting.length) notify(""); }, () => notify(t("deckStudio.presenter.mediaBlocked")));
  }
  function stopAll() {
    for (const media of started) { media.pause(); try { media.currentTime = 0; } catch { /* 読み込み前 */ } }
    started.clear(); waiting = [];
  }
  return {
    /** 鳴らす枠（frame）に枚（id）が表に出た。同じ枠の同じ枚なら何もしない。frame が null なら全部止める。 */
    show(frame: HTMLIFrameElement | null, id: string | null) {
      const doc = frame?.contentDocument ?? null;
      if (doc && id && shown?.doc === doc && shown.id === id) return;
      stopAll(); shown = null;
      if (!doc || !id) return;
      const slide = slideIn(doc, id);
      if (!slide) return;
      shown = { doc, id };
      for (const media of mediaIn(slide)) {
        const mode = deckPlayMode(media);
        if (mode === "arrive") start(media);
        else if (mode === "click") { prime(media); waiting.push(media); }
        else if (media.localName === "video") prime(media);
      }
      if (waiting.length) notify(t("deckStudio.presenter.mediaWaiting"));
    },
    /** 先読みの枠の枚の動画を読み込み始める（鳴らさない）。 */
    prime(frame: HTMLIFrameElement, id: string) {
      const doc = frame.contentDocument, slide = doc ? slideIn(doc, id) : null;
      if (slide) for (const media of mediaIn(slide)) if (media.localName === "video") prime(media);
    },
    /** 「次へ」の 1 押し。始める「クリックで」のものが残っていれば 1 本始めて true（枚は進めない）。 */
    advance(): boolean {
      const next = waiting.shift();
      if (!next) return false;
      for (const media of started) if (media !== next && media.localName === "video" && deckPlayMode(media) === "click") media.pause();
      start(next);
      if (!waiting.length) notify("");
      return true;
    },
    stop() { stopAll(); shown = null; },
  };
}
