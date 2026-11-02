import {
  type CommentAuthor,
  type CommentKind,
  type CommentOutcome,
  type CommentPriority,
  type PageComment,
  type PageVersion,
  type PageVisibility,
  type QuoteContext,
  type RedlineDiff
} from "../../lib/comments/types";
import {
  type Anchor
} from "./anchor";
import {
  type AccessScope,
  type PageAccessView,
  type WidgetFeatures
} from "../shared/api";
import {
  type FilterKey,
  type SortKey
} from "./comment-list";

export type PanelView = "comments" | "changes" | "versions" | "access" | "origin";

export type Compare = {
  kind: "history" | "origin";
  from: PageVersion;
  to: PageVersion;
  /** null は読み込み中 */
  diff: RedlineDiff | null;
  /** 本文に置けた変更の番号 */
  placed: Set<number>;
  /** 1 始まり。0 はまだどこにも寄っていない */
  activeIndex: number;
};

export type Editor = {
  mode: "edit" | "reply";
  targetId: string;
  body: string;
  priority: CommentPriority;
};

export type Draft = {
  anchor: Anchor;
  kind: CommentKind;
  priority: CommentPriority;
  body: string;
  /** 下書き中の印。書いている間だけページに付いている */
  marks: HTMLElement[];
};

export type Submission = {
  pageSlug: string;
  quote: string | null;
  quoteContext: QuoteContext | null;
  body: string;
  kind: CommentKind;
  priority: CommentPriority;
  marks: HTMLElement[];
  toastId: string;
};

export type State = {
  personal: boolean;
  slug: string;
  /** 社内ページか、門なし公開のページか。道具箱を出す前に答えを待つかがここで変わる */
  visibility: PageVisibility;
  viewer: CommentAuthor | null;
  comments: PageComment[];
  anchored: Set<string>;
  /** 畳んである解決済みのうち、開いて見せているもの */
  expanded: Set<string>;
  /** いまのページの版。コメントが古い版に付いたかを見分けるのに使う */
  currentVersion: string | null;
  /** このページが本人のお気に入りか（現在地の行の星）。null なら星を出さない */
  favorite: boolean | null;
  /**
   * コメントが付いたときの文と、突き合わせた版のときの文。
   * 鍵はコメントの id。まだ取りに行っていない／取れなかったときは空。
   */
  outcomes: Map<string, CommentOutcome>;
  /** いま持っている物語が、どの版と突き合わせたものか */
  outcomesFor: string | null;
  /**
   * ブラウザから直した直後に出す帯。null なら出さない。
   * 直した箇所に付いていたコメントの id を持つ。
   */
  review: { fromVersion: string; commentIds: string[] } | null;
  filter: FilterKey;
  sort: SortKey;
  /**
   * まとめて選んでいる相手。**null なら選択モードでない。**
   *
   * 「選択」という語は本文を選ぶ操作（選択の帯・小窓）が先に使っているので、
   * こちらの言葉は「まとめて選ぶ」で通す。入った時点でいま見えている全件が
   * 入っているので、空の Set は「全部外した」を意味する（モードを抜けていない）。
   */
  picked: Set<string> | null;
  open: boolean;
  width: number;
  activeId: string | null;
  editor: Editor | null;
  confirmDeleteId: string | null;
  /** 鍵が置かれている機能だけボタンを出す */
  features: WidgetFeatures;
  view: PanelView;
  /** 履歴（版の一覧）。null はまだ取りに行っていない */
  versions: PageVersion[] | null;
  /** 一覧の下にまだ古い版があるか。最下段を「最初の版」と言い切ってよいかの判断に使う */
  moreVersions: boolean;
  /** 見比べている 2 版。null なら赤入れは出さない */
  compare: Compare | null;
  /** 共有範囲。null はまだ取りに行っていない */
  access: PageAccessView | null;
  /** 見せる人に足すアドレス（打ち込んでいる途中の文字） */
  accessEmail: string;
  /** 配布版で、いま招待したばかりの人。招待は相手に届かないので、送るリンクをその場で出す */
  accessInvited: string | null;
  /** 「社内の全員に戻す」の念押しを出しているか */
  /**
   * いま出している念押しの行き先（出していなければ null）。
   *
   * 念押しを付けるのは**見える人が増える向き**だけ。旗を向きごとに増やすと、
   * 2 つ立った状態が作れてしまう（板に念押しが 2 枚出る）。行き先 1 つで持つ。
   */
  accessScopeTo: AccessScope | null;
  /** 取り消しの念押しを出している許可の id */
  accessRevokeId: string | null;
  /** 承認の念押しを出している申し出の id */
  accessApproveId: string | null;
  busy: boolean;
  /**
   * 原本が default branch より古いか。null はまだ聞いていない／聞かない。
   * 聞くのは編集できる人の 1 往復だけ（コメント一覧のたびに GitHub は叩かない）。
   */
  origin:
  | {
    stale: true;
    path: string;
    headDate: string | null;
    checked: boolean;
    /** いま出ている本文が原本と違うか（deck だけ比べられる。比べられなければ null） */
    edited: boolean | null;
  }
  | { stale: false }
  | null;
  /**
   * 取り込みの実行。始まっている間はボタンを出さず、読み飛ばしてよい 1 行だけ残す。
   * 押せないボタンにしない。
   */
  originJob: {
    status: "running" | "done";
    agentId: string;
    url: string;
    startedVersion: string | null;
  } | null;
};

export type StoredEditReview = {
  pageSlug: string;
  fromVersion: string;
  at: number;
};

export type SendRow = {
  row: HTMLElement;
  setEnabled(on: boolean): void;
};

export type TextAreaKeys = {
  /** ⌘ + option + 1/2/3（Windows / Linux は Ctrl + Alt）。強さを指定して送る。 */
  onPriority?: (priority: CommentPriority) => void;
  /** 本文が空のときの ⌘C で写し取る文言。無ければ null。 */
  quoteWhenEmpty?: () => string | null;
};

export type StoredOriginJob = {
  slug: string;
  agentId: string;
  url: string;
  startedVersion: string | null;
};
