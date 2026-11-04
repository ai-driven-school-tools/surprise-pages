import {MediaFailure} from "../../../lib/deck/media/failure";
import { t } from "../../shared/i18n";

/** 読み込みを待つ上限。壊れた動画で送信が止まり続けないようにする。 */
const POSTER_TIMEOUT_MS = 15000;
/** 静止画の長辺の上限（スライドは 1280×720 なので、その 1.5 倍あれば足りる）。 */
const POSTER_MAX_EDGE = 1920;

function waitFor(video: HTMLVideoElement, event: "loadeddata" | "seeked", signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => { cleanup(); reject(new MediaFailure("format", t("deckEditor.session.videoPosterFailed"))); };
    const stop = () => { cleanup(); reject(new DOMException(t("deckEditor.session.stopped"), "AbortError")); };
    const done = () => { cleanup(); resolve(); };
    const timer = setTimeout(fail, POSTER_TIMEOUT_MS);
    function cleanup() { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener("error", fail); signal.removeEventListener("abort", stop); }
    if (signal.aborted) { stop(); return; }
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", stop, { once: true });
  });
}

/**
 * 動画の最初のほうの場面を、ブラウザの中で静止画（JPEG）にする。
 * サーバーでは動画を変換しないので、静止画はここで作って画像として送る。
 * 返す縦横は動画そのものの大きさ（スライドに置く枠の比率に使う）。
 */
export async function videoPosterFile(file: File, signal: AbortSignal): Promise<{ file: File; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
    await waitFor(video, "loadeddata", signal);
    // 真っ黒な最初のコマを避けて、少しだけ先（長さの 1 割・最大 1 秒）を使う
    const at = Number.isFinite(video.duration) ? Math.min(1, video.duration / 10) : 0;
    if (at > 0) { video.currentTime = at; await waitFor(video, "seeked", signal); }
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) throw new MediaFailure("format", t("deckEditor.session.videoPosterFailed"));
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new MediaFailure("format", t("deckEditor.session.videoPosterFailed"));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new MediaFailure("format", t("deckEditor.session.videoPosterFailed"));
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return { file: new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" }), width, height };
  } finally {
    video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
  }
}
