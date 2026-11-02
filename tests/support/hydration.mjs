/**
 * Server-rendered controls are visible and clickable before React hydrates them, and an action in that
 * gap does nothing: a click opens no dialog, a selected option never reaches React's state. On slow CI
 * runners that gap is wide enough to hit (the recording share dialog never opened, 7 of 257 runs).
 * Wait until React has attached the element's props — the moment its handlers become live —
 * re-resolving the locator each time in case hydration replaced the element.
 */
export async function whenHydrated(locator,{timeout=20000}={}){
  const deadline=Date.now()+timeout;
  while(!(await locator.evaluate(element=>Object.keys(element).some(key=>key.startsWith('__reactProps$'))))){
    if(Date.now()>deadline)throw new Error('画面の操作が使えるようになりません（React が部品に受け口を付けていません）');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return locator;
}
