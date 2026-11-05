/**
 * 右の調整パネルの「発表での始まり・繰り返し・音」（動画と音声）。値は本文の属性（src/lib/deck/media/play.ts）で、
 * 変えるのはいつもの属性の操作（取り消せる）。音声の始まりの既定は「スライドに着いたら」。
 */
import { DECK_PLAY, deckPlayMode } from "../../../lib/deck/media/play";
import type { DeckEditOperation } from "../../../lib/deck/edit/model";
import { t } from "../../shared/i18n";
import { el } from "../../shared/util";

type Field = (parent: HTMLElement, label: string, items: readonly (readonly [string, string])[], value: string, change: (value: string) => void) => unknown;
type Attribute = (name: Extract<DeckEditOperation, { kind: "attribute" }>["name"], value: string | null) => void;

export function appendMediaSound(group: HTMLElement, node: Element, selectField: Field, attribute: Attribute): void {
  const audio = node.localName === "audio";
  if (audio) group.append(el("p", "ds-note", t("deckStudio.audio.note")));
  const play = deckPlayMode(node);
  // 動画は「再生ボタンで」（属性なし・今までの動き）も選べる。音声は 2 つのどちらか
  const starts: (readonly [string, string])[] = [["arrive", t("deckStudio.audio.playArrive")], ["click", t("deckStudio.audio.playClick")]];
  if (!audio) starts.unshift(["", t("deckStudio.audio.playManual")]);
  selectField(group, t("deckStudio.audio.playStart"), starts, play ?? "", value => attribute(DECK_PLAY, value || null));
  selectField(group, t("deckStudio.audio.playRepeat"), [["loop", t("deckStudio.audio.playLoop")], ["once", t("deckStudio.audio.playOnce")]], node.hasAttribute("loop") ? "loop" : "once", value => attribute("loop", value === "loop" ? "" : null));
  selectField(group, t("deckStudio.audio.sound"), [["on", t("deckStudio.audio.soundOn")], ["muted", t("deckStudio.audio.soundMuted")]], node.hasAttribute("muted") ? "muted" : "on", value => attribute("muted", value === "muted" ? "" : null));
}
