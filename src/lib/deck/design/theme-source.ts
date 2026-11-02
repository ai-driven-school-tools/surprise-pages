import { stockDesign, isStockDesign } from "./stock-design";
import { deckStyleName } from "./style-options";
import { effectiveAppearance, deckDesignSchema, deckOverridesSchema, emptyOverrides } from './design';
import { DEFAULT_LOGO_PRESENTATION, deckLogoSchema, deckLogoOverridesSchema, emptyLogoOverrides } from '../media/logo';
import { deckSourceSetting } from '../edit/source';
import { themeStampSchema, type ThemeSnapshot, type ThemeStamp } from './theme-model';
import type { DeckEditOperation } from '../edit/model';
import { LocalizedError } from '../../i18n/errors';
import type { Translate } from '../../i18n/translate';

export const emptyDeckLogo = () => ({version:1,asset:null,document:{...DEFAULT_LOGO_PRESENTATION},slides:{}});
export function documentTheme(source:string):ThemeSnapshot {
  const design=deckSourceSetting(source,'design-source');
  if(!design)throw new LocalizedError('decks.errors.themeNotSaveable');
  const appearance=deckSourceSetting(source,'appearance');
  const logo=deckSourceSetting(source,'logo-source'),overrides=deckSourceSetting(source,'logo');
  const authored=deckLogoSchema.parse(logo?JSON.parse(logo):emptyDeckLogo());
  const saved=overrides?deckLogoOverridesSchema.parse(JSON.parse(overrides)):emptyLogoOverrides();
  const asset=saved.asset===undefined?authored.asset:saved.asset;
  return {appearance:effectiveAppearance(deckDesignSchema.parse(JSON.parse(design)),appearance?deckOverridesSchema.parse(JSON.parse(appearance)):emptyOverrides()),
    logo:asset?{asset,layouts:saved.layouts ?? authored.layouts,presentation:{...authored.document,...saved.document}}:null};
}
/** Every typography the embedded design runtime loads for this source (the whole deck and each slide that differs). */
export function deckSourceTypographies(source:string):string[] {
  const design=deckSourceSetting(source,'design-source');if(!design)return [];
  const appearance=deckSourceSetting(source,'appearance');
  try {
    const authored=deckDesignSchema.parse(JSON.parse(design)),saved=appearance?deckOverridesSchema.parse(JSON.parse(appearance)):emptyOverrides();
    const ids=new Set([...Object.keys(authored.slides),...Object.keys(saved.slides)]);
    return [...new Set([undefined,...ids].map(id=>effectiveAppearance(authored,saved,id).typography).filter(value=>value!==undefined))];
  } catch { return []; } // The runtime reports a broken setting itself; there is nothing to load ahead.
}
export function themeOperations(source:string,snapshot:ThemeSnapshot,stamp:ThemeStamp):DeckEditOperation[] {
  const beforeAppearance=deckSourceSetting(source,'appearance'),beforeLogo=deckSourceSetting(source,'logo');
  const appearance=beforeAppearance?deckOverridesSchema.parse(JSON.parse(beforeAppearance)):emptyOverrides();
  const logo=beforeLogo?deckLogoOverridesSchema.parse(JSON.parse(beforeLogo)):emptyLogoOverrides();
  const roleDefaults = snapshot.logo?.layouts ?? (logo.layouts !== undefined || deckSourceSetting(source,"design-runtime")?.includes("data-deck-logo-layouts") ? {} : undefined);
  const operations:DeckEditOperation[]=[];
  if (snapshot.logo?.layouts || snapshot.logo?.asset.mark) {
    for (const name of ["design-style", "design-runtime"] as const) {
      const before = deckSourceSetting(source,name), after = stockDesign[name];
      if (before === after) continue;
      if (before === null || !isStockDesign(name,before)) throw new LocalizedError("decks.errors.themeCustomRuntime");
      operations.push({kind:"setting",target:"deck-document",name,before,after});
    }
  }
  if(!deckSourceSetting(source,'logo-source'))operations.push({kind:'setting',target:'deck-document',name:'logo-source',before:null,after:JSON.stringify(emptyDeckLogo())});
  operations.push(
    {kind:'setting',target:'deck-document',name:'appearance',before:beforeAppearance,after:JSON.stringify({...appearance,document:snapshot.appearance})},
    {kind:'setting',target:'deck-document',name:'logo',before:beforeLogo,after:JSON.stringify({...logo,asset:snapshot.logo?.asset??null,layouts:roleDefaults,document:snapshot.logo?.presentation??DEFAULT_LOGO_PRESENTATION})},
    {kind:'setting',target:'deck-document',name:'theme',before:deckSourceSetting(source,'theme'),after:JSON.stringify(stamp)},
  );return operations;
}
/** 資料のテーマの名前。保存したテーマ・会社テーマの名前は固有名なので訳さず、完成スタイルとカスタムだけ `t` の言語で出す。 */
export function documentThemeName(source:string,t?:Translate):string {
  const value=deckSourceSetting(source,'theme');
  if(value){const parsed=themeStampSchema.safeParse(JSON.parse(value));if(parsed.success)return parsed.data.name;}
  return deckStyleName(documentTheme(source).appearance,t);
}
