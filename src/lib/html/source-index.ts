import type {DefaultTreeAdapterMap} from "parse5";
import {parseStockHtml,parseStockHtmlInSlices} from "./stock-parser";

// These trees are read-only, derived indexes of recent source/preview values.
// Callers must never mutate them. Authored edits always patch the original HTML;
// serialization is used only for derived text extraction, never to save HTML.
const sourceTrees = new Map<string,{tree:DefaultTreeAdapterMap["document"];fingerprint?:string}>();
let sourceTreeSize=0;
export function cacheSourceTree(html:string,entry:{tree:DefaultTreeAdapterMap["document"];fingerprint?:string}):void{
  // Rendering compares consecutive source revisions. Retain two complete
  // documents up to the supported 5 MiB limit instead of evicting the before
  // tree as soon as a large after tree is indexed. Small documents stay capped
  // at eight entries; this is not an unbounded history.
  const documentLimit=5*1024*1024, limit=2*documentLimit;
  if(html.length>documentLimit)return;
  if(sourceTrees.delete(html))sourceTreeSize-=html.length;
  const large=1024*1024;
  while(sourceTrees.size>=8||sourceTreeSize+html.length>limit||(html.length>=large&&[...sourceTrees.keys()].filter(key=>key.length>=large).length>=2)){
    const keys=[...sourceTrees.keys()],full=keys.filter(key=>key.length>=large);
    const first=html.length>=large&&full.length>=2?full[0]:(keys.find(key=>key.length<large)??keys[0]);
    if(first===undefined)break;sourceTrees.delete(first);sourceTreeSize-=first.length;
  }
  sourceTrees.set(html,entry);sourceTreeSize+=html.length;
}
export function sourceTree(html: string): DefaultTreeAdapterMap["document"] {
  const existing = sourceTrees.get(html);
  if (existing) {sourceTrees.delete(html);sourceTrees.set(html,existing);return existing.tree;}
  const tree = parseStockHtml(html);
  cacheSourceTree(html,{tree});
  return tree;
}

export function sourceTreeEntry(html:string){return sourceTrees.get(html);}
/** sourceTree と同じ木を、処理を小分けにして先に作り、手元に残す（大きな原稿の読み取りで入力を止めないため）。 */
export async function prepareSourceTree(html:string,pause:()=>Promise<void>,budgetMs?:number):Promise<void>{
  if(sourceTrees.has(html))return;
  const tree=await parseStockHtmlInSlices(html,pause,{budgetMs});
  if(!sourceTrees.has(html))cacheSourceTree(html,{tree});
}

/** Copy mutable nodes and locations while sharing immutable script/style strings.
 * structuredClone copies those large strings on every keystroke as well. */
export function cloneSourceTree(document:DefaultTreeAdapterMap["document"],adjust?:{
  location:(value:NonNullable<DefaultTreeAdapterMap["element"]["sourceCodeLocation"]>)=>void;
  node:(copy:DefaultTreeAdapterMap["node"],source:Readonly<DefaultTreeAdapterMap["node"]>)=>void;
}):DefaultTreeAdapterMap["document"]{
  type Location=NonNullable<DefaultTreeAdapterMap["element"]["sourceCodeLocation"]>;
  type Attributes=NonNullable<Location["attrs"]>;
  const locations=new Map<Location,Location>(),attributes=new Map<Attributes,Attributes>();
  const copyLocation=(value:Location):Location=>{
    const known=locations.get(value);if(known)return known;
    const result:Location={...value};locations.set(value,result);
    if(value.startTag)result.startTag=copyLocation(value.startTag);
    if(value.endTag)result.endTag=copyLocation(value.endTag);
    if(value.attrs){
      let copied=attributes.get(value.attrs);
      if(!copied){copied={};Object.setPrototypeOf(copied,null);attributes.set(value.attrs,copied);for(const [key,at] of Object.entries(value.attrs))copied[key]=copyLocation(at);}
      result.attrs=copied;
    }
    adjust?.location(result);
    return result;
  };
  const fragment=(node:DefaultTreeAdapterMap["documentFragment"]):DefaultTreeAdapterMap["documentFragment"]=>{
    const result:DefaultTreeAdapterMap["documentFragment"]={...node,childNodes:[]};
    if(node.sourceCodeLocation)result.sourceCodeLocation=copyLocation(node.sourceCodeLocation);
    result.childNodes=node.childNodes.map(node=>child(node,result));adjust?.node(result,node);return result;
  };
  const child=(node:DefaultTreeAdapterMap["childNode"],parent:DefaultTreeAdapterMap["parentNode"]):DefaultTreeAdapterMap["childNode"]=>{
    const copiedLocation=node.sourceCodeLocation?{sourceCodeLocation:copyLocation(node.sourceCodeLocation)}:{};
    if("tagName" in node){
      const result:DefaultTreeAdapterMap["element"]={...node,...copiedLocation,parentNode:parent,attrs:node.attrs.map(attr=>({...attr})),childNodes:[]};
      if("content" in node){
        const template:DefaultTreeAdapterMap["template"]={...result,nodeName:"template",tagName:"template",content:fragment(node.content)};
        template.childNodes=node.childNodes.map(node=>child(node,template));adjust?.node(template,node);return template;
      }
      result.childNodes=node.childNodes.map(node=>child(node,result));adjust?.node(result,node);return result;
    }
    const result={...node,...copiedLocation,parentNode:parent};adjust?.node(result,node);return result;
  };
  const result:DefaultTreeAdapterMap["document"]={...document,childNodes:[]};
  if(document.sourceCodeLocation)result.sourceCodeLocation=copyLocation(document.sourceCodeLocation);
  result.childNodes=document.childNodes.map(node=>child(node,result));adjust?.node(result,document);return result;
}
