/**
 * スライドの直接編集が開いているかの旗。編集の部品（src/widget/deck/edit/session.ts・見本集や縮小図を含めて 2MB 超）は
 * 編集を始めるときに初めて読む（docs/design/app-speed.md の「道具箱の部品を分ける」）ので、旗だけをここに置く。
 * 道具箱と記事の編集はこの旗だけを見る（編集の部品を読み込まずに済む）。
 */
let active = false;

export function deckEditSessionActive(): boolean {
  return active;
}

export function setDeckEditSessionActive(value: boolean): void {
  active = value;
}
