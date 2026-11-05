/* 生成物。直接編集しない。元のコードは src/widget/*.ts、作り直しは `pnpm build:widget`。 */
import{b as s,c as L,d as x,e as A}from"./comments-widget-chunk-3ZY4TE6T.js";import{F as E}from"./comments-widget-chunk-OZQBLJBL.js";import{k as y}from"./comments-widget-chunk-IMYVJ2VC.js";import{C as r,Na as k,Ra as w,Sa as T,i as n,j as m,k as v}from"./comments-widget-chunk-25DSFE4M.js";import"./comments-widget-chunk-6ECDCATY.js";import"./comments-widget-chunk-UQVG7YRY.js";import"./comments-widget-chunk-BJN73O4D.js";var H="surprise-latest";function M(i){return[`--ink: ${i.text};`,`--ink-muted: ${i.muted};`,"--ground: var(--page-ground, Canvas);",`--line: color-mix(in srgb, ${i.text} ${i.lineMix}%, transparent);`,`--hover: color-mix(in srgb, ${i.text} ${i.hoverMix}%, transparent);`,`--press: color-mix(in srgb, ${i.text} ${i.pressMix}%, transparent);`].join(" ")}var C=`
:host {
  all: initial;
  position: fixed;
  top: var(--latest-top, 0px);
  left: 0;
  right: 0;
  z-index: 2147482300;
  display: block;
  height: ${44}px;
  --control: 32px;
  --radius: 6px;
  color-scheme: light;
  ${M(x.light)}
}
:host([data-tone="dark"]) { color-scheme: dark; ${M(x.dark)} }
*, *::before, *::after { box-sizing: border-box; }
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 12px 0 16px;
  background: color-mix(in srgb, var(--ground) 84%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--ink);
  font: 400 14px/20px ${A};
  -webkit-font-smoothing: antialiased;
  white-space: nowrap;
  transition: box-shadow ${m.quick}ms ${v};
}
:host([data-scrolled]) .bar { box-shadow: 0 1px 0 var(--line); }
/* 狭い画面では、いつ・誰がの添えから先に縮める。それでも入らなければ何が起きたかも縮める（押す部品は画面の外へ出さない） */
.text { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.detail { flex: 0 100 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink-muted); }
.detail[hidden] { display: none; }
button {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: var(--control);
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background-color ${m.quick}ms ${v};
  -webkit-tap-highlight-color: transparent;
}
button:hover { background: var(--hover); }
button:active { background: var(--press); }
:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .bar, button { transition: none; } }
@media print { :host { display: none !important; } }
`;function P(){let i=r("div","bar"),t=r("span","text");t.setAttribute("role","status");let e=r("span","detail"),o=r("button");return o.type="button",i.append(t,e,o),{bar:i,text:t,detail:e,button:o}}var d=class{constructor(){this.mounted=null}show(t){let e=this.mounted??this.mount();e.text.textContent!==t.text&&(e.text.textContent=t.text);let o=t.detail??"";e.detail.textContent!==o&&(e.detail.textContent=o),e.detail.hidden=o.length===0,t.title===null?e.detail.removeAttribute("title"):e.detail.title=t.title,e.button.textContent!==t.action&&(e.button.textContent=t.action),e.onAction=t.onAction}hide(){let t=this.mounted;t!==null&&(this.mounted=null,t.stop(),t.host.remove(),s.set("latest",0))}get visible(){return this.mounted!==null}mount(){let t=document.createElement(H),e=t.attachShadow({mode:"open"}),o=r("style");o.textContent=C;let{bar:a,text:l,detail:p,button:g}=P();e.append(o,a),document.body.append(t);let b=()=>{t.style.setProperty("--latest-top",`${s.above("latest")}px`)};b();let S=s.watch(b);s.set("latest",44);let u=()=>{t.toggleAttribute("data-scrolled",window.scrollY>0)};u(),window.addEventListener("scroll",u,{passive:!0});let c=()=>L(t);c();let f=window.matchMedia("(prefers-color-scheme: dark)");f.addEventListener("change",c);let h={host:t,text:l,detail:p,button:g,stop:()=>{S(),window.removeEventListener("scroll",u),f.removeEventListener("change",c)},onAction:()=>{}};return g.addEventListener("click",()=>h.onAction()),this.mounted=h,h}};var I=30*1e3;function _(i){return i===401||i===403||i===404}function D(i,t,e=new Date){let o=w(i.committedAt,e),a=k(i.committedAt),l=i.authorName.trim(),p=o.length===0?null:l.length>0?n("toolbox.latest.pageDetailNamed",{time:o,name:l,ago:a}):n("toolbox.latest.pageDetail",{time:o,ago:a});return{text:n("toolbox.latest.pageNewer"),detail:p,title:o.length===0?null:T(i.committedAt),action:n("toolbox.latest.reload"),onAction:t}}var N=class{constructor(t){this.host=t;this.bar=new d;this.disposed=!1;this.stopped=!1;this.newer=null;this.asked=null;this.asking=!1;this.confirming=!1;this.tickTimer=null}observe(t){this.disposed||this.stopped||this.asking||this.newer!==null||t===null||t===this.host.shownVersion||t===this.asked||this.ask(t)}dispose(){this.disposed=!0,this.stopTick(),this.bar.hide()}async ask(t){this.asking=!0,this.asked=t;let e=await y(this.host.slug);if(this.asking=!1,!this.disposed){if(!e.ok){_(e.status)?this.stopped=!0:this.asked=null;return}e.value===null||e.value.sha===this.host.shownVersion||(this.newer=e.value,this.paint())}}paint(){if(this.disposed||this.newer===null)return;let t=D(this.newer,()=>this.reload());this.confirming?this.bar.show({...t,detail:n("toolbox.latest.unsent"),title:null}):this.bar.show(t),this.startTick()}reload(){if(this.host.unsent()&&!this.confirming){this.confirming=!0,this.paint();return}E(),window.location.reload()}startTick(){this.tickTimer===null&&(this.tickTimer=window.setTimeout(()=>{this.tickTimer=null,document.visibilityState==="visible"?this.paint():this.startTick()},I))}stopTick(){this.tickTimer!==null&&(window.clearTimeout(this.tickTimer),this.tickTimer=null)}};export{N as PageLatest,D as pageNotice};
