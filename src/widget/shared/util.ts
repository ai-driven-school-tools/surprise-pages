import type { FixPriority } from "../../lib/comments/types";
import { FIX_PRIORITIES } from "../../lib/comments/types";
import { intlLocale } from "../../lib/i18n/locales";
import { TIME_ZONE } from "../../lib/i18n/format";
import { t, widgetLocale } from "./i18n";
import { iconSvg } from "./markup";
import { ICON_SIZE } from "./tokens";

/** ウィジェットのあちこちで使う小さな道具。 */

/** 自分の入れ物のタグ名。ページ側の文字を数えるときは、この中を数えない。 */
export const HOST_TAG = "surprise-comments";
/** ページを書き出す口。道具箱とは別の入れ物。本文としては数えない。 */
export const EXPORT_TAG = "surprise-page-export";
export const MARK_ATTRIBUTE = "data-surprise-comment";

export type PriorityLook = {
  /** 画面に出す短い名前 */
  label: string;
  /** 選ぶときに読む説明 */
  description: string;
  /** 丸印に付ける印。色そのものは CSS 側（tokens.ts）が持つ */
  dotClass: string;
};

/**
 * 直してほしさの強さ。
 *
 * 色を使うのは 6px の丸だけで、文字は 3 段階とも同じ濃さにしてある。
 * 3 色のバッジにすると、一覧が信号機になって「どれが重いか」より先に色が目に入る。
 */
export const PRIORITY_LOOK: Record<FixPriority, PriorityLook> = {
  // 説明は読むときに引く（言語は描く前に決まるが、読み込みの順に寄りかからない）
  must: { label: "must", get description() { return t("toolbox.priority.must"); }, dotClass: "dot is-must" },
  better: { label: "better", get description() { return t("toolbox.priority.better"); }, dotClass: "dot is-better" },
  want: { label: "want", get description() { return t("toolbox.priority.want"); }, dotClass: "dot" },
};

/** 直してほしさの送信ボタンと近道の並び。いいねはここに入れない。 */
export const PRIORITY_ORDER: readonly FixPriority[] = FIX_PRIORITIES;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  // 利用者が書いた文字はここを通す。HTML として解釈されない。
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * アイコン。中身はこのファイルに直接書いた固定の文字列だけで、外から来た値は混ざらない。
 * 利用者が書いた文字を innerHTML に入れることは無い。
 * 絵は飾りなので、部品の一覧（読み上げや AI の操作が読むもの）からは隠す。名前は押す部品の側が持つ。
 */
export function icon(
  paths: readonly string[],
  size: number = ICON_SIZE.medium,
  strokeWidth: number = 2,
): HTMLSpanElement {
  const span = el("span", "icon");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = iconSvg(paths, size, strokeWidth);
  return span;
}

export const ICON_COMMENT = ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"];
export const ICON_CHECK = ["M20 6 9 17l-5-5"];
export const ICON_REOPEN = ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"];
export const ICON_EDIT = ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"];
export const ICON_TRASH = [
  "M3 6h18",
  "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2",
  "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
];
export const ICON_REPLY = ["M9 14 4 9l5-5", "M20 20v-7a4 4 0 0 0-4-4H4"];
/** 書き出し 2 つは行き先が違うので、絵柄も分ける（同じ絵柄を 2 つの意味に使わない）。 */
export const ICON_FILE_TEXT = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
  "M14 2v5h5",
  "M9 13h6",
  "M9 17h4",
];
/**
 * ページを書き出す口。コメント一覧の書き出し（ICON_FILE_TEXT）とは別の絵柄。
 * もともとページに置いてあった「PDF」のダウンロードの絵を、こちらが引き継ぐ。
 */
export const ICON_DOWNLOAD = ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"];
/**
 * 原本を取り込む。書き出しのダウンロード（ICON_DOWNLOAD）とは別の絵柄。
 * いま出ている清書を、リポジトリの最新から組み直す動きなので、回す矢印。
 */
export const ICON_ORIGIN = [
  "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
  "M21 3v5h-5",
  "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
  "M8 16H3v5",
];
export const ICON_BRACES = [
  "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1",
  "M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
];
export const ICON_CLOSE = ["M18 6 6 18", "M6 6l12 12"];
/** いいね。直してほしさの丸印とは別の絵柄にして、肯定と指摘を取り違えない。 */
export const ICON_THUMBS = [
  "M7 10v12",
  "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
];
/** 履歴は時計。再開の矢印（ICON_REOPEN）とは別の絵柄にして、意味の取り違えを防ぐ。 */
export const ICON_HISTORY = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"];
export const ICON_LINK = [
  "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7",
  "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
];
/** コメントの本文を写す。Lucide の copy（四角が 2 枚重なった形）。 */
export const ICON_COPY = [
  "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z",
  "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
];
/**
 * ページの URL をコピーするボタンの姿。
 *
 * 押したあとしばらくはチェックに差し替える。知らせは画面の上端に出るので、
 * 右下のボタンからは視線が届かない。絵柄は「できた」の印として既にある
 * ICON_CHECK を使う（別のチェックを発明しない）。
 *
 * 戻すまでの長さは知らせと同じ SUCCESS_LIFE_MS（toast.ts）。
 */
export function copyLinkLook(copied: boolean): { paths: readonly string[]; label: string } {
  if (copied) return { paths: ICON_CHECK, label: t("toolbox.common.copied") };
  return { paths: ICON_LINK, label: t("toolbox.common.copyLink") };
}

/**
 * コピーできたチェックの線の太さ。
 *
 * 色は隣と同じ currentColor のまま。チェックは斜め線なので、既定の太さ 2 だと
 * 16px で白に溶け、時計や人より薄い別の色に見える。色は触らず、線だけ太くする。
 */
export const COPY_CHECK_STROKE = 3;

/**
 * コピーボタン 1 つの絵柄と名前を、いまの状態に合わせる。
 *
 * 色は触らない。隣の道具と同じ薄さのまま、形だけ鎖とチェックで分ける。
 * バーも狭い画面の板の頭も、ここを通す（書き比べない）。
 */
export function paintCopyLinkButton(button: HTMLButtonElement, copied: boolean): void {
  const look = copyLinkLook(copied);
  button.title = look.label;
  button.setAttribute("aria-label", look.label);
  const strokeWidth = copied ? COPY_CHECK_STROKE : 2;
  const next = icon(look.paths, ICON_SIZE.medium, strokeWidth);
  const current = button.querySelector(".icon");
  if (current !== null) current.replaceWith(next);
  else button.insertBefore(next, button.firstChild);
}

/** Slack へ流す。商標の形は使わず、チャンネルを表す # で示す。 */
export const ICON_HASH = ["M4 9h16", "M4 15h16", "M10 3 8 21", "M16 3l-2 18"];
export const ICON_SEARCH = ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-4.3-4.3"];
/**
 * 一覧の絞り込みと並べ替え。線が上から短くなる漏斗。
 *
 * 絞り込みと並べ替えを 1 つの口にしているので、絵柄も 1 つ。
 * 漏斗と上下矢印を並べると、いつも使わない操作が頭の右に 2 つ増え、
 * 書き出し（Markdown / JSON）より先に目に入る。
 */
export const ICON_LIST_FILTER = ["M3 6h18", "M7 12h10", "M10 18h4"];
/**
 * まとめて選ぶ。行の並びの左に、済んだ印が 2 つ付いた形（Lucide の list-checks）。
 *
 * 隣の漏斗（絞り込み）と混ざらないように、線の本数ではなく**印の有無**で分ける。
 * 解決 1 件の `ICON_CHECK` を流用しないのは、あれが「この 1 件を閉じる」で、
 * こちらは「並んでいるものを選ぶ」——別の概念に同じ絵柄を当てない。
 */
export const ICON_LIST_CHECKS = [
  "m3 17 2 2 4-4",
  "m3 7 2 2 4-4",
  "M13 6h8",
  "M13 12h8",
  "M13 18h8",
];
/**
 * 鍵盤。「このボタンにはキーの近道がある」を指す。
 *
 * 「？」にしないのは、あれが指すのが「助けが要るなら押せ」という広い意味で、
 * 近道の話だと分からないため。鍵盤の絵はキーそのものを描いているので、
 * 中身を読む前から何の話かが決まる。
 */
export const ICON_KEYBOARD = [
  "M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z",
  "M6 9h.01",
  "M10 9h.01",
  "M14 9h.01",
  "M18 9h.01",
  "M6 13h.01",
  "M18 13h.01",
  "M10 13h4",
];
/**
 * 変更の間を行き来する矢印。
 *
 * 前の変更は本文の上、次の変更は下にある。上下の向きで示すほうが、
 * 「戻る / 進む」の左右より行き先が素直に分かる。
 * 既にある絵柄（戻る矢印・再開の矢印）を別の意味に流用しない。
 */
/** 戻る・進む。Lucide の chevron-left / chevron-right（ワークスペースの画面と同じ絵）。 */
export const ICON_CHEVRON_LEFT = ["m15 18-6-6 6-6"];
/** 星（お気に入り）。ワークスペースの一覧の行と同じ Lucide の star */
export const ICON_STAR = [
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
];
export const ICON_CHEVRON_RIGHT = ["m9 18 6-6-6-6"];
export const ICON_CHEVRON_UP = ["m18 15-6-6-6 6"];
export const ICON_CHEVRON_DOWN = ["m6 9 6 6 6-6"];
export const ICON_SEND = ["M22 2 11 13", "M22 2l-7 20-4-9-9-4 20-7z"];
/**
 * 共有範囲（このページを誰に見せるか）。人の絵柄で示す。
 *
 * Slack へ流すほう（ICON_HASH）とは別の絵柄にする。どちらも「共有」と呼ばれるが、
 * 片方は流し先、こちらは見てよい相手で、取り違えると押す先を間違える。
 */
export const ICON_USERS = [
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
  "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  "M22 21v-2a4 4 0 0 0-3-3.87",
  "M16 3.13a4 4 0 0 1 0 7.75",
];
/** 名簿に 1 件足す。取り消す側は既にある ICON_TRASH を使う。 */
export const ICON_PLUS = ["M12 5v14", "M5 12h14"];
/**
 * 共同の作った人にする（＝このページの共有も触れる人にする）。人と筆。
 *
 * 共有範囲そのものを表す ICON_USERS は使わない。あれは板の入口と
 * 「社内の全員に見せる」が使っていて、同じ板の中で 1 つの絵柄が 2 つの意味を持つ。
 * 筆だけの絵柄（ICON_EDIT）はコメントの書き直しなので、人と組にして分けてある。
 */
export const ICON_USER_PEN = [
  "M11.5 15H7a4 4 0 0 0-4 4v2",
  "M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  "M21.4 16.6a1 1 0 0 0-3-3l-4 4a2 2 0 0 0-.5.9l-.9 2.9a.5.5 0 0 0 .6.6l2.9-.9a2 2 0 0 0 .9-.5Z",
];
/**
 * 見るだけの人に戻す。目の絵柄。
 *
 * 再開の矢印（ICON_REOPEN）を流用しない。あれはコメントを開け直す動きで、
 * ここは「見るだけの人という状態にする」——形が同じでも意味が別のもの。
 */
export const ICON_EYE = [
  "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z",
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
];
/**
 * 読み上げ。スピーカーの絵柄（音が出ることを、押す前に言う）。
 * 再生の三角にしない——あれは動画や発表の「始める」で、声が出るとは読めない。
 */
export const ICON_VOLUME = ["M11 5 6 9H2v6h4l5 4V5z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14"];
/** プロンプター。画面の絵柄（本文を、撮影用の別の画面に映す）。 */
export const ICON_MONITOR = ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M8 21h8", "M12 17v4"];
/**
 * 文字起こし（録音から作ったページの欄）。Lucide の captions（字幕）。
 * マイクにしない——あれは「録る」の絵で、ワークスペースの「録音」の印が使っている。
 */
export const ICON_CAPTIONS = ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M7 15h4M15 15h2M7 11h2M13 11h4"];
/** 録音の再生と一時停止（再生バー）。Lucide の play / pause。録音の画面の再生バーと同じ絵。 */
export const ICON_PLAY = ["M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"];
/** Lucide の presentation。発表者画面を指す絵記号はこれだけ（編集画面の釦・保存済みの操作列の隣の釦も同じ形） */
export const ICON_PRESENTATION = ["M2 3h20", "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3", "m7 21 5-5 5 5"];
/** Lucide の layout-grid。スライドの一覧（保存済みの操作列の「一覧」と同じ形） */
export const ICON_LAYOUT_GRID = [
  "M3 3h7v7H3Z",
  "M14 3h7v7h-7Z",
  "M14 14h7v7h-7Z",
  "M3 14h7v7H3Z",
];
/** Lucide の notebook-text。発表者ノート（保存済みの操作列の「ノートを隠す」と同じ形） */
export const ICON_NOTEBOOK_TEXT = [
  "M2 6h4",
  "M2 10h4",
  "M2 14h4",
  "M2 18h4",
  "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  "M9.5 8h5",
  "M9.5 12H16",
  "M9.5 16H14",
];
export const ICON_PAUSE = [
  "M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  "M6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
];
/**
 * まだ名乗っていない人の顔（バーの右端の「自分」）。人型を丸で囲った絵柄。
 *
 * **隣の絵柄を流用できない。**
 *   - `ICON_USERS`（人が 2 人）は同じバーに並んでいる「共有範囲」のもの。
 *     人型だけの輪郭を足すと、16px では人が 1 人か 2 人かの差しか残らず、
 *     隣どうしで見分けが付かない（押す先を間違える）。
 *   - `ICON_USER_PEN`（人と筆）は「共同の作った人にする」という**動作**の絵柄。
 *     こちらは動作ではなく**いま誰として見ているかという状態**なので、意味が別。
 *
 * 丸で囲うと、形そのものが隣と変わるうえ、名乗っている人に出す頭文字の丸と
 * **同じ形・同じ 24px の枠**に収まる。名乗っても名乗らなくても丸の位置と大きさは動かず、
 * 変わるのは中身だけになる。輪郭に色は足さない（名乗っていないことは異常ではないので、
 * 注意の合図にしない）。
 */
export const ICON_CIRCLE_USER = [
  "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "M7 20.7V19a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1.7",
];
/**
 * 右下の道具箱の「その他」（Lucide の ellipsis）。ワークスペースの行のメニュー（`src/app/_components/icons.tsx` の `more`）と同じ絵。
 * 丸 3 つは道筋に直してある（この道具は道筋しか描かない）。半径 1 に線の太さ 2 で、元の絵と同じ 4px の点になる。
 */
export const ICON_MORE = [
  "M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  "M20 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  "M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
];
/**
 * 現在地の行の顔から開くメニュー（サイドバーを畳んだもの）の絵。サイドバーの項目（`src/app/_components/icons.tsx`）と
 * 同じ Lucide の絵（house / folder / building-2 / settings / log-out）を、同じ 1.5 の線で描く。
 * 同じ場所を別の絵で指さない。
 */
export const ICON_HOME = [
  "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
  "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
];
export const ICON_FOLDER = [
  "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
];
export const ICON_COMPANY = [
  "M10 12h4",
  "M10 8h4",
  "M14 21v-3a2 2 0 0 0-4 0v3",
  "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
  "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
];
export const ICON_SETTINGS = [
  "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
  "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
];
export const ICON_LOGOUT = ["m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"];

/**
 * 右の板の出し方と幅の決まり。
 *
 * 画面の大きさを引数で受け取る形にしてあるのは、この判断だけを取り出して
 * 確かめられるようにするため（本文が潰れる不具合は目で見つけにくい）。
 */
export const PANEL_MIN_WIDTH = 300;
export const PANEL_MAX_WIDTH = 640;
export const PANEL_DEFAULT_WIDTH = 380;

/** これより狭い画面では、本文を押しのけず上に重ねる。 */
export const NARROW_VIEWPORT = 640;

export function isNarrowViewport(viewport: number): boolean {
  return viewport < NARROW_VIEWPORT;
}

/**
 * 板の幅を、いまの画面に収まる範囲へ収める。
 * 本文側には最低でも板と同じだけの幅を残す（残り 100px で読ませない）。
 */
export function fitPanelWidth(width: number, viewport: number): number {
  const room = Math.max(PANEL_MIN_WIDTH, viewport - PANEL_MIN_WIDTH);
  const wanted = Number.isFinite(width) ? Math.round(width) : PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, room, Math.max(PANEL_MIN_WIDTH, wanted));
}

/**
 * 文章を選んだあと、どこに入り口を出すか。
 *
 * 狭い画面では選んだ場所の真上に小窓を出せない。そこは OS の
 * 「コピー / 調べる」のメニューが陣取っていて、確実に隠れるため。
 * 代わりに画面の下端へ寄せる。
 */
export type SelectionEntry = "none" | "popover" | "bar";

export function selectionEntry(viewport: number, hasSelection: boolean): SelectionEntry {
  if (!hasSelection) return "none";
  return isNarrowViewport(viewport) ? "bar" : "popover";
}

/**
 * 選んだ瞬間から書き始めてよいか（ボタンを 1 枚挟まずに、入力欄を出してよいか）。
 *
 * 入り口が選択のそばに出せる広さなら、入力装置を問わず書き始める。
 * 前は指で触る大きな画面（iPad など）にだけ「コメント・コピー・読み上げ」の小窓を
 * 1 枚挟んでいたが、コメントを書くたびに 1 手増えて使いにくかった。
 * コピーと「ここから読み上げ」は入力欄の引用の行にも並んでいるので、挟まなくても失わない。
 * 焦点は選んだあとに当てるので、指の画面では OS がキーボードを勝手には出さない
 * （入力欄を押したときに出る）。
 *
 * 狭い画面は今までどおり下端の帯。帯は場所を取らないので、焦点を奪うより穏やかに済む。
 */
export function instantCompose(entry: SelectionEntry): boolean {
  return entry === "popover";
}

/**
 * 選び終わったと見なすまでの待ち時間。
 * 指でつまみを動かす操作は途中で何度も選択が変わるので、長めに待つ。
 */
export const SETTLE_NARROW_MS = 400;
export const SETTLE_WIDE_MS = 10;

export function settleDelay(viewport: number): number {
  return isNarrowViewport(viewport) ? SETTLE_NARROW_MS : SETTLE_WIDE_MS;
}

/**
 * 下へ払う動きで閉じてよいか。
 *
 * 横に流したとき（読むために少し動かしただけ）に閉じてしまわないよう、
 * 縦の動きが横より大きいことも見る。
 */
export const SWIPE_CLOSE_DISTANCE = 48;

export function isDownwardSwipe(dx: number, dy: number): boolean {
  return dy >= SWIPE_CLOSE_DISTANCE && Math.abs(dy) > Math.abs(dx);
}

/**
 * 縦に払ったとき、何をしたいのか。
 *
 *   down … 下へ払った → 閉じる
 *   up   … 上へ払った → 一覧を開く
 *   none … 払いきっていない → 元の位置へ戻す
 *
 * 上下で同じ基準を使う。片方だけ敏感だと、手が覚えられない。
 */
export type VerticalIntent = "up" | "down" | "none";

export function verticalIntent(dx: number, dy: number): VerticalIntent {
  if (isDownwardSwipe(dx, dy)) return "down";
  if (isDownwardSwipe(dx, -dy)) return "up";
  return "none";
}

/**
 * iOS 系の端末か。
 *
 * 下端に帯を浮かせるのは iOS Safari の作りで、その高さは JavaScript からは測れない。
 * 測れないものは避けようがないので、**その環境のときだけ場所を空ける**。
 * ほかの環境で空けると、意味の無い隙間になるだけなので分けている。
 *
 * iPadOS 13 以降は自分を Mac と名乗るため、名前だけでは足りない。
 * 「Mac を名乗るのに指で触れる」なら iPad とみなす。
 */
export function isIosLike(ua: string, platform: string, touchPoints: number): boolean {
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return /Mac/.test(platform) && touchPoints > 1;
}

// ---------------------------------------------------------------------------
// キーボードの近道
// ---------------------------------------------------------------------------

/**
 * キーが押されたときの様子のうち、近道の判定に要るものだけ。
 *
 * 本物のキー操作を持ち込まずに確かめられるよう、素の形にしてある。
 */
export type KeyChord = {
  /** キーの「位置」。打ち込まれる文字ではない。 */
  code: string;
  /** 打ち込まれる文字。 */
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** 日本語などを変換している最中か。 */
  isComposing: boolean;
};

/**
 * Apple 系の配列か。
 *
 * **「主たる修飾キーが ⌘ か Ctrl か」の分かれ目は、ここ 1 か所だけ。**
 * 判定を散らすと、片方の環境でだけ効かない近道ができる。
 */
export function isApplePlatform(platform: string, ua: string): boolean {
  return /Mac|iP(hone|ad|od)/.test(platform) || /Mac|iP(hone|ad|od)/.test(ua);
}

/**
 * 主たる修飾キー（Apple 系は ⌘、それ以外は Ctrl）だけが押されているか。
 *
 * これが答えるのは「その環境で**コピーを意味する**のはどちらのキーか」。
 * 使うのはコピーの判定（isCopyChord）だけで、強さを指定して送る近道は通さない
 * ——あちらは Mac で ⌘ と Ctrl を**同時に**求めるので、ここの「片方だけ」と噛み合わない。
 */
function primaryHeld(chord: KeyChord, apple: boolean): boolean {
  return apple ? chord.metaKey && !chord.ctrlKey : chord.ctrlKey && !chord.metaKey;
}

/**
 * 押された文字が、どの強さに当たるか。**強さの頭文字**で決める。
 *
 *   m … must / b … better / w … want
 *
 * ## なぜ数字をやめたか
 *
 * 数字の並び（1 = must）は覚えるものが 1 つ増えるうえ、**数字が base の面に無い
 * キーボードがある**。自作の分割キーボードでは数字が別の面に置かれていることが多く、
 * その場合は面を切り替えるキーまで一緒に押さえることになって、事実上押せない。
 * 頭文字なら、どの配列でも文字の面にある。
 *
 * ## 対応表を持たない
 *
 * `PRIORITY_ORDER` の綴りから頭文字を取る。表を別に書くと、強さの呼び名を変えたときに
 * 近道だけ古い文字のまま取り残される（画面の案内も同じところから作る）。
 *
 * ## 見るのは打ち込まれた文字（`key`）で、キーの位置ではない
 *
 * 配列を入れ替えている人（Dvorak など）が M を押したとき、位置で見ると別の強さになる。
 * コピーの判定（isCopyChord）が同じ理由で同じ見方をしている。
 */
export function priorityFromKey(key: string): FixPriority | null {
  const letter = key.toLowerCase();
  if (letter.length !== 1) return null;
  return PRIORITY_ORDER.find((priority) => priority.startsWith(letter)) ?? null;
}

/** 画面の案内に出す文字（`M / B / W`）。近道の判定と同じ綴りから作る。 */
export function priorityLetters(): string {
  return PRIORITY_ORDER.map((priority) => priority[0].toUpperCase()).join(" / ");
}

/**
 * 強さを指定して送る近道。**頭文字**で選ぶ。
 *
 *   Mac              control + M / B / W
 *   Windows / Linux  Ctrl + Alt + M / B / W
 *
 * ## なぜ数字ではないか
 *
 * 数字はどの環境でもブラウザがタブの切り替えに取っていて、逃がすために修飾キーを
 * 重ねる必要があった。そのうえ**数字が base の面に無いキーボードがある**——
 * 自作の分割キーボードでは数字を別の面へ追い出す配列が普通で、面を切り替えるキーまで
 * 一緒に押さえることになり、事実上押せない。頭文字ならどの配列でも文字の面にある。
 *
 * ## Windows と Linux だけ Alt を足す理由
 *
 * あちらでは **Ctrl + W がタブを閉じる操作**で、しかもブラウザが先に受け取るので
 * ページ側から止められない——書きかけのコメントごと消える。Ctrl + B もブラウザに
 * 取られている（ブックマーク）。Alt を挟むと、どちらにも当たらなくなる。
 *
 * Mac は同じ役目に ⌘ を使っているので、control + 文字はまるごと空いている。
 * ここで数を揃えて Mac も 3 つにはしない——見えるのは自分の環境の 1 通りだけで、
 * 両方を覚える人はいない。
 *
 * ## 余計な修飾キーが混ざっていたら受けない
 *
 * 別の目的で押した組み合わせを拾って、意図しないコメントを送ってしまわないため。
 * とくに Mac の ⌘ + W は窓を閉じる操作なので、⌘ が混ざったものは必ず落とす。
 */
export function priorityShortcut(chord: KeyChord, apple: boolean): FixPriority | null {
  if (chord.isComposing) return null;
  if (chord.shiftKey) return null;
  // Ctrl はどちらの環境でも要る。⌘ はどちらでも「押していないこと」が条件
  if (!chord.ctrlKey || chord.metaKey) return null;
  // Alt が要るのは Windows / Linux だけ。Mac では押されていたら受けない
  if (chord.altKey !== !apple) return null;
  return priorityFromKey(chord.key);
}

/**
 * コピーの操作（⌘C / Ctrl+C）そのものか。
 *
 * こちらは `key` で見る。配列を入れ替えている人（Dvorak 等）でも、
 * OS が「コピー」として扱うのは C の文字が出るキーだから。
 */
export function isCopyChord(chord: KeyChord, apple: boolean): boolean {
  if (chord.isComposing) return false;
  if (chord.altKey || chord.shiftKey) return false;
  if (chord.key.toLowerCase() !== "c") return false;
  return primaryHeld(chord, apple);
}

/**
 * 指が縦と横のどちらに向かっているか。
 *
 * 動き始めのわずかな揺れで決めると、読もうとしただけで送られてしまう。
 * ある程度動いてから決め、**一度決めたらその操作の間は変えない**（呼ぶ側の役目）。
 */
export const AXIS_LOCK_DISTANCE = 8;

export type SwipeAxis = "undetermined" | "horizontal" | "vertical";

export function lockAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < AXIS_LOCK_DISTANCE) return "undetermined";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

/** これより速く払えば、距離が短くても送る（px/ミリ秒）。 */
export const FLICK_VELOCITY = 0.5;
/** ゆっくり動かしたときに送る目安。カードの幅に対する割合。 */
export const SWIPE_ADVANCE_RATIO = 1 / 3;

/**
 * 指を離したときに、どちらへ送るか。
 *
 *   -1 … 前のコメントへ（右へ払った）
 *    0 … 送らずに戻す
 *    1 … 次のコメントへ（左へ払った）
 *
 * 端で止めるかどうかは呼ぶ側が決める（ここは何件目かを知らない）。
 */
export function swipeTarget(dx: number, velocityPxMs: number, cardWidth: number): -1 | 0 | 1 {
  if (Math.abs(velocityPxMs) > FLICK_VELOCITY) return velocityPxMs > 0 ? -1 : 1;
  if (cardWidth > 0 && Math.abs(dx) > cardWidth * SWIPE_ADVANCE_RATIO) return dx > 0 ? -1 : 1;
  return 0;
}

/** 速く払ったときでも、これより短くはしない（ミリ秒）。 */
export const SWIPE_FAST_MS = 240;

/**
 * 指を離したあと、動かしきるまでの長さ。
 *
 * 決まった長さで動かすと、速く払っても遅く離しても同じ速さで滑るので、
 * 指の勢いが途中で断ち切られたように感じる。
 * 残りの距離を、いま出ていた速さで割れば「そのままの勢いで走り切る」長さになる。
 *
 *   長さ = 残りの距離 ÷ 払った速さ
 *
 * ただし短すぎると動きが見えないので下限で止め、
 * 上は既定の長さを超えない（ゆっくり離しても、だらだら続かない）。
 * 速さが取れないときは既定の長さをそのまま使う。
 */
export function swipeDuration(remaining: number, velocityPxMs: number, baseMs: number): number {
  const speed = Math.abs(velocityPxMs);
  if (speed <= 0) return baseMs;
  const natural = Math.abs(remaining) / speed;
  return Math.round(Math.min(baseMs, Math.max(SWIPE_FAST_MS, natural)));
}

/**
 * 端を越えて引っぱったぶんの手応え。
 *
 * そのまま付いてくると「まだ先がある」と勘違いさせる。
 * 指の動きより小さくしか動かないことで、ここが端だと手で分かる。
 */
export const RUBBER_BAND_RESISTANCE = 0.3;

export function rubberBand(overshoot: number): number {
  return overshoot * RUBBER_BAND_RESISTANCE;
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 保存できない設定のブラウザでも、機能そのものは動かす
  }
}

/**
 * このタブの中だけで持つ印（sessionStorage）。
 *
 * 端末に残るほう（readStored / writeStored）とは別物で、**タブを閉じれば消える**。
 * 「このタブでもう控えた」のような、次に開いたときには忘れていてほしいことを持つ。
 * 端末に残るほうへ書くと、閉じて開き直しても「見た」と数えられなくなる。
 */
export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 保存できない設定のブラウザでも、機能そのものは動かす
  }
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return t("toolbox.time.justNow");
  if (minutes < 60) return t("toolbox.time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("toolbox.time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("toolbox.time.daysAgo", { count: days });
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), { month: "numeric", day: "numeric" }).format(
    new Date(then),
  );
}

/**
 * 「8月7日」。狭い画面では「8/7」と詰める。
 *
 * 版どうしを見比べる帯は、年まで出すと行が埋まってしまう。
 * 何年も前の版と比べることは無いので、月と日で足りる。
 */
export function monthDay(iso: string, compact: boolean): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), {
    timeZone: TIME_ZONE,
    month: compact ? "numeric" : "long",
    day: "numeric",
  }).format(at);
}

/**
 * 「10月3日」。今年でなければ「2025年10月3日」。現在地の行の「いつ更新したか」に使う。
 * 去年の 10 月 3 日を年なしで出すと、つい最近直したように読めてしまう。
 */
export function updatedDay(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const yearOf = (date: Date): string =>
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric" }).format(date);
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), {
    timeZone: TIME_ZONE,
    ...(yearOf(at) === yearOf(now) ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  }).format(at);
}

/** 「8月9日 15:20」。版の一覧で、いつの版かを見分けるのに使う。 */
export function dayTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

export function fullTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(widgetLocale()), {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 顔の地色は 4 つだけ。名前から決まるので、同じ人は毎回同じ色になる。 */
const AVATAR_TINTS = 4;

function tintFor(name: string): number {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum = (sum + name.charCodeAt(i)) % 9973;
  return sum % AVATAR_TINTS;
}

/**
 * 名前の頭 1 文字だけの丸い顔を、その場で描く。
 *
 * 外の似顔絵サービスに取りに行かない。公開ページは社外の人も開くので、
 * 「誰がこのページを見たか」が第三者に伝わる作りにしない。
 */
export function initialAvatar(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "avatar");
  svg.setAttribute("aria-hidden", "true");

  const face = document.createElementNS(SVG_NS, "circle");
  face.setAttribute("cx", "12");
  face.setAttribute("cy", "12");
  face.setAttribute("r", "12");
  face.setAttribute("class", `avatar-face is-tint-${tintFor(name)}`);

  const initial = document.createElementNS(SVG_NS, "text");
  initial.setAttribute("x", "12");
  initial.setAttribute("y", "12");
  initial.setAttribute("text-anchor", "middle");
  initial.setAttribute("dominant-baseline", "central");
  initial.setAttribute("class", "avatar-initial");
  // 利用者が入れた名前はここを通す。図形の指定として解釈されることはない。
  initial.textContent = name.slice(0, 1).toUpperCase();

  svg.appendChild(face);
  svg.appendChild(initial);
  return svg;
}

/** 空白を 1 つに詰めて前後を落とす。引用の照合はすべてこの形でそろえる。 */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 中身をファイルとして保存させる。 */
export function download(fileName: string, mediaType: string, body: string): void {
  const blob = new Blob([body], { type: `${mediaType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
