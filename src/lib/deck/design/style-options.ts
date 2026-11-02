import { DECK_PRESETS, type DeckAppearance } from './design';
import { defaultTranslate } from '../../i18n/default';
import type { MessageKey } from '../../i18n/messages/types';
import type { Translate } from '../../i18n/translate';

/** Shared visual choices. Appearance-only controls preserve the current logo. */
export const DECK_STYLE_OPTIONS = [...DECK_PRESETS];

/**
 * 完成スタイルの表示名（多言語対応・docs/guides/i18n.md）。`DECK_PRESETS` の名前は配布用の設定（src/templates/deck-styles.json）と
 * 保存済みの資料に日本語で残るので変えず、画面に出すときだけ目印から辞書を引く。会社テーマの名前は台帳の固有名なので訳さない。
 */
const PRESET_TEXT: ReadonlyMap<string, { name: MessageKey; description: MessageKey }> = new Map([
  ['paper', { name: 'decks.presets.paper.name', description: 'decks.presets.paper.description' }],
  ['ink', { name: 'decks.presets.ink.name', description: 'decks.presets.ink.description' }],
  ['indigo', { name: 'decks.presets.indigo.name', description: 'decks.presets.indigo.description' }],
  ['forest', { name: 'decks.presets.forest.name', description: 'decks.presets.forest.description' }],
  ['sunset', { name: 'decks.presets.sunset.name', description: 'decks.presets.sunset.description' }],
  ['aurora', { name: 'decks.presets.aurora.name', description: 'decks.presets.aurora.description' }],
  ['pearl', { name: 'decks.presets.pearl.name', description: 'decks.presets.pearl.description' }],
  ['lilac', { name: 'decks.presets.lilac.name', description: 'decks.presets.lilac.description' }],
  ['glacier', { name: 'decks.presets.glacier.name', description: 'decks.presets.glacier.description' }],
  ['twilight', { name: 'decks.presets.twilight.name', description: 'decks.presets.twilight.description' }],
  ['haze', { name: 'decks.presets.haze.name', description: 'decks.presets.haze.description' }],
  ['shore', { name: 'decks.presets.shore.name', description: 'decks.presets.shore.description' }],
]);

/** 完成スタイル・会社テーマの、画面に出す名前と説明。 */
export function deckStyleText(style: { id: string; name: string; description: string }, t: Translate = defaultTranslate): { name: string; description: string } {
  const keys = PRESET_TEXT.get(style.id);
  return keys ? { name: t(keys.name), description: t(keys.description) } : { name: style.name, description: style.description };
}

export function deckStyleName(appearance: DeckAppearance, t: Translate = defaultTranslate): string {
  const key = (value: DeckAppearance) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const found = DECK_STYLE_OPTIONS.find(style => key(style.appearance) === key(appearance));
  return found ? deckStyleText(found, t).name : t('decks.style.custom');
}

const DECORATION_KEYS: Readonly<Record<DeckAppearance['decoration'], MessageKey>> = {
  none: 'decks.decoration.none', gradient: 'decks.decoration.gradient', glow: 'decks.decoration.glow',
  grid: 'decks.decoration.grid', wave: 'decks.decoration.wave', diagonal: 'decks.decoration.diagonal',
};
/** 背景のあしらいの表示名（`DECORATIONS` の値から引く）。 */
export function decorationLabel(value: DeckAppearance['decoration'], t: Translate = defaultTranslate): string {
  return t(DECORATION_KEYS[value]);
}

const ORNAMENT_KEYS: Readonly<Record<NonNullable<DeckAppearance['ornament']>, MessageKey>> = {
  none: 'decks.ornament.none', rule: 'decks.ornament.rule', corner: 'decks.ornament.corner', school: 'decks.ornament.school',
};
/** 見出しのあしらいの選択肢（並びは画面の順）。 */
export const DECK_ORNAMENT_IDS = ['none', 'rule', 'corner', 'school'] as const;
export function ornamentLabel(value: NonNullable<DeckAppearance['ornament']>, t: Translate = defaultTranslate): string {
  return t(ORNAMENT_KEYS[value]);
}

const TYPOGRAPHY_KEYS: ReadonlyMap<string, MessageKey> = new Map([
  ['system', 'decks.typography.system'], ['modern', 'decks.typography.modern'], ['soft', 'decks.typography.soft'],
  ['editorial', 'decks.typography.editorial'], ['school', 'decks.typography.school'],
]);
/** 書体の表示名（`DECK_TYPOGRAPHIES` の名前は実行部に束ねられるので、画面では目印から引く）。 */
export function typographyLabel(item: { id: string; name: string }, t: Translate = defaultTranslate): string {
  const key = TYPOGRAPHY_KEYS.get(item.id);
  return key ? t(key) : item.name;
}
