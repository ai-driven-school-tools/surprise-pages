import { readDeckDesignHtml } from "../deck/design/html";
import { DECK_PRESETS } from "../deck/design/design";
import {type DefaultTreeAdapterMap} from "parse5";
import {sourceTree} from "../html/source-index";
import { createHash } from "node:crypto";
import {
  prepareDeckEdit,
  deckSourceFragment,
  deckSourceChildren,
  deckSourceSetting,
  sourceText,
  deckOperationValue,
  applyDeckEditOperations,
} from "../deck/edit/source";
import { isDeckHtml } from "../deck/deck";
import { requestTranslate, rt } from "../i18n/request";
import {
  deckEditStylePropertySchema,
  type DeckEditOperation,
} from "../deck/edit/model";
import type { AgentRequest } from "./model";
import { readDeckChartSource } from "../deck/design/chart-source";
import { findHtmlIssues, addedIssues, describeIssues } from "../html/check";

type Element = DefaultTreeAdapterMap["element"];
export const agentDigest = (html: string): string =>
  createHash("sha256").update(html).digest("hex");
export function agentElements(html: string): Element[] {
  const result: Element[] = [];
  const walk = (node: DefaultTreeAdapterMap["node"]): void => {
    if ("tagName" in node) result.push(node);
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(sourceTree(html));
  return result;
}
export const agentAttr = (node: Element, name: string): string | undefined =>
  node.attrs.find((item) => item.name === name)?.value;
export function readAgentDocument(
  html: string,
  request: Pick<AgentRequest, "view" | "target" | "query" | "offset" | "limit">,
) {
  const title = sourceText(
    agentElements(html).find((node) => node.tagName === "title") ?? sourceTree(""),
  );
  if (!isDeckHtml(html))
    return {
      format: "page",
      title,
      editable: false,
      reason: rt("toolbox.agent.pageNotEditable"),
      sections: agentElements(html)
        .filter((node) => /^h[1-6]$/.test(node.tagName))
        .map((node) => sourceText(node))
        .slice(request.offset, request.offset + request.limit),
    };
  if (request.view === "design") {
    const settings = readDeckDesignHtml(html);
    return {
      format: "deck",
      design: settings?.design ?? null,
      overrides: settings?.overrides ?? null,
      presets: settings
        ? DECK_PRESETS.map((preset) => ({
            id: preset.id,
            name: preset.name,
            appearance: preset.appearance,
          }))
        : [],
      editable: settings !== null,
    };
  }
  const prepared = prepareDeckEdit(html),
    elements = agentElements(prepared.html);
  const slides = prepared.nodes.filter(
    (node) =>
      node.tag === "section" &&
      elements.some(
        (el) =>
          agentAttr(el, "data-deck-node") === node.id &&
          agentAttr(el, "data-deck-slide") !== undefined,
      ),
  );
  const items = slides
    .map((slide, index) => {
      const children = prepared.nodes.filter(
        (node) => node.slideId === slide.id,
      );
      return {
        id: slide.id,
        number: index + 1,
        title:
          children
            .find((node) => /^h[1-6]$/.test(node.tag))
            ?.textRuns.map((run) => run.text)
            .join("") || rt("toolbox.agentReview.slide", { number: index + 1 }),
        elements: children.length,
      };
    })
    .filter(
      (item) =>
        !request.query ||
        item.title
          .toLocaleLowerCase()
          .includes(request.query.toLocaleLowerCase()),
    );
  if (request.view === "overview")
    return {
      format: "deck",
      title,
      total: slides.length,
      slides: items.slice(request.offset, request.offset + request.limit),
      nextOffset:
        request.offset + request.limit < items.length
          ? request.offset + request.limit
          : null,
      capabilities: [
        "text",
        "style",
        "image",
        "attribute",
        "insert",
        "fragment",
        "order",
        "move",
        "outline-move",
        "notes",
        "chart-value",
        "setting-field",
      ],
      rootOrder: deckSourceChildren(prepared.html, "deck-root"),
    };
  if (!request.target) throw new Error("対象の枚または要素を指定してください"); // i18n-keep: 内部の歯止め（窓口が先に断るので画面に届かない）
  if (request.view === "source")
    return {
      format: "deck",
      source: deckSourceFragment(prepared.html, request.target),
    };
  const selected = prepared.nodes.filter(
    (node) => node.id === request.target || node.slideId === request.target,
  );
  const nodes = selected
    .slice(request.offset, request.offset + request.limit)
    .map((node) => {
      const element = elements.find(
        (el) => agentAttr(el, "data-deck-node") === node.id,
      )!;
      const chart = agentAttr(element, "data-deck-basic-chart");
      const script = element.childNodes.find(
        (child): child is Element =>
          "tagName" in child &&
          agentAttr(child, "data-dd-chart-source") !== undefined,
      );
      const raw = script?.childNodes
        .map((child) => ("value" in child ? child.value : ""))
        .join("");
      const source = deckSourceFragment(prepared.html, node.id);
      return {
        ...node,
        parentId: source?.parentId,
        className: agentAttr(element, "class"),
        layout: agentAttr(element, "data-dd-layout"),
        locked: agentAttr(element, "data-deck-locked") === "true",
        capabilities: [
          ...(node.textRuns.length ? ["text"] : []),
          "style",
          "attribute",
          ...(node.tag === "img" ? ["image"] : []),
          ...(node.created ? ["remove"] : []),
          ...(chart ? ["chart-value"] : []),
          ...(node.tag === "section" ? ["notes", "order", "fragment"] : []),
        ],
        ...(raw && chart
          ? { chart: { kind: chart, data: readDeckChartSource(raw) } }
          : {}),
        ...(node.tag === "section"
          ? {
              notes: deckOperationValue(prepared.html, {
                kind: "notes",
                target: node.id,
                before: "",
                after: "",
              }),
            }
          : {}),
      };
    });
  return {
    format: "deck",
    styleProperties: deckEditStylePropertySchema.options,
    nodes,
    total: selected.length,
    nextOffset:
      request.offset + request.limit < selected.length
        ? request.offset + request.limit
        : null,
    appearance: JSON.parse(
      deckSourceSetting(prepared.html, "appearance") ?? "{}",
    ),
  };
}
export function affectedAgentSlides(before: string, after: string): string[] {
  const a = prepareDeckEdit(before),
    b = prepareDeckEdit(after);
  const ids = new Set(
    [...a.nodes, ...b.nodes]
      .filter((node) => node.tag === "section")
      .map((node) => node.slideId),
  );
  const settingsChanged = (
    [
      "appearance",
      "focus",
      "logo",
      "design-source",
      "focus-source",
      "logo-source",
    ] satisfies Array<Parameters<typeof deckSourceSetting>[1]>
  ).some(
    (name) =>
      deckSourceSetting(before, name) !== deckSourceSetting(after, name),
  );
  const aOrder = [...ids].filter((id) =>
      a.nodes.some((node) => node.id === id),
    ),
    bOrder = b.nodes
      .filter((node) => node.tag === "section")
      .map((node) => node.id);
  return [...ids].filter(
    (id) =>
      settingsChanged ||
      aOrder.indexOf(id) !== bOrder.indexOf(id) ||
      deckSourceFragment(a.html, id)?.html !==
        deckSourceFragment(b.html, id)?.html,
  );
}
export function agentConflicts(
  html: string,
  operations: readonly DeckEditOperation[],
) {
  const prepared = prepareDeckEdit(html).html;
  return operations
    .filter(
      (op) =>
        "before" in op &&
        JSON.stringify(deckOperationValue(prepared, op)) !==
          JSON.stringify(op.before),
    )
    .map((op) => ({
      target: op.target,
      kind: op.kind,
      before: "before" in op ? op.before : null,
      current: deckOperationValue(prepared, op) ?? null,
      proposed: "after" in op ? op.after : null,
    }));
}
export function inspectAgentChange(before: string, after: string): string[] {
  const issues = addedIssues(findHtmlIssues(before), findHtmlIssues(after));
  return issues.length ? [describeIssues(issues, requestTranslate())] : [];
}
/** Import only explicitly selected, matching identities. Never infer identity from position. */
export function agentImportOperations(
  before: string,
  incoming: string,
  targets: readonly string[],
): { operations: DeckEditOperation[]; unresolved: string[] } {
  const original = prepareDeckEdit(before),
    next = prepareDeckEdit(incoming);
  const operations: DeckEditOperation[] = [];
  const unresolved: string[] = [];
  for (const id of targets) {
    const a = original.nodes.find((node) => node.id === id),
      b = next.nodes.find((node) => node.id === id);
    if (!a || !b || a.tag !== b.tag) {
      unresolved.push(rt("toolbox.agent.unresolved.missing", { id }));
      continue;
    }
    const beforeFragment = deckSourceFragment(original.html, id),
      afterFragment = deckSourceFragment(next.html, id);
    if (
      !beforeFragment ||
      !afterFragment ||
      beforeFragment.parentId !== afterFragment.parentId
    ) {
      unresolved.push(rt("toolbox.agent.unresolved.moved", { id }));
      continue;
    }
    if (beforeFragment.html === afterFragment.html) continue;
    const op: DeckEditOperation = {
      kind: "fragment",
      target: id,
      parentId: beforeFragment.parentId,
      beforeId: beforeFragment.beforeId,
      before: beforeFragment.html,
      after: afterFragment.html,
    };
    try {
      applyDeckEditOperations(original.html, [op]);
      operations.push(op);
    } catch {
      unresolved.push(rt("toolbox.agent.unresolved.unsupported", { id }));
    }
  }
  return { operations, unresolved };
}

export function agentScopeDigest(
  before: string,
  after: string,
  slides: readonly string[],
): string {
  const signature = (html: string) => {
    const prepared = prepareDeckEdit(html).html,
      patches: { start: number; end: number }[] = [];
    for (const slide of agentElements(prepared).filter(
      (node) =>
        agentAttr(node, "data-deck-slide") !== undefined &&
        !slides.includes(agentAttr(node, "data-deck-node") ?? ""),
    )) {
      const walk = (node: DefaultTreeAdapterMap["node"]): void => {
        if ("tagName" in node && ["script", "style"].includes(node.tagName))
          return;
        if ("value" in node && node.value.trim() && node.sourceCodeLocation)
          patches.push({
            start: node.sourceCodeLocation.startOffset,
            end: node.sourceCodeLocation.endOffset,
          });
        if ("childNodes" in node) node.childNodes.forEach(walk);
      };
      walk(slide);
    }
    let result = prepared;
    for (const patch of patches.sort((a, b) => b.start - a.start))
      result =
        result.slice(0, patch.start) +
        "[unrelated-text]" +
        result.slice(patch.end);
    return result;
  };
  return agentDigest(
    JSON.stringify([signature(before), signature(after), slides]),
  );
}
