/**
 * 編集画面の枚と要素のコピー・カット・貼り付け。写しの受け渡しは src/widget/deck/edit/clipboard.ts、原稿の操作は
 * src/lib/deck/edit/clipboard.ts。ほかのタブ・窓の資料でコピーしたものも貼れる。
 * 別の資料の写しは、サーバーが元を読めるかを確かめ、素材を先にこの資料へ写してから足す（1 回の取り消しで消える）。
 */
import { deckElementClips, deckElementPasteOperations, deckSlideClips, deckSlidePasteOperations, type DeckClipboard } from "../../../lib/deck/edit/clipboard";
import type { DeckEditOperation } from "../../../lib/deck/edit/model";
import { LocalizedError } from "../../../lib/i18n/errors";
import { t } from "../../shared/i18n";
import { el } from "../../shared/util";
import { carryDeckClipboard, DeckPastePublicConsentError, readDeckClipboard, writeDeckClipboard } from "../edit/clipboard";
import type { Input } from "./types";

type Host = {
  input: Input;
  run: (fn: () => void) => void;
  commit: (ops: DeckEditOperation[]) => boolean;
  uid: () => string;
  current: string;
  chosenSlides: string[];
  selection: string[];
  /** 選んでいる枚を消す（カット）。 */
  deleteSlides: () => void;
  /** 選んでいる要素を消す（カット）。 */
  deleteElements: () => void;
  modal: (title: string) => HTMLElement;
  actions: (box: HTMLElement, label: string, fn: () => void) => void;
  closeDialog: () => void;
};

export function createDeckWorkspaceClipboard(host: Host) {
  let pasting = false;
  /** 招待した人だけの中身を公開の資料へ貼る前の確かめ。了承されたら true、閉じた・やめたら false。 */
  function confirmPublic(): Promise<boolean> {
    return new Promise(resolve => {
      const box = host.modal(t("deckStudio.clipboard.publicTitle")), backdrop = box.parentElement;
      let settled = false;
      const settle = (value: boolean) => { if (settled) return; settled = true; watch.disconnect(); resolve(value); };
      // やめる・Escape・ほかの窓に替わったときは、どれも窓が外れる
      const watch = new MutationObserver(() => { if (!backdrop?.isConnected) settle(false); });
      if (backdrop?.parentNode) watch.observe(backdrop.parentNode, { childList: true });
      box.append(el("p", "ds-note", t("deckStudio.clipboard.publicBody")));
      host.actions(box, t("deckStudio.clipboard.publicAccept"), () => { settle(true); host.closeDialog(); });
    });
  }
  /** 足す。別の資料の写しも、ここに来るときには素材の参照が書き換わっている。 */
  function place(value: DeckClipboard): void {
    host.run(() => {
      const source = host.input.source();
      if ("slides" in value) {
        const pasted = deckSlidePasteOperations(source, value.slides, host.current || null, host.uid);
        if (!pasted.ids.length) return;
        host.current = pasted.ids[0]; host.chosenSlides = [...pasted.ids]; host.selection = [];
        host.commit(pasted.operations);
        return;
      }
      if (!host.current) throw new LocalizedError("deckEditor.session.addSlideFirst");
      const pasted = deckElementPasteOperations(value.elements, host.current, host.uid);
      if (!pasted.ids.length) return;
      host.selection = pasted.ids;
      host.commit(pasted.operations);
    });
  }
  /** コピーした中身を、いま見ている枚へ（要素）・その後ろへ（枚）貼る。写しが無ければ false。 */
  function paste(): boolean {
    const clip = readDeckClipboard();
    if (!clip) return false;
    if (clip.page === host.input.pageSlug) { place(clip); return true; }
    if (pasting) return true;
    pasting = true;
    const carry = (acknowledgePublic: boolean) => carryDeckClipboard(host.input.pageSlug, clip, acknowledgePublic);
    void carry(false)
      .catch(async (error: unknown) => {
        if (!(error instanceof DeckPastePublicConsentError)) throw error;
        return await confirmPublic() ? carry(true) : null;
      })
      .then(value => { if (value) place(value); }, (error: unknown) => host.input.fail(error instanceof Error ? error.message : t("deckStudio.clipboard.failed")))
      .finally(() => { pasting = false; });
    return true;
  }
  return {
    paste,
    canPaste: () => readDeckClipboard() !== null,
    /** 左の一覧で選んだ枚のコピー・カット・貼り付け（キーと枚のメニュー）。 */
    slides(command: "copy" | "cut" | "paste"): void {
      if (command === "paste") { if (!paste()) host.input.fail(t("deckStudio.clipboard.nothing")); return; }
      const chosen = host.chosenSlides.length ? host.chosenSlides : host.current ? [host.current] : [];
      if (!chosen.length) return;
      host.run(() => {
        const slides = deckSlideClips(host.input.source(), chosen);
        if (slides.length) writeDeckClipboard({ page: host.input.pageSlug, slides });
      });
      if (command === "cut") host.deleteSlides();
    },
    /** 選んだ要素のコピー・カット（いまの枚の要素）。 */
    elements(command: "copy" | "cut", ids: readonly string[]): void {
      const list = deckElementClips(host.input.source(), ids);
      if (!list.length) return;
      writeDeckClipboard({ page: host.input.pageSlug, elements: list });
      if (command === "cut") host.deleteElements();
    },
  };
}
