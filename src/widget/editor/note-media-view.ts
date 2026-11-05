import type { Node as PMNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import type { NoteMediaKind } from "../../lib/notes/model";
import { t } from "../shared/i18n";
import { captionIgnores } from "./note-block-edit";
import { NOTE_CAPTION_CLASS, NOTE_MEDIA_CLASS } from "./note-schema";

/**
 * メモ帳の絵のブロック（画像・動画）の見た目と、上げている間の進み具合。
 */

export type Upload = {
  file: File;
  kind: NoteMediaKind;
  progress: number;
  failed: boolean;
  done: string | null;
  abort: AbortController;
  listeners: Set<() => void>;
};

/** 絵のブロック。媒体と進み具合の 1 行は編集の芯の外（字ではない）、添え書きだけを打てる場所にする。 */
export class MediaView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private media: HTMLElement;
  private progress: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private node: PMNode,
    private readonly uploads: Map<string, Upload>,
    private readonly retry: (id: string) => void,
  ) {
    this.dom = document.createElement("figure");
    this.media = this.renderMedia(node);
    this.contentDOM = document.createElement("figcaption");
    this.contentDOM.className = NOTE_CAPTION_CLASS;
    this.dom.append(this.media, this.contentDOM);
    this.apply(node);
  }

  private renderMedia(node: PMNode): HTMLElement {
    const media = document.createElement(String(node.attrs.kind) === "video" ? "video" : "img");
    media.setAttribute("contenteditable", "false");
    if (media instanceof HTMLMediaElement) {
      media.controls = true;
      media.preload = "metadata";
    }
    // 見た目のクラスはスキーマ（清書の表から引いた値）と同じもの
    media.className = NOTE_MEDIA_CLASS;
    return media;
  }

  private apply(node: PMNode): void {
    this.dom.setAttribute("data-note-media", String(node.attrs.kind));
    const src = String(node.attrs.src);
    if (this.media.getAttribute("src") !== src) this.media.setAttribute("src", src);
    if (this.media instanceof HTMLImageElement) this.media.alt = String(node.attrs.alt);
    if (node.content.size === 0) this.contentDOM.setAttribute("data-note-placeholder", t("notes.editor.caption"));
    else this.contentDOM.removeAttribute("data-note-placeholder");
    this.watchUpload(typeof node.attrs.upload === "string" ? node.attrs.upload : null);
  }

  private watchUpload(id: string | null): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const upload = id === null ? undefined : this.uploads.get(id);
    if (id === null || upload === undefined) {
      this.progress?.remove();
      this.progress = null;
      return;
    }
    const paint = (): void => this.paintProgress(id, upload);
    upload.listeners.add(paint);
    this.unsubscribe = () => upload.listeners.delete(paint);
    paint();
  }

  private paintProgress(id: string, upload: Upload): void {
    if (this.progress === null) {
      this.progress = document.createElement("div");
      this.progress.setAttribute("data-note-progress", "");
      this.progress.setAttribute("contenteditable", "false");
      this.progress.setAttribute("role", "status");
      this.dom.insertBefore(this.progress, this.contentDOM);
    }
    const row = this.progress;
    row.replaceChildren();
    if (upload.failed) {
      row.append(document.createTextNode(t("notes.editor.uploadFailed")));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t("notes.editor.uploadRetry");
      button.addEventListener("click", () => this.retry(id));
      row.append(button);
      return;
    }
    row.append(document.createTextNode(t("notes.editor.uploading", { name: upload.file.name, percent: upload.progress })));
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs.kind !== this.node.attrs.kind) return false;
    this.node = node;
    this.apply(node);
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && (this.progress?.contains(target) === true || (this.media instanceof HTMLMediaElement && target === this.media && event.type !== "dragstart"));
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return captionIgnores(this.contentDOM, mutation);
  }

  destroy(): void {
    this.unsubscribe?.();
  }
}
