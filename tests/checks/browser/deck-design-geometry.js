(async()=>{
await document.fonts.ready;
await Promise.allSettled([...document.images].map(image=>typeof image.decode==='function'?image.decode():Promise.resolve()));
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const {read,paint,presets}=window.deckPreview;
const focus=detail=>document.dispatchEvent(new CustomEvent('surprise:deck-focus-apply',{detail}));
const source=read(document);
for(const slide of document.querySelectorAll('section[data-deck-slide]')){
 const slideId=slide.getAttribute('data-deck-id');if(slideId)focus({slideId,stepId:null,actions:[]});
}
const measuredElements=()=>[...document.querySelectorAll('section[data-deck-slide] :is(h1,h2,h3,p,th,td,svg,img,.dd-chart)')];
const elementCount=measuredElements().length;
function dimensions(){return measuredElements().map(el=>{
 const r=el.getBoundingClientRect();const slide=el.closest('section[data-deck-slide]');const s=slide.getBoundingClientRect();const k=s.width/1280;
 const range=document.createRange();range.selectNodeContents(el);
 return {x:(r.x-s.x)/k,y:(r.y-s.y)/k,w:r.width/k,h:r.height/k,lines:el instanceof SVGElement?[]:[...range.getClientRects()].map(x=>[Math.round(x.width/k*100)/100,Math.round(x.height/k*100)/100])};
});}
const before=dimensions();let maxDelta=0,lineChanges=0,cases=0;
const fixedType=Object.fromEntries([...document.querySelectorAll("section[data-deck-slide]")].map(s=>[s.dataset.deckId,{typography:s.dataset.deckTypography??"system",ornament:s.dataset.deckOrnament??"none"}]));
for(const preset of presets){for(const decoration of ['none','gradient','glow','grid','wave']){
paint(document,source.design,{version:1,document:{...preset.appearance,decoration,intensity:100},slides:fixedType});
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const after=dimensions();cases++;
after.forEach((rect,index)=>{
 const b=before[index]; for(const key of ['x','y','w','h'])maxDelta=Math.max(maxDelta,Math.abs(rect[key]-b[key]));
 if(JSON.stringify(rect.lines)!==JSON.stringify(b.lines))lineChanges++;
});
}}
paint(document,source.design,source.overrides);
const focusSlide=document.querySelector('section[data-deck-id="message"]')||document.querySelector('section[data-deck-slide]');
const focusTarget=focusSlide?.querySelector('[data-dd-element-id]');
let focusDelta=0,focusLineChanges=0,focusDimOpacity=1;
if(focusSlide&&focusTarget){
 const focusBefore=dimensions();
 focus({slideId:focusSlide.getAttribute('data-deck-id'),stepId:'geometry-check',actions:[{id:'geometry-emphasis',kind:'emphasize',targets:[{slideId:focusSlide.getAttribute('data-deck-id'),kind:'element',id:focusTarget.getAttribute('data-dd-element-id')}]}]});
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 await new Promise(resolve=>setTimeout(resolve,220));
 const focusAfter=dimensions();
 focusAfter.forEach((rect,index)=>{
  const b=focusBefore[index];for(const key of ['x','y','w','h'])focusDelta=Math.max(focusDelta,Math.abs(rect[key]-b[key]));
  if(JSON.stringify(rect.lines)!==JSON.stringify(b.lines))focusLineChanges++;
 });
 const dimmed=[...focusSlide.querySelectorAll('[data-dd-focus-state="dim"]')].map(node=>Number.parseFloat(getComputedStyle(node).opacity));
 if(dimmed.length)focusDimOpacity=Math.min(...dimmed);
 focus({slideId:focusSlide.getAttribute('data-deck-id'),stepId:null,actions:[]});
}
if(maxDelta>1||lineChanges) throw new Error(`配置のずれ: ${maxDelta}px / 改行 ${lineChanges}`);
if(focusDelta>1||focusLineChanges) throw new Error(`通常強調の配置ずれ: ${focusDelta}px / 改行 ${focusLineChanges}`);
if(focusDimOpacity<.59)throw new Error(`焦点外の文脈が薄すぎます: ${focusDimOpacity}`);
let rangeFocus=null;
const rangeTarget=document.querySelector('[data-dd-chart] [data-dd-range-id]');
if(rangeTarget&&typeof echarts!=='undefined'){
 const rangeId=rangeTarget.getAttribute('data-dd-range-id'),slide=rangeTarget.closest('section[data-deck-slide]'),slideId=slide?.getAttribute('data-deck-id'),figure=rangeTarget.closest('[data-dd-chart]'),canvas=figure?.querySelector('.dd-chart-canvas'),sourceNode=figure?.querySelector('[data-dd-chart-source]');
 if(rangeId&&slideId&&canvas&&sourceNode){
  const source=JSON.parse(sourceNode.textContent??'{}'),expected=source.series.flatMap(series=>series.data).filter(datum=>datum.rangeId===rangeId).length;
  focus({slideId,stepId:'geometry-range',actions:[{id:'geometry-range-action',kind:'range',targets:[{slideId,kind:'range',id:rangeId}]}]});
  await new Promise(resolve=>setTimeout(resolve,50));
  const chart=echarts.getInstanceByDom(canvas),series=chart?.getOption().series??[],overlay=series.find(item=>String(item.id).startsWith('deck-focus-range-')),actual=overlay?.data?.filter(value=>value!==null&&value!=='-').length??0;
  focus({slideId,stepId:null,actions:[]});
  await new Promise(resolve=>setTimeout(resolve,20));
  const cleared=(chart?.getOption().series??[]).every(item=>!String(item.id).startsWith('deck-focus-range-'));
  rangeFocus={rangeId,expected,actual,cleared};
  if(actual!==expected||!cleared)throw new Error(`期間焦点の線が対象外へ広がるか解除後に残っています: ${JSON.stringify(rangeFocus)}`);
 }
}
const bodyEscapes=[],layoutIssues=[];
const outside=(inner,outer,tolerance)=>inner.top<outer.top-tolerance||inner.right>outer.right+tolerance||inner.bottom>outer.bottom+tolerance||inner.left<outer.left-tolerance;
const overlaps=(a,b,tolerance)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>tolerance&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>tolerance;
for(const slide of document.querySelectorAll('section[data-deck-slide]')){
 const body=slide.querySelector(':scope > .dd-body');if(!body)continue;
 const outer=body.getBoundingClientRect(),slideScale=slide.getBoundingClientRect().width/1280;
 for(const child of body.children){
  const inner=child.getBoundingClientRect();
  if(outside(inner,outer,slideScale)){
   bodyEscapes.push({slideId:slide.getAttribute('data-deck-id'),format:slide.getAttribute('data-dd-format'),tag:child.tagName,className:child.className});
  }
 }
 const title=slide.querySelector(':scope > .dd-title'),footer=slide.querySelector(':scope > .dd-footer');
 const visuals=[...body.querySelectorAll(':is(.dd-media-frame,.dd-profile-photo,img,video,.dd-chart-canvas,.dd-flow-diagram,table,pre)')].filter(node=>node.getClientRects().length>0&&node.closest('.dd-chart-fallback')===null);
 for(const visual of visuals){
  const rect=visual.getBoundingClientRect();
  if(outside(rect,outer,slideScale))layoutIssues.push({kind:'visual-outside-body',slideId:slide.getAttribute('data-deck-id'),tag:visual.tagName,className:visual.className});
  if(title&&overlaps(rect,title.getBoundingClientRect(),slideScale))layoutIssues.push({kind:'title-overlap',slideId:slide.getAttribute('data-deck-id'),tag:visual.tagName,className:visual.className});
  if(footer&&overlaps(rect,footer.getBoundingClientRect(),slideScale))layoutIssues.push({kind:'footer-overlap',slideId:slide.getAttribute('data-deck-id'),tag:visual.tagName,className:visual.className});
 }
 const format=slide.getAttribute('data-dd-format')??'';
 if(title&&(format.startsWith('image-')||['profile','product','screenshot','video'].includes(format))){
  const firstVisual=visuals.find(node=>node.matches('.dd-media-frame,.dd-profile-photo,video'));
  if(firstVisual&&(firstVisual.getBoundingClientRect().top-title.getBoundingClientRect().bottom)/slideScale<23)layoutIssues.push({kind:'title-media-gap',slideId:slide.getAttribute('data-deck-id')});
 }
 const logo=slide.querySelector(':scope > .dd-brand-mark');
 if(logo&&logo.getClientRects().length>0){
  const logoRect=logo.getBoundingClientRect();
  const content=[...slide.querySelectorAll(':scope > .dd-kicker,:scope > .dd-title,:scope > .dd-footer > *,:scope > .dd-body :is(img,video,svg,table,pre,h1,h2,h3,p,li,dt,dd)')].filter(node=>node.getClientRects().length>0&&node.closest('.dd-chart-fallback')===null);
  for(const node of content)if(overlaps(logoRect,node.getBoundingClientRect(),slideScale))layoutIssues.push({kind:'logo-content-overlap',slideId:slide.getAttribute('data-deck-id'),tag:node.tagName,className:node.className});
 }
}
if(bodyEscapes.length) throw new Error(`本文枠と見出し・脚注の重なり: ${JSON.stringify(bodyEscapes)}`);
if(layoutIssues.length) throw new Error(`画像・見出し・脚注・ロゴの重なり: ${JSON.stringify(layoutIssues)}`);
const flowVisualIssues=[],colorContext=document.createElement('canvas').getContext('2d');
const normalizedColor=value=>{if(colorContext===null)return value;colorContext.fillStyle='#000000';colorContext.fillStyle=value;return colorContext.fillStyle;};
for(const slide of document.querySelectorAll('section[data-dd-slide],section[data-deck-slide]')){
 const diagram=slide.querySelector('.dd-flow-diagram svg');if(!diagram)continue;
 if(diagram.querySelector('foreignObject')!==null)flowVisualIssues.push({kind:'html-label',slideId:slide.getAttribute('data-deck-id')});
 const slideStyle=getComputedStyle(slide),bg=normalizedColor(slideStyle.getPropertyValue('--dd-bg').trim()),muted=normalizedColor(slideStyle.getPropertyValue('--dd-muted').trim());
 const shapes=[...diagram.querySelectorAll('.node :is(rect,polygon,path,circle,ellipse),.cluster > rect')];
 if(diagram.querySelector('.node')!==null&&shapes.length===0)flowVisualIssues.push({kind:'missing-node-shape',slideId:slide.getAttribute('data-deck-id')});
 for(const shape of shapes){
  const style=getComputedStyle(shape);
  if(normalizedColor(style.fill)!==bg||Number.parseFloat(style.strokeWidth)<1.9||style.filter!=='none')flowVisualIssues.push({kind:'node',slideId:slide.getAttribute('data-deck-id'),fill:style.fill,strokeWidth:style.strokeWidth,filter:style.filter});
 }
 for(const part of diagram.querySelectorAll('.node,.node *')){
  const style=getComputedStyle(part);
  if(style.filter!=='none'||style.boxShadow!=='none')flowVisualIssues.push({kind:'node-shadow',slideId:slide.getAttribute('data-deck-id'),tag:part.tagName,className:part.getAttribute('class'),filter:style.filter,boxShadow:style.boxShadow});
 }
 for(const edge of diagram.querySelectorAll('.flowchart-link')){
  const style=getComputedStyle(edge);
  if(normalizedColor(style.stroke)!==muted||Number.parseFloat(style.strokeWidth)<1.9)flowVisualIssues.push({kind:'edge',slideId:slide.getAttribute('data-deck-id'),stroke:style.stroke,strokeWidth:style.strokeWidth});
 }
 for(const label of diagram.querySelectorAll('.edgeLabel p,.edgeLabel span')){
  const style=getComputedStyle(label);
  if(Number.parseFloat(style.fontSize)<19.5||normalizedColor(style.backgroundColor)!==bg)flowVisualIssues.push({kind:'edge-label',slideId:slide.getAttribute('data-deck-id'),fontSize:style.fontSize,background:style.backgroundColor});
 }
}
if(flowVisualIssues.length)throw new Error(`関係図の共通語彙が崩れています: ${JSON.stringify(flowVisualIssues)}`);
const fontMetrics=[...document.querySelectorAll('section[data-deck-slide] :is(h1,h2,h3,p,li,th,td,figcaption,svg text)')].filter(node=>node.getClientRects().length>0).map(node=>{
 const slide=node.closest('section[data-deck-slide]'),slideScale=slide.getBoundingClientRect().width/1280,fontSize=parseFloat(getComputedStyle(node).fontSize);
 const matrix=node instanceof SVGGraphicsElement?node.getScreenCTM():null,screenScale=matrix?Math.hypot(matrix.a,matrix.b):slideScale;
 return {slideId:slide.getAttribute('data-deck-id'),tag:node.tagName,logicalPx:fontSize*screenScale/Math.min(slideScale,1),screenPx:fontSize*screenScale};
});
const undersized=fontMetrics.filter(item=>item.logicalPx<19.5);
if(undersized.length)throw new Error(`図表を含む実画面の文字が目盛り未満: ${JSON.stringify(undersized)}`);
const overflow=[];
for(const slide of document.querySelectorAll('section[data-deck-slide]')){
 const outer=slide.getBoundingClientRect(),tolerance=slide.getBoundingClientRect().width/1280;
 if([...slide.children].some(child=>child.getClientRects().length>0&&outside(child.getBoundingClientRect(),outer,tolerance)))overflow.push(slide.getAttribute('data-deck-id'));
}
return {cases,elements:elementCount,maxDelta,lineChanges,focusDelta,focusLineChanges,focusDimOpacity,rangeFocus,bodyEscapes,layoutIssues,flowVisualIssues,fontMetrics:{minimumLogicalPx:Math.min(...fontMetrics.map(item=>item.logicalPx)),minimumScreenPx:Math.min(...fontMetrics.map(item=>item.screenPx))},overflow,images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0}))};
})()
