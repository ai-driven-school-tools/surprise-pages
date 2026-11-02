import { BROWSER_TEMPLATES, BROWSER_TEMPLATE_CATEGORIES, browserTemplate, browserTemplateCategoryText, browserTemplateText, type BrowserTemplate, type BrowserTemplateRef } from '../../../lib/deck/design/browser-templates';
import type { DeckAppearance } from '../../../lib/deck/design/design';
import { createDeckTemplatePreviews, type PreviewState, type PreviewLogo } from './template-preview';
import { el } from '../../shared/util';
import { t } from '../../shared/i18n';
// 基本の型と分類の名前は、その人の言語で出す（見本集の名前は原稿と同じ生成物のまま）
const named=(item:BrowserTemplate)=>browserTemplateText(item,t);
const grouped=(group:{id:string;name:string;description?:string})=>browserTemplateCategoryText({...group,description:group.description??''},t);

export const DECK_LIBRARY_PICKER_STYLES = `
.dp-library { --picker-list-height:clamp(calc(var(--size-control)*6),calc(100dvh - var(--size-control)*14),calc(var(--size-control)*16)); color:var(--text); font-size:var(--font-base); min-height:0; position:relative; }
.dp-library [hidden] { display:none!important; }
.dp-library * { box-sizing:border-box; }
.dp-library button,.dp-library input,.dp-library select { font:inherit; color:inherit; }
.dp-library button { cursor:pointer; background:transparent; border:0; }
.dp-library button:disabled { cursor:default; opacity:.5; }
.dp-library :focus-visible { outline:var(--rule-thick) solid var(--text); outline-offset:var(--space-1); }
.dp-tools { display:flex; align-items:center; gap:var(--space-4); margin-bottom:var(--space-5); }
.dp-tools input { flex:1; min-width:0; width:100%; padding:var(--space-2) var(--space-3); border:var(--rule-thin) solid var(--border); border-radius:var(--radius-sm); background:transparent; }
.dp-count,.dp-description { color:var(--muted); font-size:var(--font-sm); line-height:var(--leading-normal); }
.dp-count { white-space:nowrap; }
.dp-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,3fr) minmax(0,2fr); gap:var(--space-5); align-items:start; }
.dp-categories { display:flex; flex-direction:column; gap:var(--space-2); max-height:var(--picker-list-height); overflow:auto; }
.dp-categories button { text-align:left; padding:var(--space-2) 0; color:var(--muted); line-height:var(--leading-normal); }
.dp-categories button[aria-pressed=true] { color:var(--text); font-weight:var(--weight-bold); }
.dp-results { overflow:auto; max-height:var(--picker-list-height); min-width:0; padding:var(--space-1); }
.dp-results section+section { margin-top:var(--space-6); }
.dp-results h3 { margin:0 0 var(--space-1); font-size:var(--font-md); font-weight:var(--weight-bold); }
.dp-group-note { margin:0 0 var(--space-4); color:var(--muted); font-size:var(--font-sm); line-height:var(--leading-normal); }
.dp-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5) var(--space-4); }
.dp-card { display:block; min-width:0; padding:0; text-align:left; }
.dp-card strong { display:block; font-size:var(--font-base); font-weight:var(--weight-medium); margin-top:var(--space-2); line-height:var(--leading-normal); }
.dp-summary { display:block; margin-top:var(--space-1); color:var(--muted); font-size:var(--font-sm); font-weight:var(--weight-normal); line-height:var(--leading-normal); }
.dp-preview { display:grid; place-items:center; font-size:var(--font-sm); color:var(--muted); text-align:center; background:var(--surface-sunken); border:var(--rule-thin) solid var(--border); border-radius:var(--radius-sm); }
.dp-card[aria-pressed=true] .dp-preview { outline:var(--rule-thick) solid var(--text); outline-offset:var(--rule-thick); }
.dp-detail { min-width:0; }
.dp-detail h3 { font-size:var(--font-md); margin:var(--space-4) 0 var(--space-2); }
.dp-detail .dp-description { margin:0; }
.dp-selection-empty { display:grid; place-items:center; aspect-ratio:16/9; color:var(--muted); font-size:var(--font-sm); text-align:center; padding:var(--space-4); }
.dp-confirm { display:flex; justify-content:flex-end; margin-top:var(--space-5); }
.dp-confirm button { padding:var(--space-3) var(--space-4); border-radius:var(--radius-sm); background:var(--text); color:var(--surface); font-weight:var(--weight-medium); }
.dp-status { position:absolute; width:var(--rule-thin); height:var(--rule-thin); overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.dp-filter { max-width:50%; min-width:0; padding:var(--space-2) var(--space-3); border:var(--rule-thin) solid var(--border); border-radius:var(--radius-sm); background:var(--surface); }
.dp-browse .dp-layout { display:block; }
.dp-browse .dp-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
.dp-browse .dp-results { max-height:none; overflow:visible; }
.dp-browse .dp-tools { gap:var(--space-3); margin-bottom:var(--space-5); }
.dp-zoom { width:min(90vw,calc(var(--size-popover)*3)); max-height:90dvh; overflow:auto; border:0; border-radius:var(--radius-md); padding:var(--space-5); background:var(--surface); color:var(--text); }
.dp-zoom::backdrop { background:color-mix(in srgb,var(--text) 30%,transparent); }
.dp-zoom header { display:flex; justify-content:space-between; align-items:center; gap:var(--space-4); margin-bottom:var(--space-4); }
.dp-zoom h3 { margin:0; font-size:var(--font-lg); }
.dp-zoom button { padding:var(--space-2); }
@media(max-width:760px) {
 .dp-browse .dp-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
 .dp-layout { grid-template-columns:minmax(0,1fr); }
 .dp-categories { flex-direction:row; overflow:auto; gap:var(--space-4); max-height:none; }
 .dp-categories button { flex:none; }
 .dp-library:not(.dp-browse) .dp-results { max-height:40vh; }
 .dp-detail { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:var(--space-4); }
 .dp-detail h3 { margin-top:0; }
}
`;

type Options = {
  selected?: BrowserTemplateRef | null;
  onSelection?: (ref: BrowserTemplateRef) => void;
  confirmLabel?: string;
  browse?: boolean;
  logo?: PreviewLogo;
  scrollRoot?: HTMLElement;
};

/** A theme gallery and an insertion chooser share the same bounded preview pool. */
export function createDeckLibraryPicker(box: HTMLElement, initialAppearance: DeckAppearance, select: (id: string, basic: boolean) => void, options: Options = {}) {
  const root = el('div', options.browse ? 'dp-library dp-browse' : 'dp-library');
  const style = el('style'); style.textContent = DECK_LIBRARY_PICKER_STYLES;
  const tools = el('div', 'dp-tools');
  const search = el('input'); search.type='search'; search.placeholder=t("deckEditor.library.search"); search.setAttribute('aria-label',t("deckEditor.library.search"));
  const count = el('span', 'dp-count');
  const status=el('p','dp-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  tools.append(search, count);
  const layout = el('div', 'dp-layout'), categories = el('nav', 'dp-categories'); categories.setAttribute('aria-label',t("deckEditor.library.categories"));
  const results = el('div','dp-results'), detail = el('div','dp-detail');
  detail.setAttribute('aria-live','polite');
  if(!options.browse)layout.append(categories);layout.append(results);if(!options.browse)layout.append(detail);
  root.append(style, tools, status, layout); box.append(root);
  const previews=createDeckTemplatePreviews(root,options.scrollRoot);
  const zoom=el('dialog','dp-zoom');zoom.setAttribute('aria-label',t("deckEditor.library.zoom"));root.append(zoom);
  let appearance=initialAppearance,logo=options.logo,category='all';
  let selected = options.selected ? browserTemplate(options.selected) : undefined;
  let disposers: (() => void)[] = [],disposeDetail: (() => void) | undefined;
  let confirm: HTMLButtonElement | undefined;
  function updateStatus() {
    const pending=results.querySelectorAll('[data-preview-state="loading"]').length;
    const failed=results.querySelectorAll('[data-preview-state="error"]').length;
    status.textContent=pending?t("deckEditor.library.updating"):failed?t("deckEditor.library.retryHint"):'';
    root.setAttribute('aria-busy',String(pending>0));
  }
  function drawDetail(parent:HTMLElement) {
    disposeDetail?.();parent.replaceChildren();if(!selected)return;
    const preview=el('div','dp-preview'),text=el('div');
    if(parent===detail)text.append(el('h3',undefined,named(selected).name));
    text.append(el('p','dp-description',named(selected).description));
    if(selected.hasSampleImage)text.append(el('p','dp-description',t("deckEditor.library.sampleImage")));
    parent.append(preview,text);
    const warning=el('p','dp-description');text.append(warning);
    const mounted=previews.mount(preview,selected,appearance,named(selected).name,state=>{warning.textContent=state==='ready'&&preview.dataset.logoHidden==='true'?t("deckEditor.library.logoHidden"):'';},logo);
    disposeDetail=mounted.dispose;
  }
  if (options.confirmLabel) {
    const actions = el('div','dp-confirm');
    confirm = el('button', undefined, options.confirmLabel); confirm.type='button';
    confirm.onclick = () => {if(selected) select(selected.id, selected.kind === 'basic');};
    actions.append(confirm); root.append(actions);
  }
  function showSelected() {
    if (confirm) confirm.disabled = !selected;
    for(const card of results.querySelectorAll<HTMLButtonElement>('[data-choice]')) {
      const active = card.dataset.choice === (selected ? `${selected.kind}:${selected.id}` : '');
      card.setAttribute('aria-pressed',String(active));card.tabIndex=active?0:-1;
      const mark=card.querySelector('.dp-selected');if(mark)mark.textContent=active?(options.browse?t("deckEditor.library.viewing"):t("deckEditor.library.selected")):'';
    }
    if (!results.querySelector('[data-choice][tabindex="0"]')) {
      const first=results.querySelector<HTMLButtonElement>('[data-choice]');if(first)first.tabIndex=0;
    }
    if(options.browse)return;
    if(!selected){detail.replaceChildren(el('div','dp-selection-empty',t("deckEditor.library.emptySelection")));return;}
    drawDetail(detail);
  }
  function enlarge(card:HTMLButtonElement) {
    disposeDetail?.();zoom.replaceChildren();
    const header=el('header'),close=el('button',undefined,t("deckEditor.library.close"));close.type='button';close.onclick=()=>zoom.close();
    header.append(el('h3',undefined,(selected?named(selected).name:t("deckEditor.library.example"))),close);
    const content=el('div');zoom.append(header,content);zoom.showModal();drawDetail(content);
    zoom.onclose=()=>{disposeDetail?.();disposeDetail=undefined;zoom.replaceChildren();card.focus();};
  }
  function render() {
    const scroller=options.scrollRoot??results,scroll=scroller.scrollTop;
    disposers.forEach(dispose=>dispose());disposers=[];results.replaceChildren();
    const query=search.value.normalize('NFKC').trim().toLocaleLowerCase();
    const filtered=BROWSER_TEMPLATES.filter(item=>(category==='all'||item.category===category)&&`${named(item).name} ${named(item).description}`.normalize('NFKC').toLocaleLowerCase().includes(query));
    count.textContent=t('deckEditor.library.count',{count:filtered.length});
    if(!filtered.length)results.append(el('p','dp-description',t("deckEditor.library.noMatch")));
    for(const group of BROWSER_TEMPLATE_CATEGORIES) {
      const entries=filtered.filter(item=>item.category===group.id);if(!entries.length)continue;
      const section=el('section'),grid=el('div','dp-grid');section.append(el('h3',undefined,grouped(group).name),el('p','dp-group-note',grouped(group).description),grid);results.append(section);
      for(const item of entries) {
        const card=el('button','dp-card');card.type='button';card.dataset.choice=`${item.kind}:${item.id}`;card.setAttribute('aria-label',named(item).name);
        const preview=el('div','dp-preview'),label=el('strong');label.append(el('span','dp-selected'),el('span',undefined,named(item).name));
        card.append(preview,label);{const summary=named(item).summary;if(summary)card.append(el('span','dp-summary',summary));}grid.append(card);
        let state:PreviewState='idle';
        const mounted=previews.mount(preview,item,appearance,named(item).name,next=>{state=next;card.setAttribute('aria-disabled',String(next==='idle'||next==='loading'));updateStatus();},logo);
        disposers.push(mounted.dispose);
        card.onclick=()=>{
          if(state==='error'){mounted.retry();return;}
          if(state!=='ready')return;
          selected=item;showSelected();
          if(options.browse)enlarge(card);else options.onSelection?.({id:item.id,kind:item.kind});
        };
      }
    }
    scroller.scrollTop=scroll;showSelected();updateStatus();
  }
  const groups=[{id:'all',name:t("deckEditor.library.all")},...BROWSER_TEMPLATE_CATEGORIES];
  if(options.browse){
    const filter=el('select','dp-filter');filter.setAttribute('aria-label',t("deckEditor.library.categories"));
    for(const group of groups){const option=el('option',undefined,group.id==='all'?t("deckEditor.library.allCategories"):grouped(group).name);option.value=group.id;filter.append(option);}
    filter.onchange=()=>{category=filter.value;if(options.scrollRoot)options.scrollRoot.scrollTop=0;render();};tools.insertBefore(filter,count);
  }else for(const group of groups) {
    const button=el('button',undefined,grouped(group).name);button.type='button';button.setAttribute('aria-pressed',String(group.id===category));
    button.onclick=()=>{category=group.id;results.scrollTop=0;for(const other of categories.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));render();};categories.append(button);
  }
  search.addEventListener('input',()=>{(options.scrollRoot??results).scrollTop=0;render();});render();
  results.addEventListener('keydown',event=>{
    if(!(event.target instanceof HTMLButtonElement)||!event.target.dataset.choice)return;
    const cards=[...results.querySelectorAll<HTMLButtonElement>('[data-choice]')],index=cards.indexOf(event.target);
    const grid=event.target.parentElement;
    const columns=grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:2;
    const step={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns}[event.key];
    const next=event.key==='Home'?0:event.key==='End'?cards.length-1:step===undefined?-1:Math.max(0,Math.min(cards.length-1,index+step));
    if(next<0)return;event.preventDefault();for(const card of cards)card.tabIndex=-1;cards[next].tabIndex=0;cards[next].focus();
  });
  const dispose=()=>{disposers.forEach(fn=>fn());disposeDetail?.();if(zoom.open)zoom.close();previews.dispose();root.remove();};
  return Object.assign(dispose,{
    setAppearance(next:DeckAppearance,nextLogo?:PreviewLogo){
      if(JSON.stringify([appearance,logo])===JSON.stringify([next,nextLogo]))return;
      appearance=next;logo=nextLogo;previews.cancelPending();if(zoom.open)zoom.close();render();
    },
  });
}
