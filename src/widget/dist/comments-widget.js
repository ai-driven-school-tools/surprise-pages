/* 生成物。直接編集しない。元のコードは src/widget/*.ts、作り直しは `pnpm build:widget`。 */
import{a as As,b as Ae,c as Is,d as ei,e as ti}from"./comments-widget-chunk-3ZY4TE6T.js";import{a as ct}from"./comments-widget-chunk-QGM4RBOY.js";import{a as Un,b as Rs}from"./comments-widget-chunk-V556YJMR.js";import{e as Os,j as Ms,k as Hs,l as Ns}from"./comments-widget-chunk-HLSUO2BX.js";import{c as yn}from"./comments-widget-chunk-ZOH7ENPP.js";import{A as Es,B as Bo,C as Vo,D as Ss,E as Ts,F as Wn,G as Zr,H as Ls,a as wo,b as Xa,c as Qa,d as Oo,e as zn,f as Za,g as Gr,h as es,i as Et,j as Io,k as ts,l as qn,m as ns,n as Yr,o as Mo,p as os,q as ws,r as ys,s as No,t as Do,u as xs,v as ks,w as Cs,x as Kn,y as Qr,z as _o}from"./comments-widget-chunk-OZQBLJBL.js";import{a as vo,c as Ds,d as _s}from"./comments-widget-chunk-MFC6A7BI.js";import{a as ni,h as Bs,m as Vs}from"./comments-widget-chunk-3P2J55J7.js";import{a as Ps}from"./comments-widget-chunk-DRFSQEBA.js";import{b as da,c as wn,d as rs,e as is,f as as,g as Jr,h as jr,i as Ho,j as Xr,k as ss,l as ls,m as ds,n as cs,o as us,p as ps,r as fs,s as hs,t as ms,u as gs,v as vs,w as bs}from"./comments-widget-chunk-IMYVJ2VC.js";import{$ as Lo,A as Mt,Aa as $a,B as Vr,Ba as za,C as i,Ca as qa,D as oe,Da as Ka,E as So,Ea as Wa,F as lt,Fa as vn,G as Fr,Ga as Ua,H as hn,Ha as Wr,I as pt,Ia as Ur,J as ca,Ja as Ct,K as ua,Ka as Ht,L as pa,La as Fn,M as To,Ma as bn,N as fa,Na as Nt,O as Je,Oa as Ga,P as mn,Pa as Ya,Q as ha,Qa as Ro,R as Gt,S as gn,Sa as ut,T as ma,Ta as Ja,U as Yt,Ua as ja,V as ga,Va as $n,W as va,X as ba,Y as $r,Z as wa,_ as ya,aa as xa,ba as Ao,ca as ka,da as Ca,ea as Ea,f as bo,fa as Vn,g as Mr,ga as zr,ha as Po,i as a,ia as Sa,j as Fe,ja as Ta,k as $e,ka as La,l as ko,la as Aa,m as sa,ma as Pa,n as It,na as qr,o as we,oa as Ra,p as fn,pa as Oa,q as se,qa as Ia,r as Co,ra as Ma,sa as Ha,ta as Kr,ua as Na,va as Da,w as la,wa as _a,x as bt,xa as Ba,y as Ut,ya as Va,z as Eo,za as Fa}from"./comments-widget-chunk-25DSFE4M.js";import{d as ra}from"./comments-widget-chunk-KZMF5WDR.js";import"./comments-widget-chunk-KDFMM342.js";import{a as Kt,b as ia,c as Hr,f as Nr,g as Dr,h as yo,i as xo,j as Wt,p as _r,q as Br,s as aa}from"./comments-widget-chunk-6ECDCATY.js";import{b as Or,c as oa,d as Ir}from"./comments-widget-chunk-UQVG7YRY.js";import{c as Ce,d as kt,e as vt,f as Ve}from"./comments-widget-chunk-BJN73O4D.js";function Jt(e,t){if(e===null||e.length===0||t.length===0)return!1;let n=e.toLowerCase(),o=t.toLowerCase();if(n===o)return!0;let s=n.length<=o.length?n:o,d=n.length<=o.length?o:n;return s.length>=7&&d.startsWith(s)}function Fs(e,t){return e.filter(n=>n.parentId===null&&n.quote!==null&&n.quote.length>0&&Jt(n.pageVersion,t))}function Fo(e,t){let n=wo(e.text);if(n.length===0)return!1;let o=wo(t.thenText),s=t.nowText===null?"":wo(t.nowText);return e.kind==="del"?o.length>0&&(o.includes(n)||n.includes(o)):e.kind==="add"?s.length>0&&(s.includes(n)||n.includes(s)):!1}function jt(e){return e==="changed"||e==="gone"}var Tc="/api/avatars/";function $s(e){return e.startsWith(Tc)}var oi="surprise-pages:views",qs="surprise-pages:views:off";function Ks(e){return`surprise-pages:views:sent:${e}`}function zs(e){let t=Date.parse(e);return Number.isNaN(t)?0:t}function Ws(e){return[...e].sort((t,n)=>zs(n.lastViewedAt)-zs(t.lastViewedAt))}function Us(e,t,n){let o=e.find(f=>f.href===t.href)??null,s=e.filter(f=>f.href!==t.href),d={href:t.href,title:t.title,lastViewedAt:n,viewCount:o===null?1:o.viewCount+1};return Ws([d,...s]).slice(0,200)}function Lc(e){return typeof e=="object"&&e!==null}function Ac(e){if(!Lc(e))return null;let{href:t,title:n,lastViewedAt:o,viewCount:s}=e;return typeof t!="string"||t.length===0||typeof n!="string"||typeof o!="string"||typeof s!="number"||!Number.isFinite(s)?null:{href:t,title:n,lastViewedAt:o,viewCount:Math.max(1,Math.floor(s))}}function Gs(e){if(e===null)return[];let t;try{t=JSON.parse(e)}catch{return[]}if(!Array.isArray(t))return[];let n=[];for(let o of t){let s=Ac(o);s!==null&&n.push(s)}return Ws(n).slice(0,200)}function Ys(e){return JSON.stringify(e)}function Js(e){return e==="1"}var js=[["open",a("toolbox.list.filter.open")],["changed",a("toolbox.list.filter.changed")],["resolved",a("toolbox.list.filter.resolved")],["all",a("toolbox.list.filter.all")]],ri=[["document",a("toolbox.list.sort.document")],["newest",a("toolbox.list.sort.newest")],["oldest",a("toolbox.list.sort.oldest")],["priority",a("toolbox.list.sort.priority")]],zo="open",qo="document";function Pc(e){let t=js.find(n=>n[0]===e);return t===void 0?e:t[1]}function Rc(e){let t=ri.find(n=>n[0]===e);return t===void 0?e:t[1]}function Ko(e,t,n){return t==="open"?e.resolvedAt===null:t==="resolved"?e.resolvedAt!==null:t==="changed"?e.resolvedAt===null&&n.has(e.id):!0}function xn(e){return e.resolvedAt===null?"open":"resolved"}function $o(e){return e==="good"?Or.length:Or.indexOf(e)}function Xs(e,t){return e===zo&&t===qo}function Qs(e,t){let n=[];return e!==zo&&n.push(Pc(e)),t!==qo&&n.push(Rc(t)),n.join(" ・ ")}function Zs(e,t,n){return js.filter(([o])=>o!=="changed"||o===e?!0:n&&t.changed>0)}function el(e,t){return e==="open"?t.resolved===0?null:{to:"resolved",label:a("toolbox.list.tail.seeResolved",{count:t.resolved})}:e==="resolved"||e==="changed"?t.open===0?null:{to:"open",label:a("toolbox.list.tail.backToOpen",{count:t.open})}:null}function ii(e){return e.length===0?null:e.some(t=>t.resolvedAt===null)?"resolve":"reopen"}function tl(e,t){return e==="resolve"?a("toolbox.list.bulk.resolve",{count:t}):a("toolbox.list.bulk.reopen",{count:t})}function Oc(e,t,n,o){if(n==="newest")return t.createdAt.localeCompare(e.createdAt);if(n==="oldest")return e.createdAt.localeCompare(t.createdAt);if(n==="priority"){let f=$o(e.priority)-$o(t.priority);return f!==0?f:e.createdAt.localeCompare(t.createdAt)}let s=(o.get(e.id)??Number.MAX_SAFE_INTEGER)-(o.get(t.id)??Number.MAX_SAFE_INTEGER);if(s!==0)return s;let d=$o(e.priority)-$o(t.priority);return d!==0?d:e.createdAt.localeCompare(t.createdAt)}function Wo(e,t,n){return[...e].sort((o,s)=>Oc(o,s,t,n))}function nl(e){let t=ct(),n=(...c)=>e.handleFailure(...c),o=(...c)=>e.render(...c),s=(...c)=>e.setOpen(...c),d=(...c)=>e.hidePopover(...c),f=(...c)=>e.hideSelectionBar(...c),C=(...c)=>e.hideMarkPeek(...c),R=(...c)=>e.pushToast(...c),h=(...c)=>e.fillOutcomes(...c),A=(...c)=>e.syncMarks(...c),N=(...c)=>e.outcomeTargetVersion(...c),te=(...c)=>e.closeOriginCompare(...c),ce=(...c)=>e.renderPanelBody(...c),me=(...c)=>e.isNarrow(...c),P=(...c)=>e.outcomeOf(...c),ue=(...c)=>e.appendQuoteStory(...c),ve=(...c)=>e.topLevel(...c),_={versions:null,moreVersions:!1,compare:null,get slug(){return e.state.slug},set slug(c){e.state.slug=c},get view(){return e.state.view},set view(c){e.state.view=c},get outcomesFor(){return e.state.outcomesFor},set outcomesFor(c){e.state.outcomesFor=c},get outcomes(){return e.state.outcomes},set outcomes(c){e.state.outcomes=c},get features(){return e.state.features},set features(c){e.state.features=c},get comments(){return e.state.comments},set comments(c){e.state.comments=c}},ge=null,xe=null,je=/^[0-9a-f]{7,40}$/i;function Pe(c){return c!==null&&je.test(c)?c:null}function Re(){return new URL(window.location.href).searchParams}function Xe(c,x){let L=Re();x===null?L.delete("v"):L.set("v",x),c===null?L.delete("from"):L.set("from",c);let T=L.toString();return`${window.location.pathname}${T.length>0?`?${T}`:""}${window.location.hash}`}function Ee(c,x){Wn();let L=new URL(Xe(c,x),window.location.href);L.hash="",window.location.href=L.href}function Qe(){return _.compare!==null}function F(c,x){let L=x.toLowerCase();return c.find(T=>T.sha.toLowerCase()===L)??c.find(T=>T.sha.toLowerCase().startsWith(L))??null}async function H(){if(_.versions!==null)return _.versions;let c=await ds(_.slug);return t.disposed?null:c.ok?(_.versions=c.value.versions,_.moreVersions=c.value.more,o(),c.value.versions):(n(c),null)}function De(c){if(xe!==null)return c.sha.startsWith(xe);let x=_.versions;return x!==null&&x.length>0&&x[0].sha===c.sha}async function be(){_.view="versions",s(!0),await H(),t.disposed}async function K(c,x,L){if(!De(x)){Ee(c.sha,x.sha);return}L&&window.history.pushState(null,"",Xe(c.sha,xe)),await Z(c,x),t.disposed}async function Z(c,x){Vo(Bo(),()=>{qn(),Qr(!0)}),d(),f(),C(),_.compare={kind:"history",from:c,to:x,diff:null,placed:new Set,activeIndex:0},o();let L=_.compare,T=await cs(_.slug,c.sha,x.sha);if(t.disposed)return;let D=_.compare;if(D===L&&!(D===null||D.from.sha!==c.sha||D.to.sha!==x.sha)){if(!T.ok){if(We(),T.status===401){n(T);return}R(a("toolbox.history.diffFailed"),"failure",()=>{K(c,x,!1)});return}D.diff=T.value,D.placed=Vo(Bo(),()=>{let Q=ks(T.value.changes);return Cs(T.value.images.added),Q}),await h(x.sha),!t.disposed&&_.compare===D&&(Do(Ae.total()),o(),Kn(),Se())}}function Me(){_.compare=null,Ze(),Vo(Bo(),()=>{_o(),Qr(!1),A(!0)}),_.view==="changes"&&(_.view="versions");let c=N();_.outcomesFor!==c&&(_.outcomes=new Map,_.outcomesFor=null,h(c))}function ae(){if(_.compare!==null){if(_.compare.kind==="origin"){if(te(),_.view==="origin"){_.view="comments",s(!1);return}o();return}if(Me(),xe!==null){Ee(null,null);return}window.history.pushState(null,"",Xe(null,null)),o()}}function We(){_.compare!==null&&(Me(),window.history.replaceState(null,"",Xe(null,xe)),o())}async function w(){let c=Pe(Re().get("from"));if(c===null){Qe()&&_.compare?.kind!=="origin"&&(Me(),o());return}if(!_.features.history)return;let x=await H();if(t.disposed||x===null||Pe(Re().get("from"))!==c)return;let L=F(x,c),T=xe===null?x[0]??null:F(x,xe);if(L===null||T===null||L.sha===T.sha){Qe()&&(Me(),o());return}let D=_.compare;D!==null&&D.from.sha===L.sha&&D.to.sha===T.sha||(await Z(L,T),t.disposed)}function Ue(){if(Pe(Re().get("v"))!==xe){Wn(),window.location.reload();return}w()}let ot=600,Oe=0,He=null;function Ie(c){let x=c.diff;return x===null?[]:x.changes.filter(L=>c.placed.has(L.index))}function Ge(c){let x=_.compare;x===null||x.diff===null||(x.activeIndex=c,No(x.diff.changes,c),de(),_.view==="changes"&&ce())}function Ne(c){let x=_.compare;x===null||!x.placed.has(c)||(Ge(c),Oe=Date.now()+ot,xs(c),t.timeout(()=>{let L=_.compare;if(L===null||L.diff===null||L.activeIndex!==c)return;let T=L.diff.changes.find(D=>D.index===c);T!==void 0&&ys(T,!1)},ot))}function Ye(c){let x=_.compare;if(x===null)return;let L=Ie(x);if(L.length===0)return;let T=L.findIndex(Q=>Q.index===x.activeIndex);if(T<0){Ne(L[c>0?0:L.length-1].index);return}let D=Math.min(L.length-1,Math.max(0,T+c));Ne(L[D].index)}function Ze(){He?.disconnect(),He=null}function Se(){Ze();let c=_.compare;if(c===null||c.diff===null)return;let x=new Set,L=new IntersectionObserver(T=>{for(let Q of T)Q.target instanceof HTMLElement&&(Q.isIntersecting?x.add(Q.target):x.delete(Q.target));if(Date.now()<Oe)return;let D=null;for(let Q of x){let Be=Number(Q.dataset.surpriseRedline);if(!Number.isFinite(Be))continue;let ht=Q.getBoundingClientRect().top;(D===null||ht<D.top)&&(D={index:Be,top:ht})}D===null||D.index===c.activeIndex||Ge(D.index)},{rootMargin:`-${Math.round(rt())}px 0px 0px 0px`});for(let T of Ie(c))for(let D of ws(T.index))L.observe(D);He=L}function rt(){return ge===null||ge.hidden?0:ge.getBoundingClientRect().height}function et(){let c=Math.round(rt());e.root!==null&&e.root.host instanceof HTMLElement&&e.root.host.style.setProperty("--compare-bar",`${c}px`),Ae.set("compare",c)}function k(c){let x=i("span","compare-label");return x.appendChild(i("span","compare-when",Ga(c.committedAt,me()))),x.appendChild(i("span","compare-who",yn(c.authorName,a))),x}function y(c){let x=c.diff;if(x?.coarse)return a("toolbox.history.coarse");if(c.kind==="origin")return e.originDiffError?a("toolbox.history.diffFailed"):x===null?a("toolbox.history.counting"):x.identical?a("toolbox.history.originSame"):a("toolbox.history.changes",{count:x.changes.length});if(x===null)return a("toolbox.history.counting");if(x.identical)return x.images.added.length+x.images.removed.length>0?a("toolbox.history.noTextChangeImages"):a("toolbox.history.noTextChange");let L=x.changes.length,T=x.changes.filter(Q=>Q.place==="none").length,D=L-c.placed.size-T;return D>0?a("toolbox.history.changesLost",{count:L,lost:D}):T>0?a("toolbox.history.changesHomeless",{count:L,homeless:T}):a("toolbox.history.changes",{count:L})}function S(c){let x=Ie(c).length;if(x===0)return"–";let L=Ie(c).findIndex(T=>T.index===c.activeIndex);return`${L<0?"–":L+1} / ${x}`}function B(c){let x=i("button","compare-version");return x.type="button",x.appendChild(k(c)),_.compare?.kind==="origin"?(x.disabled=!0,x.title=yn(c.authorName,a),x):(x.title=a("toolbox.history.versionButton",{when:Ro(c.committedAt),sha:c.shortSha}),x.addEventListener("click",()=>{_.view="versions",s(!0),H()},{signal:t.signal}),x)}function G(c,x,L){let T=i("button","icon-button");return T.type="button",T.title=c,T.setAttribute("aria-label",c),T.appendChild(oe(x,se.small)),T.addEventListener("click",L,{signal:t.signal}),T}function de(){if(ge===null)return;let c=_.compare;if(ge.hidden=c===null,ge.replaceChildren(),c===null)return;let x=i("div","compare-pair");x.appendChild(B(c.from)),x.appendChild(i("span","compare-arrow","→")),x.appendChild(B(c.to)),ge.appendChild(x);let L=i("div","compare-legend");L.appendChild(i("span","legend-add",a("toolbox.history.added"))),L.appendChild(i("span","legend-del",a("toolbox.history.removed"))),L.hidden=c.diff===null||c.placed.size===0,ge.appendChild(L);let T=i("button","compare-count");if(T.type="button",T.textContent=y(c),T.disabled=c.diff===null&&!e.originDiffError,T.addEventListener("click",()=>{_.view=c.kind==="origin"?"origin":"changes",s(!0)},{signal:t.signal}),ge.appendChild(T),c.kind!=="origin"){let Q=Ie(c).length,Be=i("div","compare-nav"),ht=G(a("toolbox.history.previousChange"),ya,()=>Ye(-1)),sn=G(a("toolbox.history.nextChange"),Lo,()=>Ye(1));ht.disabled=Q===0,sn.disabled=Q===0,Be.appendChild(ht),Be.appendChild(i("span","compare-position",S(c))),Be.appendChild(sn),ge.appendChild(Be)}let D=i("button","compare-end");D.type="button",D.textContent=a("toolbox.history.end"),D.title=c.kind==="origin"?a("toolbox.history.endOrigin"):a("toolbox.history.endCompare"),D.addEventListener("click",()=>ae(),{signal:t.signal}),ge.appendChild(D)}function m(){return _.moreVersions?a("toolbox.history.moreVersions"):a("toolbox.history.firstVersion")}function I(c,x,L){let T=L[x+1],D=T===void 0,Q=i("button",x===0?"version is-current":"version");if(Q.type="button",Q.disabled=D,D||(Q.title=a("toolbox.history.compareWithPrevious")),Q.appendChild(i("div","version-who",yn(c.authorName,a))),Q.appendChild(i("div","version-when",Ro(c.committedAt))),Q.appendChild(i("div","version-count",D?"":c.changeCount===null?a("toolbox.history.notCounted"):a("toolbox.history.changes",{count:c.changeCount}))),c.number===null)Q.appendChild(i("div","version-sha",c.shortSha));else{let Be=i("div","version-number",a("toolbox.history.versionNumber",{number:c.number}));Be.title=c.shortSha,Q.appendChild(Be)}return D&&Q.appendChild(i("p","note",m())),T!==void 0&&Q.addEventListener("click",()=>{K(T,c,!0)},{signal:t.signal}),Q}function j(){let c=i("div"),x=_.versions;if(x===null)return c.appendChild(i("div","empty",a("toolbox.common.loading"))),c;if(x.length===0){let L=i("div","empty");return L.appendChild(i("div","empty-title",a("toolbox.history.noVersions"))),L.appendChild(i("div","empty-hint",a("toolbox.history.noVersionsHint"))),c.appendChild(L),c}if(document.body.hasAttribute("data-deck")){let L=i("button","quiet",a("toolbox.history.reviewChanges"));L.onclick=()=>{let T=e.root;T&&import("./comments-widget-chunk-XQYELA6X.js").then(D=>D.openAgentReview(T,_.slug))},c.append(L)}return x.forEach((L,T)=>c.appendChild(I(L,T,x))),c}let X={add:a("toolbox.history.added"),del:a("toolbox.history.removed"),title:a("toolbox.history.pageTitle")};function _e(c,x){let L=x.placed.has(c.index),T=i("button",c.index===x.activeIndex?"change is-active":"change");T.type="button",T.disabled=!L,T.appendChild(i("span","change-number",String(c.index))),T.appendChild(i("span","change-kind",X[c.kind]));let D=i("div","change-main"),Q=c.kind==="add"?"change-text is-add":c.kind==="del"?"change-text is-del":"change-text";return D.appendChild(i("div",Q,ja(c.text))),L||D.appendChild(i("p","note",c.kind==="title"?a("toolbox.history.titleNoTarget"):a("toolbox.history.notPlaced"))),T.appendChild(D),L&&T.addEventListener("click",()=>Ne(c.index),{signal:t.signal}),T}function xt(c){let x=i("button","change");x.type="button",x.disabled=!0,x.appendChild(i("span","change-kind",a("toolbox.history.removed")));let L=i("div","change-main");return L.appendChild(i("div","change-text is-del",a("toolbox.history.imageRemoved",{path:c}))),L.appendChild(i("p","note",a("toolbox.history.imageNoTarget"))),x.appendChild(L),x}function Vt(c,x){let L=P(c),T=x.diff===null||L===null?void 0:x.diff.changes.find(Be=>x.placed.has(Be.index)&&Fo(Be,L)),D=i("button","related");return D.type="button",T===void 0?D.disabled=!0:(D.title=a("toolbox.history.gotoComment"),D.addEventListener("click",()=>Ne(T.index),{signal:t.signal})),ue(D,c,"related-quote","related-body",!1),L!==null&&jt(L.state)||D.appendChild(i("p","note",c.author.name)),D}function Ft(c,x){let L=new Set(Fs(_.comments,x.from.sha).map(Q=>Q.id)),T=ve().filter(Q=>L.has(Q.id));if(T.length===0)return;let D=i("h3","related-head",a("toolbox.history.relatedComments"));c.appendChild(D);for(let Q of T)c.appendChild(Vt(Q,x))}function an(){let c=i("div"),x=_.compare;if(x===null)return c.appendChild(i("div","empty",a("toolbox.history.pickVersion"))),c;let L=i("div","change-head");L.appendChild(i("div","who-name",yn(x.to.message,a))),L.appendChild(i("div","who-time",`${yn(x.to.authorName,a)} ・ ${Ro(x.to.committedAt)}`)),c.appendChild(L);let T=x.diff;if(T===null)return c.appendChild(i("div","empty",a("toolbox.common.loading"))),c;if(T.identical&&T.images.removed.length===0)return c.appendChild(i("div","empty",a("toolbox.history.noTextChange"))),Ft(c,x),c;T.coarse&&c.appendChild(i("p","note",a("toolbox.history.coarseNote")));for(let D of T.changes)c.appendChild(_e(D,x));for(let D of T.images.removed)c.appendChild(xt(D));return Ft(c,x),c}return{dispose(){t.dispose(),Ze()},asSha:Pe,urlParams:Re,isComparing:Qe,findVersion:F,ensureVersions:H,openHistory:be,startCompare:K,clearCompare:Me,exitCompare:ae,syncFromUrl:w,onPopState:Ue,gotoChange:Ne,watchChanges:Se,applyCompareOffset:et,renderCompareBar:de,versionsView:j,get CHANGE_KINDS(){return X},changesView:an,get compareBar(){return ge},set compareBar(c){ge=c},get loadedVersion(){return xe},set loadedVersion(c){xe=c},state:_}}function ol(e){return!e.keyboardVisible||e.startedInDock?!1:vn(e.dx,e.dy)==="vertical"}function rl(e,t){return e-t}function ai(e,t,n){return Math.max(0,Math.round(e-t-n))}function il(e,t,n,o){let s=Math.abs(e-t),d=Math.abs(e-n);return s<=d?o+n:n}function al(e,t,n){return e-(t-n)}function sl(e,t){return Math.abs(e-t)>=.5}function ll(e,t,n,o){return e>=n&&t<=o}function Ic(e){return e.menu?"menu":e.dock?"dock":e.peek?"peek":e.selection?"selection":"none"}function dl(e,t){if(t)return!1;let n=Ic(e);return n==="none"||n==="menu"}function cl(e){return e.allowed&&!e.openToAnyone}function ul(e,t){return{sheetOpen:t,dockOpen:e.dockOpen,hasDraft:e.hasDraft}}function pl(e){return{sheetOpen:!1,dockOpen:!0,hasDraft:e.hasDraft}}function fl(e){return{sheetOpen:e.sheetOpen,dockOpen:!1,hasDraft:!1}}function hl(e,t,n){return e&&t>0&&!n}function ml(e){return!e}function gl(e,t,n){let o=Math.round(e/2);return{expanded:Math.min(o,t+n),half:o,closed:e}}function vl(e,t){let n=[["expanded",t.expanded],["half",t.half],["closed",t.closed]],o="half",s=Number.POSITIVE_INFINITY;for(let[d,f]of n){let C=Math.abs(e-f);C<s&&(s=C,o=d)}return o}function bl(e){return e==="expanded"?"half":"expanded"}function wl(e){let t=ct(),n=(...r)=>e.render(...r),o=(...r)=>e.handleFailure(...r),s=(...r)=>e.showNotice(...r),d=(...r)=>e.refresh(...r),f=(...r)=>e.ensureVersions(...r),C=(...r)=>e.findVersion(...r),R=(...r)=>e.pushToast(...r),h=(...r)=>e.setOpen(...r),A=(...r)=>e.startCompare(...r),N=(...r)=>e.gotoChange(...r),te=(...r)=>e.afterChange(...r),ce=(...r)=>e.avatarFor(...r),me=(...r)=>e.actionButton(...r),P=(...r)=>e.iconAction(...r),ue=(...r)=>e.prioritySendRow(...r),ve=(...r)=>e.canSend(...r),_=(...r)=>e.priorityPicker(...r),ge=(...r)=>e.textArea(...r),xe=(...r)=>e.selectFromCard(...r),je=(...r)=>e.priorityTag(...r),Pe=(...r)=>e.copyText(...r),Re=(...r)=>e.pageUrl(...r),Xe=(...r)=>e.showError(...r),Ee=(...r)=>e.hidePopover(...r),Qe=(...r)=>e.hideSelectionBar(...r),F=(...r)=>e.closeComposeDock(...r),H=(...r)=>e.updateToast(...r),De=(...r)=>e.isNarrow(...r),be=(...r)=>e.flashCard(...r),K=(...r)=>e.focusCard(...r),Z=(...r)=>e.openComposeDock(...r),Me=(...r)=>e.applyFocus(...r),ae=(...r)=>e.discardDraft(...r),We=(...r)=>e.updateScrollPadding(...r),w={filter:zo,sort:qo,picked:null,editor:null,confirmDeleteId:null,review:null,outcomes:new Map,outcomesFor:null,comments:[],expanded:new Set,get viewer(){return e.state.viewer},set viewer(r){e.state.viewer=r},get busy(){return e.state.busy},set busy(r){e.state.busy=r},get slug(){return e.state.slug},set slug(r){e.state.slug=r},get currentVersion(){return e.state.currentVersion},set currentVersion(r){e.state.currentVersion=r},get compare(){return e.state.compare},set compare(r){e.state.compare=r},get features(){return e.state.features},set features(r){e.state.features=r},get view(){return e.state.view},set view(r){e.state.view=r},get activeId(){return e.state.activeId},set activeId(r){e.state.activeId=r},get anchored(){return e.state.anchored},set anchored(r){e.state.anchored=r},get open(){return e.state.open},set open(r){e.state.open=r}},Ue="surprise-pages:comments:edit-review",ot=600*1e3;function Oe(){return w.comments.filter(r=>r.parentId===null)}function He(r){return w.comments.filter(u=>u.parentId===r).sort((u,v)=>u.createdAt.localeCompare(v.createdAt))}function Ie(){let r=new Set;for(let[u,v]of w.outcomes)jt(v.state)&&r.add(u);return r}function Ge(){return w.outcomesFor!==null}function Ne(r){return Ko(r,w.filter,Ie())}function Ye(){let r=Oe(),u=Ie();return{all:r.length,open:r.filter(v=>v.resolvedAt===null).length,changed:r.filter(v=>Ko(v,"changed",u)).length,resolved:r.filter(v=>v.resolvedAt!==null).length}}function Ze(){let r=Ie();return Oe().filter(u=>Ko(u,w.filter,r))}function Se(){let r=new Map,u=Ze();for(let v of u){let O=os(v.id);r.set(v.id,O===null?Number.MAX_SAFE_INTEGER:O)}return Wo(u,w.sort,r)}function rt(r){return r.mine}function et(){return w.viewer!==null&&w.features.write}function k(r){return rt(r)&&et()}function y(){return w.picked!==null}function S(){return et()&&e.draft===null&&Se().length>=2}function B(){S()&&(w.editor=null,w.confirmDeleteId=null,w.picked=new Set(Se().map(r=>r.id)),n())}function G(){y()&&(w.picked=null,n())}function de(r){w.filter=r,w.picked=null,n()}function m(r){let u=w.picked;u!==null&&(u.has(r)?u.delete(r):u.add(r),n())}function I(){let r=w.picked;return r===null?[]:Se().filter(u=>r.has(u.id))}async function j(){let r=I(),u=ii(r);if(u===null||!et())return;w.busy=!0,n();let v=await Xr(w.slug,r.map(M=>M.id),u==="resolve");if(t.disposed)return;if(w.busy=!1,!v.ok){o(v);return}if(w.picked=null,u==="resolve")for(let M of r)w.expanded.delete(M.id);let O=v.value;s(O===0?a("toolbox.list.bulk.nothingMoved"):u==="resolve"?a("toolbox.list.bulk.resolved",{count:O}):a("toolbox.list.bulk.reopened",{count:O})),await d(),t.disposed}function X(r){return w.outcomes.get(r.id)??null}function _e(){return e.loadedVersion??w.currentVersion}function xt(){let r=w.compare;return r!==null&&r.kind!=="origin"?r.to.sha:_e()}function Vt(r,u){return r.some(v=>v.parentId===null&&v.quote!==null&&v.quote.length>0&&v.pageVersion!==null&&!Jt(v.pageVersion,u))}function Ft(r){try{let u={pageSlug:w.slug,fromVersion:r,at:Date.now()};sessionStorage.setItem(Ue,JSON.stringify(u))}catch{}}function an(){try{let r=sessionStorage.getItem(Ue);if(r===null)return null;let u=JSON.parse(r);if(typeof u!="object"||u===null||Array.isArray(u))return null;let v={...u},O=v.pageSlug,M=v.fromVersion,q=v.at;return typeof O!="string"||typeof M!="string"||typeof q!="number"||O!==w.slug||Date.now()-q>ot?null:{pageSlug:O,fromVersion:M,at:q}}catch{return null}}function c(){try{sessionStorage.removeItem(Ue)}catch{}}function x(r){let u=[];for(let v of Oe()){if(v.resolvedAt!==null||!Jt(v.pageVersion,r))continue;let O=X(v);O===null||!jt(O.state)||(u.push(v.id),w.expanded.add(v.id))}if(u.length===0){w.review=null;return}w.review={fromVersion:r,commentIds:u},w.filter==="resolved"&&(w.filter="open")}async function L(r){if(r===null)return;let u=an();if(w.outcomesFor===r){u!==null&&(x(u.fromVersion),c(),n());return}if(!Vt(w.comments,r)&&u===null&&w.review===null)return;let v=await is(w.slug,r);if(t.disposed||!v.ok||_e()!==r&&w.compare?.to.sha!==r)return;let O=new Map;for(let q of v.value)O.set(q.commentId,q);w.outcomes=O,w.outcomesFor=r;let M=u??an();M!==null?(x(M.fromVersion),c()):w.review!==null&&x(w.review.fromVersion),n()}function T(r,u,v){return i("p",v?`${r} is-story`:r,u)}function D(r){let u=Date.parse(r.createdAt),v=Date.parse(r.updatedAt);return Number.isNaN(u)||Number.isNaN(v)?!1:v-u>1e3}function Q(r,u,v,O){let M=i("p","outcome-label");if(M.appendChild(i("span","outcome-beat",u)),v!==null&&v.length>0){let q=i("span","outcome-meta",v);O!==null&&O.length>0&&(q.title=O),M.appendChild(q)}r.appendChild(M)}function Be(r,u){let v=Nt(r);return v.length===0||v===u?a("toolbox.story.edited"):v===a("toolbox.time.justNow")?a("toolbox.story.editedJustNow"):a("toolbox.story.editedAt",{when:v})}function ht(r){let u=r.author.name,v=Nt(r.createdAt);return D(r)?{text:`${u} ・ ${v} ・ ${Be(r.updatedAt,v)}`,title:a("toolbox.story.writtenThenEdited",{written:ut(r.createdAt),edited:ut(r.updatedAt)})}:{text:`${u} ・ ${v}`,title:ut(r.createdAt)}}function sn(r){return r.changedBy===null||r.changedAt===null?null:{text:`${r.changedBy} ・ ${Nt(r.changedAt)}`,title:ut(r.changedAt)}}function ro(r,u,v,O,M=!0){let q=X(u),ee=q!==null&&jt(q.state);if(ee?(Q(r,a("toolbox.story.then"),null,null),r.appendChild(T(v,q.thenText,!0))):u.quote!==null&&u.quote.length>0&&r.appendChild(T(v,u.quote,!1)),ee){let ie=ht(u);Q(r,a("toolbox.common.comment"),ie.text,ie.title)}if(u.body.length>0&&r.appendChild(i("p",O,u.body)),ee){let ie=sn(q);if(Q(r,a("toolbox.story.now"),ie?.text??null,ie?.title??null),q.state==="gone"?r.appendChild(i("p","note is-story",a("toolbox.story.gone"))):q.nowText!==null&&r.appendChild(T(v,q.nowText,!0)),M&&w.features.history&&u.pageVersion!==null){let pe=i("button","story-link");pe.type="button",pe.textContent=a("toolbox.story.seeChange"),pe.addEventListener("click",Te=>{Te.stopPropagation(),vr(u)},{signal:t.signal}),r.appendChild(pe)}}}function gr(r){if(r.quote===null||r.quote.length===0||r.pageVersion===null)return!1;let u=_e();return u===null||Jt(r.pageVersion,u)?!1:w.outcomesFor===null}function it(r,u){if(u||r.quote===null||gr(r))return null;let v=X(r);return v!==null&&jt(v.state)?null:a("toolbox.story.quoteLost")}async function vr(r){if(r.pageVersion===null||!w.features.history)return;let u=await f();if(t.disposed||u===null)return;let v=C(u,r.pageVersion),O=w.outcomesFor??_e();if(v===null||O===null){R(a("toolbox.story.thenMissing"),"failure");return}let M=C(u,O);if(M===null){R(a("toolbox.story.nowMissing"),"failure");return}if(v.sha===M.sha||(w.view="comments",w.activeId=r.id,w.expanded.add(r.id),h(!0),await A(v,M,!0),t.disposed))return;let q=w.compare,ee=X(r);if(q===null||q.diff===null||ee===null)return;let ie=q.diff.changes.find(pe=>Fo(pe,ee));ie!==void 0&&q.placed.has(ie.index)&&N(ie.index)}async function On(){let r=w.review;if(r===null||!et())return;w.busy=!0,n();let u=await Xr(w.slug,r.commentIds,!0);t.disposed||(w.busy=!1,te(u)&&(w.review=null,await d(),t.disposed))}function br(){let r=i("div","story-banner"),u=w.review===null?0:w.review.commentIds.length;r.appendChild(i("p","story-banner-text",a("toolbox.story.reviewBanner",{count:u})));let v=i("div","story-banner-actions");if(et()){let M=i("button","story-link");M.type="button",M.textContent=a("toolbox.list.bulk.resolve",{count:u}),M.disabled=w.busy,M.addEventListener("click",()=>{On()},{signal:t.signal}),v.appendChild(M)}let O=i("button","story-link");return O.type="button",O.textContent=a("toolbox.common.close"),O.addEventListener("click",()=>{w.review=null,n()},{signal:t.signal}),v.appendChild(O),r.appendChild(v),r}function In(r){let u=i("div"),v=i("div","card-head");v.appendChild(ce(r.author)),v.appendChild(i("span","who-name",r.author.name));let O=i("span","who-time",Nt(r.createdAt));if(O.title=ut(r.createdAt),v.appendChild(O),v.appendChild(i("span","spacer")),u.appendChild(v),u.appendChild(i("p","body",r.body)),k(r)&&!y()){let M=i("div","card-actions");w.confirmDeleteId===r.id?(M.appendChild(i("span","hint",a("toolbox.card.confirmDeleteReply"))),M.appendChild(me(a("toolbox.common.remove"),pt,()=>{io(r.id)},"is-danger")),M.appendChild(me(a("toolbox.common.cancel"),Je,()=>{w.confirmDeleteId=null,n()}))):M.appendChild(P(a("toolbox.common.delete"),pt,()=>{w.confirmDeleteId=r.id,n()},"is-danger")),u.appendChild(M)}return u}function Mn(r){let u=w.editor;if(u===null)return i("div");let v=i("div","composer"),O=u.mode==="reply",M=null;O?(M=ue(pe=>{u.priority=pe,dn(r)}),M.setEnabled(ve(u.body))):v.appendChild(_(u.priority,pe=>{u.priority=pe,n()}));let q=ge(u.body,O?a("toolbox.card.writeReply"):a("toolbox.card.editComment"),pe=>{u.body=pe,M?.setEnabled(ve(pe))},O?{onPriority:pe=>{u.priority=pe,dn(r)}}:{});v.appendChild(q),M!==null&&v.appendChild(M.row);let ee=i("div","composer-foot");ee.appendChild(i("span","hint"));let ie=i("button","button");if(ie.type="button",ie.textContent=a("toolbox.common.cancel"),ie.addEventListener("click",pe=>{pe.stopPropagation(),w.editor=null,n()},{signal:t.signal}),ee.appendChild(ie),!O){let pe=i("button","button is-primary");pe.type="button",pe.appendChild(oe(xa,se.small)),pe.appendChild(i("span",void 0,a("toolbox.common.save"))),pe.addEventListener("click",Te=>{Te.stopPropagation(),dn(r)},{signal:t.signal}),ee.appendChild(pe)}return v.appendChild(ee),t.timeout(()=>q.focus({preventScroll:!0}),0),v}function $t(r){let u=i("label","pick-box"),v=i("input");v.type="checkbox",v.className="check-input",v.checked=w.picked!==null&&w.picked.has(r.id),v.setAttribute("aria-label",a("toolbox.card.pickComment",{name:r.author.name}));let O=i("span","check-mark");return O.appendChild(oe(lt,se.small)),u.appendChild(v),u.appendChild(O),v.addEventListener("change",()=>m(r.id),{signal:t.signal}),u.addEventListener("click",M=>M.stopPropagation(),{signal:t.signal}),u}function Hn(r){let u=i("div","card is-collapsed");u.dataset.cardId=r.id;let v=i("div","collapsed-row");y()?(u.classList.add("is-pick"),w.picked!==null&&w.picked.has(r.id)&&u.classList.add("is-picked"),v.appendChild($t(r))):(u.title=a("toolbox.card.expand"),u.setAttribute("role","button"),u.setAttribute("aria-expanded","false"),u.tabIndex=0,u.addEventListener("keydown",M=>{M.key!=="Enter"&&M.key!==" "||(M.preventDefault(),u.click())},{signal:t.signal})),r.priority==="good"?v.appendChild(oe(mn,se.small)):v.appendChild(i("span",Mt[r.priority].dotClass));let O=r.quote!==null&&r.quote.length>0?r.quote:r.body;return v.appendChild(i("span","collapsed-text",O.length>0?O:r.priority==="good"?a("toolbox.compose.good"):a("toolbox.card.removeHere"))),v.appendChild(i("span","collapsed-who",r.author.name)),u.appendChild(v),u.addEventListener("click",()=>{if(y()){m(r.id);return}w.expanded.add(r.id),n()},{signal:t.signal}),u}function ln(r){let u=r.resolvedAt!==null,v=w.anchored.has(r.id);if(u&&w.filter!=="resolved"&&!w.expanded.has(r.id)&&r.id!==w.activeId)return Hn(r);let M=["card"];y()?(M.push("is-pick"),w.picked!==null&&w.picked.has(r.id)&&M.push("is-picked")):r.id===w.activeId&&M.push("is-active"),u&&M.push("is-resolved");let q=i("div",M.join(" "));q.dataset.cardId=r.id,q.addEventListener("click",()=>{if(y()){m(r.id);return}xe(r.id)},{signal:t.signal});let ee=i("div","card-head");y()&&ee.appendChild($t(r)),ee.appendChild(ce(r.author));let ie=i("div");ie.appendChild(i("div","who-name",r.author.name));let pe=i("div","who-time",Nt(r.createdAt));pe.title=ut(r.createdAt),ie.appendChild(pe),ee.appendChild(ie),ee.appendChild(i("span","spacer")),u&&ee.appendChild(i("span","tag",a("toolbox.common.resolved"))),ee.appendChild(je(r.priority)),q.appendChild(ee),ro(q,r,"quote","body");let Te=v&&!y()?q.querySelector(":scope > .quote"):null;Te!==null&&(Te.setAttribute("role","button"),Te.setAttribute("aria-label",a("toolbox.card.jumpToQuote",{quote:Te.textContent??""})),Te.tabIndex=0,Te.addEventListener("keydown",Le=>{Le.key!=="Enter"&&Le.key!==" "||(Le.preventDefault(),xe(r.id))},{signal:t.signal}));let po=it(r,v);po!==null&&q.appendChild(i("p","note",po)),u&&r.resolvedBy!==null&&q.appendChild(i("p","note",a("toolbox.common.resolvedBy",{name:r.resolvedBy})));let Er=w.editor!==null&&w.editor.targetId===r.id;if(!y())if(Er&&w.editor!==null)q.appendChild(Mn(r));else{let Le=i("div","card-actions");w.confirmDeleteId===r.id?(Le.appendChild(i("span","hint",a("toolbox.common.confirmDeleteComment"))),Le.appendChild(me(a("toolbox.common.remove"),pt,()=>{io(r.id)},"is-danger")),Le.appendChild(me(a("toolbox.common.cancel"),Je,()=>{w.confirmDeleteId=null,n()}))):(et()&&(Le.appendChild(P(a("toolbox.card.reply"),ca,()=>{w.editor={mode:"reply",targetId:r.id,body:"",priority:r.priority},w.confirmDeleteId=null,n()})),Le.appendChild(u?P(a("toolbox.card.reopen"),Fr,()=>{Nn(r,!1)}):P(a("toolbox.card.resolve"),lt,()=>{Nn(r,!0)}))),Le.appendChild(P(a("toolbox.card.link"),Gt,()=>{Pe(`${Re()}#c=${r.id}`,a("toolbox.card.linkCopied"))})),r.body.length>0&&Le.appendChild(P(a("toolbox.card.copyText"),gn,()=>{Pe(r.body,a("toolbox.card.textCopied"),a("toolbox.card.copyFailed"))})),k(r)&&(Le.appendChild(P(a("toolbox.common.edit"),hn,()=>{w.editor={mode:"edit",targetId:r.id,body:r.body,priority:r.priority},w.confirmDeleteId=null,n()})),Le.appendChild(P(a("toolbox.common.delete"),pt,()=>{w.confirmDeleteId=r.id,n()},"is-danger")))),Le.childElementCount>0&&q.appendChild(Le)}let zt=He(r.id);if(zt.length>0){let Le=i("div","replies");for(let _n of zt)Le.appendChild(In(_n));q.appendChild(Le)}return q}async function dn(r){let u=w.editor;if(u!==null){if(u.mode==="edit"){let v=u.body.trim();if(v.length===0&&u.priority!=="good"){Xe(a("toolbox.card.bodyRequired"));return}let O=await jr(r.id,{body:v,priority:u.priority});if(t.disposed||!te(O))return}else{let v=u.body.trim();if(v.length===0&&u.priority!=="good"){Xe(a("toolbox.card.replyRequired"));return}let O=await Jr({pageSlug:w.slug,parentId:r.id,quote:null,quoteContext:null,body:v,kind:"comment",priority:u.priority});if(t.disposed||!te(O))return}w.editor=null,await d(),t.disposed}}async function Nn(r,u){let v={resolvedAt:r.resolvedAt,resolvedBy:r.resolvedBy};r.resolvedAt=u?new Date().toISOString():null,r.resolvedBy=u?r.resolvedBy:null,n();let O=await jr(r.id,{resolved:u});if(!t.disposed){if(!te(O)){r.resolvedAt=v.resolvedAt,r.resolvedBy=v.resolvedBy,n();return}await d(),t.disposed}}async function io(r){let u=await Ho(r);t.disposed||te(u)&&(w.confirmDeleteId=null,w.activeId===r&&(w.activeId=null),await d(),t.disposed)}async function mt(){if(e.draft===null)return;let r=e.draft.body.trim();if(r.length===0&&e.draft.priority!=="good"){Xe(a("toolbox.card.commentRequired"));return}let u={pageSlug:w.slug,quote:e.draft.anchor.quote,quoteContext:e.draft.anchor.context,body:r,kind:e.draft.kind,priority:e.draft.priority,marks:e.draft.marks,toastId:""};e.draft.marks=[],Ee(),Qe(),F(),window.getSelection()?.removeAllRanges();for(let v of u.marks)es(v);u.toastId=R(a("toolbox.card.posting"),"pending"),await wr(u),t.disposed}async function wr(r){let u=await Jr({pageSlug:r.pageSlug,parentId:null,quote:r.quote,quoteContext:r.quoteContext,body:r.body,kind:r.kind,priority:r.priority});if(t.disposed)return;if(!u.ok){for(let O of r.marks)Gr(O,!0);H(r.toastId,"failure",a("toolbox.card.postFailed"),()=>ao(r)),e.closeHandlers.set(r.toastId,()=>Et(r.marks));return}H(r.toastId,"success",a("toolbox.card.posted")),Et(r.marks);let v=w.open;await d(),!t.disposed&&yr(u.value.id,v)}function yr(r,u){let v=w.comments.find(O=>O.id===r);v!==void 0&&(!w.open&&!ml(De())||(w.view="comments",Ne(v)||(w.filter=xn(v)),w.open?n():h(!0),u?be(r):K(r)))}function ao(r){e.closeHandlers.delete(r.toastId);for(let u of r.marks)Gr(u,!1);e.draft={anchor:{quote:r.quote??"",context:r.quoteContext??{beforeText:"",afterText:""}},kind:r.kind,priority:r.priority,body:r.body,marks:r.marks},e.draftFocused=!1,w.view="comments",Z()}function Pt(r){return r.composedPath().some(u=>u instanceof Element&&u.classList.contains(e.LIST_MENU_MARK))}function Dn(){e.listMenuOpen&&(e.listMenuOpen=!1,n())}function cn(r,u,v,O){let M=i("button",u?"pick-row is-active":"pick-row");return M.type="button",M.setAttribute("aria-pressed",u?"true":"false"),M.appendChild(i("span",void 0,r)),O!==void 0&&M.appendChild(i("span","pick-count",String(O))),M.addEventListener("click",q=>{q.stopPropagation(),v()},{signal:t.signal}),M}function xr(){if(e.listMenuButton===null)return;let r=e.listMenuOpen||!Xs(w.filter,w.sort);e.listMenuButton.classList.toggle("is-active",r),e.listMenuButton.setAttribute("aria-expanded",e.listMenuOpen?"true":"false")}function kr(){let r=w.view==="comments",u=y();e.listMenuButton!==null&&(e.listMenuButton.hidden=u),e.pickButton!==null&&(e.pickButton.hidden=!r||!u&&!S(),e.pickButton.classList.toggle("is-active",u),e.pickButton.setAttribute("aria-pressed",u?"true":"false"),e.pickButton.title=u?a("toolbox.list.stopPicking"):a("toolbox.list.pick"),e.pickButton.setAttribute("aria-label",e.pickButton.title)),e.exportTools!==null&&(e.exportTools.hidden=u),u&&(e.listMenuOpen=!1)}function so(){if(e.listMenuBox===null||(xr(),e.listMenuBox.replaceChildren(),w.view!=="comments"))return;if(e.listMenuOpen){let v=Ye(),O=i("div","list-menu"),M=i("div");M.appendChild(i("p","list-menu-label",a("toolbox.list.filterLabel")));for(let[ee,ie]of Zs(w.filter,v,Ge()))M.appendChild(cn(ie,w.filter===ee,()=>{de(ee)},v[ee]));O.appendChild(M);let q=i("div");q.appendChild(i("p","list-menu-label",a("toolbox.list.sortLabel")));for(let[ee,ie]of ri)q.appendChild(cn(ie,w.sort===ee,()=>{w.sort=ee,n()}));O.appendChild(q),e.listMenuBox.appendChild(O),e.listMenuBox.hidden=!1;return}let r=Qs(w.filter,w.sort);if(r.length===0){e.listMenuBox.hidden=!0;return}let u=i("button","list-summary");u.type="button",u.textContent=r,u.title=a("toolbox.list.changeMenu"),u.addEventListener("click",v=>{v.stopPropagation(),e.listMenuOpen=!0,n()},{signal:t.signal}),e.listMenuBox.appendChild(u),e.listMenuBox.hidden=!1}function gt(){if(y())return null;let r=el(w.filter,Ye());if(r===null)return null;let u=i("button","list-summary is-tail");return u.type="button",u.textContent=r.label,u.addEventListener("click",v=>{v.stopPropagation(),de(r.to)},{signal:t.signal}),u}function lo(){let r=Ye(),u=i("div","empty"),v=r.all===0,O=!v&&w.filter==="open";return u.appendChild(i("div","empty-title",v?a("toolbox.list.empty.nothing"):O?a("toolbox.list.empty.allDone"):a("toolbox.list.empty.filtered"))),v&&u.appendChild(i("div","empty-hint",a("toolbox.list.empty.hint"))),u}function co(){if(e.listBox===null)return;let r=e.listBox.scrollTop;e.listBox.replaceChildren();let u=Se();if(w.review!==null&&e.listBox.appendChild(br()),u.length===0){e.listBox.appendChild(lo());let O=gt();O!==null&&e.listBox.appendChild(O),e.listBox.scrollTop=r;return}for(let O of u)e.listBox.appendChild(ln(O));let v=gt();v!==null&&e.listBox.appendChild(v),e.listBox.scrollTop=r,Me()}function uo(r){let u=i("div","sheet-compose"),v=i("div","quote-row");e.dockQuote=i("p","pop-quote",r.anchor.quote),v.appendChild(e.dockQuote);let O=i("button","icon-button");O.type="button",O.title=a("toolbox.common.cancel"),O.appendChild(oe(Je,se.small)),O.addEventListener("click",()=>ae(),{signal:t.signal}),v.appendChild(O),u.appendChild(v);let M=i("div","composer"),q=ue(ie=>{r.priority=ie,mt()});q.setEnabled(ve(r.body));let ee=ge(r.body,a("toolbox.common.writeSomething"),ie=>{r.body=ie,q.setEnabled(ve(ie)),We()},{onPriority:ie=>{r.priority=ie,mt()},quoteWhenEmpty:()=>r.anchor.quote});return M.appendChild(ee),M.appendChild(q.row),u.appendChild(M),e.draftFocused||(e.draftFocused=!0,t.timeout(()=>ee.focus({preventScroll:!0}),0)),u}function Cr(){if(e.pickBar===null)return;if(!y()||w.view!=="comments"){e.pickBar.hidden=!0,e.pickBar.replaceChildren();return}let r=I(),u=Se(),v=ii(r);e.pickBar.replaceChildren();let O=r.length===u.length,M=i("button","list-summary is-pick-all");M.type="button",M.textContent=O?a("toolbox.list.unpickAll"):a("toolbox.list.pickAll"),M.addEventListener("click",ee=>{ee.stopPropagation(),w.picked=O?new Set:new Set(u.map(ie=>ie.id)),n()},{signal:t.signal}),e.pickBar.appendChild(M);let q=i("button","button");if(q.type="button",q.textContent=a("toolbox.common.cancel"),q.addEventListener("click",ee=>{ee.stopPropagation(),G()},{signal:t.signal}),e.pickBar.appendChild(q),v!==null){let ee=i("button","button is-primary");ee.type="button",ee.appendChild(oe(v==="resolve"?lt:Fr,se.small)),ee.appendChild(i("span",void 0,tl(v,r.length))),ee.disabled=w.busy,ee.addEventListener("click",ie=>{ie.stopPropagation(),j()},{signal:t.signal}),e.pickBar.appendChild(ee)}e.pickBar.hidden=!1}return{dispose(){t.dispose()},topLevel:Oe,repliesOf:He,matchesFilter:Ne,inList:Ze,visibleForList:Se,isMine:rt,canAct:et,picking:y,startPicking:B,stopPicking:G,outcomeOf:X,outcomeTargetVersion:_e,outcomesToVersion:xt,stashEditReview:Ft,fillOutcomes:L,appendQuoteStory:ro,editorBox:Mn,submitDraft:mt,onListMenu:Pt,closeListMenu:Dn,paintPickButton:kr,renderListMenu:so,renderList:co,sheetComposer:uo,renderPickBar:Cr,state:w}}function yl(e){let t=ct(),n=(...m)=>e.showError(...m),o=(...m)=>e.render(...m),s=(...m)=>e.showNotice(...m),d=(...m)=>e.clearCompare(...m),f=(...m)=>e.copyText(...m),C=(...m)=>e.pageUrl(...m),R=(...m)=>e.isComparing(...m),h=(...m)=>e.exitCompare(...m),A=(...m)=>e.setOpen(...m),N=(...m)=>e.handleFailure(...m),te=(...m)=>e.actionButton(...m),ce=(...m)=>e.isNarrow(...m),me=(...m)=>e.tokenPx(...m),P={origin:null,originJob:null,get features(){return e.state.features},set features(m){e.state.features=m},get visibility(){return e.state.visibility},set visibility(m){e.state.visibility=m},get slug(){return e.state.slug},set slug(m){e.state.slug=m},get currentVersion(){return e.state.currentVersion},set currentVersion(m){e.state.currentVersion=m},get compare(){return e.state.compare},set compare(m){e.state.compare=m},get view(){return e.state.view},set view(m){e.state.view=m},get busy(){return e.state.busy},set busy(m){e.state.busy=m}},ue="surprise-pages:origin-refresh",ve="surprise-pages:origin-hint",_=null,ge=0,xe=!1,je=0,Pe=!1,Re=0,Xe=4500;function Ee(){let m=document.querySelector('script[src^="/comments-widget.js"][data-page]');if(m===null)return null;let I=m.getAttribute("data-source-repo"),j=m.getAttribute("data-source-path"),X=m.getAttribute("data-source-commit");return I===null||j===null||X===null||I.length===0||j.length===0||X.length===0?null:{repo:I,path:j,commit:X}}function Qe(){return P.features.edit&&e.loadedVersion===null&&P.visibility==="internal"&&Ee()!==null}function F(){let m=Fn(ue);if(m===null)return null;try{let I=JSON.parse(m);if(typeof I!="object"||I===null||Array.isArray(I))return null;let j={...I},X=typeof j.slug=="string"?j.slug:null,_e=typeof j.agentId=="string"?j.agentId:null,xt=typeof j.url=="string"?j.url:null;if(X===null||_e===null||xt===null)return null;let Vt=typeof j.startedVersion=="string"?j.startedVersion:null;return{slug:X,agentId:_e,url:xt,startedVersion:Vt}}catch{return null}}function H(m){if(m===null){bn(ue,"");return}bn(ue,JSON.stringify(m))}function De(){ge!==0&&(t.clearInterval(ge),ge=0)}function be(m){P.originJob={status:"running",...m},H({slug:P.slug,...m}),Me()}function K(){P.originJob!==null&&(P.originJob={...P.originJob,status:"done"},H(null),De())}function Z(m){P.originJob=null,H(null),De(),n(m),o()}function Me(){De(),ge=t.interval(()=>{ae()},5e3),ae()}async function ae(){let m=P.originJob;if(m===null||m.status!=="running"){De();return}let I=await wn(P.slug);if(t.disposed||P.originJob!==m)return;if(I.ok){let X=I.value.currentVersion;if(X!==null&&m.startedVersion!==null&&X!==m.startedVersion){P.currentVersion=X,K(),s(a("toolbox.common.newVersion")),o();return}X!==null&&m.startedVersion===null&&(P.currentVersion=X)}let j=await bs(P.slug,m.agentId);if(!(t.disposed||P.originJob!==m)&&j.ok){if(j.value.status==="failed"){Z(a("toolbox.origin.failed"));return}if(j.value.status==="finished"){let X=await wn(P.slug);if(t.disposed||P.originJob!==m)return;if(X.ok&&X.value.currentVersion!==null&&X.value.currentVersion!==m.startedVersion){P.currentVersion=X.value.currentVersion,K(),s(a("toolbox.common.newVersion")),o();return}K(),s(a("toolbox.common.newVersion")),o()}}}async function We(){if(xe||P.origin!==null)return;if(!Qe()){P.origin={stale:!1};return}xe=!0;let m=F();m!==null&&m.slug===P.slug&&be({agentId:m.agentId,url:m.url,startedVersion:m.startedVersion});let I=await gs(P.slug);if(!t.disposed){if(!I.ok){P.origin={stale:!1},o();return}ms(I.value)&&I.value.path!==null?P.origin={stale:!0,path:I.value.path,headDate:I.value.headDate,checked:I.value.checked,edited:I.value.edited}:(P.origin={stale:!1},P.originJob?.status==="running"&&(K(),s(a("toolbox.common.newVersion")))),o()}}function w(){let m=P.origin,I=m!==null&&m.stale?m.path:a("toolbox.origin.sourceWord"),j=m!==null&&m.stale?m.headDate:null,X=j===null?a("toolbox.origin.confirm",{path:I}):a("toolbox.origin.confirmDated",{path:I,day:j});return document.head.querySelector("script[data-deck-design]")!==null?`${X} ${a("toolbox.origin.keepAppearance")}`:X}let Ue=a("toolbox.origin.editedCopy");function ot(){let m=P.origin;return m===null||!m.stale||m.edited!==!0?null:Ue}function Oe(m,I,j){return{sha:I,shortSha:I.length>=7?I.slice(0,7):I,number:null,authorName:m,committedAt:j??"",message:"",changeCount:null}}function He(){je+=1,Pe=!1,P.compare!==null&&P.compare.kind==="origin"&&d()}function Ie(){if(!Qe())return;if(document.body.hasAttribute("data-deck")){f(`${C()}
このスライドを原稿から更新したいです。保存済みの最新版を読み、原稿との差分を比較して、採用する箇所だけ反映してください。現在の本文を原稿で一括上書きしないでください。`,a("toolbox.origin.requestCopied"));return}if(P.origin===null||!P.origin.stale||P.originJob!==null)return;R()&&P.compare?.kind!=="origin"&&h(),je+=1,Pe=!1;let m=P.origin.headDate;P.compare={kind:"origin",from:Oe(a("toolbox.origin.cited"),"cited",null),to:Oe(a("toolbox.origin.latest"),"head",m),diff:null,placed:new Set,activeIndex:0},P.view="origin",A(!0),Ge()}async function Ge(){if(P.compare===null||P.compare.kind!=="origin")return;let m=je,I=await us(P.slug);if(!t.disposed&&m===je&&!(P.compare===null||P.compare.kind!=="origin")){if(!I.ok){if(I.status===401){N(I);return}Pe=!0,o();return}P.compare.from=Oe(a("toolbox.origin.cited"),I.value.cited.sha,I.value.cited.at),P.compare.to=Oe(a("toolbox.origin.latest"),I.value.head.sha,I.value.head.at),P.compare.diff=I.value.diff,Pe=!1,o()}}async function Ne(){if(P.busy)return;P.busy=!0,o();let m=await vs(P.slug);if(!t.disposed){if(P.busy=!1,!m.ok){if(m.status===409){He(),P.origin={stale:!1},P.view="comments",A(!1),s(a("toolbox.origin.alreadyImported")),o();return}N(m);return}He(),P.view="comments",A(!1),be({agentId:m.value.agentId,url:m.value.url,startedVersion:P.currentVersion}),s(a("toolbox.origin.started")),o()}}function Ye(m){let I=i("div","change");I.appendChild(i("span","change-kind",e.CHANGE_KINDS[m.kind]));let j=m.kind==="add"?"change-text is-add":m.kind==="del"?"change-text is-del":"change-text",X=i("div","change-main");return X.appendChild(i("div",j,m.text)),I.appendChild(X),I}function Ze(){let m=i("div","origin-diff");if(Pe)return m.appendChild(i("p","note",a("toolbox.origin.diffFailed"))),m;let I=P.compare;if(I===null||I.kind!=="origin")return m;if(I.diff===null)return m.appendChild(i("p","note",a("toolbox.origin.diffLoading"))),m;if(I.diff.identical)return m.appendChild(i("p","note",a("toolbox.origin.same"))),m;I.diff.coarse&&m.appendChild(i("p","note",a("toolbox.history.coarseNote")));for(let j of I.diff.changes)m.appendChild(Ye(j));return m}function Se(){let m=i("div","access"),I=i("div","access-confirm");I.appendChild(i("p","access-warning",w()));let j=ot();j!==null&&I.appendChild(i("p","access-warning",j)),I.appendChild(Ze());let X=i("div","access-row"),_e=te(a("toolbox.origin.take"),To,()=>{Ne()},"is-strong");return P.busy&&(_e.disabled=!0),X.appendChild(_e),X.appendChild(te(a("toolbox.common.cancel"),Je,()=>{if(P.compare?.kind==="origin"){h();return}P.view="comments",A(!1)})),I.appendChild(X),m.appendChild(I),m}function rt(){return`${ve}:${P.slug}`}function et(){return Fn(rt())==="1"}function k(){bn(rt(),"1")}function y(){return _===null||e.bar===null||e.bar.hidden||!Qe()||P.origin===null||!P.origin.stale||!P.origin.checked||P.originJob!==null?!1:e.bar.querySelector(".bar-more")!==null}function S(){Re!==0&&(t.clearTimeout(Re),Re=0),_!==null&&(_.hidden=!0)}function B(){if(_===null||e.bar===null||e.root===null)return;let m=e.root.host;if(!(m instanceof HTMLElement))return;let I=m.getBoundingClientRect(),j=e.bar.getBoundingClientRect(),X=e.bar.querySelector(".bar-more"),_e=!ce()&&X instanceof HTMLElement?X.getBoundingClientRect():j;_.style.bottom=`${Math.round(I.bottom-j.top+me("--space-2"))}px`,_.style.right=`${Math.round(I.right-_e.right)}px`}function G(){if(_!==null){if(!_.hidden){if(!y()){S();return}B();return}!y()||et()||(_.hidden=!1,k(),B(),Re=t.timeout(()=>S(),Xe))}}function de(){let m=i("div","origin-hint");m.hidden=!0;let I=i("button","origin-hint-open");I.type="button",I.appendChild(i("span","origin-hint-text",a("toolbox.origin.hint"))),I.addEventListener("click",()=>{S(),Ie()},{signal:t.signal});let j=i("button","icon-button");return j.type="button",j.title=a("toolbox.common.close"),j.setAttribute("aria-label",a("toolbox.common.close")),j.appendChild(oe(Je,se.small)),j.addEventListener("click",X=>{X.stopPropagation(),S()},{signal:t.signal}),m.appendChild(I),m.appendChild(j),m}return{dispose(){t.dispose(),je+=1},originEntryAllowed:Qe,probeOriginOnce:We,closeOriginCompare:He,openOriginConfirm:Ie,originView:Se,renderOriginHint:G,buildOriginHint:de,get originHint(){return _},set originHint(m){_=m},get originDiffError(){return Pe},set originDiffError(m){Pe=m},state:P}}var Uo={intervalMs:5e3,idleAfterMs:6e5,failureMaxMs:6e4};function xl(e){return!e.visible||e.editing||e.idleForMs>=Uo.idleAfterMs?null:e.failures<=0?Uo.intervalMs:Math.min(Uo.intervalMs*2**e.failures,Uo.failureMaxMs)}var Mc=["pointerdown","keydown","wheel","touchstart","scroll"];function kl(e){let{lifetime:t}=e,n=0,o=!1,s=0,d=Date.now();function f(){return document.visibilityState==="visible"}function C(){n!==0&&(t.clearTimeout(n),n=0)}function R(){C();let ce=xl({visible:f(),editing:e.editing(),idleForMs:Date.now()-d,failures:s});ce!==null&&(n=t.timeout(()=>{h(!0)},ce))}async function h(ce){if(n=0,o||t.disposed)return;o=!0;let me=await e.refresh({quiet:ce});o=!1,!t.disposed&&(s=me?0:s+1,R())}function A(){d=Date.now(),s=0,C(),h(!1)}function N(){d=Date.now(),n===0&&!o&&R()}function te(){document.addEventListener("visibilitychange",()=>{f()?A():C()},{signal:t.signal}),window.addEventListener("focus",A,{signal:t.signal});for(let ce of Mc)window.addEventListener(ce,N,{passive:!0,capture:!0,signal:t.signal});R()}return{start:te,resume:A,stop:C}}var Go={open:!1,openedBy:null,commentId:null};function Cl(e,t=null){return{open:!0,openedBy:e,commentId:t}}function si(e,t){return{open:e.open,openedBy:e.openedBy,commentId:t}}function Hc(e,t){return e.openedBy!==null&&e.openedBy===t}function El(e,t,n){return!e.open||Hc(e,t)||n?e:Go}function li(){return Go}function Sl(e){let t=ct(),n=(...l)=>e.isComparing(...l),o=(...l)=>e.inList(...l),s=(...l)=>e.picking(...l),d=(...l)=>e.matchesFilter(...l),f=(...l)=>e.render(...l),C=(...l)=>e.avatarFor(...l),R=(...l)=>e.visibleForList(...l),h=(...l)=>e.priorityTag(...l),A=(...l)=>e.appendQuoteStory(...l),N=(...l)=>e.editorBox(...l),te=(...l)=>e.repliesOf(...l),ce=(...l)=>e.isMine(...l),me=(...l)=>e.actionButton(...l),P=(...l)=>e.iconAction(...l),ue=(...l)=>e.afterChange(...l),ve=(...l)=>e.refresh(...l),_=(...l)=>e.watchChanges(...l),ge=(...l)=>e.prioritySendRow(...l),xe=(...l)=>e.submitDraft(...l),je=(...l)=>e.canSend(...l),Pe=(...l)=>e.textArea(...l),Re=(...l)=>e.canAct(...l),Xe=(...l)=>e.readOnly(...l),Ee=(...l)=>e.showError(...l),Qe=(...l)=>e.sheetComposer(...l),F={anchored:new Set,activeId:null,get comments(){return e.state.comments},set comments(l){e.state.comments=l},get filter(){return e.state.filter},set filter(l){e.state.filter=l},get open(){return e.state.open},set open(l){e.state.open=l},get editor(){return e.state.editor},set editor(l){e.state.editor=l},get confirmDeleteId(){return e.state.confirmDeleteId},set confirmDeleteId(l){e.state.confirmDeleteId=l},get width(){return e.state.width},set width(l){e.state.width=l},get view(){return e.state.view},set view(l){e.state.view=l}},H=null;function De(l,g){if(g===null){l.removeAttribute("role"),l.removeAttribute("aria-label");return}l.setAttribute("role","group"),l.setAttribute("aria-label",g)}let be=null,K=null,Z=null,Me=!1,ae=Go,We=null,w=!1,Ue=!1,ot=0,Oe=!1,He=null,Ie=null,Ge=null,Ne=null,Ye=null,Ze=!1;function Se(){for(let l of F.comments)for(let g of Yr(l.id))Io(g,l,l.id===F.activeId)}let rt=null;function et(l=!1){if(n())return;let g=o(),E=g.map(V=>`${V.id}:${V.resolvedAt===null?"0":"1"}`).join(",");!l&&E===rt||(rt=E,F.anchored=ns(g),Se())}let k=1200,y=null;function S(l){y={id:l,until:Date.now()+k},G()}function B(l){if(S(l),e.listBox===null)return;let g=e.listBox.querySelector(`[data-card-id="${CSS.escape(l)}"]`);g instanceof HTMLElement&&g.scrollIntoView({block:"center",behavior:"smooth"})}function G(){if(y===null||e.listBox===null)return;let l=y.until-Date.now();if(l<=0){y=null;return}let g=e.listBox.querySelector(`[data-card-id="${CSS.escape(y.id)}"]`);g instanceof HTMLElement&&(g.classList.add("is-flash"),t.timeout(()=>g.classList.remove("is-flash"),l))}function de(l,g){if(s())return;F.activeId=l;let E=F.comments.find(V=>V.id===l);if(E!==void 0&&!d(E)&&(F.filter=xn(E)),it()){Se(),f(),pn()||L(l,g);return}F.open||Pt(!0),Se(),f(),B(l)}function m(){ae.open&&(ae=li(),We=null,w=!1,t.clearTimeout(Q),T=!1,D=null,c(0,!1),H!==null&&(H.hidden=!0,H.replaceChildren(),De(H,null),H.className="popover"),f())}function I(){return ae.open}function j(l){let g=i("div","peek-slide");g.appendChild(i("div","peek-grab"));let E=l.resolvedAt!==null,V=F.editor!==null&&F.editor.targetId===l.id,W=F.confirmDeleteId===l.id,re=i("div","card-head");re.appendChild(C(l.author));let ne=i("div");ne.appendChild(i("div","who-name",l.author.name));let U=i("div","who-time",Nt(l.createdAt));U.title=ut(l.createdAt),ne.appendChild(U),re.appendChild(ne),re.appendChild(i("span","spacer"));let J=R(),at=J.findIndex(st=>st.id===l.id);J.length>1&&at>=0&&re.appendChild(i("span","who-time",`${at+1} / ${J.length}`)),E&&re.appendChild(i("span","tag",a("toolbox.common.resolved"))),re.appendChild(h(l.priority)),g.appendChild(re);let ke=i("div","peek-body");if(A(ke,l,"pop-quote","peek-text"),E&&l.resolvedBy!==null&&ke.appendChild(i("p","note",a("toolbox.common.resolvedBy",{name:l.resolvedBy}))),g.appendChild(ke),V)return g.appendChild(N(l)),g;let tt=i("div","peek-foot"),qt=te(l.id).length;tt.appendChild(i("span","hint",qt===0?a("toolbox.peek.noReplies"):a("toolbox.peek.replies",{count:qt})));let Ot=i("button","peek-more");if(Ot.type="button",Ot.textContent=a("toolbox.peek.showAll"),Ot.addEventListener("click",()=>Ft(),{signal:t.signal}),tt.appendChild(Ot),g.appendChild(tt),ce(l)&&Re()){let st=i("div","peek-actions");W?(st.appendChild(i("span","hint",a("toolbox.common.confirmDeleteComment"))),st.appendChild(me(a("toolbox.common.remove"),pt,()=>{sn(l.id)},"is-danger")),st.appendChild(me(a("toolbox.common.cancel"),Je,()=>{F.confirmDeleteId=null,f()}))):(st.appendChild(P(a("toolbox.common.edit"),hn,()=>{F.editor={mode:"edit",targetId:l.id,body:l.body,priority:l.priority},F.confirmDeleteId=null,f()})),st.appendChild(P(a("toolbox.common.delete"),pt,()=>{F.confirmDeleteId=l.id,F.editor=null,f()},"is-danger"))),g.appendChild(st)}return g}function X(){return ae.commentId===null?-1:R().findIndex(l=>l.id===ae.commentId)}function _e(){if(H===null||!ae.open||ae.commentId===null)return;let l=R(),g=l.findIndex(E=>E.id===ae.commentId);if(g<0){m();return}We=i("div","peek-track");for(let E of[-1,0,1]){let V=l[g+E],W=i("div","peek-slot");V!==void 0&&W.appendChild(j(V)),We.appendChild(W)}x(0,!1),H.replaceChildren(),H.appendChild(We),c(0,!1),Se()}function xt(l,g){if(!(l instanceof Element))return null;let E=l.closest(g);return E instanceof HTMLElement&&E.scrollHeight>E.clientHeight?E:null}function Vt(l,g){let E=null,V=0,W=0,re=0,ne="undetermined";l.addEventListener("pointerdown",J=>{J.pointerType!=="mouse"&&(E=xt(J.target,g),V=J.clientX,W=J.clientY,re=J.clientY,ne="undetermined")},{signal:t.signal}),l.addEventListener("pointermove",J=>{E!==null&&(ne==="undetermined"&&(ne=vn(J.clientX-V,J.clientY-W)),ne==="vertical"&&(J.preventDefault(),E.scrollTop-=J.clientY-re,re=J.clientY))},{passive:!1,signal:t.signal});let U=()=>{E=null};l.addEventListener("pointerup",U,{signal:t.signal}),l.addEventListener("pointercancel",U,{signal:t.signal})}function Ft(){let l=ae.commentId,g=an();Ue=!0,H?.classList.add("is-handoff"),g>0&&c(-g,!0),Pt(!0),e.panel?.classList.add("is-rising"),l!==null&&(F.activeId=l,Se(),f(),t.frame(()=>B(l))),t.timeout(()=>{Ue=!1,H?.classList.remove("is-handoff"),e.panel?.classList.remove("is-rising"),m()},It)}function an(){return H===null?0:H.getBoundingClientRect().height}function c(l,g){H!==null&&(H.classList.toggle("is-dropping",g),H.style.transform=l===0?"":`translateY(${Math.round(l)}px)`)}function x(l,g,E=It){We!==null&&(We.classList.toggle("is-sliding",g),We.style.transitionDuration=g?`${E}ms`:"",We.style.transform=`translateX(calc(-100% / 3 + ${Math.round(l)}px))`)}function L(l,g){H!==null&&F.comments.find(E=>E.id===l)!==void 0&&(F.open&&Pt(!1),F.editor=null,F.confirmDeleteId=null,H.className="popover is-peek",De(H,a("toolbox.common.comment")),H.style.left="",H.style.top="",Te(),H.hidden=!1,ae=Cl(g??H,l),f())}let T=!1,D=null,Q=0;function Be(l,g,E){let V=R(),W=X(),re=V[W+l],ne=H?.getBoundingClientRect().width??0;if(l===0||W<0||re===void 0||ne===0){x(0,!0,Wr(Math.abs(E),g,It));return}let U=-l*ne,J=Wr(Math.abs(U-E),g,It);T=!0,D=re.id,x(U,!0,J),Q=t.timeout(()=>ht(re.id),J)}function ht(l){t.clearTimeout(Q),T=!1,D=null,I()&&(F.activeId=l,ae=si(ae,l),F.editor=null,F.confirmDeleteId=null,f())}async function sn(l){let g=R(),E=g.findIndex(re=>re.id===l),V=g[E+1]??g[E-1]??null,W=await Ho(l);t.disposed||ue(W)&&(F.confirmDeleteId=null,F.activeId===l&&(F.activeId=null),V!==null&&(F.activeId=V.id,ae=si(ae,V.id)),await ve(),!t.disposed&&V===null&&m())}function ro(l){let g=0,E=0,V=0,W="undetermined",re=!1,ne=!1,U=()=>ae.commentId!==null&&(F.editor!==null&&F.editor.targetId===ae.commentId||F.confirmDeleteId===ae.commentId),J=ke=>xt(ke,".peek-body")!==null;l.addEventListener("pointerdown",ke=>{!I()||U()||(T&&D!==null&&ht(D),g=ke.clientX,E=ke.clientY,V=ke.timeStamp,W="undetermined",re=!0,ne=J(ke.target),w=!0)},{signal:t.signal}),l.addEventListener("pointermove",ke=>{if(!re)return;let tt=ke.clientX-g,qt=ke.clientY-E;if(W==="undetermined"&&(W=vn(tt,qt)),W==="vertical"){if(ne){re=!1,w=!1;return}c(qt,!1),ke.preventDefault();return}if(W!=="horizontal")return;ke.preventDefault();let Ot=R(),st=X(),go=tt>0&&st<=0||tt<0&&st>=Ot.length-1;x(go?Ur(tt):tt,!1)},{passive:!1,signal:t.signal});let at=ke=>{if(!re)return;re=!1,w=!1;let tt=ke.clientX-g,qt=ke.clientY-E;if(W==="vertical"){let Sc=l.getBoundingClientRect().height,na=$a(tt,qt);if(na==="none"){c(0,!0);return}if(na==="down"){c(Sc,!0),t.timeout(()=>m(),It);return}Ft();return}if(W!=="horizontal")return;let Ot=Math.max(1,ke.timeStamp-V),st=l.getBoundingClientRect().width,go=tt/Ot;Be(Ua(tt,go,st),go,tt)};l.addEventListener("pointerup",at,{signal:t.signal}),l.addEventListener("pointercancel",ke=>at(ke),{signal:t.signal})}function gr(l){F.activeId=l,Se(),f();let g=Yr(l);g.length>0&&g[0].scrollIntoView({block:"center",behavior:"smooth"})}function it(){return Na(window.innerWidth)}function vr(){return window.matchMedia("(pointer: fine)").matches}let On=null;function br(){return On??(On=qa(navigator.platform,navigator.userAgent)),On}function In(l){return Da(l,window.innerWidth)}let Mn=Fe.base;function $t(){if(e.readingNavigation!==null){e.readingNavigation.setPanel(F.open&&!it()?F.width:0);return}let l=document.documentElement;e.originalPaddingRight===null&&(e.originalPaddingRight=l.style.paddingRight),l.style.transition=`padding-right ${Mn}ms ${$e}`;let g=F.open&&!it();l.style.paddingRight=g?`${F.width}px`:e.originalPaddingRight}function Hn(){let l=it();e.root!==null&&(e.root.host.classList.toggle("is-narrow",l),e.root.host instanceof HTMLElement&&e.root.host.style.setProperty("--tools-panel-offset",F.open&&!l?`${F.width}px`:"0px")),e.panel!==null&&(e.panel.style.width=l?"":`${F.width}px`,dn(),ao())}let ln="half";function dn(){if(e.panel!==null){if(e.panel.classList.remove("is-half","is-expanded"),!it()){e.panel.style.top="";return}e.panel.style.top="",e.panel.classList.add(ln==="expanded"?"is-expanded":"is-half")}}function Nn(l){if(l==="closed"){Pt(!1);return}ln=l,dn()}function io(l){let g=0,E=0,V=!1,W=!1,re=()=>gl(Bn(),wr(),yr());l.addEventListener("pointerdown",U=>{!it()||e.panel===null||(W=!0,V=!1,g=U.clientY,E=e.panel.getBoundingClientRect().top,e.panel.classList.add("is-dragging"),l.setPointerCapture(U.pointerId))},{signal:t.signal}),l.addEventListener("pointermove",U=>{if(!W||e.panel===null)return;let J=U.clientY-g;Math.abs(J)>4&&(V=!0),e.panel.style.top=`${Math.max(0,E+J)}px`},{signal:t.signal});let ne=U=>{if(!W||e.panel===null)return;if(W=!1,e.panel.classList.remove("is-dragging"),!V){e.panel.style.top="",Nn(bl(ln));return}let J=Math.max(0,E+(U.clientY-g));e.panel.style.top="",Nn(vl(J,re()))};l.addEventListener("pointerup",ne,{signal:t.signal}),l.addEventListener("pointercancel",U=>ne(U),{signal:t.signal})}function mt(l){if(e.root===null)return 0;let g=getComputedStyle(e.root.host).getPropertyValue(l).trim(),E=Number.parseFloat(g);return Number.isFinite(E)?E:0}function wr(){return mt("--safe-top")}function yr(){return mt("--space-7")+mt("--toast-lane")+mt("--compare-bar")+mt("--top-lane")}function ao(){if(e.panel===null)return;if(!it()){e.panel.style.bottom="";return}let l=window.visualViewport,g=l==null?0:ai(Bn(),l.height,l.offsetTop);e.panel.style.bottom=g===0?"":`${g}px`}function Pt(l){l&&e.readingNavigation?.close(!1),Ze=!1;let g=ul(Dn(),l);l&&!F.open&&(ln="half"),F.open=g.sheetOpen,cn(g),$t(),f(),n()&&t.timeout(()=>Kn(),Mn)}function Dn(){return{sheetOpen:F.open,dockOpen:pn(),hasDraft:Z!==null}}function cn(l){l.hasDraft||(Z!==null&&Et(Z.marks),Z=null,Me=!1)}function xr(l){it()||(F.width=In(l),Ht(e.STORAGE_WIDTH,String(F.width)),Hn(),$t())}function kr(){it()||(F.width=In(F.width)),Hn(),$t(),f(),n()&&(Kn(),_())}function so(l){if(H===null)return;H.hidden=!1;let g=H.offsetWidth,E=H.offsetHeight,{gap:V,edge:W}=Co,re=l.left+l.width/2-g/2,ne=Math.min(window.innerWidth-g-W,Math.max(W,re)),U=window.innerHeight-W-(l.bottom+V),J=l.top-V-W,at=l.bottom+V;U<E&&(J>=E?at=l.top-V-E:U>=J?at=Math.max(W,window.innerHeight-W-E):at=W),H.style.left=`${ne}px`,H.style.top=`${at}px`}function gt(){Z!==null&&Et(Z.marks),Z=null,Me=!1;let l=ae.open;l&&(ae=li());let g=e.moreMenuOpen;e.moreMenuOpen=!1,H!==null&&(H.hidden=!0,H.replaceChildren(),De(H,null),H.className="popover"),(l||g)&&f(),g&&e.moreButton?.focus({preventScroll:!0})}let lo="";function co(l){return e.iconAction(a("toolbox.selection.copy"),gn,()=>{e.copyText(l,a("toolbox.common.copied"),a("toolbox.selection.copyFailed"))},"selection-aside")}function uo(l){e.canReadFrom()&&l.appendChild(e.iconAction(a("toolbox.selection.readFrom"),Vn,()=>Cr(),"selection-aside"))}function Cr(){let l=Z?.marks.find(E=>E.isConnected)??null,g=document.createRange();if(l!==null)g.setStartBefore(l);else{let E=Ie??zt();if(E===null)return;g.setStart(E.startContainer,E.startOffset)}g.collapse(!0),gt(),Te(),window.getSelection()?.removeAllRanges(),e.readFrom(g)}function r(l){lo=window.getSelection()?.toString()||l.quote;let g=Z,E=g!==null&&g.anchor.quote===l.quote&&g.marks.length>0&&g.marks.every(W=>W.isConnected),V=[];if(g!==null&&E)V=g.marks;else{g!==null&&Et(g.marks);let W=Ji();W!==null&&(V=_n(W))}Z={anchor:zn(l),kind:"comment",priority:"want",body:"",marks:V}}function u(l,g){H!==null&&(r(l),O(g))}function v(l,g,E){Ba(E)&&u(l,g)}function O(l){if(H===null||Z===null)return;let g=Z;H.className="popover",De(H,a("toolbox.selection.surface")),H.replaceChildren();let E=i("div","quote-row");E.appendChild(i("p","pop-quote",g.anchor.quote)),E.appendChild(co(lo)),uo(E);let V=i("button","icon-button");V.type="button",V.title=a("toolbox.common.close"),V.appendChild(oe(Je,se.small)),V.addEventListener("click",()=>gt(),{signal:t.signal}),E.appendChild(V),H.appendChild(E);let W=i("div","composer"),re=ge(U=>{g.priority=U,xe()});re.setEnabled(je(g.body));let ne=Pe(g.body,a("toolbox.common.writeSomething"),U=>{g.body=U,re.setEnabled(je(U))},{onPriority:U=>{g.priority=U,xe()},quoteWhenEmpty:()=>g.anchor.quote});W.appendChild(ne),W.appendChild(re.row),H.appendChild(W),so(l),t.timeout(()=>ne.focus({preventScroll:!0}),0)}let M=["is-compact","is-peek","is-menu"];function q(){if(H===null||H.hidden)return!1;let l=H.classList;return!M.some(g=>l.contains(g))}function ee(){return Z!==null&&!je(Z.body)}function ie(){if(n()){Te();return}if(q()&&!ee())return;if(pn()){fc();return}if(Z!==null&&it())return;let l=Oo(),g=_a(window.innerWidth,l!==null);if(g==="none"||l===null){ae=ae,Te(),H!==null&&!H.hidden&&!q()&&!I()&&gt();return}if(g==="bar"){if(!Re()){Te(),Xe()||Ee(a("toolbox.common.sessionExpired"));return}po(l);return}let E=window.getSelection(),V=E!==null&&E.rangeCount>0?E.getRangeAt(0).getBoundingClientRect():null;if(V===null||V.width+V.height===0){gt();return}if(Re()){v(l,V,g);return}gt(),Xe()||Ee(a("toolbox.common.sessionExpired"))}function pe(){t.clearTimeout(ot),!Oe&&(ot=t.timeout(()=>{Oe||ie()},Va(window.innerWidth)))}function Te(){He=null,Ie=null,!(be===null||be.hidden)&&(be.classList.remove("is-shown"),be.hidden=!0,be.replaceChildren(),f())}function po(l){if(be===null)return;m(),He=zn(l),Ie=zt()?.cloneRange()??null,be.replaceChildren();let g=i("span","selbar-quote",He.quote);g.title=He.quote,be.appendChild(g);let E=i("button","selbar-action");E.type="button",E.appendChild(oe(So,se.small)),E.appendChild(i("span",void 0,a("toolbox.common.comment"))),E.addEventListener("click",()=>Er(),{signal:t.signal}),be.appendChild(co(window.getSelection()?.toString()||l.quote)),uo(be),be.appendChild(E),be.hidden=!1,t.frame(()=>be?.classList.add("is-shown")),f()}function Er(){let l=Oo(),g=l!==null?zn(l):He;if(g===null){Te();return}Ne=mc();let E=Le();Z={anchor:g,kind:"comment",priority:"want",body:"",marks:E},Me=!1,Te(),window.getSelection()?.removeAllRanges(),F.view="comments",ta()}function zt(){let l=window.getSelection();return l===null||l.rangeCount===0||l.isCollapsed?null:l.getRangeAt(0)}function Le(){let l=zt()??Ie;return l===null?[]:_n(l)}function _n(l){try{return Za(l)}catch{return[]}}function Ji(){let l=zt();if(l===null)return null;let g=l.commonAncestorContainer,E=g instanceof Element?g:g.parentElement;return E===null||E.closest(bt)!==null?null:l}function fc(){if(Z===null)return;let l=Ji();if(l===null)return;let g=Oo();g!==null&&g.quote!==Z.anchor.quote&&(Et(Z.marks),Z.anchor=zn(g),Z.marks=_n(l),window.getSelection()?.removeAllRanges(),hc(Z.anchor.quote))}function hc(l){Ge!==null&&(Ge.textContent=l,Ge.classList.add("is-swapped"),t.timeout(()=>Ge?.classList.remove("is-swapped"),400))}function mc(){let l=window.getSelection();if(l===null||l.rangeCount===0)return null;let g=l.getRangeAt(0).startContainer,E=g instanceof Element?g:g.parentElement;return E===null||E.closest(bt)!==null?null:E}function ji(){Rr()}function gc(){Z!==null&&(pn()?ji():gt())}let Rt=0,Sr=0,un=!1;function Tr(){if(K===null)return;let l=Rt+Sr;K.style.transform=l===0?"":`translateY(${l}px)`,K.classList.toggle("is-compact",Rt<0)}function Lr(l,g){K!==null&&(K.classList.toggle("is-dropping",g),Sr=l,Tr())}function Bn(){let l=document.documentElement.clientHeight;return l>0?l:window.innerHeight}function vc(){if(K===null||K.hidden||un)return;let l=window.visualViewport;Rt=-(l==null?0:ai(Bn(),l.height,l.offsetTop)),Tr()}function Xi(){if(K===null||K.hidden||un)return!1;let l=window.visualViewport;if(l==null)return!1;let g=K.getBoundingClientRect().bottom,E=g-Rt,V=il(E,Bn(),l.height,l.offsetTop);return sl(g,V)?(Rt=al(Rt,g,V),Tr(),!0):!1}function Ar(){if(K===null||K.hidden||e.root===null)return!1;let l=e.root.activeElement;return l!==null&&K.contains(l)}let fo=!1;function bc(){if(fo)return;fo=!0;let l=!1,g=()=>{if(!Ar()){fo=!1;return}Xi()?l=!0:l&&(l=!1,Zi()),t.frame(g)};t.frame(g)}let wc=400,Qi=0,ho=!1;function mo(){if(Qi=Date.now()+wc,ho)return;ho=!0;let l=()=>{if(vc(),Xi(),K!==null&&!K.hidden&&Date.now()<Qi){t.frame(l);return}ho=!1,Zi()};t.frame(l)}function yc(){K===null||Z===null||(K.replaceChildren(),Ge=null,K.appendChild(i("div","peek-grab")),K.appendChild(Qe(Z)))}function Pr(){if(K===null||K.hidden)return;let l=document.documentElement;Ye===null&&(Ye=l.style.scrollPaddingBottom);let g=Math.max(0,Bn()-K.getBoundingClientRect().top);l.style.scrollPaddingBottom=`${Math.round(g)}px`}function Zi(){if(K===null||K.hidden||Z===null)return;let l=Z.marks[0];if(l===void 0)return;let E=window.visualViewport?.offsetTop??0,V=K.getBoundingClientRect().top,W=l.getBoundingClientRect();ll(W.top,W.bottom,E,V)||(Pr(),l.scrollIntoView({block:"nearest",behavior:"smooth"}))}function xc(){Ne!==null&&(Pr(),Ne.scrollIntoView({block:"nearest",behavior:"smooth"}))}function ea(){Ye!==null&&(document.documentElement.style.scrollPaddingBottom=Ye,Ye=null)}function ta(){if(K===null||Z===null)return;e.readingNavigation?.close(!1);let l=pl(Dn());F.open&&!l.sheetOpen&&Pt(!1),cn(l),Te(),m(),yc(),K.hidden=!1,mo(),xc(),f()}function Rr(){Z!==null&&Z.marks.length>0&&Et(Z.marks),cn(fl(Dn())),Ne=null,ea(),K!==null&&(K.hidden=!0,K.replaceChildren(),Rt=0,Sr=0,un=!1,K.classList.remove("is-dropping"),K.style.transform=""),f()}function pn(){return K!==null&&!K.hidden}function kc(l){let g=0,E=0,V="undetermined",W=!1;l.addEventListener("pointerdown",ne=>{pn()&&(ne.target instanceof Element&&ne.target.closest("textarea, input, button")!==null||(g=ne.clientX,E=ne.clientY,V="undetermined",W=!0))},{signal:t.signal}),l.addEventListener("pointermove",ne=>{if(!W)return;let U=ne.clientX-g,J=ne.clientY-E;V==="undetermined"&&(V=vn(U,J)),V==="vertical"&&(ne.preventDefault(),un=!0,Lr(J>0?J:Ur(J),!1))},{passive:!1,signal:t.signal});let re=ne=>{if(!W||(W=!1,!un))return;let U=ne.clientY-E;if(!Fa(ne.clientX-g,U)){Lr(0,!0),t.timeout(()=>{un=!1,mo()},It);return}let J=l.getBoundingClientRect().height;Lr(rl(J,Rt),!0),t.timeout(()=>Rr(),It)};l.addEventListener("pointerup",re,{signal:t.signal}),l.addEventListener("pointercancel",ne=>re(ne),{signal:t.signal})}function Cc(){let l=0,g=0,E=!1,V=!1,W=(U,J,at)=>{Ar()&&(l=J,g=at,E=K!==null&&U.composedPath().includes(K),V=!0)},re=(U,J)=>{!V||!ol({keyboardVisible:Ar(),startedInDock:E,dx:U-l,dy:J-g})||(V=!1,Ec())},ne=()=>{V=!1};document.addEventListener("pointerdown",U=>W(U,U.clientX,U.clientY),{capture:!0,signal:t.signal}),document.addEventListener("pointermove",U=>re(U.clientX,U.clientY),{capture:!0,signal:t.signal}),document.addEventListener("pointerup",ne,{capture:!0,signal:t.signal}),document.addEventListener("touchstart",U=>{let J=U.touches[0];J!==void 0&&W(U,J.clientX,J.clientY)},{capture:!0,passive:!0,signal:t.signal}),document.addEventListener("touchmove",U=>{let J=U.touches[0];J!==void 0&&re(J.clientX,J.clientY)},{capture:!0,passive:!0,signal:t.signal}),document.addEventListener("touchend",ne,{capture:!0,signal:t.signal})}function Ec(){let l=e.root?.activeElement;l instanceof HTMLElement&&l.blur(),mo()}return{dispose(){t.dispose(),fo=!1,ho=!1,ea()},syncMarks:et,flashCard:S,focusCard:B,applyFocus:G,selectFromMark:de,hideMarkPeek:m,isPeeking:I,renderPeek:_e,attachInnerScroll:Vt,get peekSliding(){return T},set peekSliding(l){T=l},attachPeekGestures:ro,selectFromCard:gr,isNarrow:it,hasFinePointer:vr,appleKeys:br,clampWidth:In,applyPush:$t,applyPanelShape:Hn,attachSheetDrag:io,tokenPx:mt,applyViewportHeight:ao,setOpen:Pt,setWidth:xr,handleResize:kr,placePopover:so,hidePopover:gt,scheduleSelectionCheck:pe,hideSelectionBar:Te,discardDraft:ji,dropDraft:gc,trackComposeDock:bc,settleComposeDock:mo,updateScrollPadding:Pr,openComposeDock:ta,closeComposeDock:Rr,isDocked:pn,attachDockSwipe:kc,attachKeyboardDismiss:Cc,get popover(){return H},set popover(l){H=l},get selectionBar(){return be},set selectionBar(l){be=l},get composeDock(){return K},set composeDock(l){K=l},nameSurface:De,get draft(){return Z},set draft(l){Z=l},get draftFocused(){return Me},set draftFocused(l){Me=l},get peek(){return ae},set peek(l){ae=l},get peekDragging(){return w},set peekDragging(l){w=l},get peekHandoff(){return Ue},set peekHandoff(l){Ue=l},get selectionTimer(){return ot},set selectionTimer(l){ot=l},get adjustingSelection(){return Oe},set adjustingSelection(l){Oe=l},get dockQuote(){return Ge},set dockQuote(l){Ge=l},get sheetOpenPending(){return Ze},set sheetOpenPending(l){Ze=l},state:F}}function Tl(e){return e==="success"?2400:null}function Ll(e,t){let n=[t,...e.filter(o=>o.id!==t.id)];if(n.length<=5)return n;for(let o=n.length-1;o>=0;o-=1)if(n[o].state==="success")return n.splice(o,1),n;return n}function Al(e,t,n,o){return e.map(s=>s.id===t?{id:t,state:n,text:o}:s)}function Yo(e,t){return e.filter(n=>n.id!==t)}function Pl(e,t){return e.find(n=>n.id===t)??null}function Rl(e){let t=ct(),n=(...k)=>e.pushToast(...k),o=(...k)=>e.showError(...k),s=(...k)=>e.setOpen(...k),d=(...k)=>e.handleFailure(...k),f=(...k)=>e.render(...k),C=(...k)=>e.renderPanelBody(...k),R=(...k)=>e.actionButton(...k),h={access:null,accessEmail:"",accessInvited:null,accessScopeTo:null,accessRevokeId:null,accessApproveId:null,get view(){return e.state.view},set view(k){e.state.view=k},get busy(){return e.state.busy},set busy(k){e.state.busy=k},get slug(){return e.state.slug},set slug(k){e.state.slug=k},get features(){return e.state.features},set features(k){e.state.features=k},get visibility(){return e.state.visibility},set visibility(k){e.state.visibility=k},get personal(){return e.state.personal},set personal(k){e.state.personal=k}},A=!1,N=0;function te(){return`${window.location.origin}${window.location.pathname}`}function ce(k){n(k,"success")}async function me(k,y,S=a("toolbox.share.copyFailed")){let B=await Un(k);return t.disposed?!1:(B?ce(y):o(S),B)}async function P(){let k=await me(te(),a("toolbox.common.linkCopied"));t.disposed||k&&ve()}function ue(){e.barLink!==null&&Yt(e.barLink,A),e.narrowLink!==null&&Yt(e.narrowLink,A)}function ve(){A=!0,t.clearTimeout(N),ue(),N=t.timeout(()=>{A=!1,ue()},2400)}async function _(k){!await Un(k)||t.disposed||ce(a("toolbox.share.quoteCopied"))}let ge=a("toolbox.access.openWarning"),xe=a("toolbox.access.reviewNote"),je=a("toolbox.access.publishWarning"),Pe=a("toolbox.access.publishFromListWarning");function Re(){return cl({allowed:h.features.sharing,openToAnyone:h.visibility==="public"})}async function Xe(){if(!Re()||(h.view="access",s(!0),h.access!==null))return;let k=await fs(h.slug);if(!t.disposed){if(!k.ok){h.view==="access"&&(h.view="comments"),d(k);return}h.access=k.value,f()}}async function Ee(k,y){h.busy=!0,h.accessInvited=null,f();let S=await hs(h.slug,k);return t.disposed?!1:(h.busy=!1,S.ok?(h.access=S.value,h.accessScopeTo=null,h.accessRevokeId=null,h.accessApproveId=null,f(),y!==void 0&&ce(y),!0):(d(S),!1))}function Qe(k){let y=[];for(let S of k.grants)S.kind==="member"&&S.memberEmail!==null&&y.push(S.memberEmail);return y}function F(k){let y=[];for(let S of k.grants)S.kind==="group"&&S.groupId!==null&&y.push(S.groupId);return y}function H(k){return k.kind==="member"?k.memberEmail??a("toolbox.access.unknownMember"):k.groupName??a("toolbox.access.goneGroup")}function De(k){let y=h.accessEmail.trim();if(y.length===0)return;let S=Qe(k);if(S.some(B=>B.toLowerCase()===y.toLowerCase())){o(a("toolbox.access.alreadyAdded"));return}h.accessEmail="",Ee({members:[...S,y]}).then(B=>{!B||!h.personal||t.disposed||(h.accessInvited=y,f())})}function be(k,y){if(y.kind==="member"){let S=Qe(k).filter(B=>B!==y.memberEmail);Ee({members:S});return}Ee({groups:F(k).filter(S=>S!==y.groupId)})}function K(k,y,S,B,G){let de=i("div","access-confirm");de.appendChild(i("p","access-warning",k)),G!==void 0&&de.appendChild(i("p","access-warning",G));let m=i("div","access-row");return m.appendChild(R(y,S,B,"is-danger")),m.appendChild(R(a("toolbox.common.cancel"),Je,()=>{h.accessScopeTo=null,h.accessRevokeId=null,h.accessApproveId=null,C()})),de.appendChild(m),de}let Z={restricted:0,internal:1,public:2};function Me(k,y){return Z[y]<=Z[k]?null:y==="internal"?ge:k==="restricted"?Pe:je}let ae={restricted:a("toolbox.access.scope.restricted"),internal:a("toolbox.access.scope.internal"),public:a("toolbox.access.scope.public")},We={internal:{label:a("toolbox.access.action.internal"),icon:Ao},public:{label:a("toolbox.access.action.public"),icon:Gt}};function w(k){let y=h.slug.split("/").slice(1).join("/");return`${window.location.origin}/${k==="public"?"public":"internal"}/${y}`}function Ue(k){let y=w(k),S=i("div","access-link");return S.appendChild(i("span","access-url",y)),S.appendChild(R(a("toolbox.common.copyLink"),Gt,()=>{me(y,a("toolbox.common.linkCopied"))})),S}function ot(k){let y=i("div","access-scope"),S=k.scope,B=de=>{if(de!==S){if(Me(S,de)===null){Ee({scope:de});return}h.accessScopeTo=de,h.accessRevokeId=null,C()}},G=["restricted",...h.personal?[]:["internal"],...k.switchable?["public"]:[]];for(let de of G)y.appendChild(He(ae[de],S===de,()=>B(de))),S===de&&y.appendChild(Ie(k,de));return y}function Oe(k,y){if(y==="restricted")return null;let S=Me(k,y);if(S===null)return null;let B=We[y],G=i("div","access-part");return G.appendChild(i("h3","access-head",a("toolbox.access.switchTo",{scope:ae[y]}))),G.appendChild(K(S,B.label,B.icon,()=>{Ee({scope:y})},y==="public"?xe:void 0)),G}function He(k,y,S){let B=i("label","check-row"),G=i("input");G.type="radio",G.name="surprise-access-scope",G.className="check-input",G.checked=y,G.disabled=h.busy||y;let de=i("span","radio-mark");return B.appendChild(G),B.appendChild(de),B.appendChild(i("span","check-label",k)),G.addEventListener("change",()=>{G.checked&&S()},{signal:t.signal}),B.addEventListener("click",m=>m.stopPropagation(),{signal:t.signal}),B}function Ie(k,y){let S=i("div","scope-child");if(y==="public")return S.appendChild(i("p","note",a("toolbox.access.publicNote"))),S.appendChild(Ue(y)),S.appendChild(i("p","note",a("toolbox.access.publicCloseNote"))),h.personal&&S.appendChild(Ze(k)),S;if(y==="internal")return S.appendChild(i("p","note",a("toolbox.access.internalNote"))),S.appendChild(Ue(y)),S;S.appendChild(i("p","note",h.personal?a("toolbox.access.restrictedNotePersonal"):a("toolbox.access.restrictedNote"))),S.appendChild(Ue(y));let B=Ye(k);return B!==null&&S.appendChild(B),S.appendChild(Ze(k)),h.personal||S.appendChild(Se(k)),S}function Ge(k,y){if(h.accessRevokeId===y.id){let G=h.personal&&k.scope==="public"?a("toolbox.access.revokeToolsSentence",{who:H(y)}):y.kind==="member"?a("toolbox.access.revokeMemberSentence",{who:H(y)}):a("toolbox.access.revokeGroupSentence",{who:H(y)});return K(G,a("toolbox.access.revoke"),pt,()=>be(k,y))}let S=i("div","access-row"),B=i("div","access-name");return B.appendChild(i("span",void 0,H(y))),y.role==="owner"&&B.appendChild(i("p","note",a("toolbox.access.coOwner"))),S.appendChild(B),y.mine&&y.role==="owner"?(S.appendChild(i("span","note",a("toolbox.access.itsYou"))),S):(y.kind==="member"&&!h.personal&&S.appendChild(y.role==="owner"?R(a("toolbox.access.toViewer"),Ea,()=>{Ee({role:{id:y.id,to:"viewer"}})},void 0,a("toolbox.access.toViewerLabel",{who:H(y)})):R(a("toolbox.access.toOwner"),Ca,()=>{Ee({role:{id:y.id,to:"owner"}})},void 0,a("toolbox.access.toOwnerLabel",{who:H(y)}))),S.appendChild(R(a("toolbox.access.revoke"),pt,()=>{h.accessRevokeId=y.id,h.accessScopeTo=null,C()},"is-danger",a("toolbox.access.revokeLabel",{who:H(y)}))),S)}function Ne(k){return k.requesterName===null?k.requesterEmail:`${k.requesterName}（${k.requesterEmail}）`}function Ye(k){if(k.requests.length===0)return null;let y=i("div","access-part");y.appendChild(i("h3","access-head",a("toolbox.access.requests")));for(let S of k.requests){if(h.accessApproveId===S.id){y.appendChild(K(a("toolbox.access.approveSentence",{who:Ne(S)}),a("toolbox.access.approveConfirm"),lt,()=>{Ee({answer:{id:S.id,approved:!0}})}));continue}let B=i("div","access-row");B.appendChild(i("span","access-name",Ne(S))),B.appendChild(R(a("toolbox.access.approve"),lt,()=>{h.accessApproveId=S.id,h.accessRevokeId=null,h.accessScopeTo=null,C()})),B.appendChild(R(a("toolbox.access.deny"),Je,()=>{Ee({answer:{id:S.id,approved:!1}})})),y.appendChild(B)}return y}function Ze(k){let y=i("div","access-part");y.appendChild(i("h3","access-head",h.personal&&k.scope==="public"?a("toolbox.access.peopleTools"):a("toolbox.access.people")));let S=k.grants.filter(m=>m.kind==="member");S.length===0?y.appendChild(i("p","note",h.personal&&k.scope==="public"?a("toolbox.access.noPeopleTools"):a("toolbox.access.noPeople"))):y.appendChild(i("p","note",h.personal?a("toolbox.access.invitedNote"):a("toolbox.access.coOwnerNote")));for(let m of S)y.appendChild(Ge(k,m));h.personal&&h.accessInvited!==null&&y.appendChild(i("p","note",a("toolbox.access.invited",{who:h.accessInvited})));let B=i("div","access-add"),G=i("input");G.type="email",G.value=h.accessEmail,G.placeholder=a("toolbox.access.emailPlaceholder"),h.personal&&(G.placeholder=a("toolbox.access.emailPlaceholderPersonal")),G.addEventListener("input",()=>{h.accessEmail=G.value},{signal:t.signal}),G.addEventListener("keydown",m=>{m.key==="Enter"&&(m.preventDefault(),De(k))},{signal:t.signal}),B.appendChild(G);let de=R(a("toolbox.access.add"),ka,()=>De(k),"is-strong");return de.disabled=h.busy,B.appendChild(de),y.appendChild(B),y}function Se(k){let y=i("div","access-part");if(y.appendChild(i("h3","access-head",a("toolbox.access.groups"))),k.groups.length===0)return y.appendChild(i("p","note",a("toolbox.access.noGroups"))),y;let S=new Set(F(k));for(let B of k.groups)y.appendChild(rt(k,B,S.has(B.id)));return y}function rt(k,y,S){let B=i("label","check-row"),G=i("input");G.type="checkbox",G.className="check-input",G.checked=S,G.disabled=h.busy;let de=i("span","check-mark");return de.appendChild(oe(lt,se.small)),B.appendChild(G),B.appendChild(de),B.appendChild(i("span","check-label",y.name)),G.addEventListener("change",()=>{let m=F(k),I=G.checked?[...m,y.id]:m.filter(X=>X!==y.id),j=G.checked?a("toolbox.access.groupOn",{group:y.name}):a("toolbox.access.groupOff",{group:y.name});Ee({groups:I},j)},{signal:t.signal}),B.addEventListener("click",m=>m.stopPropagation(),{signal:t.signal}),B}function et(){let k=i("div","access"),y=h.access;if(y===null)return k.appendChild(i("div","empty",a("toolbox.common.loading"))),k;let S=h.accessScopeTo;if(S!==null){let B=Oe(y.scope,S);if(B!==null)return k.appendChild(B),k}return k.appendChild(ot(y)),k}return{dispose(){t.dispose()},pageUrl:te,showNotice:ce,copyText:me,copyPageUrl:P,copyQuote:_,canManageAccess:Re,openAccess:Xe,accessView:et,get linkCopied(){return A},set linkCopied(k){A=k},state:h}}var Ol="0 0 32 32";var Il="M8 5h8l8 8v14H8z",Ml="M16 5l8 8h-8z";function Nc(e){return typeof e!="object"||e===null?!1:"canGoBack"in e&&typeof e.canGoBack=="boolean"&&"canGoForward"in e&&typeof e.canGoForward=="boolean"&&"entries"in e&&typeof e.entries=="function"&&"addEventListener"in e&&typeof e.addEventListener=="function"}function ci(e){let t=Reflect.get(e,"navigation");return Nc(t)?t:null}function Nl(e){let t=ci(e);return t!==null?{back:t.canGoBack,forward:t.canGoForward}:{back:e.history.length>1,forward:!1}}function Dl(e,t){let n=ci(e),o=!1,s=!1,d=()=>{o||(o=!0,queueMicrotask(()=>{o=!1,s||t()}))};return n?.addEventListener("currententrychange",d),e.addEventListener("pageshow",d),e.addEventListener("popstate",d),()=>{s=!0,n?.removeEventListener("currententrychange",d),e.removeEventListener("pageshow",d),e.removeEventListener("popstate",d)}}function _l(e){let t=ci(e),n=t?.currentEntry??null;if(t!==null&&n!==null){let s=t.entries().find(f=>f.index===n.index-1),d=Hl(e,s?.url??null);if(d!==null)return{url:d,reachable:!0}}let o=Hl(e,e.document.referrer);return o===null?null:{url:o,reachable:t===null&&e.history.length>1}}function Hl(e,t){if(t===null||t.length===0)return null;try{let n=new URL(t);return n.origin===e.location.origin?n:null}catch{return null}}var kn={href:"/",key:"home",icon:"home"},ui={href:"/mine",key:"mine",icon:"files"},pi={href:"/favorites",key:"favorites",icon:"favorite"},Dc={href:"/activity",key:"activity",icon:"activity"},Gn={href:"/library",key:"library",icon:"company"},_c=[kn,ui,Gn],Bc=[..._c,pi,Dc];function Yn(e,t=bo,n){return t(`workspace.places.${e.key}`,n===void 0?void 0:{organization:n})}var Bl=12;function Vl(e){let t=[...new Intl.Segmenter("ja",{granularity:"grapheme"}).segment(e)].map(n=>n.segment);return t.length<=Bl?e:`${t.slice(0,Bl).join("")}…`}function Vc(e,t){return t===e.href||e.nested===!0&&t.startsWith(`${e.href}/`)}function Fl(e){return Bc.find(t=>Vc(t,e))??null}function $l(e){return[`--ink: ${e.text};`,`--ink-muted: ${e.muted};`,"--ground: var(--page-ground, Canvas);",`--line: color-mix(in srgb, ${e.text} ${e.lineMix}%, transparent);`,`--hover: color-mix(in srgb, ${e.text} ${e.hoverMix}%, transparent);`,`--press: color-mix(in srgb, ${e.text} ${e.pressMix}%, transparent);`].join(" ")}var zl=`
:host {
  all: initial;
  position: fixed;
  top: var(--location-top, 0px);
  left: 0;
  right: 0;
  z-index: 2147482400;
  display: block;
  height: ${44}px;
  --control: 32px;
  --radius: 6px;
  /* メニューの角と行の角（ワークスペースの --ws-radius-lg / --ws-radius-sm と同じ値） */
  --radius-lg: 8px;
  --radius-sm: 4px;
  /* メニューの影。線 1 本と 2 段のぼかし（ワークスペースの --ws-shadow と同じ） */
  --shadow: 0 0 0 1px var(--line), 0 8px 24px -6px rgb(0 0 0 / 0.14), 0 2px 6px -2px rgb(0 0 0 / 0.08);
  /* 信号機ボタンが使っている左の幅。窓の枠が無ければ 0 */
  --lead: ${ko};
  color-scheme: light;
  ${$l(ei.light)}
}
:host([data-tone="dark"]) {
  color-scheme: dark;
  ${$l(ei.dark)}
}
/* 窓の題名の帯を兼ねているとき（デスクトップアプリ）は、全面の画面（編集など）より上に残す */
:host([data-titlebar]) { z-index: 2147483647; }
/* 顔のメニューを開いている間は、道具箱の層（コメントの板）より上。畳めば元の高さに戻る */
:host([data-menu-open]) { z-index: 2147483100; }
/* 環境の帯の下にいるときは、信号機ボタンは帯の側にある。左は端の余白ぶんだけ空ける */
:host([data-under-ribbon]) { --lead: 4px; }

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

.bar {
  display: flex;
  align-items: center;
  height: 100%;
  /* 左右とも 12px（サイドバーの内側の余白と同じ）。左は印の面、右は顔の面がここから始まる */
  padding: 0 12px;
  background: color-mix(in srgb, var(--ground) 84%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--ink);
  font: 400 14px/20px ${ti};
  -webkit-font-smoothing: antialiased;
  letter-spacing: normal;
  white-space: nowrap;
  transition: box-shadow ${Fe.quick}ms ${$e};
  /* デスクトップアプリでは、この行をつかんで窓を動かせる（ブラウザでは意味を持たない指定） */
  app-region: drag;
}
:host([data-scrolled]) .bar { box-shadow: 0 1px 0 var(--line); }

/*
 * 窓の枠のぶんの場所（信号機ボタンのぶんの空きと、その右隣の戻る・進む）。枠が無ければ幅は 0。
 * 戻る・進むは、この場所に幅があるとき（＝デスクトップアプリ）だけ出す。ブラウザには自前のものがある。
 * 見分けを JS でやらないのは、描いたあとで出たり引っ込んだりさせないため。
 */
.lead {
  display: flex;
  flex: none;
  justify-content: flex-end;
  width: calc(var(--lead) + ${sa});
  container-type: inline-size;
}
.steps { display: none; }
@container (min-width: 1px) {
  .steps { display: flex; }
}

a, button {
  -webkit-tap-highlight-color: transparent;
  app-region: no-drag;
}
:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }

.step {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${Fe.quick}ms ${$e}, color ${Fe.quick}ms ${$e}, opacity ${Fe.quick}ms ${$e};
}
.step:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.step:active:not(:disabled) { background: var(--press); }
.step:disabled { opacity: 0.45; cursor: default; }
.step svg { display: block; }

/* 製品の印（ホーム）。絵のボタン（.step）と同じ 32px の面に、20px の印を真ん中に置く。
   印の色は地と墨の 2 つだけ（サイドバーの頭と同じ。紙は地の色、折った角は墨） */
.mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  border-radius: var(--radius);
  color: var(--ink);
  transition: background-color ${Fe.quick}ms ${$e};
}
/* 組織のロゴ。サイドバーの頭の行のロゴ（.ws-organization-logo）と同じ寸法: 印と同じ高さ・押す面 3 つぶんまでの幅 */
.logo {
  display: block;
  flex: none;
  width: auto;
  height: calc(var(--control) - 0.75rem);
  max-width: calc(var(--control) * 3);
  object-fit: contain;
}
.mark:hover { background: var(--hover); }
.mark:active { background: var(--press); }
.mark svg { display: block; }
.mark-tile { fill: var(--ink); }
.mark-sheet { fill: var(--ground); stroke: var(--ground); }
.mark-fold { fill: var(--ink); stroke: var(--ink); }
/* 場所の名前の面は印の面の右に続き、字は面の左右に 8px ずつ */
.crumbs {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
}
.place {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: var(--control);
  padding: 0 8px;
  border-radius: var(--radius);
  color: var(--ink-muted);
  text-decoration: none;
  transition: background-color ${Fe.quick}ms ${$e}, color ${Fe.quick}ms ${$e};
}
.place:hover { background: var(--hover); color: var(--ink); }
.place:active { background: var(--press); }
.version {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: var(--control);
  margin-left: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color ${Fe.quick}ms ${$e}, color ${Fe.quick}ms ${$e};
}
.version:hover { background: var(--hover); color: var(--ink); }
.version:active { background: var(--press); }
.version-sep { opacity: 0.6; }
/* お気に入りの星。絵のボタン（.step）と同じ寸法・押し心地。付いていれば墨で塗る */
.star {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  margin-left: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${Fe.quick}ms ${$e}, color ${Fe.quick}ms ${$e};
}
.star:hover { background: var(--hover); color: var(--ink); }
.star:active { background: var(--press); }
.star[aria-pressed="true"] { color: var(--ink); }
.star[aria-pressed="true"] svg { fill: currentColor; }
.star svg { display: block; }
/* 右端の顔。絵のボタンと同じ 32px の面に、24px の丸 */
.self {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  margin-left: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${Fe.quick}ms ${$e}, color ${Fe.quick}ms ${$e};
}
.self:hover, .self[aria-expanded="true"] { background: var(--hover); color: var(--ink); }
.self:active { background: var(--press); }
.self svg { display: block; }
/* 頭文字の丸。サイドバーの名乗りの行と同じ寸法・同じ地（押した面の濃さ）・同じ字 */
.avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--press);
  color: var(--ink);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
/* 顔から開くメニュー。顔の真下に 4px 空けて、右端を顔の面の右端にそろえる */
.sheet {
  position: absolute;
  top: ${12/2+32+4}px;
  right: 12px;
  min-width: 176px;
  padding: 4px;
  border-radius: var(--radius-lg);
  background: var(--ground);
  color: var(--ink);
  box-shadow: var(--shadow);
  font: 400 14px/20px ${ti};
  app-region: no-drag;
}
/* 名乗りの 1 行。行き先と同じ高さ・同じ左端で、押せない（字の太さだけ 1 段上げる） */
.menu-name {
  display: flex;
  align-items: center;
  min-height: var(--control);
  margin: 0;
  padding: 0 8px;
  font-weight: 500;
  white-space: nowrap;
}
.menu { display: flex; flex-direction: column; }
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--control);
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color ${Fe.quick}ms ${$e};
}
.menu-item:hover, .menu-item:focus-visible { background: var(--hover); }
.menu-item:focus-visible { outline: none; }
.menu-item svg { display: block; color: var(--ink-muted); }
.menu-item-label { flex: 1; }
/* 場所の列と、個人設定・ログアウトの間。線ではなく余白 1 段（4px の刻み 2 つ） */
.menu-item.is-apart { margin-top: 8px; }
@media (max-width: ${Kr-1}px) {
  .version-sep, .version-number { display: none; }
}
/* 指で押す画面では、メニューの行を 44px にする（ワークスペースの --ws-control と同じ切り替え。行の 44px は 32px の面に収まらないので、顔と印はそのまま） */
@media (max-width: ${Kr-1}px), (pointer: coarse) {
  .menu-name, .menu-item { min-height: 44px; }
}
.divider {
  flex: none;
  color: var(--ink-muted);
  opacity: 0.6;
}
.title {
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .bar, .step, .place, .star, .version, .mark, .self, .menu-item { transition: none; }
}
@media print {
  :host { display: none !important; }
}
`;var Xo="surprise-location",jo=1.5;function ql(e){let t=_l(e),n=t===null?null:Fl(t.url.pathname);return t!==null&&n!==null?{label:Yn(n,a),href:`${t.url.pathname}${t.url.search}`,viaBack:t.reachable}:{label:Yn(Gn,a),href:Gn.href,viaBack:!1}}var zc=[{place:kn,icon:qr},{place:ui,icon:Ra},{place:Gn,icon:Oa},{place:pi,icon:$r}];function qc(){let e="http://www.w3.org/2000/svg",t=document.createElementNS(e,"svg");t.setAttribute("viewBox",Ol),t.setAttribute("width","20"),t.setAttribute("height","20"),t.setAttribute("aria-hidden","true");let n=document.createElementNS(e,"rect");n.setAttribute("width","32"),n.setAttribute("height","32"),n.setAttribute("rx",String(7.5)),n.setAttribute("class","mark-tile");let o=document.createElementNS(e,"path");o.setAttribute("d",Il),o.setAttribute("class","mark-sheet");let s=document.createElementNS(e,"path");s.setAttribute("d",Ml),s.setAttribute("class","mark-fold");for(let d of[o,s])d.setAttribute("stroke-width",String(1.4)),d.setAttribute("stroke-linejoin","round");return t.append(n,o,s),t}var fi=class{constructor(){this.host=document.createElement(Xo);this.lead=i("div","lead");this.mark=i("a","mark");this.back=this.step(a("toolbox.location.back"),ba,()=>window.history.back());this.forward=this.step(a("toolbox.location.forward"),wa,()=>window.history.forward());this.origin=i("a","place");this.divider=i("span","divider","/");this.title=i("span","title");this.favorite=i("button","star");this.onToggleFavorite=null;this.version=i("button","version");this.versionWhen=i("span","version-when");this.versionNumber=i("span","version-number");this.openHistory=null;this.self=i("button","self");this.sheet=i("div","sheet");this.menu=i("div","menu");this.selfRows=[];this.selfName=null;this.stops=[];this.from=ql(window);let t=this.host.attachShadow({mode:"open"}),n=i("style");n.textContent=zl;let o=i("div","steps");o.setAttribute("role","group"),o.setAttribute("aria-label",a("toolbox.location.history")),o.append(this.back,this.forward),this.lead.append(o),this.mark.href=kn.href;let s=Yn(kn,a);this.mark.title=s,this.mark.setAttribute("aria-label",s),this.mark.append(qc());let d=Mr().logo,f=d===null?null:i("img","logo");f!==null&&d!==null&&(f.src=d,f.alt="",f.setAttribute("aria-hidden","true")),this.divider.setAttribute("aria-hidden","true"),this.title.setAttribute("aria-current","page");let C=i("div","crumbs");C.append(this.origin,this.divider,this.title),this.favorite.type="button",this.favorite.hidden=!0,this.favorite.append(oe($r,16,jo)),this.favorite.addEventListener("click",()=>this.onToggleFavorite?.()),this.version.type="button",this.version.hidden=!0,this.version.title=a("toolbox.location.openHistory");let R=i("span","version-sep","·");R.setAttribute("aria-hidden","true"),this.version.append(this.versionWhen,R,this.versionNumber),this.version.addEventListener("click",()=>this.openHistory?.()),this.self.type="button",this.self.hidden=!0,this.self.setAttribute("aria-haspopup","menu"),this.self.setAttribute("aria-expanded","false"),this.self.addEventListener("click",()=>this.toggleSelfMenu()),this.sheet.hidden=!0,this.menu.setAttribute("role","menu"),this.sheet.addEventListener("keydown",ue=>this.onMenuKey(ue));let h=i("nav","bar");h.setAttribute("aria-label",a("toolbox.location.label")),h.append(this.lead,this.mark,...f===null?[]:[f],C,this.favorite,this.version,this.self),t.append(n,h,this.sheet),this.origin.addEventListener("click",ue=>{!this.from.viaBack||ue.metaKey||ue.ctrlKey||ue.shiftKey||ue.altKey||ue.button!==0||(ue.preventDefault(),window.history.back())}),document.body.append(this.host),Ae.set("location",44),this.paint(),this.stops.push(Ae.watch(()=>this.arrange())),this.stops.push(Dl(window,()=>this.paint()));let A=()=>this.paintScrolled(),N=()=>this.arrange(),te=()=>this.paintGround(),ce=ue=>{if(this.sheet.hidden)return;let ve=ue.composedPath();ve.includes(this.self)||ve.includes(this.sheet)||this.closeSelfMenu(!1)},me=window.matchMedia("(prefers-color-scheme: dark)");window.addEventListener("scroll",A,{passive:!0}),window.addEventListener("resize",N),window.addEventListener("load",te),document.addEventListener("click",ce),me.addEventListener("change",te),this.stops.push(()=>{window.removeEventListener("scroll",A),window.removeEventListener("resize",N),window.removeEventListener("load",te),document.removeEventListener("click",ce),me.removeEventListener("change",te)});let P=document.querySelector("title");if(P!==null){let ue=new MutationObserver(()=>this.paintTitle());ue.observe(P,{childList:!0,characterData:!0,subtree:!0}),this.stops.push(()=>ue.disconnect())}}step(t,n,o){let s=i("button","step");return s.type="button",s.title=t,s.setAttribute("aria-label",t),s.append(oe(n,16,jo)),s.addEventListener("click",o),s}paint(){this.from=ql(window),this.origin.textContent=this.from.label,this.origin.href=this.from.href;let t=Nl(window);this.back.disabled=!t.back,this.forward.disabled=!t.forward,this.paintTitle(),this.paintGround(),this.paintScrolled(),this.arrange()}showVersion(t,n){if(this.openHistory=t===null?null:n,t===null){this.version.hidden=!0;return}let o=a("toolbox.location.updated",{day:Ya(t.committedAt)}),s=t.number===null?"":a("toolbox.history.versionNumber",{number:t.number});this.versionWhen.textContent=o,this.versionNumber.textContent=s,this.versionNumber.hidden=s.length===0,this.version.querySelector(".version-sep")?.toggleAttribute("hidden",s.length===0),this.version.setAttribute("aria-label",a("toolbox.location.versionAction",{version:[o,s].filter(d=>d.length>0).join(" ")})),this.version.hidden=!1}showFavorite(t,n){if(this.onToggleFavorite=t===null?null:n,t===null){this.favorite.hidden=!0;return}let o=a(t?"toolbox.location.favoriteRemove":"toolbox.location.favoriteAdd");this.favorite.setAttribute("aria-pressed",t?"true":"false"),this.favorite.setAttribute("aria-label",o),this.favorite.title=o,this.favorite.hidden=!1}versionShowing(){return!this.version.hidden}showSelf(t,n){let o=t!==null&&t.kind==="member";this.selfName=o?t.name:null;let s=o?a("toolbox.self.labelNamed",{name:t.name}):a("toolbox.self.label");if(this.self.title=s,this.self.setAttribute("aria-label",s),this.self.replaceChildren(),o){let d=i("span","avatar",t.name.slice(0,1));d.setAttribute("aria-hidden","true"),this.self.append(d)}else this.self.append(oe(Aa,24,jo));this.selfRows=o?[...zc.map(d=>({kind:"link",label:Yn(d.place,a,Kc()),icon:d.icon,href:d.place.href})),{kind:"link",label:a("workspace.settings"),icon:Ia,href:"/settings"},{kind:"action",label:a("workspace.logout"),icon:Ma,run:n}]:[{kind:"link",label:a("toolbox.self.openProduct"),icon:qr,href:kn.href}],this.self.hidden=!1,this.sheet.hidden||this.paintSelfMenu()}toggleSelfMenu(){this.sheet.hidden?this.openSelfMenu():this.closeSelfMenu(!0)}openSelfMenu(){this.paintSelfMenu(),this.sheet.hidden=!1,this.self.setAttribute("aria-expanded","true"),this.host.setAttribute("data-menu-open",""),this.menuItems()[0]?.focus()}closeSelfMenu(t){this.sheet.hidden||(this.sheet.hidden=!0,this.menu.replaceChildren(),this.self.setAttribute("aria-expanded","false"),this.host.removeAttribute("data-menu-open"),t&&this.self.focus({preventScroll:!0}))}paintSelfMenu(){this.sheet.replaceChildren(),this.selfName!==null&&this.sheet.append(i("p","menu-name",this.selfName)),this.menu.replaceChildren();for(let t of this.selfRows){let n=t.kind==="link"?i("a","menu-item"):i("button","menu-item");n.setAttribute("role","menuitem"),n.tabIndex=-1,n.append(oe(t.icon,16,jo),i("span","menu-item-label",t.label)),n instanceof HTMLAnchorElement&&(n.href=t.kind==="link"?t.href:""),n instanceof HTMLButtonElement&&(n.type="button"),n.addEventListener("click",()=>{this.closeSelfMenu(!1),t.kind==="action"&&t.run()}),t.kind==="link"&&t.href==="/settings"&&n.classList.add("is-apart"),this.menu.append(n)}this.sheet.append(this.menu)}menuItems(){return[...this.menu.querySelectorAll("[role='menuitem']")]}onMenuKey(t){let n=this.menuItems(),o=this.host.shadowRoot?.activeElement??null,s=n.findIndex(f=>f===o),d=f=>{t.preventDefault(),n[(f+n.length)%n.length]?.focus()};t.key==="ArrowDown"?d(s+1):t.key==="ArrowUp"?d(s-1):t.key==="Home"?d(0):t.key==="End"?d(n.length-1):t.key==="Escape"?(t.preventDefault(),this.closeSelfMenu(!0)):t.key==="Tab"&&this.closeSelfMenu(!0)}paintTitle(){let t=document.title.trim();this.title.textContent=t,this.title.title=t,this.title.hidden=this.divider.hidden=t.length===0}paintGround(){Is(this.host)}paintScrolled(){this.host.toggleAttribute("data-scrolled",window.scrollY>0)}arrange(){let t=Ae.above("location");this.host.style.setProperty("--location-top",`${t}px`);let n=this.lead.getBoundingClientRect().width>0;this.host.toggleAttribute("data-titlebar",n&&t===0),this.host.toggleAttribute("data-under-ribbon",n&&t>0)}destroy(){for(let t of this.stops)t();this.host.remove(),Ae.set("location",0)}};function Kl(){let e=i("div");e.style.cssText=`position:fixed;visibility:hidden;pointer-events:none;width:${ko};height:0`,document.documentElement.append(e);let t=e.getBoundingClientRect().width>0;return e.remove(),t}function Wl(){return window.top!==window.self||document.querySelector(Xo)!==null?null:new fi}function Kc(){let e=Mr().name;return e===null?void 0:Vl(e)}var Ul="data-surprise-deck";function hi(){return document.body!==null&&document.body.hasAttribute(Kt)}function Wc(){let e=`body[${Kt}]`,t=`html[${Nr}="${Dr}"]`;return`@media screen {
    html:has(> ${e}), ${e},
    ${t} ${e} [${yo}][${xo}] {
      background: var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas)) !important;
    }
    ${e} [data-deck-stage] { background: var(--deck-bg, Canvas); }
  }`}function Uc(){let e=`html[${Nr}="${Dr}"]`;return[`${e} ${bt}, ${e} ${Ut}, ${e} ${Xo} { display: none !important; }`,`${e} mark[${Eo}] { background: transparent !important; box-shadow: none !important; }`].join(`
`)}function Gc(){let e=`body[${Kt}] [${Wt}]:not(.deck-step-controls):not(.deck-step-entry)`,t="var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas))";return`@media screen {
    ${e} {
      position: sticky !important;
      /* 上端の帯（現在地の行など）の下に貼り付く */
      top: var(${As}, 0px) !important;
      align-self: stretch !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      background: ${t} !important;
      padding: 8px 0 0 !important;
      flex-wrap: wrap !important;
    }
    ${e}::after {
      content: "" !important;
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: 100% !important;
      height: 24px !important;
      pointer-events: none !important;
      background-image: linear-gradient(to bottom, ${t}, transparent) !important;
    }
    ${e} button {
      white-space: nowrap !important;
      flex: none !important;
    }
  }
  @media screen and (max-width: 600px) {
    ${e} button { min-height: 44px !important; }
  }`}function Yc(){return`@media screen { ${`body[${Kt}]:has(> ${bt}) [${Wt}]:not(.deck-step-controls):not(.deck-step-entry)`} { display: none !important; } }`}function Gl(){if(!hi()||(Os(document),document.head.querySelector(`style[${Ul}]`)!==null))return;let e=document.createElement("style");e.setAttribute(Ul,""),e.textContent=`${Wc()}
${Uc()}
${Gc()}
${Yc()}`,document.head.appendChild(e)}var Jc=/^\/internal\/decks\/[a-f0-9]{32}\?edit=1$/,Jn=null;async function Yl(e,t,n){Jn?.versionId!==t&&(Jn={requestId:crypto.randomUUID(),versionId:t});let o=0,s=null;try{let C=await fetch("/api/pages/deck-edit/duplicate",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({requestId:Jn.requestId,page:e,versionId:t})});o=C.status,s=await C.json().catch(()=>null)}catch{n(a("toolbox.bar.duplicateFailed"));return}let d=typeof s=="object"&&s!==null&&"url"in s?s.url:null;if(o>=200&&o<300&&typeof d=="string"&&Jc.test(d)){Jn=null,location.assign(d);return}Jn=null;let f=typeof s=="object"&&s!==null&&"error"in s&&typeof s.error=="string"?s.error:a("toolbox.bar.duplicateFailed");n(f)}var Jl=`
${Ds}
${_s}
.deck-design-workspace { display: flex; flex: 1; min-height: 0; min-width: 0; }
.deck-design-workspace > .edit-frame { min-width: 0; }
.deck-design-list, .deck-design-inspector, .deck-design-mobile { display: none; }
.is-designing > .deck-design-list { display: flex; flex-direction: column; width: var(--size-bubble-max); flex: none; padding: var(--space-4); gap: var(--space-3); overflow-y: auto; }
.is-designing > .deck-design-inspector { display: flex; flex-direction: column; width: var(--size-popover); flex: none; padding: var(--space-5); gap: var(--space-4); overflow-y: auto; border-left: var(--rule-thin) solid var(--border); }
.deck-design-heading { margin: 0; font-size: var(--font-md); font-weight: var(--weight-bold); }
.deck-design-help { margin: 0; font-size: var(--font-sm); color: var(--muted); }
.deck-design-field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--font-base); }
.deck-design-field input[type=range] { min-width: 0; width: 50%; accent-color: var(--text); }
.deck-design-field input[type=checkbox] { width: var(--size-check); height: var(--size-check); accent-color: var(--text); }
.deck-design-input { font: inherit; min-width: 0; max-width: 65%; color: var(--text); background: var(--surface); padding: var(--space-2); border: var(--rule-thin) solid var(--border); border-radius: var(--radius-sm); }
.deck-design-presets { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
.deck-design-preset { padding: var(--space-1); border: var(--rule-thin) solid transparent; text-align: left; border-radius: var(--radius-sm); font-size: var(--font-sm); }
.deck-design-preset[aria-pressed=true] { border-color: var(--text); }
.deck-design-preset-swatch { display: block; aspect-ratio: 16/9; margin-bottom: var(--space-1); border-radius: var(--radius-sm); }
.deck-design-preset-swatch, .deck-design-slide-paper { position: relative; isolation: isolate; overflow: hidden; }
.deck-design-preset-swatch::before, .deck-design-slide-paper::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background-image: var(--dd-preview-image); background-size: var(--dd-preview-size); background-repeat: var(--dd-preview-repeat); background-position: 50% 50%; opacity: var(--dd-preview-opacity); }
.deck-design-slide { width: 100%; text-align: left; padding: var(--space-1); border: var(--rule-thin) solid transparent; }
.deck-design-slide[aria-current=true] { border-color: var(--text); }
.deck-design-slide-paper { display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 16/9; padding: var(--space-3); font-size: var(--font-sm); font-weight: var(--weight-medium); overflow: hidden; }
.deck-design-slide-number { font-size: var(--font-xs); font-weight: var(--weight-normal); }
.deck-design-colors { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
.deck-design-colors .deck-design-field { flex-direction: column; align-items: start; }
.deck-design-colors input { height: var(--size-control); width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.deck-design-advanced-title { cursor: pointer; font-size: var(--font-sm); color: var(--muted); }
.deck-design-advanced-controls { display: flex; flex-direction: column; gap: var(--space-4); padding-top: var(--space-4); }
.deck-design-files { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-4); }
.deck-design-panel-tabs { display: flex; gap: var(--space-1); border-bottom: var(--rule-thin) solid var(--border); }
.deck-design-panel-tab { padding: var(--space-2); color: var(--muted); border-bottom: var(--rule-thick) solid transparent; }
.deck-design-panel-tab[aria-pressed=true] { color: var(--text); border-bottom-color: var(--accent); }
.deck-design-workspace button:focus-visible, .deck-design-workspace input:focus-visible, .deck-design-workspace select:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: var(--space-1); }
@media (max-width: 1000px) {
  .is-designing > .deck-design-list { width: var(--size-input-min); padding: var(--space-2); }
  .deck-design-slide-paper { padding: var(--space-1); }
  .deck-design-slide-paper > span:not(.deck-design-slide-number) { display: none; }
  .edit-bar { flex-wrap: wrap; }
  .edit-title { max-width: 45%; }
  .edit-message { display: none; }
}
@media (max-width: 700px) {
  .is-designing > .deck-design-list { display: none; }
  .is-designing > .deck-design-inspector { display: none; }
  .is-designing > .deck-design-mobile { display: block; position: absolute; right: var(--space-3); bottom: var(--space-3); z-index: 2; background: var(--surface); }
  .is-designing.is-inspector-open > .deck-design-inspector { display: flex; position: absolute; inset: auto 0 0; width: 100%; max-height: 65%; padding-bottom: var(--size-input-min); background: var(--surface); border-top: var(--rule-thin) solid var(--border); z-index: 1; }
  .edit-count { display: none; }
}
`;var Qo=`${fn}
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button { background: transparent; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
/* この道具の中で文字を選んだときの色。ページ本文側の選択色には手を出さない */
::selection { background: var(--accent-soft); color: var(--text); }
.icon { display: inline-flex; align-items: center; flex: none; }
.icon svg { display: block; }
[hidden] { display: none !important; }

/* 優先度の目印。色を使うのはこの丸だけ（文字は常にニュートラル） */
.dot {
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  flex: none;
  background: var(--signal-want);
  /* 文字の高さの真ん中にそろえる。
     箱の中心どうしを合わせる（align-items: center）だけだと、
     字体によっては文字が丸より下に見える。文字の並びの中に置いて、
     ベースラインと x 高さから決まる「目で見た中心」に合わせる */
  display: inline-block;
  vertical-align: middle;
}
.dot.is-must { background: var(--signal-must); }
.dot.is-better { background: var(--signal-better); }

/* 色の丸と文字の組。1 つの文字の並びとして扱うので、丸が文字にそろう */
.dot-label { white-space: nowrap; }
.dot-label .dot { margin-right: var(--space-1); }

/* ---- 右下の道具箱 ----
   コメント・履歴・共有がばらばらに浮かぶと画面の隅が渋滞するので、1 本にまとめる */
.bar {
  position: absolute;
  /* 端末の丸みやホームバーに掛からないよう、安全な余白のぶん内側へ寄せる */
  right: calc(var(--tools-panel-offset, 0px) + var(--space-5) + env(safe-area-inset-right, 0px));
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: flex;
  align-items: center;
  height: var(--size-bar);
  padding: 0 var(--space-2);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.bar-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-control);
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.bar-button:hover { background: var(--surface-sunken); color: var(--text); }
.bar-button.is-open { color: var(--text); }
/* 名前は出さない（触れたときに出す）。コメントの件数だけ、絵柄の隣に添える。
   大きさは読まない字の段（件数・版の目印と同じ）。色はボタンの開閉に連れて
   動かさない——件数は知らせで、選んでいるかどうかの合図は絵柄が担う */
.bar-count {
  flex: none;
  font-size: var(--font-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.bar-divider {
  width: var(--rule-thin);
  height: var(--space-4);
  margin: 0 var(--space-1);
  background: var(--border);
}
/* 取り込み中・新しい版。件数と同じ読み飛ばしてよい段。押せないボタンにはしない */
.bar-status {
  display: inline-flex;
  align-items: center;
  height: var(--size-control);
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: var(--font-sm);
  text-decoration: none;
  white-space: nowrap;
}
a.bar-status:hover,
.bar-status.is-action:hover { color: var(--text); }

/* 原本の更新。上端の知らせには出さない（取り込みボタンは右下で視線が届かない）。
   形はトーストと同じ静かな紙。危険の線も塗りも付けない */
.origin-hint {
  position: absolute;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  max-width: min(var(--size-popover), calc(100% - var(--space-5) * 2));
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: var(--font-sm);
  color: var(--muted);
}
.origin-hint-open {
  flex: 1;
  min-width: 0;
  text-align: left;
  color: inherit;
  font: inherit;
}
.origin-hint-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ---- 画面下の入り口（狭い画面で文章を選んだとき） ----
   選んだ場所の真上は OS の「コピー / 調べる」が陣取るので、下端へ寄せる。
   端末の丸みやホームバーに掛からないよう、安全な余白のぶんだけ持ち上げる */
.selbar {
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow);
  opacity: 0;
  transition: opacity var(--duration) var(--ease);
}
.selbar.is-shown { opacity: 1; }
/* 選んだ文言そのものを 1 行で見せる。引用の見せ方は本文中のものと同じ語彙
   （左に 1 本）。縮むのはここだけで、右のボタン 2 つは幅を保つ */
.selbar-quote {
  flex: 1;
  min-width: 0;
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selbar-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  height: var(--size-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-bold);
  color: var(--text);
}
.selbar-action:hover { background: var(--surface-sunken); }

/* ---- 狭い画面で書くところ（板の中） ---- */
.sheet-compose {
  padding: var(--space-4);
  border-bottom: var(--rule-thin) solid var(--border-light);
}

/* ---- 書き込みドック ----
   新しいコメントを書く間も、ページは見えたままにする。
   上端の位置は JS が実測で置く（貼り付けただけではキーボードに追従しないため） */
.compose-dock {
  /* 画面の下端に貼り付けたまま、キーボードのぶんだけ持ち上げる。
     上端を実測で置く作りに戻さないこと（打っている最中に測ると位置が崩れる） */
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: auto;
  padding: var(--space-2) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  border-top: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow);
}
/* 中身は板のときの部品をそのまま使う。囲いはドック側が持つ */
.compose-dock .sheet-compose { padding: 0; border-bottom: 0; }

/* 引用の行。やめるボタンを右端に置く（見出しを畳んでも押せる） */
.quote-row { display: flex; align-items: flex-start; gap: var(--space-2); }
.quote-row .pop-quote { flex: 1; min-width: 0; }
.quote-row .icon-button { flex: none; }

/* ---- 詰めた姿（キーボードが出ている間）----
   URL の錠剤も入力補助の帯も OS のもので消せない。
   こちらで畳めるところを畳んで、ページに残る隙間を広げる */
.compose-dock.is-compact {
  padding: var(--space-1) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
}
/* 入力欄は 2 行ぶんまで低くする */
.compose-dock.is-compact .composer textarea { min-height: var(--size-input-compact); }
/* 縦の間合いを一段詰める */
.compose-dock.is-compact .composer { gap: var(--space-1); margin-top: var(--space-2); }
.compose-dock.is-compact .peek-grab { margin-bottom: var(--space-2); }
/* ドックの上で始めた指の動きは、全面でこちらが受け取る。
   後ろのページが道連れで動くと、書いている場所を見失う。
   部品ごとに掛けると隙間が素通しになるので、器の全面で受け取る。
   入力欄を縦に動かすぶんは JS が自分で流す（横となぞりはブラウザのまま） */
.compose-dock { touch-action: none; }
.compose-dock textarea { overscroll-behavior: contain; }
/* 払って閉じる・戻すときの滑り。覗き見カードと同じ減速にそろえる */
.compose-dock.is-dropping { transition: transform var(--duration-swipe) var(--ease-swipe); }

/* iOS では、キーボードの上に OS の帯（URL の錠剤・∧∨✓）が浮く。
   高さを測る手立てが無いので、こちらが下端に場所を空けて、
   送信のボタンがその帯に潜り込まないようにする。
   帯が出ない環境では空けない（無駄な隙間を作らないため） */
:host(.is-ios) .compose-dock.is-compact {
  padding-bottom: calc(
    var(--space-2) + var(--size-os-strip) + env(safe-area-inset-bottom, 0px)
  );
}

/* ---- 右のパネル ---- */
.panel {
  position: absolute;
  /* 上端の帯（現在地の行・比べている間の帯）の下から始める（帯の裏へ潜り込ませない） */
  top: calc(var(--top-lane) + var(--compare-bar));
  right: 0;
  bottom: 0;
  /* 幅は開いている人が変えられる。決めているのは JS 側（DEFAULT_WIDTH と保存値） */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: var(--rule-thin) solid var(--border);
  box-shadow: var(--shadow);
  /* 影は本文の側（左）にだけ落とす。上へ漏れると、上端の帯の下に薄い筋が出る */
  clip-path: inset(0 0 0 calc(-1 * var(--space-7)));
}

/* 狭い画面では本文を押しのけず、上に重ねて全幅で出す。
   横に並べると本文が 100px ほどになって読めなくなるため。
   狭い画面向けの指定は、すべてこの :host(.is-narrow) からぶら下げる */
/* 一覧は全画面にしない。上に必ずページが帯として見える高さで止める。
   読んでいた場所が消えると、何について話しているのか分からなくなるため */
:host(.is-narrow) .panel {
  left: 0;
  /* 再生バーは板の下に残す（聞きながら欄を読む） */
  bottom: 0;
  width: 100%;
  border-left: 0;
  border-top: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  transition: top var(--duration) var(--ease);
  /* 下から重ねる板は、上に影を落とす */
  clip-path: none;
}
:host(.is-narrow) .panel.is-half { top: 50%; }
/* 上げきったときも、ページの帯が必ず見えるところで止める。
   上端に知らせが出ている間は、その高さぶん下げて帯を譲らない。
   下げすぎて半分より低くなることはない */
:host(.is-narrow) .panel.is-expanded {
  top: min(50%, calc(var(--safe-top) + var(--space-7) + var(--toast-lane) + var(--compare-bar) + var(--top-lane)));
}
/* 指で引いている最中は、指に付いてくるほうが自然なので追従を切る */
:host(.is-narrow) .panel.is-dragging { transition: none; }
/* 覗き見カードから受け取るとき。カードが上へ抜けるのと同じ時間・同じ減速で、
   一覧が下から立ち上がる。順番に起きると「消えてから出る」間ができてしまう */
@keyframes sheet-rise {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
:host(.is-narrow) .panel.is-rising {
  animation: sheet-rise var(--duration-swipe) var(--ease-swipe);
}
:host(.is-narrow) .grip { display: none; }

/* 動きを減らす設定では、道具箱の中の動きも全部止める（DESIGN.md 12 章。長さを 0 にするだけで、終わりの姿は同じ） */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
}

/* 一覧のつまみ。覗き見カードのものと同じ見た目 */
.sheet-grab-area { display: none; padding: var(--space-2) 0 0; cursor: grab; touch-action: none; }
:host(.is-narrow) .sheet-grab-area { display: block; padding: var(--space-3) 0 0; }

/* 指で押す的を広げる。マウスのときの詰まり具合は変えない */
:host(.is-narrow) .action { padding: var(--space-2) var(--space-2); }
:host(.is-narrow) .card-actions,
:host(.is-narrow) .peek-actions { gap: var(--space-2); }
:host(.is-narrow) .card-actions .icon-button,
:host(.is-narrow) .peek-actions .icon-button {
  width: var(--size-touch);
  height: var(--size-touch);
}
:host(.is-narrow) .bar-button { height: var(--size-bar); }
/* 指で押す画面では ⋯ の小窓の行も 44px（バーのボタンと同じ刻み） */
:host(.is-narrow) .menu-row { height: var(--size-touch); }

/* 狭い画面では板が画面端まで張り付く。中の字と口を、覗き見カードと同じ距離まで空ける。
   覗き見は外余白 12 + 中余白 12 = 24。板も --space-5（24）にそろえる。
   左右は端末の安全域も足す（ノッチ・横持ち） */
:host(.is-narrow) .panel-head {
  padding-left: calc(var(--space-5) + env(safe-area-inset-left, 0px));
  padding-right: calc(var(--space-5) + env(safe-area-inset-right, 0px));
}
:host(.is-narrow) .access {
  padding: var(--space-4) calc(var(--space-5) + env(safe-area-inset-right, 0px))
    calc(var(--space-5) + env(safe-area-inset-bottom, 0px))
    calc(var(--space-5) + env(safe-area-inset-left, 0px));
}
:host(.is-narrow) .access-warning { margin-bottom: var(--space-4); }
:host(.is-narrow) .access-row { gap: var(--space-3); padding: var(--space-2) 0; }

/* 幅を変えるつまみ。掴めることが分かればよいので、触れたときだけ見せる */
.grip {
  position: absolute;
  left: calc(var(--size-grip) / -2);
  top: 0;
  bottom: 0;
  width: var(--size-grip);
  cursor: col-resize;
  touch-action: none;
}
.grip:hover { background: var(--accent-soft); }

.panel-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-4) var(--space-2);
}
.panel-title {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
}
.spacer { flex: 1; }
.head-tools { display: inline-flex; align-items: center; }

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control);
  height: var(--size-control);
  border-radius: var(--radius-sm);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.icon-button:hover { background: var(--surface-sunken); color: var(--text); }
.icon-button.is-active { color: var(--text); }
.icon-button.is-danger:hover { color: var(--danger); }
/* 選んだ文への脇の操作（コピー・ここから読み上げ）。主役のコメントより 1 段引く */
.icon-button.selection-aside { color: color-mix(in srgb, var(--muted) 50%, transparent); }
.icon-button.selection-aside:hover,
.icon-button.selection-aside:focus-visible { color: var(--muted); }

/* 絞り込みと並べ替え。既定では畳んでおき、口を開いたときだけ出す。
   常時のタブにしないのは、いつも使うわけではない操作を一覧の上に置かないため。
   囲みも下線も足さない。段は見出しの太さと余白だけで作る */
.list-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  align-items: start;
  padding: 0 var(--space-4) var(--space-3);
}
.list-menu-label {
  margin: 0 0 var(--space-1);
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
  color: var(--muted);
}
.list-summary {
  display: block;
  width: 100%;
  padding: 0 var(--space-4) var(--space-3);
  text-align: left;
  font-size: var(--font-sm);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.list-summary:hover { color: var(--text); }
/* 一覧の末尾に置く、いま外している側への 1 行（解決済 N 件を見る）。
   頭の要約とまったく同じ静かな見え方にする——どちらも「いまの見え方」を語る
   1 行で、役割が同じものに 2 通りの姿を作らない。
   違うのは上の余白だけ。直前にカードが並んでいるので、行と行の間隔
   （カードの区切り線）より広く離して、一覧の外側だと分かるようにする。
   区切り線は引かない（線は最後の手段。余白で足りている） */
.list-summary.is-tail { padding-top: var(--space-4); padding-bottom: var(--space-5); }
.pick-count {
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--muted);
  font-weight: var(--weight-normal);
}

.list { flex: 1; overflow-y: auto; }

.empty { padding: var(--space-7) var(--space-4); text-align: center; color: var(--muted); }
.empty-title {
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
  color: var(--text);
  margin-bottom: var(--space-1);
}
.empty-hint { font-size: var(--font-sm); }

/* ---- 1 件分 ---- */
.card {
  padding: var(--space-4);
  cursor: pointer;
  transition: background var(--duration) var(--ease);
}
.card + .card { border-top: var(--rule-thin) solid var(--border-light); }
.card:hover { background: var(--surface-sunken); }
.card.is-active { background: var(--surface-sunken); box-shadow: inset var(--rule-thick) 0 0 var(--accent); }
.card.is-flash { background: var(--accent-soft); }
.card.is-resolved .quote,
.card.is-resolved .body,
.card.is-resolved .outcome-label,
.card.is-resolved .story-link,
.card.is-resolved .note { opacity: .6; }

/* 片付いたものは 1 行に畳む。押すと開く */
.card.is-collapsed { padding: var(--space-2) var(--space-4); }
.collapsed-row { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.collapsed-text {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: line-through;
}
.collapsed-who { flex: none; font-size: var(--font-sm); color: var(--muted); }

/* ---- まとめて選ぶ ----
   四角の印そのものは送信欄のスイッチと同じ部品（.check-input + .check-mark）。
   ここが持つのは置き場所だけで、押す的はカード全体なので的の広げ直しもしない。 */
.pick-box { flex: none; display: inline-flex; align-items: center; }
/* 選んでいるカード。**面の濃さだけで示す**（枠も左の線も色も足さない）。
   いま見ている 1 件の強調（.is-active）と同じ面を使い回すが、選んでいる間は
   あちらを出さないので、画面に「濃い面」の意味は 1 つしかない。 */
.card.is-picked { background: var(--surface-sunken); }
/* 選んでいる間の畳んだ行。中身を読むために開く操作は止まっているので、
   1 行のままでも文字を消し込まない（何を選んだのかは読めなければ選べない） */
.card.is-pick.is-collapsed .collapsed-text { text-decoration: none; }

/* 板の足。動かす向きと件数、やめる道、全部の入り切りだけを置く。
   画面の下端ではなく板の中にあるので、狭い画面で板が下から出てくる動きに付いてくる。
   上端の 1 本は、下端に貼り付いた操作と流れている一覧の境目
   （余白だけでは、指で送っている最中にどこまでが一覧か分からない） */
.pick-bar {
  display: flex;
  align-items: center;
  /* 板は 300px まで細くできる。件数が 3 桁になると 1 行に収まらないので、
     字を縮めたり切ったりせず、入らなかったものを次の段へ落とす
     （どれも押す口なので、読めなくなるほうが困る） */
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: var(--rule-thin) solid var(--border-light);
  background: var(--surface);
}
/* 「すべて選ぶ / すべて外す」。主役ではないので静かな 1 行の語彙を借りる。
   幅いっぱいの指定だけ外して、右のボタンを端へ押し出す役をさせる */
.list-summary.is-pick-all {
  flex: 1;
  width: auto;
  padding: 0;
}

.card-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.avatar {
  width: var(--size-avatar);
  height: var(--size-avatar);
  border-radius: var(--radius-pill);
  flex: none;
  object-fit: cover;
}
/* 写真の無い人の顔。名前の頭 1 文字をその場で描く */
.avatar-face { fill: var(--avatar-0); }
.avatar-face.is-tint-1 { fill: var(--avatar-1); }
.avatar-face.is-tint-2 { fill: var(--avatar-2); }
.avatar-face.is-tint-3 { fill: var(--avatar-3); }
.avatar-initial {
  fill: var(--muted);
  font-size: var(--font-xs);
  font-weight: var(--weight-bold);
  font-family: inherit;
}
.who-name { font-size: var(--font-base); font-weight: var(--weight-bold); line-height: var(--leading-tight); }
.who-time { font-size: var(--font-sm); color: var(--muted); line-height: var(--leading-tight); }

/* 優先度・状態の表示。丸 1 つ + 文字だけ。塗りも囲みも付けない */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  font-size: var(--font-sm);
  color: var(--muted);
}

/* 引用。本文からの引き写しであることを示すため、左に 1 本だけ引く */
.quote {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  color: var(--muted);
  font-size: var(--font-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.body.is-quiet { color: var(--muted); }
/* 読み飛ばしてよい 1 行（節の説明・空のときの案内・終わったことの報告・行の 2 行目）。
   本文（--font-base）より 1 段下げるだけに留める。2 段下げると、読ませたい案内文が
   時刻や件数と同じ「極小の添え物」に見えて、読まれないまま素通りされる */
.note { margin: var(--space-1) 0 0; font-size: var(--font-sm); color: var(--muted); }

/* 当時 → コメント → いま。札は読み飛ばしてよい大きさ。
   引用の左線は既存の .quote を使う（同じ「本文からの引き写し」に別の形を当てない）。
   中身は読ませる文なので、札と同じ灰色には落とさない */
.outcome-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-2);
  margin: var(--space-3) 0 var(--space-1);
  font-size: var(--font-sm);
  color: var(--muted);
}
.outcome-beat {
  flex: none;
  font-weight: var(--weight-medium);
}
.outcome-meta {
  flex: 1;
  min-width: 0;
  text-align: right;
}
.card-head + .outcome-label,
.peek-body > .outcome-label:first-child { margin-top: 0; }
.body + .outcome-label,
.peek-text + .outcome-label { margin-top: var(--space-3); }
.quote.is-story,
.pop-quote.is-story,
.related-quote.is-story {
  color: var(--text);
  font-size: var(--font-base);
  margin-bottom: 0;
}
.note.is-story {
  margin-top: 0;
  font-size: var(--font-base);
  color: var(--text);
}

.story-link {
  display: inline-block;
  margin: var(--space-2) 0 0;
  padding: 0;
  color: var(--muted);
  font-size: var(--font-sm);
  text-align: left;
  text-decoration: none;
  transition: color var(--duration) var(--ease);
}
.story-link:hover { color: var(--text); }
.story-link[disabled] { opacity: .45; cursor: default; }
.story-link[disabled]:hover { color: var(--muted); }

/* 直した直後の 1 行。囲みも帯も足さない。余白と字だけで、一覧の上に載せる */
.story-banner { padding: var(--space-3) var(--space-4) var(--space-4); }
.story-banner-text { margin: 0; font-size: var(--font-base); }
.story-banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.story-banner .story-link { margin-top: 0; }

.card-actions,
.peek-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-1);
}
.card-actions { margin-top: var(--space-2); }
.peek-actions { margin-top: var(--space-2); }
.card-actions .hint,
.peek-actions .hint { margin-right: auto; }
.action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--font-sm);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.action:hover { background: var(--surface-sunken); color: var(--text); }
.action.is-danger:hover { color: var(--danger); }
.action.is-strong { color: var(--text); }
/* 押せないものを押せる見た目のままにしない（選び分けと同じ決まり）。
   触っても色が動かないので、押して初めて効かないと気づくことがなくなる */
.action[disabled] { opacity: .45; cursor: default; }
.action[disabled]:hover { background: none; color: var(--muted); }

/* 返信。1 段だけ字下げして、親との関係を余白で示す */
.replies {
  margin: var(--space-3) 0 0;
  padding-left: var(--space-3);
  border-left: var(--rule-thin) solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ---- 書くところ ---- */
.composer { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3); }
.composer textarea {
  width: 100%;
  min-height: var(--size-input-min);
  resize: vertical;
  padding: var(--space-2);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  outline: none;
}
.composer textarea:focus { border-color: var(--accent); }

.picker { display: flex; gap: var(--space-1); }
/* 値を選び分ける口（見せ方の 3 択・強さの 3 択）。
   本文と同じ大きさにする。板の主役の操作なのに、下に並ぶ行の名前より小さいと、
   目がまず行の並びへ行ってしまう（強さは 大きさ → 太さ → 濃さ の順に効く） */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--font-base);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
/* 指で押したあと hover が残る端末があるので、hover が効く環境にだけ出す。
   選ばれている印と同じ見え方になると、2 つ選ばれているように見えてしまう */
@media (hover: hover) {
  .pill:hover { background: var(--surface-sunken); color: var(--text); }
}
.pill.is-active { background: var(--surface-sunken); color: var(--text); font-weight: var(--weight-bold); }
/* 押せないものを、押せる見た目のままにしない。
   触っても色が動かないので、指で押して初めて「効かない」と気づくことがなくなる。
   ただし**いま選ばれているもの**は薄くしない——あれは操作の口ではなく現在地の印で、
   薄くすると「どこに居るか」が読めなくなる（押せないのは、押す必要が無いから） */
.pill[disabled] { opacity: .45; cursor: default; }
.pill[disabled]:hover { background: none; color: var(--muted); }
.pill.is-active[disabled] { opacity: 1; }
.pill.is-active[disabled]:hover { background: var(--surface-sunken); color: var(--text); }

/* ---- 強さごとの送信ボタン ----
   3 つとも同じ部品。押した強さでそのまま送るので、「選ばれている」状態は持たない。
   いいねは右端の手の絵。折り返すとジャンルの違いが縦の段に化けて、別の話に見える */
.send-row { display: flex; gap: var(--space-2); flex-wrap: nowrap; align-items: center; }
.send-fixes { display: flex; gap: var(--space-2); align-items: center; }
.send-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-bold);
  color: var(--text);
  position: relative;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease);
}
@media (hover: hover) {
  .send-pill:hover:not([disabled]) { background: var(--surface-sunken); border-color: var(--accent); }
}
.send-pill[disabled] { opacity: .45; cursor: default; }
.send-row > .icon-button { margin-left: auto; position: relative; flex: none; }

/* 送信の行は下に貼り付ける。長く書いてもキーボードの上に押し出されない */
.composer-foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  position: sticky;
  bottom: 0;
  background: var(--surface);
  padding-top: var(--space-2);
}
.hint { flex: 1; font-size: var(--font-sm); color: var(--muted); }
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  color: var(--muted);
  /* 押せる 1 行は、その場で何かする場合も別の画面へ行く場合も同じ語彙にする。
     行き先のときだけ下線が付かないよう、ここで落としておく
     （押せることは濃さと hover の変化で示す。下線は赤入れの記号に予約されている） */
  text-decoration: none;
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.button:hover { background: var(--surface-sunken); color: var(--text); }
.button.is-primary {
  background: var(--accent);
  color: #ffffff;
  font-weight: var(--weight-bold);
}
.button.is-primary:hover { background: var(--accent); opacity: .88; color: #ffffff; }
.button[disabled], .pick-row[disabled] { opacity: .5; cursor: default; }

/* ---- チェックの付く 1 行 ----
   この製品で最初のチェックボックス。役割は「送る前に決める入り切り」で、
   ほかで同じものが要るときは、新しく作らずにここを使う（部品は役割ごとに 1 つ）。

   差を作るのは四角の塗りと、文字の濃さ・太さだけ。色も囲みも足さない。
   文言は入り切りで変わらない——状態は四角が持つので、名前は動かなくてよい。 */
.check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* 見た目は文字 1 行でも、指の的はここまで広げる（余白で広げ、面は敷かない） */
  min-height: var(--size-touch);
  /* 左端は送信ボタンの丸い枠とそろえる（あちらは 0 から始まる）。
     ここに余白を入れると、四角だけが右へずれて縦の線が 2 本に見える */
  padding: 0;
  cursor: pointer;
  user-select: none;
}
/* 本物のチェックボックス。見えないが、そこに在る——空白キーも読み上げもこれが受ける
   （display: none にすると的から外れて、どちらも効かなくなる） */
.check-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.check-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  /* 入っていないときはチェックを消す。場所は空けたままにして、
     入れた瞬間に四角が動かないようにする */
  color: transparent;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease),
    color var(--duration) var(--ease);
}
.check-input:checked + .check-mark {
  /* 塗るのは灰（--muted）。新しい色は持ち込まず、黒地では自動で反転する。
     文字色（ほぼ黒）で塗ると、小窓の中でいちばん濃い塊になってしまい、
     主役であるはずの送信ボタンより先に目が行く */
  background: var(--muted);
  border-color: var(--muted);
  color: var(--surface);
}
/* 1 つだけ選ぶときの印（丸）。複数入り切りの四角とは形で分ける——
   丸は「どれか 1 つ」、四角は「いくつでも」という、画面の外から持ってきた約束。
   中の点は選ばれたときだけ出す（場所は空けたままなので、印が動かない） */
.radio-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: 50%;
  transition: border-color var(--duration) var(--ease);
}
.radio-mark::after {
  content: "";
  width: var(--size-radio-dot);
  height: var(--size-radio-dot);
  border-radius: 50%;
  background: transparent;
  transition: background var(--duration) var(--ease);
}
.check-input:checked + .radio-mark { border-color: var(--muted); }
.check-input:checked + .radio-mark::after { background: var(--muted); }
@media (hover: hover) {
  .check-row:hover .radio-mark { border-color: var(--accent); }
}
.check-input:focus-visible + .radio-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}

/* 選んだものに属する設定。**親子は字下げだけで示す**——縦線も囲みも帯も引かない。
   左端をずらす幅は、印と名札の間隔とそろえる（印の右側から始まって見える） */
.scope-child {
  padding-left: calc(var(--size-check) + var(--space-2));
  margin: var(--space-2) 0 var(--space-5);
}
/* 説明の 1 行と、その下の最初の節を離す。
   説明は選択肢に付く文で、節はそこから始まる別のかたまり——詰まっていると、
   説明の続きに見出しが生えているように読める */
.scope-child > .note + .access-part { margin-top: var(--space-5); }

.check-label {
  font-size: var(--font-base);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
/* 入り切りの差は濃さだけ。太さは変えない——四角がもう state を言っているので、
   文字まで太らせると同じことを二重に言うことになる */
.check-input:checked ~ .check-label { color: var(--text); }
@media (hover: hover) {
  .check-row:hover .check-mark { border-color: var(--accent); }
  .check-row:hover .check-label { color: var(--text); }
}
/* キーボードで辿ってきた人にも居場所を示す（見えない箱の代わりに四角が光る） */
.check-input:focus-visible + .check-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}

/* ---- 近道の案内（触れている間だけ出る吹き出し）---- */
.hint-bubble {
  position: absolute;
  right: 0;
  /* 絵記号の上に出す。下だと、小窓の外へはみ出して切れる */
  bottom: calc(100% + var(--space-1));
  width: max-content;
  max-width: var(--size-bubble-max);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--text);
  color: var(--surface);
  font-size: var(--font-xs);
  line-height: var(--leading-tight);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration) var(--ease);
}
.send-fixes .hint-bubble { left: 0; right: auto; }
@media (hover: hover) {
  .send-pill:hover:not([disabled]) .hint-bubble,
  .send-row > .icon-button:hover .hint-bubble { opacity: 1; }
}

/* ---- 文章を選んだときに出る小窓 ---- */
.popover {
  position: absolute;
  pointer-events: auto;
  width: var(--size-popover);
  max-width: calc(100vw - var(--space-5));
  padding: var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.popover.is-compact { width: auto; padding: var(--space-1); display: flex; gap: var(--space-1); }
/* 道具箱の「その他」（バーの右端の ⋯）。幅は「詰めた姿」のものをそのまま借り、並べ方だけ縦に組み替える。
   狭い小窓を新しく作らない（同じ役割の指定を 2 つに割らない）。
   段（このページの道具 / 読み方）の間は行と行の間より 1 段広く空けるだけで、見出しも線も置かない
   （行が 3〜5 本しか無いのに見出しを立てると、見出しのほうが行より強く見える） */
.popover.is-menu { flex-direction: column; align-items: stretch; gap: var(--space-2); }
.menu-group { display: flex; flex-direction: column; }
/* 行は押せる 1 行の語彙（.button）のまま、絵柄と名前を横に並べて左にそろえる。
   高さは道具箱のほかの部品と同じ 32px（字の行送りに任せると 36.8px になり、4px の刻みから外れる） */
.menu-row {
  display: flex;
  width: 100%;
  height: var(--size-control);
  padding-top: 0;
  padding-bottom: 0;
  gap: var(--space-2);
  text-align: left;
}
.menu-row-label { white-space: nowrap; }
.pop-quote {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: background var(--duration) var(--ease);
}
/* 付け先が別の文に移ったとき。動いたことが分かればよいので、ひと呼吸だけ */
.pop-quote.is-swapped { background: var(--accent-soft); }
/* 物語の引用は切らない。当時といまを 2 行に畳むと、直しの中身が読めなくなる */
.pop-quote.is-story {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
  white-space: pre-wrap;
}

/* ---- 覗き見カード（狭い画面で印を押したとき）----
   板を丸ごと開かずに、その 1 件だけを下からそっと見せる。
   外側は「置き場所を決めるだけ」の透明な層。面も影も角丸も持たない。
   1 枚 1 枚が自分の面・角丸・影・余白・つまみを持ち、枠ごと横に滑る。
   外側を画面いっぱいに取ってあるので、隣のカードは静止時には画面の外にいる。

   透明な層は指も受け取らない（pointer-events: none）。
   受け取ると、カードの周りの「何も見えていないところ」が押せる帯になり、
   外を押しても閉じない・後ろのページのリンクも押せない、という状態になる */
.popover.is-peek {
  pointer-events: none;
  left: 0;
  right: 0;
  top: auto;
  width: auto;
  max-width: none;
  bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  overflow: hidden;
}
/* 指を離したあとだけ動きを付ける。掴んでいる間は 1 対 1 で付いてくる */
.popover.is-peek.is-dropping { transition: transform var(--duration-swipe) var(--ease-swipe); }
/* 一覧へ渡すとき。カードが上へ抜けるのと入れ替わりに一覧が立ち上がるので、
   すれ違うあいだだけ薄くする（2 枚が重なって見えないように） */
.popover.is-peek.is-handoff {
  opacity: 0;
  transition:
    transform var(--duration-swipe) var(--ease-swipe),
    opacity var(--duration-swipe) var(--ease-swipe);
}

/* 下へ払うと閉じられることを示すつまみ。カードの中に入っている */
.peek-grab {
  width: var(--space-6);
  height: var(--space-1);
  margin: 0 auto var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--border);
}

/* 前・いま・次 を横に並べる。1 枠が画面の幅ぶん。
   下端でそろえる。上端でそろえると、隣に背の高いカードが来たときに
   いま見ているカードが浮き上がり、送るたびに下端の位置が変わってしまう */
.peek-track {
  display: flex;
  align-items: flex-end;
  width: 300%;
}
.peek-track.is-sliding { transition: transform var(--duration-swipe) var(--ease-swipe); }
.peek-slot { width: calc(100% / 3); flex: none; }

/* ここが 1 枚のカード。旧来の小窓の見た目をそのまま持つ。
   左右の余白がそのままカードどうしの間隔になる */
.peek-slide {
  /* 指を受け取るのはカードだけ（外側の透明な層は通り抜け） */
  pointer-events: auto;
  /* 指の動きはカード全面でこちらが受け取る。部品ごとに掛けると、
     部品の隙間と器の余白が素通しになり、そこから後ろのページが動く。
     中の本文を縦に動かすぶんは JS が自分で流すので、これで困らない */
  touch-action: none;
  margin: 0 var(--space-3);
  padding: var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

/* 長い本文は、中で縦にスクロールできるようにする。
   ただし指で動かすぶんは JS が自分で流す（下の attachInnerScroll）。
   ブラウザに任せる書き方（部品ごとに touch-action を切り替える）だと、
   部品の隙間や器の余白が素通しになって後ろのページが動く。
   カード側は下で全面を受け取り、穴を作らない */
.peek-body {
  max-height: var(--size-scroll-max);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* 覗き見では行数を切らない。切ると中でスクロールする余地が無くなり、
   長いコメントの続きがどこからも読めなくなる（切るのは一覧のカードだけ） */
.peek-text {
  margin: 0;
  overflow-wrap: anywhere;
}
.peek-foot { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
/* 上へ払えば同じことができる。気づかない人のための控えめな道なので、
   囲みも面も持たせず、文字と余白だけで示す（押せる広さは確保する）。
   下線も引かない——この板では下線は赤入れ（足した文）の記号で、リンクの飾りではない */
.peek-more {
  flex: none;
  display: inline-flex;
  align-items: center;
  /* 見た目は文字だけのまま、押せる高さは指の的の大きさまで余白で広げる */
  min-height: var(--size-touch);
  padding: var(--space-2);
  font-size: var(--font-sm);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.peek-more:hover { color: var(--text); }
/* 自分が書いたものだけ出る行。一覧のカードと同じ .card-actions / .peek-actions を使う */

/* ---- 版の一覧 ----
   主役は「誰が・いつ・どれだけ直したか」。コミットの説明文は出さない
   （機械語の書き分けが並ぶと、読む人の用事がそこに埋もれる）。
   sha は消さないが、いちばん小さく薄く、右の端に置く */
.version {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  transition: background var(--duration) var(--ease);
}
.version + .version { border-top: var(--rule-thin) solid var(--border-light); }
.version:hover { background: var(--surface-sunken); }
/* 開いている版は「選んでいる」なので、指を乗せた地より 1 段濃い（文字起こしの鳴っている発言と同じ） */
.version.is-current { background: var(--surface-pressed); }
/* 最初の版は比べる相手がいない。押せないことを濃さで示す */
.version[disabled] { cursor: default; }
.version[disabled]:hover { background: none; }
.version-who {
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-when { font-size: var(--font-sm); color: var(--muted); text-align: right; }
.version-count { font-size: var(--font-sm); color: var(--muted); }
.version-sha {
  font-size: var(--font-xs);
  color: var(--muted);
  font-family: ui-monospace, monospace;
  text-align: right;
}
.version-number {
  font-size: var(--font-sm);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.version .note { grid-column: 1 / -1; }

/* ---- 比べている間の帯（画面の上端）----
   いま何と何を見比べているか・何件あるか・いまどこにいるか、だけを置く。
   囲みも影も足さない。地色と下の細い線 1 本で本文と分ける。
   狭い画面では 2 段になる（高さは同じ寸法の 2 つぶんで、新しい値は作らない） */
.compare {
  position: absolute;
  top: var(--top-lane);
  left: 0;
  right: 0;
  pointer-events: auto;
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  grid-template-areas: "pair legend count nav end";
  grid-auto-rows: var(--size-bar);
  align-items: center;
  gap: 0 var(--space-4);
  padding: 0 var(--space-4);
  background: var(--surface);
  border-bottom: var(--rule-thin) solid var(--border);
}
:host(.is-narrow) .compare {
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "pair end"
    "count nav";
  gap: 0 var(--space-3);
  padding: 0 var(--space-3);
}
.compare-pair {
  grid-area: pair;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
/* 幅が足りないとき、先に削るのは日付。誰の版かは残す
   （「8月7日 さ…」では用を成さないが、「8月… さとう」なら分かる） */
.compare-version {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  transition: color var(--duration) var(--ease);
}
.compare-label {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
}
.compare-when {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-who { flex: none; white-space: nowrap; }
/* 押せる印は色の変化だけ。下線は引かない——この板では下線は赤入れ（足した文）の
   記号なので、リンクの飾りに使うと帯と本文で同じ形が別の意味を持つ */
.compare-version:hover { color: var(--accent); }
.compare-version[disabled] { cursor: default; }
.compare-version[disabled]:hover { color: var(--text); }
.compare-arrow { flex: none; font-size: var(--font-sm); color: var(--muted); }
.compare-count {
  grid-area: count;
  font-size: var(--font-sm);
  color: var(--muted);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-count:hover { color: var(--text); }
.compare-count[disabled] { cursor: default; }
.compare-count[disabled]:hover { color: var(--muted); }
/* 凡例。説明の文は置かず、形そのものを見せる。
   場所が足りなくなったら**いちばん先に譲る**（人名 > 件数 > 凡例）。
   狭い画面では 2 段の帯にも入れない（読み方より、何と何を比べているかが先） */
.compare-legend {
  grid-area: legend;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  font-size: var(--font-sm);
  color: var(--muted);
  white-space: nowrap;
}
@media (max-width: ${la}px) {
  .compare-legend { display: none; }
}
:host(.is-narrow) .compare-legend { display: none; }

.compare-nav { grid-area: nav; display: flex; align-items: center; gap: var(--space-1); }
/* 数が入れ替わっても幅が動かないよう、桁を等幅で置く */
.compare-position {
  font-size: var(--font-sm);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.compare-end {
  grid-area: end;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-base);
  color: var(--text);
  transition: color var(--duration) var(--ease);
}
.compare-end:hover { color: var(--accent); }

/* ---- 変更の一覧 ----
   本文の写しは並べない（読む場所が 2 つに割れる）。1 行 1 か所で、
   本文のどこへ飛べるかだけを示す。形は本文の赤入れと同じ語彙にそろえる */
/* 見出しはその版の一言。誰がいつ直したかを 1 行添える
   （書き手と日時の見せ方は、コメントのカードと同じ部品を使う） */
.change-head {
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--rule-thin) solid var(--border-light);
}
.change {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  transition: background var(--duration) var(--ease);
}
.change + .change { border-top: var(--rule-thin) solid var(--border-light); }
.change:hover { background: var(--surface-sunken); }
.change.is-active { background: var(--surface-sunken); box-shadow: inset var(--rule-thick) 0 0 var(--accent); }
/* 本文に置けなかったもの。飛び先が無いので押せない */
.change[disabled] { cursor: default; }
.change[disabled]:hover { background: none; }
.change-number {
  flex: none;
  font-size: var(--font-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.change-kind { flex: none; font-size: var(--font-sm); color: var(--muted); }
.change-main { flex: 1; min-width: 0; }
.change-text {
  font-size: var(--font-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 赤入れの語彙。下線＝足した / 取り消し線＝消した。
   本文の印・一覧の行・帯の凡例で、同じ形を使う（同じ意味に別の形を当てない）。
   薄い地色を敷くのは板の中だけ。本文の上では敷かない
   （敷くとコメントの引用＝蛍光ペンと見分けが付かなくなる。板の中は本文ではないので混ざらない） */
.change-text.is-add, .legend-add {
  text-decoration-line: underline;
  text-decoration-thickness: var(--rule-thick);
  text-underline-offset: var(--rule-thick);
  text-decoration-color: var(--diff-add);
}
.change-text.is-del, .legend-del {
  text-decoration-line: line-through;
  text-decoration-thickness: var(--rule-thick);
  text-decoration-color: var(--diff-del);
}
.change-text.is-add { background: var(--diff-add-soft); }
.change-text.is-del { background: var(--diff-del-soft); }

/* その版のときに付いていたコメント。変更の行の下に、同じ一覧の続きとして置く */
.related-head {
  margin: var(--space-5) 0 0;
  padding: var(--space-3) var(--space-4) var(--space-2);
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
}
.related {
  display: block;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-top: var(--rule-thin) solid var(--border-light);
  transition: background var(--duration) var(--ease);
}
.related:hover { background: var(--surface-sunken); }
.related[disabled] { cursor: default; }
.related[disabled]:hover { background: none; }
.related-quote {
  margin: 0 0 var(--space-1);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.related-body { margin: 0; font-size: var(--font-base); white-space: pre-wrap; overflow-wrap: anywhere; }
.related > .outcome-label:first-child { margin-top: 0; }

/* ---- 板の中身の余白と入力欄 ----
   板の中身は 1 枚で入れ替わる。余白・入力欄は、どの中身でも同じものを使う */
.access { padding: var(--space-4); }
/* 入力欄の枠は、置いてあるときは弱く、触っているときだけ主張する。
   板の主役は上にある選び分けや一覧で、入力欄は「ここに打てる」と分かれば足りる。
   常時 --border だと、横幅いっぱいの枠が板の中でいちばん強い塊になる */
.access-add input {
  width: 100%;
  /* 縦は詰めて、横は空ける（画面側の打ち込み口 src/app/_components の FIELD と同じ縦横比）。
     一律に空けると、横幅いっぱいの枠が板の中でいちばん背の高い塊になる */
  padding: var(--space-1) var(--space-2);
  border: var(--rule-thin) solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font: inherit;
  font-size: var(--font-base);
  color: var(--text);
  outline: none;
}
.access-add input:focus { border-color: var(--accent); }
/* 一覧から 1 つ選ぶ行。
   字は**本文と同じ大きさ**にする（DESIGN.md 5 章「目次の 1 行」）。選べる行の 2 態は
   大きさで分けず、太さと濃さだけで分ける決まり——小さくすると「読み飛ばしてよい
   添え物」の合図になり、選択肢そのものが弱く見える。
   選んでいない行が灰、選んでいる行が濃で太い（下の is-active）。 */
.pick-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-1);
  text-align: left;
  font-size: var(--font-base);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.pick-row:hover { background: var(--surface-sunken); color: var(--text); }
.pick-row.is-active { background: var(--surface-sunken); color: var(--text); font-weight: var(--weight-bold); }

/* ---- 共有範囲（このページを誰に見せるか）----
   段は見出しの太さと余白だけで作る。囲みも帯も色分けも置かない。
   色が付くのは、取り消し側の文字が触れたときに赤くなるところ（.action.is-danger）だけ */
.access-scope { margin-bottom: var(--space-5); }
/* 選び分けは 3 つ並ぶ（社内の全員 / 選んだ人だけ / 社外の誰でも）。
   板は細くできるので、入りきらない 1 つだけが次の段へ落ちるようにする。
   縦に積み替えたり字を小さくしたりはしない——3 つは 1 本の軸に並んでいて、
   並び順そのものが「見える人が増える向き」を表しているため */
.access-scope .picker { flex-wrap: wrap; }
/* 社外へ渡す URL と、写す口。
   URL は長いので折り返す。囲みも帯も置かず、余白と細字だけで本文から離す */
.access-link {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.access-url { flex: auto; min-width: 0; font-size: var(--font-sm); overflow-wrap: anywhere; }
.access-part + .access-part { margin-top: var(--space-5); }
/* 節の見出し。**中身より必ず 1 段大きい**（DESIGN.md の鉄則 1）。
   行の名前と同じ大きさにすると、差が太さだけになって同格に見える */
.access-head { margin: 0 0 var(--space-1); font-size: var(--font-md); font-weight: var(--weight-bold); }
/* 行は折り返す。
   板はかなり細くできて（下限は util.ts の PANEL_MIN_WIDTH）、
   そこにアドレス（長い）とボタン 2 つが並ぶ。
   折り返さないと、アドレスが 1 文字ずつ縦に折り重なって読めなくなる。
   ボタンを名前の下の段へ落とす手もあるが、こちらを採った——「作った人にする」と
   「取り消す」は押す前に見比べるものなので、いつも隣どうしに置いておきたい。
   名前は flex: auto（＝中身の幅を基準に置く）なので、名前が短い行（グループ名など）は
   今までどおり 1 行に収まり、入りきらない行だけがボタンごと次の段へ落ちる */
.access-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}
.access-name { flex: auto; min-width: 0; font-size: var(--font-base); overflow-wrap: anywhere; }
/* まだ足していない相手。濃さが「いま効いているか」を表すので、ここだけ薄くする
   （右端の口を読まなくても、名前の列だけでどれが効いているか分かる） */
.access-name.is-pending { color: var(--muted); }
/* 行の中に置く細字（「あなたです」）。段落ではないので、上の余白は要らない */
.access-row > .note { margin-top: 0; }
/* 念押しの 1 文。読まずに押されては断りにならないので、注記（.note）の薄い小さな字には落とさない */
.access-confirm { padding: var(--space-2) 0; }
.access-warning {
  margin: 0 0 var(--space-3);
  font-size: var(--font-base);
  color: var(--text);
  overflow-wrap: anywhere;
}
.origin-diff { margin: var(--space-4) 0; }
.origin-diff .change { padding-left: 0; padding-right: 0; }
.origin-diff .change-text {
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: unset;
}
.access-add { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.access-add input { flex: 1; min-width: 0; }

/* ---- 知らせ ---- */
/* ---- 知らせ（画面上端・独立して浮く）----
   押したあとの成り行きを伝える場所はここ 1 つ。板の中には出さない。
   下端はドック・覗き見・帯が使うので、上端に置いて取り合いを避ける */
.toast-stack {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + var(--space-3) + var(--compare-bar) + var(--top-lane));
  left: var(--space-3);
  right: var(--space-3);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.toast {
  pointer-events: auto;
  max-width: var(--size-popover);
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: var(--font-sm);
  color: var(--text);
}
.toast-text { flex: 1; min-width: 0; }
/* 進行中。まだ何も起きていないので、印は付けない */
.toast.is-pending .toast-text { color: var(--muted); }
/* 済んだ知らせ。直すところは無いので、線を引かない */
.toast.is-success .toast-text { color: var(--muted); }
/* 失敗。ここだけ左に太い線を引き、やり直す道を 1 つ添える */
.toast.is-failure { border-left: var(--rule-thick) solid var(--danger); }
.toast-retry {
  flex: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-bold);
  color: var(--text);
}
.toast-retry:hover { background: var(--surface-sunken); }

/* ---- ページを直す画面（全面）----
   本文そのものを触る作業なので、板ではなく全面で 1 枚にする。
   下書きは iframe に描く（ページ本体の CSS とこちらの見た目を混ぜない） */
.edit-screen {
  position: absolute;
  /* デスクトップアプリでは、窓の題名の帯（現在地の行）の下から始める。ブラウザでは全面 */
  inset: var(--titlebar-h) 0 0 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}
.edit-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
}
.edit-title {
  font-size: var(--font-lg);
  font-weight: var(--weight-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.edit-count { font-size: var(--font-sm); color: var(--muted); white-space: nowrap; }
.edit-message {
  flex: 1;
  min-width: 0;
  max-width: 360px;
  height: var(--size-control);
  padding: 0 var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: var(--font-base);
}
.edit-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-control);
  padding: 0 var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  transition: background var(--duration) var(--ease);
}
.edit-button:hover { background: var(--surface-sunken); }
/* 塗るのは「まずこれを押して」の 1 つだけ */
.edit-button.is-primary { background: var(--text); border-color: var(--text); color: var(--surface); }
.edit-button.is-primary:hover { opacity: .9; }
.edit-button:disabled { opacity: .45; cursor: default; }
.edit-alert {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
  font-size: var(--font-base);
  color: var(--danger);
}
/* 控えの案内。断り（.edit-alert）と同じ位置・同じ余白で、色だけ灰（情報）。
   ボタンを同じ行に置くので flex にする——文字と余白だけでは「押す口」が並ばない。 */
.edit-resume {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
  font-size: var(--font-base);
  color: var(--muted);
}
.edit-frame { flex: 1; width: 100%; border: 0; background: var(--surface); }

/* ---- 指で触るときの入力欄（いちばん最後に置く）----
   iOS は、焦点の当たった入力欄の文字が 16px 未満だと画面ごと勝手に拡大する。
   文章を選んで入力欄を押した瞬間に画面が飛ぶのは、その一番の原因。

   拡大そのものを禁じる手（viewport の maximum-scale）は使わない。
   指で広げて読む自由を奪ううえ、ページ本体は書いた人の持ち物なので触らない。
   こちらの文字を 16px にすれば、拡大は起きない。

   セレクタを種類で広く取ってあるのは、あとから入力欄を足したときの
   取りこぼしを防ぐため。並びの最後に置いてあるのは、先に出てくる
   個別の指定（.composer textarea など）を確実に上書きするため。 */
:host(.is-narrow) textarea,
:host(.is-narrow) input {
  font-size: var(--font-lg);
}
${Jl}
`;var er="data-surprise-presenter";function jc(){let e=document.querySelector(`body[${Kt}] > main[${ia}] > [${Wt}]:not(.deck-step-controls):not(.deck-step-entry)`);return e instanceof HTMLElement?e:null}function Zo(e){return e!==void 0&&!e.hidden&&!e.disabled?e:null}function mi(e){return(e.textContent??"").trim()}function Xt(){let e=jc();if(e===null)return null;let t=[...e.querySelectorAll(":scope > button")];return{present:Zo(t.find(n=>!n.hasAttribute(er)&&mi(n).includes("プレゼンを始める"))),presenter:Zo(t.find(n=>n.hasAttribute(er))),overview:Zo(t.find(n=>/^一覧(?:を閉じる)?$/.test(mi(n)))),overviewOpen:document.documentElement.hasAttribute(Br),notes:Zo(t.find(n=>/^ノートを(?:隠す|表示)$/.test(mi(n)))),notesHidden:e.parentElement?.hasAttribute(_r)??!1}}function jl(e){return e===null?"":[e.present,e.presenter,e.overview,e.notes].map(t=>t===null?"0":"1").concat(e.overviewOpen?"1":"0",e.notesHidden?"1":"0").join("")}function Xl(e){let t=jl(Xt()),n=new MutationObserver(()=>{let o=jl(Xt());o!==t&&(t=o,e())});return n.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["hidden","disabled",Br,_r]}),()=>n.disconnect()}var Xc="surprise-presenter",vi=er,gi=!1,bi=null;function Ql(){for(let e of document.querySelectorAll(`[${Wt}]`))for(let t of e.querySelectorAll("button"))if(!t.hasAttribute(vi)&&(t.textContent??"").includes("プレゼンを始める"))return t;return null}function Qc(){let e=new URLSearchParams(window.location.search);return!window.location.pathname.startsWith("/history/")&&!e.has("v")&&!e.has("from")}async function Zc(){let e=new URL(window.location.href);e.hash="";let t=await fetch(e.href,{credentials:"same-origin",headers:{Accept:"text/html"}});if(!t.ok)throw new Error(a("decks.presentLaunch.loadFailed"));return Ms(await t.text())}function eu(){let e=[...document.querySelectorAll(`[${yo}]`)],t=window.innerHeight/2,n=aa.exec(window.location.hash),s=(e.find(d=>d.hasAttribute(xo))??e.find(d=>{let f=d.getBoundingClientRect();return f.top<=t&&f.bottom>=t})??(n?e[Number(n[1])-1]:void 0))?.querySelector(`section[${Hr}]`);return s?s.getAttribute("data-deck-node")??`present-${[...document.querySelectorAll(`section[${Hr}]`)].indexOf(s)+1}`:null}async function wi(e,t,n){if(gi)return;let o=e?window.open("about:blank","","popup,width=1280,height=720"):null;o&&Ns(o);let s=eu();if(n.editable()){await n.openEditable({audienceWindow:o,slide:s});return}gi=!0;let d=document.createElement(Xc),f=d.attachShadow({mode:"open"}),C=i("style");C.textContent=Qo+Rs;let R=i("div","edit-screen deck-studio");f.append(C,R);let h=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden",document.body.append(d);let A=()=>{d.remove(),document.documentElement.style.overflow=h,gi=!1,t()},N,te;try{[N,te]=await Promise.all([Zc(),import("./comments-widget-chunk-W7V5RETQ.js")])}catch(me){o?.close(),A(),window.alert(me instanceof Error?me.message:a("decks.presentLaunch.openFailed"));return}let ce={html:N,versionId:"reader",versionNumber:0};te.openDeckPresenter({host:R,readOnly:!0,audienceWindow:o,saved:()=>ce,preview:()=>N,source:()=>N,status:()=>"",commit:()=>!1,current:()=>s,closed:A})}function Zl(e,t){if(e.parentElement?.querySelector(`[${vi}]`))return;let n=e.cloneNode(!1);if(!(n instanceof HTMLButtonElement))return;n.setAttribute(vi,""),n.removeAttribute("title"),n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+Po.map(s=>`<path d="${s}"/>`).join("")+"</svg>",n.append(i("span",void 0,a("decks.presentLaunch.presenter")));let o=()=>{n.hidden=e.hidden,n.disabled=e.disabled};o(),new MutationObserver(o).observe(e,{attributes:!0,attributeFilter:["hidden","disabled"]}),n.addEventListener("click",()=>{n.disabled||wi(!1,()=>n.focus(),t)}),e.after(n),e.parentElement?.addEventListener("click",s=>{!(s.target instanceof Element)||s.target.closest("button")!==e||e.disabled||!Hs()||(s.preventDefault(),s.stopImmediatePropagation(),wi(!0,()=>e.focus(),t))},!0)}function ed(e){let t=Xt()?.presenter??null;bi===null||t===null||wi(!1,e,bi)}function td(e){if(!hi()||!Qc())return;bi=e;let t=Ql();if(t){Zl(t,e);return}let n=new MutationObserver(()=>{let o=Ql();o&&(n.disconnect(),Zl(o,e))});n.observe(document.body,{childList:!0,subtree:!0}),window.setTimeout(()=>n.disconnect(),1e4)}var nd=null,tr=null,yi=!1;function od(){return tr??(tr=import("./comments-widget-chunk-OTBNMSHY.js").then(e=>(nd=e,e),e=>{throw tr=null,e})),tr}function rd(){let e=()=>{od().catch(()=>{})};typeof window.requestIdleCallback=="function"?window.requestIdleCallback(e,{timeout:4e3}):window.setTimeout(e,1500)}function Cn(){return yi||(nd?.editorActive()??!1)}async function id(e,t={}){if(Cn())return;yi=!0;let n;try{n=await od()}catch{e.fail(a("toolbox.editor.deckEditorLoadFailed"));return}finally{yi=!1}await n.openPageEditor(e,t)}var ad=["M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4","M2 6h4","M2 10h4","M2 14h4","M2 18h4","M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"];function sd(){return document.querySelector(`main[${ni}]`)!==null&&!document.body.hasAttribute("data-deck")}var En=null,xi=!1;function jn(){return xi||En!==null||da()}async function ld(e){if(jn())return!1;xi=!0;try{let[t,n]=await Promise.all([ps(e.pageSlug),import("./comments-widget-chunk-ZVUZJ4JA.js").catch(()=>null)]);if(n===null)return e.fail(a("notes.entry.loadFailed")),!1;if(!t.ok)return e.fail(t.message),!1;let o=new DOMParser().parseFromString(t.value.previewHtml,"text/html").querySelector(`main[${ni}]`);if(o===null||t.value.baseVersionId===null)return e.fail(a("notes.entry.unsupported")),!1;let s=n.mountNoteEditor({pageSlug:e.pageSlug,baseVersionId:t.value.baseVersionId,source:o,notify:e.notify,prepare:e.prepare});return s.ok?(En=s.handle,!0):(e.fail(a(s.reason==="unsupported"?"notes.entry.unsupported":"notes.entry.loadFailed")),!1)}finally{xi=!1}}async function dd(){return En===null?!0:await En.finish()?(En.destroy(),En=null,window.location.reload(),!0):!1}function cd(e){for(let t of e.querySelectorAll(`figure[data-note-embed] > a[${Bs}]`)){let n=t.parentElement?.getAttribute("data-note-embed-id")??null;Ps(n)&&t.replaceWith(Vs(t.ownerDocument,n,t.className,t.getAttribute("aria-label")??""))}}var fd="surprise-pages:export:include-comments",tu=`${fn}
:host {
  position: relative;
  display: inline-flex;
  z-index: 2147483001;
  font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: transparent; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
.icon { display: inline-flex; align-items: center; flex: none; }
.icon svg { display: block; }
[hidden] { display: none !important; }

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control);
  height: var(--size-control);
  border-radius: var(--radius-sm);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.trigger:hover { background: var(--surface-sunken); color: var(--text); }
.trigger.is-open { color: var(--text); }

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-1));
  min-width: var(--size-bubble-max);
  padding: var(--space-1);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.item {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-touch);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.item:hover { background: var(--surface-sunken); color: var(--text); }
.rule {
  height: var(--rule-thin);
  margin: var(--space-1) 0;
  background: var(--border-light);
  border: 0;
}
.check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--size-touch);
  padding: 0 var(--space-3);
  cursor: pointer;
  user-select: none;
}
.check-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.check-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  color: transparent;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease),
    color var(--duration) var(--ease);
}
.check-input:checked + .check-mark {
  background: var(--muted);
  border-color: var(--muted);
  color: var(--surface);
}
.check-label {
  font-size: var(--font-base);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.check-input:checked ~ .check-label { color: var(--text); }
@media (hover: hover) {
  .check-row:hover .check-mark { border-color: var(--accent); }
  .check-row:hover .check-label { color: var(--text); }
}
.check-input:focus-visible + .check-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}
@media print {
  :host { display: none !important; }
}
`,hd={comments:()=>[]},Si=!1,ki=new Set;function md(e){hd=e}function Ti(e){Si=e;for(let t of ki)t.sync()}function gd(){return Si&&Ct(fd)==="1"}function nu(){return`${window.location.origin}${window.location.pathname}${window.location.search}`}function ou(){let n=window.location.pathname.replace(/\/+$/,"").split("/").filter(o=>o.length>0&&o!=="internal"&&o!=="public").join("-");return`${n.length>0?n:"page"}.md`}var Ci=null,nr=null;function vd(){return nr??(nr=import("./comments-widget-chunk-YBDCFRCN.js").then(e=>(Ci=e,e),e=>{throw nr=null,e})),nr}function ru(){let e=()=>{vd().catch(()=>{})};typeof window.requestIdleCallback=="function"?window.requestIdleCallback(e,{timeout:5e3}):window.setTimeout(e,1500)}function ud(e){if(Ci!==null){e(pd(Ci));return}vd().then(t=>e(pd(t)),()=>{})}function pd({pageToMarkdown:e}){let t=document.title.trim();return e({title:t.length>0?t:null,url:nu(),root:document.body,comments:gd()?hd.comments():null})}function iu(e){return e?{paths:lt,label:a("toolbox.common.copied")}:{paths:pa,label:a("toolbox.export.trigger")}}var Sn,Qt,nt,Zt,Tn,Xn,Qn,he,bd,wd,or,yd,xd,kd,Cd,Dt,Ei=class extends HTMLElement{constructor(){super();kt(this,he);kt(this,Sn);kt(this,Qt);kt(this,nt,!1);kt(this,Zt,!1);kt(this,Tn,0);kt(this,Xn,n=>{!Ce(this,nt)||n.composedPath().includes(this)||(vt(this,nt,!1),Ve(this,he,Dt).call(this))});kt(this,Qn,n=>{n.key!=="Escape"||!Ce(this,nt)||(vt(this,nt,!1),Ve(this,he,Dt).call(this))});vt(this,Sn,this.attachShadow({mode:"open"})),vt(this,Qt,i("style")),Ce(this,Qt).textContent=tu,Ce(this,Sn).appendChild(Ce(this,Qt))}connectedCallback(){ki.add(this),this.sync(),document.addEventListener("click",Ce(this,Xn),!0),document.addEventListener("keydown",Ce(this,Qn))}disconnectedCallback(){ki.delete(this),document.removeEventListener("click",Ce(this,Xn),!0),document.removeEventListener("keydown",Ce(this,Qn)),window.clearTimeout(Ce(this,Tn))}sync(){Ve(this,he,Dt).call(this)}};Sn=new WeakMap,Qt=new WeakMap,nt=new WeakMap,Zt=new WeakMap,Tn=new WeakMap,Xn=new WeakMap,Qn=new WeakMap,he=new WeakSet,bd=function(n){let o=iu(Ce(this,Zt));n.title=o.label,n.setAttribute("aria-label",o.label),n.setAttribute("aria-haspopup","menu"),n.setAttribute("aria-expanded",Ce(this,nt)?"true":"false"),n.className=Ce(this,nt)?"trigger is-open":"trigger";let s=Ce(this,Zt)?ma:2,d=oe(o.paths,se.medium,s),f=n.querySelector(".icon");f!==null?f.replaceWith(d):n.appendChild(d)},wd=function(){vt(this,Zt,!0),window.clearTimeout(Ce(this,Tn)),vt(this,Tn,window.setTimeout(()=>{vt(this,Zt,!1),Ve(this,he,Dt).call(this)},2400)),Ve(this,he,Dt).call(this)},or=function(){vt(this,nt,!1),Ve(this,he,Dt).call(this)},yd=function(){ud(n=>{Un(n).then(o=>{Ve(this,he,or).call(this),o&&Ve(this,he,wd).call(this)})})},xd=function(){ud(n=>{$n(ou(),"text/markdown",n),Ve(this,he,or).call(this)})},kd=function(){Ve(this,he,or).call(this),window.print()},Cd=function(n){Ht(fd,n?"1":"0")},Dt=function(){let n=i("button",Ce(this,nt)?"trigger is-open":"trigger");n.type="button",Ve(this,he,bd).call(this,n),n.addEventListener("click",s=>{s.stopPropagation(),vt(this,nt,!Ce(this,nt)),Ve(this,he,Dt).call(this)});let o=i("div");if(o.appendChild(n),Ce(this,nt)){let s=i("div","menu");s.setAttribute("role","menu");let d=i("button","item",a("toolbox.export.copy"));d.type="button",d.setAttribute("role","menuitem"),d.addEventListener("click",()=>Ve(this,he,yd).call(this)),s.appendChild(d);let f=i("button","item",a("toolbox.export.save"));if(f.type="button",f.setAttribute("role","menuitem"),f.addEventListener("click",()=>Ve(this,he,xd).call(this)),s.appendChild(f),Si){let h=i("hr","rule");s.appendChild(h);let A=i("label","check-row"),N=i("input");N.type="checkbox",N.className="check-input",N.checked=gd();let te=i("span","check-mark");te.appendChild(oe(lt,se.small)),A.appendChild(N),A.appendChild(te),A.appendChild(i("span","check-label",a("toolbox.export.includeComments"))),N.addEventListener("change",()=>Ve(this,he,Cd).call(this,N.checked)),A.addEventListener("click",ce=>ce.stopPropagation()),s.appendChild(A)}let C=i("hr","rule");s.appendChild(C);let R=i("button","item","PDF");R.type="button",R.setAttribute("role","menuitem"),R.addEventListener("click",()=>Ve(this,he,kd).call(this)),s.appendChild(R),o.appendChild(s)}Ce(this,Sn).replaceChildren(Ce(this,Qt),o)};function au(){typeof customElements>"u"||customElements.get(Ut)===void 0&&customElements.define(Ut,Ei)}function su(e=document){let t=e.querySelector(".no-print");if(t!==null)return t;let n=e.querySelector("button[onclick*='print']");return n===null?null:n.parentElement}function Ed(){if(au(),document.querySelector(Ut)!==null)return;let e=su();if(e===null)return;for(let n of[...e.querySelectorAll("button")])n.remove();let t=document.createElement(Ut);e.appendChild(t),ru()}var rr="data-sp-first-paint",Sd="chrome";var ir="surprise-reading-nav",lu="data-clean-copy-document",Pd="article[data-clean-copy-source-id]",du="blockquote,pre,code,figure,svg,nav,aside,.lecture-cue,[data-ads-figure],[data-source-note],[data-clean-copy-ui],del[data-surprise-redline]";function Li(e,t){let n=t.split(".").map(o=>`0*${Number(o)}`).join("\\.");return e.replace(new RegExp(`^${n}[｜|.．、\\s]+`),"")}function en(e){let t=e.cloneNode(!0);if(t instanceof Element)for(let n of t.querySelectorAll("del[data-surprise-redline]"))n.remove();return(t.textContent??"").replace(/\s+/g," ").trim()}function Td(e,t){return Array.from(e.querySelectorAll(t)).filter(n=>n instanceof HTMLElement&&!n.closest(du)&&en(n).length>0)}function Ld(e,t){if(e.id)return e.id;let n=e.ownerDocument,o=t,s=1;for(;n.getElementById(o);)o=`${t}-${s++}`;return e.id=o,o}function ar(e,t){let n=new URL(e);return n.hash=t,n.href}function Ad(e,t){return e.origin===t.origin&&e.pathname.replace(/\/+$/,"")===t.pathname.replace(/\/+$/,"")}function Ai(e){let t=e.querySelector("main");return t instanceof HTMLElement&&(t.hasAttribute(lu)||t.querySelector(Pd)!==null)}function Pi(e){let t=e.querySelector("main");if(!(t instanceof HTMLElement)||!Ai(e))return null;let n=Array.from(t.querySelectorAll(Pd)).filter(h=>h instanceof HTMLElement),o=t.querySelector('[data-clean-copy-ui="navigation"]'),s=o instanceof HTMLElement?o:null,d=new URL(e.URL),f=[],C=new Map;for(let h of s?.querySelectorAll("a[href]")??[]){let A=h.getAttribute("href");if(!A)continue;let N;try{N=new URL(A,d)}catch{continue}if(Ad(N,d)&&N.hash)try{C.set(decodeURIComponent(N.hash.slice(1)),en(h))}catch{}else!Ad(N,d)&&(N.protocol==="https:"||N.protocol==="http:")&&f.push({title:en(h),href:N.href})}let R=[];if(n.length>1)for(let h of n){let A=Td(h,"h1,h2,h3,h4,h5,h6"),N=A[0],te=h.getAttribute("data-clean-copy-source-id")??"",ce=h.parentElement,me=ce instanceof HTMLElement&&ce.id===te?ce:N??h,P=A.filter(ve=>ve.tagName!=="H1"),ue=Math.min(...P.map(ve=>Number(ve.tagName.slice(1))));R.push({target:me,title:h.getAttribute("data-clean-copy-label")||(N?en(N):C.get(te))||a("toolbox.reading.chapterFallback",{number:R.length+1}),sections:P.filter(ve=>Number(ve.tagName.slice(1))===ue).map(ve=>({target:ve,title:en(ve)}))})}else{let h=n[0]??t;for(let A of Td(h,"h2,h3"))A.tagName==="H2"?R.push({target:A,title:en(A),sections:[]}):R[R.length-1]?.sections.push({target:A,title:en(A)})}return R.reduce((h,A)=>h+1+A.sections.length,0)<=1?null:(R.forEach((h,A)=>{Ld(h.target,`clean-copy-chapter-${A+1}`),h.sections.forEach((N,te)=>Ld(N.target,`clean-copy-chapter-${A+1}-section-${te+1}`))}),{main:t,chapters:R,related:f,oldNavigation:s})}function Ri(e){for(let t=e;t;t=t.parentElement)t instanceof HTMLDetailsElement&&(t.open=!0)}function Oi(e,t){let n=-1;return e.forEach((o,s)=>{o.target.getClientRects().length>0&&o.target.getBoundingClientRect().top<=t&&(n=s)}),n}var Rd=`${fn}
:host {
  --reading-rail: ${we.railWidth}px;
  position: fixed; inset: 0; z-index: 2147482500; pointer-events: none;
  font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-md); line-height: var(--leading-normal); color: var(--text);
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
a, button { color: inherit; font: inherit; text-decoration: none; }
button { border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; }
a:focus-visible, button:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
a:hover, button:hover { color: var(--text); }
/* 組みの高さの目盛り（src/widget/reading/nav.ts の layoutHeight）。lvh を知らないブラウザでは vh（同じ意味の古い単位）に落ちる */
.viewport { position: absolute; top: 0; left: 0; width: 0; height: 100vh; height: 100lvh; visibility: hidden; pointer-events: none; }
.icon { display: inline-flex; flex: none; align-items: center; }
.icon svg { display: block; }
.rail {
  pointer-events: auto; position: absolute; width: var(--reading-rail);
  top: calc(var(--reading-top, 0px) + var(--space-5));
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
  left: var(--reading-left, var(--space-5));
  display: flex; flex-direction: column; gap: var(--space-5);
}
.rail-title { font-size: var(--font-md); font-weight: var(--weight-bold); margin: 0 0 var(--space-2); }
.count { font-size: var(--font-sm); color: var(--muted); font-weight: var(--weight-normal); margin-left: var(--space-2); }
ol { list-style: none; margin: 0; padding: 0; }
.entry { display: block; min-height: var(--size-touch); padding: var(--space-2) 0; color: var(--muted); overflow-wrap: anywhere; }
.entry[aria-current] { color: var(--text); font-weight: var(--weight-medium); }
.entry.numbered { display:grid; grid-template-columns:var(--size-control) minmax(0,1fr); column-gap:var(--space-2); }
.entry-number { font-variant-numeric:tabular-nums; }
.entry-title { min-width:0; overflow-wrap:anywhere; }
/* 章の木。節は章の行の中に、章の題の字下げに合わせて入れる（章番号の列 + 列の間） */
.tree { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.rail .section-list { padding-left: calc(var(--size-control) + var(--space-2)); padding-bottom: var(--space-2); }
.rail .section-list .entry { min-height: var(--size-control); padding: var(--space-1) 0; }
.section-list .numbered, .sheet-content .section-entries .numbered { grid-template-columns:var(--space-7) minmax(0,1fr); }
.related { flex: none; font-size: var(--font-sm); }
.related a { display: block; padding: var(--space-2) 0; color: var(--muted); }
.trigger {
  pointer-events: auto; position: absolute; top: var(--reading-top, 0px); left: 0; right: var(--reading-right, 0px);
  display: flex; align-items: center; gap: var(--space-4); width: auto;
  padding: var(--space-3) calc(var(--space-4) + env(safe-area-inset-right, 0px)) var(--space-3) calc(var(--space-4) + env(safe-area-inset-left, 0px));
  background: var(--surface); border-bottom: var(--rule-thin) solid var(--border-light);
  min-height: var(--size-touch);
}
.trigger-copy { min-width: 0; flex: 1; }
.chapter-line, .section-line { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chapter-line { color: var(--muted); font-size: var(--font-sm); }
.section-line { font-size: var(--font-md); font-weight: var(--weight-medium); }
.trigger-label { display: flex; align-items: center; gap: var(--space-1); flex: none; }
.sheet {
  pointer-events: auto; position: fixed; inset: 0; margin: 0; width: 100%; height: 100%; max-width: none; max-height: none;
  padding: 0; border: 0; background: var(--surface); color: var(--text); overflow: hidden;
}
.sheet[open] { display: flex; flex-direction: column; }
.sheet::backdrop { background: var(--surface); }
.sheet-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: var(--space-4); padding: calc(var(--space-2) + env(safe-area-inset-top, 0px) + var(--titlebar-h)) var(--space-4) var(--space-2); }
.sheet-title { margin: 0; font-size: var(--font-lg); font-weight: var(--weight-bold); }
.control { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--size-touch); min-width: var(--size-touch); }
.sheet-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-2) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom, 0px)); }
.sheet-content .entry { min-height: var(--size-touch); padding: var(--space-3) 0; }
.chapter-row { margin-bottom: var(--space-3); }
.chapter-row .entry { padding-bottom: 0; }
.chapter-extra { display: flex; align-items: center; gap: var(--space-3); }
.current-note { color: var(--muted); font-size: var(--font-sm); margin: var(--space-1) 0 0; overflow-wrap: anywhere; }
.drill { margin-left: auto; color: var(--muted); white-space: nowrap; }
.sheet-heading { font-size: var(--font-lg); line-height: var(--leading-normal); font-weight: var(--weight-bold); margin: 0 0 var(--space-4); overflow-wrap: anywhere; }
.sheet-content .related { margin-top: var(--space-5); }
@media print { :host { display: none !important; } }
`;function Od(e){return`
      @media screen {
        ${e} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${we.chapterGap}px; }
      }
      @media screen and (max-width:${we.narrowWidth}px) {
        ${e} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${we.chapterGapNarrow}px; }
      }
      ${e} [data-clean-copy-ui="navigation"],
      ${e} #sp-to-top { display:none !important; }`}var Ii="surpriseReadingJump";function cu(e){return typeof e=="object"&&e!==null&&Ii in e}function Id(e,t){if(window.scrollY<=we.edge)return null;let n=e.getBoundingClientRect(),o=Math.max(n.left,0)+we.edge,s=document.caretRangeFromPoint?.(o,t);if(s&&e.contains(s.startContainer)){s.startContainer instanceof Text&&s.startOffset<s.startContainer.length&&s.setEnd(s.startContainer,s.startOffset+1);let d=s.getBoundingClientRect();if(d.height>0&&d.bottom>=t&&d.top<window.innerHeight)return{range:s,top:d.top,scrollY:window.scrollY}}for(let d of e.querySelectorAll("p,h1,h2,h3,li,td")){let f=d.getBoundingClientRect();if(d.getClientRects().length===0||f.bottom<t||f.top>window.innerHeight)continue;let C=document.createRange(),R=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);for(let h=R.nextNode();h;h=R.nextNode()){if(!(h instanceof Text)||!h.textContent?.trim())continue;C.setStart(h,0),C.setEnd(h,Math.min(1,h.length));let A=C.getBoundingClientRect();if(A.height>0)return{range:C,top:A.top,scrollY:window.scrollY}}}return null}var Mi=class{constructor(t,n){this.options=n;this.host=document.createElement(ir);this.shadow=this.host.attachShadow({mode:"open"});this.rail=i("nav","rail");this.tree=i("div","tree");this.chapterList=i("ol","chapter-list");this.sectionList=i("ol","section-list");this.rows=[];this.relatedBox=i("div","related");this.viewport=i("div","viewport");this.trigger=i("button","trigger");this.chapterLine=i("span","chapter-line");this.sectionLine=i("span","section-line");this.sheet=i("dialog","sheet");this.sheetHeader=i("div","sheet-header");this.sheetContent=i("div","sheet-content");this.links=[];this.chapter=-1;this.section=-1;this.displayedChapter=-1;this.right=0;this.compact=!0;this.interacting=!1;this.focused=!1;this.queued=!1;this.resizing=!1;this.printing=!1;this.destroyed=!1;this.applying=!1;this.lastPosition=null;this.fingerprint="";this.resizeObserver=null;this.pageStyle=i("style");this.stopWatchingTop=()=>{};this.onScroll=()=>this.queue();this.onResize=()=>{if(this.resizing||this.printing||this.destroyed)return;this.resizing=!0;let t=this.lastPosition;requestAnimationFrame(()=>{this.preserve(()=>this.layout(),t),this.resizing=!1})};this.onHash=()=>{this.close(!1);let t=Ls(history.state);if(t!==null||cu(history.state)){this.layout(),t!==null&&requestAnimationFrame(()=>{this.destroyed||Ts(t),this.queue()}),this.queue();return}let n;try{n=decodeURIComponent(window.location.hash.slice(1))}catch{return}let o=document.getElementById(n);o instanceof HTMLElement&&this.outline.main.contains(o)&&(Ri(o),this.layout(),o.scrollIntoView({block:"start",behavior:"instant"})),this.queue()};this.beforePrint=()=>{this.printing=!0,this.close(!1)};this.afterPrint=()=>{this.printing=!1,this.layout(),this.queue()};this.outline=t;let o=document.documentElement;this.original={left:o.style.paddingLeft,right:o.style.paddingRight,top:o.style.paddingTop,transition:o.style.transition,maxWidth:t.main.style.maxWidth,printWidth:getComputedStyle(t.main).maxWidth};let s=i("style");s.textContent=Rd,this.viewport.setAttribute("aria-hidden","true"),this.shadow.append(s,this.viewport,this.rail,this.trigger,this.sheet),this.rail.setAttribute("aria-label",a("toolbox.reading.railLabel")),this.rail.append(this.tree,this.relatedBox),this.trigger.type="button",this.trigger.setAttribute("aria-haspopup","dialog"),this.trigger.setAttribute("aria-expanded","false");let d=i("span","trigger-copy");d.append(this.chapterLine,this.sectionLine);let f=i("span","trigger-label",a("toolbox.reading.contents"));if(f.append(oe(Lo,se.small)),this.trigger.append(d,f),this.trigger.addEventListener("click",()=>this.open()),this.sheet.setAttribute("aria-label",a("toolbox.reading.sheetLabel")),this.sheet.append(this.sheetHeader,this.sheetContent),this.sheet.addEventListener("close",()=>this.finishClose()),this.sheet.addEventListener("cancel",C=>{C.preventDefault(),this.close()}),this.sheet.addEventListener("keydown",C=>{C.stopPropagation(),C.key==="Escape"&&(C.preventDefault(),this.close())}),this.rail.addEventListener("pointerenter",()=>{this.interacting=!0}),this.rail.addEventListener("pointerleave",()=>{this.interacting=!1,this.queue()}),this.rail.addEventListener("focusin",()=>{this.focused=!0}),this.rail.addEventListener("focusout",()=>{this.focused=!1,this.queue()}),this.pageStyle.textContent=`${Od("html[data-surprise-reading]")}
      @media print {
        html[data-surprise-reading] { padding-left:${this.original.left||"0"} !important; padding-right:${this.original.right||"0"} !important; padding-top:${this.original.top||"0"} !important; }
        html[data-surprise-reading] main { max-width:${this.original.printWidth||"none"} !important; }
      }`,document.head.append(this.pageStyle),document.body.append(this.host),o.setAttribute("data-surprise-reading",""),this.buildRail(),Ae.setScrollGap(we.edge),this.sync(),this.layout(),this.sync(),this.remember(),this.stopWatchingTop=Ae.watch(()=>{this.applying||this.preserve(()=>this.layout())}),window.addEventListener("scroll",this.onScroll,{passive:!0}),window.addEventListener("resize",this.onResize),window.addEventListener("hashchange",this.onHash),window.addEventListener("popstate",this.onHash),window.addEventListener("beforeprint",this.beforePrint),window.addEventListener("afterprint",this.afterPrint),this.mutationObserver=new MutationObserver(C=>{C.some(h=>(h.target instanceof Element?h.target:h.target.parentElement)?.closest("h1,h2,h3")?!0:[...h.addedNodes,...h.removedNodes].some(N=>N instanceof Element&&(N.matches("h1,h2,h3,article,details")||N.querySelector("h1,h2,h3"))))&&this.refreshOutline(),this.queue()}),this.mutationObserver.observe(t.main,{subtree:!0,childList:!0,characterData:!0}),typeof ResizeObserver<"u"){this.resizeObserver=new ResizeObserver(()=>this.onResize()),this.resizeObserver.observe(t.main),this.resizeObserver.observe(this.trigger);let C=document.querySelector(`[${Ir}]`);C&&this.resizeObserver.observe(C)}t.main.addEventListener("toggle",this.onResize,!0),document.fonts?.ready.then(()=>this.onResize()),window.location.hash&&!Es()&&requestAnimationFrame(this.onHash)}entryLink(t,n){let o=i("a",n?"entry numbered":"entry");if(n){let s=Li(t.title,n);o.append(i("span","entry-number",n),i("span","entry-title",s)),o.setAttribute("aria-label",t.title)}else o.textContent=t.title;return o.href=ar(window.location.href,t.target.id),o.dataset.target=t.target.id,o.addEventListener("click",s=>{s.metaKey||s.ctrlKey||s.shiftKey||s.altKey||s.button!==0||(s.preventDefault(),this.go(t))}),o}addRelated(t){t.replaceChildren();for(let o of this.outline.related){let s=i("a","",`${o.title} ↗`);s.href=o.href,t.append(s)}let n=i("a","",a("toolbox.reading.top"));n.href=ar(window.location.href,"sp-top"),n.addEventListener("click",o=>{if(o.metaKey||o.ctrlKey||o.shiftKey||o.altKey)return;o.preventDefault(),this.close(!1);let s=new URL(window.location.href);s.hash="",Zr(),history.pushState({[Ii]:"top"},"",s.href),window.scrollTo({top:0,behavior:"instant"}),this.queue()}),t.append(n)}buildRail(){this.fingerprint=this.outline.chapters.map(n=>`${n.target.id}:${n.title}:${n.sections.map(o=>`${o.target.id}:${o.title}`).join("|")}`).join(`
`);let t=i("p","rail-title",a("toolbox.reading.overview"));t.append(i("span","count",a("toolbox.reading.chapterCount",{count:this.outline.chapters.length}))),this.chapterList.replaceChildren(),this.links=[],this.rows=[];for(let[n,o]of this.outline.chapters.entries()){let s=i("li","chapter"),d=this.entryLink(o,String(n+1).padStart(2,"0"));this.links.push(d),this.rows.push(s),s.append(d),this.chapterList.append(s)}this.sectionList.remove(),this.tree.replaceChildren(t,this.chapterList),this.addRelated(this.relatedBox),this.displayedChapter=-1}refreshOutline(){let t=Pi(document);!t||t.chapters.map(o=>`${o.target.id}:${o.title}:${o.sections.map(s=>`${s.target.id}:${s.title}`).join("|")}`).join(`
`)===this.fingerprint||(this.outline=t,this.buildRail(),this.sheet.open&&this.showChapters())}get bannerHeight(){return document.querySelector(`[${Ir}]`)?.getBoundingClientRect().height??0}get baseTop(){return Ae.above("reading")+this.bannerHeight}get top(){return this.baseTop+(this.compact?this.trigger.getBoundingClientRect().height:0)}get layoutHeight(){return Math.max(window.innerHeight,this.viewport.getBoundingClientRect().height)}get readingLine(){return this.top+Math.max(we.edge*2,Math.min(we.readingLineMax,(window.innerHeight-this.top)*we.readingLineFraction))}setPanel(t){this.right!==t&&this.preserve(()=>{this.right=t,this.layout()})}preserve(t,n=Id(this.outline.main,this.readingLine)){let o=window.scrollY<=we.edge,s=window.scrollY;if(t(),n&&n.range.startContainer.isConnected){let d=n.top-(s-n.scrollY),f=n.range.getBoundingClientRect().top-d;if(Math.abs(f)>1){let C=f+d-Math.max(d,this.top+we.edge);Math.abs(C)>1&&window.scrollBy({top:C,behavior:"instant"})}}else o&&window.scrollTo({top:0,behavior:"instant"});this.sync(),this.remember()}layout(){if(this.printing||this.destroyed)return;let t=document.documentElement,n=t.clientWidth-this.right,o=this.baseTop;this.host.style.setProperty("--reading-top",`${o}px`),this.host.style.setProperty("--reading-right",`${this.right}px`),this.host.style.setProperty("--reading-left",`${Math.max(we.edge,(n-we.minWidth)/2+we.edge)}px`),this.rail.hidden=!1;let s=Number.parseFloat(getComputedStyle(this.host).getPropertyValue("--size-touch"))||44,d=this.tree.firstElementChild?.getBoundingClientRect().height??0,f=this.links.reduce((A,N)=>A+N.getBoundingClientRect().height,0),C=d+f+s*we.minSectionRows+this.relatedBox.offsetHeight+s+we.edge*4,R=this.right===0?window.innerWidth:n;this.compact=R<we.minWidth||this.layoutHeight-o<C,this.rail.hidden=this.compact,this.trigger.hidden=!this.compact;let h=this.compact?this.trigger.getBoundingClientRect().height:0;t.style.transition="none",t.style.paddingRight=this.right?`${this.right}px`:this.original.right,t.style.paddingLeft=this.compact?this.original.left:`${we.railWidth+we.gap}px`,this.outline.main.style.maxWidth=`${we.bodyWidth}px`,this.applying=!0,Ae.set("reading",h),this.applying=!1}sync(t=!1){if(this.destroyed)return;let n=this.readingLine+1,o=window.scrollY>0&&window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-1,s=Math.max(0,Oi(this.outline.chapters,o?Number.POSITIVE_INFINITY:n)),d=this.outline.chapters[s];if(!d)return;let f=Oi(d.sections,o?Number.POSITIVE_INFINITY:n);if(this.chapter=s,this.section=f,this.chapterLine.textContent=a("toolbox.reading.chapterLine",{at:String(s+1).padStart(2,"0"),total:String(this.outline.chapters.length).padStart(2,"0"),title:Li(d.title,String(s+1))}),this.sectionLine.textContent=d.sections[f]?.title??a("toolbox.reading.chapterStart"),this.trigger.title=a("toolbox.reading.triggerTitle",{chapter:d.title,section:this.sectionLine.textContent}),this.links.forEach((h,A)=>{A===s?h.setAttribute("aria-current","location"):h.removeAttribute("aria-current")}),!t&&(this.interacting||this.focused))return;if(this.displayedChapter!==s){let h=d.sections.map((A,N)=>{let te=i("li");return te.append(this.entryLink(A,`${s+1}.${N+1}`)),te});this.sectionList.replaceChildren(...h),this.sectionList.remove(),h.length&&this.rows[s]?.append(this.sectionList),this.displayedChapter=s,requestAnimationFrame(()=>{this.destroyed||this.preserve(()=>this.layout())})}let C=d.sections[f]?.target.id,R=this.links[s];for(let h of this.sectionList.querySelectorAll("a"))h.dataset.target===C?(h.setAttribute("aria-current","location"),R=h):h.removeAttribute("aria-current");if(R&&!this.compact){let h=R.getBoundingClientRect(),A=this.tree.getBoundingClientRect();h.top<A.top?this.tree.scrollTop+=h.top-A.top:h.bottom>A.bottom&&(this.tree.scrollTop+=h.bottom-A.bottom)}}sheetFrame(t){let o=i("h2","sheet-title",a("toolbox.reading.chapterCount",{count:this.outline.chapters.length}));if(t){let d=i("button","control",`‹ ${a("toolbox.reading.chapterCount",{count:this.outline.chapters.length})}`);d.type="button",d.addEventListener("click",()=>{this.showChapters(),this.sheetHeader.querySelector("button")?.focus()}),o=d}let s=i("button","control",a("toolbox.common.close"));s.type="button",s.addEventListener("click",()=>this.close()),this.sheetHeader.replaceChildren(o,s),this.sheetContent.replaceChildren(),this.sheetContent.scrollTop=0}showChapters(){this.sheetFrame(!1);let t=i("ol");this.outline.chapters.forEach((o,s)=>{let d=i("li","chapter-row"),f=this.entryLink(o,String(s+1).padStart(2,"0"));if(s===this.chapter&&f.setAttribute("aria-current","location"),d.append(f),s===this.chapter&&d.append(i("p","current-note",a("toolbox.reading.current",{section:o.sections[this.section]?.title??a("toolbox.reading.chapterStart")}))),o.sections.length){let C=i("div","chapter-extra"),R=i("button","control drill",`${a("toolbox.reading.sectionCount",{count:o.sections.length})} ›`);R.type="button",R.setAttribute("aria-label",a("toolbox.reading.drillLabel",{chapter:o.title,count:o.sections.length})),R.addEventListener("click",()=>this.showSections(s)),C.append(R),d.append(C)}t.append(d)});let n=i("div","related");this.addRelated(n),this.sheetContent.append(t,n)}showSections(t){let n=this.outline.chapters[t];if(!n)return;this.sheetFrame(!0);let o=i("h2","sheet-heading",n.title),s=i("ol","section-entries");n.sections.forEach((d,f)=>{let C=i("li"),R=this.entryLink(d,`${t+1}.${f+1}`);t===this.chapter&&f===this.section&&R.setAttribute("aria-current","location"),C.append(R),s.append(C)}),this.sheetContent.append(o,s),this.sheetHeader.querySelector("button")?.focus()}open(){this.sheet.open||(this.options.onDialogChange(!0),this.showChapters(),this.trigger.setAttribute("aria-expanded","true"),this.sheet.showModal())}close(t=!0){this.sheet.open&&(this.sheet.close(),this.finishClose(),t&&this.compact&&this.trigger.focus({preventScroll:!0}))}finishClose(){this.sheet.open||(this.trigger.setAttribute("aria-expanded","false"),this.options.onDialogChange(!1))}go(t){this.close(!1),Ri(t.target),this.layout(),Zr(),history.pushState({[Ii]:t.target.id},"",ar(window.location.href,t.target.id)),t.target.scrollIntoView({block:"start",behavior:"instant"});let n=t.target.getAttribute("tabindex");t.target.tabIndex=-1,t.target.focus({preventScroll:!0}),t.target.addEventListener("blur",()=>{n===null?t.target.removeAttribute("tabindex"):t.target.setAttribute("tabindex",n)},{once:!0}),this.sync(!0),this.remember()}remember(){this.lastPosition=Id(this.outline.main,this.readingLine)}queue(){this.queued||this.printing||this.destroyed||(this.queued=!0,requestAnimationFrame(()=>{this.queued=!1,this.sync(),this.remember()}))}destroy(){this.close(!1),this.destroyed=!0,window.removeEventListener("scroll",this.onScroll),window.removeEventListener("resize",this.onResize),window.removeEventListener("hashchange",this.onHash),window.removeEventListener("popstate",this.onHash),window.removeEventListener("beforeprint",this.beforePrint),window.removeEventListener("afterprint",this.afterPrint),this.outline.main.removeEventListener("toggle",this.onResize,!0),this.resizeObserver?.disconnect(),this.mutationObserver.disconnect();let t=document.documentElement;t.removeAttribute("data-surprise-reading"),t.style.paddingLeft=this.original.left,t.style.paddingRight=this.original.right,this.stopWatchingTop(),Ae.set("reading",0),Ae.setScrollGap(0),t.style.transition=this.original.transition,this.outline.main.style.maxWidth=this.original.maxWidth,this.host.remove(),this.pageStyle.remove()}};function Md(e){for(let n of document.querySelectorAll(`${ir}[${rr}]`))n.remove();if(document.querySelector(ir))return null;let t=Pi(document);return t?new Mi(t,e):null}function Hd(){for(let e of document.querySelectorAll(`style[${rr}="${Sd}"]`))e.remove()}var Hi="surprise-pages:read-aloud-rate",_d="surprise-pages:read-aloud-voice",sr=[1,1.25,1.5,2];function uu(e){let t=typeof e=="string"&&e.trim().length>0?Number(e):e;return sr.find(n=>n===t)??null}function Bd(e){return uu(e)??1}function Vd(e){let t=sr.findIndex(n=>n===e);return sr[(t+1)%sr.length]??1}function Ni(e){return`${e}×`}function Nd(e){let t=e.voiceURI.toLowerCase();return t.includes(".eloquence.")?0:t.includes(".super-compact.")?1:t.includes(".premium.")?4:t.includes(".enhanced.")||t.includes(".siri")?3:2}function Dd(e){return e.toLowerCase().replace("_","-").split("-")[0]??""}function Fd(e,t,n=null){let o=Dd(t),s=e.filter(f=>f.localService&&Dd(f.lang)===o);if(n!==null&&n.length>0){let f=s.find(C=>C.voiceURI===n);if(f!==void 0)return f}let d=null;for(let f of s){if(d===null){d=f;continue}let C=Nd(f)-Nd(d);(C>0||C===0&&f.default&&!d.default)&&(d=f)}return d}var pu=["h1","h2","h3","h4","h5","h6","p","li","blockquote","td","th","dt","dd","figcaption","summary","div","section","article","header","footer","main","aside","nav","ul","ol","table","thead","tbody","tr","figure","dl","hr","form","fieldset"],zd=pu.join(","),fu=new Set(["pre","svg","script","style","noscript","template"]);function qd(e,t){return fu.has(e)||t("hidden")!==null||t("aria-hidden")==="true"||t("data-clean-copy-ui")!==null||t("data-source-note")!==null||e==="del"&&t("data-surprise-redline")!==null}var hu="」』）)】］]〉》”’",$d="。！？!?";function Kd(e){let t=[],n=0,o=s=>{let d=n,f=s;for(;d<f&&/\s/.test(e.charAt(d));)d++;for(;f>d&&/\s/.test(e.charAt(f-1));)f--;f>d&&t.push({start:d,end:f}),n=s};for(let s=0;s<e.length;s++){let d=e.charAt(s);if(d===`
`){o(s+1);continue}if(!$d.includes(d))continue;let f=s+1;for(;f<e.length&&($d.includes(e.charAt(f))||hu.includes(e.charAt(f)));)f++;o(f),s=f-1}return o(e.length),t}var Di="surprise-read-aloud",_i="surprise-read-aloud-target",mu=`a[href],button,input,textarea,select,label,summary,video,audio,[contenteditable]:not([contenteditable='false']),[role='button'],[role='link'],[${Eo}]`,gu="input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='menu'],[role='menuitem'],[role='listbox'],[role='option'],[role='slider'],[role='tablist'],[role='tab'],[role='radiogroup']",Wd=4,vu=1500;function bu(){return typeof window.speechSynthesis<"u"&&typeof window.SpeechSynthesisUtterance<"u"}function wu(e,t){let n=e.ownerDocument,o=n.createTreeWalker(e,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(h){return h instanceof Element&&(qd(h.localName,A=>h.getAttribute(A))||h.matches(t))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}}),s=null,d=[],f="",C=h=>{for(let A=d.length-1;A>=0;A--){let N=d[A];if(N&&h>=N.start)return{node:N.node,offset:Math.min(h-N.start,N.node.length)}}return null};for(let h=o.nextNode();h!==null;h=o.nextNode()){if(h instanceof Element&&h.tagName==="BR"){f+=`
`;continue}if(!(h instanceof Text)||h.data.trim().length===0)continue;let A=h.parentElement;if(A===null||typeof A.getClientRects=="function"&&A.getClientRects().length===0)continue;let N=A.closest(zd)??e;N!==s&&(f.length>0&&(f+=`
`),s=N),d.push({node:h,start:f.length}),f+=h.data}let R=[];for(let h of Kd(f)){let A=C(h.start),N=C(h.end);if(!A||!N)continue;let te=n.createRange();te.setStart(A.node,A.offset),te.setEnd(N.node,N.offset),R.push({text:f.slice(h.start,h.end).replace(/\s+/g," "),range:te})}return R}function Bi(e,t,n){let o=0,s=e.length;for(;o<s;){let d=o+s>>1;yu(e[d]?.range,t,n)>0?o=d+1:s=d}return o<e.length?o:-1}function yu(e,t,n){if(e===void 0)return-1;try{return e.comparePoint(t,n)}catch{return-1}}function xu(e,t){if(typeof document.caretPositionFromPoint=="function"){let n=document.caretPositionFromPoint(e,t);return n===null?null:{node:n.offsetNode,offset:n.offset}}if(typeof document.caretRangeFromPoint=="function"){let n=document.caretRangeFromPoint(e,t);return n===null?null:{node:n.startContainer,offset:n.startOffset}}return null}function ku(e,t,n){for(let o of Array.from(e.getClientRects()))if(t>=o.left&&t<=o.right&&n>=o.top-Wd&&n<=o.bottom+Wd)return!0;return!1}function Ud(e){return e.metaKey||e.ctrlKey||e.altKey||e.shiftKey}var lr=class{constructor(t){this.options=t;this.sentences=[];this.listening=null;this.hoverFrame=0;this.hovered=-1;this.index=-1;this.run=0;this.pausedState=!1;this.style=null;this.utterance=null;this.voice=null;this.rate=Bd(Ct(Hi));window.addEventListener("pagehide",()=>this.stop())}get supported(){return bu()}get active(){return this.index>=0}get paused(){return this.active&&this.pausedState}toggle(){this.active?this.stop():this.start()}pause(){!this.active||this.pausedState||(this.pausedState=!0,window.speechSynthesis.pause(),this.options.onChange())}resume(){this.paused&&(this.pausedState=!1,window.speechSynthesis.resume(),this.utterance===null&&this.speak(this.index,this.run),this.options.onChange())}togglePause(){this.paused?this.resume():this.pause()}cycleRate(){this.rate=Vd(this.rate),Ht(Hi,String(this.rate)),this.active&&!this.pausedState&&this.restartCurrent(),this.options.onChange()}stop(){if(!this.active)return;this.run++;let t=this.pausedState;this.pausedState=!1,this.unlisten(),this.index=-1,this.sentences=[],this.utterance=null,this.supported&&(window.speechSynthesis.cancel(),t&&window.speechSynthesis.resume()),this.paint(null),this.options.onChange()}readFrom(t){if(!this.active){this.start(t);return}let n=Bi(this.sentences,t.startContainer,t.startOffset);n>=0&&this.seek(n)}step(t){if(!this.active)return;let n=this.index+t;n<0||n>=this.sentences.length||this.seek(n)}async start(t){if(!this.supported)return;let n=++this.run;if(this.pausedState=!1,this.sentences=wu(this.options.root(),this.options.ownChrome),this.sentences.length===0){this.options.onProblem(a("toolbox.readAloud.noText"));return}let o=Fd(await this.voices(),document.documentElement.lang||"ja",Ct(_d));if(n!==this.run)return;if(o===null){this.sentences=[],this.options.onProblem(a("toolbox.readAloud.noVoice"));return}this.voice=o;let s=t===void 0?-1:Bi(this.sentences,t.startContainer,t.startOffset),d=s>=0?s:this.firstVisible();this.listen(),this.index=d,this.speak(d,n),this.options.onChange()}async voices(){let t=window.speechSynthesis,n=t.getVoices();return n.length>0?n:new Promise(o=>{let s=()=>{t.removeEventListener("voiceschanged",s),o(t.getVoices())};t.addEventListener("voiceschanged",s),window.setTimeout(s,vu)})}firstVisible(){let t=this.options.coveredTop?.()??0,n=this.sentences.findIndex(o=>o.range.getBoundingClientRect().bottom>t);return n<0?0:n}seek(t){!this.active||t===this.index||(this.index=t,this.paint(this.sentences[t]?.range??null),this.clearTarget(),this.pausedState?(this.run++,this.utterance=null,window.speechSynthesis.cancel()):this.restartCurrent(),this.options.onChange())}restartCurrent(){let t=++this.run;this.utterance=null,window.speechSynthesis.cancel(),this.speak(this.index,t)}speak(t,n){if(n!==this.run||this.pausedState)return;let o=this.sentences[t];if(!o||!o.range.startContainer.isConnected){this.stop();return}this.index=t;let s=new SpeechSynthesisUtterance(o.text);s.voice=this.voice,s.lang=this.voice?.lang??"ja-JP",s.rate=this.rate,s.onend=()=>{if(!(n!==this.run||this.utterance!==s)){if(this.utterance=null,t+1>=this.sentences.length){this.stop();return}this.speak(t+1,n)}},s.onerror=d=>{d.error==="canceled"||d.error==="interrupted"||n!==this.run||this.utterance!==s||(this.stop(),this.options.onProblem(a("toolbox.readAloud.stopped")))},this.paint(o.range),this.utterance=s,window.speechSynthesis.speak(s)}listen(){this.unlisten();let t=new AbortController;this.listening=t;let n={signal:t.signal};document.addEventListener("click",o=>this.onPress(o),n),document.addEventListener("keydown",o=>this.onKey(o),n),document.addEventListener("pointermove",o=>this.onPoint(o),n),document.addEventListener("pointerleave",()=>this.clearTarget(),n),window.addEventListener("scroll",()=>this.clearTarget(),{...n,passive:!0})}unlisten(){this.listening?.abort(),this.listening=null,this.hoverFrame!==0&&window.cancelAnimationFrame(this.hoverFrame),this.hoverFrame=0,this.clearTarget()}sentenceUnder(t,n,o){if(!(o instanceof Element)||!this.options.root().contains(o)||o.closest(mu)!==null||o.closest(this.options.ownChrome)!==null)return-1;let s=xu(t,n);if(s===null)return-1;let d=Bi(this.sentences,s.node,s.offset),f=this.sentences[d];return f!==void 0&&ku(f.range,t,n)?d:-1}onPress(t){if(t.defaultPrevented||t.button!==0||Ud(t))return;let n=window.getSelection();if(n!==null&&!n.isCollapsed)return;let o=this.sentenceUnder(t.clientX,t.clientY,t.target);o>=0&&this.seek(o)}onKey(t){if(t.defaultPrevented||Ud(t)||t.isComposing||t.key!=="ArrowLeft"&&t.key!=="ArrowRight")return;let n=t.composedPath()[0];n instanceof Element&&n.closest(gu)!==null||(t.preventDefault(),this.step(t.key==="ArrowRight"?1:-1))}onPoint(t){if(t.pointerType!=="mouse")return;let{clientX:n,clientY:o,target:s}=t;this.hoverFrame===0&&(this.hoverFrame=window.requestAnimationFrame(()=>{if(this.hoverFrame=0,!this.active)return;let d=this.sentenceUnder(n,o,s);this.showTarget(d===this.index?-1:d)}))}showTarget(t){if(t===this.hovered)return;this.hovered=t;let n=typeof CSS<"u"&&"highlights"in CSS?CSS.highlights:null,o=this.sentences[t]?.range;n===null||typeof Highlight>"u"||(o===void 0?n.delete(_i):n.set(_i,new Highlight(o)))}clearTarget(){this.showTarget(-1)}paint(t){let n=typeof CSS<"u"&&"highlights"in CSS?CSS.highlights:null;if(t===null){n?.delete(Di),this.style?.remove(),this.style=null;return}n!==null&&typeof Highlight<"u"&&(this.style===null&&(this.style=document.createElement("style"),this.style.textContent=`::highlight(${Di}) { background-color: color-mix(in srgb, currentColor 16%, transparent); }::highlight(${_i}) { background-color: color-mix(in srgb, currentColor 8%, transparent); }`,document.head.append(this.style)),n.set(Di,new Highlight(t)));let o=t.getBoundingClientRect();if(o.height===0)return;let s=this.options.coveredTop?.()??0,d=Math.min(window.innerHeight,this.options.coveredBottom?.()??window.innerHeight);(o.top<s||o.bottom>d)&&window.scrollBy({top:o.top-s-Math.max(0,d-s)/3,behavior:"smooth"})}};var $=ct(),Qd="surprise-pages:comments:width",p={personal:!1,slug:"",visibility:"internal",viewer:null,get comments(){return z.state.comments},set comments(e){z.state.comments=e},get anchored(){return b.state.anchored},set anchored(e){b.state.anchored=e},get expanded(){return z.state.expanded},set expanded(e){z.state.expanded=e},currentVersion:null,favorite:null,get outcomes(){return z.state.outcomes},set outcomes(e){z.state.outcomes=e},get outcomesFor(){return z.state.outcomesFor},set outcomesFor(e){z.state.outcomesFor=e},get review(){return z.state.review},set review(e){z.state.review=e},get filter(){return z.state.filter},set filter(e){z.state.filter=e},get sort(){return z.state.sort},set sort(e){z.state.sort=e},get picked(){return z.state.picked},set picked(e){z.state.picked=e},open:!1,width:Ha,get activeId(){return b.state.activeId},set activeId(e){b.state.activeId=e},get editor(){return z.state.editor},set editor(e){z.state.editor=e},get confirmDeleteId(){return z.state.confirmDeleteId},set confirmDeleteId(e){z.state.confirmDeleteId=e},features:{tools:!1,history:!1,sharing:!1,edit:!1,write:!1},view:"comments",get versions(){return Y.state.versions},set versions(e){Y.state.versions=e},get moreVersions(){return Y.state.moreVersions},set moreVersions(e){Y.state.moreVersions=e},get compare(){return Y.state.compare},set compare(e){Y.state.compare=e},get access(){return le.state.access},set access(e){le.state.access=e},get accessEmail(){return le.state.accessEmail},set accessEmail(e){le.state.accessEmail=e},get accessInvited(){return le.state.accessInvited},set accessInvited(e){le.state.accessInvited=e},get accessScopeTo(){return le.state.accessScopeTo},set accessScopeTo(e){le.state.accessScopeTo=e},get accessRevokeId(){return le.state.accessRevokeId},set accessRevokeId(e){le.state.accessRevokeId=e},get accessApproveId(){return le.state.accessApproveId},set accessApproveId(e){le.state.accessApproveId=e},busy:!1,get origin(){return qe.state.origin},set origin(e){qe.state.origin=e},get originJob(){return qe.state.originJob},set originJob(e){qe.state.originJob=e}},ye=null,fe=null,rn=null,no=null,tn=null,ft=null,St=null,to=null,Lt=null,dr=null,Ln=null,At=null,cr=null,nn=null,dt=[],An=new Map,Fi=new Map,wt=!1,_t=!1,on=null,Gd=null,fr=null,le=Rl({get pushToast(){return oo},get showError(){return yt},get barLink(){return dr},get narrowLink(){return Lt},get setOpen(){return b.setOpen},get handleFailure(){return Bt},get render(){return Ke},get renderPanelBody(){return qi},get actionButton(){return hr},state:{get view(){return p.view},set view(e){p.view=e},get busy(){return p.busy},set busy(e){p.busy=e},get slug(){return p.slug},set slug(e){p.slug=e},get features(){return p.features},set features(e){p.features=e},get visibility(){return p.visibility},set visibility(e){p.visibility=e},get personal(){return p.personal},set personal(e){p.personal=e}}}),qe=yl({get loadedVersion(){return Y.loadedVersion},get showError(){return yt},get render(){return Ke},get showNotice(){return le.showNotice},get clearCompare(){return Y.clearCompare},get copyText(){return le.copyText},get pageUrl(){return le.pageUrl},get isComparing(){return Y.isComparing},get exitCompare(){return Y.exitCompare},get setOpen(){return b.setOpen},get handleFailure(){return Bt},get CHANGE_KINDS(){return Y.CHANGE_KINDS},get actionButton(){return hr},get bar(){return fe},get root(){return ye},get isNarrow(){return b.isNarrow},get tokenPx(){return b.tokenPx},state:{get features(){return p.features},set features(e){p.features=e},get visibility(){return p.visibility},set visibility(e){p.visibility=e},get slug(){return p.slug},set slug(e){p.slug=e},get currentVersion(){return p.currentVersion},set currentVersion(e){p.currentVersion=e},get compare(){return p.compare},set compare(e){p.compare=e},get view(){return p.view},set view(e){p.view=e},get busy(){return p.busy},set busy(e){p.busy=e}}}),Y=nl({get handleFailure(){return Bt},get render(){return Ke},get setOpen(){return b.setOpen},get hidePopover(){return b.hidePopover},get hideSelectionBar(){return b.hideSelectionBar},get hideMarkPeek(){return b.hideMarkPeek},get pushToast(){return oo},get fillOutcomes(){return z.fillOutcomes},get syncMarks(){return b.syncMarks},get outcomeTargetVersion(){return z.outcomeTargetVersion},get closeOriginCompare(){return qe.closeOriginCompare},get renderPanelBody(){return qi},get root(){return ye},get isNarrow(){return b.isNarrow},get originDiffError(){return qe.originDiffError},set originDiffError(e){qe.originDiffError=e},get outcomeOf(){return z.outcomeOf},get appendQuoteStory(){return z.appendQuoteStory},get topLevel(){return z.topLevel},state:{get slug(){return p.slug},set slug(e){p.slug=e},get view(){return p.view},set view(e){p.view=e},get outcomesFor(){return p.outcomesFor},set outcomesFor(e){p.outcomesFor=e},get outcomes(){return p.outcomes},set outcomes(e){p.outcomes=e},get features(){return p.features},set features(e){p.features=e},get comments(){return p.comments},set comments(e){p.comments=e}}}),z=wl({get draft(){return b.draft},set draft(e){b.draft=e},get render(){return Ke},get handleFailure(){return Bt},get showNotice(){return le.showNotice},get refresh(){return mr},get loadedVersion(){return Y.loadedVersion},get ensureVersions(){return Y.ensureVersions},get findVersion(){return Y.findVersion},get pushToast(){return oo},get setOpen(){return b.setOpen},get startCompare(){return Y.startCompare},get gotoChange(){return Y.gotoChange},get afterChange(){return lc},get avatarFor(){return Zd},get actionButton(){return hr},get iconAction(){return tc},get prioritySendRow(){return nc},get canSend(){return pr},get priorityPicker(){return Cu},get textArea(){return oc},get selectFromCard(){return b.selectFromCard},get priorityTag(){return ec},get copyText(){return le.copyText},get pageUrl(){return le.pageUrl},get showError(){return yt},get hidePopover(){return b.hidePopover},get hideSelectionBar(){return b.hideSelectionBar},get closeComposeDock(){return b.closeComposeDock},get updateToast(){return Lu},get closeHandlers(){return Fi},get isNarrow(){return b.isNarrow},get flashCard(){return b.flashCard},get focusCard(){return b.focusCard},get draftFocused(){return b.draftFocused},set draftFocused(e){b.draftFocused=e},get openComposeDock(){return b.openComposeDock},get LIST_MENU_MARK(){return $i},get listMenuOpen(){return _t},set listMenuOpen(e){_t=e},get listMenuButton(){return ft},get pickButton(){return St},get exportTools(){return to},get listMenuBox(){return Ln},get listBox(){return At},get applyFocus(){return b.applyFocus},get dockQuote(){return b.dockQuote},set dockQuote(e){b.dockQuote=e},get discardDraft(){return b.discardDraft},get updateScrollPadding(){return b.updateScrollPadding},get pickBar(){return cr},state:{get viewer(){return p.viewer},set viewer(e){p.viewer=e},get busy(){return p.busy},set busy(e){p.busy=e},get slug(){return p.slug},set slug(e){p.slug=e},get currentVersion(){return p.currentVersion},set currentVersion(e){p.currentVersion=e},get compare(){return p.compare},set compare(e){p.compare=e},get features(){return p.features},set features(e){p.features=e},get view(){return p.view},set view(e){p.view=e},get activeId(){return p.activeId},set activeId(e){p.activeId=e},get anchored(){return p.anchored},set anchored(e){p.anchored=e},get open(){return p.open},set open(e){p.open=e}}}),ze=new lr({root:()=>document.querySelector("main")??document.body,ownChrome:Xa,onChange:()=>Ke(),onProblem:e=>{oo(e,"failure")},coveredTop:()=>Ae.total(),coveredBottom:()=>p.open&&b.isNarrow()&&rn!==null?rn.getBoundingClientRect().top:window.innerHeight});function ur(){return!document.body.hasAttribute("data-deck")}var Zn=null,b=Sl({get isComparing(){return Y.isComparing},get inList(){return z.inList},get listBox(){return At},get picking(){return z.picking},get matchesFilter(){return z.matchesFilter},get render(){return Ke},get avatarFor(){return Zd},get visibleForList(){return z.visibleForList},get priorityTag(){return ec},get appendQuoteStory(){return z.appendQuoteStory},get editorBox(){return z.editorBox},get repliesOf(){return z.repliesOf},get isMine(){return z.isMine},get actionButton(){return hr},get iconAction(){return tc},get panel(){return rn},get afterChange(){return lc},get refresh(){return mr},get readingNavigation(){return fr},get originalPaddingRight(){return Gd},set originalPaddingRight(e){Gd=e},get root(){return ye},get STORAGE_WIDTH(){return Qd},get watchChanges(){return Y.watchChanges},get moreMenuOpen(){return wt},set moreMenuOpen(e){wt=e},get moreButton(){return on},get prioritySendRow(){return nc},get submitDraft(){return z.submitDraft},get canSend(){return pr},get textArea(){return oc},get canAct(){return z.canAct},get readOnly(){return()=>p.viewer!==null&&!p.features.write},get copyText(){return le.copyText},get showError(){return yt},get sheetComposer(){return z.sheetComposer},readFrom:e=>!ze.supported||!ur()?!1:(ze.readFrom(e),!0),canReadFrom:()=>ze.supported&&ur(),state:{get comments(){return p.comments},set comments(e){p.comments=e},get filter(){return p.filter},set filter(e){p.filter=e},get open(){return p.open},set open(e){p.open=e},get editor(){return p.editor},set editor(e){p.editor=e},get confirmDeleteId(){return p.confirmDeleteId},set confirmDeleteId(e){p.confirmDeleteId=e},get width(){return p.width},set width(e){p.width=e},get view(){return p.view},set view(e){p.view=e}}});function Zd(e){let t=Ja(e.name);if(e.image===null||!(e.image.startsWith("https://")||$s(e.image)))return t;let n=i("img","avatar");return n.src=e.image,n.alt="",n.referrerPolicy="no-referrer",n.addEventListener("error",()=>n.replaceWith(t),{signal:$.signal}),n}function zi(e){let t=Mt[e],n=i("span","dot-label");return n.appendChild(i("span",t.dotClass)),n.appendChild(document.createTextNode(t.label)),n}function ec(e){if(e==="good"){let o=i("span","tag");return o.title=a("toolbox.compose.good"),o.appendChild(oe(mn,se.small)),o}let t=Mt[e],n=i("span","tag");return n.title=t.description,n.appendChild(zi(e)),n}function hr(e,t,n,o,s){let d=i("button",o===void 0?"action":`action ${o}`);return d.type="button",s!==void 0&&d.setAttribute("aria-label",s),d.appendChild(oe(t,se.small)),d.appendChild(i("span",void 0,e)),d.addEventListener("click",f=>{f.stopPropagation(),n()},{signal:$.signal}),d}function tc(e,t,n,o){let s=i("button",o===void 0?"icon-button":`icon-button ${o}`);return s.type="button",s.title=e,s.setAttribute("aria-label",e),s.appendChild(oe(t,se.medium)),s.addEventListener("click",d=>{d.stopPropagation(),n()},{signal:$.signal}),s}function Cu(e,t){let n=i("div","picker");if(e==="good"){let o=i("span","tag");o.title=a("toolbox.compose.good"),o.appendChild(oe(mn,se.small)),n.appendChild(o)}for(let o of Vr){let s=Mt[o],d=i("button",o===e?"pill is-active":"pill");d.type="button",d.title=s.description,d.appendChild(zi(o)),d.addEventListener("click",f=>{f.stopPropagation(),t(o)},{signal:$.signal}),n.appendChild(d)}return n}function nc(e){let t=i("div","send-row"),n=i("div","send-fixes"),o=[];for(let d of Vr){let f=Mt[d],C=i("button","send-pill");C.type="button",C.title=a("toolbox.compose.sendAs",{priority:f.description}),C.setAttribute("aria-label",a("toolbox.compose.sendAsNamed",{label:f.label,priority:f.description})),C.appendChild(zi(d));let R=Su(d);R!==null&&(C.appendChild(i("span","hint-bubble",R)),C.setAttribute("aria-keyshortcuts",Eu(d))),C.addEventListener("click",h=>{h.stopPropagation(),!C.disabled&&e(d)},{signal:$.signal}),n.appendChild(C),o.push(C)}t.appendChild(n);let s=i("button","icon-button");return s.type="button",s.setAttribute("aria-label",a("toolbox.compose.sendGood")),s.appendChild(oe(mn,se.small)),b.hasFinePointer()&&s.appendChild(i("span","hint-bubble",a("toolbox.compose.sendGood"))),s.addEventListener("click",d=>{d.stopPropagation(),e("good")},{signal:$.signal}),t.appendChild(s),{row:t,setEnabled(d){for(let f of o)f.disabled=!d}}}function pr(e){return e.trim().length>0}function Eu(e){return`${b.appleKeys()?"Control":"Control+Alt"}+${e[0].toUpperCase()}`}function Su(e){return b.hasFinePointer()?`${b.appleKeys()?"control":"Ctrl + Alt"} + ${e[0].toUpperCase()}`:null}function oc(e,t,n,o={}){let s=i("textarea");return s.value=e,s.placeholder=t,s.addEventListener("input",()=>n(s.value),{signal:$.signal}),s.addEventListener("keydown",d=>{let f={code:d.code,key:d.key,metaKey:d.metaKey,ctrlKey:d.ctrlKey,altKey:d.altKey,shiftKey:d.shiftKey,isComposing:d.isComposing},C=b.appleKeys();if(o.onPriority!==void 0){let h=Ka(f,C);if(h!==null){d.preventDefault(),pr(s.value)&&o.onPriority(h);return}}if(o.quoteWhenEmpty===void 0||pr(s.value)||!Wa(f,C))return;let R=o.quoteWhenEmpty();R===null||R.length===0||(d.preventDefault(),le.copyQuote(R))},{signal:$.signal}),s.addEventListener("click",d=>d.stopPropagation(),{signal:$.signal}),s}var Yd=0;function Tu(){return Yd+=1,`t${Yd}`}function rc(e,t){let n=Tl(t);n!==null&&$.timeout(()=>{dt=Yo(dt,e),Pn()},n)}function oo(e,t,n){let o=Tu();return dt=Ll(dt,{id:o,state:t,text:e}),n!==void 0&&An.set(o,n),Pn(),rc(o,t),o}function Lu(e,t,n,o){Pl(dt,e)!==null&&(dt=Al(dt,e,t,n),o===void 0?An.delete(e):An.set(e,o),Pn(),rc(e,t))}function yt(e){oo(e,"failure")}function Bt(e){let t=e.message;e.status===401&&(p.viewer=null,Gi(),t=a("toolbox.common.sessionExpired")),yt(t),Ke()}function ic(e){if(p.viewer=e.viewer,p.comments=e.comments,p.features=e.features,p.currentVersion=e.currentVersion,p.favorite=e.favorite,pc(),Wu(e.currentVersion),Yi(),Gi(),p.picked!==null){let o=new Set(e.comments.map(s=>s.id));for(let s of p.picked)o.has(s)||p.picked.delete(s)}if(p.outcomesFor!==null&&e.currentVersion!==null&&Jt(p.outcomesFor,e.currentVersion)||(p.outcomes=new Map,p.outcomesFor=null),!p.features.tools){Ti(!1),yt(a("toolbox.common.sessionExpired")),Ke();return}Ti(!0),b.syncMarks(!0);let n=z.topLevel().filter(o=>o.resolvedAt===null).length;if(hl(b.sheetOpenPending,n,b.isNarrow())){b.setOpen(!0),z.fillOutcomes(z.outcomesToVersion()),qe.probeOriginOnce();return}Ke(),z.fillOutcomes(z.outcomesToVersion()),qe.probeOriginOnce()}async function mr(e={quiet:!1}){if($.disposed||vo())return!0;let t=await wn(p.slug);return $.disposed||vo()?!0:t.ok?(ic(t.value),!0):((!e.quiet||t.status===401)&&Bt(t),!1)}var ac=kl({refresh:mr,editing:()=>vo()||Cn()||jn(),lifetime:$});function sc(){let e=/^#c=([0-9a-f-]{36})$/i.exec(window.location.hash);if(e===null)return;let t=e[1];if(!p.comments.some(o=>o.id===t))return;p.view="comments";let n=p.comments.find(o=>o.id===t);n!==void 0&&(p.filter=xn(n)),p.open||b.setOpen(!0),b.selectFromCard(t),b.focusCard(t)}function lc(e){return e.ok?!0:(Bt(e),!1)}function Au(){let e=ut(new Date().toISOString()),t=Wo(z.topLevel(),"oldest",new Map),n=t.filter(s=>s.resolvedAt===null).length,o=[`# コメント一覧: ${p.slug}`,"",`- ページ: ${window.location.origin}${window.location.pathname}`,`- 書き出し: ${e}`,`- 件数: 未解決 ${n} 件 / 全 ${t.length} 件`];for(let s of oa){let d=t.filter(C=>C.priority===s);if(d.length===0)continue;let f=s==="good"?`## いいね ${d.length} 件`:`## ${Mt[s].label}（${bo(`toolbox.priority.${s}`)}） ${d.length} 件`;o.push("",f),d.forEach((C,R)=>{let h=C.resolvedAt===null?"未解決":"解決済",A=C.quote===null?"（引用なし）":`「${C.quote}」`;o.push("",`### ${R+1}. [${h}] ${A}`),o.push(`- ${C.author.name} / ${ut(C.createdAt)}`),C.body.length>0&&o.push("",C.body);for(let N of z.repliesOf(C.id))o.push("",`> **${N.author.name}**: ${N.body.replace(/\n/g," ")}`)})}return`${o.join(`
`)}
`}function Pu(){let e=p.slug.replace(/\//g,"-");$n(`comments-${e}.md`,"text/markdown",Au())}function Ru(){let e=p.slug.replace(/\//g,"-"),t={page:p.slug,exportedAt:new Date().toISOString(),comments:p.comments};$n(`comments-${e}.json`,"application/json",JSON.stringify(t,null,2))}function Pn(){if(nn!==null){nn.replaceChildren();for(let e of dt){let t=i("div",`toast is-${e.state}`);t.appendChild(i("span","toast-text",e.text));let n=An.get(e.id);if(e.state==="failure"&&n!==void 0){let s=i("button","toast-retry");s.type="button",s.textContent=a("toolbox.common.retry"),s.addEventListener("click",()=>{dt=Yo(dt,e.id),An.delete(e.id),Pn(),n()},{signal:$.signal}),t.appendChild(s)}let o=i("button","icon-button");o.type="button",o.title=a("toolbox.common.close"),o.appendChild(oe(Je,se.small)),o.addEventListener("click",()=>{let s=Fi.get(e.id);dt=Yo(dt,e.id),An.delete(e.id),Fi.delete(e.id),Pn(),s!==void 0&&s()},{signal:$.signal}),t.appendChild(o),nn.appendChild(t)}Ou()}}function Ou(){if(ye===null||nn===null)return;let e=ye.host;if(!(e instanceof HTMLElement))return;let t=dt.length===0?0:nn.offsetHeight;e.style.setProperty("--toast-lane",`${t}px`)}var $i="list-menu-hit";function qi(){if(At!==null){if(p.view==="versions"){At.replaceChildren(Y.versionsView());return}if(p.view==="changes"){At.replaceChildren(Y.changesView());return}if(p.view==="access"){At.replaceChildren(le.accessView());return}if(p.view==="origin"){At.replaceChildren(qe.originView());return}z.renderList()}}var Iu={comments:a("toolbox.panel.comments"),changes:a("toolbox.panel.changes"),versions:a("toolbox.panel.versions"),access:a("toolbox.panel.access"),origin:a("toolbox.panel.origin")};function Ke(){if($.disposed)return;p.view==="access"&&!le.canManageAccess()&&(p.view="comments"),p.view==="origin"&&(p.origin===null||!p.origin.stale||p.originJob!==null)&&(p.view="comments"),b.syncMarks();let e=z.topLevel().filter(n=>n.resolvedAt===null).length;Hu(e),Y.renderCompareBar(),Y.applyCompareOffset();let t={menu:wt,dock:b.isDocked(),peek:b.isPeeking(),selection:b.selectionBar!==null&&!b.selectionBar.hidden};if(fe!==null&&(fe.hidden=!dl(t,p.open&&b.isNarrow())),qe.renderOriginHint(),wt&&on!==null&&fe!==null&&b.popover!==null){let n=on.getBoundingClientRect(),o=fe.getBoundingClientRect();b.placePopover({left:n.left,width:n.width,top:o.top,bottom:o.bottom}),b.popover.style.left=`${Math.max(Co.edge,Math.round(n.right-b.popover.offsetWidth))}px`}rn!==null&&(rn.hidden=!p.open,b.applyPanelShape()),no!==null&&(no.textContent=Iu[p.view]),p.view!=="comments"&&(_t=!1),p.view!=="comments"&&z.picking()&&(p.picked=null),tn!==null&&(tn.hidden=p.view!=="comments"),z.paintPickButton(),z.renderPickBar(),Lt!==null&&(Lt.hidden=!b.isNarrow(),Yt(Lt,le.linkCopied)),Ln!==null&&p.view!=="comments"&&(Ln.hidden=!0),b.peek.open&&!b.peekDragging&&!b.peekHandoff&&!b.peekSliding&&b.renderPeek(),Pn(),p.view==="comments"&&z.renderListMenu(),qi()}function Tt(e,t,n){let o=i("button","bar-button");return o.type="button",o.title=e,o.setAttribute("aria-label",e),o.appendChild(oe(t,se.medium)),o.addEventListener("click",n,{signal:$.signal}),o}async function Ki(e){ye===null||Cn()||(ze.stop(),fr?.close(!1),Y.isComparing()&&Y.exitCompare(),b.setOpen(!1),await id({pageSlug:p.slug,host:ye,notify:t=>le.showNotice(t),fail:t=>yt(t),restoreFocus:()=>fe?.querySelector("[data-editor-trigger]")?.focus({preventScroll:!0}),onSaved:({baseVersionId:t})=>z.stashEditReview(t),onClosed:()=>ac.resume(),presenter:e}))}async function Mu(){ye===null||Cn()||jn()||(fr?.close(!1),Y.isComparing()&&Y.exitCompare(),b.setOpen(!1),b.hideSelectionBar(),await ld({pageSlug:p.slug,notify:e=>yt(e),fail:e=>yt(e),prepare:()=>{b.dropDraft(),qn()}}),Ke())}function Hu(e){if(fe===null)return;if(fe.replaceChildren(),jn()){let o=Tt(a("notes.entry.done"),lt,()=>{dd()});o.setAttribute("data-note-done",""),fe.appendChild(o);return}let t=Tt(a("toolbox.bar.comments"),So,()=>{if(p.open&&p.view==="comments"){b.setOpen(!1);return}p.view="comments",b.setOpen(!0)});p.open&&p.view==="comments"&&(t.className="bar-button is-open"),e>0&&(t.appendChild(i("span","bar-count",String(e))),t.setAttribute("aria-label",a("toolbox.bar.commentsCount",{count:e}))),fe.appendChild(t);let n=Xt()?.present??null;if(n!==null&&fe.appendChild(Tt(a("toolbox.bar.present"),zr,()=>n.click())),fe.appendChild(i("span","bar-divider")),p.features.edit&&Y.loadedVersion===null){let o=Tt(a("toolbox.bar.edit"),hn,()=>{Ki()});if(o.setAttribute("data-editor-trigger",""),fe.appendChild(o),sd()){let s=Tt(a("notes.entry.open"),ad,()=>{Mu()});s.setAttribute("data-note-trigger",""),fe.appendChild(s)}}if(p.originJob!==null)if(p.originJob.status==="running"){let o=i("a","bar-status");o.href=p.originJob.url,o.target="_blank",o.rel="noopener noreferrer",o.textContent=a("toolbox.bar.importing"),o.title=p.originJob.url,fe.appendChild(o)}else{fe.appendChild(i("span","bar-status",a("toolbox.common.newVersion")));let o=i("button","bar-status is-action");o.type="button",o.textContent=a("toolbox.bar.reload"),o.addEventListener("click",()=>{Wn(),window.location.reload()},{signal:$.signal}),fe.appendChild(o)}if(ze.supported&&ur()&&ze.active){let o=cc(),s=Tt(o.label,o.icon,()=>{o.run(),fe?.querySelector("[data-read-aloud-pause]")?.focus({preventScroll:!0})});s.setAttribute("data-read-aloud-pause",""),fe.appendChild(s);let d=Tt(a("toolbox.bar.stopReading"),Vn,()=>ze.toggle());d.setAttribute("aria-pressed","true"),fe.appendChild(d);let f=i("button","bar-status is-action",Ni(ze.rate));f.type="button",f.title=a("toolbox.bar.rateTitle"),f.setAttribute("aria-label",a("toolbox.bar.rateLabel",{rate:Ni(ze.rate)})),f.addEventListener("click",()=>ze.cycleRate(),{signal:$.signal}),fe.appendChild(f)}dr=Tt(a("toolbox.common.copyLink"),Gt,()=>{le.copyPageUrl()}),Yt(dr,le.linkCopied),fe.appendChild(dr),on=dc().length>0?Nu():null,on!==null?fe.appendChild(on):wt&&b.hidePopover()}function Wi(){if(Reflect.get(document,"prerendering")===!0){document.addEventListener("prerenderingchange",()=>Wi(),{once:!0});return}if(Js(Ct(qs)))return;let e=Ks(p.slug);if(Fn(e)!==null)return;if(bn(e,"1"),p.viewer!==null&&p.viewer.kind==="member"){p.features.write&&as(p.slug);return}if(p.visibility!=="public")return;let t=document.title.trim(),n=window.location.pathname,o=Us(Gs(Ct(oi)),{href:n,title:t.length>0?t:n},new Date().toISOString());Ht(oi,Ys(o))}var Ui="bar-more";function dc(){let e=[],t=[];p.features.history&&!(Rn?.versionShowing()??!1)&&e.push({label:a("toolbox.bar.history"),icon:ha,run:()=>{Y.openHistory()}}),qe.originEntryAllowed()&&p.origin!==null&&p.origin.stale&&p.originJob===null&&e.push({label:document.body.hasAttribute("data-deck")?a("toolbox.bar.deckOrigin"):a("toolbox.bar.origin"),icon:To,run:()=>qe.openOriginConfirm()}),le.canManageAccess()&&e.push({label:a("toolbox.bar.access"),icon:Ao,run:()=>{le.openAccess()}});let n=p.currentVersion;le.canManageAccess()&&document.body.hasAttribute("data-deck")&&Y.loadedVersion===null&&n!==null&&e.push({label:a("toolbox.bar.duplicateDeck"),icon:gn,run:()=>{Yl(p.slug,n,yt)}});let o=Xt();if(o!==null){o.presenter!==null&&t.push({label:a("decks.presentLaunch.presenter"),icon:Po,run:()=>ed(()=>fe?.querySelector(`.${Ui}`)?.focus({preventScroll:!0}))});let d=o.overview;d!==null&&t.push({label:o.overviewOpen?a("toolbox.bar.overviewClose"):a("toolbox.bar.overview"),icon:Sa,run:()=>d.click()});let f=o.notes;f!==null&&t.push({label:o.notesHidden?a("toolbox.bar.notesShow"):a("toolbox.bar.notesHide"),icon:Ta,run:()=>f.click()})}ze.supported&&ur()&&(ze.active&&t.push(cc()),t.push({label:ze.active?a("toolbox.bar.stopReading"):a("toolbox.bar.readAloud"),icon:Vn,run:()=>ze.toggle()}));let s=[];return e.length>0&&s.push({id:"page",rows:e}),t.length>0&&s.push({id:"reading",rows:t}),s}function cc(){return{label:a(ze.paused?"toolbox.bar.resumeReading":"toolbox.bar.pauseReading"),icon:ze.paused?zr:La,run:()=>ze.togglePause()}}function Nu(){let e=Tt(a("toolbox.bar.more"),Pa,()=>Bu());return e.classList.add(Ui),wt&&e.classList.add("is-open"),e.setAttribute("aria-haspopup","menu"),e.setAttribute("aria-expanded",wt?"true":"false"),e}function Du(){let e=[];for(let t of dc()){let n=i("div","menu-group");n.dataset.section=t.id;for(let o of t.rows){let s=i("button","button menu-row");s.type="button",s.appendChild(oe(o.icon,se.medium)),s.appendChild(i("span","menu-row-label",o.label)),s.addEventListener("click",()=>{b.hidePopover(),o.run()},{signal:$.signal}),n.appendChild(s)}e.push(n)}return e}function _u(){b.popover===null||on===null||(b.hidePopover(),b.hideSelectionBar(),wt=!0,b.popover.className="popover is-compact is-menu",b.nameSurface(b.popover,a("toolbox.bar.more")),b.popover.replaceChildren(...Du()),Ke())}function Bu(){if(wt){b.hidePopover();return}_u()}function Vu(){let e=i("aside","panel");e.setAttribute("aria-labelledby","panel-title"),e.style.width=`${p.width}px`;let t=i("div","grip");t.addEventListener("pointerdown",C=>{C.preventDefault(),t.setPointerCapture(C.pointerId);let R=A=>b.setWidth(window.innerWidth-A.clientX),h=()=>{t.removeEventListener("pointermove",R),t.removeEventListener("pointerup",h)};t.addEventListener("pointermove",R,{signal:$.signal}),t.addEventListener("pointerup",h,{signal:$.signal})},{signal:$.signal}),e.appendChild(t);let n=i("div","sheet-grab-area");n.appendChild(i("div","peek-grab")),b.attachSheetDrag(n),e.appendChild(n);let o=i("div","panel-head");no=i("h2","panel-title",a("toolbox.panel.comments")),no.id="panel-title",o.appendChild(no),o.appendChild(i("span","spacer")),tn=i("span","head-tools"),ft=i("button",`icon-button ${$i}`),ft.type="button",ft.title=a("toolbox.list.menu"),ft.setAttribute("aria-label",a("toolbox.list.menu")),ft.setAttribute("aria-haspopup","menu"),ft.setAttribute("aria-expanded","false"),ft.appendChild(oe(ga,se.medium)),ft.addEventListener("click",C=>{C.stopPropagation(),_t=!_t,Ke()},{signal:$.signal}),tn.appendChild(ft),St=i("button","icon-button"),St.type="button",St.title=a("toolbox.list.pick"),St.setAttribute("aria-label",a("toolbox.list.pick")),St.setAttribute("aria-pressed","false"),St.appendChild(oe(va,se.medium)),St.addEventListener("click",C=>{C.stopPropagation(),z.picking()?z.stopPicking():z.startPicking()},{signal:$.signal}),tn.appendChild(St),to=i("span","head-tools");let s=i("button","icon-button");s.type="button",s.title=a("toolbox.panel.exportMarkdown"),s.appendChild(oe(ua,se.medium)),s.addEventListener("click",()=>Pu(),{signal:$.signal}),to.appendChild(s);let d=i("button","icon-button");d.type="button",d.title=a("toolbox.panel.exportJson"),d.appendChild(oe(fa,se.medium)),d.addEventListener("click",()=>Ru(),{signal:$.signal}),to.appendChild(d),tn.appendChild(to),o.appendChild(tn),Lt=i("button","icon-button"),Lt.type="button",Yt(Lt,le.linkCopied),Lt.addEventListener("click",()=>{le.copyPageUrl()},{signal:$.signal}),o.appendChild(Lt);let f=i("button","icon-button");return f.type="button",f.title=a("toolbox.common.close"),f.appendChild(oe(Je,se.medium)),f.addEventListener("click",()=>b.setOpen(!1),{signal:$.signal}),o.appendChild(f),e.appendChild(o),Ln=i("div",$i),Ln.hidden=!0,e.appendChild(Ln),At=i("div","list"),e.appendChild(At),cr=i("div","pick-bar"),cr.hidden=!0,e.appendChild(cr),e}function Fu(){let e=o=>o instanceof Element&&o.closest(bt)!==null;document.addEventListener("click",o=>{let s=Mo(o.target);if(s!==null){let C=s.dataset.commentId;if(C===void 0)return;o.preventDefault(),b.selectFromMark(C,o);return}let d=e(o.target);if(b.peek.open){El(b.peek,o,d).open||b.hideMarkPeek();return}let f=o.composedPath().some(C=>C instanceof Element&&C.classList.contains(Ui));if(wt&&!f){b.hidePopover();return}_t&&!z.onListMenu(o)&&(_t=!1,Ke()),!d&&b.popover!==null&&!b.popover.hidden&&b.hidePopover()},{signal:$.signal}),document.addEventListener("mouseover",o=>{let s=Mo(o.target);s!==null&&ts(s)},{signal:$.signal}),document.addEventListener("mouseout",o=>{let s=Mo(o.target);if(s===null)return;let d=s.dataset.commentId,f=p.comments.find(C=>C.id===d);f!==void 0&&Io(s,f,f.id===p.activeId)},{signal:$.signal}),document.addEventListener("selectionchange",()=>{let o=window.getSelection();(o===null||o.isCollapsed)&&b.hideSelectionBar(),b.scheduleSelectionCheck()},{signal:$.signal}),document.addEventListener("pointerdown",o=>{e(o.target)||(b.adjustingSelection=!0,$.clearTimeout(b.selectionTimer))},{capture:!0,signal:$.signal});let t=o=>{b.adjustingSelection=!1,!e(o)&&b.scheduleSelectionCheck()};document.addEventListener("pointerup",o=>t(o.target),{signal:$.signal}),document.addEventListener("pointercancel",()=>t(null),{signal:$.signal}),document.addEventListener("mouseup",o=>t(o.target),{signal:$.signal}),document.addEventListener("keydown",o=>{if(o.key!=="Escape")return;if(b.isPeeking()){b.hideMarkPeek();return}if(b.draft!==null&&b.isNarrow()){b.discardDraft();return}if(_t){z.closeListMenu(),ft?.focus();return}let s=b.popover!==null&&!b.popover.hidden;s&&b.hidePopover(),b.hideSelectionBar(),!s&&Y.isComparing()&&Y.exitCompare()},{signal:$.signal}),b.attachKeyboardDismiss(),ac.start(),window.addEventListener("resize",()=>b.handleResize(),{signal:$.signal});let n=()=>{b.applyViewportHeight(),b.settleComposeDock()};window.visualViewport?.addEventListener("resize",n,{signal:$.signal}),window.visualViewport?.addEventListener("scroll",n,{signal:$.signal}),window.addEventListener("hashchange",()=>sc(),{signal:$.signal}),window.addEventListener("popstate",()=>Y.onPopState(),{signal:$.signal}),window.addEventListener("beforeunload",()=>{b.dropDraft(),qn(),_o()},{signal:$.signal}),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{let o=p.compare;o===null||o.diff===null||No(o.diff.changes,o.activeIndex)},{signal:$.signal})}function $u(e){return e.startsWith("/internal/")||/^\/history\/(internal|public)\//.test(e)?"internal":e.startsWith("/public/")?"public":null}function zu(){let e=document.querySelector('script[src^="/comments-widget.js"][data-page]'),t=e===null?null:e.getAttribute("data-page");return t!==null&&t.length>0?t:null}function uc(e){let t=p.viewer!==null&&p.viewer.kind==="member";(e==="identified"?t:p.visibility==="internal"&&!p.personal||Kl())&&(Rn=Wl()??Rn),pc(),Yi(),p.viewer!==null&&Gi()}function Gi(){Rn?.showSelf(p.viewer,()=>{qu()})}async function qu(){let e=await ls();if($.disposed)return;if(!e.ok){Bt(e);return}let t=i("form");t.method="post",t.action="/api/auth/signout";for(let[n,o]of[["csrfToken",e.value],["callbackUrl","/signin"]]){let s=i("input");s.type="hidden",s.name=n,s.value=o,t.appendChild(s)}t.hidden=!0,document.body.appendChild(t),t.submit()}function Yi(){Rn?.showFavorite(p.favorite,()=>{Ku()})}var Vi=!1;async function Ku(){if(Vi||p.favorite===null)return;Vi=!0;let e=!p.favorite,t=await rs(p.slug,e);if(Vi=!1,!$.disposed){if(!t.ok){Bt(t);return}p.favorite=e,Yi()}}var Rn=null,eo=null;function pc(){let e=Rn,t=p.currentVersion;if(e!==null){if(t===null||!p.features.history||Y.loadedVersion!==null){eo=null,e.showVersion(null,()=>{});return}eo!==t&&(eo=t,ss(p.slug).then(n=>{if(!($.disposed||eo!==t)){if(!n.ok||n.value===null||n.value.sha!==t){eo=null;return}e.showVersion(n.value,()=>{Y.openHistory()}),Ke()}}))}}function Wu(e){if(Zn!==null){Zn.observe(e);return}if(e===null||Y.loadedVersion!==null||!p.features.history||!Ai(document))return;let t=e;import("./comments-widget-chunk-7V33A7S4.js").then(n=>{$.disposed||Zn!==null||(Zn=new n.PageLatest({slug:p.slug,shownVersion:t,unsent:()=>[...ye?.querySelectorAll("textarea")??[]].some(o=>o.value.trim().length>0)}),$.signal.addEventListener("abort",()=>Zn?.dispose(),{once:!0}))})}function Jd(){let e=window.location.pathname,t=$u(e);if(t===null||document.querySelector(bt)!==null)return;Ss();let n=zu();if(!(n===null||decodeURIComponent(e.replace(/^\/(?:internal|public|history\/(?:internal|public))\//,"")).replace(/\/+$/,"").length===0)){if(p.personal=document.querySelector('script[src^="/comments-widget.js"][data-edition="personal"]')!==null,p.visibility=t,p.slug=n,Y.loadedVersion=Y.asSha(Y.urlParams().get("v")),ra(document),cd(document),Gl(),Qa(()=>{fe!==null&&Ke()}),td({editable:()=>ye!==null&&p.features.edit&&Y.loadedVersion===null&&!Cn(),openEditable:s=>Ki(s)}),md({comments:()=>p.comments}),Ed(),Hd(),uc("at-once"),fr=Md({onDialogChange:Uu}),t==="internal"){Xd(),mr().then(jd);return}wn(p.slug).then(s=>{if(!$.disposed&&s.ok){if(!s.value.features.tools){p.viewer=s.value.viewer,Wi();return}Xd(),ic(s.value),jd()}})}}function Uu(e){e&&(b.setOpen(!1),b.hideMarkPeek(),b.hideSelectionBar()),ye?.host instanceof HTMLElement&&(ye.host.style.visibility=e?"hidden":"")}function jd(){if(Wi(),p.features.edit&&rd(),uc("identified"),Y.urlParams().get("edit")==="1"&&p.features.edit&&Y.loadedVersion===null){let t=new URL(window.location.href);t.searchParams.delete("edit"),window.history.replaceState(null,"",t.href),Ki()}let e=Y.urlParams().get("deck-panel");if(e==="history"||e==="sharing"){let t=new URL(window.location.href);t.searchParams.delete("deck-panel"),window.history.replaceState(null,"",t.href),e==="history"&&p.features.history?Y.openHistory():e==="sharing"&&le.canManageAccess()&&le.openAccess()}sc(),Y.syncFromUrl()}function Xd(){let e=Number(Ct(Qd));Number.isFinite(e)&&e>0&&(p.width=b.clampWidth(e)),b.sheetOpenPending=!0;let t=document.createElement(bt);za(navigator.userAgent,navigator.platform,navigator.maxTouchPoints)&&t.classList.add("is-ios"),ye=t.attachShadow({mode:"open"});let n=i("style");if(n.textContent=Qo,ye.appendChild(n),fe=i("div","bar"),Y.compareBar=i("div","compare"),Y.compareBar.hidden=!0,rn=Vu(),b.popover=i("div","popover"),b.popover.hidden=!0,b.attachPeekGestures(b.popover),b.attachInnerScroll(b.popover,".peek-body, textarea"),b.selectionBar=i("div","selbar"),b.selectionBar.hidden=!0,b.composeDock=i("div","compose-dock"),b.composeDock.hidden=!0,b.attachDockSwipe(b.composeDock),b.attachInnerScroll(b.composeDock,"textarea"),b.composeDock.addEventListener("focusin",()=>b.trackComposeDock(),{signal:$.signal}),nn=i("div","toast-stack"),qe.originHint=qe.buildOriginHint(),ye.appendChild(fe),ye.appendChild(qe.originHint),ye.appendChild(Y.compareBar),ye.appendChild(rn),ye.appendChild(b.popover),ye.appendChild(b.selectionBar),ye.appendChild(b.composeDock),ye.appendChild(nn),document.body.appendChild(t),document.body.hasAttribute("data-deck")){let d=Xl(()=>{fe!==null&&Ke()});$.signal.addEventListener("abort",d,{once:!0})}b.applyPush();let o=()=>{t.style.setProperty("--top-lane",`${Ae.above("compare")}px`),Do(Ae.total())};o();let s=Ae.watch(o);$.signal.addEventListener("abort",s,{once:!0}),Ke(),Fu()}window.addEventListener("pagehide",e=>{e.persisted||($.dispose(),le.dispose(),qe.dispose(),Y.dispose(),z.dispose(),b.dispose())},{signal:$.signal});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Jd,{signal:$.signal}):Jd();
