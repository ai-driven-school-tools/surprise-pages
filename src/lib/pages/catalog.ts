import {sourceTree} from "../html/source-index";
import { logEvent } from "../logging/server-log";
import { orgDb } from "../db/database";
import type { StoredPage } from "./store";

export const CLASSIFIER_VERSION = 1;
export type DocumentKind = "deck" | "document" | "page" | "unknown";
export function classifyDocument(
  html: string,
): Exclude<DocumentKind, "unknown"> {
  const root = sourceTree(html);
  let deck = false;
  let document = false;
  function walk(node: typeof root | (typeof root.childNodes)[number]): void {
    if ("tagName" in node) {
      if (
        node.tagName === "body" &&
        node.attrs.some((a) => a.name === "data-deck")
      )
        deck = true;
      if (
        node.attrs.some(
          (a) =>
            a.name === "data-clean-copy-document" ||
            a.name === "data-clean-copy-source-id",
        )
      )
        document = true;
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  }
  walk(root);
  return deck ? "deck" : document ? "document" : "page";
}
/** Derived data must never turn a committed document into a reported save failure. */
export async function indexDocument(
  page: StoredPage,
  versionId: string,
  html: string,
): Promise<boolean> {
  try {
    const { error } = await orgDb(page.organization)
      .from("page_catalog")
      .upsert(
        {
          page_id: page.id,
          version_id: versionId,
          classifier_version: CLASSIFIER_VERSION,
          kind: classifyDocument(html),
        },
        { onConflict: "organization_id,page_id,version_id,classifier_version" },
      );
    if (error)
      logEvent({ level: "warn", event: "catalog.update-failed" });
    return error === null;
  } catch {
    logEvent({ level: "warn", event: "catalog.update-failed" });
    return false;
  }
}
