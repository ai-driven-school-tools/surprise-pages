import {writeFile} from 'node:fs/promises';

export async function saveDeckReport(info,name,value) {
  const file=info.outputPath(name+'.json');await writeFile(file,JSON.stringify(value,null,2));
  await info.attach(name,{path:file,contentType:'application/json'});
}

/** Installed in every frame before page scripts. No text, URLs or typed values
 * are collected. Counts are bounded and snapshots consume completed samples. */
export function installDeckBrowserProbe() {
  const state={events:[],gaps:[],dragGaps:[],tasks:[],paints:0,last:0,enabled:false,reloads:0,navReplacements:0,lifetimeGap:0,lifetimeTask:0,loops:[],lifetimeDelay:0,loopSamples:0};
  let previousFrame,previousRow,dragging=false,dragLast=0;
  addEventListener("pointermove",event=>{if(event.buttons)dragging=true;else{dragging=false;dragLast=0;}},true);
  for(const type of ["pointerup","pointercancel"])addEventListener(type,()=>{dragging=false;dragLast=0;},true);
  function identity(){const root=document.querySelector('surprise-comments')?.shadowRoot;return {frame:root?.querySelector('iframe.edit-frame'),row:root?.querySelector('.ds-slide')};}
  const append=(list,value)=>{list.push(value);if(list.length>4000)list.shift();};
  function frame(now){if(state.enabled){if(dragging){if(dragLast)append(state.dragGaps,now-dragLast);dragLast=now;}if(state.last){append(state.gaps,now-state.last);state.lifetimeGap=Math.max(state.lifetimeGap,now-state.last);}const current=identity();if(previousFrame&&current.frame!==previousFrame)state.reloads++;if(previousRow&&current.row!==previousRow)state.navReplacements++;previousFrame=current.frame;previousRow=current.row;}state.last=now;state.paints++;requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  // Idle/occluded frames may be throttled without blocking input. Measure
  // the event loop separately; keep frame cadence for active dragging.
  let previousTick=performance.now(),timer,tickAbort;
  const prioritized=typeof globalThis.scheduler?.postTask==='function';
  function scheduleTick(){if(prioritized){tickAbort=new AbortController();globalThis.scheduler.postTask(tick,{priority:'user-blocking',delay:50,signal:tickAbort.signal}).catch(()=>{});}else timer=setTimeout(tick,50);}
  function tick(){const now=performance.now();if(state.enabled&&!document.hidden){const delay=Math.max(0,now-previousTick-50);append(state.loops,delay);state.lifetimeDelay=Math.max(state.lifetimeDelay,delay);state.loopSamples++;}previousTick=now;scheduleTick();}
  scheduleTick();
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);tickAbort?.abort();previousTick=performance.now();scheduleTick();});
  // Settling looks at the last input and long task even while no operation
  // is being measured, so leftover work cannot leak into the next operation.
  let lastInput=0,lastTask=0;
  for(const type of ['pointerdown','keydown','wheel','input','paste','drop','compositionend'])addEventListener(type,()=>{lastInput=performance.now();},true);
  if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const item of list.getEntries()){lastTask=Math.max(lastTask,item.startTime+item.duration);if(state.enabled){append(state.tasks,item.duration);state.lifetimeTask=Math.max(state.lifetimeTask,item.duration);}}}).observe({type:'longtask',buffered:false});
  const eventTimings=entries=>{for(const entry of entries){const record=state.events.find(record=>record.type===entry.name&&Math.abs(record.at-entry.startTime)<1);if(record){record.ms=entry.duration;record.method='event-timing';record.delay=Math.max(0,entry.processingStart-entry.startTime);}}};
  const eventObserver=PerformanceObserver.supportedEntryTypes.includes('event')?new PerformanceObserver(list=>eventTimings(list.getEntries())):null;
  eventObserver?.observe({type:'event',durationThreshold:16,buffered:false});
  for(const type of ['click','keydown','beforeinput','input','change','paste','drop','compositionend','scroll','pointerup','pointermove'])addEventListener(type,event=>{
    if(!state.enabled||type==='pointermove'&&!event.buttons)return;
    const now=performance.now(),start=event.timeStamp>=0&&event.timeStamp<=now?event.timeStamp:now;
    const record={type,at:start,ms:null,method:null};append(state.events,record);
    requestAnimationFrame(()=>setTimeout(()=>{if(record.method!=='event-timing'){record.ms=performance.now()-start;record.method='paint-task';}},0));
  },true);
  window.deckBrowserProbe={
    start(){if(!state.enabled)previousTick=performance.now();state.loops=[];state.events=[];state.gaps=[];state.dragGaps=[];dragLast=0;state.tasks=[];state.last=0;state.enabled=true;state.reloads=0;state.navReplacements=0;const current=identity();previousFrame=current.frame;previousRow=current.row;},
    take(){if(eventObserver)eventTimings(eventObserver.takeRecords());const value={loopPriority:prioritized?'user-blocking':'timer',loops:state.loops,lifetimeDelay:state.lifetimeDelay,loopSamples:state.loopSamples,lifetimeGap:state.lifetimeGap,lifetimeTask:state.lifetimeTask,events:state.events,gaps:state.gaps,dragGaps:state.dragGaps,tasks:state.tasks,paints:state.paints,reloads:state.reloads,navReplacements:state.navReplacements};state.loops=[];state.events=[];state.gaps=[];state.dragGaps=[];state.tasks=[];state.reloads=0;state.navReplacements=0;return value;},
    stop(){state.enabled=false;},
    // Wait until the editor has no postponed work left (it marks the element
    // that owns it: src/widget/deck/deferred-work.ts), the page has had no input and
    // no long task for quietMs, and then for one idle turn. Background work
    // started by the previous operation (slide previews, list refresh, repaint
    // after save, source indexing) finishes before the next input. Postponed work
    // runs on timers and idle callbacks, so a quiet window alone can end just
    // before it starts.
    settle(quietMs,maxMs){
      const begin=performance.now(),idle=globalThis.requestIdleCallback??(callback=>setTimeout(callback,0));
      const deferred=()=>Boolean(document.querySelector('surprise-comments')?.shadowRoot?.querySelector('[data-deck-deferred]'));
      let deferredMs=0;
      return new Promise(resolve=>{
        const done=settled=>resolve({waitedMs:performance.now()-begin,deferredMs,settled});
        const check=()=>{
          const now=performance.now(),remaining=maxMs-(now-begin),wait=Math.max(lastInput,lastTask)+quietMs-now;
          if(remaining<=0)return done(false);
          if(deferred()){const step=Math.min(16,remaining)+1;deferredMs+=step;return void setTimeout(check,step);}
          if(wait>0)return void setTimeout(check,Math.min(wait,remaining)+1);
          idle(()=>{if(!deferred()&&Math.max(lastInput,lastTask)+quietMs<=performance.now())done(true);else check();},{timeout:Math.max(1,remaining)});
        };
        check();
      });
    },
  };
}

async function surfaces(page,preview) {
  const frames=[page.mainFrame()];
  if(preview){if(!preview.isDetached())frames.push(preview);return frames;}
  const locator=page.locator('surprise-comments').locator('iframe.edit-frame');
  if(await locator.count()) { const handle=await locator.elementHandle();const frame=await handle?.contentFrame();if(frame)frames.push(frame); }
  return frames;
}
export async function startDeckProbe(page,preview){for(const frame of await surfaces(page,preview))await frame.evaluate(()=>window.deckBrowserProbe?.start());}
/** Let the previous operation's deferred work finish before the next input.
 * Budgets are unchanged; this only stops unrelated work from overlapping it. */
export async function settleDeckProbe(page,preview,{quietMs=250,maxMs=3000}={}){
  const frames=await surfaces(page,preview),started=Date.now();let settled=true,deferredMs=0;
  // Both documents share one main thread. A second pass catches work that one
  // document started while the other was still settling; it is instant when quiet.
  for(let pass=0;pass<2;pass++){
    const results=(await Promise.all(frames.map(frame=>frame.evaluate(([quiet,max])=>window.deckBrowserProbe?.settle(quiet,max),[quietMs,maxMs])))).filter(Boolean);
    settled&&=results.every(result=>result.settled);deferredMs+=Math.max(0,...results.map(result=>result.deferredMs??0));
  }
  return {waitedMs:Date.now()-started,deferredMs,settled};
}
export async function readDeckProbe(page,preview){return Promise.all((await surfaces(page,preview)).map(frame=>frame.evaluate(()=>window.deckBrowserProbe?.take())));}

/** Pointer input into the editor frame without Playwright resolving the frame's owner element.
 * For an action inside a child frame, Playwright 1.63 checks that the owner <iframe> is the hit target
 * and adds its offset; each time it creates a handle to that element and builds a preview string of
 * all of its attributes. The edit frame's srcdoc is the whole 2.4MB deck, so that work runs on the
 * measured page's main thread next to the input (about 50ms per action at 3x CPU slowdown) and
 * allocates about 770MB per run, whose garbage collection then lands inside measured operations.
 * The inputs are the same trusted mouse events at the element's centre, after waiting for it to be
 * visible and scrolling it into view, as Playwright's own click does. Results are still asserted. */
export function editorFrameInput(page) {
  const offset=()=>page.evaluate(()=>{
    const frame=document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame');
    if(!frame)throw Error('editor frame is unavailable');
    const rect=frame.getBoundingClientRect(),style=getComputedStyle(frame);
    return {x:rect.x+frame.clientLeft+parseFloat(style.paddingLeft),y:rect.y+frame.clientTop+parseFloat(style.paddingTop)};
  });
  async function box(locator){
    await locator.waitFor({state:'visible'});
    const rect=await locator.evaluate(node=>{node.scrollIntoView({block:'nearest',inline:'nearest'});const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
    const origin=await offset();
    return {x:origin.x+rect.x,y:origin.y+rect.y,width:rect.width,height:rect.height};
  }
  const centre=async locator=>{const r=await box(locator);return {x:r.x+r.width/2,y:r.y+r.height/2};};
  return {
    box,
    async click(locator,{modifiers=[]}={}){
      const point=await centre(locator);
      for(const key of modifiers)await page.keyboard.down(key);
      try{await page.mouse.click(point.x,point.y);}finally{for(const key of [...modifiers].reverse())await page.keyboard.up(key);}
    },
    async dblclick(locator){const point=await centre(locator);await page.mouse.dblclick(point.x,point.y);},
  };
}
