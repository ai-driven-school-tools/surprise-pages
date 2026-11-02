import { DECK_FLOW_METRICS as M, layoutDeckFlow, type DeckFlowGraph, type DeckFlowLayoutOptions, type DeckFlowPoint } from "../lib/deck/design/flow-layout";
import { DECK_FLOW_TIME_METRICS as T, layoutDeckFlowTime, type DeckFlowTimeSource } from "../lib/deck/design/flow-time";

const NS = "http://www.w3.org/2000/svg";
let sceneSerial = 0;
export function flowSvgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string,string> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS,tag);
  for (const [name,value] of Object.entries(attributes)) element.setAttribute(name,value);
  return element;
}
export function flowText(lines: readonly string[], x: number, y: number, lineHeight: number, attributes: Record<string,string>): SVGTextElement {
  const text = flowSvgElement("text",{x:String(x),y:String(y),...attributes});
  lines.forEach((line,index)=>{const span=flowSvgElement("tspan",{x:String(x),dy:index===0?"0":String(lineHeight)});span.textContent=line;text.append(span);});
  return text;
}
function pathOf(points: readonly DeckFlowPoint[]): string {
  return points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join(' ');
}
function arrow(points: readonly DeckFlowPoint[]): string {
  const last=points.at(-1),before=points.at(-2);
  if (!last || !before) return "";
  const angle=Math.atan2(last.y-before.y,last.x-before.x),length=9,width=4;
  const back={x:last.x-Math.cos(angle)*length,y:last.y-Math.sin(angle)*length};
  return `${last.x},${last.y} ${back.x+Math.sin(angle)*width},${back.y-Math.cos(angle)*width} ${back.x-Math.sin(angle)*width},${back.y+Math.cos(angle)*width}`;
}

export function renderDeckFlowTimeSvg(source: DeckFlowTimeSource, options: DeckFlowLayoutOptions): SVGSVGElement|null {
  const layout=layoutDeckFlowTime(source,options);
  if(!layout)return null;
  const svg=flowSvgElement("svg",{viewBox:`0 0 ${layout.width} ${layout.height}`,width:String(layout.width),height:String(layout.height),role:"img","aria-label":source.title,"data-dd-flow-scene":"flow-time"});
  svg.style.setProperty("--dd-flow-title-size",`${T.taskFontSize}px`);
  svg.style.setProperty("--dd-flow-edge-size",`${T.axisFontSize}px`);
  layout.ticks.forEach((tick,index)=>{
    svg.append(flowSvgElement("line",{x1:String(tick.x),x2:String(tick.x),y1:String(layout.plot.y),y2:String(layout.plot.y+layout.plot.height),"data-dd-flow-grid-line":""}),flowText([tick.label],tick.x,layout.plot.y+layout.plot.height+28,28,{"data-dd-flow-edge-label":"","text-anchor":index===0?"start":index===layout.ticks.length-1?"end":"middle"}));
  });
  for(const section of layout.sections)svg.append(flowText([section.label],section.x,section.y,28,{"data-dd-flow-group-label":""}));
  for(const task of layout.tasks){
    const group=flowSvgElement("g",{"data-dd-render-node":task.id});
    group.append(flowSvgElement("rect",{x:String(task.x),y:String(task.y),width:String(task.width),height:String(task.height),rx:"6","data-dd-flow-duration":""}),flowText([task.label],task.labelX,task.labelY+T.taskFontSize*.35,36,{"data-dd-flow-node-title":"","text-anchor":"end"}));
    svg.append(group);
  }
  return svg;
}

/** Same coordinate system as the slide. No SVG-fit enlargement or text-size correction after layout. */
export function renderDeckFlowSvg(graph: DeckFlowGraph, format: string, layoutName: string, options: DeckFlowLayoutOptions): SVGSVGElement|null {
  const layout=layoutDeckFlow(graph,format,layoutName,options);
  if (!layout) return null;
  const svg=flowSvgElement("svg",{viewBox:`0 0 ${layout.width} ${layout.height}`,width:String(layout.width),height:String(layout.height),role:"img","aria-label":graph.nodes.map(node=>node.label.replace(/\n/g," ")).join("、"),"data-dd-flow-scene":format});
  svg.style.setProperty("--dd-flow-title-size",`${M.nodeFontSize}px`);
  svg.style.setProperty("--dd-flow-detail-size",`${M.detailFontSize}px`);
  svg.style.setProperty("--dd-flow-edge-size",`${M.edgeFontSize}px`);
  svg.style.setProperty("--dd-flow-order-size",`${M.orderFontSize}px`);
  const editorial=layout.typographic;
  const typographic=["flow-sequence","flow-input-output","flow-causal"].includes(format);
  const washId=`dd-flow-wash-${++sceneSerial}`;
  {
    if(editorial)svg.setAttribute("data-dd-flow-stages","");
    svg.style.setProperty("--dd-flow-wash",`url(#${washId})`);
    const defs=flowSvgElement("defs"),wash=flowSvgElement("linearGradient",{id:washId,x1:"0",y1:"0",x2:"1",y2:"1"});
    wash.append(flowSvgElement("stop",{offset:"0","stop-color":"var(--dd-accent)","stop-opacity":"var(--dd-stage-opacity)"}),flowSvgElement("stop",{offset:"1","stop-color":"var(--dd-secondary)","stop-opacity":"0"}));
    defs.append(wash);svg.append(defs);
  }
  for (const [groupIndex,group] of layout.groups.entries()) {
    const layer=flowSvgElement("g",{"data-dd-flow-group":group.id});
    if(groupIndex<layout.groups.length-1)layer.append(flowSvgElement("line",{x1:String(group.x),x2:String(group.x+group.width),y1:String(group.y+group.height),y2:String(group.y+group.height),"data-dd-flow-group-frame":""}));
    layer.append(flowText([group.label],group.labelX,group.labelY,28,{"data-dd-flow-group-label":""}));
    svg.append(layer);
  }
  for (const edge of layout.edges) {
    const group=flowSvgElement("g",{"data-dd-render-edge":edge.id});
    group.append(flowSvgElement("path",{d:pathOf(edge.points),"data-dd-flow-wire":""}));
    if(format!=="flow-hierarchy")group.append(flowSvgElement("polygon",{points:arrow(edge.points),"data-dd-flow-arrow":""}));
    if(edge.lines.length) group.append(flowText(edge.lines,edge.labelX,edge.labelY-(edge.lines.length-1)*M.edgeLineHeight/2+M.edgeFontSize*.35,M.edgeLineHeight,{"text-anchor":"middle","data-dd-flow-edge-label":""}));
    svg.append(group);
  }
  layout.nodes.forEach((node,index)=>{
    const group=flowSvgElement("g",{"data-dd-render-node":node.id,"data-dd-flow-shape":node.shape});
    if(!typographic) group.append(flowSvgElement("rect",{x:String(node.x),y:String(node.y),width:String(node.width),height:String(node.height),rx:format==="flow-state"?"24":"12","data-dd-flow-node-frame":""}));
    else {
      if(editorial){
        group.append(flowSvgElement("rect",{x:String(node.x),y:String(node.y),width:String(node.width),height:String(node.height),rx:"16",fill:`url(#${washId})`,"data-dd-flow-stage-surface":""}));
      }
      group.append(flowText([String(index+1).padStart(2,"0")],node.x+(editorial?M.typographicPadding:M.nodePaddingX),editorial?node.y+M.typographicPadding+M.orderFontSize:node.y-18,M.orderLineHeight,{"data-dd-flow-order":"","aria-hidden":"true"}));
    }
    const textHeight=node.titleLineSlots*M.nodeLineHeight+node.detailLineSlots*M.detailLineHeight+(node.detailLineSlots?M.detailGap:0);
    const top=editorial?node.y+M.typographicPadding+M.orderLineHeight+M.orderGap:node.y+(node.height-textHeight)/2;
    const anchor=typographic?"start":"middle";
    const x=typographic?node.x+(editorial?M.typographicPadding:M.nodePaddingX):node.x+node.width/2;
    group.append(flowText(node.lines,x,top+M.nodeFontSize,M.nodeLineHeight,{"text-anchor":anchor,"data-dd-flow-node-title":""}));
    if(node.detailLines.length) group.append(flowText(node.detailLines,x,top+node.titleLineSlots*M.nodeLineHeight+(editorial?M.typographicDetailGap:M.detailGap)+M.detailFontSize,M.detailLineHeight,{"text-anchor":anchor,"data-dd-flow-node-detail":""}));
    svg.append(group);
  });
  return svg;
}
