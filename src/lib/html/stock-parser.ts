import {parse,Parser,type DefaultTreeAdapterMap} from "parse5";
import {designRuntime,designStyle,navigationRuntime} from "../deck/preview.generated";
import {withVendorScripts} from "./vendor-scripts";

type Node=DefaultTreeAdapterMap["node"];
type Element=DefaultTreeAdapterMap["element"];
type Replacement={start:number;bodyStart:number;bodyEnd:number;end:number;tag:string;body:string;compactStart:number;compactBodyStart:number;compactBodyEnd:number};
type StockBlock={block:string;tag:string;body:string;bodyStart:number;bodyEnd:number};
let blocks:StockBlock[]|undefined;
function stockBlocks():StockBlock[]{return blocks??=[...new Set([designRuntime,designStyle,navigationRuntime].flatMap(block=>[block,withVendorScripts(block)]))].flatMap(block=>{
  const match=/^<(script|style)(?:\s[^<>]*)?>/.exec(block),end=block.lastIndexOf('</');
  if(!match||!block.endsWith(`</${match[1]}>`)||end<match[0].length)return [];
  const body=block.slice(match[0].length,end);
  // Stay in ordinary HTML raw-text state. Future stock code containing HTML
  // script escapes, early closing tags or normalized characters uses parse5.
  if(/[\r\0\uD800-\uDFFF]/.test(body)||/<!--|<\/?(?:script|style)(?:[\s/>])/i.test(body))return [];
  return [{block,tag:match[1],body,bodyStart:match[0].length,bodyEnd:end}];
});}

/** Parse reviewed, exact stock raw-text blocks without repeatedly tokenizing
 * hundreds of KB of identical JS/CSS. The authored HTML is never changed.
 * Context is proved from the parsed tree; any ambiguity uses ordinary parse5. */
export function parseStockHtml(html:string):DefaultTreeAdapterMap["document"]{
  const steps=stockParse(html,Infinity);
  for(let step=steps.next();;step=steps.next())if(step.done)return step.value;
}

/** parseStockHtml と同じ木を、処理を小分けにして作る（300 枚の資料では一度に読むと遅い端末で 100ms を超え、
 * その間の入力が止まるため）。小分けの間は pause を待つ。木は作り終えるまで誰にも渡さない。
 * 切れ目で結果が変わらないことは、この部品の単体の検査（html-stock-parser.test）が通常の解析と突き合わせる。 */
export async function parseStockHtmlInSlices(html:string,pause:()=>Promise<void>,options:{slice?:number;budgetMs?:number}={}):Promise<DefaultTreeAdapterMap["document"]>{
  const budget=options.budgetMs??8,steps=stockParse(html,options.slice??32*1024);
  let since=performance.now();
  for(let step=steps.next();;step=steps.next()){
    if(step.done)return step.value;
    if(performance.now()-since>=budget){await pause();since=performance.now();}
  }
}

const WALK_SLICE=2000,SCAN_SLICE=256*1024;
/** Tokenize in slices only where the input cannot split a CRLF pair or a surrogate pair. parse5 keeps every
 * location as an offset into the whole input across written chunks, exactly as its streaming parser does. */
function* parseInSlices(text:string,slice:number):Generator<void,DefaultTreeAdapterMap["document"]>{
  if(slice>=text.length||/[\r\uD800-\uDFFF]/.test(text))return parse(text,{sourceCodeLocationInfo:true});
  const parser=new Parser<DefaultTreeAdapterMap>({sourceCodeLocationInfo:true});
  for(let at=0;at<text.length;){
    const end=Math.min(text.length,at+slice);
    parser.tokenizer.write(text.slice(at,end),end===text.length);at=end;
    if(at<text.length)yield;
  }
  return parser.document;
}
/** Pre-order: the node, its children in order, then template content (same order as a recursive walk). */
function* walkInSlices(root:Node,visit:(node:Node)=>void):Generator<void,void>{
  const stack:Node[]=[root];let count=0;
  for(let node=stack.pop();node;node=stack.pop()){
    visit(node);
    if('content' in node)stack.push(node.content);
    if('childNodes' in node)for(let i=node.childNodes.length-1;i>=0;i--)stack.push(node.childNodes[i]);
    if(++count%WALK_SLICE===0)yield;
  }
}
function* stockParse(html:string,slice:number):Generator<void,DefaultTreeAdapterMap["document"]>{
  const ordinary=()=>parseInSlices(html,slice);
  if(!html.includes('data-deck')||/[\r\0\uD800-\uDFFF]/.test(html))return yield* ordinary();
  const candidates:Replacement[]=[];
  for(const {block,tag,body,bodyStart,bodyEnd} of stockBlocks()){
    let from=0;
    while(true){const start=html.indexOf(block,from);if(start<0)break;const end=start+block.length;
      candidates.push({start,end,tag,body,bodyStart:start+bodyStart,bodyEnd:start+bodyEnd,compactStart:0,compactBodyStart:0,compactBodyEnd:0});from=end;
    }
  }
  if(!candidates.length)return yield* ordinary();
  const replacements:Replacement[]=[];
  for(const candidate of candidates.sort((a,b)=>a.start-b.start||b.end-a.end))if(!replacements.length||candidate.start>=replacements[replacements.length-1].end)replacements.push(candidate);
  const pieces:string[]=[];let from=0,removed=0;
  for(const item of replacements){
    item.compactStart=item.start-removed;item.compactBodyStart=item.bodyStart-removed;item.compactBodyEnd=item.compactBodyStart+1;
    pieces.push(html.slice(from,item.bodyStart),'0');from=item.bodyEnd;removed+=item.body.length-1;
  }
  pieces.push(html.slice(from));
  const tree=yield* parseInSlices(pieces.join(''),slice),elements=new Map<number,Element>();
  yield* walkInSlices(tree,node=>{if('tagName' in node&&node.sourceCodeLocation)elements.set(node.sourceCodeLocation.startOffset,node);});
  for(const item of replacements){
    const node=elements.get(item.compactStart),at=node?.sourceCodeLocation,child=node?.childNodes[0];
    if(!node||node.namespaceURI!=='http://www.w3.org/1999/xhtml'||node.tagName!==item.tag||node.childNodes.length!==1||!child||!('value' in child)
      ||child.value!=='0'||at?.startTag?.endOffset!==item.compactBodyStart||at.endTag?.startOffset!==item.compactBodyEnd
      ||child.sourceCodeLocation?.startOffset!==item.compactBodyStart||child.sourceCodeLocation.endOffset!==item.compactBodyEnd)return yield* ordinary();
  }
  // All contexts have been checked before restoring or publishing any tree.
  for(const item of replacements){const child=elements.get(item.compactStart)!.childNodes[0];if('value' in child)child.value=item.body;}
  const lines=[0];for(let i=0;i<html.length;i++){if(html.charCodeAt(i)===10)lines.push(i+1);if((i+1)%SCAN_SLICE===0)yield;}
  const originalOffset=(offset:number)=>{let shift=0;for(const item of replacements){if(offset<=item.compactBodyStart)return offset+shift;if(offset<item.compactBodyEnd)return item.bodyStart;shift+=item.body.length-1;}return offset+shift;};
  const position=(offset:number)=>{let left=0,right=lines.length;while(left+1<right){const middle=(left+right)>>>1;if(lines[middle]<=offset)left=middle;else right=middle;}return {line:left+1,col:offset-lines[left]+1};};
  type Location=NonNullable<Element['sourceCodeLocation']>;
  const shifted=new Set<Location>();
  const restore=(at:Location):void=>{
    if(shifted.has(at))return;shifted.add(at);
    at.startOffset=originalOffset(at.startOffset);at.endOffset=originalOffset(at.endOffset);
    const start=position(at.startOffset),end=position(at.endOffset);at.startLine=start.line;at.startCol=start.col;at.endLine=end.line;at.endCol=end.col;
    if(at.startTag)restore(at.startTag);if(at.endTag)restore(at.endTag);for(const attribute of Object.values(at.attrs??{}))restore(attribute);
  };
  yield* walkInSlices(tree,node=>{if(node.sourceCodeLocation)restore(node.sourceCodeLocation);});
  return tree;
}
