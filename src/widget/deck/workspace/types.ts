import {
  type DeckEditableNode,
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import type { DeckCanvas } from "../canvas";

/** 新しい枚の差し込み先。`beforeId` が null なら末尾、`parent` が null なら根に置く。 */
export type DeckInsertion = { afterId: string | null; beforeId: string | null; parent: string | null; note: string };

export type Input = {
  pageSlug: string;
  screen: HTMLElement;
  bar: HTMLElement;
  frame: HTMLIFrameElement;
  source: () => string;
  inspectNode?: (id:string) => DeckEditableNode | undefined;
  savedSource: () => Promise<{html:string;versionId:string}>;
  preview: () => string;
  canvas: () => DeckCanvas | null;
  commit: (ops: DeckEditOperation[]) => boolean;
  fail: (message: string) => void;
  /** ロゴの送信など、作業場の中で「送信中」が始まった・終わったことを知らせる（保存の表示と完了ボタンを合わせる）。 */
  busyChanged: () => void;
  addText: () => void;
  addImage: () => void;
  openImages: (replace: boolean) => void;
  addLink: () => void;
  exportDraft: () => void;
  present: () => void;
  openTools: (panel: "history" | "sharing") => void;
};
