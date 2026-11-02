'use client';

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { DECK_PRESETS, type DeckAppearance } from '@/lib/deck/design/design';
import { deckStyleText } from '@/lib/deck/design/style-options';
import { useT } from '../../_components/i18n';
import { deckCreateRequestSchema, deckCreateResultSchema } from '@/lib/deck/create-model';
import { clearPendingDeckCreation, readPendingDeckCreation, writePendingDeckCreation, type PendingDeckCreation } from '@/lib/deck/create-draft';
import { observeDeferredSize } from '@/widget/shared/deferred-resize';
import { createDeckLibraryPicker } from '@/widget/deck/edit/library-picker';
import { fetchMyThemes } from '@/widget/deck/edit/theme-client';
import { openThemeDialog } from '@/widget/deck/edit/theme-dialog';
import { myThemesSchema, type MyTheme } from '@/lib/deck/design/theme-model';
import type { PreviewLogo } from '@/widget/deck/edit/template-preview';
import { TOKENS } from '@/widget/shared/tokens';
import { ALERT, FIELD, META, PAGE_WORKSPACE, PRIMARY, SECTION_HEADING, SECTION_NOTE } from '../../_components/styles';
import { PageHeader } from '../../_components/page-header';
import { ThemePicker } from './theme-picker';

function TemplateGallery({appearance,logo,locked}: {appearance:DeckAppearance;logo?:PreviewLogo;locked:boolean}) {
  const holder=useRef<HTMLDivElement>(null);
  const picker=useRef<ReturnType<typeof createDeckLibraryPicker>|null>(null);
  const initialAppearance=useEffectEvent(()=>({appearance,logo}));
  useEffect(()=>{
    const node=holder.current;if(!node)return;
    const shadow=node.shadowRoot??node.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=`${TOKENS}:host{display:block;--font-base:var(--font-md);--surface:#fff;--text:#171717;--muted:#737373;--surface-sunken:#f5f5f5;--border:#e5e5e5;font-family:inherit;}@media(prefers-color-scheme:dark){:host{--surface:#0a0a0a;--text:#f5f5f5;--muted:#a3a3a3;--surface-sunken:#171717;--border:#404040;}}`;
    const container=document.createElement('div');shadow.replaceChildren(style,container);
    const scrollRoot=node.closest<HTMLElement>('[data-create-scroll]');
    const current=createDeckLibraryPicker(container,initialAppearance().appearance,()=>{},{browse:true,logo:initialAppearance().logo,scrollRoot:scrollRoot??undefined});picker.current=current;
    return ()=>{current();picker.current=null;shadow.replaceChildren();};
  },[]);
  useEffect(()=>{picker.current?.setAppearance(appearance,logo);},[appearance,logo]);
  return <div ref={holder} inert={locked} />;
}

const subscribe=()=>()=>{};
class CreationFailure extends Error {}
export function DeckCreate({account}: {account:string}) {
  const t=useT();
  const mounted=useSyncExternalStore(subscribe,()=>true,()=>false);
  return mounted?<CreationForm account={account}/>:<main className={PAGE_WORKSPACE}><p className={SECTION_NOTE}>{t('decks.create.preparing')}</p></main>;
}

function CreationForm({account}: {account:string}) {
  const t=useT();
  const [pending,setPending]=useState<PendingDeckCreation|null>(()=>{
    try{return readPendingDeckCreation(sessionStorage,account);}catch{return null;}
  });
  const [themeId,setThemeId]=useState(pending?.request.themeId??'paper');
  const [myThemes,setMyThemes]=useState<MyTheme[]>([]),[chosen,setChosen]=useState<MyTheme|null>(null),[themeError,setThemeError]=useState(false);
  const [revision,setRevision]=useState(0);
  const [themesLoading,setThemesLoading]=useState(true);
  const manager=useRef<HTMLDivElement>(null);
  const scrollArea=useRef<HTMLDivElement>(null),themeRail=useRef<HTMLElement>(null);
  useEffect(()=>{
    const area=scrollArea.current,rail=themeRail.current;if(!area||!rail)return;
    const fit=()=>{const columns=rail.parentElement?getComputedStyle(rail.parentElement).gridTemplateColumns.split(' ').length:1;rail.style.position=columns>1&&rail.offsetHeight<=area.clientHeight?'sticky':'static';};
    const observer=observeDeferredSize(area.ownerDocument,fit);observer?.observe(area);observer?.observe(rail);fit();return()=>observer?.disconnect();
  },[]);
  useEffect(()=>{let disposed=false;void fetchMyThemes().then(async themes=>{
    if(disposed)return;setMyThemes(themes);setThemeError(false);
    const ref=pending?.request.myTheme;
    if(ref){let found=themes.find(item=>item.id===ref.id&&item.version===ref.version);if(!found){const response=await fetch('/api/deck-themes?'+new URLSearchParams(ref),{credentials:'same-origin',cache:'no-store'});if(response.ok)found=myThemesSchema.parse(await response.json()).themes[0];}if(!disposed)setChosen(found??null);}else setChosen(current=>current?themes.find(item=>item.id===current.id)??null:null);
  }).catch(()=>{if(!disposed)setThemeError(true);}).finally(()=>{if(!disposed)setThemesLoading(false);});return()=>{disposed=true;};},[revision,pending?.request.myTheme]);
  function manage(item:MyTheme){const node=manager.current;if(!node)return;const shadow=node.shadowRoot??node.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=TOKENS;const container=document.createElement('div');shadow.replaceChildren(style,container);openThemeDialog(container,'manage',{selected:item,onChange:()=>{setRevision(value=>value+1);}});}
  const [title,setTitle]=useState(pending?.request.title??'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const sending=useRef(false);
  const standard=DECK_PRESETS.find(item=>item.id===themeId)??DECK_PRESETS[0];
  const theme=chosen?{...chosen,appearance:chosen.snapshot.appearance}:{...standard,name:deckStyleText(standard,t).name};
  const logo=chosen?{value:chosen.snapshot.logo,base:window.location.origin+'/'}:undefined;
  const waitingForTheme=!!pending?.request.myTheme&&!chosen;
  const locked=!!pending||busy;
  async function create() {
    if(sending.current)return;
    sending.current=true;setBusy(true);setError('');
    try {
      // A legacy, uncertain request must be replayed unchanged, including its first slide.
      const record=pending??{createdAt:Date.now(),request:deckCreateRequestSchema.parse({requestId:crypto.randomUUID(),themeId,title:title.trim()||t('decks.create.untitled'),firstSlide:null,...(chosen?{myTheme:{id:chosen.id,version:chosen.version}}:{})})};
      writePendingDeckCreation(sessionStorage,account,record);setPending(record);
      if(record.url){window.location.assign(record.url);return;}
      const response=await fetch('/api/pages/deck-edit/create',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record.request),signal:AbortSignal.timeout(20000),
      });
      if(!response.ok){
        if(response.status===409){const body=await response.json().catch(()=>null);if(body?.code==='theme_unavailable'){clearPendingDeckCreation(sessionStorage,account);setPending(null);setChosen(null);setRevision(value=>value+1);throw new CreationFailure(t('decks.create.themeChanged'));}}
        if([400,403,413].includes(response.status)){
          clearPendingDeckCreation(sessionStorage,account);setPending(null);
          throw new CreationFailure(t('decks.create.checkSelection'));
        }
        throw new CreationFailure(response.status===401?t('decks.create.loginRequired'):t('decks.create.resultUnknown'));
      }
      const result=deckCreateResultSchema.parse(await response.json()),completed={...record,url:result.url};
      writePendingDeckCreation(sessionStorage,account,completed);setPending(completed);window.location.assign(result.url);
    }catch(cause){setError(cause instanceof CreationFailure?cause.message:t('decks.create.failed'));}
    finally{sending.current=false;setBusy(false);}
  }
  return <main className={PAGE_WORKSPACE}>
    <PageHeader title={t("decks.create.title")} back={{ href: "/create", label: t("decks.create.back") }} />
    <div ref={scrollArea} data-create-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <div className="grid items-start gap-8 pb-6 lg:grid-cols-3">
      <section ref={themeRail} aria-label={t("decks.create.themeSection")} className="top-0 min-w-0 self-start">
        <h2 className={SECTION_HEADING}>{t("decks.create.chooseTheme")}</h2>
        <div ref={manager}/>
        <ThemePicker themeId={themeId} chosen={chosen} myThemes={myThemes}
          waitingForTheme={waitingForTheme} loading={themesLoading} error={themeError?t('decks.create.themesLoadFailed'):''} locked={locked}
          choosePreset={id=>{setChosen(null);setThemeId(id);}} chooseMine={setChosen} manage={manage}
          retry={()=>{setThemesLoading(true);setRevision(value=>value+1);}} />
      </section>
      <section aria-label={t("decks.create.previewSection")} className="min-w-0 lg:col-span-2">
        <h2 className={SECTION_HEADING}>{t("decks.create.previewSection")}</h2>
        <p aria-live="polite" className={`${META} mb-4`}>{t('decks.create.selected',{name:waitingForTheme?t('decks.create.checkingTheme'):theme.name})}</p>
        {waitingForTheme?<p className={SECTION_NOTE}>{t('decks.create.waitingTheme')}</p>:<TemplateGallery appearance={theme.appearance} logo={logo} locked={locked}/>}
      </section>
    </div>
    </div>
    <footer data-theme-footer className="shrink-0 bg-(--ws-bg) pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">{t("decks.create.documentName")}<input className={FIELD} value={title} maxLength={100} placeholder={t("decks.create.untitled")} onChange={event=>setTitle(event.target.value)} disabled={locked}/></label>
        <button type="button" className={PRIMARY} disabled={busy} onClick={()=>void create()}>{busy?t('decks.create.creating'):pending?.url?t('decks.create.openCreated'):pending?t('decks.create.retrySame'):t('decks.create.createWithTheme')}</button>
      </div>
      <p className={`${META} mt-2`}>{t('decks.create.meta')}</p>
      {pending&&!pending.url&&<p role="status" className={`${META} mt-2`}>{t('decks.create.pendingNote')}</p>}
      {error&&<p role="alert" className={`${ALERT} mt-2`}>{error}</p>}
    </footer>
  </main>;
}
