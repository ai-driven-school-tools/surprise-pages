import { z } from "zod";
import { AUTHORING_LAYOUTS, authorSlide } from "../authoring";
import { DECK_LIBRARY, librarySlideOperations } from "./library";
import type { DeckEditOperation } from "../edit/model";
import { defaultTranslate } from "../../i18n/default";
import type { Translate } from "../../i18n/translate";

// Explicitly reviewed authoring choices. New catalog entries stay out until their
// primary content can be edited in the browser; the full catalog remains intact.
const editableLibraryIds = new Set([
  "title", "editorial-cover-left", "editorial-cover-center", "editorial-cover-editorial",
  "editorial-cover-window", "editorial-cover-horizon", "composition-wide-margin",
  "composition-photo-bleed", "profile", "divider", "editorial-divider-center",
  "editorial-divider-number", "editorial-divider-split", "editorial-divider-photo",
  "composition-photo-panel", "composition-photo-rail", "message", "quote", "definition",
  "question", "qa", "agenda", "summary", "editorial-list-bullets", "editorial-list-numbered",
  "editorial-list-columns", "editorial-list-symbols", "editorial-list-image-top",
  "editorial-list-image-bottom", "editorial-list-image-rows", "editorial-list-image-feature",
  "editorial-list-photo-aside", "image-one", "composition-split-right", "composition-split-left",
  "composition-headline-top", "composition-headline-bottom", "composition-photo-strip",
  "composition-circle-crop", "image-two", "image-three", "image-many", "image-captioning",
  "image-treatment", "product", "screenshot", "process-images", "process-rows", "process-feature",
  "evidence", "table-plain", "table-roles-dates", "action", "video", "exercise", "reference",
]);

export type BrowserTemplate = {
  id: string;
  kind: "basic" | "library";
  name: string;
  category: string;
  /** What the group is for; the library cards inherit their group's line. */
  description: string;
  /** This one template's purpose, when it has its own. The basic layouts do; the
   * library names already say it and repeat nothing under the card. */
  summary: string | null;
  hasSampleImage: boolean;
};

export const BROWSER_TEMPLATES: readonly BrowserTemplate[] = [
  ...AUTHORING_LAYOUTS.map(item => ({id: item.id, kind: "basic", name: item.label, category: "basic", description: item.description, summary: item.description, hasSampleImage: item.id === "image"} satisfies BrowserTemplate)),
  ...DECK_LIBRARY.templates.filter(item => editableLibraryIds.has(item.id)).map(item => ({
    id: item.id, kind: "library", name: item.name, category: item.category, summary: null,
    hasSampleImage: item.html.includes('data-deck-sample-image'),
    description: DECK_LIBRARY.categories.find(group => group.id === item.category)?.description ?? "",
  } satisfies BrowserTemplate)),
];

export const BROWSER_TEMPLATE_CATEGORIES = [
  {id: "basic", name: defaultTranslate("decks.templates.basicName"), description: defaultTranslate("decks.templates.basicDescription")},
  ...DECK_LIBRARY.categories.filter(group => BROWSER_TEMPLATES.some(item => item.category === group.id)),
];

/** 分類の名前と説明を画面の言語で。基本の分類だけが辞書を持ち、見本集の分類は見本の原稿（生成物）の名前のまま出す。 */
/**
 * 型の名前と説明を、その人の言語で。基本の型は辞書の鍵（`AUTHORING_LAYOUTS` の labelKey）から引く。
 * 見本集の型（`DECK_LIBRARY`）の名前は見本の原稿と同じ生成物から来るので、そのまま出す。
 */
export function browserTemplateText(item: BrowserTemplate, t: Translate = defaultTranslate): {name: string; description: string; summary: string | null} {
  const layout = item.kind === "basic" ? AUTHORING_LAYOUTS.find(entry => entry.id === item.id) : undefined;
  if (!layout) return {name: item.name, description: item.description, summary: item.summary};
  const description = t(layout.descriptionKey);
  return {name: t(layout.labelKey), description, summary: description};
}

export function browserTemplateCategoryText(group: {id: string; name: string; description: string}, t: Translate = defaultTranslate): {name: string; description: string} {
  return group.id === "basic" ? {name: t("decks.templates.basicName"), description: t("decks.templates.basicDescription")} : {name: group.name, description: group.description};
}

export function browserTemplate(ref: {id: string; kind: string}) {
  return BROWSER_TEMPLATES.find(item => item.id === ref.id && item.kind === ref.kind);
}

export const browserTemplateSchema = z.object({
  kind: z.enum(["basic", "library"]), id: z.string().max(100),
}).strict().refine(ref => !!browserTemplate(ref), "ブラウザで編集できる見本を選んでください"); // i18n-keep: 内部の検証の文（作成と挿入の窓口は固定の断り文を返す）
export type BrowserTemplateRef = z.infer<typeof browserTemplateSchema>;

/** Creation and insertion share both validation and the complete settings bundle. */
export function browserSlideOperations(source: string, ref: BrowserTemplateRef, slideId: string, beforeId: string | null): DeckEditOperation[] {
  const selected = browserTemplateSchema.parse({id: ref.id, kind: ref.kind});
  return selected.kind === "library"
    ? librarySlideOperations(source, selected.id, slideId, beforeId)
    : [{kind: "fragment", target: slideId, parentId: "deck-root", beforeId, before: null, after: authorSlide(selected.id, slideId)}];
}
