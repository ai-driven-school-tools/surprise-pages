import { readDeckFlowTimeSource } from "./flow-time-source";
import { readDeckFlowSource } from "./flow-source";
import { renderDeckFlowSvg, renderDeckFlowTimeSvg } from "./flow-renderer";
import { DECK_FLOW_METRICS } from "../lib/deck/design/flow-layout";
type DiagramJson = { [key: string]: unknown };
type NativeSet = { id: string; label: string; x: number; y: number; radius: number };
type NativePoint = { id: string; label: string; x: number; y: number };

const SVG_NS = "http://www.w3.org/2000/svg";
const INIT_DIRECTIVE = /^\s*%%\{init:\s*(\{[\s\S]*?\})\s*\}%%/;
const originalFlows = new WeakMap<HTMLElement,string>();
const pendingFlows = new Map<HTMLElement,string>();
const diagramObservers = new WeakMap<ParentNode, MutationObserver>();
const nativeSources = new WeakMap<HTMLElement, string>();
export function releaseDeckDiagrams(root: Element): void {
  diagramObservers.get(root)?.disconnect(); diagramObservers.delete(root);
  for (const pre of pendingFlows.keys()) if (root.contains(pre)) pendingFlows.delete(pre);
}

function svgLabelSource(source: string): string {
  const match = INIT_DIRECTIVE.exec(source);
  if (match === null) return `%%{init: {"htmlLabels":false}}%%\n${source}`;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!objectOf(parsed)) return source;
    return source.replace(match[0], `%%{init: ${JSON.stringify({ ...parsed, htmlLabels: false })}}%%`);
  } catch {
    return `%%{init: {"htmlLabels":false}}%%\n${source}`;
  }
}

/** Mermaid measures HTML labels after the 1280×720 slide has been scaled.
 * Safari clips those measured boxes. Deck diagrams use native SVG text so
 * their label geometry stays in the diagram coordinate system. */
export function prepareDeckDiagramSources(root: ParentNode = document): void {
  for (const source of root.querySelectorAll<HTMLElement>("[data-dd-mermaid-diagram] pre.mermaid")) {
    if (originalFlows.has(source) || source.querySelector("svg")) continue;
    const raw = source.textContent ?? "";
    source.textContent = svgLabelSource(raw);
    const format = source.closest("section")?.getAttribute("data-dd-format") ?? "";
    if (format.startsWith("flow-") && /^\s*(flowchart|graph|gantt)\s/m.test(raw.replace(INIT_DIRECTIVE,""))) {
      // Mermaid's window listener runs after this document listener. Reserve
      // these nodes for the purpose-specific renderer before its automatic run.
      source.setAttribute("data-processed","true");
      originalFlows.set(source,raw);
      pendingFlows.set(source,raw);
    }
  }
}

async function renderPreparedFlows(root: ParentNode = document): Promise<void> {
  await document.fonts?.ready;
  // Keep projections and any compatibility renders in source order.
  for (const [pre,raw] of pendingFlows) {
    if (root instanceof Element && !root.contains(pre)) continue;
    pendingFlows.delete(pre);
    const figure = pre.closest<HTMLElement>("[data-dd-mermaid-diagram]");
    const slide = pre.closest<HTMLElement>("section[data-deck-slide]");
    if (!figure || !slide || !pre.isConnected) continue;
    const mermaid: unknown = Reflect.get(window,"mermaid");
    const time = slide.getAttribute("data-dd-format") === "flow-time" ? await readDeckFlowTimeSource(mermaid,raw) : null;
    const graph = time ? null : await readDeckFlowSource(mermaid,raw);
    const family=getComputedStyle(figure).fontFamily;
    const measure=document.createElement("canvas").getContext("2d");
    const options = {
      width: pre.clientWidth, height: pre.clientHeight,
      measureText: (text: string, size: number) => {
        if (!measure) return [...text].length * size;
        measure.font = `${size >= 28 ? 600 : 400} ${size}px ${family}`;
        return measure.measureText(text).width;
      },
    };
    const svg = time ? renderDeckFlowTimeSvg(time, options) : graph ? renderDeckFlowSvg(graph, slide.getAttribute("data-dd-format") ?? "", slide.getAttribute("data-dd-layout") ?? "", options) : null;
    if(svg){
      svg.style.fontFamily=family;
      pre.replaceChildren(svg);pre.setAttribute("data-dd-flow-ready","");
      figure.setAttribute("data-dd-rendered","true");
      mirrorTargetState(figure);
    }else{
      pre.removeAttribute("data-processed");pre.textContent=svgLabelSource(raw);
      figure.setAttribute("data-dd-flow-fallback","");
      if(objectOf(mermaid)&&typeof mermaid.run==="function"){
        try{await Reflect.apply(mermaid.run,mermaid,[{nodes:[pre]}]);mirrorTargetState(figure);}
        catch{figure.setAttribute("data-dd-diagram-error","");}
      }
    }
  }
}

function objectOf(value: unknown): value is DiagramJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} がありません`);
  return value;
}

function numberOf(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} は数値で指定してください`);
  return value;
}

function setOf(value: unknown, index: number): NativeSet {
  if (!objectOf(value)) throw new Error(`sets[${index}] の形が違います`);
  return { id: stringOf(value.id, "set.id"), label: stringOf(value.label, "set.label"), x: numberOf(value.x, "set.x"), y: numberOf(value.y, "set.y"), radius: numberOf(value.radius, "set.radius") };
}

function pointOf(value: unknown, index: number): NativePoint {
  if (!objectOf(value)) throw new Error(`points[${index}] の形が違います`);
  return { id: stringOf(value.id, "point.id"), label: stringOf(value.label, "point.label"), x: numberOf(value.x, "point.x"), y: numberOf(value.y, "point.y") };
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function renderSets(svg: SVGSVGElement, source: DiagramJson, width: number, height: number): void {
  if (!Array.isArray(source.sets)) throw new Error("sets がありません");
  const sets = source.sets.map(setOf);
  if (!sets.length) throw new Error("集合がありません");
  if (sets.some(set=>set.radius<=0)) throw new Error("集合の大きさが正しくありません");
  const left=Math.min(...sets.map(s=>s.x-s.radius)),right=Math.max(...sets.map(s=>s.x+s.radius));
  const top=Math.min(...sets.map(s=>s.y-s.radius)),bottom=Math.max(...sets.map(s=>s.y+s.radius));
  const scale=Math.min((width-64)/(right-left),(height-64)/(bottom-top));
  const x=(value:number)=>(value-(left+right)/2)*scale+width/2;
  const y=(value:number)=>(value-(top+bottom)/2)*scale+height/2;
  const cx=sets.reduce((sum,s)=>sum+s.x,0)/sets.length,cy=sets.reduce((sum,s)=>sum+s.y,0)/sets.length;
  for (const item of sets) {
    const dx=item.x-cx,dy=item.y-cy,length=Math.hypot(dx,dy)||1;
    const group=svgElement("g",{"data-dd-render-node":item.id});
    const label=svgElement("text",{x:String(x(item.x+dx/length*item.radius*.58)),y:String(y(item.y+dy/length*item.radius*.58)+10),"text-anchor":"middle","data-dd-flow-node-title":""});
    label.textContent=item.label;
    group.append(svgElement("circle",{class:"dd-shape",cx:String(x(item.x)),cy:String(y(item.y)),r:String(item.radius*scale)}),label);
    svg.append(group);
  }
  if (Array.isArray(source.regions)) for (const [index,value] of source.regions.entries()) {
    const point=pointOf(value,index);
    const group=svgElement("g",{"data-dd-render-region":point.id});
    const label=svgElement("text",{x:String(x(point.x)),y:String(y(point.y)+7),"text-anchor":"middle","data-dd-flow-node-detail":""});label.textContent=point.label;
    group.append(svgElement("circle",{cx:String(x(point.x)),cy:String(y(point.y)),r:"30","data-dd-flow-overlap":""}),label);svg.append(group);
  }

}

function renderQuadrant(svg: SVGSVGElement, source: DiagramJson, width: number, height: number): void {
  const xAxis = stringOf(source.xAxis, "xAxis");
  const yAxis = stringOf(source.yAxis, "yAxis");
  const plot={x:48,y:40,width:width-96,height:height-100};
  const x=(value:number)=>plot.x+(value-80)/1020*plot.width;
  const y=(value:number)=>plot.y+(value-20)/320*plot.height;
  svg.append(
    svgElement("rect",{class:"dd-region",x:String(plot.x+plot.width/2),y:String(plot.y),width:String(plot.width/2),height:String(plot.height/2)}),
    svgElement("line",{class:"dd-axis",x1:String(plot.x),x2:String(plot.x+plot.width),y1:String(plot.y+plot.height/2),y2:String(plot.y+plot.height/2)}),
    svgElement("line",{class:"dd-axis",x1:String(plot.x+plot.width/2),x2:String(plot.x+plot.width/2),y1:String(plot.y),y2:String(plot.y+plot.height)})
  );
  const xEnds=objectOf(source.xEnds)?source.xEnds:null,yEnds=objectOf(source.yEnds)?source.yEnds:null;
  const middleX=plot.x+plot.width/2,middleY=plot.y+plot.height/2;
  const xLabel=svgElement("text",{x:String(width-32),y:String(xEnds?middleY-16:height-12),"text-anchor":"end","data-dd-flow-edge-label":""});xLabel.textContent=xAxis;
  const yLabel=svgElement("text",{x:String(yEnds?middleX+16:32),y:"22","data-dd-flow-edge-label":""});yLabel.textContent=yAxis;svg.append(xLabel,yLabel);
  for (const [ends,positions] of [[xEnds,[{x:plot.x,y:middleY+28,anchor:"start"},{x:plot.x+plot.width,y:middleY+28,anchor:"end"}]],[yEnds,[{x:middleX-16,y:plot.y+16,anchor:"end"},{x:middleX-16,y:plot.y+plot.height,anchor:"end"}]]] satisfies [DiagramJson|null,{x:number;y:number;anchor:string}[]][]) {
    if (!ends) continue;
    for(const [index,key] of ["start","end"].entries()){
      const position=positions[index];
      const label=svgElement("text",{x:String(position.x),y:String(position.y),"text-anchor":position.anchor,"data-dd-flow-edge-label":""});label.textContent=stringOf(ends[key],key);svg.append(label);
    }
  }
  if (!Array.isArray(source.points)) throw new Error("points がありません");
  for (const [index,value] of source.points.entries()) {
    const point=pointOf(value,index),px=x(point.x),py=y(point.y);
    const group=svgElement("g",{"data-dd-render-node":point.id});
    const left=px>width-220;
    const label=svgElement("text",{x:String(px+(left?-20:20)),y:String(py+10),"text-anchor":left?"end":"start","data-dd-flow-node-title":""});label.textContent=point.label;
    group.append(svgElement("circle",{class:"dd-point",cx:String(px),cy:String(py),r:"6"}),label);svg.append(group);
  }

}

function renderNativeFigure(figure: HTMLElement): boolean {
  const json = figure.querySelector<HTMLScriptElement>('script[type="application/json"][data-dd-native-source]');
  const fallback = figure.querySelector<HTMLElement>(".dd-flow-targets");
  if (!json || !fallback) throw new Error("図の材料または読み表示が不足しています");
  const parsed: unknown = JSON.parse(json.textContent ?? "");
  if (!objectOf(parsed)) throw new Error("図の材料の形が違います");
  const kind = stringOf(parsed.kind, "kind");
  const holder=figure.querySelector<HTMLElement>(".dd-flow-diagram");
  if (!holder || !holder.clientWidth || !holder.clientHeight) return false;
  const width=holder.clientWidth,height=holder.clientHeight;
  const svg = svgElement("svg", { class: "dd-native-diagram", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": stringOf(parsed.ariaDescription, "ariaDescription"),"data-dd-flow-scene":kind });
  svg.style.setProperty("--dd-flow-title-size",`${DECK_FLOW_METRICS.nodeFontSize}px`);svg.style.setProperty("--dd-flow-detail-size",`${DECK_FLOW_METRICS.detailFontSize}px`);svg.style.setProperty("--dd-flow-edge-size",`${DECK_FLOW_METRICS.edgeFontSize}px`);
  if (kind === "set-overlap") renderSets(svg, parsed,width,height);
  else if (kind === "quadrant") renderQuadrant(svg, parsed,width,height);
  else throw new Error(`未対応の図です: ${kind}`);
  figure.querySelector(".dd-flow-diagram")?.replaceChildren(svg);
  figure.setAttribute("data-dd-rendered", "true");
  return true;
}

function mermaidTarget(svg: SVGSVGElement, kind: "node" | "edge", id: string): Element | null {
  const direct=svg.querySelector(`[data-dd-render-${kind}="${CSS.escape(id)}"]`);
  if(direct)return direct;
  const candidates = [...svg.querySelectorAll(kind === "node" ? ".node, .actor, .task" : ".edgePath, .flowchart-link, path")];
  return candidates.find((element) => {
    // Mermaid keeps the authored stable id in data-id while its DOM id may add
    // a per-render prefix. Prefer the authored value; keep the old simple-id
    // fallback for diagram families that do not emit data-id.
    const authored = element.getAttribute("data-id");
    const generated = element.getAttribute("id") ?? "";
    return authored === id || generated === id || generated.split("-").includes(id);
  }) ?? null;
}

function mermaidEdgeLabel(svg: SVGSVGElement, id: string): Element | null {
  return [...svg.querySelectorAll(".edgeLabel")].find((element) =>
    element.getAttribute("data-id") === id || element.querySelector(`[data-id="${CSS.escape(id)}"]`) !== null,
  ) ?? null;
}

function mirrorState(source: Element, target: Element): void {
  const state = source.getAttribute("data-dd-focus-state");
  if (state !== null) {
    if (target.getAttribute("data-dd-focus-state") !== state) target.setAttribute("data-dd-focus-state", state);
  } else if (target.hasAttribute("data-dd-focus-state")) target.removeAttribute("data-dd-focus-state");
}

function mirrorTargetState(figure: HTMLElement): void {
  const svg = figure.querySelector<SVGSVGElement>(".dd-flow-diagram svg");
  if (!svg) return;
  for (const source of figure.querySelectorAll<HTMLElement>(".dd-flow-targets [data-dd-node-id], .dd-flow-targets [data-dd-edge-id], .dd-flow-targets [data-dd-region-id]")) {
    const nodeId = source.getAttribute("data-dd-node-id");
    const edgeId = source.getAttribute("data-dd-edge-id");
    const regionId = source.getAttribute("data-dd-region-id");
    const rendered = nodeId ? mermaidTarget(svg, "node", nodeId)
      : edgeId ? mermaidTarget(svg, "edge", edgeId)
      : regionId ? svg.querySelector(`[data-dd-render-region="${CSS.escape(regionId)}"]`) : null;
    if (!rendered) continue;
    mirrorState(source, rendered);
    // The stored HTML keeps target ids on the readable inventory. Once a diagram
    // exists, move the same id onto the visible SVG shape so a click selects the
    // actual node/edge/region without leaving duplicate ids in the live document.
    const mark = nodeId ? "data-dd-node-id" : edgeId ? "data-dd-edge-id" : "data-dd-region-id";
    const id = nodeId ?? edgeId ?? regionId;
    if (id !== null) {
      rendered.setAttribute(mark, id);
      source.removeAttribute(mark);
    }
  }
  for (const edge of svg.querySelectorAll<Element>("[data-dd-edge-id]")) {
    const id = edge.getAttribute("data-dd-edge-id");
    if (id === null) continue;
    const label = mermaidEdgeLabel(svg, id);
    if (label === null) continue;
    label.setAttribute("data-dd-focus-edge-label", id);
    mirrorState(edge, label);
  }
}

export async function refreshDeckDiagramTypography(root: ParentNode = document): Promise<void> {
  for (const pre of root.querySelectorAll<HTMLElement>("[data-dd-mermaid-diagram] pre.mermaid")) {
    const raw=originalFlows.get(pre),svg=pre.querySelector("svg"),figure=pre.closest("[data-dd-mermaid-diagram]");
    if(raw && figure && svg?.style.fontFamily!==getComputedStyle(figure).fontFamily) pendingFlows.set(pre,raw);
  }
  await renderPreparedFlows();
}

export async function renderDeckDiagrams(root: ParentNode = document): Promise<void> {
  const flows = renderPreparedFlows(root);
  for (const figure of root.querySelectorAll<HTMLElement>("[data-dd-native-diagram]")) {
    const signature = [...figure.querySelectorAll("script")].map(n => n.textContent).join("");
    if (nativeSources.get(figure) === signature) continue;
    try { if (renderNativeFigure(figure)) nativeSources.set(figure,signature); } catch (error) {
      const target = figure.querySelector<HTMLElement>(".dd-flow-diagram");
      if (target) target.textContent = error instanceof Error ? error.message : "図を描けませんでした";
      figure.setAttribute("data-dd-diagram-error", "");
    }
  }
  const observationRoot = root instanceof Element ? root.ownerDocument : root;
  const bind = (scope: ParentNode) => {
    for (const figure of scope.querySelectorAll<HTMLElement>("[data-dd-mermaid-diagram], [data-dd-native-diagram]")) mirrorTargetState(figure);
  };
  // Only this call's figures changed. The document-wide observer keeps the others
  // bound, so drawing each paper does not scan every other paper again.
  bind(root);
  if ((observationRoot instanceof Document || observationRoot instanceof Element) && !diagramObservers.has(observationRoot)) {
    const observer = new MutationObserver(() => bind(observationRoot));
    observer.observe(observationRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-dd-focus-state"] });
    diagramObservers.set(observationRoot, observer);
  }
  await flows;
  bind(root);
}
