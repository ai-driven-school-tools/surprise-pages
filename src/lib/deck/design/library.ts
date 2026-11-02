import library from './library.generated.json';
import { LocalizedError } from '../../i18n/errors';
import { prepareAuthoringFragment } from '../authoring';
import { deckSourceSetting } from '../edit/source';
import { deckFocusSchema } from './focus';
import type { DeckEditOperation } from '../edit/model';

export const DECK_LIBRARY = library;
export type DeckLibraryTemplate = typeof library.templates[number];

/** Focus identities are slide-local; only the containing slide identity changes. */
export function authorLibrarySlide(templateId: string, slideId: string) {
  const template = library.templates.find(item => item.id === templateId);
  if (!template) throw new LocalizedError('deckEditor.library.notFound');
  const html = prepareAuthoringFragment(template.html
    .replace(`id="${template.id}"`, `id="${slideId}"`)
    .replace(`data-deck-id="${template.id}"`, `data-deck-id="${slideId}" data-deck-node="${slideId}"`), slideId);
  const focus = deckFocusSchema.parse({version:1, guidedByDefault:true, slides:{[slideId]:template.focus}});
  for (const step of focus.slides[slideId].steps)
    for (const action of step.actions)
      for (const target of action.targets) target.slideId = slideId;
  return {html, focus:focus.slides[slideId]};
}

export function librarySlideOperations(source: string, templateId: string, slideId: string, beforeId: string | null): DeckEditOperation[] {
  const sample = authorLibrarySlide(templateId, slideId);
  const before = deckSourceSetting(source, 'focus-source');
  const focus = deckFocusSchema.parse(before ? JSON.parse(before) : {version:1, guidedByDefault:true, slides:{}});
  focus.slides[slideId] = sample.focus;
  const ops: DeckEditOperation[] = [
    {kind:'fragment',target:slideId,parentId:'deck-root',beforeId,before:null,after:sample.html},
    {kind:'setting',target:'deck-document',name:'focus-source',before,after:JSON.stringify(focus)},
  ];
  if (sample.html.includes('data-dd-mermaid-diagram') && !source.includes(library.diagramKit) && deckSourceSetting(source,'diagram-library') === null)
    ops.push({kind:'setting',target:'deck-document',name:'diagram-library',before:null,after:'mermaid'});
  return ops;
}
