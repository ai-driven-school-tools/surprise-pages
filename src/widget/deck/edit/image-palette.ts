import {z} from "zod";
import {deckEditImagePathSchema} from "../../../lib/deck/edit/model";
import {deckIcon} from "../ui";
import {el} from "../../shared/util";
import {t} from "../../shared/i18n";

const assetSchema=z.object({id:z.uuid(),title:z.string(),width:z.number(),height:z.number(),source:z.string().nullable(),sourcePageUrl:z.string().nullable(),previewUrl:z.string()});
const dimensions={title:z.string().max(2000),width:z.number().positive(),height:z.number().positive()};
export const paletteChoiceSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("current"),src:deckEditImagePathSchema,...dimensions}).strict(),
 z.object({kind:z.literal("remote"),provider:z.literal("library"),value:z.string().max(24000),...dimensions,sourcePageUrl:z.url().optional()}).strict()
]);
export type PaletteChoice=z.infer<typeof paletteChoiceSchema>;
export type CurrentImage={src:string;title:string;width:number;height:number;previewUrl:string};
type Tab="current"|"recent";
type Input={page:string;current:()=>CurrentImage[];chooseFile:()=>void;addLink:()=>void;choose:(choice:PaletteChoice)=>void;open:(open:boolean)=>boolean;resetTarget:()=>void};

/** One persistent shelf; a single source is visible at a time. */
export function createDeckImagePalette(input:Input){
 const root=el("aside","ds-image-panel");root.hidden=true;root.id=`images-${crypto.randomUUID()}`;root.setAttribute("aria-label",t("deckEditor.images.palette"));
 const header=el("div","ds-image-header"),title=el("h2",undefined,t("deckEditor.images.title")),close=control(t("deckEditor.images.closePalette"),()=>setOpen(false));close.replaceChildren(deckIcon("close"));header.append(title,close);
 const tabs=el("div","ds-image-tabs");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label",t("deckEditor.images.sources"));
 let selected:Tab="current",opened=false,replacing=false,disposed=false,loaded=false;
 let libraryController:AbortController|undefined,returnFocus:HTMLElement|null=null;
 const panels=new Map<Tab,HTMLElement>(),buttons=new Map<Tab,HTMLButtonElement>();
 const body=el("div","ds-image-body"),currentPanel=el("section"),recentPanel=el("section");
 for(const [id,label,panel] of [["current",t("deckEditor.images.tabCurrent"),currentPanel],["recent",t("deckEditor.images.tabRecent"),recentPanel]] satisfies [Tab,string,HTMLElement][]){
  const tab=control(label,()=>selectTab(id));tab.setAttribute("role","tab");tab.id=`${root.id}-${id}-tab`;tab.setAttribute("aria-controls",`${root.id}-${id}`);
  panel.id=`${root.id}-${id}`;panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",tab.id);panels.set(id,panel);buttons.set(id,tab);tabs.append(tab);body.append(panel);
 }
 const currentGrid=el("div","ds-image-grid"),recentGrid=el("div","ds-image-grid"),announcement=el("span","ds-media-announcement");announcement.setAttribute("role","status");announcement.setAttribute("aria-live","polite");
 currentPanel.append(currentGrid);recentPanel.append(recentGrid);
 const footer=el("footer","ds-image-footer"),transfers=el("div","ds-image-transfers"),actions=el("div","ds-image-actions"),upload=control(t("deckEditor.images.upload"),input.chooseFile),link=control(t("deckEditor.images.link"),input.addLink);upload.prepend(deckIcon("upload"));link.prepend(deckIcon("link"));actions.append(upload,link);footer.append(transfers,actions);root.append(header,tabs,body,footer,announcement);
 const transferItems=new Map<string,{state:string;message:string;retry:()=>void;cancel:()=>void;canCancel:boolean;sourceUrl?:string}>();
 function paintTransfers(){
  transfers.replaceChildren();const entries=[...transferItems.entries()],failed=entries.find(([,v])=>v.state==="failed"),pending=entries.filter(([,v])=>["working","queued"].includes(v.state)),chosen=failed??pending[0]??entries.find(([,v])=>v.state==="saved");if(!chosen)return;
  const [id,item]=chosen,row=el("div","ds-image-transfer"),busy=["working","queued"].includes(item.state);row.dataset.state=item.state;row.setAttribute("role","status");row.append(el("p",undefined,item.state==="saved"?t("deckEditor.images.added"):busy&&pending.length>1?t("deckEditor.images.adding",{count:pending.length}):item.message));
  if(item.state==="failed"){row.append(control(t("deckEditor.images.retry"),item.retry));if(item.sourceUrl&&/^https:\/\//.test(item.sourceUrl)){const link=el("a",undefined,t("deckEditor.images.sourcePage"));link.href=item.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";row.append(link);}}
  if(item.state==="saved")row.append(control(t("deckEditor.images.adjust"),()=>setOpen(false)));
  if(!busy||item.canCancel)row.append(control(busy?t("deckEditor.images.stop"):t("deckEditor.images.close"),()=>{if(item.state!=="saved")item.cancel();transferItems.delete(id);paintTransfers();}));transfers.append(row);
 }
 function transfer(id:string,state:string,message:string,retry:()=>void,cancel:()=>void,canCancel:boolean,sourceUrl?:string){
  if(disposed)return;if(state==="dismissed"||state==="cancelled")transferItems.delete(id);else transferItems.set(id,{state,message,retry,cancel,canCancel,sourceUrl});paintTransfers();
  if(state==="saved")setTimeout(()=>{if(transferItems.get(id)?.state==="saved"){transferItems.delete(id);if(!disposed)paintTransfers();}},4000);
 }
 let recent: z.infer<typeof assetSchema>[]=[];
 function control(label:string,action:()=>void){const button=el("button","ds-button",label);button.type="button";button.setAttribute("aria-label",label);button.onclick=action;return button;}
 function empty(grid:HTMLElement,heading:string,note:string,action?:()=>void){const state=el("div","ds-image-empty");state.append(deckIcon("image"),el("strong",undefined,heading),el("p",undefined,note));if(action)state.append(control(t("deckEditor.images.retry"),action));grid.replaceChildren(state);}
 function selectTab(id:Tab){selected=id;for(const [key,panel] of panels){panel.hidden=key!==id;const button=buttons.get(key)!;button.setAttribute("aria-selected",String(key===id));button.tabIndex=key===id?0:-1;}if(id==="current")paintCurrent();if(id==="recent")void loadRecent();}
 function card(choice:PaletteChoice,url:string,source?:string|null,sourceUrl?:string|null){
  const card=el("div","ds-image-card"),button=control(replacing?t("deckEditor.images.replaceNamed",{title:choice.title}):t("deckEditor.images.addNamed",{title:choice.title}),()=>input.choose(choice));button.className="ds-image-pick";button.title=choice.title;button.draggable=true;button.dataset.imageTitle=choice.title;
  const image=el("img");image.src=url;image.alt="";image.loading="lazy";image.draggable=false;button.replaceChildren(image);
  image.onerror=()=>{image.hidden=true;button.append(el("span","ds-image-unavailable",t("deckEditor.images.noPreview")));};
  button.ondragstart=event=>{event.dataTransfer?.setData("application/x-surprise-image-palette",JSON.stringify(choice));if(event.dataTransfer)event.dataTransfer.effectAllowed="copy";};card.append(button);
  const caption=el("div","ds-image-caption");if(sourceUrl&&/^https?:\/\//.test(sourceUrl)){const a=el("a",undefined,source||t("deckEditor.images.source"));a.href=sourceUrl;a.target="_blank";a.rel="noopener noreferrer";a.title=t("deckEditor.images.openSource");caption.append(a);}else caption.append(el("span",undefined,source||choice.title));
  if(choice.kind!=="current")caption.append(el("span",undefined,`${choice.width} × ${choice.height}`));card.append(caption);return card;
 }
 function paintCurrent(){const images=input.current();currentGrid.replaceChildren(...images.map(image=>card({kind:"current",src:image.src,title:image.title,width:image.width,height:image.height},image.previewUrl)));if(!images.length)empty(currentGrid,t("deckEditor.images.currentTitle"),t("deckEditor.images.currentNote"));}
 async function loadRecent(force=false){
  if(disposed||loaded&&!force||libraryController)return;
  const abort=new AbortController();libraryController=abort;
  if(!recent.length)empty(recentGrid,t("deckEditor.images.recentLoading"),t("deckEditor.images.wait"));
  try{const response=await fetch(`/api/pages/deck-edit/image-library?${new URLSearchParams({page:input.page})}`,{credentials:"same-origin",signal:abort.signal});if(!response.ok)throw new Error();const data=z.object({recent:z.array(assetSchema)}).parse(await response.json());if(disposed||abort.signal.aborted)return;recent=data.recent;loaded=true;recentGrid.replaceChildren(...recent.map(item=>card({kind:"remote",provider:"library",value:item.id,title:item.title,width:item.width,height:item.height},item.previewUrl,item.source,item.sourcePageUrl)));if(!recent.length)empty(recentGrid,t("deckEditor.images.recentTitle"),t("deckEditor.images.recentNote"));}
  catch{if(!abort.signal.aborted)empty(recentGrid,t("deckEditor.images.loadFailed"),t("deckEditor.images.checkConnection"),()=>void loadRecent(true));}finally{if(libraryController===abort)libraryController=undefined;}
 }
 function resetMode(){replacing=false;title.textContent=t("deckEditor.images.title");input.resetTarget();for(const button of root.querySelectorAll<HTMLElement>("[data-image-title]"))button.setAttribute("aria-label",t("deckEditor.images.addNamed",{title:button.dataset.imageTitle??""}));}
 function setOpen(value:boolean,replace=false){if(!input.open(value))return;const wasOpen=opened;opened=value;root.hidden=!value;if(!value){resetMode();returnFocus?.focus();return;}replacing=replace;title.textContent=replace?t("deckEditor.images.change"):t("deckEditor.images.title");if(!replace)input.resetTarget();if(!wasOpen){const scope=root.getRootNode();const active=scope instanceof ShadowRoot?scope.activeElement:document.activeElement;returnFocus=active instanceof HTMLElement?active:null;}paintCurrent();selectTab(selected);for(const button of root.querySelectorAll<HTMLElement>("[data-image-title]"))button.setAttribute("aria-label",replace?t("deckEditor.images.replaceNamed",{title:button.dataset.imageTitle??""}):t("deckEditor.images.addNamed",{title:button.dataset.imageTitle??""}));buttons.get(selected)?.focus();}
 tabs.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const keys=[...buttons.keys()],at=keys.indexOf(selected),next=event.key==="Home"?0:event.key==="End"?keys.length-1:(at+(event.key==="ArrowRight"?1:-1)+keys.length)%keys.length;selectTab(keys[next]);buttons.get(keys[next])?.focus();});
 root.addEventListener("keydown",event=>{if(event.key==="Escape"&&!event.isComposing){event.preventDefault();event.stopPropagation();setOpen(false);}});
 selectTab(selected);
 return {root,setOpen,resetMode,transfer,isOpen:()=>opened,refresh(){resetMode();if(opened&&selected==="current")paintCurrent();loaded=false;if(opened&&selected==="recent")void loadRecent(true);},dispose(){disposed=true;libraryController?.abort();}};
}
