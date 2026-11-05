/**
 * 図（Mermaid）のページで、サーバーで描いておいた図を本文と一緒に配る差し込み（純粋な計算だけ）。
 *
 * 図の一式（src/templates/mermaid.html）は図の道具（通信量約 1MB・展開後 3.5MB）を head で同期に読むので、道具が届いて動くまで
 * 本文が 1 字も出ない（スマホでは 2 秒ほど）。道具を後ろへ回すだけでは、図が描かれた瞬間に `<pre class="mermaid">` の元の文が
 * SVG に入れ替わり、下の本文が押されて動く（画面のずれ）。
 *
 * だから配るときに:
 *   1. サーバーのブラウザで描いておいた図（明暗の 2 枚・src/lib/first-paint/diagram-render.ts）を `<pre>` の中に置き、OS の明暗で 1 枚だけ見せる
 *   2. 図の道具の script を、描画を止めない読み込み（`<script data-sp-first-paint="diagram">`）に付け替える。ページの実行部が
 *      呼ぶ `mermaid.initialize` / `mermaid.run` は、道具が届くまで預かって、届いたら同じ順で渡す
 *   3. 道具が届いたら、**見えない写し**（同じ幅の `<pre class="mermaid">`・元の文そのまま）をページの実行部に今までどおり描かせ、
 *      高さが同じなら同じ処理の中で差し替える。違えば画面の外へ出たときに差し替える（見えている本文は 1px も動かさない）
 * 端末の書体で描き直すので、出来上がりは今までと同じ（サーバーの絵は「最初の 1 枚」で、残らない）。
 *
 * **実行制限（src/lib/html/document-security.ts の documentPolicy）に合わせる。** 配布版は本文ごとに、許可表のスクリプトの
 * ハッシュだけを実行させる。だから差し込むスクリプトは**中身が版ごとに 1 通りの決まった文**（`diagramLoaderScript`）にして、
 * ページごとに違う材料（図の元の文）は実行されない JSON の入れ物（`type="application/json"`）で渡す。
 * documentPolicy はこの決まった文と字が一致するときだけハッシュを足す。
 *
 * **保存済みの HTML は変えない。** 差し込んだものには目印（`data-sp-first-paint`）を付け、保存される本文に焼き付いたら断る（src/lib/html/check.ts）。
 * **確かめられる形だけ通す**（`diagramPlan`）。ページの実行部が雛形の形でない・図の中に字と `<br>` 以外がある・描いた絵の数や元の文が
 * 合わない、のどれかなら今までどおり配る（遅いだけで、見た目は変わらない）。
 *
 * ここには外の世界に触る部品を置かない。描くのは src/lib/first-paint/diagram-render.ts、控えるのは src/lib/first-paint/diagram-prerender.ts。
 */

import { parse, type DefaultTreeAdapterMap } from "parse5";

import { FIRST_PAINT_MARK } from "./mark";
import { MERMAID_DONE_MARK, MERMAID_SOURCE_MARK } from "../html/mermaid-source";
import { vendorSrc } from "../html/vendor-scripts";
import { featureAvailable } from "../settings/features";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/**
 * 機能のスイッチ（docs/guides/feature-switches.md）。未設定・off・知らない値はすべて切（今までどおり配る）。
 * 本文の入口は、切れていれば控えと頼みの部品（src/lib/first-paint/diagram-prerender.ts）を読み込みもしない。
 */
export function diagramPrerenderOn(): boolean {
  return featureAvailable("diagram-prerender") && process.env.PAGES_DIAGRAM_PRERENDER === "on";
}

/** 差し込みの形を変えたら上げる。描いた絵の控えの鍵に入る。 */
export const DIAGRAM_STAMP = "dg1";

/** 差し込んだ図・道具の読み込み・見えない写しの目印の値（`data-sp-first-paint="diagram"`）。 */
export const FIRST_PAINT_DIAGRAM = "diagram";

/** 明暗のどちらの絵か（OS の明暗で 1 枚だけ見せる）。 */
export const DIAGRAM_SCHEME_ATTR = "data-sp-scheme";

/** 1 ページで扱う図の数・絵の大きさの上限。超えたら今までどおり配る。 */
export const DIAGRAM_MAX = 30;
export const DIAGRAM_SVG_MAX = 400_000;
export const DIAGRAM_TOTAL_MAX = 1_500_000;

/** 付け替える図の道具（vendor の付け替えのあとの形・src 以外の指定が無いものだけ）。 */
const VENDOR_MERMAID_TAG = /<script\b([^>]*?)\bsrc="(\/vendor\/mermaid\.js\/[0-9a-z]+)"([^>]*)><\/script>/gi;
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
const BODY_OPEN = /<body\b/i;
/**
 * スクリプトが図の道具に触れうるか。字面に `mermaid` があるだけでは数えない——ページを作るスキルの雛形の見た目の設定は、
 * コメントで「templates/mermaid.html」に触れる（これを数えると、雛形で作った図のページが全部対象外になる）。
 * 外すのはファイルの名前（手前が `/`・`-`、後ろが `.html`）の形だけで、`window.mermaid`・`pre.mermaid` などは触れるほうに数える（迷ったら通さない側）。
 */
const TOUCHES_MERMAID = /(?<![\w$/-])mermaid(?![\w$-]|\.html\b)/;

/**
 * ページの実行部が雛形（src/templates/mermaid.html）の形か。道具を預かって渡すには、呼ばれ方が分かっていないといけない:
 * 自分で走らせる（`startOnLoad: false`）・`DOMContentLoaded` で `mermaid.initialize` と `await mermaid.run()` を 1 度ずつ。
 */
function isTemplateRunner(code: string): boolean {
  return /\bstartOnLoad:\s*false\b/.test(code)
    && /"DOMContentLoaded"/.test(code)
    && (code.match(/\bmermaid\.initialize\(/g) ?? []).length === 1
    && (code.match(/\bawait mermaid\.run\(\)/g) ?? []).length === 1
    && (code.match(/\bmermaid\./g) ?? []).length === 2;
}

export type DiagramSource = {
  /** `<pre>` の開始タグの始まりと終了タグの終わり（配る直前の本文の中の位置）。 */
  start: number;
  end: number;
  /** 中身の HTML（図の道具が読むのはこれ・`<br>` を含みうる）。 */
  inner: string;
  /** 中身の字（`textContent` と同じ。元の文の控え `data-surprise-mermaid` に書く）。 */
  text: string;
};

export type DiagramPlan = {
  /** 付け替える script タグそのもの */
  tag: string;
  diagrams: DiagramSource[];
};

function classTokens(element: Element): string[] {
  return (element.attrs.find((one) => one.name === "class")?.value ?? "").split(/\s+/).filter(Boolean);
}

/**
 * 本文の図を拾う。図の道具が拾う目印（class の `mermaid`）を持つ要素は全部 `<pre class="mermaid">` で、
 * 属性は class だけ・中身は字と `<br>` だけ、のときだけ並べて返す。1 つでも外れたら null。
 */
function readDiagrams(html: string): DiagramSource[] | null {
  const found: DiagramSource[] = [];
  let broken = false;
  const visit = (node: Node): void => {
    if (broken) return;
    if ("tagName" in node && classTokens(node).includes("mermaid")) {
      const at = node.sourceCodeLocation;
      const plain = node.tagName === "pre"
        && node.attrs.length === 1 && node.attrs[0].value.trim() === "mermaid"
        && node.childNodes.every((child) => child.nodeName === "#text" || (child.nodeName === "br" && "childNodes" in child && child.childNodes.length === 0));
      if (!plain || at?.startTag === undefined || at.endTag === undefined) { broken = true; return; }
      const inner = html.slice(at.startTag.endOffset, at.endTag.startOffset);
      const text = node.childNodes.map((child) => ("value" in child && child.nodeName === "#text" ? child.value : "")).join("");
      found.push({ start: at.startOffset, end: at.endOffset, inner, text });
      return;
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
    if ("content" in node) visit(node.content);
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  return broken || found.length === 0 || found.length > DIAGRAM_MAX ? null : found;
}

/**
 * 描画済みの図を置いてよいページなら、その材料。だめなら null（今までどおり配る）。
 *
 * 通すのは次の全部が成り立つときだけ:
 *   - 自前で配る図の道具（版の付かない行き先から付け替えた、いまの版の行き先）が head の中にちょうど 1 つ・src 以外の指定が無い
 *   - 図の道具に触れるインラインのスクリプトがちょうど 1 つで、雛形の形（`isTemplateRunner`）。道具より後ろにある
 *   - 図はどれも `<pre class="mermaid">`（属性は class だけ・中身は字と `<br>` だけ）で、1〜DIAGRAM_MAX 個
 */
export function diagramPlan(html: string): DiagramPlan | null {
  const tags = [...html.matchAll(VENDOR_MERMAID_TAG)];
  if (tags.length !== 1) return null;
  const [tag, before, src, after] = tags[0];
  if (before.trim() !== "" || after.trim() !== "" || src !== vendorSrc("mermaid.js")) return null;
  const at = tags[0].index ?? 0;
  const body = BODY_OPEN.exec(html);
  if (body === null || at > body.index) return null;
  const runners = [...html.matchAll(INLINE_SCRIPT)].filter((found) => TOUCHES_MERMAID.test(found[1]));
  if (runners.length !== 1 || !isTemplateRunner(runners[0][1]) || (runners[0].index ?? 0) < at) return null;
  const diagrams = readDiagrams(html);
  if (diagrams === null || diagrams.some((one) => one.start < body.index)) return null;
  return { tag, diagrams };
}

/** サーバーで描いた絵（明暗の 2 枚ずつ・図の並びの順）。`sources` は描いたときの図の中身（`DiagramSource.inner`）。 */
export type DiagramRender = { sources: string[]; light: string[]; dark: string[] };

/**
 * 描いた絵の中の目印（`id="mermaid-<数>"` と、それを頭に持つ中の目印・style の `#…`・`url(#…)`）を、別の頭へ付け替える。
 * 端末で描き直す図（`mermaid-<時刻>`）や、同じページに置く明暗のもう 1 枚と同じ目印を持たないようにする。
 */
export function quarantineSvgIds(svg: string, id: string): string | null {
  const root = /^<svg\b[^>]*?\sid="(mermaid-\d+)"/.exec(svg)?.[1];
  if (root === undefined) return null;
  return svg.replaceAll(root, id);
}

/** 置いてよい絵か。実行制限が最後の守りだが、仕掛けになりうるものはここでも断る。 */
function usableSvg(svg: unknown): svg is string {
  return typeof svg === "string"
    && svg.length <= DIAGRAM_SVG_MAX
    && /^<svg\b/.test(svg) && /<\/svg>$/.test(svg)
    && !/<script\b|<\/pre\b|<\/?(?:body|html|head|iframe|object|embed|form|base|meta|link)\b/i.test(svg)
    && !/\son[a-z]+\s*=/i.test(svg)
    && !/javascript:/i.test(svg);
}

/** 描いた絵が、この本文の図にそのまま当てられるか（数・元の文・大きさ・形）。 */
export function renderFits(plan: DiagramPlan, render: DiagramRender): boolean {
  const n = plan.diagrams.length;
  if (render.sources.length !== n || render.light.length !== n || render.dark.length !== n) return false;
  if (plan.diagrams.some((one, i) => one.inner !== render.sources[i])) return false;
  if (![...render.light, ...render.dark].every(usableSvg)) return false;
  return render.light.reduce((sum, svg) => sum + svg.length, 0) + render.dark.reduce((sum, svg) => sum + svg.length, 0) <= DIAGRAM_TOTAL_MAX;
}

/** OS の明暗で 1 枚だけ見せる。判定はページの実行部（`matchMedia("(prefers-color-scheme: dark)")`）と同じ条件。 */
const SCHEME_STYLE =
  `@media (prefers-color-scheme: dark){pre[${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}"]>svg[${DIAGRAM_SCHEME_ATTR}="light"]{display:none!important}}` +
  `@media not all and (prefers-color-scheme: dark){pre[${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}"]>svg[${DIAGRAM_SCHEME_ATTR}="dark"]{display:none!important}}`;

let loader: string | null = null;

/**
 * 図の道具を描画を止めずに読み、届いたら見えない写しに描かせて差し替える小さなスクリプト。**中身は版ごとに 1 通り**
 * （図の道具の行き先だけを焼き込む）で、実行制限はこの字と一致するときだけハッシュを許す（src/lib/html/document-security.ts）。
 *
 *   - 写しの材料（図の元の文）は、直前の JSON の入れ物（`<script type="application/json" data-sp-first-paint="diagram">`）から読む
 *   - `window.mermaid` に預かり役を置く。ページの実行部が呼ぶ `initialize` と `run` は、道具が届いたら同じ順で本物に渡す
 *   - 写しは `DOMContentLoaded`（document で受けるので、window で受けるページの実行部より必ず先）に、見えている図と同じ幅で作る。
 *     ページの実行部は日程の左の列の幅と器の幅を `pre.mermaid` の元の文から測るので、写しが元の文を持っていないと測り違える
 *   - 写しは見えている `<pre>` の中の、大きさ 0・はみ出しを切る箱に入れる（場所を取らない・見えない・横棒も出さない）
 *   - 本物の最初の `run` のあと、ページの実行部の後始末（絵記号・札・目盛りの手当て）が済んでから差し替える
 *   - 高さが違う図は、画面の外へ出たときに差し替える。画面より上なら、スクロールの位置を保つ仕組みの無いブラウザ（Safari）では自分で戻す
 *   - 道具が届かない・材料が読めなければ、サーバーの絵のまま（写しは捨てる）
 */
export function diagramLoaderScript(): string {
  if (loader !== null) return loader;
  const mark = JSON.stringify(FIRST_PAINT_MARK);
  const value = JSON.stringify(FIRST_PAINT_DIAGRAM);
  loader = `(function(){var M=${mark},V=${value},S=null,q=[],w=[],dead=false,made=false,` +
    `stub={initialize:function(){q.push([0,arguments])},run:function(){var a=arguments;return new Promise(function(y,n){q.push([1,a,y,n])})}};` +
    `try{var j=document.querySelector('script[type="application/json"]['+M+'="'+V+'"]');S=j?JSON.parse(j.textContent||""):null;if(!Array.isArray(S))S=null}catch(e){S=null}` +
    `window.mermaid=stub;` +
    `function twins(){if(made||dead||S===null)return;made=true;var l=document.querySelectorAll("pre["+M+'="'+V+'"]');if(l.length!==S.length)return;` +
    `for(var i=0;i<l.length;i++){var p=l[i],b=document.createElement("div"),t=document.createElement("pre");` +
    `b.setAttribute(M,V);b.setAttribute("aria-hidden","true");b.style.cssText="position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";` +
    `t.className="mermaid";t.style.cssText="box-sizing:border-box;margin:0;width:"+p.getBoundingClientRect().width+"px";t.innerHTML=String(S[i]);` +
    `b.appendChild(t);p.appendChild(b);w.push({p:p,b:b,t:t})}}` +
    `function drop(){dead=true;for(var i=0;i<w.length;i++)w[i].b.remove();w=[]}` +
    `function swap(x,f){var o=x.p.querySelectorAll(":scope>svg");for(var i=0;i<o.length;i++)o[i].remove();x.p.insertBefore(f,x.b);x.b.remove();x.p.removeAttribute(M);x.p.dispatchEvent(new Event("scroll"))}` +
    `function later(x,f){if(typeof IntersectionObserver!=="function"){swap(x,f);return}` +
    `var io=new IntersectionObserver(function(e){if(e[e.length-1].isIntersecting)return;io.disconnect();var r=x.p.getBoundingClientRect(),h=r.height;swap(x,f);` +
    `if(r.bottom<=0&&!(window.CSS&&CSS.supports&&CSS.supports("overflow-anchor","auto"))){var d=x.p.getBoundingClientRect().height-h;if(d)window.scrollBy(0,d)}});io.observe(x.p)}` +
    `function settle(){var l=w;w=[];for(var i=0;i<l.length;i++){var x=l[i],f=x.t.querySelector("svg");` +
    `if(!f||!x.t.hasAttribute("data-processed")){x.b.remove();continue}` +
    `if(Math.abs(x.p.getBoundingClientRect().height-x.t.getBoundingClientRect().height)<0.5)swap(x,f);else later(x,f)}}` +
    `document.addEventListener("DOMContentLoaded",twins);` +
    `var s=document.createElement("script");s.src=${JSON.stringify(vendorSrc("mermaid.js"))};s.onerror=drop;` +
    `s.onload=function(){var m=window.mermaid;if(!m||m===stub||typeof m.run!=="function"){drop();return}` +
    `var run=m.run;m.run=function(){m.run=run;twins();var p=run.apply(m,arguments),d=function(){setTimeout(settle,0)};p.then(d,d);return p};` +
    `var l=q;q=[];for(var i=0;i<l.length;i++){var c=l[i];if(c[0]===0)m.initialize.apply(m,c[1]);else m.run.apply(m,c[1]).then(c[2],c[3])}};` +
    `document.head.appendChild(s)})()`;
  return loader;
}

function withScheme(svg: string, scheme: "light" | "dark"): string {
  return svg.replace(/^<svg\b/, `<svg ${DIAGRAM_SCHEME_ATTR}="${scheme}"`);
}

function attributeValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 描画済みの図を置き、図の道具を描画を止めない形で読む。当てられなければ本文をそのまま返す。
 * `plan` は同じ本文の `diagramPlan`、`render` はサーバーで描いた絵（src/lib/first-paint/diagram-render.ts）。
 */
export function withPrerenderedDiagrams(html: string, plan: DiagramPlan, render: DiagramRender): string {
  if (!renderFits(plan, render) || !html.includes(plan.tag)) return html;
  let out = html;
  for (let i = plan.diagrams.length - 1; i >= 0; i -= 1) {
    const one = plan.diagrams[i];
    const light = render.light[i];
    const dark = render.dark[i];
    const svgs = light === dark ? light : withScheme(light, "light") + withScheme(dark, "dark");
    const open = `<pre class="mermaid" ${MERMAID_DONE_MARK}="true" ${MERMAID_SOURCE_MARK}="${attributeValue(one.text.trim())}" ${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}">`;
    out = `${out.slice(0, one.start)}${open}${svgs}</pre>${out.slice(one.end)}`;
  }
  // 材料は実行されない入れ物で渡す（`<` を逃がして入れ物を閉じさせない）。実行するのは決まった文の 1 本だけ
  const sources = JSON.stringify(plan.diagrams.map((one) => one.inner)).replace(/</g, "\\u003c");
  const block = `<style ${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}">${SCHEME_STYLE}</style>` +
    `<script type="application/json" ${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}">${sources}</script>` +
    `<script ${FIRST_PAINT_MARK}="${FIRST_PAINT_DIAGRAM}">${diagramLoaderScript()}</script>`;
  return out.replace(plan.tag, () => block);
}
