/**
 * ページの本文を端末の声で読む。
 *
 * 声はブラウザに備わっているもの（Web Speech API）のうち、**端末の中で動く声だけ**を選ぶ
 * （src/lib/read-aloud/settings.ts の `pickVoice`）。外へは何も送らない。サーバーも呼ばない。
 * 端末の中の声が無ければ読まずに知らせる。声と速さは本人が個人設定で選び、このブラウザにだけ控える。
 *
 * **本文の DOM は触らない。** いま読んでいる文は CSS の Custom Highlight で示す
 * （要素も属性も足さないので、コメントの印・索引・書き出し・編集のどれにも混ざらない）。
 * その仕組みが無いブラウザでは、画面を送るだけにする。
 *
 * **どこから読むかは「読む位置」1 つで持ち、決める口はどれもそこを動かすだけ**（`readFrom` / `step`）:
 *
 * - 何も指さずに始めたら、いま見えている最初の文から（上端の帯に隠れた文は数えない）。
 *   止めて押し直せば、見ている場所から続きになる。
 * - 文字を選んで「ここから読み上げ」→ 選んだ文から（入口は道具箱の選択の小窓。ここは位置を受け取るだけ）。
 * - 読んでいる間に本文の文を押す → その文へ移る。マウスでは、押せる文を指したときだけ薄く示す。
 * - 読んでいる間の ← / → → 1 文戻る / 進む。
 *
 * 押す・キーを聞くのは**読んでいる間だけ**（止めたら外す）。読んでいないときの本文の操作は今までどおり。
 */
import { nextRate, parseRate, pickVoice, READ_ALOUD_RATE_KEY, READ_ALOUD_VOICE_KEY } from "../../lib/read-aloud/settings";
import { isReadAloudSilent, READ_ALOUD_BLOCKS, sentenceSpans } from "../../lib/read-aloud/text";
import { t } from "../shared/i18n";
import { MARK_ATTRIBUTE, readStored, writeStored } from "../shared/util";

const HIGHLIGHT_NAME = "surprise-read-aloud";
/** 読んでいる間、マウスで指した文（押せばそこへ移る）。 */
const TARGET_HIGHLIGHT_NAME = "surprise-read-aloud-target";
/**
 * 読んでいる間でも、押したときに本来の働きを優先するもの。リンク・操作の部品・コメントの印
 * （押すと覗き見が開く）・書き込める場所。
 */
const OWN_ACTION = `a[href],button,input,textarea,select,label,summary,video,audio,[contenteditable]:not([contenteditable='false']),[role='button'],[role='link'],[${MARK_ATTRIBUTE}]`;
/** ← / → を譲る相手（文字を打つ場所・矢印で動かす部品）。 */
const OWN_ARROWS = "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='menu'],[role='menuitem'],[role='listbox'],[role='option'],[role='slider'],[role='tablist'],[role='tab'],[role='radiogroup']";
/** 文の字の上にあるか、を測るときの縦の遊び（行と行のすき間を押しても、近い行の文とみなす）。 */
const HIT_SLACK = 4;
/** 声の一覧が届くのを待つ長さ。届かなければ「声が無い」と扱う。 */
const VOICES_WAIT_MS = 1500;

interface Piece { node: Text; start: number }
export interface Sentence { text: string; range: Range }

export interface ReadAloudOptions {
  /** 読んでよい本文の根。 */
  root: () => HTMLElement;
  /** 自前の部品（道具箱など）を声に出さないための見分け。 */
  ownChrome: string;
  /** 読み上げの状態が変わった（ボタンを描き直す）。 */
  onChange: () => void;
  /** 読めなかった理由を人に知らせる。 */
  onProblem: (text: string) => void;
  /** 画面の上端を覆っている帯の高さ（src/widget/reading/top-inset.ts）。その下に隠れた文は「見えている」に数えない。 */
  coveredTop?: () => number;
  /** 画面の下端で、まだ見えている高さの下の端（狭い画面で開いた一覧の板の上端など）。無ければ画面の下端。 */
  coveredBottom?: () => number;
}

/** このブラウザに端末の声の仕組みがあるか（無ければ入口を出さない）。 */
export function readAloudSupported(): boolean {
  return typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
}

/** 本文の文字を、同じかたまり（段落・項目）ごとに文へ分ける。順番は文書の順のまま。 */
export function collectSentences(root: HTMLElement, ownChrome: string): Sentence[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element && (isReadAloudSilent(node.localName, (name) => node.getAttribute(name)) || node.matches(ownChrome))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let owner: Element | null = null;
  const pieces: Piece[] = [];
  let text = "";
  const point = (offset: number): { node: Text; offset: number } | null => {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      if (piece && offset >= piece.start) return { node: piece.node, offset: Math.min(offset - piece.start, piece.node.length) };
    }
    return null;
  };
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Element && node.tagName === "BR") { text += "\n"; continue; }
    if (!(node instanceof Text) || node.data.trim().length === 0) continue;
    const parent = node.parentElement;
    if (parent === null) continue;
    // 畳まれた中・隠れた中は読まない（見えていないものを声だけで出さない）
    if (typeof parent.getClientRects === "function" && parent.getClientRects().length === 0) continue;
    const block = parent.closest(READ_ALOUD_BLOCKS) ?? root;
    if (block !== owner) { if (text.length > 0) text += "\n"; owner = block; }
    pieces.push({ node, start: text.length });
    text += node.data;
  }
  const sentences: Sentence[] = [];
  for (const span of sentenceSpans(text)) {
    const from = point(span.start);
    const to = point(span.end);
    if (!from || !to) continue;
    const range = doc.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    sentences.push({ text: text.slice(span.start, span.end).replace(/\s+/g, " "), range });
  }
  return sentences;
}

/**
 * 本文の中の位置（`node` の `offset`）を含む文、無ければその直後の文の番号。最後の文より後なら -1。
 * 文は文書の順に並んでいるので、半分ずつ絞って探す（長いページでも、指すたびに全部をなめない）。
 */
export function sentenceFrom(sentences: readonly Sentence[], node: Node, offset: number): number {
  let low = 0;
  let high = sentences.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    // その文が位置より前で終わっているなら、探すのはもっと後ろ
    if (comparePoint(sentences[middle]?.range, node, offset) > 0) low = middle + 1;
    else high = middle;
  }
  return low < sentences.length ? low : -1;
}

/** 位置が範囲の前なら -1、中なら 0、後なら 1。比べられない（本文から外れた）範囲は「前」として扱う。 */
function comparePoint(range: Range | undefined, node: Node, offset: number): number {
  if (range === undefined) return -1;
  try {
    return range.comparePoint(node, offset);
  } catch {
    return -1;
  }
}

/** 画面の座標にある文字の位置。測れないブラウザでは null。 */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position === null ? null : { node: position.offsetNode, offset: position.offset };
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    return range === null ? null : { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/** 文の字の上を指しているか（行の外れ・余白を押したのを、その文を押したと読まない）。 */
function covers(range: Range, x: number, y: number): boolean {
  for (const box of Array.from(range.getClientRects())) {
    if (x >= box.left && x <= box.right && y >= box.top - HIT_SLACK && y <= box.bottom + HIT_SLACK) return true;
  }
  return false;
}

/** 修飾キーを押しながらの操作（ブラウザ・OS の近道）は奪わない。 */
function modified(event: MouseEvent | KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

export class ReadAloud {
  private sentences: Sentence[] = [];
  /** 読んでいる間だけ聞く、本文の操作（押す・指す・矢印）。止めたら外す。 */
  private listening: AbortController | null = null;
  private hoverFrame = 0;
  private hovered = -1;
  private index = -1;
  /** 読み進める順番の番号。止める・移る・速さを変えるたびに進み、古い発話の「終わった」を先へ進ませない。 */
  private run = 0;
  private pausedState = false;
  private style: HTMLStyleElement | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  rate = parseRate(readStored(READ_ALOUD_RATE_KEY));

  constructor(private readonly options: ReadAloudOptions) {
    // 画面を離れても声だけ残るのを防ぐ
    window.addEventListener("pagehide", () => this.stop());
  }

  get supported(): boolean { return readAloudSupported(); }
  get active(): boolean { return this.index >= 0; }
  get paused(): boolean { return this.active && this.pausedState; }

  toggle(): void {
    if (this.active) this.stop();
    else void this.start();
  }

  /** いまの発話を止めずに一時停止する。 */
  pause(): void {
    if (!this.active || this.pausedState) return;
    this.pausedState = true;
    window.speechSynthesis.pause();
    this.options.onChange();
  }

  /** 止めたところから続ける。 */
  resume(): void {
    if (!this.paused) return;
    this.pausedState = false;
    window.speechSynthesis.resume();
    // 一時停止のあいだに文を移っていたら、移った先から読む
    if (this.utterance === null) this.speak(this.index, this.run);
    this.options.onChange();
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  /** 速さを 1 段送る。読んでいる最中なら、いまの文から新しい速さで読み直す。控えは個人設定と同じ場所。 */
  cycleRate(): void {
    this.rate = nextRate(this.rate);
    writeStored(READ_ALOUD_RATE_KEY, String(this.rate));
    if (this.active && !this.pausedState) this.restartCurrent();
    this.options.onChange();
  }

  stop(): void {
    if (!this.active) return;
    this.run++;
    const wasPaused = this.pausedState;
    this.pausedState = false;
    this.unlisten();
    this.index = -1;
    this.sentences = [];
    this.utterance = null;
    if (this.supported) {
      window.speechSynthesis.cancel();
      if (wasPaused) window.speechSynthesis.resume();
    }
    this.paint(null);
    this.options.onChange();
  }

  /**
   * 指した位置から読む。読んでいなければそこから読み始め、読んでいればそこへ移る。
   * 位置は本文の中の 1 点（選んだ文字の先頭など）。その点を含む文、無ければ直後の文から。
   */
  readFrom(point: Range): void {
    if (!this.active) { void this.start(point); return; }
    const at = sentenceFrom(this.sentences, point.startContainer, point.startOffset);
    if (at >= 0) this.seek(at);
  }

  /** 1 文進む（1）/ 戻る（-1）。端では止まる。 */
  step(direction: 1 | -1): void {
    if (!this.active) return;
    const at = this.index + direction;
    if (at < 0 || at >= this.sentences.length) return;
    this.seek(at);
  }

  private async start(from?: Range): Promise<void> {
    if (!this.supported) return;
    const run = ++this.run;
    this.pausedState = false;
    this.sentences = collectSentences(this.options.root(), this.options.ownChrome);
    if (this.sentences.length === 0) {
      this.options.onProblem(t("toolbox.readAloud.noText"));
      return;
    }
    const voice = pickVoice(await this.voices(), document.documentElement.lang || "ja", readStored(READ_ALOUD_VOICE_KEY));
    if (run !== this.run) return;
    if (voice === null) {
      this.sentences = [];
      this.options.onProblem(t("toolbox.readAloud.noVoice"));
      return;
    }
    this.voice = voice;
    // 声の一覧を待つ間に本文が動くことがあるので、位置は待ったあとで決める
    const pointed = from === undefined ? -1 : sentenceFrom(this.sentences, from.startContainer, from.startOffset);
    const first = pointed >= 0 ? pointed : this.firstVisible();
    this.listen();
    this.index = first;
    this.speak(first, run);
    this.options.onChange();
  }

  private async voices(): Promise<SpeechSynthesisVoice[]> {
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length > 0) return now;
    return new Promise((resolve) => {
      const done = (): void => { synth.removeEventListener("voiceschanged", done); resolve(synth.getVoices()); };
      synth.addEventListener("voiceschanged", done);
      window.setTimeout(done, VOICES_WAIT_MS);
    });
  }

  /** 見えている最初の文。上端の帯に隠れた文は数えない。全部が上へ流れているなら、最後まで読み終えた場所なので先頭から。 */
  private firstVisible(): number {
    const covered = this.options.coveredTop?.() ?? 0;
    const visible = this.sentences.findIndex((sentence) => sentence.range.getBoundingClientRect().bottom > covered);
    return visible < 0 ? 0 : visible;
  }

  /** 読んでいる最中に、別の文へ移る。いま鳴っている声は打ち切り、その文から同じ声で続ける。 */
  private seek(index: number): void {
    if (!this.active || index === this.index) return;
    this.index = index;
    this.paint(this.sentences[index]?.range ?? null);
    this.clearTarget();
    if (this.pausedState) {
      // 一時停止のまま移る。再開したら移った先から読む
      this.run++;
      this.utterance = null;
      window.speechSynthesis.cancel();
    } else {
      this.restartCurrent();
    }
    this.options.onChange();
  }

  /** いまの文を頭から読み直す（移った・速さを変えた）。 */
  private restartCurrent(): void {
    const run = ++this.run;
    this.utterance = null;
    window.speechSynthesis.cancel();
    this.speak(this.index, run);
  }

  private speak(index: number, run: number): void {
    if (run !== this.run || this.pausedState) return;
    const sentence = this.sentences[index];
    if (!sentence || !sentence.range.startContainer.isConnected) { this.stop(); return; }
    this.index = index;
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.voice = this.voice;
    utterance.lang = this.voice?.lang ?? "ja-JP";
    utterance.rate = this.rate;
    utterance.onend = () => {
      if (run !== this.run || this.utterance !== utterance) return;
      this.utterance = null;
      if (index + 1 >= this.sentences.length) { this.stop(); return; }
      this.speak(index + 1, run);
    };
    utterance.onerror = (event) => {
      // 止めた・移った・速さを変えた、で打ち切ったぶんは失敗ではない
      if (event.error === "canceled" || event.error === "interrupted") return;
      if (run !== this.run || this.utterance !== utterance) return;
      this.stop();
      this.options.onProblem(t("toolbox.readAloud.stopped"));
    };
    this.paint(sentence.range);
    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private listen(): void {
    this.unlisten();
    const listening = new AbortController();
    this.listening = listening;
    const options = { signal: listening.signal };
    document.addEventListener("click", (event) => this.onPress(event), options);
    document.addEventListener("keydown", (event) => this.onKey(event), options);
    document.addEventListener("pointermove", (event) => this.onPoint(event), options);
    document.addEventListener("pointerleave", () => this.clearTarget(), options);
    window.addEventListener("scroll", () => this.clearTarget(), { ...options, passive: true });
  }

  private unlisten(): void {
    this.listening?.abort();
    this.listening = null;
    if (this.hoverFrame !== 0) window.cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = 0;
    this.clearTarget();
  }

  /** 画面の座標にある文。本文の字の上でなければ -1。 */
  private sentenceUnder(x: number, y: number, target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    if (!this.options.root().contains(target) || target.closest(OWN_ACTION) !== null || target.closest(this.options.ownChrome) !== null) return -1;
    const caret = caretAt(x, y);
    if (caret === null) return -1;
    const at = sentenceFrom(this.sentences, caret.node, caret.offset);
    const sentence = this.sentences[at];
    return sentence !== undefined && covers(sentence.range, x, y) ? at : -1;
  }

  /** 読んでいる間に本文の文を押した → その文へ移る。文字を選んだ（なぞった）ときはコメントの領分なので触らない。 */
  private onPress(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || modified(event)) return;
    const selection = window.getSelection();
    if (selection !== null && !selection.isCollapsed) return;
    const at = this.sentenceUnder(event.clientX, event.clientY, event.target);
    if (at >= 0) this.seek(at);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || modified(event) || event.isComposing) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    // 影の中（道具箱）で打ったキーも、実際に押された部品で見分ける
    const origin = event.composedPath()[0];
    if (origin instanceof Element && origin.closest(OWN_ARROWS) !== null) return;
    event.preventDefault();
    this.step(event.key === "ArrowRight" ? 1 : -1);
  }

  /** マウスで指した文を薄く示す（押せばそこへ移る、の手がかり）。指で触る画面では出さない。 */
  private onPoint(event: PointerEvent): void {
    if (event.pointerType !== "mouse") return;
    const { clientX, clientY, target } = event;
    if (this.hoverFrame !== 0) return;
    this.hoverFrame = window.requestAnimationFrame(() => {
      this.hoverFrame = 0;
      if (!this.active) return;
      const at = this.sentenceUnder(clientX, clientY, target);
      this.showTarget(at === this.index ? -1 : at);
    });
  }

  private showTarget(index: number): void {
    if (index === this.hovered) return;
    this.hovered = index;
    const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
    const range = this.sentences[index]?.range;
    if (highlights === null || typeof Highlight === "undefined") return;
    if (range === undefined) highlights.delete(TARGET_HIGHLIGHT_NAME);
    else highlights.set(TARGET_HIGHLIGHT_NAME, new Highlight(range));
  }

  private clearTarget(): void {
    this.showTarget(-1);
  }

  /** いま読んでいる文を示し、画面の外にあれば見える場所へ送る。 */
  private paint(range: Range | null): void {
    const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
    if (range === null) {
      highlights?.delete(HIGHLIGHT_NAME);
      this.style?.remove();
      this.style = null;
      return;
    }
    if (highlights !== null && typeof Highlight !== "undefined") {
      if (this.style === null) {
        this.style = document.createElement("style");
        // 色は足さない。文字色を薄く敷くだけなので、明るい画面でも暗い画面でも同じ濃さで出る
        // 指した文（押せば移る先）は、その半分の濃さ。読んでいる文より目立たせない
        this.style.textContent =
          `::highlight(${HIGHLIGHT_NAME}) { background-color: color-mix(in srgb, currentColor 16%, transparent); }` +
          `::highlight(${TARGET_HIGHLIGHT_NAME}) { background-color: color-mix(in srgb, currentColor 8%, transparent); }`;
        document.head.append(this.style);
      }
      highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    }
    const box = range.getBoundingClientRect();
    if (box.height === 0) return;
    // 上端の帯の下に隠れているのも「見えていない」。下の板（狭い画面の一覧）の裏に隠れているのも同じ。
    // 見えている範囲の上から 1/3 の高さへ送る
    const covered = this.options.coveredTop?.() ?? 0;
    const bottom = Math.min(window.innerHeight, this.options.coveredBottom?.() ?? window.innerHeight);
    if (box.top < covered || box.bottom > bottom) {
      window.scrollBy({ top: box.top - covered - Math.max(0, bottom - covered) / 3, behavior: "smooth" });
    }
  }
}
