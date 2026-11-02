import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { agentElements } from "./source";
import { assetKey, readArchivedAsset, assetContentType } from "../pages/assets";
import { pageRefOf, type StoredPage } from "../pages/store";
import { DECK_LOGO_ASSET_PREFIX } from "../deck/media/logo";
import { deckLogoAssetPaths } from "../deck/edit/customization-html";
import { DECK_EDIT_ASSET_PREFIX, deckMediaAssetPath } from "../deck/edit/assets";
import { LocalizedError } from "../i18n/errors";

/** 過去の版を戻せない理由。文は辞書の鍵で持ち、窓口が要求の言語で訳す。 */
export class RestoredAssetError extends LocalizedError {}
const immutable = (src: string) =>
  src.startsWith(DECK_EDIT_ASSET_PREFIX) ||
  src.startsWith(DECK_LOGO_ASSET_PREFIX);
export function restoreAssetReferences(html: string): string[] {
  const refs = new Set<string>();
  for (const node of agentElements(html))
    for (const attr of node.attrs) {
      if (attr.name === "srcset" && attr.value)
        throw new RestoredAssetError(
          "toolbox.agent.restoreAssets.srcset",
        );
    }
  const styles = agentElements(html).flatMap((node) => [
    ...node.attrs
      .filter((attr) => attr.name === "style")
      .map((attr) => attr.value),
    ...(node.tagName === "style"
      ? [
          node.childNodes
            .map((child) => ("value" in child ? child.value : ""))
            .join(""),
        ]
      : []),
  ]);
  for (const css of styles)
    for (const value of css.matchAll(/url\(\s*["']?([^)"']+)/gi))
      if (!/^(?:data:|https:\/\/|#|\/vendor\/)/.test(value[1]))
        throw new RestoredAssetError(
          "toolbox.agent.restoreAssets.background",
        );
  if (deckLogoAssetPaths(html).some((path) => !immutable(path)))
    throw new RestoredAssetError(
      "toolbox.agent.restoreAssets.logo",
    );

  for (const node of agentElements(html))
    for (const attr of node.attrs) {
      if (!["src", "poster"].includes(attr.name)) continue;
      if (
        ["img", "video", "source", "track"].includes(node.tagName) &&
        attr.value &&
        /^(?:[a-z]+:|\/)/i.test(attr.value) &&
        !attr.value.startsWith("data:")
      )
        throw new RestoredAssetError(
          "toolbox.agent.restoreAssets.external",
        );
      if (
        attr.value &&
        !/^(?:[a-z]+:|\/|#)/i.test(attr.value) &&
        !immutable(attr.value)
      )
        refs.add(attr.value);
    }
  return [...refs];
}
export async function freezeRestoredAssets(
  page: StoredPage,
  html: string,
  versionId: string,
): Promise<Record<string, string>> {
  const ref = pageRefOf(page.pageSlug)!;
  const mapping: Record<string, string> = {};
  for (const src of restoreAssetReferences(html)) {
    const hit = await readArchivedAsset(
      page.organization,
      ref.slugPrefix,
      ref.slug,
      versionId,
      src.split("/"),
      undefined,
      false,
    );
    if (!hit)
      throw new RestoredAssetError(
        "toolbox.agent.restoreAssets.unreadable",
      );
    const extension = src.split(".").at(-1)!;
    const path = deckMediaAssetPath(randomUUID(),extension.toLowerCase());
    await put(
      assetKey(page.organization, ref.slugPrefix, [...ref.slug, ...path.split("/")]),
      await hit.open(null, AbortSignal.timeout(120000)),
      {
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false,
        contentType: assetContentType(src) ?? "application/octet-stream",
      },
    );
    mapping[src] = path;
  }
  return mapping;
}
export function restoredAssetHtml(
  html: string,
  mapping: Readonly<Record<string, string>>,
): string {
  const patches: { start: number; end: number; value: string }[] = [];
  for (const node of agentElements(html))
    for (const attr of node.attrs) {
      const value = mapping[attr.value],
        loc = node.sourceCodeLocation?.attrs?.[attr.name];
      if (!value || !loc || !["src", "poster"].includes(attr.name)) continue;
      patches.push({
        start: loc.startOffset,
        end: loc.endOffset,
        value: `${attr.name}="${value}"`,
      });
    }
  for (const patch of patches.sort((a, b) => b.start - a.start))
    html = html.slice(0, patch.start) + patch.value + html.slice(patch.end);
  return html;
}
