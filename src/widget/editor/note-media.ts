import { DECK_EDIT_IMAGE_MAX_BYTES } from "../../lib/deck/edit/assets";
import { DECK_VIDEO_CHUNK_BYTES, DECK_VIDEO_MAX_BYTES } from "../../lib/deck/media/video-upload";
import { NOTE_IMAGE_NAME, NOTE_VIDEO_TYPES, type NoteMediaKind } from "../../lib/notes/model";
import { widgetLocale } from "../shared/i18n";

/**
 * メモ帳に落とした・貼った素材を、サーバー経由で保管庫へ上げる（src/app/api/pages/notes/assets）。
 * 画像は 1 回で、動画は 2MB ずつ。どちらも進み具合（0〜100）を返す。上限と形式はスライドの素材の口と同じ。
 */

const IMAGE_TYPES: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
/** 動画の上限と 1 片の大きさは、スライドの動画の口と同じ（src/lib/deck/media/video-upload.ts）。 */
const NOTE_VIDEO_MAX_BYTES = DECK_VIDEO_MAX_BYTES;
const VIDEO_CHUNK_BYTES = DECK_VIDEO_CHUNK_BYTES;

/** 置ける素材か。置けないものは null。 */
export function noteFileKind(file: Pick<File, "type" | "name">): NoteMediaKind | null {
  if (file.type in IMAGE_TYPES || (file.type === "" && NOTE_IMAGE_NAME.test(file.name))) return "image";
  return NOTE_VIDEO_TYPES.some((type) => type === file.type) ? "video" : null;
}

/** 大きさの上限（画像 10MB・動画 100MB）。 */
export function noteFileTooLarge(file: File, kind: NoteMediaKind): boolean {
  return file.size === 0 || file.size > (kind === "image" ? DECK_EDIT_IMAGE_MAX_BYTES : NOTE_VIDEO_MAX_BYTES);
}

/** 答えの欄の字（入力の確かめの道具を連れてこないよう、欄を 1 つ読むだけにする）。読めなければ null。 */
function field(body: unknown, name: string): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value: unknown = Reflect.get(body, name);
  return typeof value === "string" ? value : null;
}

export class NoteUploadError extends Error {}

function uploadImage(base: string, file: File, progress: (value: number) => void, signal: AbortSignal): Promise<string> {
  const extension = IMAGE_TYPES[file.type] ?? (NOTE_IMAGE_NAME.exec(file.name)?.[1] ?? "png").toLowerCase();
  return new Promise((resolve, reject) => {
    // 進み具合を出すために XMLHttpRequest で送る（fetch は送った量を教えない）
    const request = new XMLHttpRequest();
    request.open("POST", `${base}&name=${encodeURIComponent(`image.${extension}`)}`);
    // fetch ではないので、断り文の言語の見出しはここで添える（src/widget/shared/api.ts と同じ値）
    request.setRequestHeader("Accept-Language", widgetLocale());
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) progress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      const body: unknown = request.response;
      const src = field(body, "src");
      if (request.status >= 200 && request.status < 300 && src !== null) resolve(src);
      else reject(new NoteUploadError(field(body, "error") ?? ""));
    });
    request.addEventListener("error", () => reject(new NoteUploadError("")));
    request.addEventListener("abort", () => reject(new NoteUploadError("")));
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });
}

async function sendJson(url: string, init: RequestInit): Promise<unknown> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept-Language", widgetLocale());
      const response = await fetch(url, { credentials: "same-origin", ...init, headers });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return body;
      if (response.status < 500 && response.status !== 429) throw new NoteUploadError(field(body, "error") ?? "");
      last = body;
    } catch (error) {
      if (error instanceof NoteUploadError || attempt === 2) throw error instanceof NoteUploadError ? error : new NoteUploadError("");
    }
  }
  throw new NoteUploadError(field(last, "error") ?? "");
}

async function digest(bytes: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await bytes.arrayBuffer()));
  return [...hash].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function uploadVideo(base: string, file: File, progress: (value: number) => void, signal: AbortSignal): Promise<string> {
  const started = await sendJson(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size: file.size, type: file.type }), signal });
  const upload = field(started, "upload");
  if (upload === null || (typeof started === "object" && started !== null && Reflect.get(started, "chunkBytes") !== VIDEO_CHUNK_BYTES)) throw new NoteUploadError("");
  const headers = { "x-deck-upload": upload };
  const hashes: string[] = [];
  try {
    const count = Math.ceil(file.size / VIDEO_CHUNK_BYTES);
    for (let index = 0; index < count; index += 1) {
      const piece = file.slice(index * VIDEO_CHUNK_BYTES, Math.min(file.size, (index + 1) * VIDEO_CHUNK_BYTES));
      const hash = await digest(piece);
      await sendJson(`${base}&chunk=${index}&hash=${hash}`, { method: "PUT", headers, body: piece, signal });
      hashes.push(hash);
      progress(Math.min(99, Math.round((Math.min(file.size, (index + 1) * VIDEO_CHUNK_BYTES) / file.size) * 100)));
    }
    const src = field(await sendJson(base, { method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ hashes }), signal }), "src");
    if (src === null) throw new NoteUploadError("");
    return src;
  } catch (error) {
    // 途中でやめた一時データは、ここで片付けを頼む（届かなくても期限切れの掃除が消す）
    await fetch(base, { method: "DELETE", headers, credentials: "same-origin" }).catch(() => undefined);
    throw error;
  }
}

/** 上げて、保管庫の道筋（ページからの相対の道筋）を返す。 */
export function uploadNoteFile(pageSlug: string, file: File, kind: NoteMediaKind, progress: (value: number) => void, signal: AbortSignal): Promise<string> {
  const base = `/api/pages/notes/assets?page=${encodeURIComponent(pageSlug)}`;
  return kind === "image" ? uploadImage(base, file, progress, signal) : uploadVideo(base, file, progress, signal);
}

const MEDIA_ACCEPT: Record<NoteMediaKind, string> = {
  image: "image/png,image/jpeg,image/webp,image/gif,image/avif",
  video: NOTE_VIDEO_TYPES.join(","),
};

/** ファイルを選ぶ欄を開き、選んだファイルを渡す（その種類の形式だけ・いくつでも）。 */
export function chooseNoteFiles(kind: NoteMediaKind, picked: (files: File[]) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = MEDIA_ACCEPT[kind];
  input.multiple = true;
  input.addEventListener("change", () => {
    if (input.files !== null) picked([...input.files]);
  });
  input.click();
}
