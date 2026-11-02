/** Count the actual native subscriptions in every frame, including srcdoc startup. */
export async function trackReadingLayoutObservers(page) {
 await page.addInitScript(()=>{
  const Native=window.ResizeObserver;
  const observers=[];
  window.ResizeObserver=class extends Native {
   constructor(callback){super(callback);this.targets=new Set();observers.push(this);}
   observe(target,options){super.observe(target,options);this.targets.add(target);}
   unobserve(target){super.unobserve(target);this.targets.delete(target);}
   disconnect(){super.disconnect();this.targets.clear();}
  };
  window.readingLayoutObserverCount=()=>observers.reduce((count,observer)=>count+[...observer.targets].filter(target=>target.isConnected&&target.matches('main[data-deck-slides],.deck-step-controls')).length,0);
 });
}
