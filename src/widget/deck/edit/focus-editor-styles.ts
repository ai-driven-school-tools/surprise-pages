/**
 * スライドの焦点の編集画面の見た目（CSS の字）。
 * 道具箱の見た目（src/widget/shared/styles.ts）が最初から読むので、編集の部品本体から切り出してある（部品本体はスライドの設定と
 * 入力の確かめの部品を連れてくる・docs/design/app-speed.md）。
 */
export const DECK_FOCUS_EDITOR_STYLES = `
.deck-focus-workspace { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-top: var(--rule-thin) solid var(--border); }
.deck-focus-header, .deck-focus-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.deck-focus-header .deck-focus-field { width: 100%; }
.deck-focus-targets { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--space-2); }
.deck-focus-target { justify-content: flex-start; max-width: 100%; height: auto; min-height: var(--size-control); padding: var(--space-2) var(--space-3); border: var(--rule-thin) solid var(--border); border-radius: var(--radius-md); font-size: var(--font-sm); line-height: var(--leading-normal); text-align: left; white-space: normal; overflow-wrap: anywhere; }
.deck-focus-target[aria-pressed=true], .deck-focus-step-select[aria-current=true] { background: var(--accent-soft); color: var(--text); }
.deck-focus-steps { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-1); }
.deck-focus-step { padding-left: var(--space-1); }
.deck-focus-step-select { width: 100%; text-align: left; padding: var(--space-1); border-radius: var(--radius-sm); }
.deck-focus-add-row { list-style: none; margin-left: calc(var(--space-5) * -1); }
.deck-focus-inspector { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-3); border-top: var(--rule-thin) solid var(--border); }
.deck-focus-action-list { display: flex; flex-direction: column; gap: var(--space-1); }
.deck-focus-action-list > button { width: 100%; padding: var(--space-1) var(--space-2); text-align: left; border-radius: var(--radius-sm); }
.deck-focus-action-list > button[aria-current=true] { background: var(--accent-soft); }
.deck-focus-field { display: flex; align-items: start; justify-content: space-between; gap: var(--space-2); font-size: var(--font-base); }
.deck-focus-field > :last-child { max-width: 65%; }
.deck-focus-textarea { min-height: var(--size-control); width: 65%; padding: var(--space-2); color: var(--text); background: var(--surface); border: var(--rule-thin) solid var(--border); border-radius: var(--radius-sm); resize: vertical; }
.deck-focus-invalid { margin: 0; color: var(--danger); font-size: var(--font-sm); }
@media (max-width: 700px) {
  .deck-focus-workspace { padding: var(--space-3); }
  .deck-focus-target { width: 100%; min-height: var(--size-touch); }
  .deck-focus-field { flex-direction: column; }
  .deck-focus-field > :last-child, .deck-focus-textarea { width: 100%; max-width: 100%; }
}
`;
