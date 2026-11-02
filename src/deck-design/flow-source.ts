import { z } from "zod";
import type { DeckFlowGraph, DeckFlowNode } from "../lib/deck/design/flow-layout";

const id = z.string().min(1).max(200);
const vertexSchema = z.object({ id, text: z.string(), type: z.enum(["square", "round", "stadium", "diamond"]), labelType: z.enum(["text", "string"]).optional(), styles: z.array(z.unknown()).max(0).optional(), classes: z.array(z.unknown()).max(0).optional(), props: z.record(z.string(), z.unknown()).optional(), link: z.never().optional(), haveCallback: z.literal(false).optional() });
const edgeSchema = z.object({ id, start: id, end: id, text: z.string(), type: z.literal("arrow_point"), labelType: z.enum(["text", "string"]).optional(), stroke: z.literal("normal").optional(), classes: z.array(z.unknown()).max(0).optional(), style: z.array(z.unknown()).max(0).optional(), isUserDefinedId: z.literal(true) });
const groupSchema = z.object({ id, title: z.string(), nodes: z.array(id), classes: z.array(z.unknown()).max(0).optional(), labelType: z.enum(["text", "string"]).optional() });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function deckMermaidValue(owner: Record<string, unknown>, method: string): unknown {
  const fn = owner[method];
  return typeof fn === "function" ? fn.call(owner) : undefined;
}
export async function parseDeckMermaid(mermaid: unknown, source: string): Promise<{ type: string; db: Record<string, unknown> } | null> {
  if (!record(mermaid) || !record(mermaid.mermaidAPI)) return null;
  const api = mermaid.mermaidAPI, parse = api.getDiagramFromText;
  if (typeof parse !== "function") return null;
  try {
    const diagram: unknown = await parse.call(api, source);
    return record(diagram) && typeof diagram.type === "string" && record(diagram.db) ? { type: diagram.type, db: diagram.db } : null;
  } catch { return null; }
}
function plainLabel(value: string): string | null {
  const text = value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/\r\n?/g, "\n");
  if (/<[^>]*>|&(?:#\w+|\w+);|`/.test(text) || text.length > 1000) return null;
  return text;
}
function supportedSource(source: string): boolean {
  if (/^\s*(?:click|classDef|class|style|linkStyle)\b/im.test(source) || /:::/m.test(source)) return false;
  // Layout is owned here, but authored behaviour/style must never silently disappear.
  for (const match of source.matchAll(/%%\{\s*init\s*:\s*([\s\S]*?)\}%%/g)) {
    try {
      const config: unknown = JSON.parse(match[1]);
      if (!record(config) || Object.keys(config).some(key => !["htmlLabels", "themeVariables"].includes(key))) return false;
      if (config.themeVariables !== undefined && (!record(config.themeVariables) || Object.keys(config.themeVariables).some(key => !["fontSize", "fontFamily"].includes(key)))) return false;
    } catch { return false; }
  }
  return true;
}

/** Projection only: the existing Mermaid text remains the sole persisted diagram source.
 * The adapter intentionally accepts a bounded subset and retains Mermaid rendering otherwise. */
export async function readDeckFlowSource(mermaid: unknown, source: string): Promise<DeckFlowGraph | null> {
  if (!supportedSource(source)) return null;
  try {
    const diagram = await parseDeckMermaid(mermaid, source);
    if (!diagram || diagram.type !== "flowchart-v2") return null;
    const db = diagram.db;
    const vertices: unknown = deckMermaidValue(db, "getVertices");
    const rawEdges: unknown = deckMermaidValue(db, "getEdges");
    const rawGroups: unknown = deckMermaidValue(db, "getSubGraphs");
    const rawDirection: unknown = deckMermaidValue(db, "getDirection");
    if (!(vertices instanceof Map) || !Array.isArray(rawEdges) || !Array.isArray(rawGroups)) return null;
    const direction = z.enum(["LR", "RL", "TB", "BT", "TD"]).safeParse(rawDirection);
    if (!direction.success) return null;
    const nodes: DeckFlowNode[] = [];
    for (const [key, candidate] of vertices) {
      const value: unknown = candidate;
      const vertex = vertexSchema.safeParse(value);
      if (!vertex.success || key !== vertex.data.id || (vertex.data.props && Object.keys(vertex.data.props).length)) return null;
      const label = plainLabel(vertex.data.text);
      if (label === null || !label.trim()) return null;
      const shape = vertex.data.type === "diamond" ? "decision" : vertex.data.type === "square" ? "box" : "round";
      nodes.push({ id: vertex.data.id, label, shape });
    }
    const edges: DeckFlowGraph["edges"] = [];
    for (const value of rawEdges) {
      const edge = edgeSchema.safeParse(value);
      if (!edge.success) return null;
      const label = plainLabel(edge.data.text);
      if (label === null) return null;
      edges.push({ id: edge.data.id, from: edge.data.start, to: edge.data.end, label });
    }
    const groups: DeckFlowGraph["groups"] = [];
    for (const value of rawGroups) {
      const group = groupSchema.safeParse(value);
      if (!group.success) return null;
      const label = plainLabel(group.data.title);
      if (label === null) return null;
      groups.push({ id: group.data.id, label, nodeIds: [...group.data.nodes] });
    }
    const nodeIds = new Set(nodes.map(node => node.id));
    if (nodeIds.size !== nodes.length || new Set(edges.map(edge => edge.id)).size !== edges.length || edges.some(edge => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) || groups.some(group => group.nodeIds.some(nodeId => !nodeIds.has(nodeId)))) return null;
    return { nodes, edges, groups, direction: direction.data === "TD" ? "TB" : direction.data };
  } catch { return null; }
}
