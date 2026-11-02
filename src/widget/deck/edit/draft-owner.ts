import { LocalizedError } from "../../../lib/i18n/errors";
/** sessionStorage survives reload; a Web Lock detects its copy in a duplicated tab. */
export function deckDraftPrefix(account:string,page:string):string { return `sp-deck-edit-draft:${encodeURIComponent(account)}:${encodeURIComponent(page)}:`; }
export function rememberDeckDraft(account:string,page:string,key:string):void{
  const prefix=deckDraftPrefix(account,page);
  if(!key.startsWith(prefix)||!/^[0-9a-f-]{36}$/.test(key.slice(prefix.length)))throw new LocalizedError("deckEditor.sync.draftOwnerMismatch");
  sessionStorage.setItem(prefix+"tab",key.slice(prefix.length));
}

export async function claimDeckDraft(key:string):Promise<(() => Promise<void>)|null>{
  if(!navigator.locks)return async()=>{};
  let finish=()=>{};
  const held=new Promise<void>(resolve=>{finish=resolve;});
  let completed:Promise<void>=Promise.resolve();
  const acquired=await new Promise<boolean>((resolve,reject)=>{
    completed=navigator.locks.request(key,{ifAvailable:true},async lock=>{resolve(Boolean(lock));if(lock)await held;}).then(()=>{});
    void completed.catch(reject);
  });
  return acquired?async()=>{finish();await completed;}:null;
}

export async function availableDeckDrafts(account:string,page:string,currentKey:string):Promise<string[]>{
  const prefix=deckDraftPrefix(account,page);
  const locks=navigator.locks?await navigator.locks.query():{held:[]};
  const active=new Set(locks.held?.map(lock=>lock.name));
  const keys:string[]=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)&&(key===currentKey||!active.has(key)))keys.push(key);}
  return keys;
}

export async function deckDraftOwner(account: string, page: string): Promise<{ key: string; release(): Promise<void> }> {
  const prefix = deckDraftPrefix(account,page);
  const slot = prefix + "tab";
  let tab: string;
  try { tab = sessionStorage.getItem(slot) ?? crypto.randomUUID(); }
  catch { tab = crypto.randomUUID(); }
  if (!navigator.locks) {
    // Never share a writable key between tabs on older engines.
    return { key: prefix + crypto.randomUUID(), async release() {} };
  }
  for (;;) {
    const release=await claimDeckDraft(prefix+tab);
    if (release) {
      try { sessionStorage.setItem(slot, tab); } catch { /* A failed tab marker cannot corrupt another tab. */ }
      return { key: prefix + tab, release };
    }
    tab = crypto.randomUUID();
  }
}
