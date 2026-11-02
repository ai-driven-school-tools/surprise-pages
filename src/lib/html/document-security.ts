import {PAGE_IMAGES_SCRIPT} from "../page-images/html";
import { themeStampSchema } from "../deck/design/theme-model";
import { createHash } from "node:crypto";
import {type DefaultTreeAdapterTypes} from "parse5";
import {sourceTree} from "./source-index";
import policy from "../../templates/document-policy.json";
import deckCompatibility from "../../templates/deck-preview-compat.json";
import { COMMENTS_WIDGET_BASE, VENDOR_STAMPS, vendorSrc, withVendorScripts } from "../pages/content";
import { isPersonalEdition, siteOrigin } from "../settings/site-settings";
import { DECK_APPEARANCE_MARK, DECK_DESIGN_MARK } from "../deck/design/design";
import { readDeckDesignHtml } from "../deck/design/html";
import { DECK_FOCUS_MARK, DECK_FOCUS_OVERRIDES_MARK } from "../deck/design/focus";
import { DECK_LOGO_MARK, DECK_LOGO_OVERRIDES_MARK } from "../deck/media/logo";
import { deckLogoAssetPaths, readDeckCustomizationHtml } from "../deck/edit/customization-html";
import { readDeckChartSource } from "../deck/design/chart-source";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError } from "../i18n/errors";
import type { MessageKey } from "../i18n/messages/types";
import type { Translate } from "../i18n/translate";
import type { HtmlScriptMode } from "../organization/settings";

function scriptText(node: DefaultTreeAdapterTypes.Node): string {
  return "childNodes" in node ? node.childNodes.map((one) => "value" in one ? one.value : "").join("") : "";
}
function walk(node: DefaultTreeAdapterTypes.Node, visit: (node: DefaultTreeAdapterTypes.Node) => void) {
  visit(node);
  if ("childNodes" in node) for (const child of node.childNodes) walk(child, visit);
  if ("content" in node) walk(node.content, visit);
}
const approved = new Set(policy.scripts.flatMap(text=>[text,withVendorScripts(`<script>${text}</script>`).slice(8,-9)]));
const legacyDeckScripts = new Set(deckCompatibility.scripts);
function approvedInline(text:string):boolean {
  const trimmed=text.trim();
  return approved.has(trimmed)||legacyDeckScripts.has(createHash("sha256").update(trimmed).digest("hex"));
}
export const DOCUMENT_POLICY_STAMP = createHash("sha256").update(JSON.stringify([policy, VENDOR_STAMPS, deckCompatibility])).digest("hex").slice(0, 12);
function approvedSource(src: string): boolean {
  const rewritten = withVendorScripts(`<script src="${src}"></script>`);
  return Object.keys(VENDOR_STAMPS).some((name) => rewritten === `<script src="${vendorSrc(name)}"></script>`);
}

/**
 * 投稿者が付けたscriptへ自動的に許可を与えない。原本から作った固定の許可表だけ使う。
 * 返すのは問題ごとの辞書の鍵（出すときに要求の言語で訳す。`UnsafeDocumentError`）。
 */
export function documentProblems(html: string): MessageKey[] {
  const problems = new Set<MessageKey>();
  let validDesign = false;
  try { validDesign = readDeckDesignHtml(html) !== null; }
  catch { problems.add("server.document.designInvalid"); }
  let validCustomizations = false;
  try { validCustomizations = readDeckCustomizationHtml(html) !== null; }
  catch { problems.add("server.document.customizationInvalid"); }
  walk(sourceTree(html), (node) => {
    if (!("attrs" in node)) return;
    const attrs = new Map(node.attrs.map((one) => [one.name, one.value]));
    if (["iframe", "object", "embed", "base", "form"].includes(node.nodeName)) problems.add("server.document.embeds");
    if (node.nodeName === "meta" && attrs.get("http-equiv")?.toLowerCase() === "refresh") problems.add("server.document.autoRedirect");
    for (const [name, value] of attrs) {
      if (name.startsWith("on") && !(name === "onclick" && value.trim() === "window.print()")) problems.add("server.document.eventHandlers");
      if (/^(?:href|src|action|formaction|xlink:href)$/.test(name) && /^\s*(?:javascript|vbscript):/i.test(value.replace(/[\u0000-\u0020]/g, ""))) problems.add("server.document.scriptLinks");
      if (name === "srcdoc") problems.add("server.document.srcdoc");
    }
    if (node.nodeName === "link" && attrs.get("rel")?.toLowerCase() === "stylesheet" && !attrs.get("href")?.startsWith("https://fonts.googleapis.com/")) problems.add("server.document.externalStyles");
    if (node.nodeName !== "script") return;
    const src = attrs.get("src");
    if(attrs.has("data-deck-theme")){
      try{if(attrs.get("type")!=="application/json"||src!==undefined||node.parentNode?.nodeName!=="head")throw new Error();themeStampSchema.parse(JSON.parse(scriptText(node)));}catch{problems.add("server.document.themeInvalid");}return;
    }
    if (attrs.has(DECK_DESIGN_MARK) || attrs.has(DECK_APPEARANCE_MARK)) {
      if (!validDesign || attrs.get("type") !== "application/json" || attrs.has("src") || node.parentNode?.nodeName !== "head") {
        problems.add("server.document.designPlacement");
      }
      return;
    }
    if ([DECK_FOCUS_MARK, DECK_FOCUS_OVERRIDES_MARK, DECK_LOGO_MARK, DECK_LOGO_OVERRIDES_MARK].some((mark) => attrs.has(mark))) {
      if (!validCustomizations || attrs.get("type") !== "application/json" || src !== undefined || node.parentNode?.nodeName !== "head") {
        problems.add("server.document.customizationPlacement");
      }
      return;
    }
    if (attrs.has("data-dd-chart-source") || attrs.has("data-dd-native-source")) {
      try {
        if (attrs.get("type") !== "application/json" || src !== undefined || node.parentNode?.nodeName !== "figure") throw new Error();
        const text = scriptText(node);
        if (attrs.has("data-dd-chart-source")) readDeckChartSource(text);
        else {
          const source: unknown = JSON.parse(text);
          if (typeof source !== "object" || source === null || !("kind" in source) ||
            !["set-overlap", "quadrant"].includes(String(source.kind))) throw new Error();
        }
      } catch { problems.add("server.document.chartSource"); }
      return;
    }
    if (src ? !approvedSource(src) : !approvedInline(scriptText(node))) problems.add("server.document.unapprovedScript");
  });
  return [...problems];
}

/**
 * 配布版で使えない書き方があった。窓口は 400 で返す（`src/lib/api.ts` の `serverError`）。
 * 鍵は最初の問題のもの。全部を 1 通にするのは `messageIn`（言語ごとの区切りでつなぐ）。
 * `message` は日本語の正本の文（ログは文面を残さないので言語で分けない）。
 */
export class UnsafeDocumentError extends LocalizedError {
  readonly problems: readonly MessageKey[];
  constructor(problems: readonly [MessageKey, ...MessageKey[]]) {
    super(problems[0]);
    this.name = "UnsafeDocumentError";
    this.problems = problems;
    this.message = this.messageIn(defaultTranslate);
  }
  /** 見つかった問題を全部、その言語の文で 1 通に。 */
  messageIn(t: Translate): string {
    return this.problems.map((key) => t(key)).join(t("server.document.separator"));
  }
}

/**
 * 仕掛けを確かめた許可表だけに絞るか。配布版はいつも絞る。社内版は組織の設定（仕掛け入りの HTML の扱い）で決まり、
 * `restricted` の組織では配布版と同じ保存時の検査と配信時の実行制限が効く。
 */
export function scriptsRestricted(mode: HtmlScriptMode): boolean {
  return isPersonalEdition() || mode === "restricted";
}

/**
 * 保存時の検査。絞る組織（と配布版）でだけ、許可表に無い仕掛けを断る。
 * 組織の設定（`mode`）は、許可表に無いものが見つかったときだけ聞く（仕掛けの無いページの投稿で組織の行を引かない）。
 */
export async function assertSafeDocument(html: string, mode: () => Promise<HtmlScriptMode>): Promise<void> {
  const [first, ...rest] = documentProblems(html);
  if (first === undefined) return;
  if (!isPersonalEdition() && !scriptsRestricted(await mode())) return;
  throw new UnsafeDocumentError([first, ...rest]);
}

/**
 * 配信時の扱い。`restricted` なら応答に実行制限（`documentPolicy`）を付ける。`blocked` は、保存された本文に
 * 許可表に無い仕掛けがあり、制限で止まること（社内版で絞る組織に切り替える前に保存されたページ）。上端に 1 行で知らせる。
 * 配布版は保存時に断っているので知らせない（配布版の振る舞いを変えない）。
 */
export type ScriptDelivery = {
  restricted: boolean;
  blocked: boolean;
  /** 実行制限に書く行き先の宛先（ブラウザが開いている宛先・src/lib/access/request-security.ts の requestOrigin）。配布版はサイトの宛先 */
  origin?: string;
};

export function scriptDeliveryFor(mode: HtmlScriptMode, storedHtml: string, origin?: string): ScriptDelivery {
  const restricted = scriptsRestricted(mode);
  return { restricted, blocked: restricted && !isPersonalEdition() && documentProblems(storedHtml).length > 0, origin };
}

const hash = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

/** 実際の空白を含むhashも、固定許可表と内容が一致した場合にだけ追加する。 */
export function documentPolicy(html: string, requestOrigin?: string): string {
  const hashes = new Set([...approved].map(hash));
  walk(sourceTree(html), (node) => {
    if (node.nodeName === "script" && "attrs" in node && !node.attrs.some((attr) => attr.name === "type" && attr.value === "application/json")) {
      const text = scriptText(node);
      if (approvedInline(text)) hashes.add(hash(text));
    }
  });
  // 配布版はサイトの宛先が 1 つ（設定の PAGES_SITE_URL）。社内版で仕掛けを絞る組織は宛先が組織ごとなので、開かれた宛先で書く
  const origin = isPersonalEdition() || requestOrigin === undefined ? siteOrigin() : requestOrigin;
  // 道具箱の入口は同じ階層の部品（`/comments-widget.js/comments-widget-chunk-*.js`）を読むので、入口 1 本ではなく置き場ごと許す
  // （CSP の行き先は末尾が `/` のときだけ前方一致になる）。置き場の中にあるのは組み立てた道具箱の部品だけ
  const scripts = [`${COMMENTS_WIDGET_BASE}/`, PAGE_IMAGES_SCRIPT, ...Object.keys(VENDOR_STAMPS).map(vendorSrc)].map((src) => `${origin}${src}`);
  return [
    "default-src 'none'", `script-src ${scripts.join(" ")} ${[...hashes].join(" ")} https://www.youtube.com`,
    `script-src-attr 'unsafe-hashes' ${hash("window.print()")}`,
    // 書体の指定（Google Fonts）は保存時の検査が通すもの（上の externalStyles）と同じ行き先だけ。本体は fonts.gstatic.com から届く
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "img-src 'self' data: blob:", "media-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com", "connect-src 'self'", "object-src 'none'", "frame-src 'self' blob: https://www.youtube-nocookie.com",
    "base-uri 'self'", "form-action 'none'", "frame-ancestors 'self'",
  ].join("; ");
}

/** 配布版の公開素材は、いまの本文が実際に参照するものだけを返す。 */
export function referencedAsset(html: string, rel: string): boolean {
  const base = "https://assets.invalid/page/";
  const wanted = new URL(rel, base).href;
  let found = false;
  const check = (value: string) => { try { if (new URL(value, base).href.split(/[?#]/)[0] === wanted) found = true; } catch { /* 壊れたURLは参照に数えない */ } };
  for (const path of deckLogoAssetPaths(html)) check(path);
  walk(sourceTree(html), (node) => {
    if (!("attrs" in node)) return;
    for (const attr of node.attrs) {
      if (["src", "href", "poster"].includes(attr.name)) check(attr.value);
      if (attr.name === "srcset") for (const entry of attr.value.split(",")) check(entry.trim().split(/\s+/)[0]);
      if (attr.name === "style") for (const match of attr.value.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)) check(match[1]);
    }
    if (node.nodeName === "style") for (const match of scriptText(node).matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)) check(match[1]);
  });
  return found;
}
