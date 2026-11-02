/**
 * スライドのロゴの編集画面の見た目（CSS の字）。
 * 道具箱の見た目（src/widget/shared/styles.ts）が最初から読むので、編集の部品本体から切り出してある（部品本体はスライドの設定と
 * 入力の確かめの部品を連れてくる・docs/design/app-speed.md）。
 */
export const DECK_LOGO_EDITOR_STYLES = `
.deck-logo-workspace { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-top: var(--rule-thin) solid var(--border); }
.deck-logo-file { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.deck-logo-files { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-2); }
.deck-logo-warning { margin: 0; color: var(--danger); font-size: var(--font-sm); line-height: var(--leading-normal); }
`;
