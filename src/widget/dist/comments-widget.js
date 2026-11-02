/* 生成物。直接編集しない。元のコードは src/widget/*.ts、作り直しは `pnpm build:widget`。 */
import{a as ct}from"./comments-widget-chunk-QGM4RBOY.js";import{a as zn,b as ms}from"./comments-widget-chunk-IYDWS26R.js";import{a as gs,f as vs,g as bs,h as ys}from"./comments-widget-chunk-U3NEBJNG.js";import{c as xn}from"./comments-widget-chunk-RTKX3JSM.js";import{a as wn,b as ts,c as ns,d as os,e as Jr,f as Xr,g as Ro,h as jr,i as rs,j as is,k as as,l as ss,m as ls,p as ds,q as cs,r as us,s as ps,t as fs,u as hs}from"./comments-widget-chunk-74X7EE6Z.js";import{a as go,c as ws,d as xs}from"./comments-widget-chunk-MFC6A7BI.js";import{$ as So,A as Dt,Aa as Ya,B as zr,Ba as Ja,C as a,Ca as Xa,D as ae,Da as gn,E as ko,Ea as ja,F as ft,Fa as Ur,G as qr,Ga as Yr,H as hn,Ha as vn,I as ht,Ia as bn,J as ma,Ja as Vn,K as ga,Ka as yn,L as va,La as _t,M as Co,Ma as Qa,N as ba,Na as Za,O as We,Oa as Ao,P as mn,Pa as pt,Q as ya,Qa as es,R as Wt,Ra as Mo,S as Eo,Sa as $n,T as wa,U as Gt,V as xa,W as ka,X as Ca,Y as Kr,Z as Ea,_ as Sa,aa as Ta,ba as To,ca as La,da as Aa,ea as Ma,f as vo,fa as Ra,g as Nr,ga as Lo,ha as Pa,i as s,ia as Ia,j as Ve,ja as Oa,k as $e,ka as Ha,l as wo,la as Wr,m as fa,ma as Na,n as Ht,na as Da,o as be,oa as _a,p as fn,pa as Ba,q as le,qa as Fa,r as xo,ra as Gr,s as $r,sa as Va,t as Nt,ta as $a,u as ut,ua as za,v as at,va as qa,w as ha,wa as Ka,x as Ke,xa as Wa,y as St,ya as Ga,z as Fn,za as Ua}from"./comments-widget-chunk-4VXGFC7P.js";import{d as ia}from"./comments-widget-chunk-KZMF5WDR.js";import"./comments-widget-chunk-KDFMM342.js";import{a as Kt,b as aa,c as Dr,f as _r,g as Br,h as bo,i as yo,j as Et,k as sa,l as la,m as da,n as ca,o as ua,p as Fr,q as Vr,s as pa}from"./comments-widget-chunk-6ECDCATY.js";import{b as Hr,c as ra,d as Ct,i as pn}from"./comments-widget-chunk-UQVG7YRY.js";import{c as Se,d as kt,e as vt,f as Fe}from"./comments-widget-chunk-BJN73O4D.js";var ic=50;function ac(e){return e.replace(/\s+/g," ")}function kn(e){return ac(e).trim()}function sc(e,t){let n=0;for(;n<e.length&&n<t.length&&e.charAt(e.length-1-n)===t.charAt(t.length-1-n);)n+=1;return n}function lc(e,t){let n=0;for(;n<e.length&&n<t.length&&e.charAt(n)===t.charAt(n);)n+=1;return n}function ks(e,t,n,o){let i=kn(t);if(i.length===0)return null;let d=n===null?null:kn(n),c=[];for(let S=e.indexOf(i);S>=0;S=e.indexOf(i,S+1)){let R=S+i.length-1;if(d===null||d.length===0)c.push({from:S,to:R});else{let $=-1;for(let Y=e.indexOf(d,S);Y>=0;Y=e.indexOf(d,Y+1))if(Y+d.length-1>=R){$=Y+d.length-1;break}$>=0&&c.push({from:S,to:$})}if(c.length>ic)break}if(c.length===0)return null;if(c.length===1)return c[0];if(o===null)return null;let b=null,x=0,m=!1;for(let S of c){let R=e.slice(Math.max(0,S.from-pn),S.from),$=e.slice(S.to+1,S.to+1+pn),Y=sc(o.beforeText,R)+lc(o.afterText,$);Y>x?(x=Y,b=S,m=!1):Y===x&&(m=!0)}return x===0||m||b===null?null:b}function Ut(e,t){if(e===null||e.length===0||t.length===0)return!1;let n=e.toLowerCase(),o=t.toLowerCase();if(n===o)return!0;let i=n.length<=o.length?n:o,d=n.length<=o.length?o:n;return i.length>=7&&d.startsWith(i)}function Cs(e,t){return e.filter(n=>n.parentId===null&&n.quote!==null&&n.quote.length>0&&Ut(n.pageVersion,t))}function Po(e,t){let n=kn(e.text);if(n.length===0)return!1;let o=kn(t.thenText),i=t.nowText===null?"":kn(t.nowText);return e.kind==="del"?o.length>0&&(o.includes(n)||n.includes(o)):e.kind==="add"?i.length>0&&(i.includes(n)||n.includes(i)):!1}function Yt(e){return e==="changed"||e==="gone"}var dc="/api/avatars/";function Es(e){return e.startsWith(dc)}var Qr="surprise-pages:views",Ts="surprise-pages:views:off";function Ls(e){return`surprise-pages:views:sent:${e}`}function Ss(e){let t=Date.parse(e);return Number.isNaN(t)?0:t}function As(e){return[...e].sort((t,n)=>Ss(n.lastViewedAt)-Ss(t.lastViewedAt))}function Ms(e,t,n){let o=e.find(c=>c.href===t.href)??null,i=e.filter(c=>c.href!==t.href),d={href:t.href,title:t.title,lastViewedAt:n,viewCount:o===null?1:o.viewCount+1};return As([d,...i]).slice(0,200)}function cc(e){return typeof e=="object"&&e!==null}function uc(e){if(!cc(e))return null;let{href:t,title:n,lastViewedAt:o,viewCount:i}=e;return typeof t!="string"||t.length===0||typeof n!="string"||typeof o!="string"||typeof i!="number"||!Number.isFinite(i)?null:{href:t,title:n,lastViewedAt:o,viewCount:Math.max(1,Math.floor(i))}}function Rs(e){if(e===null)return[];let t;try{t=JSON.parse(e)}catch{return[]}if(!Array.isArray(t))return[];let n=[];for(let o of t){let i=uc(o);i!==null&&n.push(i)}return As(n).slice(0,200)}function Ps(e){return JSON.stringify(e)}function Is(e){return e==="1"}var pc="data-surprise-draft",Hs="script,style,noscript,textarea,select,option,svg",fc="p,div,section,article,header,footer,main,aside,nav,h1,h2,h3,h4,h5,h6,ul,ol,li,table,thead,tbody,tr,td,th,blockquote,pre,figure,figcaption,dl,dt,dd,form,fieldset",hc="br,hr",mc=`${Ke},${St},[${Ct}],del[data-surprise-redline],[${la}],[${Et}],[${sa}],[${da}],[${ca}],[${ua}]`,Zr=`mark[${Fn}]`;function Os(e){let t=e.parentElement;return t===null?null:t.closest(fc)}var Ns=null;function Ds(e){return document.body.hasAttribute("data-deck")?import("./comments-widget-chunk-K7S6TZVG.js").then(t=>{Ns=t.ensureDeckPublicSupplements,e()},()=>{}):Promise.resolve()}function Io(){Ns?.(document);let e=[],t=[],n=!1,o=null,i=!1,d=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode(c){let b=c instanceof Element?c:c.parentElement;return b===null||b.closest(Hs)!==null||b.closest(mc)!==null?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});for(let c=d.nextNode();c!==null;c=d.nextNode()){if(c instanceof Element){c.matches(hc)&&(i=!0);continue}if(!(c instanceof Text))continue;o!==null&&(i||Os(o)!==Os(c))&&e.length>0&&(n=!0),i=!1,o=c;let b=c.data;for(let x=0;x<b.length;x+=1){let m=b.charAt(x);if(m.trim().length===0){e.length>0&&(n=!0);continue}n&&(e.push(" "),t.push({node:c,offset:x}),n=!1),e.push(m),t.push({node:c,offset:x})}}return{text:e.join(""),sources:t}}function gc(e,t){let n=t.cloneRange();n.collapse(!0);let o=t.cloneRange();o.collapse(!1);let i=-1,d=-1;for(let c=0;c<e.sources.length;c+=1){let b=e.sources[c],x=!1;try{x=n.comparePoint(b.node,b.offset)>=0&&o.comparePoint(b.node,b.offset)<0}catch{x=!1}if(x)i<0&&(i=c),d=c;else if(i>=0)break}return i<0||d<i?null:{start:i,end:d}}function Oo(){let e=window.getSelection();if(e===null||e.rangeCount===0||e.isCollapsed)return null;let t=e.getRangeAt(0),n=Mo(e.toString());if(n.length===0)return null;let o=t.commonAncestorContainer,i=o instanceof Element?o:o.parentElement;if(i===null||i.closest(Ke)!==null)return null;let d=Io(),c=gc(d,t);if(c===null)return{quote:n,context:{beforeText:"",afterText:""}};let b=c.start,x=c.end;for(;b<=x&&d.text.charAt(b)===" ";)b+=1;for(;x>=b&&d.text.charAt(x)===" ";)x-=1;return x<b?null:{quote:d.text.slice(b,x+1),context:{beforeText:d.text.slice(Math.max(0,b-pn),b),afterText:d.text.slice(x+1,x+1+pn)}}}function qn(e){return{quote:e.quote,context:{beforeText:e.context.beforeText,afterText:e.context.afterText}}}function vc(e){if(e.data.trim().length>0)return!1;let t=document.createRange();return t.selectNodeContents(e),t.getBoundingClientRect().width===0}function _s(e){let t=e.startContainer,n=e.startOffset,o=e.endContainer,i=e.endOffset,d=t.nodeType===Node.TEXT_NODE?t.parentNode:t,c=e.commonAncestorContainer,b=c.nodeType===Node.TEXT_NODE?c.parentNode??d:c;if(b===null)return[];let x=[],m=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);for(let R=m.nextNode();R!==null;R=m.nextNode()){if(!(R instanceof Text))continue;let $=R.parentElement;if($===null||$.closest(Hs)!==null||$.closest(Ke)!==null||!e.intersectsNode(R)||!(R===t||R===o)&&vc(R))continue;let re=R===t?n:0,L=R===o?i:R.data.length;L<=re||x.push({node:R,start:re,end:L})}let S=[];for(let R of x){let $=R.node;R.start>0&&($=$.splitText(R.start)),$.data.length>R.end-R.start&&$.splitText(R.end-R.start);let Y=$.parentNode;if(Y===null)continue;let re=document.createElement("mark");re.setAttribute(pc,""),Y.insertBefore(re,$),re.appendChild($),Ho(re,!1),S.push(re)}return S}function ei(e,t){e.style.padding="0",e.style.margin="0",e.style.border="0",e.style.display="inline",e.style.boxShadow=$r(t)}function Ho(e,t){e.style.background=Nt.tint,e.style.color="inherit",e.style.borderRadius=Nt.radius,ei(e,Nt.tint),e.style.textDecorationLine="underline",e.style.textDecorationStyle="dotted",e.style.textDecorationThickness=Nt.thickness,e.style.textUnderlineOffset=Nt.offset,e.style.textDecorationColor=t?Nt.failedColor:Nt.lineColor}function Bs(e){e.style.background=ut.tint,e.style.borderRadius=ut.radius,ei(e,ut.tint),e.style.textDecorationLine="none",e.style.opacity="1"}function Fs(e){for(let t of e){let n=t.parentNode;if(n!==null){for(;t.firstChild!==null;)n.insertBefore(t.firstChild,t);n.removeChild(t),n.normalize()}}}function Tt(e){Fs(e)}function ti(e,t,n,o){return ks(e.text,t,n,o)}function ni(e,t,n){let o=[];for(let i=t;i<=n&&i<e.sources.length;i+=1){let d=e.sources[i],c=o[o.length-1];if(c!==void 0&&c.node===d.node&&d.offset>=c.end){c.end=d.offset;continue}o.push({node:d.node,start:d.offset,end:d.offset})}return o}function oi(e,t,n){let o=ni(e,t.from,t.to),i=[];for(let d=o.length-1;d>=0;d-=1){let c=o[d],b=c.end+1-c.start;if(b<=0)continue;let x=c.node;c.start>0&&(x=x.splitText(c.start)),x.data.length>b&&x.splitText(b);let m=x.parentNode;if(m===null)continue;let S=n();m.insertBefore(S,x),S.appendChild(x),i.push(S)}return i.reverse()}function Kn(e,t,n){let o=t.resolvedAt!==null,i=n?ut.activeTint:o?ut.resolvedTint:ut.tint;e.style.background=i,e.style.color="inherit",e.style.borderRadius=ut.radius,ei(e,i),e.style.cursor="pointer",e.style.transition=ut.transition,e.style.opacity=o?ut.resolvedOpacity:"1",e.style.textDecorationLine="none"}function Vs(e){e.style.background=ut.activeTint,e.style.boxShadow=$r(ut.activeTint)}function Wn(){Fs(Array.from(document.querySelectorAll(Zr)))}function $s(e){Wn();let t=new Set;for(let n of e){if(n.parentId!==null||n.quote===null||n.quote.length===0)continue;let o=Io(),i=ti(o,n.quote,null,n.quoteContext);if(i===null)continue;oi(o,i,()=>{let c=document.createElement("mark");return c.setAttribute(Fn,""),c.dataset.commentId=n.id,Kn(c,n,!1),c}).length>0&&t.add(n.id)}return t}function No(e){let t=[];for(let n of Array.from(document.querySelectorAll(Zr)))n instanceof HTMLElement&&n.dataset.commentId===e&&t.push(n);return t}function Do(e){if(!(e instanceof Element))return null;let t=e.closest(Zr);return t instanceof HTMLElement?t:null}function zs(e){let t=No(e);return t.length===0?null:t[0].getBoundingClientRect().top+window.scrollY}var qs=[["open",s("toolbox.list.filter.open")],["changed",s("toolbox.list.filter.changed")],["resolved",s("toolbox.list.filter.resolved")],["all",s("toolbox.list.filter.all")]],ri=[["document",s("toolbox.list.sort.document")],["newest",s("toolbox.list.sort.newest")],["oldest",s("toolbox.list.sort.oldest")],["priority",s("toolbox.list.sort.priority")]],Bo="open",Fo="document";function bc(e){let t=qs.find(n=>n[0]===e);return t===void 0?e:t[1]}function yc(e){let t=ri.find(n=>n[0]===e);return t===void 0?e:t[1]}function Vo(e,t,n){return t==="open"?e.resolvedAt===null:t==="resolved"?e.resolvedAt!==null:t==="changed"?e.resolvedAt===null&&n.has(e.id):!0}function Cn(e){return e.resolvedAt===null?"open":"resolved"}function _o(e){return e==="good"?Hr.length:Hr.indexOf(e)}function Ks(e,t){return e===Bo&&t===Fo}function Ws(e,t){let n=[];return e!==Bo&&n.push(bc(e)),t!==Fo&&n.push(yc(t)),n.join(" ・ ")}function Gs(e,t,n){return qs.filter(([o])=>o!=="changed"||o===e?!0:n&&t.changed>0)}function Us(e,t){return e==="open"?t.resolved===0?null:{to:"resolved",label:s("toolbox.list.tail.seeResolved",{count:t.resolved})}:e==="resolved"||e==="changed"?t.open===0?null:{to:"open",label:s("toolbox.list.tail.backToOpen",{count:t.open})}:null}function ii(e){return e.length===0?null:e.some(t=>t.resolvedAt===null)?"resolve":"reopen"}function Ys(e,t){return e==="resolve"?s("toolbox.list.bulk.resolve",{count:t}):s("toolbox.list.bulk.reopen",{count:t})}function wc(e,t,n,o){if(n==="newest")return t.createdAt.localeCompare(e.createdAt);if(n==="oldest")return e.createdAt.localeCompare(t.createdAt);if(n==="priority"){let c=_o(e.priority)-_o(t.priority);return c!==0?c:e.createdAt.localeCompare(t.createdAt)}let i=(o.get(e.id)??Number.MAX_SAFE_INTEGER)-(o.get(t.id)??Number.MAX_SAFE_INTEGER);if(i!==0)return i;let d=_o(e.priority)-_o(t.priority);return d!==0?d:e.createdAt.localeCompare(t.createdAt)}function $o(e,t,n){return[...e].sort((o,i)=>wc(o,i,t,n))}var Js=["location","compare","reading"],si="--surprise-top-inset",ai=class{constructor(){this.heights={location:0,compare:0,reading:0};this.listeners=new Set;this.original=null;this.scrollGap=0}set(t,n){let o=Math.max(0,Math.round(n));if(this.heights[t]!==o){this.heights[t]=o,this.apply();for(let i of[...this.listeners])i()}}above(t){let n=0;for(let o of Js){if(o===t)break;n+=this.heights[o]}return n}total(){return Js.reduce((t,n)=>t+this.heights[n],0)}setScrollGap(t){this.scrollGap!==t&&(this.scrollGap=t,this.apply())}watch(t){return this.listeners.add(t),()=>this.listeners.delete(t)}apply(){let t=document.documentElement;if(this.original===null){this.original={top:t.style.paddingTop,scroll:t.style.scrollPaddingTop};let d=document.createElement("style");d.textContent=`@media print { html { padding-top: ${this.original.top||"0"} !important; } }`,document.head.append(d)}let n=this.total(),o=document.querySelector(`[${Ct}]`);o instanceof HTMLElement&&(o.style.top=`${this.above("reading")}px`);let i=n+(o?.getBoundingClientRect().height??0);t.style.paddingTop=n===0?this.original.top:`${n}px`,t.style.scrollPaddingTop=i===0&&this.scrollGap===0?this.original.scroll:`${i+this.scrollGap}px`,t.style.setProperty(si,`${n}px`)}},Oe=new ai;var ci="data-surprise-redline",Gn=`[${ci}]`,Xs="tr,tbody,thead,tfoot,table,ul,ol,dl";function xc(){return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}function ui(){return xc()==="dark"?at.dark:at.light}function Wo(e,t,n){let o=ui(),i=t==="add";e.style.color="inherit",e.style.background="transparent",e.style.padding=at.padding,e.style.textDecorationLine=i?"underline":"line-through",e.style.textDecorationStyle="solid",e.style.textDecorationThickness=n?at.activeThickness:at.thickness,e.style.textDecorationColor=i?o.addLine:o.delLine,i&&(e.style.textUnderlineOffset=at.offset)}function Go(e){let t=[];for(let n of Array.from(document.querySelectorAll(Gn)))n instanceof HTMLElement&&n.dataset.surpriseRedline===String(e)&&t.push(n);return t}function js(e,t){if(!(e.kind!=="add"&&e.kind!=="del"))for(let n of Go(e.index))Wo(n,e.kind,t)}function Uo(e,t){let n=new Map;for(let o of e)(o.kind==="add"||o.kind==="del")&&n.set(String(o.index),o.kind);for(let o of Array.from(document.querySelectorAll(Gn))){if(!(o instanceof HTMLElement))continue;let i=o.dataset.surpriseRedline,d=i===void 0?void 0:n.get(i);d!==void 0&&Wo(o,d,i===String(t))}}function Yo(e){for(let t of Array.from(document.querySelectorAll(Gn)))t instanceof HTMLElement&&(t.style.scrollMarginTop=`${Math.round(e)}px`)}function Qs(e){let t=Go(e);return t.length===0?!1:(t[0].scrollIntoView({block:"center",behavior:"smooth"}),!0)}function kc(e){let t=e.text.replace(/[^\S\n]+/g," ").trim();return e.block?t:t.replace(/\s+/g," ")}function zo(e,t){let n=document.createElement("del");return n.setAttribute(ci,String(e.index)),n.textContent=kc(e),t&&(n.style.display="block",n.style.whiteSpace="pre-wrap"),Wo(n,"del",!1),n}function li(e){let t=e;for(;t!==null&&t!==document.body;){if(t.closest(Ke)!==null)return null;let n=window.getComputedStyle(t).display;if(!n.startsWith("inline")&&n!=="contents"){let o=t.parentElement;return o!==null&&o.matches(Xs)?null:t instanceof HTMLElement?t:null}t=t.parentElement}return null}function Cc(e,t,n){if(e.data.slice(t).trim().length>0)return!0;let o=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),i=!1;for(let d=o.nextNode();d!==null;d=o.nextNode()){if(d===e){i=!0;continue}if(i&&d instanceof Text&&d.data.trim().length>0)return!0}return!1}function Ec(e,t,n,o){let i=ni(e,t.from,t.to);if(i.length===0)return!1;if(o){let R=i[0];if(n.block){let re=li(R.node.parentElement);if(re!==null&&re.parentNode!==null)return re.parentNode.insertBefore(zo(n,!0),re),!0}let $=R.node;R.start>0&&($=$.splitText(R.start));let Y=$.parentNode;return Y===null?!1:(Y.insertBefore(zo(n,!1),$),!0)}let d=i[i.length-1],c=d.node,b=c.parentNode;if(b===null)return!1;let x=li(c.parentElement),m=d.end+1,S=x!==null&&!Cc(c,m,x);return x!==null&&x.parentNode!==null&&(n.block||S)?(x.parentNode.insertBefore(zo(n,n.block),x.nextSibling),!0):(m<c.data.length&&c.splitText(m),b.insertBefore(zo(n,!1),c.nextSibling),!0)}function Sc(e,t,n){return oi(e,t,()=>{let i=document.createElement("ins");return i.setAttribute(ci,String(n.index)),Wo(i,"add",!1),i}).length>0}function Zs(e){Yn();let t=new Set;if(e.length===0)return t;let n=Io();for(let o=e.length-1;o>=0;o-=1){let i=e[o];if(i.place==="none")continue;let d=i.anchor,c=ti(n,d.head,d.tail,{beforeText:d.before,afterText:d.after});if(c===null)continue;(i.place==="wrap"?Sc(n,c,i):Ec(n,c,i,i.place==="before"))&&t.add(i.index)}return t}var qo="data-surprise-redline-image",Tc=`[${qo}]`,Ko=new Map;function el(e){let t=ui(),n=0;for(let o of e)for(let i of Array.from(document.querySelectorAll("img,video,source"))){if(!(i instanceof HTMLElement)||i.getAttribute("src")!==o&&i.getAttribute("poster")!==o)continue;let d=i.tagName==="SOURCE"?i.parentElement:i;if(d===null||Ko.has(d))continue;Ko.set(d,d.getAttribute("style")??""),d.setAttribute(qo,""),d.style.outline=`${at.thickness} solid ${t.addLine}`,d.style.outlineOffset=at.offset;let c=document.createElement("span");c.setAttribute(qo,""),c.textContent=s("toolbox.history.addedInVersion"),c.style.display="block",c.style.fontSize="smaller",c.style.marginTop=at.offset,c.style.color=t.addLine,d.parentNode?.insertBefore(c,d.nextSibling),n+=1}return n}var di="data-surprise-redline-bars";function tl(){for(let e of Array.from(document.querySelectorAll(`[${di}]`)))e.remove()}function Lc(e){if(window.getComputedStyle(e).display==="block"){let t=e.parentElement;return t!==null&&t.matches(Xs)?null:e}return li(e.parentElement)}function Un(){tl();let e=new Set;for(let b of Array.from(document.querySelectorAll(Gn))){if(!(b instanceof HTMLElement))continue;let x=Lc(b);x!==null&&e.add(x)}if(e.size===0)return 0;let t=document.createElement("div");t.setAttribute(di,""),t.style.position="absolute",t.style.top="0",t.style.left="0",t.style.width="0",t.style.height="0",t.style.pointerEvents="none",t.style.zIndex="2147481000",document.body.appendChild(t);let n=t.getBoundingClientRect(),o=ui().barLine,i=Number.parseFloat(at.barWidth),d=Number.parseFloat(at.barGap),c=0;for(let b of e){let x=b.getBoundingClientRect();if(x.height===0)continue;let m=x.left-n.left-d-i;if(x.left-d-i<0)continue;let S=document.createElement("div");S.setAttribute(di,""),S.style.position="absolute",S.style.top=`${Math.round(x.top-n.top)}px`,S.style.left=`${Math.round(m)}px`,S.style.width=at.barWidth,S.style.height=`${Math.round(x.height)}px`,S.style.background=o,t.appendChild(S),c+=1}return c}var Ac=`[${Ct}]`,En=null;function pi(e){if(e){if(En!==null)return;let t=document.querySelector(Ac);if(!(t instanceof HTMLElement))return;En={element:t,display:t.style.display},t.style.display="none";return}En!==null&&(En.element.style.display=En.display,En=null)}function Yn(){tl();for(let e of Array.from(document.querySelectorAll(Gn))){let t=e.parentNode;if(t!==null){if(e.tagName==="DEL")t.removeChild(e);else{for(;e.firstChild!==null;)t.insertBefore(e.firstChild,e);t.removeChild(e)}t.normalize()}}for(let e of Array.from(document.querySelectorAll(Tc))){if(!(e instanceof HTMLElement))continue;let t=Ko.get(e);if(t===void 0){e.remove();continue}t.length===0?e.removeAttribute("style"):e.setAttribute("style",t),e.removeAttribute(qo),Ko.delete(e)}}function nl(e){let t=ct(),n=(...u)=>e.handleFailure(...u),o=(...u)=>e.render(...u),i=(...u)=>e.setOpen(...u),d=(...u)=>e.hidePopover(...u),c=(...u)=>e.hideSelectionBar(...u),b=(...u)=>e.hideMarkPeek(...u),x=(...u)=>e.pushToast(...u),m=(...u)=>e.fillOutcomes(...u),S=(...u)=>e.syncMarks(...u),R=(...u)=>e.outcomeTargetVersion(...u),$=(...u)=>e.closeOriginCompare(...u),Y=(...u)=>e.renderPanelBody(...u),re=(...u)=>e.isNarrow(...u),L=(...u)=>e.outcomeOf(...u),pe=(...u)=>e.appendQuoteStory(...u),ve=(...u)=>e.topLevel(...u),_={versions:null,moreVersions:!1,compare:null,get slug(){return e.state.slug},set slug(u){e.state.slug=u},get view(){return e.state.view},set view(u){e.state.view=u},get outcomesFor(){return e.state.outcomesFor},set outcomesFor(u){e.state.outcomesFor=u},get outcomes(){return e.state.outcomes},set outcomes(u){e.state.outcomes=u},get features(){return e.state.features},set features(u){e.state.features=u},get comments(){return e.state.comments},set comments(u){e.state.comments=u}},me=null,we=null,Ge=/^[0-9a-f]{7,40}$/i;function Re(u){return u!==null&&Ge.test(u)?u:null}function Pe(){return new URL(window.location.href).searchParams}function qe(u,C){let A=Pe();C===null?A.delete("v"):A.set("v",C),u===null?A.delete("from"):A.set("from",u);let P=A.toString();return`${window.location.pathname}${P.length>0?`?${P}`:""}${window.location.hash}`}function xe(){return _.compare!==null}function Ue(u,C){let A=C.toLowerCase();return u.find(P=>P.sha.toLowerCase()===A)??u.find(P=>P.sha.toLowerCase().startsWith(A))??null}async function B(){if(_.versions!==null)return _.versions;let u=await as(_.slug);return t.disposed?null:u.ok?(_.versions=u.value.versions,_.moreVersions=u.value.more,o(),u.value.versions):(n(u),null)}function D(u){if(we!==null)return u.sha.startsWith(we);let C=_.versions;return C!==null&&C.length>0&&C[0].sha===u.sha}async function He(){_.view="versions",i(!0),await B(),t.disposed}async function ge(u,C,A){if(!D(C)){window.location.href=qe(u.sha,C.sha);return}A&&window.history.pushState(null,"",qe(u.sha,we)),await G(u,C),t.disposed}async function G(u,C){Wn(),pi(!0),d(),c(),b(),_.compare={kind:"history",from:u,to:C,diff:null,placed:new Set,activeIndex:0},o();let A=_.compare,P=await ss(_.slug,u.sha,C.sha);if(t.disposed)return;let N=_.compare;if(N===A&&!(N===null||N.from.sha!==u.sha||N.to.sha!==C.sha)){if(!P.ok){if(de(),P.status===401){n(P);return}x(s("toolbox.history.diffFailed"),"failure",()=>{ge(u,C,!1)});return}N.diff=P.value,N.placed=Zs(P.value.changes),el(P.value.images.added),await m(C.sha),!t.disposed&&_.compare===N&&(Yo(Oe.total()),o(),Un(),Ze())}}function Q(){_.compare=null,_e(),Yn(),pi(!1),S(!0),_.view==="changes"&&(_.view="versions");let u=R();_.outcomesFor!==u&&(_.outcomes=new Map,_.outcomesFor=null,m(u))}function Ye(){if(_.compare!==null){if(_.compare.kind==="origin"){if($(),_.view==="origin"){_.view="comments",i(!1);return}o();return}if(Q(),we!==null){window.location.href=qe(null,null);return}window.history.pushState(null,"",qe(null,null)),o()}}function de(){_.compare!==null&&(Q(),window.history.replaceState(null,"",qe(null,we)),o())}async function Ne(){let u=Re(Pe().get("from"));if(u===null){xe()&&_.compare?.kind!=="origin"&&(Q(),o());return}if(!_.features.history)return;let C=await B();if(t.disposed||C===null||Re(Pe().get("from"))!==u)return;let A=Ue(C,u),P=we===null?C[0]??null:Ue(C,we);if(A===null||P===null||A.sha===P.sha){xe()&&(Q(),o());return}let N=_.compare;N!==null&&N.from.sha===A.sha&&N.to.sha===P.sha||(await G(A,P),t.disposed)}function w(){if(Re(Pe().get("v"))!==we){window.location.reload();return}Ne()}let De=600,nt=0,Te=null;function Le(u){let C=u.diff;return C===null?[]:C.changes.filter(A=>u.placed.has(A.index))}function Je(u){let C=_.compare;C===null||C.diff===null||(C.activeIndex=u,Uo(C.diff.changes,u),J(),_.view==="changes"&&Y())}function Ie(u){let C=_.compare;C===null||!C.placed.has(u)||(Je(u),nt=Date.now()+De,Qs(u),t.timeout(()=>{let A=_.compare;if(A===null||A.diff===null||A.activeIndex!==u)return;let P=A.diff.changes.find(N=>N.index===u);P!==void 0&&js(P,!1)},De))}function Xe(u){let C=_.compare;if(C===null)return;let A=Le(C);if(A.length===0)return;let P=A.findIndex(ee=>ee.index===C.activeIndex);if(P<0){Ie(A[u>0?0:A.length-1].index);return}let N=Math.min(A.length-1,Math.max(0,P+u));Ie(A[N].index)}function _e(){Te?.disconnect(),Te=null}function Ze(){_e();let u=_.compare;if(u===null||u.diff===null)return;let C=new Set,A=new IntersectionObserver(P=>{for(let ee of P)ee.target instanceof HTMLElement&&(ee.isIntersecting?C.add(ee.target):C.delete(ee.target));if(Date.now()<nt)return;let N=null;for(let ee of C){let ke=Number(ee.dataset.surpriseRedline);if(!Number.isFinite(ke))continue;let wt=ee.getBoundingClientRect().top;(N===null||wt<N.top)&&(N={index:ke,top:wt})}N===null||N.index===u.activeIndex||Je(N.index)},{rootMargin:`-${Math.round(Ae())}px 0px 0px 0px`});for(let P of Le(u))for(let N of Go(P.index))A.observe(N);Te=A}function Ae(){return me===null||me.hidden?0:me.getBoundingClientRect().height}function lt(){let u=Math.round(Ae());e.root!==null&&e.root.host instanceof HTMLElement&&e.root.host.style.setProperty("--compare-bar",`${u}px`),Oe.set("compare",u)}function je(u){let C=a("span","compare-label");return C.appendChild(a("span","compare-when",Qa(u.committedAt,re()))),C.appendChild(a("span","compare-who",xn(u.authorName,s))),C}function E(u){let C=u.diff;if(C?.coarse)return s("toolbox.history.coarse");if(u.kind==="origin")return e.originDiffError?s("toolbox.history.diffFailed"):C===null?s("toolbox.history.counting"):C.identical?s("toolbox.history.originSame"):s("toolbox.history.changes",{count:C.changes.length});if(C===null)return s("toolbox.history.counting");if(C.identical)return C.images.added.length+C.images.removed.length>0?s("toolbox.history.noTextChangeImages"):s("toolbox.history.noTextChange");let A=C.changes.length,P=C.changes.filter(ee=>ee.place==="none").length,N=A-u.placed.size-P;return N>0?s("toolbox.history.changesLost",{count:A,lost:N}):P>0?s("toolbox.history.changesHomeless",{count:A,homeless:P}):s("toolbox.history.changes",{count:A})}function k(u){let C=Le(u).length;if(C===0)return"–";let A=Le(u).findIndex(P=>P.index===u.activeIndex);return`${A<0?"–":A+1} / ${C}`}function T(u){let C=a("button","compare-version");return C.type="button",C.appendChild(je(u)),_.compare?.kind==="origin"?(C.disabled=!0,C.title=xn(u.authorName,s),C):(C.title=s("toolbox.history.versionButton",{when:Ao(u.committedAt),sha:u.shortSha}),C.addEventListener("click",()=>{_.view="versions",i(!0),B()},{signal:t.signal}),C)}function F(u,C,A){let P=a("button","icon-button");return P.type="button",P.title=u,P.setAttribute("aria-label",u),P.appendChild(ae(C,le.small)),P.addEventListener("click",A,{signal:t.signal}),P}function J(){if(me===null)return;let u=_.compare;if(me.hidden=u===null,me.replaceChildren(),u===null)return;let C=a("div","compare-pair");C.appendChild(T(u.from)),C.appendChild(a("span","compare-arrow","→")),C.appendChild(T(u.to)),me.appendChild(C);let A=a("div","compare-legend");A.appendChild(a("span","legend-add",s("toolbox.history.added"))),A.appendChild(a("span","legend-del",s("toolbox.history.removed"))),A.hidden=u.diff===null||u.placed.size===0,me.appendChild(A);let P=a("button","compare-count");if(P.type="button",P.textContent=E(u),P.disabled=u.diff===null&&!e.originDiffError,P.addEventListener("click",()=>{_.view=u.kind==="origin"?"origin":"changes",i(!0)},{signal:t.signal}),me.appendChild(P),u.kind!=="origin"){let ee=Le(u).length,ke=a("div","compare-nav"),wt=F(s("toolbox.history.previousChange"),Sa,()=>Xe(-1)),$t=F(s("toolbox.history.nextChange"),So,()=>Xe(1));wt.disabled=ee===0,$t.disabled=ee===0,ke.appendChild(wt),ke.appendChild(a("span","compare-position",k(u))),ke.appendChild($t),me.appendChild(ke)}let N=a("button","compare-end");N.type="button",N.textContent=s("toolbox.history.end"),N.title=u.kind==="origin"?s("toolbox.history.endOrigin"):s("toolbox.history.endCompare"),N.addEventListener("click",()=>Ye(),{signal:t.signal}),me.appendChild(N)}function ue(){return _.moreVersions?s("toolbox.history.moreVersions"):s("toolbox.history.firstVersion")}function h(u,C,A){let P=A[C+1],N=P===void 0,ee=a("button",C===0?"version is-current":"version");if(ee.type="button",ee.disabled=N,N||(ee.title=s("toolbox.history.compareWithPrevious")),ee.appendChild(a("div","version-who",xn(u.authorName,s))),ee.appendChild(a("div","version-when",Ao(u.committedAt))),ee.appendChild(a("div","version-count",N?"":u.changeCount===null?s("toolbox.history.notCounted"):s("toolbox.history.changes",{count:u.changeCount}))),u.number===null)ee.appendChild(a("div","version-sha",u.shortSha));else{let ke=a("div","version-number",s("toolbox.history.versionNumber",{number:u.number}));ke.title=u.shortSha,ee.appendChild(ke)}return N&&ee.appendChild(a("p","note",ue())),P!==void 0&&ee.addEventListener("click",()=>{ge(P,u,!0)},{signal:t.signal}),ee}function O(){let u=a("div"),C=_.versions;if(C===null)return u.appendChild(a("div","empty",s("toolbox.common.loading"))),u;if(C.length===0){let A=a("div","empty");return A.appendChild(a("div","empty-title",s("toolbox.history.noVersions"))),A.appendChild(a("div","empty-hint",s("toolbox.history.noVersionsHint"))),u.appendChild(A),u}if(document.body.hasAttribute("data-deck")){let A=a("button","quiet",s("toolbox.history.reviewChanges"));A.onclick=()=>{let P=e.root;P&&import("./comments-widget-chunk-N74NTNKK.js").then(N=>N.openAgentReview(P,_.slug))},u.append(A)}return C.forEach((A,P)=>u.appendChild(h(A,P,C))),u}let X={add:s("toolbox.history.added"),del:s("toolbox.history.removed"),title:s("toolbox.history.pageTitle")};function Z(u,C){let A=C.placed.has(u.index),P=a("button",u.index===C.activeIndex?"change is-active":"change");P.type="button",P.disabled=!A,P.appendChild(a("span","change-number",String(u.index))),P.appendChild(a("span","change-kind",X[u.kind]));let N=a("div","change-main"),ee=u.kind==="add"?"change-text is-add":u.kind==="del"?"change-text is-del":"change-text";return N.appendChild(a("div",ee,Mo(u.text))),A||N.appendChild(a("p","note",u.kind==="title"?s("toolbox.history.titleNoTarget"):s("toolbox.history.notPlaced"))),P.appendChild(N),A&&P.addEventListener("click",()=>Ie(u.index),{signal:t.signal}),P}function Be(u){let C=a("button","change");C.type="button",C.disabled=!0,C.appendChild(a("span","change-kind",s("toolbox.history.removed")));let A=a("div","change-main");return A.appendChild(a("div","change-text is-del",s("toolbox.history.imageRemoved",{path:u}))),A.appendChild(a("p","note",s("toolbox.history.imageNoTarget"))),C.appendChild(A),C}function yt(u,C){let A=L(u),P=C.diff===null||A===null?void 0:C.diff.changes.find(ke=>C.placed.has(ke.index)&&Po(ke,A)),N=a("button","related");return N.type="button",P===void 0?N.disabled=!0:(N.title=s("toolbox.history.gotoComment"),N.addEventListener("click",()=>Ie(P.index),{signal:t.signal})),pe(N,u,"related-quote","related-body",!1),A!==null&&Yt(A.state)||N.appendChild(a("p","note",u.author.name)),N}function Rt(u,C){let A=new Set(Cs(_.comments,C.from.sha).map(ee=>ee.id)),P=ve().filter(ee=>A.has(ee.id));if(P.length===0)return;let N=a("h3","related-head",s("toolbox.history.relatedComments"));u.appendChild(N);for(let ee of P)u.appendChild(yt(ee,C))}function on(){let u=a("div"),C=_.compare;if(C===null)return u.appendChild(a("div","empty",s("toolbox.history.pickVersion"))),u;let A=a("div","change-head");A.appendChild(a("div","who-name",xn(C.to.message,s))),A.appendChild(a("div","who-time",`${xn(C.to.authorName,s)} ・ ${Ao(C.to.committedAt)}`)),u.appendChild(A);let P=C.diff;if(P===null)return u.appendChild(a("div","empty",s("toolbox.common.loading"))),u;if(P.identical&&P.images.removed.length===0)return u.appendChild(a("div","empty",s("toolbox.history.noTextChange"))),Rt(u,C),u;P.coarse&&u.appendChild(a("p","note",s("toolbox.history.coarseNote")));for(let N of P.changes)u.appendChild(Z(N,C));for(let N of P.images.removed)u.appendChild(Be(N));return Rt(u,C),u}return{dispose(){t.dispose(),_e()},asSha:Re,urlParams:Pe,isComparing:xe,findVersion:Ue,ensureVersions:B,openHistory:He,startCompare:ge,clearCompare:Q,exitCompare:Ye,syncFromUrl:Ne,onPopState:w,gotoChange:Ie,watchChanges:Ze,applyCompareOffset:lt,renderCompareBar:J,versionsView:O,get CHANGE_KINDS(){return X},changesView:on,get compareBar(){return me},set compareBar(u){me=u},get loadedVersion(){return we},set loadedVersion(u){we=u},state:_}}function ol(e){return!e.keyboardVisible||e.startedInDock?!1:gn(e.dx,e.dy)==="vertical"}function rl(e,t){return e-t}function fi(e,t,n){return Math.max(0,Math.round(e-t-n))}function il(e,t,n,o){let i=Math.abs(e-t),d=Math.abs(e-n);return i<=d?o+n:n}function al(e,t,n){return e-(t-n)}function sl(e,t){return Math.abs(e-t)>=.5}function ll(e,t,n,o){return e>=n&&t<=o}function Mc(e){return e.menu?"menu":e.dock?"dock":e.peek?"peek":e.selection?"selection":"none"}function dl(e,t){if(t)return!1;let n=Mc(e);return n==="none"||n==="menu"}function cl(e){return e.allowed&&!e.openToAnyone}function ul(e,t){return{sheetOpen:t,dockOpen:e.dockOpen,hasDraft:e.hasDraft}}function pl(e){return{sheetOpen:!1,dockOpen:!0,hasDraft:e.hasDraft}}function fl(e){return{sheetOpen:e.sheetOpen,dockOpen:!1,hasDraft:!1}}function hl(e,t,n){return e&&t>0&&!n}function ml(e){return!e}function gl(e,t,n){let o=Math.round(e/2);return{expanded:Math.min(o,t+n),half:o,closed:e}}function vl(e,t){let n=[["expanded",t.expanded],["half",t.half],["closed",t.closed]],o="half",i=Number.POSITIVE_INFINITY;for(let[d,c]of n){let b=Math.abs(e-c);b<i&&(i=b,o=d)}return o}function bl(e){return e==="expanded"?"half":"expanded"}function yl(e){let t=ct(),n=(...r)=>e.render(...r),o=(...r)=>e.handleFailure(...r),i=(...r)=>e.showNotice(...r),d=(...r)=>e.refresh(...r),c=(...r)=>e.ensureVersions(...r),b=(...r)=>e.findVersion(...r),x=(...r)=>e.pushToast(...r),m=(...r)=>e.setOpen(...r),S=(...r)=>e.startCompare(...r),R=(...r)=>e.gotoChange(...r),$=(...r)=>e.afterChange(...r),Y=(...r)=>e.avatarFor(...r),re=(...r)=>e.actionButton(...r),L=(...r)=>e.iconAction(...r),pe=(...r)=>e.prioritySendRow(...r),ve=(...r)=>e.canSend(...r),_=(...r)=>e.priorityPicker(...r),me=(...r)=>e.textArea(...r),we=(...r)=>e.selectFromCard(...r),Ge=(...r)=>e.priorityTag(...r),Re=(...r)=>e.copyText(...r),Pe=(...r)=>e.pageUrl(...r),qe=(...r)=>e.showError(...r),xe=(...r)=>e.hidePopover(...r),Ue=(...r)=>e.hideSelectionBar(...r),B=(...r)=>e.closeComposeDock(...r),D=(...r)=>e.updateToast(...r),He=(...r)=>e.isNarrow(...r),ge=(...r)=>e.flashCard(...r),G=(...r)=>e.focusCard(...r),Q=(...r)=>e.openComposeDock(...r),Ye=(...r)=>e.applyFocus(...r),de=(...r)=>e.discardDraft(...r),Ne=(...r)=>e.updateScrollPadding(...r),w={filter:Bo,sort:Fo,picked:null,editor:null,confirmDeleteId:null,review:null,outcomes:new Map,outcomesFor:null,comments:[],expanded:new Set,get viewer(){return e.state.viewer},set viewer(r){e.state.viewer=r},get busy(){return e.state.busy},set busy(r){e.state.busy=r},get slug(){return e.state.slug},set slug(r){e.state.slug=r},get currentVersion(){return e.state.currentVersion},set currentVersion(r){e.state.currentVersion=r},get compare(){return e.state.compare},set compare(r){e.state.compare=r},get features(){return e.state.features},set features(r){e.state.features=r},get view(){return e.state.view},set view(r){e.state.view=r},get activeId(){return e.state.activeId},set activeId(r){e.state.activeId=r},get anchored(){return e.state.anchored},set anchored(r){e.state.anchored=r},get open(){return e.state.open},set open(r){e.state.open=r}},De="surprise-pages:comments:edit-review",nt=600*1e3;function Te(){return w.comments.filter(r=>r.parentId===null)}function Le(r){return w.comments.filter(p=>p.parentId===r).sort((p,v)=>p.createdAt.localeCompare(v.createdAt))}function Je(){let r=new Set;for(let[p,v]of w.outcomes)Yt(v.state)&&r.add(p);return r}function Ie(){return w.outcomesFor!==null}function Xe(r){return Vo(r,w.filter,Je())}function _e(){let r=Te(),p=Je();return{all:r.length,open:r.filter(v=>v.resolvedAt===null).length,changed:r.filter(v=>Vo(v,"changed",p)).length,resolved:r.filter(v=>v.resolvedAt!==null).length}}function Ze(){let r=Je();return Te().filter(p=>Vo(p,w.filter,r))}function Ae(){let r=new Map,p=Ze();for(let v of p){let I=zs(v.id);r.set(v.id,I===null?Number.MAX_SAFE_INTEGER:I)}return $o(p,w.sort,r)}function lt(r){return r.mine}function je(){return w.viewer!==null&&w.features.write}function E(r){return lt(r)&&je()}function k(){return w.picked!==null}function T(){return je()&&e.draft===null&&Ae().length>=2}function F(){T()&&(w.editor=null,w.confirmDeleteId=null,w.picked=new Set(Ae().map(r=>r.id)),n())}function J(){k()&&(w.picked=null,n())}function ue(r){w.filter=r,w.picked=null,n()}function h(r){let p=w.picked;p!==null&&(p.has(r)?p.delete(r):p.add(r),n())}function O(){let r=w.picked;return r===null?[]:Ae().filter(p=>r.has(p.id))}async function X(){let r=O(),p=ii(r);if(p===null||!je())return;w.busy=!0,n();let v=await jr(w.slug,r.map(H=>H.id),p==="resolve");if(t.disposed)return;if(w.busy=!1,!v.ok){o(v);return}if(w.picked=null,p==="resolve")for(let H of r)w.expanded.delete(H.id);let I=v.value;i(I===0?s("toolbox.list.bulk.nothingMoved"):p==="resolve"?s("toolbox.list.bulk.resolved",{count:I}):s("toolbox.list.bulk.reopened",{count:I})),await d(),t.disposed}function Z(r){return w.outcomes.get(r.id)??null}function Be(){return e.loadedVersion??w.currentVersion}function yt(){let r=w.compare;return r!==null&&r.kind!=="origin"?r.to.sha:Be()}function Rt(r,p){return r.some(v=>v.parentId===null&&v.quote!==null&&v.quote.length>0&&v.pageVersion!==null&&!Ut(v.pageVersion,p))}function on(r){try{let p={pageSlug:w.slug,fromVersion:r,at:Date.now()};sessionStorage.setItem(De,JSON.stringify(p))}catch{}}function u(){try{let r=sessionStorage.getItem(De);if(r===null)return null;let p=JSON.parse(r);if(typeof p!="object"||p===null||Array.isArray(p))return null;let v={...p},I=v.pageSlug,H=v.fromVersion,K=v.at;return typeof I!="string"||typeof H!="string"||typeof K!="number"||I!==w.slug||Date.now()-K>nt?null:{pageSlug:I,fromVersion:H,at:K}}catch{return null}}function C(){try{sessionStorage.removeItem(De)}catch{}}function A(r){let p=[];for(let v of Te()){if(v.resolvedAt!==null||!Ut(v.pageVersion,r))continue;let I=Z(v);I===null||!Yt(I.state)||(p.push(v.id),w.expanded.add(v.id))}if(p.length===0){w.review=null;return}w.review={fromVersion:r,commentIds:p},w.filter==="resolved"&&(w.filter="open")}async function P(r){if(r===null)return;let p=u();if(w.outcomesFor===r){p!==null&&(A(p.fromVersion),C(),n());return}if(!Rt(w.comments,r)&&p===null&&w.review===null)return;let v=await ns(w.slug,r);if(t.disposed||!v.ok||Be()!==r&&w.compare?.to.sha!==r)return;let I=new Map;for(let K of v.value)I.set(K.commentId,K);w.outcomes=I,w.outcomesFor=r;let H=p??u();H!==null?(A(H.fromVersion),C()):w.review!==null&&A(w.review.fromVersion),n()}function N(r,p,v){return a("p",v?`${r} is-story`:r,p)}function ee(r){let p=Date.parse(r.createdAt),v=Date.parse(r.updatedAt);return Number.isNaN(p)||Number.isNaN(v)?!1:v-p>1e3}function ke(r,p,v,I){let H=a("p","outcome-label");if(H.appendChild(a("span","outcome-beat",p)),v!==null&&v.length>0){let K=a("span","outcome-meta",v);I!==null&&I.length>0&&(K.title=I),H.appendChild(K)}r.appendChild(H)}function wt(r,p){let v=_t(r);return v.length===0||v===p?s("toolbox.story.edited"):v===s("toolbox.time.justNow")?s("toolbox.story.editedJustNow"):s("toolbox.story.editedAt",{when:v})}function $t(r){let p=r.author.name,v=_t(r.createdAt);return ee(r)?{text:`${p} ・ ${v} ・ ${wt(r.updatedAt,v)}`,title:s("toolbox.story.writtenThenEdited",{written:pt(r.createdAt),edited:pt(r.updatedAt)})}:{text:`${p} ・ ${v}`,title:pt(r.createdAt)}}function gr(r){return r.changedBy===null||r.changedAt===null?null:{text:`${r.changedBy} ・ ${_t(r.changedAt)}`,title:pt(r.changedAt)}}function io(r,p,v,I,H=!0){let K=Z(p),ne=K!==null&&Yt(K.state);if(ne?(ke(r,s("toolbox.story.then"),null,null),r.appendChild(N(v,K.thenText,!0))):p.quote!==null&&p.quote.length>0&&r.appendChild(N(v,p.quote,!1)),ne){let oe=$t(p);ke(r,s("toolbox.common.comment"),oe.text,oe.title)}if(p.body.length>0&&r.appendChild(a("p",I,p.body)),ne){let oe=gr(K);if(ke(r,s("toolbox.story.now"),oe?.text??null,oe?.title??null),K.state==="gone"?r.appendChild(a("p","note is-story",s("toolbox.story.gone"))):K.nowText!==null&&r.appendChild(N(v,K.nowText,!0)),H&&w.features.history&&p.pageVersion!==null){let fe=a("button","story-link");fe.type="button",fe.textContent=s("toolbox.story.seeChange"),fe.addEventListener("click",dt=>{dt.stopPropagation(),br(p)},{signal:t.signal}),r.appendChild(fe)}}}function vr(r){if(r.quote===null||r.quote.length===0||r.pageVersion===null)return!1;let p=Be();return p===null||Ut(r.pageVersion,p)?!1:w.outcomesFor===null}function ot(r,p){if(p||r.quote===null||vr(r))return null;let v=Z(r);return v!==null&&Yt(v.state)?null:s("toolbox.story.quoteLost")}async function br(r){if(r.pageVersion===null||!w.features.history)return;let p=await c();if(t.disposed||p===null)return;let v=b(p,r.pageVersion),I=w.outcomesFor??Be();if(v===null||I===null){x(s("toolbox.story.thenMissing"),"failure");return}let H=b(p,I);if(H===null){x(s("toolbox.story.nowMissing"),"failure");return}if(v.sha===H.sha||(w.view="comments",w.activeId=r.id,w.expanded.add(r.id),m(!0),await S(v,H,!0),t.disposed))return;let K=w.compare,ne=Z(r);if(K===null||K.diff===null||ne===null)return;let oe=K.diff.changes.find(fe=>Po(fe,ne));oe!==void 0&&K.placed.has(oe.index)&&R(oe.index)}async function In(){let r=w.review;if(r===null||!je())return;w.busy=!0,n();let p=await jr(w.slug,r.commentIds,!0);t.disposed||(w.busy=!1,$(p)&&(w.review=null,await d(),t.disposed))}function yr(){let r=a("div","story-banner"),p=w.review===null?0:w.review.commentIds.length;r.appendChild(a("p","story-banner-text",s("toolbox.story.reviewBanner",{count:p})));let v=a("div","story-banner-actions");if(je()){let H=a("button","story-link");H.type="button",H.textContent=s("toolbox.list.bulk.resolve",{count:p}),H.disabled=w.busy,H.addEventListener("click",()=>{In()},{signal:t.signal}),v.appendChild(H)}let I=a("button","story-link");return I.type="button",I.textContent=s("toolbox.common.close"),I.addEventListener("click",()=>{w.review=null,n()},{signal:t.signal}),v.appendChild(I),r.appendChild(v),r}function On(r){let p=a("div"),v=a("div","card-head");v.appendChild(Y(r.author)),v.appendChild(a("span","who-name",r.author.name));let I=a("span","who-time",_t(r.createdAt));if(I.title=pt(r.createdAt),v.appendChild(I),v.appendChild(a("span","spacer")),p.appendChild(v),p.appendChild(a("p","body",r.body)),E(r)&&!k()){let H=a("div","card-actions");w.confirmDeleteId===r.id?(H.appendChild(a("span","hint",s("toolbox.card.confirmDeleteReply"))),H.appendChild(re(s("toolbox.common.remove"),ht,()=>{ao(r.id)},"is-danger")),H.appendChild(re(s("toolbox.common.cancel"),We,()=>{w.confirmDeleteId=null,n()}))):H.appendChild(L(s("toolbox.common.delete"),ht,()=>{w.confirmDeleteId=r.id,n()},"is-danger")),p.appendChild(H)}return p}function Hn(r){let p=w.editor;if(p===null)return a("div");let v=a("div","composer"),I=p.mode==="reply",H=null;I?(H=pe(fe=>{p.priority=fe,an(r)}),H.setEnabled(ve(p.body))):v.appendChild(_(p.priority,fe=>{p.priority=fe,n()}));let K=me(p.body,I?s("toolbox.card.writeReply"):s("toolbox.card.editComment"),fe=>{p.body=fe,H?.setEnabled(ve(fe))},I?{onPriority:fe=>{p.priority=fe,an(r)}}:{});v.appendChild(K),H!==null&&v.appendChild(H.row);let ne=a("div","composer-foot");ne.appendChild(a("span","hint"));let oe=a("button","button");if(oe.type="button",oe.textContent=s("toolbox.common.cancel"),oe.addEventListener("click",fe=>{fe.stopPropagation(),w.editor=null,n()},{signal:t.signal}),ne.appendChild(oe),!I){let fe=a("button","button is-primary");fe.type="button",fe.appendChild(ae(Ta,le.small)),fe.appendChild(a("span",void 0,s("toolbox.common.save"))),fe.addEventListener("click",dt=>{dt.stopPropagation(),an(r)},{signal:t.signal}),ne.appendChild(fe)}return v.appendChild(ne),t.timeout(()=>K.focus({preventScroll:!0}),0),v}function zt(r){let p=a("label","pick-box"),v=a("input");v.type="checkbox",v.className="check-input",v.checked=w.picked!==null&&w.picked.has(r.id),v.setAttribute("aria-label",s("toolbox.card.pickComment",{name:r.author.name}));let I=a("span","check-mark");return I.appendChild(ae(ft,le.small)),p.appendChild(v),p.appendChild(I),v.addEventListener("change",()=>h(r.id),{signal:t.signal}),p.addEventListener("click",H=>H.stopPropagation(),{signal:t.signal}),p}function Nn(r){let p=a("div","card is-collapsed");p.dataset.cardId=r.id;let v=a("div","collapsed-row");k()?(p.classList.add("is-pick"),w.picked!==null&&w.picked.has(r.id)&&p.classList.add("is-picked"),v.appendChild(zt(r))):(p.title=s("toolbox.card.expand"),p.setAttribute("role","button"),p.setAttribute("aria-expanded","false"),p.tabIndex=0,p.addEventListener("keydown",H=>{H.key!=="Enter"&&H.key!==" "||(H.preventDefault(),p.click())},{signal:t.signal})),r.priority==="good"?v.appendChild(ae(mn,le.small)):v.appendChild(a("span",Dt[r.priority].dotClass));let I=r.quote!==null&&r.quote.length>0?r.quote:r.body;return v.appendChild(a("span","collapsed-text",I.length>0?I:r.priority==="good"?s("toolbox.compose.good"):s("toolbox.card.removeHere"))),v.appendChild(a("span","collapsed-who",r.author.name)),p.appendChild(v),p.addEventListener("click",()=>{if(k()){h(r.id);return}w.expanded.add(r.id),n()},{signal:t.signal}),p}function rn(r){let p=r.resolvedAt!==null,v=w.anchored.has(r.id);if(p&&w.filter!=="resolved"&&!w.expanded.has(r.id)&&r.id!==w.activeId)return Nn(r);let H=["card"];k()?(H.push("is-pick"),w.picked!==null&&w.picked.has(r.id)&&H.push("is-picked")):r.id===w.activeId&&H.push("is-active"),p&&H.push("is-resolved");let K=a("div",H.join(" "));K.dataset.cardId=r.id,K.addEventListener("click",()=>{if(k()){h(r.id);return}we(r.id)},{signal:t.signal});let ne=a("div","card-head");k()&&ne.appendChild(zt(r)),ne.appendChild(Y(r.author));let oe=a("div");oe.appendChild(a("div","who-name",r.author.name));let fe=a("div","who-time",_t(r.createdAt));fe.title=pt(r.createdAt),oe.appendChild(fe),ne.appendChild(oe),ne.appendChild(a("span","spacer")),p&&ne.appendChild(a("span","tag",s("toolbox.common.resolved"))),ne.appendChild(Ge(r.priority)),K.appendChild(ne),io(K,r,"quote","body");let dt=v&&!k()?K.querySelector(":scope > .quote"):null;dt!==null&&(dt.setAttribute("role","button"),dt.setAttribute("aria-label",s("toolbox.card.jumpToQuote",{quote:dt.textContent??""})),dt.tabIndex=0,dt.addEventListener("keydown",Ce=>{Ce.key!=="Enter"&&Ce.key!==" "||(Ce.preventDefault(),we(r.id))},{signal:t.signal}));let ln=ot(r,v);ln!==null&&K.appendChild(a("p","note",ln)),p&&r.resolvedBy!==null&&K.appendChild(a("p","note",s("toolbox.common.resolvedBy",{name:r.resolvedBy})));let Tr=w.editor!==null&&w.editor.targetId===r.id;if(!k())if(Tr&&w.editor!==null)K.appendChild(Hn(r));else{let Ce=a("div","card-actions");w.confirmDeleteId===r.id?(Ce.appendChild(a("span","hint",s("toolbox.common.confirmDeleteComment"))),Ce.appendChild(re(s("toolbox.common.remove"),ht,()=>{ao(r.id)},"is-danger")),Ce.appendChild(re(s("toolbox.common.cancel"),We,()=>{w.confirmDeleteId=null,n()}))):(je()&&(Ce.appendChild(L(s("toolbox.card.reply"),ma,()=>{w.editor={mode:"reply",targetId:r.id,body:"",priority:r.priority},w.confirmDeleteId=null,n()})),Ce.appendChild(p?L(s("toolbox.card.reopen"),qr,()=>{Dn(r,!1)}):L(s("toolbox.card.resolve"),ft,()=>{Dn(r,!0)}))),Ce.appendChild(L(s("toolbox.card.link"),Wt,()=>{Re(`${Pe()}#c=${r.id}`,s("toolbox.card.linkCopied"))})),r.body.length>0&&Ce.appendChild(L(s("toolbox.card.copyText"),Eo,()=>{Re(r.body,s("toolbox.card.textCopied"),s("toolbox.card.copyFailed"))})),E(r)&&(Ce.appendChild(L(s("toolbox.common.edit"),hn,()=>{w.editor={mode:"edit",targetId:r.id,body:r.body,priority:r.priority},w.confirmDeleteId=null,n()})),Ce.appendChild(L(s("toolbox.common.delete"),ht,()=>{w.confirmDeleteId=r.id,n()},"is-danger")))),Ce.childElementCount>0&&K.appendChild(Ce)}let dn=Le(r.id);if(dn.length>0){let Ce=a("div","replies");for(let Lr of dn)Ce.appendChild(On(Lr));K.appendChild(Ce)}return K}async function an(r){let p=w.editor;if(p!==null){if(p.mode==="edit"){let v=p.body.trim();if(v.length===0&&p.priority!=="good"){qe(s("toolbox.card.bodyRequired"));return}let I=await Xr(r.id,{body:v,priority:p.priority});if(t.disposed||!$(I))return}else{let v=p.body.trim();if(v.length===0&&p.priority!=="good"){qe(s("toolbox.card.replyRequired"));return}let I=await Jr({pageSlug:w.slug,parentId:r.id,quote:null,quoteContext:null,body:v,kind:"comment",priority:p.priority});if(t.disposed||!$(I))return}w.editor=null,await d(),t.disposed}}async function Dn(r,p){let v={resolvedAt:r.resolvedAt,resolvedBy:r.resolvedBy};r.resolvedAt=p?new Date().toISOString():null,r.resolvedBy=p?r.resolvedBy:null,n();let I=await Xr(r.id,{resolved:p});if(!t.disposed){if(!$(I)){r.resolvedAt=v.resolvedAt,r.resolvedBy=v.resolvedBy,n();return}await d(),t.disposed}}async function ao(r){let p=await Ro(r);t.disposed||$(p)&&(w.confirmDeleteId=null,w.activeId===r&&(w.activeId=null),await d(),t.disposed)}async function gt(){if(e.draft===null)return;let r=e.draft.body.trim();if(r.length===0&&e.draft.priority!=="good"){qe(s("toolbox.card.commentRequired"));return}let p={pageSlug:w.slug,quote:e.draft.anchor.quote,quoteContext:e.draft.anchor.context,body:r,kind:e.draft.kind,priority:e.draft.priority,marks:e.draft.marks,toastId:""};e.draft.marks=[],xe(),Ue(),B(),window.getSelection()?.removeAllRanges();for(let v of p.marks)Bs(v);p.toastId=x(s("toolbox.card.posting"),"pending"),await wr(p),t.disposed}async function wr(r){let p=await Jr({pageSlug:r.pageSlug,parentId:null,quote:r.quote,quoteContext:r.quoteContext,body:r.body,kind:r.kind,priority:r.priority});if(t.disposed)return;if(!p.ok){for(let I of r.marks)Ho(I,!0);D(r.toastId,"failure",s("toolbox.card.postFailed"),()=>so(r)),e.closeHandlers.set(r.toastId,()=>Tt(r.marks));return}D(r.toastId,"success",s("toolbox.card.posted")),Tt(r.marks);let v=w.open;await d(),!t.disposed&&xr(p.value.id,v)}function xr(r,p){let v=w.comments.find(I=>I.id===r);v!==void 0&&(!w.open&&!ml(He())||(w.view="comments",Xe(v)||(w.filter=Cn(v)),w.open?n():m(!0),p?ge(r):G(r)))}function so(r){e.closeHandlers.delete(r.toastId);for(let p of r.marks)Ho(p,!1);e.draft={anchor:{quote:r.quote??"",context:r.quoteContext??{beforeText:"",afterText:""}},kind:r.kind,priority:r.priority,body:r.body,marks:r.marks},e.draftFocused=!1,w.view="comments",Q()}function Pt(r){return r.composedPath().some(p=>p instanceof Element&&p.classList.contains(e.LIST_MENU_MARK))}function _n(){e.listMenuOpen&&(e.listMenuOpen=!1,n())}function sn(r,p,v,I){let H=a("button",p?"pick-row is-active":"pick-row");return H.type="button",H.setAttribute("aria-pressed",p?"true":"false"),H.appendChild(a("span",void 0,r)),I!==void 0&&H.appendChild(a("span","pick-count",String(I))),H.addEventListener("click",K=>{K.stopPropagation(),v()},{signal:t.signal}),H}function kr(){if(e.listMenuButton===null)return;let r=e.listMenuOpen||!Ks(w.filter,w.sort);e.listMenuButton.classList.toggle("is-active",r),e.listMenuButton.setAttribute("aria-expanded",e.listMenuOpen?"true":"false")}function Cr(){let r=w.view==="comments",p=k();e.listMenuButton!==null&&(e.listMenuButton.hidden=p),e.pickButton!==null&&(e.pickButton.hidden=!r||!p&&!T(),e.pickButton.classList.toggle("is-active",p),e.pickButton.setAttribute("aria-pressed",p?"true":"false"),e.pickButton.title=p?s("toolbox.list.stopPicking"):s("toolbox.list.pick"),e.pickButton.setAttribute("aria-label",e.pickButton.title)),e.exportTools!==null&&(e.exportTools.hidden=p),p&&(e.listMenuOpen=!1)}function lo(){if(e.listMenuBox===null||(kr(),e.listMenuBox.replaceChildren(),w.view!=="comments"))return;if(e.listMenuOpen){let v=_e(),I=a("div","list-menu"),H=a("div");H.appendChild(a("p","list-menu-label",s("toolbox.list.filterLabel")));for(let[ne,oe]of Gs(w.filter,v,Ie()))H.appendChild(sn(oe,w.filter===ne,()=>{ue(ne)},v[ne]));I.appendChild(H);let K=a("div");K.appendChild(a("p","list-menu-label",s("toolbox.list.sortLabel")));for(let[ne,oe]of ri)K.appendChild(sn(oe,w.sort===ne,()=>{w.sort=ne,n()}));I.appendChild(K),e.listMenuBox.appendChild(I),e.listMenuBox.hidden=!1;return}let r=Ws(w.filter,w.sort);if(r.length===0){e.listMenuBox.hidden=!0;return}let p=a("button","list-summary");p.type="button",p.textContent=r,p.title=s("toolbox.list.changeMenu"),p.addEventListener("click",v=>{v.stopPropagation(),e.listMenuOpen=!0,n()},{signal:t.signal}),e.listMenuBox.appendChild(p),e.listMenuBox.hidden=!1}function xt(){if(k())return null;let r=Us(w.filter,_e());if(r===null)return null;let p=a("button","list-summary is-tail");return p.type="button",p.textContent=r.label,p.addEventListener("click",v=>{v.stopPropagation(),ue(r.to)},{signal:t.signal}),p}function co(){let r=_e(),p=a("div","empty"),v=r.all===0,I=!v&&w.filter==="open";return p.appendChild(a("div","empty-title",v?s("toolbox.list.empty.nothing"):I?s("toolbox.list.empty.allDone"):s("toolbox.list.empty.filtered"))),v&&p.appendChild(a("div","empty-hint",s("toolbox.list.empty.hint"))),p}function uo(){if(e.listBox===null)return;let r=e.listBox.scrollTop;e.listBox.replaceChildren();let p=Ae();if(w.review!==null&&e.listBox.appendChild(yr()),p.length===0){e.listBox.appendChild(co());let I=xt();I!==null&&e.listBox.appendChild(I),e.listBox.scrollTop=r;return}for(let I of p)e.listBox.appendChild(rn(I));let v=xt();v!==null&&e.listBox.appendChild(v),e.listBox.scrollTop=r,Ye()}function Er(r){let p=a("div","sheet-compose"),v=a("div","quote-row");e.dockQuote=a("p","pop-quote",r.anchor.quote),v.appendChild(e.dockQuote);let I=a("button","icon-button");I.type="button",I.title=s("toolbox.common.cancel"),I.appendChild(ae(We,le.small)),I.addEventListener("click",()=>de(),{signal:t.signal}),v.appendChild(I),p.appendChild(v);let H=a("div","composer"),K=pe(oe=>{r.priority=oe,gt()});K.setEnabled(ve(r.body));let ne=me(r.body,s("toolbox.common.writeSomething"),oe=>{r.body=oe,K.setEnabled(ve(oe)),Ne()},{onPriority:oe=>{r.priority=oe,gt()},quoteWhenEmpty:()=>r.anchor.quote});return H.appendChild(ne),H.appendChild(K.row),p.appendChild(H),e.draftFocused||(e.draftFocused=!0,t.timeout(()=>ne.focus({preventScroll:!0}),0)),p}function Sr(){if(e.pickBar===null)return;if(!k()||w.view!=="comments"){e.pickBar.hidden=!0,e.pickBar.replaceChildren();return}let r=O(),p=Ae(),v=ii(r);e.pickBar.replaceChildren();let I=r.length===p.length,H=a("button","list-summary is-pick-all");H.type="button",H.textContent=I?s("toolbox.list.unpickAll"):s("toolbox.list.pickAll"),H.addEventListener("click",ne=>{ne.stopPropagation(),w.picked=I?new Set:new Set(p.map(oe=>oe.id)),n()},{signal:t.signal}),e.pickBar.appendChild(H);let K=a("button","button");if(K.type="button",K.textContent=s("toolbox.common.cancel"),K.addEventListener("click",ne=>{ne.stopPropagation(),J()},{signal:t.signal}),e.pickBar.appendChild(K),v!==null){let ne=a("button","button is-primary");ne.type="button",ne.appendChild(ae(v==="resolve"?ft:qr,le.small)),ne.appendChild(a("span",void 0,Ys(v,r.length))),ne.disabled=w.busy,ne.addEventListener("click",oe=>{oe.stopPropagation(),X()},{signal:t.signal}),e.pickBar.appendChild(ne)}e.pickBar.hidden=!1}return{dispose(){t.dispose()},topLevel:Te,repliesOf:Le,matchesFilter:Xe,inList:Ze,visibleForList:Ae,isMine:lt,canAct:je,picking:k,startPicking:F,stopPicking:J,outcomeOf:Z,outcomeTargetVersion:Be,outcomesToVersion:yt,stashEditReview:on,fillOutcomes:P,appendQuoteStory:io,editorBox:Hn,submitDraft:gt,onListMenu:Pt,closeListMenu:_n,paintPickButton:Cr,renderListMenu:lo,renderList:uo,sheetComposer:Er,renderPickBar:Sr,state:w}}function wl(e){let t=ct(),n=(...h)=>e.showError(...h),o=(...h)=>e.render(...h),i=(...h)=>e.showNotice(...h),d=(...h)=>e.clearCompare(...h),c=(...h)=>e.copyText(...h),b=(...h)=>e.pageUrl(...h),x=(...h)=>e.isComparing(...h),m=(...h)=>e.exitCompare(...h),S=(...h)=>e.setOpen(...h),R=(...h)=>e.handleFailure(...h),$=(...h)=>e.actionButton(...h),Y=(...h)=>e.isNarrow(...h),re=(...h)=>e.tokenPx(...h),L={origin:null,originJob:null,get features(){return e.state.features},set features(h){e.state.features=h},get visibility(){return e.state.visibility},set visibility(h){e.state.visibility=h},get slug(){return e.state.slug},set slug(h){e.state.slug=h},get currentVersion(){return e.state.currentVersion},set currentVersion(h){e.state.currentVersion=h},get compare(){return e.state.compare},set compare(h){e.state.compare=h},get view(){return e.state.view},set view(h){e.state.view=h},get busy(){return e.state.busy},set busy(h){e.state.busy=h}},pe="surprise-pages:origin-refresh",ve="surprise-pages:origin-hint",_=null,me=0,we=!1,Ge=0,Re=!1,Pe=0,qe=4500;function xe(){let h=document.querySelector('script[src^="/comments-widget.js"][data-page]');if(h===null)return null;let O=h.getAttribute("data-source-repo"),X=h.getAttribute("data-source-path"),Z=h.getAttribute("data-source-commit");return O===null||X===null||Z===null||O.length===0||X.length===0||Z.length===0?null:{repo:O,path:X,commit:Z}}function Ue(){return L.features.edit&&e.loadedVersion===null&&L.visibility==="internal"&&xe()!==null}function B(){let h=Vn(pe);if(h===null)return null;try{let O=JSON.parse(h);if(typeof O!="object"||O===null||Array.isArray(O))return null;let X={...O},Z=typeof X.slug=="string"?X.slug:null,Be=typeof X.agentId=="string"?X.agentId:null,yt=typeof X.url=="string"?X.url:null;if(Z===null||Be===null||yt===null)return null;let Rt=typeof X.startedVersion=="string"?X.startedVersion:null;return{slug:Z,agentId:Be,url:yt,startedVersion:Rt}}catch{return null}}function D(h){if(h===null){yn(pe,"");return}yn(pe,JSON.stringify(h))}function He(){me!==0&&(t.clearInterval(me),me=0)}function ge(h){L.originJob={status:"running",...h},D({slug:L.slug,...h}),Ye()}function G(){L.originJob!==null&&(L.originJob={...L.originJob,status:"done"},D(null),He())}function Q(h){L.originJob=null,D(null),He(),n(h),o()}function Ye(){He(),me=t.interval(()=>{de()},5e3),de()}async function de(){let h=L.originJob;if(h===null||h.status!=="running"){He();return}let O=await wn(L.slug);if(t.disposed||L.originJob!==h)return;if(O.ok){let Z=O.value.currentVersion;if(Z!==null&&h.startedVersion!==null&&Z!==h.startedVersion){L.currentVersion=Z,G(),i(s("toolbox.common.newVersion")),o();return}Z!==null&&h.startedVersion===null&&(L.currentVersion=Z)}let X=await hs(L.slug,h.agentId);if(!(t.disposed||L.originJob!==h)&&X.ok){if(X.value.status==="failed"){Q(s("toolbox.origin.failed"));return}if(X.value.status==="finished"){let Z=await wn(L.slug);if(t.disposed||L.originJob!==h)return;if(Z.ok&&Z.value.currentVersion!==null&&Z.value.currentVersion!==h.startedVersion){L.currentVersion=Z.value.currentVersion,G(),i(s("toolbox.common.newVersion")),o();return}G(),i(s("toolbox.common.newVersion")),o()}}}async function Ne(){if(we||L.origin!==null)return;if(!Ue()){L.origin={stale:!1};return}we=!0;let h=B();h!==null&&h.slug===L.slug&&ge({agentId:h.agentId,url:h.url,startedVersion:h.startedVersion});let O=await ps(L.slug);if(!t.disposed){if(!O.ok){L.origin={stale:!1},o();return}us(O.value)&&O.value.path!==null?L.origin={stale:!0,path:O.value.path,headDate:O.value.headDate,checked:O.value.checked,edited:O.value.edited}:(L.origin={stale:!1},L.originJob?.status==="running"&&(G(),i(s("toolbox.common.newVersion")))),o()}}function w(){let h=L.origin,O=h!==null&&h.stale?h.path:s("toolbox.origin.sourceWord"),X=h!==null&&h.stale?h.headDate:null,Z=X===null?s("toolbox.origin.confirm",{path:O}):s("toolbox.origin.confirmDated",{path:O,day:X});return document.head.querySelector("script[data-deck-design]")!==null?`${Z} ${s("toolbox.origin.keepAppearance")}`:Z}let De=s("toolbox.origin.editedCopy");function nt(){let h=L.origin;return h===null||!h.stale||h.edited!==!0?null:De}function Te(h,O,X){return{sha:O,shortSha:O.length>=7?O.slice(0,7):O,number:null,authorName:h,committedAt:X??"",message:"",changeCount:null}}function Le(){Ge+=1,Re=!1,L.compare!==null&&L.compare.kind==="origin"&&d()}function Je(){if(!Ue())return;if(document.body.hasAttribute("data-deck")){c(`${b()}
このスライドを原稿から更新したいです。保存済みの最新版を読み、原稿との差分を比較して、採用する箇所だけ反映してください。現在の本文を原稿で一括上書きしないでください。`,s("toolbox.origin.requestCopied"));return}if(L.origin===null||!L.origin.stale||L.originJob!==null)return;x()&&L.compare?.kind!=="origin"&&m(),Ge+=1,Re=!1;let h=L.origin.headDate;L.compare={kind:"origin",from:Te(s("toolbox.origin.cited"),"cited",null),to:Te(s("toolbox.origin.latest"),"head",h),diff:null,placed:new Set,activeIndex:0},L.view="origin",S(!0),Ie()}async function Ie(){if(L.compare===null||L.compare.kind!=="origin")return;let h=Ge,O=await ls(L.slug);if(!t.disposed&&h===Ge&&!(L.compare===null||L.compare.kind!=="origin")){if(!O.ok){if(O.status===401){R(O);return}Re=!0,o();return}L.compare.from=Te(s("toolbox.origin.cited"),O.value.cited.sha,O.value.cited.at),L.compare.to=Te(s("toolbox.origin.latest"),O.value.head.sha,O.value.head.at),L.compare.diff=O.value.diff,Re=!1,o()}}async function Xe(){if(L.busy)return;L.busy=!0,o();let h=await fs(L.slug);if(!t.disposed){if(L.busy=!1,!h.ok){if(h.status===409){Le(),L.origin={stale:!1},L.view="comments",S(!1),i(s("toolbox.origin.alreadyImported")),o();return}R(h);return}Le(),L.view="comments",S(!1),ge({agentId:h.value.agentId,url:h.value.url,startedVersion:L.currentVersion}),i(s("toolbox.origin.started")),o()}}function _e(h){let O=a("div","change");O.appendChild(a("span","change-kind",e.CHANGE_KINDS[h.kind]));let X=h.kind==="add"?"change-text is-add":h.kind==="del"?"change-text is-del":"change-text",Z=a("div","change-main");return Z.appendChild(a("div",X,h.text)),O.appendChild(Z),O}function Ze(){let h=a("div","origin-diff");if(Re)return h.appendChild(a("p","note",s("toolbox.origin.diffFailed"))),h;let O=L.compare;if(O===null||O.kind!=="origin")return h;if(O.diff===null)return h.appendChild(a("p","note",s("toolbox.origin.diffLoading"))),h;if(O.diff.identical)return h.appendChild(a("p","note",s("toolbox.origin.same"))),h;O.diff.coarse&&h.appendChild(a("p","note",s("toolbox.history.coarseNote")));for(let X of O.diff.changes)h.appendChild(_e(X));return h}function Ae(){let h=a("div","access"),O=a("div","access-confirm");O.appendChild(a("p","access-warning",w()));let X=nt();X!==null&&O.appendChild(a("p","access-warning",X)),O.appendChild(Ze());let Z=a("div","access-row"),Be=$(s("toolbox.origin.take"),Co,()=>{Xe()},"is-strong");return L.busy&&(Be.disabled=!0),Z.appendChild(Be),Z.appendChild($(s("toolbox.common.cancel"),We,()=>{if(L.compare?.kind==="origin"){m();return}L.view="comments",S(!1)})),O.appendChild(Z),h.appendChild(O),h}function lt(){return`${ve}:${L.slug}`}function je(){return Vn(lt())==="1"}function E(){yn(lt(),"1")}function k(){return _===null||e.bar===null||e.bar.hidden||!Ue()||L.origin===null||!L.origin.stale||!L.origin.checked||L.originJob!==null?!1:e.bar.querySelector(".bar-more")!==null}function T(){Pe!==0&&(t.clearTimeout(Pe),Pe=0),_!==null&&(_.hidden=!0)}function F(){if(_===null||e.bar===null||e.root===null)return;let h=e.root.host;if(!(h instanceof HTMLElement))return;let O=h.getBoundingClientRect(),X=e.bar.getBoundingClientRect(),Z=e.bar.querySelector(".bar-more"),Be=!Y()&&Z instanceof HTMLElement?Z.getBoundingClientRect():X;_.style.bottom=`${Math.round(O.bottom-X.top+re("--space-2"))}px`,_.style.right=`${Math.round(O.right-Be.right)}px`}function J(){if(_!==null){if(!_.hidden){if(!k()){T();return}F();return}!k()||je()||(_.hidden=!1,E(),F(),Pe=t.timeout(()=>T(),qe))}}function ue(){let h=a("div","origin-hint");h.hidden=!0;let O=a("button","origin-hint-open");O.type="button",O.appendChild(a("span","origin-hint-text",s("toolbox.origin.hint"))),O.addEventListener("click",()=>{T(),Je()},{signal:t.signal});let X=a("button","icon-button");return X.type="button",X.title=s("toolbox.common.close"),X.setAttribute("aria-label",s("toolbox.common.close")),X.appendChild(ae(We,le.small)),X.addEventListener("click",Z=>{Z.stopPropagation(),T()},{signal:t.signal}),h.appendChild(O),h.appendChild(X),h}return{dispose(){t.dispose(),Ge+=1},originEntryAllowed:Ue,probeOriginOnce:Ne,closeOriginCompare:Le,openOriginConfirm:Je,originView:Ae,renderOriginHint:J,buildOriginHint:ue,get originHint(){return _},set originHint(h){_=h},get originDiffError(){return Re},set originDiffError(h){Re=h},state:L}}var Jo={intervalMs:5e3,idleAfterMs:6e5,failureMaxMs:6e4};function xl(e){return!e.visible||e.editing||e.idleForMs>=Jo.idleAfterMs?null:e.failures<=0?Jo.intervalMs:Math.min(Jo.intervalMs*2**e.failures,Jo.failureMaxMs)}var Rc=["pointerdown","keydown","wheel","touchstart","scroll"];function kl(e){let{lifetime:t}=e,n=0,o=!1,i=0,d=Date.now();function c(){return document.visibilityState==="visible"}function b(){n!==0&&(t.clearTimeout(n),n=0)}function x(){b();let Y=xl({visible:c(),editing:e.editing(),idleForMs:Date.now()-d,failures:i});Y!==null&&(n=t.timeout(()=>{m(!0)},Y))}async function m(Y){if(n=0,o||t.disposed)return;o=!0;let re=await e.refresh({quiet:Y});o=!1,!t.disposed&&(i=re?0:i+1,x())}function S(){d=Date.now(),i=0,b(),m(!1)}function R(){d=Date.now(),n===0&&!o&&x()}function $(){document.addEventListener("visibilitychange",()=>{c()?S():b()},{signal:t.signal}),window.addEventListener("focus",S,{signal:t.signal});for(let Y of Rc)window.addEventListener(Y,R,{passive:!0,capture:!0,signal:t.signal});x()}return{start:$,resume:S,stop:b}}var Xo={open:!1,openedBy:null,commentId:null};function Cl(e,t=null){return{open:!0,openedBy:e,commentId:t}}function hi(e,t){return{open:e.open,openedBy:e.openedBy,commentId:t}}function Pc(e,t){return e.openedBy!==null&&e.openedBy===t}function El(e,t,n){return!e.open||Pc(e,t)||n?e:Xo}function mi(){return Xo}function Sl(e){let t=ct(),n=(...l)=>e.isComparing(...l),o=(...l)=>e.inList(...l),i=(...l)=>e.picking(...l),d=(...l)=>e.matchesFilter(...l),c=(...l)=>e.render(...l),b=(...l)=>e.avatarFor(...l),x=(...l)=>e.visibleForList(...l),m=(...l)=>e.priorityTag(...l),S=(...l)=>e.appendQuoteStory(...l),R=(...l)=>e.editorBox(...l),$=(...l)=>e.repliesOf(...l),Y=(...l)=>e.isMine(...l),re=(...l)=>e.actionButton(...l),L=(...l)=>e.iconAction(...l),pe=(...l)=>e.afterChange(...l),ve=(...l)=>e.refresh(...l),_=(...l)=>e.watchChanges(...l),me=(...l)=>e.prioritySendRow(...l),we=(...l)=>e.submitDraft(...l),Ge=(...l)=>e.canSend(...l),Re=(...l)=>e.textArea(...l),Pe=(...l)=>e.canAct(...l),qe=(...l)=>e.readOnly(...l),xe=(...l)=>e.showError(...l),Ue=(...l)=>e.sheetComposer(...l),B={anchored:new Set,activeId:null,get comments(){return e.state.comments},set comments(l){e.state.comments=l},get filter(){return e.state.filter},set filter(l){e.state.filter=l},get open(){return e.state.open},set open(l){e.state.open=l},get editor(){return e.state.editor},set editor(l){e.state.editor=l},get confirmDeleteId(){return e.state.confirmDeleteId},set confirmDeleteId(l){e.state.confirmDeleteId=l},get width(){return e.state.width},set width(l){e.state.width=l},get view(){return e.state.view},set view(l){e.state.view=l}},D=null;function He(l,g){if(g===null){l.removeAttribute("role"),l.removeAttribute("aria-label");return}l.setAttribute("role","group"),l.setAttribute("aria-label",g)}let ge=null,G=null,Q=null,Ye=!1,de=Xo,Ne=null,w=!1,De=!1,nt=0,Te=!1,Le=null,Je=null,Ie=null,Xe=null,_e=null,Ze=!1;function Ae(){for(let l of B.comments)for(let g of No(l.id))Kn(g,l,l.id===B.activeId)}let lt=null;function je(l=!1){if(n())return;let g=o(),M=g.map(V=>`${V.id}:${V.resolvedAt===null?"0":"1"}`).join(",");!l&&M===lt||(lt=M,B.anchored=$s(g),Ae())}let E=1200,k=null;function T(l){k={id:l,until:Date.now()+E},J()}function F(l){if(T(l),e.listBox===null)return;let g=e.listBox.querySelector(`[data-card-id="${CSS.escape(l)}"]`);g instanceof HTMLElement&&g.scrollIntoView({block:"center",behavior:"smooth"})}function J(){if(k===null||e.listBox===null)return;let l=k.until-Date.now();if(l<=0){k=null;return}let g=e.listBox.querySelector(`[data-card-id="${CSS.escape(k.id)}"]`);g instanceof HTMLElement&&(g.classList.add("is-flash"),t.timeout(()=>g.classList.remove("is-flash"),l))}function ue(l,g){if(i())return;B.activeId=l;let M=B.comments.find(V=>V.id===l);if(M!==void 0&&!d(M)&&(B.filter=Cn(M)),ot()){Ae(),c(),un()||P(l,g);return}B.open||Pt(!0),Ae(),c(),F(l)}function h(){de.open&&(de=mi(),Ne=null,w=!1,t.clearTimeout(ke),N=!1,ee=null,C(0,!1),D!==null&&(D.hidden=!0,D.replaceChildren(),He(D,null),D.className="popover"),c())}function O(){return de.open}function X(l){let g=a("div","peek-slide");g.appendChild(a("div","peek-grab"));let M=l.resolvedAt!==null,V=B.editor!==null&&B.editor.targetId===l.id,W=B.confirmDeleteId===l.id,se=a("div","card-head");se.appendChild(b(l.author));let ie=a("div");ie.appendChild(a("div","who-name",l.author.name));let U=a("div","who-time",_t(l.createdAt));U.title=pt(l.createdAt),ie.appendChild(U),se.appendChild(ie),se.appendChild(a("span","spacer"));let j=x(),rt=j.findIndex(it=>it.id===l.id);j.length>1&&rt>=0&&se.appendChild(a("span","who-time",`${rt+1} / ${j.length}`)),M&&se.appendChild(a("span","tag",s("toolbox.common.resolved"))),se.appendChild(m(l.priority)),g.appendChild(se);let Ee=a("div","peek-body");if(S(Ee,l,"pop-quote","peek-text"),M&&l.resolvedBy!==null&&Ee.appendChild(a("p","note",s("toolbox.common.resolvedBy",{name:l.resolvedBy}))),g.appendChild(Ee),V)return g.appendChild(R(l)),g;let et=a("div","peek-foot"),qt=$(l.id).length;et.appendChild(a("span","hint",qt===0?s("toolbox.peek.noReplies"):s("toolbox.peek.replies",{count:qt})));let Ot=a("button","peek-more");if(Ot.type="button",Ot.textContent=s("toolbox.peek.showAll"),Ot.addEventListener("click",()=>on(),{signal:t.signal}),et.appendChild(Ot),g.appendChild(et),Y(l)&&Pe()){let it=a("div","peek-actions");W?(it.appendChild(a("span","hint",s("toolbox.common.confirmDeleteComment"))),it.appendChild(re(s("toolbox.common.remove"),ht,()=>{gr(l.id)},"is-danger")),it.appendChild(re(s("toolbox.common.cancel"),We,()=>{B.confirmDeleteId=null,c()}))):(it.appendChild(L(s("toolbox.common.edit"),hn,()=>{B.editor={mode:"edit",targetId:l.id,body:l.body,priority:l.priority},B.confirmDeleteId=null,c()})),it.appendChild(L(s("toolbox.common.delete"),ht,()=>{B.confirmDeleteId=l.id,B.editor=null,c()},"is-danger"))),g.appendChild(it)}return g}function Z(){return de.commentId===null?-1:x().findIndex(l=>l.id===de.commentId)}function Be(){if(D===null||!de.open||de.commentId===null)return;let l=x(),g=l.findIndex(M=>M.id===de.commentId);if(g<0){h();return}Ne=a("div","peek-track");for(let M of[-1,0,1]){let V=l[g+M],W=a("div","peek-slot");V!==void 0&&W.appendChild(X(V)),Ne.appendChild(W)}A(0,!1),D.replaceChildren(),D.appendChild(Ne),C(0,!1),Ae()}function yt(l,g){if(!(l instanceof Element))return null;let M=l.closest(g);return M instanceof HTMLElement&&M.scrollHeight>M.clientHeight?M:null}function Rt(l,g){let M=null,V=0,W=0,se=0,ie="undetermined";l.addEventListener("pointerdown",j=>{j.pointerType!=="mouse"&&(M=yt(j.target,g),V=j.clientX,W=j.clientY,se=j.clientY,ie="undetermined")},{signal:t.signal}),l.addEventListener("pointermove",j=>{M!==null&&(ie==="undetermined"&&(ie=gn(j.clientX-V,j.clientY-W)),ie==="vertical"&&(j.preventDefault(),M.scrollTop-=j.clientY-se,se=j.clientY))},{passive:!1,signal:t.signal});let U=()=>{M=null};l.addEventListener("pointerup",U,{signal:t.signal}),l.addEventListener("pointercancel",U,{signal:t.signal})}function on(){let l=de.commentId,g=u();De=!0,D?.classList.add("is-handoff"),g>0&&C(-g,!0),Pt(!0),e.panel?.classList.add("is-rising"),l!==null&&(B.activeId=l,Ae(),c(),t.frame(()=>F(l))),t.timeout(()=>{De=!1,D?.classList.remove("is-handoff"),e.panel?.classList.remove("is-rising"),h()},Ht)}function u(){return D===null?0:D.getBoundingClientRect().height}function C(l,g){D!==null&&(D.classList.toggle("is-dropping",g),D.style.transform=l===0?"":`translateY(${Math.round(l)}px)`)}function A(l,g,M=Ht){Ne!==null&&(Ne.classList.toggle("is-sliding",g),Ne.style.transitionDuration=g?`${M}ms`:"",Ne.style.transform=`translateX(calc(-100% / 3 + ${Math.round(l)}px))`)}function P(l,g){D!==null&&B.comments.find(M=>M.id===l)!==void 0&&(B.open&&Pt(!1),B.editor=null,B.confirmDeleteId=null,D.className="popover is-peek",He(D,s("toolbox.common.comment")),D.style.left="",D.style.top="",oe(),D.hidden=!1,de=Cl(g??D,l),c())}let N=!1,ee=null,ke=0;function wt(l,g,M){let V=x(),W=Z(),se=V[W+l],ie=D?.getBoundingClientRect().width??0;if(l===0||W<0||se===void 0||ie===0){A(0,!0,Ur(Math.abs(M),g,Ht));return}let U=-l*ie,j=Ur(Math.abs(U-M),g,Ht);N=!0,ee=se.id,A(U,!0,j),ke=t.timeout(()=>$t(se.id),j)}function $t(l){t.clearTimeout(ke),N=!1,ee=null,O()&&(B.activeId=l,de=hi(de,l),B.editor=null,B.confirmDeleteId=null,c())}async function gr(l){let g=x(),M=g.findIndex(se=>se.id===l),V=g[M+1]??g[M-1]??null,W=await Ro(l);t.disposed||pe(W)&&(B.confirmDeleteId=null,B.activeId===l&&(B.activeId=null),V!==null&&(B.activeId=V.id,de=hi(de,V.id)),await ve(),!t.disposed&&V===null&&h())}function io(l){let g=0,M=0,V=0,W="undetermined",se=!1,ie=!1,U=()=>de.commentId!==null&&(B.editor!==null&&B.editor.targetId===de.commentId||B.confirmDeleteId===de.commentId),j=Ee=>yt(Ee,".peek-body")!==null;l.addEventListener("pointerdown",Ee=>{!O()||U()||(N&&ee!==null&&$t(ee),g=Ee.clientX,M=Ee.clientY,V=Ee.timeStamp,W="undetermined",se=!0,ie=j(Ee.target),w=!0)},{signal:t.signal}),l.addEventListener("pointermove",Ee=>{if(!se)return;let et=Ee.clientX-g,qt=Ee.clientY-M;if(W==="undetermined"&&(W=gn(et,qt)),W==="vertical"){if(ie){se=!1,w=!1;return}C(qt,!1),Ee.preventDefault();return}if(W!=="horizontal")return;Ee.preventDefault();let Ot=x(),it=Z(),mo=et>0&&it<=0||et<0&&it>=Ot.length-1;A(mo?Yr(et):et,!1)},{passive:!1,signal:t.signal});let rt=Ee=>{if(!se)return;se=!1,w=!1;let et=Ee.clientX-g,qt=Ee.clientY-M;if(W==="vertical"){let rc=l.getBoundingClientRect().height,oa=Ga(et,qt);if(oa==="none"){C(0,!0);return}if(oa==="down"){C(rc,!0),t.timeout(()=>h(),Ht);return}on();return}if(W!=="horizontal")return;let Ot=Math.max(1,Ee.timeStamp-V),it=l.getBoundingClientRect().width,mo=et/Ot;wt(ja(et,mo,it),mo,et)};l.addEventListener("pointerup",rt,{signal:t.signal}),l.addEventListener("pointercancel",Ee=>rt(Ee),{signal:t.signal})}function vr(l){B.activeId=l,Ae(),c();let g=No(l);g.length>0&&g[0].scrollIntoView({block:"center",behavior:"smooth"})}function ot(){return Va(window.innerWidth)}function br(){return window.matchMedia("(pointer: fine)").matches}let In=null;function yr(){return In??(In=Ya(navigator.platform,navigator.userAgent)),In}function On(l){return $a(l,window.innerWidth)}let Hn=Ve.base;function zt(){if(e.readingNavigation!==null){e.readingNavigation.setPanel(B.open&&!ot()?B.width:0);return}let l=document.documentElement;e.originalPaddingRight===null&&(e.originalPaddingRight=l.style.paddingRight),l.style.transition=`padding-right ${Hn}ms ${$e}`;let g=B.open&&!ot();l.style.paddingRight=g?`${B.width}px`:e.originalPaddingRight}function Nn(){let l=ot();e.root!==null&&(e.root.host.classList.toggle("is-narrow",l),e.root.host instanceof HTMLElement&&e.root.host.style.setProperty("--tools-panel-offset",B.open&&!l?`${B.width}px`:"0px")),e.panel!==null&&(e.panel.style.width=l?"":`${B.width}px`,an(),so())}let rn="half";function an(){if(e.panel!==null){if(e.panel.classList.remove("is-half","is-expanded"),!ot()){e.panel.style.top="";return}e.panel.style.top="",e.panel.classList.add(rn==="expanded"?"is-expanded":"is-half")}}function Dn(l){if(l==="closed"){Pt(!1);return}rn=l,an()}function ao(l){let g=0,M=0,V=!1,W=!1,se=()=>gl(Bn(),wr(),xr());l.addEventListener("pointerdown",U=>{!ot()||e.panel===null||(W=!0,V=!1,g=U.clientY,M=e.panel.getBoundingClientRect().top,e.panel.classList.add("is-dragging"),l.setPointerCapture(U.pointerId))},{signal:t.signal}),l.addEventListener("pointermove",U=>{if(!W||e.panel===null)return;let j=U.clientY-g;Math.abs(j)>4&&(V=!0),e.panel.style.top=`${Math.max(0,M+j)}px`},{signal:t.signal});let ie=U=>{if(!W||e.panel===null)return;if(W=!1,e.panel.classList.remove("is-dragging"),!V){e.panel.style.top="",Dn(bl(rn));return}let j=Math.max(0,M+(U.clientY-g));e.panel.style.top="",Dn(vl(j,se()))};l.addEventListener("pointerup",ie,{signal:t.signal}),l.addEventListener("pointercancel",U=>ie(U),{signal:t.signal})}function gt(l){if(e.root===null)return 0;let g=getComputedStyle(e.root.host).getPropertyValue(l).trim(),M=Number.parseFloat(g);return Number.isFinite(M)?M:0}function wr(){return gt("--safe-top")}function xr(){return gt("--space-7")+gt("--toast-lane")+gt("--compare-bar")+gt("--top-lane")}function so(){if(e.panel===null)return;if(!ot()){e.panel.style.bottom="";return}let l=window.visualViewport,g=l==null?0:fi(Bn(),l.height,l.offsetTop);e.panel.style.bottom=g===0?"":`${g}px`}function Pt(l){l&&e.readingNavigation?.close(!1),Ze=!1;let g=ul(_n(),l);l&&!B.open&&(rn="half"),B.open=g.sheetOpen,sn(g),zt(),c(),n()&&t.timeout(()=>Un(),Hn)}function _n(){return{sheetOpen:B.open,dockOpen:un(),hasDraft:Q!==null}}function sn(l){l.hasDraft||(Q!==null&&Tt(Q.marks),Q=null,Ye=!1)}function kr(l){ot()||(B.width=On(l),bn(e.STORAGE_WIDTH,String(B.width)),Nn(),zt())}function Cr(){ot()||(B.width=On(B.width)),Nn(),zt(),c(),n()&&(Un(),_())}function lo(l){if(D===null)return;D.hidden=!1;let g=D.offsetWidth,M=D.offsetHeight,{gap:V,edge:W}=xo,se=l.left+l.width/2-g/2,ie=Math.min(window.innerWidth-g-W,Math.max(W,se)),U=window.innerHeight-W-(l.bottom+V),j=l.top-V-W,rt=l.bottom+V;U<M&&(j>=M?rt=l.top-V-M:U>=j?rt=Math.max(W,window.innerHeight-W-M):rt=W),D.style.left=`${ie}px`,D.style.top=`${rt}px`}function xt(){Q!==null&&Tt(Q.marks),Q=null,Ye=!1;let l=de.open;l&&(de=mi());let g=e.moreMenuOpen;e.moreMenuOpen=!1,D!==null&&(D.hidden=!0,D.replaceChildren(),He(D,null),D.className="popover"),(l||g)&&c(),g&&e.moreButton?.focus({preventScroll:!0})}let co="";function uo(l){return e.iconAction(s("toolbox.selection.copy"),Eo,()=>{e.copyText(l,s("toolbox.common.copied"),s("toolbox.selection.copyFailed"))},"selection-aside")}function Er(l){co=window.getSelection()?.toString()||l.quote;let g=Q,M=g!==null&&g.anchor.quote===l.quote&&g.marks.length>0&&g.marks.every(W=>W.isConnected),V=[];if(g!==null&&M)V=g.marks;else{g!==null&&Tt(g.marks);let W=Ce();W!==null&&(V=dn(W))}Q={anchor:qn(l),kind:"comment",priority:"want",body:"",marks:V}}function Sr(l,g){D!==null&&(Er(l),p(g))}function r(l,g,M){qa(M)&&Sr(l,g)}function p(l){if(D===null||Q===null)return;let g=Q;D.className="popover",He(D,s("toolbox.selection.surface")),D.replaceChildren();let M=a("div","quote-row");M.appendChild(a("p","pop-quote",g.anchor.quote)),M.appendChild(uo(co));let V=a("button","icon-button");V.type="button",V.title=s("toolbox.common.close"),V.appendChild(ae(We,le.small)),V.addEventListener("click",()=>xt(),{signal:t.signal}),M.appendChild(V),D.appendChild(M);let W=a("div","composer"),se=me(U=>{g.priority=U,we()});se.setEnabled(Ge(g.body));let ie=Re(g.body,s("toolbox.common.writeSomething"),U=>{g.body=U,se.setEnabled(Ge(U))},{onPriority:U=>{g.priority=U,we()},quoteWhenEmpty:()=>g.anchor.quote});W.appendChild(ie),W.appendChild(se.row),D.appendChild(W),lo(l),t.timeout(()=>ie.focus({preventScroll:!0}),0)}let v=["is-compact","is-peek","is-menu"];function I(){if(D===null||D.hidden)return!1;let l=D.classList;return!v.some(g=>l.contains(g))}function H(){return Q!==null&&!Ge(Q.body)}function K(){if(n()){oe();return}if(I()&&!H())return;if(un()){Lr();return}if(Q!==null&&ot())return;let l=Oo(),g=za(window.innerWidth,l!==null);if(g==="none"||l===null){de=de,oe(),D!==null&&!D.hidden&&!I()&&!O()&&xt();return}if(g==="bar"){if(!Pe()){oe(),qe()||xe(s("toolbox.common.sessionExpired"));return}fe(l);return}let M=window.getSelection(),V=M!==null&&M.rangeCount>0?M.getRangeAt(0).getBoundingClientRect():null;if(V===null||V.width+V.height===0){xt();return}if(Pe()){r(l,V,g);return}xt(),qe()||xe(s("toolbox.common.sessionExpired"))}function ne(){t.clearTimeout(nt),!Te&&(nt=t.timeout(()=>{Te||K()},Ka(window.innerWidth)))}function oe(){Le=null,Je=null,!(ge===null||ge.hidden)&&(ge.classList.remove("is-shown"),ge.hidden=!0,ge.replaceChildren(),c())}function fe(l){if(ge===null)return;h(),Le=qn(l),Je=ln()?.cloneRange()??null,ge.replaceChildren();let g=a("span","selbar-quote",Le.quote);g.title=Le.quote,ge.appendChild(g);let M=a("button","selbar-action");M.type="button",M.appendChild(ae(ko,le.small)),M.appendChild(a("span",void 0,s("toolbox.common.comment"))),M.addEventListener("click",()=>dt(),{signal:t.signal}),ge.appendChild(uo(window.getSelection()?.toString()||l.quote)),ge.appendChild(M),ge.hidden=!1,t.frame(()=>ge?.classList.add("is-shown")),c()}function dt(){let l=Oo(),g=l!==null?qn(l):Le;if(g===null){oe();return}Xe=Yd();let M=Tr();Q={anchor:g,kind:"comment",priority:"want",body:"",marks:M},Ye=!1,oe(),window.getSelection()?.removeAllRanges(),B.view="comments",na()}function ln(){let l=window.getSelection();return l===null||l.rangeCount===0||l.isCollapsed?null:l.getRangeAt(0)}function Tr(){let l=ln()??Je;return l===null?[]:dn(l)}function dn(l){try{return _s(l)}catch{return[]}}function Ce(){let l=ln();if(l===null)return null;let g=l.commonAncestorContainer,M=g instanceof Element?g:g.parentElement;return M===null||M.closest(Ke)!==null?null:l}function Lr(){if(Q===null)return;let l=Ce();if(l===null)return;let g=Oo();g!==null&&g.quote!==Q.anchor.quote&&(Tt(Q.marks),Q.anchor=qn(g),Q.marks=dn(l),window.getSelection()?.removeAllRanges(),Ud(Q.anchor.quote))}function Ud(l){Ie!==null&&(Ie.textContent=l,Ie.classList.add("is-swapped"),t.timeout(()=>Ie?.classList.remove("is-swapped"),400))}function Yd(){let l=window.getSelection();if(l===null||l.rangeCount===0)return null;let g=l.getRangeAt(0).startContainer,M=g instanceof Element?g:g.parentElement;return M===null||M.closest(Ke)!==null?null:M}function ji(){Or()}function Jd(){Q!==null&&(un()?ji():xt())}let It=0,Ar=0,cn=!1;function Mr(){if(G===null)return;let l=It+Ar;G.style.transform=l===0?"":`translateY(${l}px)`,G.classList.toggle("is-compact",It<0)}function Rr(l,g){G!==null&&(G.classList.toggle("is-dropping",g),Ar=l,Mr())}function Bn(){let l=document.documentElement.clientHeight;return l>0?l:window.innerHeight}function Xd(){if(G===null||G.hidden||cn)return;let l=window.visualViewport;It=-(l==null?0:fi(Bn(),l.height,l.offsetTop)),Mr()}function Qi(){if(G===null||G.hidden||cn)return!1;let l=window.visualViewport;if(l==null)return!1;let g=G.getBoundingClientRect().bottom,M=g-It,V=il(M,Bn(),l.height,l.offsetTop);return sl(g,V)?(It=al(It,g,V),Mr(),!0):!1}function Pr(){if(G===null||G.hidden||e.root===null)return!1;let l=e.root.activeElement;return l!==null&&G.contains(l)}let po=!1;function jd(){if(po)return;po=!0;let l=!1,g=()=>{if(!Pr()){po=!1;return}Qi()?l=!0:l&&(l=!1,ea()),t.frame(g)};t.frame(g)}let Qd=400,Zi=0,fo=!1;function ho(){if(Zi=Date.now()+Qd,fo)return;fo=!0;let l=()=>{if(Xd(),Qi(),G!==null&&!G.hidden&&Date.now()<Zi){t.frame(l);return}fo=!1,ea()};t.frame(l)}function Zd(){G===null||Q===null||(G.replaceChildren(),Ie=null,G.appendChild(a("div","peek-grab")),G.appendChild(Ue(Q)))}function Ir(){if(G===null||G.hidden)return;let l=document.documentElement;_e===null&&(_e=l.style.scrollPaddingBottom);let g=Math.max(0,Bn()-G.getBoundingClientRect().top);l.style.scrollPaddingBottom=`${Math.round(g)}px`}function ea(){if(G===null||G.hidden||Q===null)return;let l=Q.marks[0];if(l===void 0)return;let M=window.visualViewport?.offsetTop??0,V=G.getBoundingClientRect().top,W=l.getBoundingClientRect();ll(W.top,W.bottom,M,V)||(Ir(),l.scrollIntoView({block:"nearest",behavior:"smooth"}))}function ec(){Xe!==null&&(Ir(),Xe.scrollIntoView({block:"nearest",behavior:"smooth"}))}function ta(){_e!==null&&(document.documentElement.style.scrollPaddingBottom=_e,_e=null)}function na(){if(G===null||Q===null)return;e.readingNavigation?.close(!1);let l=pl(_n());B.open&&!l.sheetOpen&&Pt(!1),sn(l),oe(),h(),Zd(),G.hidden=!1,ho(),ec(),c()}function Or(){Q!==null&&Q.marks.length>0&&Tt(Q.marks),sn(fl(_n())),Xe=null,ta(),G!==null&&(G.hidden=!0,G.replaceChildren(),It=0,Ar=0,cn=!1,G.classList.remove("is-dropping"),G.style.transform=""),c()}function un(){return G!==null&&!G.hidden}function tc(l){let g=0,M=0,V="undetermined",W=!1;l.addEventListener("pointerdown",ie=>{un()&&(ie.target instanceof Element&&ie.target.closest("textarea, input, button")!==null||(g=ie.clientX,M=ie.clientY,V="undetermined",W=!0))},{signal:t.signal}),l.addEventListener("pointermove",ie=>{if(!W)return;let U=ie.clientX-g,j=ie.clientY-M;V==="undetermined"&&(V=gn(U,j)),V==="vertical"&&(ie.preventDefault(),cn=!0,Rr(j>0?j:Yr(j),!1))},{passive:!1,signal:t.signal});let se=ie=>{if(!W||(W=!1,!cn))return;let U=ie.clientY-M;if(!Wa(ie.clientX-g,U)){Rr(0,!0),t.timeout(()=>{cn=!1,ho()},Ht);return}let j=l.getBoundingClientRect().height;Rr(rl(j,It),!0),t.timeout(()=>Or(),Ht)};l.addEventListener("pointerup",se,{signal:t.signal}),l.addEventListener("pointercancel",ie=>se(ie),{signal:t.signal})}function nc(){let l=0,g=0,M=!1,V=!1,W=(U,j,rt)=>{Pr()&&(l=j,g=rt,M=G!==null&&U.composedPath().includes(G),V=!0)},se=(U,j)=>{!V||!ol({keyboardVisible:Pr(),startedInDock:M,dx:U-l,dy:j-g})||(V=!1,oc())},ie=()=>{V=!1};document.addEventListener("pointerdown",U=>W(U,U.clientX,U.clientY),{capture:!0,signal:t.signal}),document.addEventListener("pointermove",U=>se(U.clientX,U.clientY),{capture:!0,signal:t.signal}),document.addEventListener("pointerup",ie,{capture:!0,signal:t.signal}),document.addEventListener("touchstart",U=>{let j=U.touches[0];j!==void 0&&W(U,j.clientX,j.clientY)},{capture:!0,passive:!0,signal:t.signal}),document.addEventListener("touchmove",U=>{let j=U.touches[0];j!==void 0&&se(j.clientX,j.clientY)},{capture:!0,passive:!0,signal:t.signal}),document.addEventListener("touchend",ie,{capture:!0,signal:t.signal})}function oc(){let l=e.root?.activeElement;l instanceof HTMLElement&&l.blur(),ho()}return{dispose(){t.dispose(),po=!1,fo=!1,ta()},syncMarks:je,flashCard:T,focusCard:F,applyFocus:J,selectFromMark:ue,hideMarkPeek:h,isPeeking:O,renderPeek:Be,attachInnerScroll:Rt,get peekSliding(){return N},set peekSliding(l){N=l},attachPeekGestures:io,selectFromCard:vr,isNarrow:ot,hasFinePointer:br,appleKeys:yr,clampWidth:On,applyPush:zt,applyPanelShape:Nn,attachSheetDrag:ao,tokenPx:gt,applyViewportHeight:so,setOpen:Pt,setWidth:kr,handleResize:Cr,placePopover:lo,hidePopover:xt,scheduleSelectionCheck:ne,hideSelectionBar:oe,discardDraft:ji,dropDraft:Jd,trackComposeDock:jd,settleComposeDock:ho,updateScrollPadding:Ir,openComposeDock:na,closeComposeDock:Or,isDocked:un,attachDockSwipe:tc,attachKeyboardDismiss:nc,get popover(){return D},set popover(l){D=l},get selectionBar(){return ge},set selectionBar(l){ge=l},get composeDock(){return G},set composeDock(l){G=l},nameSurface:He,get draft(){return Q},set draft(l){Q=l},get draftFocused(){return Ye},set draftFocused(l){Ye=l},get peek(){return de},set peek(l){de=l},get peekDragging(){return w},set peekDragging(l){w=l},get peekHandoff(){return De},set peekHandoff(l){De=l},get selectionTimer(){return nt},set selectionTimer(l){nt=l},get adjustingSelection(){return Te},set adjustingSelection(l){Te=l},get dockQuote(){return Ie},set dockQuote(l){Ie=l},get sheetOpenPending(){return Ze},set sheetOpenPending(l){Ze=l},state:B}}function Tl(e){return e==="success"?2400:null}function Ll(e,t){let n=[t,...e.filter(o=>o.id!==t.id)];if(n.length<=5)return n;for(let o=n.length-1;o>=0;o-=1)if(n[o].state==="success")return n.splice(o,1),n;return n}function Al(e,t,n,o){return e.map(i=>i.id===t?{id:t,state:n,text:o}:i)}function jo(e,t){return e.filter(n=>n.id!==t)}function Ml(e,t){return e.find(n=>n.id===t)??null}function Rl(e){let t=ct(),n=(...E)=>e.pushToast(...E),o=(...E)=>e.showError(...E),i=(...E)=>e.setOpen(...E),d=(...E)=>e.handleFailure(...E),c=(...E)=>e.render(...E),b=(...E)=>e.renderPanelBody(...E),x=(...E)=>e.actionButton(...E),m={access:null,accessEmail:"",accessInvited:null,accessScopeTo:null,accessRevokeId:null,accessApproveId:null,get view(){return e.state.view},set view(E){e.state.view=E},get busy(){return e.state.busy},set busy(E){e.state.busy=E},get slug(){return e.state.slug},set slug(E){e.state.slug=E},get features(){return e.state.features},set features(E){e.state.features=E},get visibility(){return e.state.visibility},set visibility(E){e.state.visibility=E},get personal(){return e.state.personal},set personal(E){e.state.personal=E}},S=!1,R=0;function $(){return`${window.location.origin}${window.location.pathname}`}function Y(E){n(E,"success")}async function re(E,k,T=s("toolbox.share.copyFailed")){let F=await zn(E);return t.disposed?!1:(F?Y(k):o(T),F)}async function L(){let E=await re($(),s("toolbox.common.linkCopied"));t.disposed||E&&ve()}function pe(){e.barLink!==null&&Gt(e.barLink,S),e.narrowLink!==null&&Gt(e.narrowLink,S)}function ve(){S=!0,t.clearTimeout(R),pe(),R=t.timeout(()=>{S=!1,pe()},2400)}async function _(E){!await zn(E)||t.disposed||Y(s("toolbox.share.quoteCopied"))}let me=s("toolbox.access.openWarning"),we=s("toolbox.access.reviewNote"),Ge=s("toolbox.access.publishWarning"),Re=s("toolbox.access.publishFromListWarning");function Pe(){return cl({allowed:m.features.sharing,openToAnyone:m.visibility==="public"})}async function qe(){if(!Pe()||(m.view="access",i(!0),m.access!==null))return;let E=await ds(m.slug);if(!t.disposed){if(!E.ok){m.view==="access"&&(m.view="comments"),d(E);return}m.access=E.value,c()}}async function xe(E,k){m.busy=!0,m.accessInvited=null,c();let T=await cs(m.slug,E);return t.disposed?!1:(m.busy=!1,T.ok?(m.access=T.value,m.accessScopeTo=null,m.accessRevokeId=null,m.accessApproveId=null,c(),k!==void 0&&Y(k),!0):(d(T),!1))}function Ue(E){let k=[];for(let T of E.grants)T.kind==="member"&&T.memberEmail!==null&&k.push(T.memberEmail);return k}function B(E){let k=[];for(let T of E.grants)T.kind==="group"&&T.groupId!==null&&k.push(T.groupId);return k}function D(E){return E.kind==="member"?E.memberEmail??s("toolbox.access.unknownMember"):E.groupName??s("toolbox.access.goneGroup")}function He(E){let k=m.accessEmail.trim();if(k.length===0)return;let T=Ue(E);if(T.some(F=>F.toLowerCase()===k.toLowerCase())){o(s("toolbox.access.alreadyAdded"));return}m.accessEmail="",xe({members:[...T,k]}).then(F=>{!F||!m.personal||t.disposed||(m.accessInvited=k,c())})}function ge(E,k){if(k.kind==="member"){let T=Ue(E).filter(F=>F!==k.memberEmail);xe({members:T});return}xe({groups:B(E).filter(T=>T!==k.groupId)})}function G(E,k,T,F,J){let ue=a("div","access-confirm");ue.appendChild(a("p","access-warning",E)),J!==void 0&&ue.appendChild(a("p","access-warning",J));let h=a("div","access-row");return h.appendChild(x(k,T,F,"is-danger")),h.appendChild(x(s("toolbox.common.cancel"),We,()=>{m.accessScopeTo=null,m.accessRevokeId=null,m.accessApproveId=null,b()})),ue.appendChild(h),ue}let Q={restricted:0,internal:1,public:2};function Ye(E,k){return Q[k]<=Q[E]?null:k==="internal"?me:E==="restricted"?Re:Ge}let de={restricted:s("toolbox.access.scope.restricted"),internal:s("toolbox.access.scope.internal"),public:s("toolbox.access.scope.public")},Ne={internal:{label:s("toolbox.access.action.internal"),icon:To},public:{label:s("toolbox.access.action.public"),icon:Wt}};function w(E){let k=m.slug.split("/").slice(1).join("/");return`${window.location.origin}/${E==="public"?"public":"internal"}/${k}`}function De(E){let k=w(E),T=a("div","access-link");return T.appendChild(a("span","access-url",k)),T.appendChild(x(s("toolbox.common.copyLink"),Wt,()=>{re(k,s("toolbox.common.linkCopied"))})),T}function nt(E){let k=a("div","access-scope"),T=E.scope,F=ue=>{if(ue!==T){if(Ye(T,ue)===null){xe({scope:ue});return}m.accessScopeTo=ue,m.accessRevokeId=null,b()}},J=["restricted",...m.personal?[]:["internal"],...E.switchable?["public"]:[]];for(let ue of J)k.appendChild(Le(de[ue],T===ue,()=>F(ue))),T===ue&&k.appendChild(Je(E,ue));return k}function Te(E,k){if(k==="restricted")return null;let T=Ye(E,k);if(T===null)return null;let F=Ne[k],J=a("div","access-part");return J.appendChild(a("h3","access-head",s("toolbox.access.switchTo",{scope:de[k]}))),J.appendChild(G(T,F.label,F.icon,()=>{xe({scope:k})},k==="public"?we:void 0)),J}function Le(E,k,T){let F=a("label","check-row"),J=a("input");J.type="radio",J.name="surprise-access-scope",J.className="check-input",J.checked=k,J.disabled=m.busy||k;let ue=a("span","radio-mark");return F.appendChild(J),F.appendChild(ue),F.appendChild(a("span","check-label",E)),J.addEventListener("change",()=>{J.checked&&T()},{signal:t.signal}),F.addEventListener("click",h=>h.stopPropagation(),{signal:t.signal}),F}function Je(E,k){let T=a("div","scope-child");if(k==="public")return T.appendChild(a("p","note",s("toolbox.access.publicNote"))),T.appendChild(De(k)),T.appendChild(a("p","note",s("toolbox.access.publicCloseNote"))),m.personal&&T.appendChild(Ze(E)),T;if(k==="internal")return T.appendChild(a("p","note",s("toolbox.access.internalNote"))),T.appendChild(De(k)),T;T.appendChild(a("p","note",m.personal?s("toolbox.access.restrictedNotePersonal"):s("toolbox.access.restrictedNote"))),T.appendChild(De(k));let F=_e(E);return F!==null&&T.appendChild(F),T.appendChild(Ze(E)),m.personal||T.appendChild(Ae(E)),T}function Ie(E,k){if(m.accessRevokeId===k.id){let J=m.personal&&E.scope==="public"?s("toolbox.access.revokeToolsSentence",{who:D(k)}):k.kind==="member"?s("toolbox.access.revokeMemberSentence",{who:D(k)}):s("toolbox.access.revokeGroupSentence",{who:D(k)});return G(J,s("toolbox.access.revoke"),ht,()=>ge(E,k))}let T=a("div","access-row"),F=a("div","access-name");return F.appendChild(a("span",void 0,D(k))),k.role==="owner"&&F.appendChild(a("p","note",s("toolbox.access.coOwner"))),T.appendChild(F),k.mine&&k.role==="owner"?(T.appendChild(a("span","note",s("toolbox.access.itsYou"))),T):(k.kind==="member"&&!m.personal&&T.appendChild(k.role==="owner"?x(s("toolbox.access.toViewer"),Ma,()=>{xe({role:{id:k.id,to:"viewer"}})},void 0,s("toolbox.access.toViewerLabel",{who:D(k)})):x(s("toolbox.access.toOwner"),Aa,()=>{xe({role:{id:k.id,to:"owner"}})},void 0,s("toolbox.access.toOwnerLabel",{who:D(k)}))),T.appendChild(x(s("toolbox.access.revoke"),ht,()=>{m.accessRevokeId=k.id,m.accessScopeTo=null,b()},"is-danger",s("toolbox.access.revokeLabel",{who:D(k)}))),T)}function Xe(E){return E.requesterName===null?E.requesterEmail:`${E.requesterName}（${E.requesterEmail}）`}function _e(E){if(E.requests.length===0)return null;let k=a("div","access-part");k.appendChild(a("h3","access-head",s("toolbox.access.requests")));for(let T of E.requests){if(m.accessApproveId===T.id){k.appendChild(G(s("toolbox.access.approveSentence",{who:Xe(T)}),s("toolbox.access.approveConfirm"),ft,()=>{xe({answer:{id:T.id,approved:!0}})}));continue}let F=a("div","access-row");F.appendChild(a("span","access-name",Xe(T))),F.appendChild(x(s("toolbox.access.approve"),ft,()=>{m.accessApproveId=T.id,m.accessRevokeId=null,m.accessScopeTo=null,b()})),F.appendChild(x(s("toolbox.access.deny"),We,()=>{xe({answer:{id:T.id,approved:!1}})})),k.appendChild(F)}return k}function Ze(E){let k=a("div","access-part");k.appendChild(a("h3","access-head",m.personal&&E.scope==="public"?s("toolbox.access.peopleTools"):s("toolbox.access.people")));let T=E.grants.filter(h=>h.kind==="member");T.length===0?k.appendChild(a("p","note",m.personal&&E.scope==="public"?s("toolbox.access.noPeopleTools"):s("toolbox.access.noPeople"))):k.appendChild(a("p","note",m.personal?s("toolbox.access.invitedNote"):s("toolbox.access.coOwnerNote")));for(let h of T)k.appendChild(Ie(E,h));m.personal&&m.accessInvited!==null&&k.appendChild(a("p","note",s("toolbox.access.invited",{who:m.accessInvited})));let F=a("div","access-add"),J=a("input");J.type="email",J.value=m.accessEmail,J.placeholder=s("toolbox.access.emailPlaceholder"),m.personal&&(J.placeholder=s("toolbox.access.emailPlaceholderPersonal")),J.addEventListener("input",()=>{m.accessEmail=J.value},{signal:t.signal}),J.addEventListener("keydown",h=>{h.key==="Enter"&&(h.preventDefault(),He(E))},{signal:t.signal}),F.appendChild(J);let ue=x(s("toolbox.access.add"),La,()=>He(E),"is-strong");return ue.disabled=m.busy,F.appendChild(ue),k.appendChild(F),k}function Ae(E){let k=a("div","access-part");if(k.appendChild(a("h3","access-head",s("toolbox.access.groups"))),E.groups.length===0)return k.appendChild(a("p","note",s("toolbox.access.noGroups"))),k;let T=new Set(B(E));for(let F of E.groups)k.appendChild(lt(E,F,T.has(F.id)));return k}function lt(E,k,T){let F=a("label","check-row"),J=a("input");J.type="checkbox",J.className="check-input",J.checked=T,J.disabled=m.busy;let ue=a("span","check-mark");return ue.appendChild(ae(ft,le.small)),F.appendChild(J),F.appendChild(ue),F.appendChild(a("span","check-label",k.name)),J.addEventListener("change",()=>{let h=B(E),O=J.checked?[...h,k.id]:h.filter(Z=>Z!==k.id),X=J.checked?s("toolbox.access.groupOn",{group:k.name}):s("toolbox.access.groupOff",{group:k.name});xe({groups:O},X)},{signal:t.signal}),F.addEventListener("click",h=>h.stopPropagation(),{signal:t.signal}),F}function je(){let E=a("div","access"),k=m.access;if(k===null)return E.appendChild(a("div","empty",s("toolbox.common.loading"))),E;let T=m.accessScopeTo;if(T!==null){let F=Te(k.scope,T);if(F!==null)return E.appendChild(F),E}return E.appendChild(nt(k)),E}return{dispose(){t.dispose()},pageUrl:$,showNotice:Y,copyText:re,copyPageUrl:L,copyQuote:_,canManageAccess:Pe,openAccess:qe,accessView:je,get linkCopied(){return S},set linkCopied(E){S=E},state:m}}var Pl="0 0 32 32";var Il="M8 5h8l8 8v14H8z",Ol="M16 5l8 8h-8z";function Ic(e){return typeof e!="object"||e===null?!1:"canGoBack"in e&&typeof e.canGoBack=="boolean"&&"canGoForward"in e&&typeof e.canGoForward=="boolean"&&"entries"in e&&typeof e.entries=="function"&&"addEventListener"in e&&typeof e.addEventListener=="function"}function vi(e){let t=Reflect.get(e,"navigation");return Ic(t)?t:null}function Nl(e){let t=vi(e);return t!==null?{back:t.canGoBack,forward:t.canGoForward}:{back:e.history.length>1,forward:!1}}function Dl(e,t){let n=vi(e),o=!1,i=!1,d=()=>{o||(o=!0,queueMicrotask(()=>{o=!1,i||t()}))};return n?.addEventListener("currententrychange",d),e.addEventListener("pageshow",d),e.addEventListener("popstate",d),()=>{i=!0,n?.removeEventListener("currententrychange",d),e.removeEventListener("pageshow",d),e.removeEventListener("popstate",d)}}function _l(e){let t=vi(e),n=t?.currentEntry??null;if(t!==null&&n!==null){let i=t.entries().find(c=>c.index===n.index-1),d=Hl(e,i?.url??null);if(d!==null)return{url:d,reachable:!0}}let o=Hl(e,e.document.referrer);return o===null?null:{url:o,reachable:t===null&&e.history.length>1}}function Hl(e,t){if(t===null||t.length===0)return null;try{let n=new URL(t);return n.origin===e.location.origin?n:null}catch{return null}}var Sn={href:"/",key:"home",icon:"home"},bi={href:"/mine",key:"mine",icon:"files"},yi={href:"/favorites",key:"favorites",icon:"favorite"},Oc={href:"/activity",key:"activity",icon:"activity"},Jn={href:"/library",key:"library",icon:"company"},Hc=[Sn,bi,Jn],Nc=[...Hc,yi,Oc];function Xn(e,t=vo,n){return t(`workspace.places.${e.key}`,n===void 0?void 0:{organization:n})}var Bl=12;function Fl(e){let t=[...new Intl.Segmenter("ja",{granularity:"grapheme"}).segment(e)].map(n=>n.segment);return t.length<=Bl?e:`${t.slice(0,Bl).join("")}…`}function Dc(e,t){return t===e.href||e.nested===!0&&t.startsWith(`${e.href}/`)}function Vl(e){return Nc.find(t=>Dc(t,e))??null}var wi={light:{text:"#171717",muted:"#737373",lineMix:9,hoverMix:6,pressMix:10},dark:{text:"#f5f5f5",muted:"#a3a3a3",lineMix:12,hoverMix:9,pressMix:15}},xi='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif';function $l(e){return[`--ink: ${e.text};`,`--ink-muted: ${e.muted};`,"--ground: var(--page-ground, Canvas);",`--line: color-mix(in srgb, ${e.text} ${e.lineMix}%, transparent);`,`--hover: color-mix(in srgb, ${e.text} ${e.hoverMix}%, transparent);`,`--press: color-mix(in srgb, ${e.text} ${e.pressMix}%, transparent);`].join(" ")}var zl=`
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
  --lead: ${wo};
  color-scheme: light;
  ${$l(wi.light)}
}
:host([data-tone="dark"]) {
  color-scheme: dark;
  ${$l(wi.dark)}
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
  font: 400 14px/20px ${xi};
  -webkit-font-smoothing: antialiased;
  letter-spacing: normal;
  white-space: nowrap;
  transition: box-shadow ${Ve.quick}ms ${$e};
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
  width: calc(var(--lead) + ${fa});
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
  transition: background-color ${Ve.quick}ms ${$e}, color ${Ve.quick}ms ${$e}, opacity ${Ve.quick}ms ${$e};
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
  transition: background-color ${Ve.quick}ms ${$e};
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
  transition: background-color ${Ve.quick}ms ${$e}, color ${Ve.quick}ms ${$e};
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
  transition: background-color ${Ve.quick}ms ${$e}, color ${Ve.quick}ms ${$e};
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
  transition: background-color ${Ve.quick}ms ${$e}, color ${Ve.quick}ms ${$e};
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
  transition: background-color ${Ve.quick}ms ${$e}, color ${Ve.quick}ms ${$e};
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
  font: 400 14px/20px ${xi};
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
  transition: background-color ${Ve.quick}ms ${$e};
}
.menu-item:hover, .menu-item:focus-visible { background: var(--hover); }
.menu-item:focus-visible { outline: none; }
.menu-item svg { display: block; color: var(--ink-muted); }
.menu-item-label { flex: 1; }
/* 場所の列と、個人設定・ログアウトの間。線ではなく余白 1 段（4px の刻み 2 つ） */
.menu-item.is-apart { margin-top: 8px; }
@media (max-width: ${Gr-1}px) {
  .version-sep, .version-number { display: none; }
}
/* 指で押す画面では、メニューの行を 44px にする（ワークスペースの --ws-control と同じ切り替え。行の 44px は 32px の面に収まらないので、顔と印はそのまま） */
@media (max-width: ${Gr-1}px), (pointer: coarse) {
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
`;var er="surprise-location",Zo=1.5;function ql(e){let t=_l(e),n=t===null?null:Vl(t.url.pathname);return t!==null&&n!==null?{label:Xn(n,s),href:`${t.url.pathname}${t.url.search}`,viaBack:t.reachable}:{label:Xn(Jn,s),href:Jn.href,viaBack:!1}}function Fc(e){let t=document.createElement("canvas");t.width=t.height=1;let n=t.getContext("2d",{willReadFrequently:!0});if(n===null)return null;n.clearRect(0,0,1,1),n.fillStyle=e,n.fillRect(0,0,1,1);let[o,i,d,c]=n.getImageData(0,0,1,1).data;return[o,i,d,c]}function Vc(){for(let e of[document.body,document.documentElement]){if(e===null)continue;let t=getComputedStyle(e).backgroundColor,n=Fc(t);if(n===null||n[3]===0)continue;let o=(.2126*n[0]+.7152*n[1]+.0722*n[2])/255;return{color:`rgb(${n[0]} ${n[1]} ${n[2]})`,dark:o<.5}}return null}var $c=[{place:Sn,icon:Wr},{place:bi,icon:Na},{place:Jn,icon:Da},{place:yi,icon:Kr}];function zc(){let e="http://www.w3.org/2000/svg",t=document.createElementNS(e,"svg");t.setAttribute("viewBox",Pl),t.setAttribute("width","20"),t.setAttribute("height","20"),t.setAttribute("aria-hidden","true");let n=document.createElementNS(e,"rect");n.setAttribute("width","32"),n.setAttribute("height","32"),n.setAttribute("rx",String(7.5)),n.setAttribute("class","mark-tile");let o=document.createElementNS(e,"path");o.setAttribute("d",Il),o.setAttribute("class","mark-sheet");let i=document.createElementNS(e,"path");i.setAttribute("d",Ol),i.setAttribute("class","mark-fold");for(let d of[o,i])d.setAttribute("stroke-width",String(1.4)),d.setAttribute("stroke-linejoin","round");return t.append(n,o,i),t}var ki=class{constructor(){this.host=document.createElement(er);this.lead=a("div","lead");this.mark=a("a","mark");this.back=this.step(s("toolbox.location.back"),Ca,()=>window.history.back());this.forward=this.step(s("toolbox.location.forward"),Ea,()=>window.history.forward());this.origin=a("a","place");this.divider=a("span","divider","/");this.title=a("span","title");this.favorite=a("button","star");this.onToggleFavorite=null;this.version=a("button","version");this.versionWhen=a("span","version-when");this.versionNumber=a("span","version-number");this.openHistory=null;this.self=a("button","self");this.sheet=a("div","sheet");this.menu=a("div","menu");this.selfRows=[];this.selfName=null;this.stops=[];this.from=ql(window);let t=this.host.attachShadow({mode:"open"}),n=a("style");n.textContent=zl;let o=a("div","steps");o.setAttribute("role","group"),o.setAttribute("aria-label",s("toolbox.location.history")),o.append(this.back,this.forward),this.lead.append(o),this.mark.href=Sn.href;let i=Xn(Sn,s);this.mark.title=i,this.mark.setAttribute("aria-label",i),this.mark.append(zc());let d=Nr().logo,c=d===null?null:a("img","logo");c!==null&&d!==null&&(c.src=d,c.alt="",c.setAttribute("aria-hidden","true")),this.divider.setAttribute("aria-hidden","true"),this.title.setAttribute("aria-current","page");let b=a("div","crumbs");b.append(this.origin,this.divider,this.title),this.favorite.type="button",this.favorite.hidden=!0,this.favorite.append(ae(Kr,16,Zo)),this.favorite.addEventListener("click",()=>this.onToggleFavorite?.()),this.version.type="button",this.version.hidden=!0,this.version.title=s("toolbox.location.openHistory");let x=a("span","version-sep","·");x.setAttribute("aria-hidden","true"),this.version.append(this.versionWhen,x,this.versionNumber),this.version.addEventListener("click",()=>this.openHistory?.()),this.self.type="button",this.self.hidden=!0,this.self.setAttribute("aria-haspopup","menu"),this.self.setAttribute("aria-expanded","false"),this.self.addEventListener("click",()=>this.toggleSelfMenu()),this.sheet.hidden=!0,this.menu.setAttribute("role","menu"),this.sheet.addEventListener("keydown",pe=>this.onMenuKey(pe));let m=a("nav","bar");m.setAttribute("aria-label",s("toolbox.location.label")),m.append(this.lead,this.mark,...c===null?[]:[c],b,this.favorite,this.version,this.self),t.append(n,m,this.sheet),this.origin.addEventListener("click",pe=>{!this.from.viaBack||pe.metaKey||pe.ctrlKey||pe.shiftKey||pe.altKey||pe.button!==0||(pe.preventDefault(),window.history.back())}),document.body.append(this.host),Oe.set("location",44),this.paint(),this.stops.push(Oe.watch(()=>this.arrange())),this.stops.push(Dl(window,()=>this.paint()));let S=()=>this.paintScrolled(),R=()=>this.arrange(),$=()=>this.paintGround(),Y=pe=>{if(this.sheet.hidden)return;let ve=pe.composedPath();ve.includes(this.self)||ve.includes(this.sheet)||this.closeSelfMenu(!1)},re=window.matchMedia("(prefers-color-scheme: dark)");window.addEventListener("scroll",S,{passive:!0}),window.addEventListener("resize",R),window.addEventListener("load",$),document.addEventListener("click",Y),re.addEventListener("change",$),this.stops.push(()=>{window.removeEventListener("scroll",S),window.removeEventListener("resize",R),window.removeEventListener("load",$),document.removeEventListener("click",Y),re.removeEventListener("change",$)});let L=document.querySelector("title");if(L!==null){let pe=new MutationObserver(()=>this.paintTitle());pe.observe(L,{childList:!0,characterData:!0,subtree:!0}),this.stops.push(()=>pe.disconnect())}}step(t,n,o){let i=a("button","step");return i.type="button",i.title=t,i.setAttribute("aria-label",t),i.append(ae(n,16,Zo)),i.addEventListener("click",o),i}paint(){this.from=ql(window),this.origin.textContent=this.from.label,this.origin.href=this.from.href;let t=Nl(window);this.back.disabled=!t.back,this.forward.disabled=!t.forward,this.paintTitle(),this.paintGround(),this.paintScrolled(),this.arrange()}showVersion(t,n){if(this.openHistory=t===null?null:n,t===null){this.version.hidden=!0;return}let o=s("toolbox.location.updated",{day:Za(t.committedAt)}),i=t.number===null?"":s("toolbox.history.versionNumber",{number:t.number});this.versionWhen.textContent=o,this.versionNumber.textContent=i,this.versionNumber.hidden=i.length===0,this.version.querySelector(".version-sep")?.toggleAttribute("hidden",i.length===0),this.version.setAttribute("aria-label",s("toolbox.location.versionAction",{version:[o,i].filter(d=>d.length>0).join(" ")})),this.version.hidden=!1}showFavorite(t,n){if(this.onToggleFavorite=t===null?null:n,t===null){this.favorite.hidden=!0;return}let o=s(t?"toolbox.location.favoriteRemove":"toolbox.location.favoriteAdd");this.favorite.setAttribute("aria-pressed",t?"true":"false"),this.favorite.setAttribute("aria-label",o),this.favorite.title=o,this.favorite.hidden=!1}versionShowing(){return!this.version.hidden}showSelf(t,n){let o=t!==null&&t.kind==="member";this.selfName=o?t.name:null;let i=o?s("toolbox.self.labelNamed",{name:t.name}):s("toolbox.self.label");if(this.self.title=i,this.self.setAttribute("aria-label",i),this.self.replaceChildren(),o){let d=a("span","avatar",t.name.slice(0,1));d.setAttribute("aria-hidden","true"),this.self.append(d)}else this.self.append(ae(Oa,24,Zo));this.selfRows=o?[...$c.map(d=>({kind:"link",label:Xn(d.place,s,qc()),icon:d.icon,href:d.place.href})),{kind:"link",label:s("workspace.settings"),icon:_a,href:"/settings"},{kind:"action",label:s("workspace.logout"),icon:Ba,run:n}]:[{kind:"link",label:s("toolbox.self.openProduct"),icon:Wr,href:Sn.href}],this.self.hidden=!1,this.sheet.hidden||this.paintSelfMenu()}toggleSelfMenu(){this.sheet.hidden?this.openSelfMenu():this.closeSelfMenu(!0)}openSelfMenu(){this.paintSelfMenu(),this.sheet.hidden=!1,this.self.setAttribute("aria-expanded","true"),this.host.setAttribute("data-menu-open",""),this.menuItems()[0]?.focus()}closeSelfMenu(t){this.sheet.hidden||(this.sheet.hidden=!0,this.menu.replaceChildren(),this.self.setAttribute("aria-expanded","false"),this.host.removeAttribute("data-menu-open"),t&&this.self.focus({preventScroll:!0}))}paintSelfMenu(){this.sheet.replaceChildren(),this.selfName!==null&&this.sheet.append(a("p","menu-name",this.selfName)),this.menu.replaceChildren();for(let t of this.selfRows){let n=t.kind==="link"?a("a","menu-item"):a("button","menu-item");n.setAttribute("role","menuitem"),n.tabIndex=-1,n.append(ae(t.icon,16,Zo),a("span","menu-item-label",t.label)),n instanceof HTMLAnchorElement&&(n.href=t.kind==="link"?t.href:""),n instanceof HTMLButtonElement&&(n.type="button"),n.addEventListener("click",()=>{this.closeSelfMenu(!1),t.kind==="action"&&t.run()}),t.kind==="link"&&t.href==="/settings"&&n.classList.add("is-apart"),this.menu.append(n)}this.sheet.append(this.menu)}menuItems(){return[...this.menu.querySelectorAll("[role='menuitem']")]}onMenuKey(t){let n=this.menuItems(),o=this.host.shadowRoot?.activeElement??null,i=n.findIndex(c=>c===o),d=c=>{t.preventDefault(),n[(c+n.length)%n.length]?.focus()};t.key==="ArrowDown"?d(i+1):t.key==="ArrowUp"?d(i-1):t.key==="Home"?d(0):t.key==="End"?d(n.length-1):t.key==="Escape"?(t.preventDefault(),this.closeSelfMenu(!0)):t.key==="Tab"&&this.closeSelfMenu(!0)}paintTitle(){let t=document.title.trim();this.title.textContent=t,this.title.title=t,this.title.hidden=this.divider.hidden=t.length===0}paintGround(){let t=Vc();t===null?this.host.style.removeProperty("--page-ground"):this.host.style.setProperty("--page-ground",t.color),t?.dark??(getComputedStyle(document.documentElement).colorScheme.includes("dark")&&window.matchMedia("(prefers-color-scheme: dark)").matches)?this.host.setAttribute("data-tone","dark"):this.host.removeAttribute("data-tone")}paintScrolled(){this.host.toggleAttribute("data-scrolled",window.scrollY>0)}arrange(){let t=Oe.above("location");this.host.style.setProperty("--location-top",`${t}px`);let n=this.lead.getBoundingClientRect().width>0;this.host.toggleAttribute("data-titlebar",n&&t===0),this.host.toggleAttribute("data-under-ribbon",n&&t>0)}destroy(){for(let t of this.stops)t();this.host.remove(),Oe.set("location",0)}};function Kl(){let e=a("div");e.style.cssText=`position:fixed;visibility:hidden;pointer-events:none;width:${wo};height:0`,document.documentElement.append(e);let t=e.getBoundingClientRect().width>0;return e.remove(),t}function Wl(){return window.top!==window.self||document.querySelector(er)!==null?null:new ki}function qc(){let e=Nr().name;return e===null?void 0:Fl(e)}var Gl="data-surprise-deck";function Ci(){return document.body!==null&&document.body.hasAttribute(Kt)}function Kc(){let e=`body[${Kt}]`,t=`html[${_r}="${Br}"]`;return`@media screen {
    html:has(> ${e}), ${e},
    ${t} ${e} [${bo}][${yo}] {
      background: var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas)) !important;
    }
    ${e} [data-deck-stage] { background: var(--deck-bg, Canvas); }
  }`}function Wc(){let e=`html[${_r}="${Br}"]`;return[`${e} ${Ke}, ${e} ${St}, ${e} ${er} { display: none !important; }`,`${e} mark[${Fn}] { background: transparent !important; box-shadow: none !important; }`].join(`
`)}function Gc(){let e=`body[${Kt}] [${Et}]:not(.deck-step-controls):not(.deck-step-entry)`,t="var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas))";return`@media screen {
    ${e} {
      position: sticky !important;
      /* 上端の帯（現在地の行など）の下に貼り付く */
      top: var(${si}, 0px) !important;
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
  }`}function Uc(){return`@media screen { ${`body[${Kt}]:has(> ${Ke}) [${Et}]:not(.deck-step-controls):not(.deck-step-entry)`} { display: none !important; } }`}function Ul(){if(!Ci()||(gs(document),document.head.querySelector(`style[${Gl}]`)!==null))return;let e=document.createElement("style");e.setAttribute(Gl,""),e.textContent=`${Kc()}
${Wc()}
${Gc()}
${Uc()}`,document.head.appendChild(e)}var Yl=`
${ws}
${xs}
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
`;var tr=`${fn}
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
@media (max-width: ${ha}px) {
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
${Yl}
`;var or="data-surprise-presenter";function Yc(){let e=document.querySelector(`body[${Kt}] > main[${aa}] > [${Et}]:not(.deck-step-controls):not(.deck-step-entry)`);return e instanceof HTMLElement?e:null}function nr(e){return e!==void 0&&!e.hidden&&!e.disabled?e:null}function Ei(e){return(e.textContent??"").trim()}function Jt(){let e=Yc();if(e===null)return null;let t=[...e.querySelectorAll(":scope > button")];return{present:nr(t.find(n=>!n.hasAttribute(or)&&Ei(n).includes("プレゼンを始める"))),presenter:nr(t.find(n=>n.hasAttribute(or))),overview:nr(t.find(n=>/^一覧(?:を閉じる)?$/.test(Ei(n)))),overviewOpen:document.documentElement.hasAttribute(Vr),notes:nr(t.find(n=>/^ノートを(?:隠す|表示)$/.test(Ei(n)))),notesHidden:e.parentElement?.hasAttribute(Fr)??!1}}function Jl(e){return e===null?"":[e.present,e.presenter,e.overview,e.notes].map(t=>t===null?"0":"1").concat(e.overviewOpen?"1":"0",e.notesHidden?"1":"0").join("")}function Xl(e){let t=Jl(Jt()),n=new MutationObserver(()=>{let o=Jl(Jt());o!==t&&(t=o,e())});return n.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["hidden","disabled",Vr,Fr]}),()=>n.disconnect()}var Jc="surprise-presenter",Ti=or,Si=!1,Li=null;function jl(){for(let e of document.querySelectorAll(`[${Et}]`))for(let t of e.querySelectorAll("button"))if(!t.hasAttribute(Ti)&&(t.textContent??"").includes("プレゼンを始める"))return t;return null}function Xc(){let e=new URLSearchParams(window.location.search);return!window.location.pathname.startsWith("/history/")&&!e.has("v")&&!e.has("from")}async function jc(){let e=new URL(window.location.href);e.hash="";let t=await fetch(e.href,{credentials:"same-origin",headers:{Accept:"text/html"}});if(!t.ok)throw new Error(s("decks.presentLaunch.loadFailed"));return vs(await t.text())}function Qc(){let e=[...document.querySelectorAll(`[${bo}]`)],t=window.innerHeight/2,n=pa.exec(window.location.hash),i=(e.find(d=>d.hasAttribute(yo))??e.find(d=>{let c=d.getBoundingClientRect();return c.top<=t&&c.bottom>=t})??(n?e[Number(n[1])-1]:void 0))?.querySelector(`section[${Dr}]`);return i?i.getAttribute("data-deck-node")??`present-${[...document.querySelectorAll(`section[${Dr}]`)].indexOf(i)+1}`:null}async function Ai(e,t,n){if(Si)return;let o=e?window.open("about:blank","","popup,width=1280,height=720"):null;o&&ys(o);let i=Qc();if(n.editable()){await n.openEditable({audienceWindow:o,slide:i});return}Si=!0;let d=document.createElement(Jc),c=d.attachShadow({mode:"open"}),b=a("style");b.textContent=tr+ms;let x=a("div","edit-screen deck-studio");c.append(b,x);let m=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden",document.body.append(d);let S=()=>{d.remove(),document.documentElement.style.overflow=m,Si=!1,t()},R,$;try{[R,$]=await Promise.all([jc(),import("./comments-widget-chunk-PHHNWPRT.js")])}catch(re){o?.close(),S(),window.alert(re instanceof Error?re.message:s("decks.presentLaunch.openFailed"));return}let Y={html:R,versionId:"reader",versionNumber:0};$.openDeckPresenter({host:x,readOnly:!0,audienceWindow:o,saved:()=>Y,preview:()=>R,source:()=>R,status:()=>"",commit:()=>!1,current:()=>i,closed:S})}function Ql(e,t){if(e.parentElement?.querySelector(`[${Ti}]`))return;let n=e.cloneNode(!1);if(!(n instanceof HTMLButtonElement))return;n.setAttribute(Ti,""),n.removeAttribute("title"),n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+Lo.map(i=>`<path d="${i}"/>`).join("")+"</svg>",n.append(a("span",void 0,s("decks.presentLaunch.presenter")));let o=()=>{n.hidden=e.hidden,n.disabled=e.disabled};o(),new MutationObserver(o).observe(e,{attributes:!0,attributeFilter:["hidden","disabled"]}),n.addEventListener("click",()=>{n.disabled||Ai(!1,()=>n.focus(),t)}),e.after(n),e.parentElement?.addEventListener("click",i=>{!(i.target instanceof Element)||i.target.closest("button")!==e||e.disabled||!bs()||(i.preventDefault(),i.stopImmediatePropagation(),Ai(!0,()=>e.focus(),t))},!0)}function Zl(e){let t=Jt()?.presenter??null;Li===null||t===null||Ai(!1,e,Li)}function ed(e){if(!Ci()||!Xc())return;Li=e;let t=jl();if(t){Ql(t,e);return}let n=new MutationObserver(()=>{let o=jl();o&&(n.disconnect(),Ql(o,e))});n.observe(document.body,{childList:!0,subtree:!0}),window.setTimeout(()=>n.disconnect(),1e4)}var td=null,rr=null,Mi=!1;function nd(){return rr??(rr=import("./comments-widget-chunk-3DUCGNJS.js").then(e=>(td=e,e),e=>{throw rr=null,e})),rr}function od(){let e=()=>{nd().catch(()=>{})};typeof window.requestIdleCallback=="function"?window.requestIdleCallback(e,{timeout:4e3}):window.setTimeout(e,1500)}function jn(){return Mi||(td?.editorActive()??!1)}async function rd(e,t={}){if(jn())return;Mi=!0;let n;try{n=await nd()}catch{e.fail(s("toolbox.editor.deckEditorLoadFailed"));return}finally{Mi=!1}await n.openPageEditor(e,t)}var sd="surprise-pages:export:include-comments",Zc=`${fn}
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
`,ld={comments:()=>[]},Oi=!1,Ri=new Set;function dd(e){ld=e}function Hi(e){Oi=e;for(let t of Ri)t.sync()}function cd(){return Oi&&vn(sd)==="1"}function eu(){return`${window.location.origin}${window.location.pathname}${window.location.search}`}function tu(){let n=window.location.pathname.replace(/\/+$/,"").split("/").filter(o=>o.length>0&&o!=="internal"&&o!=="public").join("-");return`${n.length>0?n:"page"}.md`}var Pi=null,ir=null;function ud(){return ir??(ir=import("./comments-widget-chunk-YBDCFRCN.js").then(e=>(Pi=e,e),e=>{throw ir=null,e})),ir}function nu(){let e=()=>{ud().catch(()=>{})};typeof window.requestIdleCallback=="function"?window.requestIdleCallback(e,{timeout:5e3}):window.setTimeout(e,1500)}function id(e){if(Pi!==null){e(ad(Pi));return}ud().then(t=>e(ad(t)),()=>{})}function ad({pageToMarkdown:e}){let t=document.title.trim();return e({title:t.length>0?t:null,url:eu(),root:document.body,comments:cd()?ld.comments():null})}function ou(e){return e?{paths:ft,label:s("toolbox.common.copied")}:{paths:va,label:s("toolbox.export.trigger")}}var Tn,Xt,tt,jt,Ln,Qn,Zn,he,pd,fd,ar,hd,md,gd,vd,Bt,Ii=class extends HTMLElement{constructor(){super();kt(this,he);kt(this,Tn);kt(this,Xt);kt(this,tt,!1);kt(this,jt,!1);kt(this,Ln,0);kt(this,Qn,n=>{!Se(this,tt)||n.composedPath().includes(this)||(vt(this,tt,!1),Fe(this,he,Bt).call(this))});kt(this,Zn,n=>{n.key!=="Escape"||!Se(this,tt)||(vt(this,tt,!1),Fe(this,he,Bt).call(this))});vt(this,Tn,this.attachShadow({mode:"open"})),vt(this,Xt,a("style")),Se(this,Xt).textContent=Zc,Se(this,Tn).appendChild(Se(this,Xt))}connectedCallback(){Ri.add(this),this.sync(),document.addEventListener("click",Se(this,Qn),!0),document.addEventListener("keydown",Se(this,Zn))}disconnectedCallback(){Ri.delete(this),document.removeEventListener("click",Se(this,Qn),!0),document.removeEventListener("keydown",Se(this,Zn)),window.clearTimeout(Se(this,Ln))}sync(){Fe(this,he,Bt).call(this)}};Tn=new WeakMap,Xt=new WeakMap,tt=new WeakMap,jt=new WeakMap,Ln=new WeakMap,Qn=new WeakMap,Zn=new WeakMap,he=new WeakSet,pd=function(n){let o=ou(Se(this,jt));n.title=o.label,n.setAttribute("aria-label",o.label),n.setAttribute("aria-haspopup","menu"),n.setAttribute("aria-expanded",Se(this,tt)?"true":"false"),n.className=Se(this,tt)?"trigger is-open":"trigger";let i=Se(this,jt)?wa:2,d=ae(o.paths,le.medium,i),c=n.querySelector(".icon");c!==null?c.replaceWith(d):n.appendChild(d)},fd=function(){vt(this,jt,!0),window.clearTimeout(Se(this,Ln)),vt(this,Ln,window.setTimeout(()=>{vt(this,jt,!1),Fe(this,he,Bt).call(this)},2400)),Fe(this,he,Bt).call(this)},ar=function(){vt(this,tt,!1),Fe(this,he,Bt).call(this)},hd=function(){id(n=>{zn(n).then(o=>{Fe(this,he,ar).call(this),o&&Fe(this,he,fd).call(this)})})},md=function(){id(n=>{$n(tu(),"text/markdown",n),Fe(this,he,ar).call(this)})},gd=function(){Fe(this,he,ar).call(this),window.print()},vd=function(n){bn(sd,n?"1":"0")},Bt=function(){let n=a("button",Se(this,tt)?"trigger is-open":"trigger");n.type="button",Fe(this,he,pd).call(this,n),n.addEventListener("click",i=>{i.stopPropagation(),vt(this,tt,!Se(this,tt)),Fe(this,he,Bt).call(this)});let o=a("div");if(o.appendChild(n),Se(this,tt)){let i=a("div","menu");i.setAttribute("role","menu");let d=a("button","item",s("toolbox.export.copy"));d.type="button",d.setAttribute("role","menuitem"),d.addEventListener("click",()=>Fe(this,he,hd).call(this)),i.appendChild(d);let c=a("button","item",s("toolbox.export.save"));if(c.type="button",c.setAttribute("role","menuitem"),c.addEventListener("click",()=>Fe(this,he,md).call(this)),i.appendChild(c),Oi){let m=a("hr","rule");i.appendChild(m);let S=a("label","check-row"),R=a("input");R.type="checkbox",R.className="check-input",R.checked=cd();let $=a("span","check-mark");$.appendChild(ae(ft,le.small)),S.appendChild(R),S.appendChild($),S.appendChild(a("span","check-label",s("toolbox.export.includeComments"))),R.addEventListener("change",()=>Fe(this,he,vd).call(this,R.checked)),S.addEventListener("click",Y=>Y.stopPropagation()),i.appendChild(S)}let b=a("hr","rule");i.appendChild(b);let x=a("button","item","PDF");x.type="button",x.setAttribute("role","menuitem"),x.addEventListener("click",()=>Fe(this,he,gd).call(this)),i.appendChild(x),o.appendChild(i)}Se(this,Tn).replaceChildren(Se(this,Xt),o)};function ru(){typeof customElements>"u"||customElements.get(St)===void 0&&customElements.define(St,Ii)}function iu(e=document){let t=e.querySelector(".no-print");if(t!==null)return t;let n=e.querySelector("button[onclick*='print']");return n===null?null:n.parentElement}function bd(){if(ru(),document.querySelector(St)!==null)return;let e=iu();if(e===null)return;for(let n of[...e.querySelectorAll("button")])n.remove();let t=document.createElement(St);e.appendChild(t),nu()}var sr="data-sp-first-paint",yd="chrome";var lr="surprise-reading-nav",au="data-clean-copy-document",su="article[data-clean-copy-source-id]",lu="blockquote,pre,code,figure,svg,nav,aside,.lecture-cue,[data-ads-figure],[data-source-note],[data-clean-copy-ui],del[data-surprise-redline]";function Ni(e,t){let n=t.split(".").map(o=>`0*${Number(o)}`).join("\\.");return e.replace(new RegExp(`^${n}[｜|.．、\\s]+`),"")}function Qt(e){let t=e.cloneNode(!0);if(t instanceof Element)for(let n of t.querySelectorAll("del[data-surprise-redline]"))n.remove();return(t.textContent??"").replace(/\s+/g," ").trim()}function wd(e,t){return Array.from(e.querySelectorAll(t)).filter(n=>n instanceof HTMLElement&&!n.closest(lu)&&Qt(n).length>0)}function xd(e,t){if(e.id)return e.id;let n=e.ownerDocument,o=t,i=1;for(;n.getElementById(o);)o=`${t}-${i++}`;return e.id=o,o}function dr(e,t){let n=new URL(e);return n.hash=t,n.href}function kd(e,t){return e.origin===t.origin&&e.pathname.replace(/\/+$/,"")===t.pathname.replace(/\/+$/,"")}function Di(e){let t=e.querySelector("main");if(!(t instanceof HTMLElement))return null;let n=Array.from(t.querySelectorAll(su)).filter(m=>m instanceof HTMLElement);if(!t.hasAttribute(au)&&n.length===0)return null;let o=t.querySelector('[data-clean-copy-ui="navigation"]'),i=o instanceof HTMLElement?o:null,d=new URL(e.URL),c=[],b=new Map;for(let m of i?.querySelectorAll("a[href]")??[]){let S=m.getAttribute("href");if(!S)continue;let R;try{R=new URL(S,d)}catch{continue}if(kd(R,d)&&R.hash)try{b.set(decodeURIComponent(R.hash.slice(1)),Qt(m))}catch{}else!kd(R,d)&&(R.protocol==="https:"||R.protocol==="http:")&&c.push({title:Qt(m),href:R.href})}let x=[];if(n.length>1)for(let m of n){let S=wd(m,"h1,h2,h3,h4,h5,h6"),R=S[0],$=m.getAttribute("data-clean-copy-source-id")??"",Y=m.parentElement,re=Y instanceof HTMLElement&&Y.id===$?Y:R??m,L=S.filter(ve=>ve.tagName!=="H1"),pe=Math.min(...L.map(ve=>Number(ve.tagName.slice(1))));x.push({target:re,title:m.getAttribute("data-clean-copy-label")||(R?Qt(R):b.get($))||s("toolbox.reading.chapterFallback",{number:x.length+1}),sections:L.filter(ve=>Number(ve.tagName.slice(1))===pe).map(ve=>({target:ve,title:Qt(ve)}))})}else{let m=n[0]??t;for(let S of wd(m,"h2,h3"))S.tagName==="H2"?x.push({target:S,title:Qt(S),sections:[]}):x[x.length-1]?.sections.push({target:S,title:Qt(S)})}return x.reduce((m,S)=>m+1+S.sections.length,0)<=1?null:(x.forEach((m,S)=>{xd(m.target,`clean-copy-chapter-${S+1}`),m.sections.forEach((R,$)=>xd(R.target,`clean-copy-chapter-${S+1}-section-${$+1}`))}),{main:t,chapters:x,related:c,oldNavigation:i})}function _i(e){for(let t=e;t;t=t.parentElement)t instanceof HTMLDetailsElement&&(t.open=!0)}function Bi(e,t){let n=-1;return e.forEach((o,i)=>{o.target.getClientRects().length>0&&o.target.getBoundingClientRect().top<=t&&(n=i)}),n}var Cd=`${fn}
:host {
  --reading-rail: ${be.railWidth}px;
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
`;function Ed(e){return`
      @media screen {
        ${e} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${be.chapterGap}px; }
      }
      @media screen and (max-width:${be.narrowWidth}px) {
        ${e} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${be.chapterGapNarrow}px; }
      }
      ${e} [data-clean-copy-ui="navigation"],
      ${e} #sp-to-top { display:none !important; }`}function Sd(e,t){if(window.scrollY<=be.edge)return null;let n=e.getBoundingClientRect(),o=Math.max(n.left,0)+be.edge,i=document.caretRangeFromPoint?.(o,t);if(i&&e.contains(i.startContainer)){i.startContainer instanceof Text&&i.startOffset<i.startContainer.length&&i.setEnd(i.startContainer,i.startOffset+1);let d=i.getBoundingClientRect();if(d.height>0&&d.bottom>=t&&d.top<window.innerHeight)return{range:i,top:d.top,scrollY:window.scrollY}}for(let d of e.querySelectorAll("p,h1,h2,h3,li,td")){let c=d.getBoundingClientRect();if(d.getClientRects().length===0||c.bottom<t||c.top>window.innerHeight)continue;let b=document.createRange(),x=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);for(let m=x.nextNode();m;m=x.nextNode()){if(!(m instanceof Text)||!m.textContent?.trim())continue;b.setStart(m,0),b.setEnd(m,Math.min(1,m.length));let S=b.getBoundingClientRect();if(S.height>0)return{range:b,top:S.top,scrollY:window.scrollY}}}return null}var Fi=class{constructor(t,n){this.options=n;this.host=document.createElement(lr);this.shadow=this.host.attachShadow({mode:"open"});this.rail=a("nav","rail");this.tree=a("div","tree");this.chapterList=a("ol","chapter-list");this.sectionList=a("ol","section-list");this.rows=[];this.relatedBox=a("div","related");this.viewport=a("div","viewport");this.trigger=a("button","trigger");this.chapterLine=a("span","chapter-line");this.sectionLine=a("span","section-line");this.sheet=a("dialog","sheet");this.sheetHeader=a("div","sheet-header");this.sheetContent=a("div","sheet-content");this.links=[];this.chapter=-1;this.section=-1;this.displayedChapter=-1;this.right=0;this.compact=!0;this.interacting=!1;this.focused=!1;this.queued=!1;this.resizing=!1;this.printing=!1;this.destroyed=!1;this.applying=!1;this.lastPosition=null;this.fingerprint="";this.resizeObserver=null;this.pageStyle=a("style");this.stopWatchingTop=()=>{};this.onScroll=()=>this.queue();this.onResize=()=>{if(this.resizing||this.printing||this.destroyed)return;this.resizing=!0;let t=this.lastPosition;requestAnimationFrame(()=>{this.preserve(()=>this.layout(),t),this.resizing=!1})};this.onHash=()=>{this.close(!1);let t;try{t=decodeURIComponent(window.location.hash.slice(1))}catch{return}let n=document.getElementById(t);n instanceof HTMLElement&&this.outline.main.contains(n)&&(_i(n),this.layout(),n.scrollIntoView({block:"start",behavior:"instant"})),this.queue()};this.beforePrint=()=>{this.printing=!0,this.close(!1)};this.afterPrint=()=>{this.printing=!1,this.layout(),this.queue()};this.outline=t;let o=document.documentElement;this.original={left:o.style.paddingLeft,right:o.style.paddingRight,top:o.style.paddingTop,transition:o.style.transition,maxWidth:t.main.style.maxWidth,printWidth:getComputedStyle(t.main).maxWidth};let i=a("style");i.textContent=Cd,this.viewport.setAttribute("aria-hidden","true"),this.shadow.append(i,this.viewport,this.rail,this.trigger,this.sheet),this.rail.setAttribute("aria-label",s("toolbox.reading.railLabel")),this.rail.append(this.tree,this.relatedBox),this.trigger.type="button",this.trigger.setAttribute("aria-haspopup","dialog"),this.trigger.setAttribute("aria-expanded","false");let d=a("span","trigger-copy");d.append(this.chapterLine,this.sectionLine);let c=a("span","trigger-label",s("toolbox.reading.contents"));if(c.append(ae(So,le.small)),this.trigger.append(d,c),this.trigger.addEventListener("click",()=>this.open()),this.sheet.setAttribute("aria-label",s("toolbox.reading.sheetLabel")),this.sheet.append(this.sheetHeader,this.sheetContent),this.sheet.addEventListener("close",()=>this.finishClose()),this.sheet.addEventListener("cancel",b=>{b.preventDefault(),this.close()}),this.sheet.addEventListener("keydown",b=>{b.stopPropagation(),b.key==="Escape"&&(b.preventDefault(),this.close())}),this.rail.addEventListener("pointerenter",()=>{this.interacting=!0}),this.rail.addEventListener("pointerleave",()=>{this.interacting=!1,this.queue()}),this.rail.addEventListener("focusin",()=>{this.focused=!0}),this.rail.addEventListener("focusout",()=>{this.focused=!1,this.queue()}),this.pageStyle.textContent=`${Ed("html[data-surprise-reading]")}
      @media print {
        html[data-surprise-reading] { padding-left:${this.original.left||"0"} !important; padding-right:${this.original.right||"0"} !important; padding-top:${this.original.top||"0"} !important; }
        html[data-surprise-reading] main { max-width:${this.original.printWidth||"none"} !important; }
      }`,document.head.append(this.pageStyle),document.body.append(this.host),o.setAttribute("data-surprise-reading",""),this.buildRail(),Oe.setScrollGap(be.edge),this.sync(),this.layout(),this.sync(),this.remember(),this.stopWatchingTop=Oe.watch(()=>{this.applying||this.preserve(()=>this.layout(),this.lastPosition)}),window.addEventListener("scroll",this.onScroll,{passive:!0}),window.addEventListener("resize",this.onResize),window.addEventListener("hashchange",this.onHash),window.addEventListener("popstate",this.onHash),window.addEventListener("beforeprint",this.beforePrint),window.addEventListener("afterprint",this.afterPrint),this.mutationObserver=new MutationObserver(b=>{b.some(m=>(m.target instanceof Element?m.target:m.target.parentElement)?.closest("h1,h2,h3")?!0:[...m.addedNodes,...m.removedNodes].some(R=>R instanceof Element&&(R.matches("h1,h2,h3,article,details")||R.querySelector("h1,h2,h3"))))&&this.refreshOutline(),this.queue()}),this.mutationObserver.observe(t.main,{subtree:!0,childList:!0,characterData:!0}),typeof ResizeObserver<"u"){this.resizeObserver=new ResizeObserver(()=>this.onResize()),this.resizeObserver.observe(t.main),this.resizeObserver.observe(this.trigger);let b=document.querySelector(`[${Ct}]`);b&&this.resizeObserver.observe(b)}t.main.addEventListener("toggle",this.onResize,!0),document.fonts?.ready.then(()=>this.onResize()),window.location.hash&&requestAnimationFrame(this.onHash)}entryLink(t,n){let o=a("a",n?"entry numbered":"entry");if(n){let i=Ni(t.title,n);o.append(a("span","entry-number",n),a("span","entry-title",i)),o.setAttribute("aria-label",t.title)}else o.textContent=t.title;return o.href=dr(window.location.href,t.target.id),o.dataset.target=t.target.id,o.addEventListener("click",i=>{i.metaKey||i.ctrlKey||i.shiftKey||i.altKey||i.button!==0||(i.preventDefault(),this.go(t))}),o}addRelated(t){t.replaceChildren();for(let o of this.outline.related){let i=a("a","",`${o.title} ↗`);i.href=o.href,t.append(i)}let n=a("a","",s("toolbox.reading.top"));n.href=dr(window.location.href,"sp-top"),n.addEventListener("click",o=>{if(o.metaKey||o.ctrlKey||o.shiftKey||o.altKey)return;o.preventDefault(),this.close(!1);let i=new URL(window.location.href);i.hash="",history.pushState(null,"",i.href),window.scrollTo({top:0,behavior:"instant"}),this.queue()}),t.append(n)}buildRail(){this.fingerprint=this.outline.chapters.map(n=>`${n.target.id}:${n.title}:${n.sections.map(o=>`${o.target.id}:${o.title}`).join("|")}`).join(`
`);let t=a("p","rail-title",s("toolbox.reading.overview"));t.append(a("span","count",s("toolbox.reading.chapterCount",{count:this.outline.chapters.length}))),this.chapterList.replaceChildren(),this.links=[],this.rows=[];for(let[n,o]of this.outline.chapters.entries()){let i=a("li","chapter"),d=this.entryLink(o,String(n+1).padStart(2,"0"));this.links.push(d),this.rows.push(i),i.append(d),this.chapterList.append(i)}this.sectionList.remove(),this.tree.replaceChildren(t,this.chapterList),this.addRelated(this.relatedBox),this.displayedChapter=-1}refreshOutline(){let t=Di(document);!t||t.chapters.map(o=>`${o.target.id}:${o.title}:${o.sections.map(i=>`${i.target.id}:${i.title}`).join("|")}`).join(`
`)===this.fingerprint||(this.outline=t,this.buildRail(),this.sheet.open&&this.showChapters())}get bannerHeight(){return document.querySelector(`[${Ct}]`)?.getBoundingClientRect().height??0}get baseTop(){return Oe.above("reading")+this.bannerHeight}get top(){return this.baseTop+(this.compact?this.trigger.getBoundingClientRect().height:0)}get layoutHeight(){return Math.max(window.innerHeight,this.viewport.getBoundingClientRect().height)}get readingLine(){return this.top+Math.max(be.edge*2,Math.min(be.readingLineMax,(window.innerHeight-this.top)*be.readingLineFraction))}setPanel(t){this.right!==t&&this.preserve(()=>{this.right=t,this.layout()})}preserve(t,n=Sd(this.outline.main,this.readingLine)){let o=window.scrollY<=be.edge;if(t(),n&&n.range.startContainer.isConnected){let i=n.top-(window.scrollY-n.scrollY),d=n.range.getBoundingClientRect().top-i;if(Math.abs(d)>1){let c=d+i-Math.max(i,this.top+be.edge);Math.abs(c)>1&&window.scrollBy({top:c,behavior:"instant"})}}else o&&window.scrollTo({top:0,behavior:"instant"});this.sync(),this.remember()}layout(){if(this.printing||this.destroyed)return;let t=document.documentElement,n=t.clientWidth-this.right,o=this.baseTop;this.host.style.setProperty("--reading-top",`${o}px`),this.host.style.setProperty("--reading-right",`${this.right}px`),this.host.style.setProperty("--reading-left",`${Math.max(be.edge,(n-be.minWidth)/2+be.edge)}px`),this.rail.hidden=!1;let i=Number.parseFloat(getComputedStyle(this.host).getPropertyValue("--size-touch"))||44,d=this.tree.firstElementChild?.getBoundingClientRect().height??0,c=this.links.reduce((S,R)=>S+R.getBoundingClientRect().height,0),b=d+c+i*be.minSectionRows+this.relatedBox.offsetHeight+i+be.edge*4,x=this.right===0?window.innerWidth:n;this.compact=x<be.minWidth||this.layoutHeight-o<b,this.rail.hidden=this.compact,this.trigger.hidden=!this.compact;let m=this.compact?this.trigger.getBoundingClientRect().height:0;t.style.transition="none",t.style.paddingRight=this.right?`${this.right}px`:this.original.right,t.style.paddingLeft=this.compact?this.original.left:`${be.railWidth+be.gap}px`,this.outline.main.style.maxWidth=`${be.bodyWidth}px`,this.applying=!0,Oe.set("reading",m),this.applying=!1}sync(t=!1){if(this.destroyed)return;let n=this.readingLine+1,o=window.scrollY>0&&window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-1,i=Math.max(0,Bi(this.outline.chapters,o?Number.POSITIVE_INFINITY:n)),d=this.outline.chapters[i];if(!d)return;let c=Bi(d.sections,o?Number.POSITIVE_INFINITY:n);if(this.chapter=i,this.section=c,this.chapterLine.textContent=s("toolbox.reading.chapterLine",{at:String(i+1).padStart(2,"0"),total:String(this.outline.chapters.length).padStart(2,"0"),title:Ni(d.title,String(i+1))}),this.sectionLine.textContent=d.sections[c]?.title??s("toolbox.reading.chapterStart"),this.trigger.title=s("toolbox.reading.triggerTitle",{chapter:d.title,section:this.sectionLine.textContent}),this.links.forEach((m,S)=>{S===i?m.setAttribute("aria-current","location"):m.removeAttribute("aria-current")}),!t&&(this.interacting||this.focused))return;if(this.displayedChapter!==i){let m=d.sections.map((S,R)=>{let $=a("li");return $.append(this.entryLink(S,`${i+1}.${R+1}`)),$});this.sectionList.replaceChildren(...m),this.sectionList.remove(),m.length&&this.rows[i]?.append(this.sectionList),this.displayedChapter=i,requestAnimationFrame(()=>{this.destroyed||this.preserve(()=>this.layout())})}let b=d.sections[c]?.target.id,x=this.links[i];for(let m of this.sectionList.querySelectorAll("a"))m.dataset.target===b?(m.setAttribute("aria-current","location"),x=m):m.removeAttribute("aria-current");if(x&&!this.compact){let m=x.getBoundingClientRect(),S=this.tree.getBoundingClientRect();m.top<S.top?this.tree.scrollTop+=m.top-S.top:m.bottom>S.bottom&&(this.tree.scrollTop+=m.bottom-S.bottom)}}sheetFrame(t){let o=a("h2","sheet-title",s("toolbox.reading.chapterCount",{count:this.outline.chapters.length}));if(t){let d=a("button","control",`‹ ${s("toolbox.reading.chapterCount",{count:this.outline.chapters.length})}`);d.type="button",d.addEventListener("click",()=>{this.showChapters(),this.sheetHeader.querySelector("button")?.focus()}),o=d}let i=a("button","control",s("toolbox.common.close"));i.type="button",i.addEventListener("click",()=>this.close()),this.sheetHeader.replaceChildren(o,i),this.sheetContent.replaceChildren(),this.sheetContent.scrollTop=0}showChapters(){this.sheetFrame(!1);let t=a("ol");this.outline.chapters.forEach((o,i)=>{let d=a("li","chapter-row"),c=this.entryLink(o,String(i+1).padStart(2,"0"));if(i===this.chapter&&c.setAttribute("aria-current","location"),d.append(c),i===this.chapter&&d.append(a("p","current-note",s("toolbox.reading.current",{section:o.sections[this.section]?.title??s("toolbox.reading.chapterStart")}))),o.sections.length){let b=a("div","chapter-extra"),x=a("button","control drill",`${s("toolbox.reading.sectionCount",{count:o.sections.length})} ›`);x.type="button",x.setAttribute("aria-label",s("toolbox.reading.drillLabel",{chapter:o.title,count:o.sections.length})),x.addEventListener("click",()=>this.showSections(i)),b.append(x),d.append(b)}t.append(d)});let n=a("div","related");this.addRelated(n),this.sheetContent.append(t,n)}showSections(t){let n=this.outline.chapters[t];if(!n)return;this.sheetFrame(!0);let o=a("h2","sheet-heading",n.title),i=a("ol","section-entries");n.sections.forEach((d,c)=>{let b=a("li"),x=this.entryLink(d,`${t+1}.${c+1}`);t===this.chapter&&c===this.section&&x.setAttribute("aria-current","location"),b.append(x),i.append(b)}),this.sheetContent.append(o,i),this.sheetHeader.querySelector("button")?.focus()}open(){this.sheet.open||(this.options.onDialogChange(!0),this.showChapters(),this.trigger.setAttribute("aria-expanded","true"),this.sheet.showModal())}close(t=!0){this.sheet.open&&(this.sheet.close(),this.finishClose(),t&&this.compact&&this.trigger.focus({preventScroll:!0}))}finishClose(){this.sheet.open||(this.trigger.setAttribute("aria-expanded","false"),this.options.onDialogChange(!1))}go(t){this.close(!1),_i(t.target),this.layout(),history.pushState(null,"",dr(window.location.href,t.target.id)),t.target.scrollIntoView({block:"start",behavior:"instant"});let n=t.target.getAttribute("tabindex");t.target.tabIndex=-1,t.target.focus({preventScroll:!0}),t.target.addEventListener("blur",()=>{n===null?t.target.removeAttribute("tabindex"):t.target.setAttribute("tabindex",n)},{once:!0}),this.sync(!0),this.remember()}remember(){this.lastPosition=Sd(this.outline.main,this.readingLine)}queue(){this.queued||this.printing||this.destroyed||(this.queued=!0,requestAnimationFrame(()=>{this.queued=!1,this.sync(),this.remember()}))}destroy(){this.close(!1),this.destroyed=!0,window.removeEventListener("scroll",this.onScroll),window.removeEventListener("resize",this.onResize),window.removeEventListener("hashchange",this.onHash),window.removeEventListener("popstate",this.onHash),window.removeEventListener("beforeprint",this.beforePrint),window.removeEventListener("afterprint",this.afterPrint),this.outline.main.removeEventListener("toggle",this.onResize,!0),this.resizeObserver?.disconnect(),this.mutationObserver.disconnect();let t=document.documentElement;t.removeAttribute("data-surprise-reading"),t.style.paddingLeft=this.original.left,t.style.paddingRight=this.original.right,this.stopWatchingTop(),Oe.set("reading",0),Oe.setScrollGap(0),t.style.transition=this.original.transition,this.outline.main.style.maxWidth=this.original.maxWidth,this.host.remove(),this.pageStyle.remove()}};function Td(e){for(let n of document.querySelectorAll(`${lr}[${sr}]`))n.remove();if(document.querySelector(lr))return null;let t=Di(document);return t?new Fi(t,e):null}function Ld(){for(let e of document.querySelectorAll(`style[${sr}="${yd}"]`))e.remove()}var q=ct(),Od="surprise-pages:comments:width",f={personal:!1,slug:"",visibility:"internal",viewer:null,get comments(){return z.state.comments},set comments(e){z.state.comments=e},get anchored(){return y.state.anchored},set anchored(e){y.state.anchored=e},get expanded(){return z.state.expanded},set expanded(e){z.state.expanded=e},currentVersion:null,favorite:null,get outcomes(){return z.state.outcomes},set outcomes(e){z.state.outcomes=e},get outcomesFor(){return z.state.outcomesFor},set outcomesFor(e){z.state.outcomesFor=e},get review(){return z.state.review},set review(e){z.state.review=e},get filter(){return z.state.filter},set filter(e){z.state.filter=e},get sort(){return z.state.sort},set sort(e){z.state.sort=e},get picked(){return z.state.picked},set picked(e){z.state.picked=e},open:!1,width:Fa,get activeId(){return y.state.activeId},set activeId(e){y.state.activeId=e},get editor(){return z.state.editor},set editor(e){z.state.editor=e},get confirmDeleteId(){return z.state.confirmDeleteId},set confirmDeleteId(e){z.state.confirmDeleteId=e},features:{tools:!1,history:!1,sharing:!1,edit:!1,write:!1},view:"comments",get versions(){return te.state.versions},set versions(e){te.state.versions=e},get moreVersions(){return te.state.moreVersions},set moreVersions(e){te.state.moreVersions=e},get compare(){return te.state.compare},set compare(e){te.state.compare=e},get access(){return ce.state.access},set access(e){ce.state.access=e},get accessEmail(){return ce.state.accessEmail},set accessEmail(e){ce.state.accessEmail=e},get accessInvited(){return ce.state.accessInvited},set accessInvited(e){ce.state.accessInvited=e},get accessScopeTo(){return ce.state.accessScopeTo},set accessScopeTo(e){ce.state.accessScopeTo=e},get accessRevokeId(){return ce.state.accessRevokeId},set accessRevokeId(e){ce.state.accessRevokeId=e},get accessApproveId(){return ce.state.accessApproveId},set accessApproveId(e){ce.state.accessApproveId=e},busy:!1,get origin(){return ze.state.origin},set origin(e){ze.state.origin=e},get originJob(){return ze.state.originJob},set originJob(e){ze.state.originJob=e}},Me=null,ye=null,ro=null,oo=null,Zt=null,mt=null,Lt=null,to=null,At=null,cr=null,An=null,Mt=null,ur=null,en=null,st=[],Mn=new Map,$i=new Map,bt=!1,Ft=!1,tn=null,Ad=null,qi=null,ce=Rl({get pushToast(){return hr},get showError(){return nn},get barLink(){return cr},get narrowLink(){return At},get setOpen(){return y.setOpen},get handleFailure(){return Vt},get render(){return Qe},get renderPanelBody(){return Wi},get actionButton(){return fr},state:{get view(){return f.view},set view(e){f.view=e},get busy(){return f.busy},set busy(e){f.busy=e},get slug(){return f.slug},set slug(e){f.slug=e},get features(){return f.features},set features(e){f.features=e},get visibility(){return f.visibility},set visibility(e){f.visibility=e},get personal(){return f.personal},set personal(e){f.personal=e}}}),ze=wl({get loadedVersion(){return te.loadedVersion},get showError(){return nn},get render(){return Qe},get showNotice(){return ce.showNotice},get clearCompare(){return te.clearCompare},get copyText(){return ce.copyText},get pageUrl(){return ce.pageUrl},get isComparing(){return te.isComparing},get exitCompare(){return te.exitCompare},get setOpen(){return y.setOpen},get handleFailure(){return Vt},get CHANGE_KINDS(){return te.CHANGE_KINDS},get actionButton(){return fr},get bar(){return ye},get root(){return Me},get isNarrow(){return y.isNarrow},get tokenPx(){return y.tokenPx},state:{get features(){return f.features},set features(e){f.features=e},get visibility(){return f.visibility},set visibility(e){f.visibility=e},get slug(){return f.slug},set slug(e){f.slug=e},get currentVersion(){return f.currentVersion},set currentVersion(e){f.currentVersion=e},get compare(){return f.compare},set compare(e){f.compare=e},get view(){return f.view},set view(e){f.view=e},get busy(){return f.busy},set busy(e){f.busy=e}}}),te=nl({get handleFailure(){return Vt},get render(){return Qe},get setOpen(){return y.setOpen},get hidePopover(){return y.hidePopover},get hideSelectionBar(){return y.hideSelectionBar},get hideMarkPeek(){return y.hideMarkPeek},get pushToast(){return hr},get fillOutcomes(){return z.fillOutcomes},get syncMarks(){return y.syncMarks},get outcomeTargetVersion(){return z.outcomeTargetVersion},get closeOriginCompare(){return ze.closeOriginCompare},get renderPanelBody(){return Wi},get root(){return Me},get isNarrow(){return y.isNarrow},get originDiffError(){return ze.originDiffError},set originDiffError(e){ze.originDiffError=e},get outcomeOf(){return z.outcomeOf},get appendQuoteStory(){return z.appendQuoteStory},get topLevel(){return z.topLevel},state:{get slug(){return f.slug},set slug(e){f.slug=e},get view(){return f.view},set view(e){f.view=e},get outcomesFor(){return f.outcomesFor},set outcomesFor(e){f.outcomesFor=e},get outcomes(){return f.outcomes},set outcomes(e){f.outcomes=e},get features(){return f.features},set features(e){f.features=e},get comments(){return f.comments},set comments(e){f.comments=e}}}),z=yl({get draft(){return y.draft},set draft(e){y.draft=e},get render(){return Qe},get handleFailure(){return Vt},get showNotice(){return ce.showNotice},get refresh(){return mr},get loadedVersion(){return te.loadedVersion},get ensureVersions(){return te.ensureVersions},get findVersion(){return te.findVersion},get pushToast(){return hr},get setOpen(){return y.setOpen},get startCompare(){return te.startCompare},get gotoChange(){return te.gotoChange},get afterChange(){return qd},get avatarFor(){return Hd},get actionButton(){return fr},get iconAction(){return Dd},get prioritySendRow(){return _d},get canSend(){return pr},get priorityPicker(){return du},get textArea(){return Bd},get selectFromCard(){return y.selectFromCard},get priorityTag(){return Nd},get copyText(){return ce.copyText},get pageUrl(){return ce.pageUrl},get showError(){return nn},get hidePopover(){return y.hidePopover},get hideSelectionBar(){return y.hideSelectionBar},get closeComposeDock(){return y.closeComposeDock},get updateToast(){return fu},get closeHandlers(){return $i},get isNarrow(){return y.isNarrow},get flashCard(){return y.flashCard},get focusCard(){return y.focusCard},get draftFocused(){return y.draftFocused},set draftFocused(e){y.draftFocused=e},get openComposeDock(){return y.openComposeDock},get LIST_MENU_MARK(){return zi},get listMenuOpen(){return Ft},set listMenuOpen(e){Ft=e},get listMenuButton(){return mt},get pickButton(){return Lt},get exportTools(){return to},get listMenuBox(){return An},get listBox(){return Mt},get applyFocus(){return y.applyFocus},get dockQuote(){return y.dockQuote},set dockQuote(e){y.dockQuote=e},get discardDraft(){return y.discardDraft},get updateScrollPadding(){return y.updateScrollPadding},get pickBar(){return ur},state:{get viewer(){return f.viewer},set viewer(e){f.viewer=e},get busy(){return f.busy},set busy(e){f.busy=e},get slug(){return f.slug},set slug(e){f.slug=e},get currentVersion(){return f.currentVersion},set currentVersion(e){f.currentVersion=e},get compare(){return f.compare},set compare(e){f.compare=e},get features(){return f.features},set features(e){f.features=e},get view(){return f.view},set view(e){f.view=e},get activeId(){return f.activeId},set activeId(e){f.activeId=e},get anchored(){return f.anchored},set anchored(e){f.anchored=e},get open(){return f.open},set open(e){f.open=e}}}),y=Sl({get isComparing(){return te.isComparing},get inList(){return z.inList},get listBox(){return Mt},get picking(){return z.picking},get matchesFilter(){return z.matchesFilter},get render(){return Qe},get avatarFor(){return Hd},get visibleForList(){return z.visibleForList},get priorityTag(){return Nd},get appendQuoteStory(){return z.appendQuoteStory},get editorBox(){return z.editorBox},get repliesOf(){return z.repliesOf},get isMine(){return z.isMine},get actionButton(){return fr},get iconAction(){return Dd},get panel(){return ro},get afterChange(){return qd},get refresh(){return mr},get readingNavigation(){return qi},get originalPaddingRight(){return Ad},set originalPaddingRight(e){Ad=e},get root(){return Me},get STORAGE_WIDTH(){return Od},get watchChanges(){return te.watchChanges},get moreMenuOpen(){return bt},set moreMenuOpen(e){bt=e},get moreButton(){return tn},get prioritySendRow(){return _d},get submitDraft(){return z.submitDraft},get canSend(){return pr},get textArea(){return Bd},get canAct(){return z.canAct},get readOnly(){return()=>f.viewer!==null&&!f.features.write},get copyText(){return ce.copyText},get showError(){return nn},get sheetComposer(){return z.sheetComposer},state:{get comments(){return f.comments},set comments(e){f.comments=e},get filter(){return f.filter},set filter(e){f.filter=e},get open(){return f.open},set open(e){f.open=e},get editor(){return f.editor},set editor(e){f.editor=e},get confirmDeleteId(){return f.confirmDeleteId},set confirmDeleteId(e){f.confirmDeleteId=e},get width(){return f.width},set width(e){f.width=e},get view(){return f.view},set view(e){f.view=e}}});function Hd(e){let t=es(e.name);if(e.image===null||!(e.image.startsWith("https://")||Es(e.image)))return t;let n=a("img","avatar");return n.src=e.image,n.alt="",n.referrerPolicy="no-referrer",n.addEventListener("error",()=>n.replaceWith(t),{signal:q.signal}),n}function Ki(e){let t=Dt[e],n=a("span","dot-label");return n.appendChild(a("span",t.dotClass)),n.appendChild(document.createTextNode(t.label)),n}function Nd(e){if(e==="good"){let o=a("span","tag");return o.title=s("toolbox.compose.good"),o.appendChild(ae(mn,le.small)),o}let t=Dt[e],n=a("span","tag");return n.title=t.description,n.appendChild(Ki(e)),n}function fr(e,t,n,o,i){let d=a("button",o===void 0?"action":`action ${o}`);return d.type="button",i!==void 0&&d.setAttribute("aria-label",i),d.appendChild(ae(t,le.small)),d.appendChild(a("span",void 0,e)),d.addEventListener("click",c=>{c.stopPropagation(),n()},{signal:q.signal}),d}function Dd(e,t,n,o){let i=a("button",o===void 0?"icon-button":`icon-button ${o}`);return i.type="button",i.title=e,i.setAttribute("aria-label",e),i.appendChild(ae(t,le.medium)),i.addEventListener("click",d=>{d.stopPropagation(),n()},{signal:q.signal}),i}function du(e,t){let n=a("div","picker");if(e==="good"){let o=a("span","tag");o.title=s("toolbox.compose.good"),o.appendChild(ae(mn,le.small)),n.appendChild(o)}for(let o of zr){let i=Dt[o],d=a("button",o===e?"pill is-active":"pill");d.type="button",d.title=i.description,d.appendChild(Ki(o)),d.addEventListener("click",c=>{c.stopPropagation(),t(o)},{signal:q.signal}),n.appendChild(d)}return n}function _d(e){let t=a("div","send-row"),n=a("div","send-fixes"),o=[];for(let d of zr){let c=Dt[d],b=a("button","send-pill");b.type="button",b.title=s("toolbox.compose.sendAs",{priority:c.description}),b.setAttribute("aria-label",s("toolbox.compose.sendAsNamed",{label:c.label,priority:c.description})),b.appendChild(Ki(d));let x=uu(d);x!==null&&(b.appendChild(a("span","hint-bubble",x)),b.setAttribute("aria-keyshortcuts",cu(d))),b.addEventListener("click",m=>{m.stopPropagation(),!b.disabled&&e(d)},{signal:q.signal}),n.appendChild(b),o.push(b)}t.appendChild(n);let i=a("button","icon-button");return i.type="button",i.setAttribute("aria-label",s("toolbox.compose.sendGood")),i.appendChild(ae(mn,le.small)),y.hasFinePointer()&&i.appendChild(a("span","hint-bubble",s("toolbox.compose.sendGood"))),i.addEventListener("click",d=>{d.stopPropagation(),e("good")},{signal:q.signal}),t.appendChild(i),{row:t,setEnabled(d){for(let c of o)c.disabled=!d}}}function pr(e){return e.trim().length>0}function cu(e){return`${y.appleKeys()?"Control":"Control+Alt"}+${e[0].toUpperCase()}`}function uu(e){return y.hasFinePointer()?`${y.appleKeys()?"control":"Ctrl + Alt"} + ${e[0].toUpperCase()}`:null}function Bd(e,t,n,o={}){let i=a("textarea");return i.value=e,i.placeholder=t,i.addEventListener("input",()=>n(i.value),{signal:q.signal}),i.addEventListener("keydown",d=>{let c={code:d.code,key:d.key,metaKey:d.metaKey,ctrlKey:d.ctrlKey,altKey:d.altKey,shiftKey:d.shiftKey,isComposing:d.isComposing},b=y.appleKeys();if(o.onPriority!==void 0){let m=Ja(c,b);if(m!==null){d.preventDefault(),pr(i.value)&&o.onPriority(m);return}}if(o.quoteWhenEmpty===void 0||pr(i.value)||!Xa(c,b))return;let x=o.quoteWhenEmpty();x===null||x.length===0||(d.preventDefault(),ce.copyQuote(x))},{signal:q.signal}),i.addEventListener("click",d=>d.stopPropagation(),{signal:q.signal}),i}var Md=0;function pu(){return Md+=1,`t${Md}`}function Fd(e,t){let n=Tl(t);n!==null&&q.timeout(()=>{st=jo(st,e),Rn()},n)}function hr(e,t,n){let o=pu();return st=Ll(st,{id:o,state:t,text:e}),n!==void 0&&Mn.set(o,n),Rn(),Fd(o,t),o}function fu(e,t,n,o){Ml(st,e)!==null&&(st=Al(st,e,t,n),o===void 0?Mn.delete(e):Mn.set(e,o),Rn(),Fd(e,t))}function nn(e){hr(e,"failure")}function Vt(e){let t=e.message;e.status===401&&(f.viewer=null,Ji(),t=s("toolbox.common.sessionExpired")),nn(t),Qe()}function Vd(e){if(f.viewer=e.viewer,f.comments=e.comments,f.features=e.features,f.currentVersion=e.currentVersion,f.favorite=e.favorite,Gd(),Xi(),Ji(),f.picked!==null){let o=new Set(e.comments.map(i=>i.id));for(let i of f.picked)o.has(i)||f.picked.delete(i)}if(f.outcomesFor!==null&&e.currentVersion!==null&&Ut(f.outcomesFor,e.currentVersion)||(f.outcomes=new Map,f.outcomesFor=null),!f.features.tools){Hi(!1),nn(s("toolbox.common.sessionExpired")),Qe();return}Hi(!0),y.syncMarks(!0);let n=z.topLevel().filter(o=>o.resolvedAt===null).length;if(hl(y.sheetOpenPending,n,y.isNarrow())){y.setOpen(!0),z.fillOutcomes(z.outcomesToVersion()),ze.probeOriginOnce();return}Qe(),z.fillOutcomes(z.outcomesToVersion()),ze.probeOriginOnce()}async function mr(e={quiet:!1}){if(q.disposed||go())return!0;let t=await wn(f.slug);return q.disposed||go()?!0:t.ok?(Vd(t.value),!0):((!e.quiet||t.status===401)&&Vt(t),!1)}var $d=kl({refresh:mr,editing:()=>go()||jn(),lifetime:q});function zd(){let e=/^#c=([0-9a-f-]{36})$/i.exec(window.location.hash);if(e===null)return;let t=e[1];if(!f.comments.some(o=>o.id===t))return;f.view="comments";let n=f.comments.find(o=>o.id===t);n!==void 0&&(f.filter=Cn(n)),f.open||y.setOpen(!0),y.selectFromCard(t),y.focusCard(t)}function qd(e){return e.ok?!0:(Vt(e),!1)}function hu(){let e=pt(new Date().toISOString()),t=$o(z.topLevel(),"oldest",new Map),n=t.filter(i=>i.resolvedAt===null).length,o=[`# コメント一覧: ${f.slug}`,"",`- ページ: ${window.location.origin}${window.location.pathname}`,`- 書き出し: ${e}`,`- 件数: 未解決 ${n} 件 / 全 ${t.length} 件`];for(let i of ra){let d=t.filter(b=>b.priority===i);if(d.length===0)continue;let c=i==="good"?`## いいね ${d.length} 件`:`## ${Dt[i].label}（${vo(`toolbox.priority.${i}`)}） ${d.length} 件`;o.push("",c),d.forEach((b,x)=>{let m=b.resolvedAt===null?"未解決":"解決済",S=b.quote===null?"（引用なし）":`「${b.quote}」`;o.push("",`### ${x+1}. [${m}] ${S}`),o.push(`- ${b.author.name} / ${pt(b.createdAt)}`),b.body.length>0&&o.push("",b.body);for(let R of z.repliesOf(b.id))o.push("",`> **${R.author.name}**: ${R.body.replace(/\n/g," ")}`)})}return`${o.join(`
`)}
`}function mu(){let e=f.slug.replace(/\//g,"-");$n(`comments-${e}.md`,"text/markdown",hu())}function gu(){let e=f.slug.replace(/\//g,"-"),t={page:f.slug,exportedAt:new Date().toISOString(),comments:f.comments};$n(`comments-${e}.json`,"application/json",JSON.stringify(t,null,2))}function Rn(){if(en!==null){en.replaceChildren();for(let e of st){let t=a("div",`toast is-${e.state}`);t.appendChild(a("span","toast-text",e.text));let n=Mn.get(e.id);if(e.state==="failure"&&n!==void 0){let i=a("button","toast-retry");i.type="button",i.textContent=s("toolbox.common.retry"),i.addEventListener("click",()=>{st=jo(st,e.id),Mn.delete(e.id),Rn(),n()},{signal:q.signal}),t.appendChild(i)}let o=a("button","icon-button");o.type="button",o.title=s("toolbox.common.close"),o.appendChild(ae(We,le.small)),o.addEventListener("click",()=>{let i=$i.get(e.id);st=jo(st,e.id),Mn.delete(e.id),$i.delete(e.id),Rn(),i!==void 0&&i()},{signal:q.signal}),t.appendChild(o),en.appendChild(t)}vu()}}function vu(){if(Me===null||en===null)return;let e=Me.host;if(!(e instanceof HTMLElement))return;let t=st.length===0?0:en.offsetHeight;e.style.setProperty("--toast-lane",`${t}px`)}var zi="list-menu-hit";function Wi(){if(Mt!==null){if(f.view==="versions"){Mt.replaceChildren(te.versionsView());return}if(f.view==="changes"){Mt.replaceChildren(te.changesView());return}if(f.view==="access"){Mt.replaceChildren(ce.accessView());return}if(f.view==="origin"){Mt.replaceChildren(ze.originView());return}z.renderList()}}var bu={comments:s("toolbox.panel.comments"),changes:s("toolbox.panel.changes"),versions:s("toolbox.panel.versions"),access:s("toolbox.panel.access"),origin:s("toolbox.panel.origin")};function Qe(){if(q.disposed)return;f.view==="access"&&!ce.canManageAccess()&&(f.view="comments"),f.view==="origin"&&(f.origin===null||!f.origin.stale||f.originJob!==null)&&(f.view="comments"),y.syncMarks();let e=z.topLevel().filter(n=>n.resolvedAt===null).length;yu(e),te.renderCompareBar(),te.applyCompareOffset();let t={menu:bt,dock:y.isDocked(),peek:y.isPeeking(),selection:y.selectionBar!==null&&!y.selectionBar.hidden};if(ye!==null&&(ye.hidden=!dl(t,f.open&&y.isNarrow())),ze.renderOriginHint(),bt&&tn!==null&&ye!==null&&y.popover!==null){let n=tn.getBoundingClientRect(),o=ye.getBoundingClientRect();y.placePopover({left:n.left,width:n.width,top:o.top,bottom:o.bottom}),y.popover.style.left=`${Math.max(xo.edge,Math.round(n.right-y.popover.offsetWidth))}px`}ro!==null&&(ro.hidden=!f.open,y.applyPanelShape()),oo!==null&&(oo.textContent=bu[f.view]),f.view!=="comments"&&(Ft=!1),f.view!=="comments"&&z.picking()&&(f.picked=null),Zt!==null&&(Zt.hidden=f.view!=="comments"),z.paintPickButton(),z.renderPickBar(),At!==null&&(At.hidden=!y.isNarrow(),Gt(At,ce.linkCopied)),An!==null&&f.view!=="comments"&&(An.hidden=!0),y.peek.open&&!y.peekDragging&&!y.peekHandoff&&!y.peekSliding&&y.renderPeek(),Rn(),f.view==="comments"&&z.renderListMenu(),Wi()}function no(e,t,n){let o=a("button","bar-button");return o.type="button",o.title=e,o.setAttribute("aria-label",e),o.appendChild(ae(t,le.medium)),o.addEventListener("click",n,{signal:q.signal}),o}async function Gi(e){Me===null||jn()||(qi?.close(!1),te.isComparing()&&te.exitCompare(),y.setOpen(!1),await rd({pageSlug:f.slug,host:Me,notify:t=>ce.showNotice(t),fail:t=>nn(t),restoreFocus:()=>ye?.querySelector("[data-editor-trigger]")?.focus({preventScroll:!0}),onSaved:({baseVersionId:t})=>z.stashEditReview(t),onClosed:()=>$d.resume(),presenter:e}))}function yu(e){if(ye===null)return;ye.replaceChildren();let t=no(s("toolbox.bar.comments"),ko,()=>{if(f.open&&f.view==="comments"){y.setOpen(!1);return}f.view="comments",y.setOpen(!0)});f.open&&f.view==="comments"&&(t.className="bar-button is-open"),e>0&&(t.appendChild(a("span","bar-count",String(e))),t.setAttribute("aria-label",s("toolbox.bar.commentsCount",{count:e}))),ye.appendChild(t);let n=Jt()?.present??null;if(n!==null&&ye.appendChild(no(s("toolbox.bar.present"),Ra,()=>n.click())),ye.appendChild(a("span","bar-divider")),f.features.edit&&te.loadedVersion===null){let o=no(s("toolbox.bar.edit"),hn,()=>{Gi()});o.setAttribute("data-editor-trigger",""),ye.appendChild(o)}if(f.originJob!==null)if(f.originJob.status==="running"){let o=a("a","bar-status");o.href=f.originJob.url,o.target="_blank",o.rel="noopener noreferrer",o.textContent=s("toolbox.bar.importing"),o.title=f.originJob.url,ye.appendChild(o)}else{ye.appendChild(a("span","bar-status",s("toolbox.common.newVersion")));let o=a("button","bar-status is-action");o.type="button",o.textContent=s("toolbox.bar.reload"),o.addEventListener("click",()=>window.location.reload(),{signal:q.signal}),ye.appendChild(o)}cr=no(s("toolbox.common.copyLink"),Wt,()=>{ce.copyPageUrl()}),Gt(cr,ce.linkCopied),ye.appendChild(cr),tn=Kd().length>0?wu():null,tn!==null?ye.appendChild(tn):bt&&y.hidePopover()}function Ui(){if(Reflect.get(document,"prerendering")===!0){document.addEventListener("prerenderingchange",()=>Ui(),{once:!0});return}if(Is(vn(Ts)))return;let e=Ls(f.slug);if(Vn(e)!==null)return;if(yn(e,"1"),f.viewer!==null&&f.viewer.kind==="member"){f.features.write&&os(f.slug);return}if(f.visibility!=="public")return;let t=document.title.trim(),n=window.location.pathname,o=Ms(Rs(vn(Qr)),{href:n,title:t.length>0?t:n},new Date().toISOString());bn(Qr,Ps(o))}var Yi="bar-more";function Kd(){let e=[],t=[];f.features.history&&!(Pn?.versionShowing()??!1)&&e.push({label:s("toolbox.bar.history"),icon:ya,run:()=>{te.openHistory()}}),ze.originEntryAllowed()&&f.origin!==null&&f.origin.stale&&f.originJob===null&&e.push({label:document.body.hasAttribute("data-deck")?s("toolbox.bar.deckOrigin"):s("toolbox.bar.origin"),icon:Co,run:()=>ze.openOriginConfirm()}),ce.canManageAccess()&&e.push({label:s("toolbox.bar.access"),icon:To,run:()=>{ce.openAccess()}});let n=Jt();if(n!==null){n.presenter!==null&&t.push({label:s("decks.presentLaunch.presenter"),icon:Lo,run:()=>Zl(()=>ye?.querySelector(`.${Yi}`)?.focus({preventScroll:!0}))});let i=n.overview;i!==null&&t.push({label:n.overviewOpen?s("toolbox.bar.overviewClose"):s("toolbox.bar.overview"),icon:Pa,run:()=>i.click()});let d=n.notes;d!==null&&t.push({label:n.notesHidden?s("toolbox.bar.notesShow"):s("toolbox.bar.notesHide"),icon:Ia,run:()=>d.click()})}let o=[];return e.length>0&&o.push({id:"page",rows:e}),t.length>0&&o.push({id:"reading",rows:t}),o}function wu(){let e=no(s("toolbox.bar.more"),Ha,()=>Cu());return e.classList.add(Yi),bt&&e.classList.add("is-open"),e.setAttribute("aria-haspopup","menu"),e.setAttribute("aria-expanded",bt?"true":"false"),e}function xu(){let e=[];for(let t of Kd()){let n=a("div","menu-group");n.dataset.section=t.id;for(let o of t.rows){let i=a("button","button menu-row");i.type="button",i.appendChild(ae(o.icon,le.medium)),i.appendChild(a("span","menu-row-label",o.label)),i.addEventListener("click",()=>{y.hidePopover(),o.run()},{signal:q.signal}),n.appendChild(i)}e.push(n)}return e}function ku(){y.popover===null||tn===null||(y.hidePopover(),y.hideSelectionBar(),bt=!0,y.popover.className="popover is-compact is-menu",y.nameSurface(y.popover,s("toolbox.bar.more")),y.popover.replaceChildren(...xu()),Qe())}function Cu(){if(bt){y.hidePopover();return}ku()}function Eu(){let e=a("aside","panel");e.setAttribute("aria-labelledby","panel-title"),e.style.width=`${f.width}px`;let t=a("div","grip");t.addEventListener("pointerdown",b=>{b.preventDefault(),t.setPointerCapture(b.pointerId);let x=S=>y.setWidth(window.innerWidth-S.clientX),m=()=>{t.removeEventListener("pointermove",x),t.removeEventListener("pointerup",m)};t.addEventListener("pointermove",x,{signal:q.signal}),t.addEventListener("pointerup",m,{signal:q.signal})},{signal:q.signal}),e.appendChild(t);let n=a("div","sheet-grab-area");n.appendChild(a("div","peek-grab")),y.attachSheetDrag(n),e.appendChild(n);let o=a("div","panel-head");oo=a("h2","panel-title",s("toolbox.panel.comments")),oo.id="panel-title",o.appendChild(oo),o.appendChild(a("span","spacer")),Zt=a("span","head-tools"),mt=a("button",`icon-button ${zi}`),mt.type="button",mt.title=s("toolbox.list.menu"),mt.setAttribute("aria-label",s("toolbox.list.menu")),mt.setAttribute("aria-haspopup","menu"),mt.setAttribute("aria-expanded","false"),mt.appendChild(ae(xa,le.medium)),mt.addEventListener("click",b=>{b.stopPropagation(),Ft=!Ft,Qe()},{signal:q.signal}),Zt.appendChild(mt),Lt=a("button","icon-button"),Lt.type="button",Lt.title=s("toolbox.list.pick"),Lt.setAttribute("aria-label",s("toolbox.list.pick")),Lt.setAttribute("aria-pressed","false"),Lt.appendChild(ae(ka,le.medium)),Lt.addEventListener("click",b=>{b.stopPropagation(),z.picking()?z.stopPicking():z.startPicking()},{signal:q.signal}),Zt.appendChild(Lt),to=a("span","head-tools");let i=a("button","icon-button");i.type="button",i.title=s("toolbox.panel.exportMarkdown"),i.appendChild(ae(ga,le.medium)),i.addEventListener("click",()=>mu(),{signal:q.signal}),to.appendChild(i);let d=a("button","icon-button");d.type="button",d.title=s("toolbox.panel.exportJson"),d.appendChild(ae(ba,le.medium)),d.addEventListener("click",()=>gu(),{signal:q.signal}),to.appendChild(d),Zt.appendChild(to),o.appendChild(Zt),At=a("button","icon-button"),At.type="button",Gt(At,ce.linkCopied),At.addEventListener("click",()=>{ce.copyPageUrl()},{signal:q.signal}),o.appendChild(At);let c=a("button","icon-button");return c.type="button",c.title=s("toolbox.common.close"),c.appendChild(ae(We,le.medium)),c.addEventListener("click",()=>y.setOpen(!1),{signal:q.signal}),o.appendChild(c),e.appendChild(o),An=a("div",zi),An.hidden=!0,e.appendChild(An),Mt=a("div","list"),e.appendChild(Mt),ur=a("div","pick-bar"),ur.hidden=!0,e.appendChild(ur),e}function Su(){let e=o=>o instanceof Element&&o.closest(Ke)!==null;document.addEventListener("click",o=>{let i=Do(o.target);if(i!==null){let b=i.dataset.commentId;if(b===void 0)return;o.preventDefault(),y.selectFromMark(b,o);return}let d=e(o.target);if(y.peek.open){El(y.peek,o,d).open||y.hideMarkPeek();return}let c=o.composedPath().some(b=>b instanceof Element&&b.classList.contains(Yi));if(bt&&!c){y.hidePopover();return}Ft&&!z.onListMenu(o)&&(Ft=!1,Qe()),!d&&y.popover!==null&&!y.popover.hidden&&y.hidePopover()},{signal:q.signal}),document.addEventListener("mouseover",o=>{let i=Do(o.target);i!==null&&Vs(i)},{signal:q.signal}),document.addEventListener("mouseout",o=>{let i=Do(o.target);if(i===null)return;let d=i.dataset.commentId,c=f.comments.find(b=>b.id===d);c!==void 0&&Kn(i,c,c.id===f.activeId)},{signal:q.signal}),document.addEventListener("selectionchange",()=>{let o=window.getSelection();(o===null||o.isCollapsed)&&y.hideSelectionBar(),y.scheduleSelectionCheck()},{signal:q.signal}),document.addEventListener("pointerdown",o=>{e(o.target)||(y.adjustingSelection=!0,q.clearTimeout(y.selectionTimer))},{capture:!0,signal:q.signal});let t=o=>{y.adjustingSelection=!1,!e(o)&&y.scheduleSelectionCheck()};document.addEventListener("pointerup",o=>t(o.target),{signal:q.signal}),document.addEventListener("pointercancel",()=>t(null),{signal:q.signal}),document.addEventListener("mouseup",o=>t(o.target),{signal:q.signal}),document.addEventListener("keydown",o=>{if(o.key!=="Escape")return;if(y.isPeeking()){y.hideMarkPeek();return}if(y.draft!==null&&y.isNarrow()){y.discardDraft();return}if(Ft){z.closeListMenu(),mt?.focus();return}let i=y.popover!==null&&!y.popover.hidden;i&&y.hidePopover(),y.hideSelectionBar(),!i&&te.isComparing()&&te.exitCompare()},{signal:q.signal}),y.attachKeyboardDismiss(),$d.start(),window.addEventListener("resize",()=>y.handleResize(),{signal:q.signal});let n=()=>{y.applyViewportHeight(),y.settleComposeDock()};window.visualViewport?.addEventListener("resize",n,{signal:q.signal}),window.visualViewport?.addEventListener("scroll",n,{signal:q.signal}),window.addEventListener("hashchange",()=>zd(),{signal:q.signal}),window.addEventListener("popstate",()=>te.onPopState(),{signal:q.signal}),window.addEventListener("beforeunload",()=>{y.dropDraft(),Wn(),Yn()},{signal:q.signal}),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{let o=f.compare;o===null||o.diff===null||Uo(o.diff.changes,o.activeIndex)},{signal:q.signal})}function Tu(e){return e.startsWith("/internal/")||/^\/history\/(internal|public)\//.test(e)?"internal":e.startsWith("/public/")?"public":null}function Lu(){let e=document.querySelector('script[src^="/comments-widget.js"][data-page]'),t=e===null?null:e.getAttribute("data-page");return t!==null&&t.length>0?t:null}function Wd(e){let t=f.viewer!==null&&f.viewer.kind==="member";(e==="identified"?t:f.visibility==="internal"&&!f.personal||Kl())&&(Pn=Wl()??Pn),Gd(),Xi(),f.viewer!==null&&Ji()}function Ji(){Pn?.showSelf(f.viewer,()=>{Au()})}async function Au(){let e=await is();if(q.disposed)return;if(!e.ok){Vt(e);return}let t=a("form");t.method="post",t.action="/api/auth/signout";for(let[n,o]of[["csrfToken",e.value],["callbackUrl","/signin"]]){let i=a("input");i.type="hidden",i.name=n,i.value=o,t.appendChild(i)}t.hidden=!0,document.body.appendChild(t),t.submit()}function Xi(){Pn?.showFavorite(f.favorite,()=>{Mu()})}var Vi=!1;async function Mu(){if(Vi||f.favorite===null)return;Vi=!0;let e=!f.favorite,t=await ts(f.slug,e);if(Vi=!1,!q.disposed){if(!t.ok){Vt(t);return}f.favorite=e,Xi()}}var Pn=null,eo=null;function Gd(){let e=Pn,t=f.currentVersion;if(e!==null){if(t===null||!f.features.history||te.loadedVersion!==null){eo=null,e.showVersion(null,()=>{});return}eo!==t&&(eo=t,rs(f.slug).then(n=>{if(!(q.disposed||eo!==t)){if(!n.ok||n.value===null||n.value.sha!==t){eo=null;return}e.showVersion(n.value,()=>{te.openHistory()}),Qe()}}))}}function Rd(){let e=window.location.pathname,t=Tu(e);if(t===null||document.querySelector(Ke)!==null)return;let n=Lu();if(!(n===null||decodeURIComponent(e.replace(/^\/(?:internal|public|history\/(?:internal|public))\//,"")).replace(/\/+$/,"").length===0)){if(f.personal=document.querySelector('script[src^="/comments-widget.js"][data-edition="personal"]')!==null,f.visibility=t,f.slug=n,te.loadedVersion=te.asSha(te.urlParams().get("v")),ia(document),Ul(),Ds(()=>{ye!==null&&Qe()}),ed({editable:()=>Me!==null&&f.features.edit&&te.loadedVersion===null&&!jn(),openEditable:i=>Gi(i)}),dd({comments:()=>f.comments}),bd(),Ld(),Wd("at-once"),qi=Td({onDialogChange:Ru}),t==="internal"){Id(),mr().then(Pd);return}wn(f.slug).then(i=>{if(!q.disposed&&i.ok){if(!i.value.features.tools){f.viewer=i.value.viewer,Ui();return}Id(),Vd(i.value),Pd()}})}}function Ru(e){e&&(y.setOpen(!1),y.hideMarkPeek(),y.hideSelectionBar()),Me?.host instanceof HTMLElement&&(Me.host.style.visibility=e?"hidden":"")}function Pd(){if(Ui(),f.features.edit&&od(),Wd("identified"),te.urlParams().get("edit")==="1"&&f.features.edit&&te.loadedVersion===null){let t=new URL(window.location.href);t.searchParams.delete("edit"),window.history.replaceState(null,"",t.href),Gi()}let e=te.urlParams().get("deck-panel");if(e==="history"||e==="sharing"){let t=new URL(window.location.href);t.searchParams.delete("deck-panel"),window.history.replaceState(null,"",t.href),e==="history"&&f.features.history?te.openHistory():e==="sharing"&&ce.canManageAccess()&&ce.openAccess()}zd(),te.syncFromUrl()}function Id(){let e=Number(vn(Od));Number.isFinite(e)&&e>0&&(f.width=y.clampWidth(e)),y.sheetOpenPending=!0;let t=document.createElement(Ke);Ua(navigator.userAgent,navigator.platform,navigator.maxTouchPoints)&&t.classList.add("is-ios"),Me=t.attachShadow({mode:"open"});let n=a("style");if(n.textContent=tr,Me.appendChild(n),ye=a("div","bar"),te.compareBar=a("div","compare"),te.compareBar.hidden=!0,ro=Eu(),y.popover=a("div","popover"),y.popover.hidden=!0,y.attachPeekGestures(y.popover),y.attachInnerScroll(y.popover,".peek-body, textarea"),y.selectionBar=a("div","selbar"),y.selectionBar.hidden=!0,y.composeDock=a("div","compose-dock"),y.composeDock.hidden=!0,y.attachDockSwipe(y.composeDock),y.attachInnerScroll(y.composeDock,"textarea"),y.composeDock.addEventListener("focusin",()=>y.trackComposeDock(),{signal:q.signal}),en=a("div","toast-stack"),ze.originHint=ze.buildOriginHint(),Me.appendChild(ye),Me.appendChild(ze.originHint),Me.appendChild(te.compareBar),Me.appendChild(ro),Me.appendChild(y.popover),Me.appendChild(y.selectionBar),Me.appendChild(y.composeDock),Me.appendChild(en),document.body.appendChild(t),document.body.hasAttribute("data-deck")){let d=Xl(()=>{ye!==null&&Qe()});q.signal.addEventListener("abort",d,{once:!0})}y.applyPush();let o=()=>{t.style.setProperty("--top-lane",`${Oe.above("compare")}px`),Yo(Oe.total())};o();let i=Oe.watch(o);q.signal.addEventListener("abort",i,{once:!0}),Qe(),Su()}window.addEventListener("pagehide",e=>{e.persisted||(q.dispose(),ce.dispose(),ze.dispose(),te.dispose(),z.dispose(),y.dispose())},{signal:q.signal});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Rd,{signal:q.signal}):Rd();
