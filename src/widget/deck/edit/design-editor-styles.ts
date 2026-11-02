/**
 * スライドの見た目の編集画面の見た目（CSS の字）。道具箱の見た目（src/widget/shared/styles.ts）が最初から読むので、編集の部品本体
 * （src/widget/deck/edit/design-editor.ts・HTML の読み取りを含む）から切り出してある（docs/design/app-speed.md の「道具箱の部品を分ける」）。
 */
import { DECK_FOCUS_EDITOR_STYLES } from "./focus-editor-styles";
import { DECK_LOGO_EDITOR_STYLES } from "./logo-editor-styles";

export const DECK_EDITOR_STYLES = `
${DECK_FOCUS_EDITOR_STYLES}
${DECK_LOGO_EDITOR_STYLES}
.deck-design-workspace { display: flex; flex: 1; min-height: 0; min-width: 0; }
.deck-design-workspace > .edit-frame { min-width: 0; }
.deck-design-list, .deck-design-inspector, .deck-design-mobile { display: none; }
.is-designing > .deck-design-list { display: flex; flex-direction: column; width: var(--size-bubble-max); flex: none; padding: var(--space-4); gap: var(--space-3); overflow-y: auto; }
.is-designing > .deck-design-inspector { display: flex; flex-direction: column; width: var(--size-popover); flex: none; padding: var(--space-5); gap: var(--space-4); overflow-y: auto; border-left: var(--rule-thin) solid var(--border); }
.deck-design-heading { margin: 0; font-size: var(--font-md); font-weight: var(--weight-bold); }
.deck-design-help { margin: 0; font-size: var(--font-sm); color: var(--muted); }
.deck-design-field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--font-base); }
.deck-design-field input[type=range] { min-width: 0; width: 50%; accent-color: var(--text); }
.deck-design-field input[type=checkbox] { width: var(--size-check); height: var(--size-check); accent-color: var(--text); }
.deck-design-input { font: inherit; min-width: 0; max-width: 65%; color: var(--text); background: var(--surface); padding: var(--space-2); border: var(--rule-thin) solid var(--border); border-radius: var(--radius-sm); }
.deck-design-presets { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
.deck-design-preset { padding: var(--space-1); border: var(--rule-thin) solid transparent; text-align: left; border-radius: var(--radius-sm); font-size: var(--font-sm); }
.deck-design-preset[aria-pressed=true] { border-color: var(--text); }
.deck-design-preset-swatch { display: block; aspect-ratio: 16/9; margin-bottom: var(--space-1); border-radius: var(--radius-sm); }
.deck-design-preset-swatch, .deck-design-slide-paper { position: relative; isolation: isolate; overflow: hidden; }
.deck-design-preset-swatch::before, .deck-design-slide-paper::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background-image: var(--dd-preview-image); background-size: var(--dd-preview-size); background-repeat: var(--dd-preview-repeat); background-position: 50% 50%; opacity: var(--dd-preview-opacity); }
.deck-design-slide { width: 100%; text-align: left; padding: var(--space-1); border: var(--rule-thin) solid transparent; }
.deck-design-slide[aria-current=true] { border-color: var(--text); }
.deck-design-slide-paper { display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 16/9; padding: var(--space-3); font-size: var(--font-sm); font-weight: var(--weight-medium); overflow: hidden; }
.deck-design-slide-number { font-size: var(--font-xs); font-weight: var(--weight-normal); }
.deck-design-colors { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
.deck-design-colors .deck-design-field { flex-direction: column; align-items: start; }
.deck-design-colors input { height: var(--size-control); width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.deck-design-advanced-title { cursor: pointer; font-size: var(--font-sm); color: var(--muted); }
.deck-design-advanced-controls { display: flex; flex-direction: column; gap: var(--space-4); padding-top: var(--space-4); }
.deck-design-files { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-4); }
.deck-design-panel-tabs { display: flex; gap: var(--space-1); border-bottom: var(--rule-thin) solid var(--border); }
.deck-design-panel-tab { padding: var(--space-2); color: var(--muted); border-bottom: var(--rule-thick) solid transparent; }
.deck-design-panel-tab[aria-pressed=true] { color: var(--text); border-bottom-color: var(--accent); }
.deck-design-workspace button:focus-visible, .deck-design-workspace input:focus-visible, .deck-design-workspace select:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: var(--space-1); }
@media (max-width: 1000px) {
  .is-designing > .deck-design-list { width: var(--size-input-min); padding: var(--space-2); }
  .deck-design-slide-paper { padding: var(--space-1); }
  .deck-design-slide-paper > span:not(.deck-design-slide-number) { display: none; }
  .edit-bar { flex-wrap: wrap; }
  .edit-title { max-width: 45%; }
  .edit-message { display: none; }
}
@media (max-width: 700px) {
  .is-designing > .deck-design-list { display: none; }
  .is-designing > .deck-design-inspector { display: none; }
  .is-designing > .deck-design-mobile { display: block; position: absolute; right: var(--space-3); bottom: var(--space-3); z-index: 2; background: var(--surface); }
  .is-designing.is-inspector-open > .deck-design-inspector { display: flex; position: absolute; inset: auto 0 0; width: 100%; max-height: 65%; padding-bottom: var(--size-input-min); background: var(--surface); border-top: var(--rule-thin) solid var(--border); z-index: 1; }
  .edit-count { display: none; }
}
`;
