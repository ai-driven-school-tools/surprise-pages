/**
 * 書き込みドックの位置と、画面の下端を誰が使うかの決まり。
 *
 * DOM を触らない計算だけを置いてある。指とキーボードが相手の挙動は
 * 画面を出して確かめにくいので、数として確かめられるところを分けておく。
 */

import { lockAxis } from "../shared/util";

/**
 * ページ側を動かし始めたら、キーボードを畳むか。
 *
 * キーボードが出ている位置を毎瞬正しく知る手立てが Web には無い。
 * 知らせは指の動きから遅れて届くので、スクロールしながら追いかけると
 * 構造として 1 コマぶん揺れ続ける（補正を強めても揺れの向きが変わるだけ）。
 *
 * そこで追いかけない。**動かし始めたらキーボードを畳む**（携帯の文字のやり取りと同じ作法）。
 * 畳めばドックは下端に貼り付いたまま静かに止まり、ページだけが動く。
 *
 * 畳むのは次の 3 つがそろったときだけ:
 *   - キーボードが出ている（＝ドックの中に焦点がある）
 *   - 動き始めがドックの外（入力欄やボタンを触っただけで消えては困る）
 *   - 縦に十分動いた（押しただけでは畳まない。向きの見分けは横送りと同じ 8px）
 */
export type ScrollDismiss = {
  keyboardVisible: boolean;
  startedInDock: boolean;
  dx: number;
  dy: number;
};

export function dismissesKeyboard(input: ScrollDismiss): boolean {
  if (!input.keyboardVisible || input.startedInDock) return false;
  return lockAxis(input.dx, input.dy) === "vertical";
}

/**
 * 下へ払って抜くとき、どれだけ下げれば画面から出きるか。
 *
 * ドックはキーボードのぶん持ち上がっている（`shift` は負）。
 * 高さぶん下げるだけでは、持ち上がっていた量が残って半分見えたままになる。
 * 持ち上げを打ち消してから高さぶん下げる、と考えると `height - shift`。
 */
export function exitDrop(height: number, shift: number): number {
  return height - shift;
}

/**
 * キーボード（と画面下の飾り）が覆っている高さ。
 *
 * ドックの位置は「上端を何 px に置くか」では決めない。上端で決めると、
 * その計算に **ドック自身の高さ** が要る。高さは打つたび・変換候補が出るたびに
 * 測り直しになり、測った瞬間と画面が確定する瞬間がずれると位置が崩れる。
 * 前の作りが「打ち始めるとずれる」のは、この測り直しが原因だった。
 *
 * そこでドックは画面の下端に貼り付けたままにし、
 * 「キーボードが覆っているぶんだけ持ち上げる」という**差分**で位置を決める。
 * こうすると高さが計算から消えるので、測る瞬間の問題ごと無くなる。
 *
 *   覆っている高さ = 画面全体の高さ − 見えている高さ − 見えている範囲のズレ
 */
export function keyboardInset(
  layoutHeight: number,
  visibleHeight: number,
  visibleOffsetTop: number,
): number {
  return Math.max(0, Math.round(layoutHeight - visibleHeight - visibleOffsetTop));
}

/**
 * 測った底を、どの物差しで読むか。
 *
 * ブラウザによって `getBoundingClientRect()` の 0 の位置が違う。
 * 紙全体（layout）を基準にするものと、見えている窓（visual）を基準にするものがある。
 * どちらか決め打ちすると、外したほうの端末で毎コマ逆向きに直し続けることになる。
 *
 * そこで **貼り付いているときの底が、どちらの高さに近いか** で見分ける。
 * 貼り付き先は「紙の底」なので、紙の高さに近ければ紙の物差し、
 * 窓の高さに近ければ窓の物差し、と分かる。
 */
export function visibleBottomFor(
  restingBottom: number,
  layoutHeight: number,
  visibleHeight: number,
  visibleOffsetTop: number,
): number {
  const asLayout = Math.abs(restingBottom - layoutHeight);
  const asVisual = Math.abs(restingBottom - visibleHeight);
  // 紙の物差しなら、窓の底は「ずれ + 窓の高さ」。窓の物差しなら窓の高さそのもの
  return asLayout <= asVisual ? visibleOffsetTop + visibleHeight : visibleHeight;
}

/**
 * 下端に貼り付けたドックの底が、画面のどこに来るか（確かめ用）。
 * 「見えている範囲の底」と必ず一致するはず。
 */
export function dockBottomAt(layoutHeight: number, inset: number): number {
  return layoutHeight - inset;
}

/**
 * 置いた結果を測って直すときの、次の持ち上げ量。
 *
 * 計算して置くだけ（開ループ）だと、知らせの取りこぼしや端末の癖でずれが残る。
 * 置いたあとの実際の底を測り、ずれていたぶんをそのまま足し引きすれば、
 * **原因が何であれ結果の側で吸収できる**。1 回の当て直しで差はゼロになる。
 *
 * `shift` は上へ持ち上げる量を負で表す（transform の向きに合わせる）。
 */
export function correctedShift(shift: number, dockBottom: number, visibleBottom: number): number {
  return shift - (dockBottom - visibleBottom);
}

/** 当て直しが要るほどずれているか。にじみ程度は無視する。 */
export function needsCorrection(dockBottom: number, visibleBottom: number): boolean {
  return Math.abs(dockBottom - visibleBottom) >= 0.5;
}

/**
 * 印が「見えている隙間」に収まっているか。
 *
 * 隙間は、見えている範囲の上端からドックの上端まで。
 * キーボードが出ると隙間が狭くなり、書こうとしている箇所が上へ消えることがある。
 * 収まっていれば何もしない（見えているのに画面を動かすと、読み手の目が迷う）。
 */
export function isWithinGap(
  markTop: number,
  markBottom: number,
  gapTop: number,
  gapBottom: number,
): boolean {
  return markTop >= gapTop && markBottom <= gapBottom;
}

/** 見えている範囲の底。 */
export function visibleBottomAt(visibleHeight: number, visibleOffsetTop: number): number {
  return visibleOffsetTop + visibleHeight;
}

/**
 * 画面の下端を使ってよいのは、いつでも 1 つだけ。
 *
 * 道具箱の「その他」（バーの右端の ⋯ から開く小窓）が最優先。**人がいま指で押した結果**なので、
 * ほかの何かに譲ると「押したのに出ない」ことになる。
 * 次が書きかけ、読むための覗き見と続き、
 * 「これから書くかもしれない」選択の帯がいちばん譲る。
 */
export type BottomSlot = "menu" | "dock" | "peek" | "selection" | "none";

export type BottomFlags = {
  /** 「その他」の小窓（バーの右端の ⋯ から開く） */
  menu: boolean;
  dock: boolean;
  peek: boolean;
  selection: boolean;
};

export function bottomOwner(open: BottomFlags): BottomSlot {
  if (open.menu) return "menu";
  if (open.dock) return "dock";
  if (open.peek) return "peek";
  if (open.selection) return "selection";
  return "none";
}

/**
 * 右下の道具箱を出してよいか。下端が誰かに使われていれば引っ込める。
 *
 * **持ち主が「その他」の小窓のときだけは出したまま**にする。あの小窓はバーの右端の ⋯ から
 * 生えていて、位置もそこから測る。引っ込めると、寄りかかっている土台ごと消えて
 * 小窓が宙に取り残される（⋯ を押した瞬間にバーが消える、という見え方になる）。
 *
 * 板が全面を覆っているときは、それより先に引っ込める（覆われた下に置いても押せない）。
 */
export function toolbarVisible(open: BottomFlags, sheetCovering: boolean): boolean {
  if (sheetCovering) return false;
  const owner = bottomOwner(open);
  return owner === "none" || owner === "menu";
}

/**
 * 共有範囲（このページを誰に見せるか）の項目を、道具箱に出してよいか。
 *
 * 立てるかどうかを決めるのはサーバーの返事 1 つだけ。持ち主かどうかを
 * ブラウザ側で数え直さない。数え直すと答えが 2 つになり、片方だけ直したときに
 * 「押しても何も起きないボタン」が出る側が取り残される。
 *
 * 門なしで配っている入口（`/public/…`）では、返事が立っていても出さない。
 * この板は**メールアドレスが字として出る唯一の場所**で、公開の入口の前には
 * 社外の人が座っている。アドレスを返す口そのものは会社の人にしか通らないが、
 * ここでも閉じておく（1 か所の取りこぼしで会社のアドレスが外に出る種類の話）。
 *
 * 社内として投稿したページを公開に切り替えると、`/internal/…` と `/public/…` の両方から
 * 開けるようになる。そのときも触るのは `/internal/…` の側から——公開をやめる操作も、
 * 名簿を触る操作も、社外の人が座っていない入口でだけ出す。
 * 呼び名は動かないので `/internal/…` は常に生きていて、操作の入口が失われることはない。
 */
export type SharingGate = {
  /** サーバーが「この人は共有範囲を触ってよい」と言ったか */
  allowed: boolean;
  /** 門なしで誰にでも配っているページか */
  openToAnyone: boolean;
};

export function sharingVisible(gate: SharingGate): boolean {
  return gate.allowed && !gate.openToAnyone;
}

/**
 * 書きかけを誰が持つか。
 *
 * 書くところがドックに移ったので、**書きかけを持っているのはドックだけ**。
 * 板（シート）の開け閉ては見え方の話でしかなく、書きかけには一切触らない。
 *
 * ここを間違えると、板が開いている状態でドックを開こうとしたときに
 * 「開く前に板を閉じる」処理が、いま作ったばかりの書きかけを道連れにしてしまう。
 */
export type ComposeFlow = {
  sheetOpen: boolean;
  dockOpen: boolean;
  hasDraft: boolean;
};

/** 板を開け閉てした。書きかけには触らない。 */
export function afterSheetToggle(flow: ComposeFlow, open: boolean): ComposeFlow {
  return { sheetOpen: open, dockOpen: flow.dockOpen, hasDraft: flow.hasDraft };
}

/** ドックを開く。板は引っ込めるが、書きかけはそのまま持ち越す。 */
export function afterOpenDock(flow: ComposeFlow): ComposeFlow {
  return { sheetOpen: false, dockOpen: true, hasDraft: flow.hasDraft };
}

/** ドックを閉じる。書きかけが終わるのはここだけ。 */
export function afterCloseDock(flow: ComposeFlow): ComposeFlow {
  return { sheetOpen: flow.sheetOpen, dockOpen: false, hasDraft: false };
}

/**
 * ページを開いたとき、板（コメントの一覧）をこちらから開いてよいか。
 *
 * コメントが付いているページは、読み手がまず気づくべきもの。右下の件数の印だけでは
 * 見落とされるので、**未解決のコメントが 1 件以上あれば最初から一覧を開いて見せる**。
 * 前に自分で閉じたかどうかは覚えない——覚えると、一度閉じた人がコメントの付いた
 * ページを二度と気づけなくなる（開閉の記憶は持たず、毎回いまの中身で決める）。
 *
 * 数えるのは**未解決だけ**。全部片付いたページは本文だけ見せればよく、
 * 済んだ話で本文を狭めない。
 *
 * 判断はコメントが届いてから。ページを出した瞬間に開くと、1 件も無いページでも
 * 空の板が本文を覆う。「まず開いてから 0 件なら閉じる」にもしない——開いた板が
 * 独りでに畳まれるのは足元が消えるのと同じで、読み手には事故に見える。
 *
 * 本文を覆う形（狭い画面）では開かない。あちらでは板が全幅で被さるので、
 * 読み始める前にまず閉じる操作を強いることになる（opensSheetAfterSend と同じ理由）。
 * 件数の印が代わりに知らせる。
 *
 * `pending` は「開いたあと、まだこちらから開け閉てを決めていない」こと。
 * 人が自分で開け閉てしたらそこで下ろす（人の指より決まりを優先しない）。
 * 1 度開いたら二度と触らないので、開いたあとに全部解決して 0 件になっても畳まない。
 */
export function opensSheetOnLoad(pending: boolean, openCount: number, covering: boolean): boolean {
  return pending && openCount > 0 && !covering;
}

/**
 * 送ったあと、閉じている板をこちらから開いてよいか。
 *
 * 開く狙いは「届いたことが分かる」ためだが、**板が本文を覆う形（狭い画面）では
 * それが仇になる**。文章を選んで 1 件書くたびに全幅の板が被さるので、次の文を
 * 選ぶには毎回それを閉じてから始めることになる。続けて書く人ほど手数が増える。
 *
 * 広い画面の板は横に並ぶだけで本文を隠さない。あちらは開いたままのほうが、
 * さっき書いたものとその前後の話が一緒に見えて都合がよい。
 *
 * だから覆う形のときだけ開かない。**知らせを 1 つも減らさないので成り立つ**——
 * 送った合図は画面上端の「投稿しました」が持ち、書いた場所は本文に残る印が示す。
 * 板はどちらの役も担っていない。
 *
 * 人が自分で開けていた板は、この決まりの外（閉じない・開き直さない）。
 * こちらから勝手に開けるかどうかだけを決める。
 */
export function opensSheetAfterSend(sheetCovering: boolean): boolean {
  return !sheetCovering;
}

/**
 * 一覧シートの高さ。
 *
 * 全画面にはしない。読んでいたページが見えなくなると、
 * 何について話しているのかが分からなくなるため、上に必ず帯を残す。
 */
export type SheetDetent = "closed" | "half" | "expanded";

export type DetentTops = {
  expanded: number;
  half: number;
  closed: number;
};

/**
 * それぞれの段の上端。
 * `expanded` でも画面の最上部までは上げず、安全域＋ひと呼吸ぶんだけ空ける。
 */
export function detentTops(viewportHeight: number, safeTop: number, gap: number): DetentTops {
  const half = Math.round(viewportHeight / 2);
  return {
    // 上げきりが半分より低くなることはない（知らせが積み上がっても逆転させない）
    expanded: Math.min(half, safeTop + gap),
    half,
    closed: viewportHeight,
  };
}

/**
 * 指を離した位置から、いちばん近い段を選ぶ。
 * 勢いは見ない（弾ませる作りにすると、狙った段に止まらない）。
 */
export function nearestDetent(top: number, tops: DetentTops): SheetDetent {
  const candidates: Array<[SheetDetent, number]> = [
    ["expanded", tops.expanded],
    ["half", tops.half],
    ["closed", tops.closed],
  ];

  let best: SheetDetent = "half";
  let bestGap = Number.POSITIVE_INFINITY;
  for (const [name, at] of candidates) {
    const gap = Math.abs(top - at);
    if (gap < bestGap) {
      bestGap = gap;
      best = name;
    }
  }
  return best;
}

/** つまみを押しただけのとき、次にどの段へ行くか。 */
export function toggledDetent(current: SheetDetent): SheetDetent {
  return current === "expanded" ? "half" : "expanded";
}
