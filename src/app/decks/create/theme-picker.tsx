'use client';

import { useState } from 'react';
import { DECK_PRESETS, appearanceColors, type DeckAppearance } from '@/lib/deck/design/design';
import { deckStyleText } from '@/lib/deck/design/style-options';
import type { MessageKey } from '@/lib/i18n/messages/types';
import { useT } from '../../_components/i18n';
import { deckBackground } from '@/lib/deck/design/background';
import type { MyTheme } from '@/lib/deck/design/theme-model';
import { Icon } from '../../_components/icons';
import { META, QUIET, ROW_TITLE } from '../../_components/styles';

type Category = 'standard' | 'mine';
const categories: { id: Category; label: MessageKey }[] = [
  { id: 'standard', label: 'decks.themePicker.standard' },
  { id: 'mine', label: 'decks.themePicker.mine' },
];

function ThemeChoice({ name, appearance, selected, locked, choose }: {
  name: string; appearance: DeckAppearance; selected: boolean; locked: boolean; choose: () => void;
}) {
  const t = useT();
  const background = deckBackground(appearance), colors = appearanceColors(appearance);
  // 作っている間は選び直せないが、選んだ姿は薄くしない（DESIGN.md 12 章）。押しても何も起きないことだけ伝える
  return <button type="button" aria-label={name} aria-pressed={selected} aria-disabled={locked || undefined} onClick={locked ? undefined : choose}
    className="group flex min-w-0 flex-col gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-wait">
    <span aria-hidden="true" className={`relative flex aspect-video w-full flex-col justify-center gap-2 overflow-hidden rounded-sm border border-neutral-200 p-2 dark:border-neutral-800 ${selected ? 'ring-2 ring-neutral-800 ring-offset-2 dark:ring-neutral-200 dark:ring-offset-neutral-950' : 'group-hover:ring-1 group-hover:ring-neutral-400'}`}
      style={{ backgroundColor: appearance.background, color: `rgb(${colors.text})` }}>
      <span className="absolute inset-0" style={{ backgroundImage: background.image, backgroundSize: background.size, backgroundRepeat: background.repeat, opacity: colors.opacity }} />
      <span className="relative h-1 w-6 shrink-0" style={{ backgroundColor: colors.accent }} />
      <span className="relative text-xs font-medium">{t('decks.themePicker.heading')}</span>
    </span>
    <span className={`flex w-full items-start justify-between gap-2 break-words ${ROW_TITLE}`}>
      <span className="min-w-0">{name}</span>
      {selected && <Icon name="check" small />}
    </span>
  </button>;
}

export function ThemePicker({ themeId, chosen, myThemes, waitingForTheme, loading, error, locked, choosePreset, chooseMine, retry, manage }: {
  themeId: string; chosen: MyTheme | null; myThemes: MyTheme[];
  waitingForTheme: boolean; loading: boolean; error: string; locked: boolean;
  choosePreset: (id: string) => void; chooseMine: (theme: MyTheme) => void; retry: () => void; manage: (theme: MyTheme) => void;
}) {
  const t = useT();
  const [category, setCategory] = useState<Category>(() => waitingForTheme || chosen ? 'mine' : 'standard');
  const presets = DECK_PRESETS.map(preset => ({ ...preset, name: deckStyleText(preset, t).name }));
  return <>
    <div role="group" aria-label={t('decks.themePicker.categories')} className="ws-segments mb-6">
      {categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id}
        onClick={() => setCategory(item.id)} className="ws-segment">
        {t(item.label)}
      </button>)}
    </div>
    {error && <div className="mb-4" role="status"><p className={META}>{error}</p><button type="button" className={QUIET} onClick={retry}>{t('decks.themePicker.retry')}</button></div>}
    {category === 'mine' ? <>
      {loading ? <p className={META}>{t('decks.themePicker.loading')}</p>
        : myThemes.length === 0 && !error && <div className="py-4"><p className={`${ROW_TITLE} mb-2`}>{t('decks.themePicker.empty')}</p><p className={META}>{t('decks.themePicker.emptyNote')}</p></div>}
      <div className="grid grid-cols-2 gap-4 p-1">
        {myThemes.map(theme => <ThemeChoice key={theme.id} name={theme.name} appearance={theme.snapshot.appearance}
          selected={chosen?.id === theme.id} locked={locked} choose={() => chooseMine(theme)} />)}
      </div>
      {chosen && <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className={META}>{chosen.snapshot.logo ? t('decks.themePicker.withLogo') : t('decks.themePicker.withoutLogo')}</span><button type="button" className={QUIET} aria-label={t('decks.themePicker.manageLabel', { name: chosen.name })} disabled={locked} onClick={() => manage(chosen)}>{t('decks.themePicker.manage')}</button></div>}
    </> : <div className={"grid grid-cols-2 gap-4 p-1 sm:grid-cols-3"}>
      {presets.map(theme => <ThemeChoice key={theme.id} name={theme.name} appearance={theme.appearance}
        selected={!chosen && themeId === theme.id} locked={locked} choose={() => choosePreset(theme.id)} />)}
    </div>}
  </>;
}
