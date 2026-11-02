import { z } from 'zod';
import { themeMutationSchema, type MyTheme, type ThemeSnapshot } from '../../../lib/deck/design/theme-model';
import { documentTheme } from '../../../lib/deck/design/theme-source';
import { deckEditOperationsSchema } from '../../../lib/deck/edit/model';
import { fetchMyThemes,mutateTheme,themeResultSchema,ThemeRequestFailure } from './theme-client';
import { createDeckTemplatePreviews } from './template-preview';
import type { Input } from '../workspace/types';
import { localizedMessage } from '../../../lib/i18n/errors';
import { el } from '../../shared/util';
import { t } from '../../shared/i18n';

export const THEME_DIALOG_STYLES=`
.dt-dialog{width:min(90vw,calc(var(--size-popover)*2));max-height:90dvh;overflow:auto;border:0;border-radius:var(--radius-md);padding:var(--space-5);background:var(--surface);color:var(--text);font-size:var(--font-base)}
.dt-dialog::backdrop{background:color-mix(in srgb,var(--text) 30%,transparent)}
.dt-dialog h2{font-size:var(--font-lg);margin:0 0 var(--space-4)}
.dt-dialog p{line-height:var(--leading-normal)}
.dt-dialog label{display:flex;flex-direction:column;gap:var(--space-2);margin:var(--space-4) 0}
.dt-dialog input,.dt-dialog select{font:inherit;color:inherit;padding:var(--space-2);background:var(--surface);border:var(--rule-thin) solid var(--border);border-radius:var(--radius-sm)}
.dt-dialog button{font:inherit;cursor:pointer;padding:var(--space-2) var(--space-3);border:0;border-radius:var(--radius-sm);background:transparent;color:inherit}
.dt-dialog .dt-primary{background:var(--text);color:var(--surface)}
.dt-dialog button:disabled{opacity:.5;cursor:default}
.dt-dialog :focus-visible{outline:var(--rule-thick) solid var(--text);outline-offset:var(--space-1)}
.dt-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-3);margin-top:var(--space-4)}
.dt-note{font-size:var(--font-sm);color:var(--muted)}
.dt-error{color:var(--danger);font-size:var(--font-sm)}
`;
type Options={input?:Input;selected?:MyTheme;onChange?:()=>void};
export function openThemeDialog(host:HTMLElement,mode:'save'|'apply'|'manage',options:Options={}) {
 const origin=host.getRootNode() instanceof ShadowRoot?host.getRootNode():document;
 const previous=origin instanceof ShadowRoot?origin.activeElement:document.activeElement;
 const style=el('style');style.textContent=THEME_DIALOG_STYLES;
 const dialog=el('dialog','dt-dialog');const title=mode==='save'?t('decks.themeDialog.saveTitle'):mode==='apply'?t('decks.themeDialog.applyTitle'):t('decks.themeDialog.manageTitle');
 dialog.setAttribute('aria-label',title);dialog.append(el('h2',undefined,title),el('p','dt-note',t('decks.themeDialog.loading')));host.append(style,dialog);dialog.showModal();
 const previews=createDeckTemplatePreviews(dialog);let mounted:ReturnType<typeof previews.mount>|null=null,closed=false,working=false;
 function close(){if(working)return;closed=true;mounted?.dispose();previews.dispose();dialog.close();dialog.remove();style.remove();if(previous instanceof HTMLElement)previous.focus();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 const button=(text:string,fn:()=>void,primary=false)=>{const b=el('button',primary?'dt-primary':undefined,text);b.type='button';b.onclick=fn;return b;};
 const error=el('p','dt-error');error.setAttribute('role','alert');
 async function prepare(){
  try{
   const [themes,saved]=await Promise.all([fetchMyThemes(),options.input?.savedSource()??Promise.resolve(null)]);if(closed)return;
   const initial=saved?documentTheme(saved.html):null;
   let selected:MyTheme|undefined=options.selected??themes[0];
   let snapshot:ThemeSnapshot|undefined=mode==='save'?initial??undefined:selected?.snapshot;
   let pending:z.infer<typeof themeMutationSchema>|null=null;
   dialog.replaceChildren(el('h2',undefined,title));
   const selector=el('select');selector.setAttribute('aria-label',mode==='save'?t('decks.themeDialog.destination'):t('decks.themeDialog.myTheme'));
   if(mode==='save'){const item=el('option',undefined,t('decks.themeDialog.saveAsNew'));item.value='';selector.append(item);}
   for(const theme of themes){const item=el('option',undefined,theme.name);item.value=theme.id;selector.append(item);}
   selector.value=mode==='save'?'':selected?.id??'';
   const name=el('input');name.maxLength=60;name.required=true;name.value=mode==='save'?'':selected?.name??'';name.placeholder=t('decks.themeDialog.namePlaceholder');name.setAttribute('aria-label',t('decks.themeDialog.name'));
   const selectLabel=el('label',undefined,mode==='save'?t('decks.themeDialog.destination'):t('decks.themeDialog.myTheme'));selectLabel.append(selector);dialog.append(selectLabel);
   const nameLabel=el('label',undefined,t('decks.themeDialog.name'));nameLabel.append(name);if(mode!=='apply')dialog.append(nameLabel);
   if(mode==='save')dialog.append(el('p','dt-note',t('decks.themeDialog.saveNote')));
   const holder=el('div'),note=el('p','dt-note');dialog.append(holder,note,error);
   const draw=()=>{mounted?.dispose();holder.replaceChildren();if(!snapshot){holder.textContent=t('decks.themeDialog.empty');return;}const base=mode==='save'?options.input?.frame.contentDocument?.baseURI??location.href:location.origin+'/';mounted=previews.mount(holder,{kind:'basic',id:'title'},snapshot.appearance,t('decks.themeDialog.previewTitle'),state=>{if(state==='error')error.textContent=t('decks.themeDialog.previewFailed');},{value:snapshot.logo,base});note.textContent=mode==='apply'?snapshot.logo?t('decks.themeDialog.applyWithLogo'):t('decks.themeDialog.applyWithoutLogo'):'';};
   selector.onchange=()=>{selected=themes.find(theme=>theme.id===selector.value);if(mode!=='save'){snapshot=selected?.snapshot;name.value=selected?.name??'';draw();}};draw();
   const actions=el('div','dt-actions'),cancel=button(t('decks.themeDialog.close'),close);
   const execute=async(action:'save'|'rename'|'delete'|'apply')=>{
    if(working)return;
    try{
     if(!pending){
      const requestId=crypto.randomUUID();
      if(action==='save'){
       if(!saved||!options.input)throw new Error(t('decks.themeDialog.saveFirst'));
       pending=themeMutationSchema.parse({action,requestId,name:name.value,page:options.input.pageSlug,baseVersionId:saved.versionId,...(selected&&selector.value?{replace:{id:selected.id,version:selected.version}}:{})});
      }else if(selected){pending=themeMutationSchema.parse({action,requestId,theme:{id:selected.id,version:selected.version},...(action==='rename'?{name:name.value}:{}),...(action==='apply'&&options.input&&saved?{page:options.input.pageSlug,baseVersionId:saved.versionId}:{})});}
      else throw new Error(t('decks.themeDialog.chooseTheme'));
     }
     working=true;error.textContent='';for(const field of dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button'))field.disabled=true;
     const result=await mutateTheme(pending);
     if(pending.action==='apply'){
      const value=z.object({operations:deckEditOperationsSchema}).parse(result);
      if(!options.input?.commit(value.operations))throw new Error(t('decks.themeDialog.applyFailed'));
     }else if(pending.action!=='delete'){themeResultSchema.parse(result);}
     working=false;options.onChange?.();close();
    }catch(cause){working=false;if(cause instanceof ThemeRequestFailure&&cause.status>=400&&cause.status<500){pending=null;}error.textContent=cause instanceof z.ZodError?t('decks.themeDialog.nameLength'):cause instanceof Error?localizedMessage(cause,t):t('decks.themeDialog.saveFailed');for(const b of actions.querySelectorAll('button'))b.disabled=false;if(!pending){selector.disabled=false;name.disabled=false;}else{actions.replaceChildren(button(t('decks.themeDialog.retrySame'),()=>void execute(action),true),button(t('decks.themeDialog.close'),close));}}
   };
   if(mode==='manage'){
    actions.append(button(t('decks.themeDialog.delete'),()=>{
     note.textContent=t('decks.themeDialog.deleteNote');
     actions.replaceChildren(button(t('decks.themeDialog.back'),()=>{close();openThemeDialog(host,mode,options);}),button(t('decks.themeDialog.deleteTheme'),()=>void execute('delete'),true));
    }),button(t('decks.themeDialog.rename'),()=>void execute('rename'),true));
   }else if(mode==='save'||selected)actions.append(button(mode==='save'?t('decks.themeDialog.save'):t('decks.themeDialog.apply'),()=>void execute(mode),true));
   actions.append(cancel);dialog.append(actions);
   if(mode==='save')name.focus();else selector.focus();
  }catch(cause){if(closed)return;dialog.replaceChildren(el('h2',undefined,title),error,button(t('decks.themeDialog.retry'),()=>void prepare()),button(t('decks.themeDialog.close'),close));error.textContent=cause instanceof Error?localizedMessage(cause,t):t('decks.themeDialog.loadFailed');}
 }
 void prepare();return close;
}
