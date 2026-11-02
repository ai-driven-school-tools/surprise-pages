import { VERSION_BANNER_MARK, type RedlineChange } from "../../lib/comments/types";
import { buildTextIndex, groupsFor, locateText, wrapRange, type TextIndex, type TextRange } from "./anchor";
import { REDLINE } from "../shared/tokens";
import { HOST_TAG } from "../shared/util";
import { t } from "../shared/i18n";

/**
 * ページ本体の上に赤入れを入れる。
 *
 * 紙に赤ペンで直しを入れた原稿と同じ形にする。新しい版をそのまま描き、
 * 足した文には下線、消した文は取り消し線で元の場所へ挿し戻す。
 * 2 枚を並べたり、板の中に本文の写しを作ったりはしない
 * （読む場所が 2 つに割れると、どちらを読んでいたか分からなくなる）。
 *
 * 触るのは文字ノードの中だけ。表の行や図の入れ物には手を出さないので、
 * 印を入れたせいで体裁が崩れることはない。場所が決められなければ印は諦め、
 * 変更の一覧にだけ残す（別の場所に付けるより、付かないほうがまし）。
 *
 * ページ側が自分で DOM を書き換えても追いかけない（見張りは置かない）。
 */

/** 赤入れの目印。何番目の変更かを持たせる。 */
export const REDLINE_ATTRIBUTE = "data-surprise-redline";
const REDLINE_SELECTOR = `[${REDLINE_ATTRIBUTE}]`;

/**
 * 段落として挿し戻すのを避ける入れ物。
 *
 * 表の骨組みや箇条書きの直下に要素を差し込むと、行や項目の並びが崩れる。
 * ここに当たったときは行内へ落とす（体裁を壊してまで段落にしない）。
 */
const BLOCK_UNSAFE = "tr,tbody,thead,tfoot,table,ul,ol,dl";

export type RedlineTheme = "light" | "dark";

/**
 * いまの明暗。
 *
 * ページ本体に直接書く見た目なので、影の中の CSS のように
 * `prefers-color-scheme` で自動では切り替わらない。こちらで読んで塗り分ける。
 * 既知の限界: ページが OS の設定と関わりなく自前で暗い地色を敷いている場合は、
 * 明るいほうの値が当たる（色は合わないが、線の形は残るので意味は読める）。
 */
export function redlineTheme(): RedlineTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 明るい / 暗いのどちらか一式。同じ顔ぶれの値を持つので、まとめて 1 つの型で扱う。 */
type RedlineColors = (typeof REDLINE)["light"] | (typeof REDLINE)["dark"];

function palette(): RedlineColors {
  return redlineTheme() === "dark" ? REDLINE.dark : REDLINE.light;
}

/**
 * 1 か所ぶんの見た目。**塗らない。線だけ。**
 *
 * 塗ってしまうと、コメントの引用（蛍光ペン）と見分けが付かなくなる。
 * いま見ている 1 件も、塗る代わりに線を太くして示す。
 * 太さを変えても行の高さは動かないので、飛んだ瞬間に文字がずれない。
 *
 * `background` と `padding` をわざわざ書いているのは消すため。
 * ページ側が `ins { background: … }` のように飾っていると、
 * 何も書かなければその塗りがそのまま出てしまう。
 */
function paint(node: HTMLElement, kind: "add" | "del", active: boolean): void {
  const colors = palette();
  const added = kind === "add";

  node.style.color = "inherit";
  node.style.background = "transparent";
  node.style.padding = REDLINE.padding;
  node.style.textDecorationLine = added ? "underline" : "line-through";
  node.style.textDecorationStyle = "solid";
  node.style.textDecorationThickness = active ? REDLINE.activeThickness : REDLINE.thickness;
  node.style.textDecorationColor = added ? colors.addLine : colors.delLine;
  if (added) node.style.textUnderlineOffset = REDLINE.offset;
}

/** その番号の印すべて。1 つの変更が複数の文字ノードにまたがると、印も分かれる。 */
export function changeElements(index: number): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const node of Array.from(document.querySelectorAll(REDLINE_SELECTOR))) {
    if (node instanceof HTMLElement && node.dataset.surpriseRedline === String(index)) {
      found.push(node);
    }
  }
  return found;
}

/** その 1 件を濃くする / 元の濃さに戻す。置く先が無いものは何もしない。 */
export function paintChange(change: RedlineChange, active: boolean): void {
  if (change.kind !== "add" && change.kind !== "del") return;
  for (const node of changeElements(change.index)) paint(node, change.kind, active);
}

/**
 * 置いてある印をまとめて塗り直す（いま見ている 1 件だけ濃く）。
 *
 * 数え直すのは 1 回だけにする。変更の数だけ本文を探し直すと、
 * 件数が多いページでスクロールのたびに引っかかる。
 */
export function repaintRedline(changes: readonly RedlineChange[], activeIndex: number): void {
  const kinds = new Map<string, "add" | "del">();
  for (const change of changes) {
    if (change.kind === "add" || change.kind === "del") kinds.set(String(change.index), change.kind);
  }

  for (const node of Array.from(document.querySelectorAll(REDLINE_SELECTOR))) {
    if (!(node instanceof HTMLElement)) continue;
    const key = node.dataset.surpriseRedline;
    const kind = key === undefined ? undefined : kinds.get(key);
    if (kind === undefined) continue;
    paint(node, kind, key === String(activeIndex));
  }
}

/** 飛び先が帯の下に隠れないよう、印のぶんだけ余白を持たせる。 */
export function setRedlineOffset(px: number): void {
  for (const node of Array.from(document.querySelectorAll(REDLINE_SELECTOR))) {
    if (node instanceof HTMLElement) node.style.scrollMarginTop = `${Math.round(px)}px`;
  }
}

/** その変更のところへ寄せる。置けていなければ false。 */
export function scrollToChange(index: number): boolean {
  const nodes = changeElements(index);
  if (nodes.length === 0) return false;
  nodes[0].scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/** 挿し戻す文。行内に落とすときは改行を詰める（前の段落に改行を持ち込まない）。 */
function removedText(change: RedlineChange): string {
  const raw = change.text.replace(/[^\S\n]+/g, " ").trim();
  return change.block ? raw : raw.replace(/\s+/g, " ");
}

/** 消した文を挿し戻す札を作る。 */
function buildDeletion(change: RedlineChange, asBlock: boolean): HTMLElement {
  const box = document.createElement("del");
  box.setAttribute(REDLINE_ATTRIBUTE, String(change.index));
  box.textContent = removedText(change);
  if (asBlock) {
    box.style.display = "block";
    box.style.whiteSpace = "pre-wrap";
  }
  paint(box, "del", false);
  return box;
}

/**
 * その文字ノードを抱えている、いちばん近いブロックの入れ物。
 *
 * 消した文が段落をまたいでいるのに行の中へ挿し戻すと、前の段落に長大な 1 行が
 * 押し込まれる。段落として戻せる場所が見つからないときは null を返し、
 * 呼ぶ側は行内へ落とす。
 */
function blockAncestor(start: Element | null): HTMLElement | null {
  let current = start;
  while (current !== null && current !== document.body) {
    if (current.closest(HOST_TAG) !== null) return null;
    const display = window.getComputedStyle(current).display;
    if (!display.startsWith("inline") && display !== "contents") {
      const holder = current.parentElement;
      if (holder !== null && holder.matches(BLOCK_UNSAFE)) return null;
      return current instanceof HTMLElement ? current : null;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * その文字ノードの、指した位置から先に、まだ文章が残っているか。
 *
 * 手がかりの終わりが見出しの末尾に来ると、そのまま差し込めば
 * **見出しの中**に消した文が入り、見出しを直したように見えてしまう。
 * 入れ物の終わりに来ていることが分かれば、入れ物の外へ出して隣に置ける。
 */
function textFollows(node: Text, cut: number, within: Element): boolean {
  if (node.data.slice(cut).trim().length > 0) return true;

  const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT);
  let passed = false;
  for (let found = walker.nextNode(); found !== null; found = walker.nextNode()) {
    if (found === node) {
      passed = true;
      continue;
    }
    if (!passed) continue;
    if (found instanceof Text && found.data.trim().length > 0) return true;
  }
  return false;
}

/** 範囲の直後（または直前）に札を差し込む。差し込めたら true。 */
function insertBeside(
  index: TextIndex,
  range: TextRange,
  change: RedlineChange,
  before: boolean,
): boolean {
  const groups = groupsFor(index, range.from, range.to);
  if (groups.length === 0) return false;

  if (before) {
    const group = groups[0];
    // 先頭の段落がまるごと消えたなら、段落として入れ物の前へ戻す
    if (change.block) {
      const block = blockAncestor(group.node.parentElement);
      if (block !== null && block.parentNode !== null) {
        block.parentNode.insertBefore(buildDeletion(change, true), block);
        return true;
      }
    }
    let node = group.node;
    if (group.start > 0) node = node.splitText(group.start);
    const holder = node.parentNode;
    if (holder === null) return false;
    holder.insertBefore(buildDeletion(change, false), node);
    return true;
  }

  const group = groups[groups.length - 1];
  const node = group.node;
  const holder = node.parentNode;
  if (holder === null) return false;

  const block = blockAncestor(node.parentElement);
  const cut = group.end + 1;
  // 手がかりが入れ物の終わりまで来ているなら、中に押し込まず隣へ置く
  const atBlockEnd = block !== null && !textFollows(node, cut, block);

  if (block !== null && block.parentNode !== null && (change.block || atBlockEnd)) {
    block.parentNode.insertBefore(buildDeletion(change, change.block), block.nextSibling);
    return true;
  }

  if (cut < node.data.length) node.splitText(cut);
  holder.insertBefore(buildDeletion(change, false), node.nextSibling);
  return true;
}

/** 足された文を、その場で包む。 */
function wrapAddition(index: TextIndex, range: TextRange, change: RedlineChange): boolean {
  const marks = wrapRange(index, range, () => {
    const box = document.createElement("ins");
    box.setAttribute(REDLINE_ATTRIBUTE, String(change.index));
    paint(box, "add", false);
    return box;
  });
  return marks.length > 0;
}

/**
 * 赤入れを本文に入れる。置けた変更の番号を返す。
 *
 * **後ろから順に**入れる。前から入れると、文字ノードが割れたぶんだけ
 * 後ろの位置がずれる。後ろから入れるかぎり、本文の並びは 1 回数えれば足りる。
 */
export function applyRedline(changes: readonly RedlineChange[]): Set<number> {
  clearRedline();
  const placed = new Set<number>();
  if (changes.length === 0) return placed;

  const index = buildTextIndex();

  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const change = changes[i];
    // 置く先が無いもの（ページの名前など）は、一覧にだけ残す
    if (change.place === "none") continue;

    const anchor = change.anchor;
    const found = locateText(index, anchor.head, anchor.tail, {
      beforeText: anchor.before,
      afterText: anchor.after,
    });
    if (found === null) continue;

    const done =
      change.place === "wrap"
        ? wrapAddition(index, found, change)
        : insertBeside(index, found, change, change.place === "before");
    if (done) placed.add(change.index);
  }

  return placed;
}

/**
 * この版で足された画像に枠を付ける。
 *
 * 見分けられるのは**置き場所（パス）の出入り**だけ。同じ場所のまま中身が
 * 差し替わったことは分からないので、そこは何も出さない
 * （出せない差を、出せるふりをしない）。
 *
 * 消えた画像は新しい版に居場所が無いので、ここでは扱わない（一覧にだけ残る）。
 */
const IMAGE_ATTRIBUTE = "data-surprise-redline-image";
const IMAGE_SELECTOR = `[${IMAGE_ATTRIBUTE}]`;
/** 枠を付けた相手の、元の見た目の控え。外すときにそのまま書き戻す。 */
const framed = new Map<HTMLElement, string>();

export function markAddedImages(paths: readonly string[]): number {
  const colors = palette();
  let count = 0;

  for (const path of paths) {
    for (const node of Array.from(document.querySelectorAll("img,video,source"))) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.getAttribute("src") !== path && node.getAttribute("poster") !== path) continue;
      // <source> は自分では何も映さない。枠を付けるのは抱えている側
      const target = node.tagName === "SOURCE" ? node.parentElement : node;
      if (target === null || framed.has(target)) continue;

      framed.set(target, target.getAttribute("style") ?? "");
      target.setAttribute(IMAGE_ATTRIBUTE, "");
      // 枠は輪郭で描く。角の丸みには触らない（ページ側が付けた丸みを上書きしないため）
      target.style.outline = `${REDLINE.thickness} solid ${colors.addLine}`;
      target.style.outlineOffset = REDLINE.offset;

      const label = document.createElement("span");
      label.setAttribute(IMAGE_ATTRIBUTE, "");
      label.textContent = t("toolbox.history.addedInVersion");
      label.style.display = "block";
      // 大きさはページの字を基準に決める（こちらで寸法を発明しない）
      label.style.fontSize = "smaller";
      label.style.marginTop = REDLINE.offset;
      label.style.color = colors.addLine;
      target.parentNode?.insertBefore(label, target.nextSibling);
      count += 1;
    }
  }
  return count;
}

/**
 * 変わった段落の左に出す、細い縦線。
 *
 * 紙の校正でいう「変更のあった行に引く縦線」（Word の変更された行と同じ作法）。
 * 本文そのものには一切触らないので、字の読みやすさも折り返しの幅も変わらない。
 *
 * **本文の要素に枠や余白を足す方式は採らない。** 幅を決め打ちしている箱、
 * 箇条書きの点、表の骨組みと当たって、ページの体裁を壊す。絶対配置のために
 * 親へ position を足す方式も、ページ側の指定と喧嘩する。
 * そこで、ページ本体と同じ座標に置いた**専用の 1 枚**へ、測った位置ぶんだけ線を並べる。
 * その層は本文と同じ流れの中にあるので、スクロールには何もしなくても付いてくる。
 *
 * ページの作りがあとから変わっても追いかけない（見張りは置かない）。
 * 画面の大きさが変わったときだけ測り直す。
 */
const BAR_LAYER_MARK = "data-surprise-redline-bars";

function removeChangeBars(): void {
  for (const node of Array.from(document.querySelectorAll(`[${BAR_LAYER_MARK}]`))) {
    node.remove();
  }
}

/** その印を抱えている「1 つの段落」。取れなければ null（無理に出さない）。 */
function blockForBar(node: HTMLElement): HTMLElement | null {
  // 段落として挿し戻した札は、それ自体が 1 つの段落
  if (window.getComputedStyle(node).display === "block") {
    const holder = node.parentElement;
    if (holder !== null && holder.matches(BLOCK_UNSAFE)) return null;
    return node;
  }
  return blockAncestor(node.parentElement);
}

/** 変わった段落に縦線を引く。引けた本数を返す。 */
export function drawChangeBars(): number {
  removeChangeBars();

  const blocks = new Set<HTMLElement>();
  for (const node of Array.from(document.querySelectorAll(REDLINE_SELECTOR))) {
    if (!(node instanceof HTMLElement)) continue;
    const block = blockForBar(node);
    if (block !== null) blocks.add(block);
  }
  if (blocks.size === 0) return 0;

  const layer = document.createElement("div");
  layer.setAttribute(BAR_LAYER_MARK, "");
  layer.style.position = "absolute";
  layer.style.top = "0";
  layer.style.left = "0";
  layer.style.width = "0";
  layer.style.height = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "2147481000";
  document.body.appendChild(layer);

  // 層そのものの位置を原点にする。ページ側が body に position を足していても、
  // これなら座標の取り方が変わらない
  const origin = layer.getBoundingClientRect();
  const color = palette().barLine;
  const width = Number.parseFloat(REDLINE.barWidth);
  const gap = Number.parseFloat(REDLINE.barGap);
  let drawn = 0;

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (rect.height === 0) continue;
    const left = rect.left - origin.left - gap - width;
    // 本文が左端にぴったり付いていて、線を置く場所が無いときは出さない
    if (rect.left - gap - width < 0) continue;

    const bar = document.createElement("div");
    bar.setAttribute(BAR_LAYER_MARK, "");
    bar.style.position = "absolute";
    bar.style.top = `${Math.round(rect.top - origin.top)}px`;
    bar.style.left = `${Math.round(left)}px`;
    bar.style.width = REDLINE.barWidth;
    bar.style.height = `${Math.round(rect.height)}px`;
    bar.style.background = color;
    layer.appendChild(bar);
    drawn += 1;
  }

  return drawn;
}

/**
 * 配信側が差し込んだ「過去の版です」の帯を、比べている間だけ引っ込める。
 *
 * 読み込み直しをともなう入り方なら配信側が最初から出さないが、画面の中で
 * 比較を足す経路では読み込み直しが起きない。そのままだと「A → B」の帯と
 * 2 段になって、同じことを 2 回言うことになる。
 *
 * `hidden` 属性は使えない。あの帯は要素に直接 `display:flex` を書いており、
 * `[hidden]` の既定の指定（display:none）は inline の指定に負けるため、隠れない。
 * かといって空文字で戻すと `display:flex` ごと消え、**文と文の間隔が失われる**。
 * だから元の値を控えて、そのまま書き戻す。
 */
const VERSION_BANNER = `[${VERSION_BANNER_MARK}]`;
let bannerHidden: { element: HTMLElement; display: string } | null = null;

export function setVersionBannerHidden(hidden: boolean): void {
  if (hidden) {
    if (bannerHidden !== null) return;
    const found = document.querySelector(VERSION_BANNER);
    if (!(found instanceof HTMLElement)) return;
    bannerHidden = { element: found, display: found.style.display };
    found.style.display = "none";
    return;
  }

  if (bannerHidden === null) return;
  bannerHidden.element.style.display = bannerHidden.display;
  bannerHidden = null;
}

/** 赤入れをすべて外して、ページを元の形に戻す。 */
export function clearRedline(): void {
  removeChangeBars();
  for (const node of Array.from(document.querySelectorAll(REDLINE_SELECTOR))) {
    const parent = node.parentNode;
    if (parent === null) continue;
    if (node.tagName === "DEL") {
      // 挿し戻した文はページに元から無かったもの。中身ごと取り去る
      parent.removeChild(node);
    } else {
      while (node.firstChild !== null) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
    parent.normalize();
  }

  for (const node of Array.from(document.querySelectorAll(IMAGE_SELECTOR))) {
    if (!(node instanceof HTMLElement)) continue;
    const original = framed.get(node);
    if (original === undefined) {
      // 添えた札。ページに元から無かったので取り去る
      node.remove();
      continue;
    }
    if (original.length === 0) node.removeAttribute("style");
    else node.setAttribute("style", original);
    node.removeAttribute(IMAGE_ATTRIBUTE);
    framed.delete(node);
  }
}
