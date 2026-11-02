import { emptyDeckLogo, themeOperations } from "./design/theme-source";
import type { ThemeSnapshot, ThemeStamp } from "./design/theme-model";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { escapeDeckText } from "./authoring";
import { DECK_PRESETS } from "./design/design";
import { deckCreateOptionsSchema } from "./create-model";
import { browserSlideOperations } from "./design/browser-templates";
import { applyDeckEditOperations, prepareDeckEdit } from "./edit/source";

/** New documents embed exactly the same runtime and design bundle as published decks. */
export async function newDeckDocument(options: unknown = {}, resolved?: {snapshot:ThemeSnapshot;stamp:ThemeStamp}): Promise<string> {
  const selected = deckCreateOptionsSchema.parse(options);
  if(selected.myTheme&&!resolved)throw new Error("マイテーマを確認してください"); // i18n-keep: 内部の前提の確認（作成の窓口が先にテーマを解決するので画面には届かない）
  const [runtime, design] = await Promise.all([
    readFile(join(process.cwd(), "src/templates/deck.html"), "utf8"),
    readFile(join(process.cwd(), "src/templates/deck-design.html"), "utf8"),
  ]);
  const setting = JSON.stringify({
    version: 1,
    document: DECK_PRESETS.find(theme => theme.id === selected.themeId)!.appearance,
    slides: {},
  });
  let source = prepareDeckEdit(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeDeckText(selected.title)}</title><script type="application/json" data-deck-design>${setting}</script><script type="application/json" data-deck-logo>${JSON.stringify(emptyDeckLogo())}</script>${design}${runtime}</head><body data-deck><main data-deck-slides></main></body></html>`).html;
  if(resolved)source=applyDeckEditOperations(source,themeOperations(source,resolved.snapshot,resolved.stamp)).html;
  return selected.firstSlide === null ? source : applyDeckEditOperations(source, browserSlideOperations(source, selected.firstSlide, "opening", null)).html;
}
