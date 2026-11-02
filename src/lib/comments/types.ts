/**
 * サーバーとウィジェットが同じ形で読み書きするための型。
 * ここには実行時に重い処理を置かない（ブラウザ側のバンドルにもそのまま入るため）。
 */

import type { BetaFeatureId } from "../settings/beta-features";

/**
 * コメントの種類。
 *
 * `strikethrough`（取消線）は画面から取り下げた機能。新しくは作られない。
 * 並びに残してあるのは、保存先の列と制約をそのままにしてあるため
 * （戻すときに作り直さずに済む）。
 */
export const COMMENT_KINDS = ["comment", "strikethrough"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/**
 * 直してほしさの強さ。既定は want。
 *
 * `good`（いいね）は直してほしさではない。選んだ文への肯定で、本文は無くてよい。
 * 送信ボタンの 3 つ（must / better / want）とは並べず、手の絵の別口から送る。
 * 並びを足すときは `FIX_PRIORITIES` を先に直し、`COMMENT_PRIORITIES` はそれを広げる。
 */
export const FIX_PRIORITIES = ["must", "better", "want"] as const;
export type FixPriority = (typeof FIX_PRIORITIES)[number];

export const COMMENT_PRIORITIES = [...FIX_PRIORITIES, "good"] as const;
export type CommentPriority = (typeof COMMENT_PRIORITIES)[number];

export function isFixPriority(value: CommentPriority): value is FixPriority {
  return FIX_PRIORITIES.some((priority) => priority === value);
}

/**
 * ページの呼び名（`page_slug`）の頭に付く文字。**2 通りしかない**。
 *
 * これは「ページの見せ方」（src/lib/pages/content.ts の `Visibility`）**とは別の概念**。
 * 見せ方は 3 通り（社内限定 / 門なし公開 / 名簿に載った人だけ）あるが、
 * 名簿つきのページも呼び名は `internal/...` のままにしてある。
 * 制限を付け外しするたびに、呼び名・素材の置き場所・過去の版の凍結先を
 * 一斉に引っ越すことになるのを避けるため（db/migrations/0006_access.sql）。
 *
 * **だからここに 3 つ目を足してはいけない。** 足すと呼び名の形そのものが変わる。
 * 見せ方の 3 通りが要るときは src/lib/pages/content.ts の `Visibility` を使う。
 */
export const SLUG_VISIBILITIES = ["internal", "public"] as const;
export type SlugVisibility = (typeof SLUG_VISIBILITIES)[number];

/**
 * 旧名。src/widget/ がまだこちらの名前で受け取っている。
 *
 * 中身は `SlugVisibility` と同じもの。名前だけが「ページの見せ方」に読めてしまい、
 * 3 通りある本物の見せ方と取り違える元なので、触った人がそのとき置き換える。
 */
export type PageVisibility = SlugVisibility;

/**
 * 配信時に差し込む「過去の版です」の帯に付ける目印。
 *
 * ここに置いてあるのは、**差し込む側（src/lib/pages/content.ts）と、
 * それを数えない側（src/widget/comments/anchor.ts）の両方が同じ名前を見る**ため。
 * 名前が食い違うと、こちらが足した文字を本文として数えてしまい、
 * 印の位置がその文字数ぶんそっくりずれる。
 */
export const VERSION_BANNER_MARK = "data-surprise-version-banner";

/**
 * 組織の設定で仕掛け（スクリプト）を止めたページに、配信時に差し込む上端の 1 行の要素の名前（src/lib/html/script-notice.ts）。
 * 差し込む側と、保存される本文に焼き付いていないかを見る側（src/lib/html/check.ts）が同じ名前を見る。
 * 文字は Shadow DOM の中にあるので、本文の文字数（src/widget/comments/anchor.ts）には数えられない。
 */
export const SCRIPT_NOTICE_TAG = "sp-script-notice";

/**
 * 道具箱の札に付ける、要求の組織の名前とロゴの行き先。道具箱は保存先を引かないので、配信側
 * （src/lib/pages/content.ts の `withCommentsWidget`）が組織の設定から書く。名前は辞書の `{organization}` に差し込む
 * （「見本商事の資料」・src/widget/shared/i18n.ts）、ロゴは現在地の行の印の右に置く（src/widget/reading/location-bar.ts）。
 * 名前は宛先に既に出ているもので、ページの中身ではない。
 */
export const ORGANIZATION_NAME_ATTR = "data-organization-name";
export const ORGANIZATION_LOGO_ATTR = "data-organization-logo";

/**
 * 編集のプレビューの木にだけ付ける目印。
 *
 * 保存される正本に混ざってはいけないので、検査（src/lib/html/check.ts）と
 * 画面（src/widget/editor/editor.ts）が同じ名前を見る。名前が食い違うと、片方だけが
 * 焼き付きを見落として保管庫へ混ざる。
 */
export const EDIT_PREVIEW_MARK = "data-surprise-edit";

/** 引用文を本文中から探し直すための手がかり（前後の文字）。 */
export type QuoteContext = {
  beforeText: string;
  afterText: string;
};

/**
 * 画面に出す「書いた人」。
 *
 * ここにメールアドレスは入れない。公開ページのコメントは誰でも読めるので、
 * 会社の人のアドレスを混ぜると、そのまま外に出てしまう。
 * 自分のコメントかどうかは、サーバーが判定した `mine` で分かる。
 */
export type CommentAuthor = {
  kind: "member" | "guest";
  name: string;
  image: string | null;
};

export type PageComment = {
  id: string;
  pageSlug: string;
  parentId: string | null;
  quote: string | null;
  quoteContext: QuoteContext | null;
  body: string;
  kind: CommentKind;
  priority: CommentPriority;
  author: CommentAuthor;
  /** いま見ている人が書いたものか。編集・削除を出してよいかの判断に使う。 */
  mine: boolean;
  /** 付いたときのページの版（git のコミット）。分からなければ null。 */
  pageVersion: string | null;
  resolvedAt: string | null;
  /** 解決にした人の表示名。識別子ではない。 */
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** GET /api/comments の戻り。viewer は「いま見ている人」。名乗っていなければ null。 */
export type CommentsResponse = {
  viewer: CommentAuthor | null;
  comments: PageComment[];
  /**
   * このページが、見ている本人のお気に入りか（現在地の行の星）。
   * 載らない（null）のは、道具箱を閉じた答え——星を出さない。
   * 付け外しは一覧の行と同じ口（`/api/workspace` の `action: "favorite"`）。
   */
  favorite: boolean | null;
  features: PageFeatures;
  /** いまのページの版。コメントが古い版に付いたかを見分けるのに使う。分からなければ null */
  currentVersion: string | null;
};

/**
 * コメントが付いたときの文と、そのあと直された文の関係。
 *
 * 画面に出す物語（当時 → コメント → いま）の材料。計算は src/lib/comments/outcome.ts。
 *
 * `same`    … いまでも同じ文が残っている（直されていない）
 * `changed` … 同じ箇所が別の文になっている
 * `gone`    … その文は、あとの版で無くなった
 * `unknown` … 当時の本文から引用が見つからない（古いデータなど）
 */
export const OUTCOME_STATES = ["same", "changed", "gone", "unknown"] as const;
export type OutcomeState = (typeof OUTCOME_STATES)[number];

export type CommentOutcome = {
  commentId: string;
  state: OutcomeState;
  /** 当時選ばれていた文（コメントに保存してある引用） */
  thenText: string;
  /** いまその箇所にある文。gone / unknown では null */
  nowText: string | null;
  /**
   * いま見えている状態になった最初の版を書いた人の表示名。
   * 直されたならその直し、無くなったならその削除。いまの版の書いた人ではない。
   * 分からなければ null。
   */
  changedBy: string | null;
  /** その版の時刻。分からなければ null */
  changedAt: string | null;
};

/** GET /api/comments/outcomes の戻り。 */
export type OutcomesResponse = {
  outcomes: CommentOutcome[];
};

/** 直された文を紹介するときの表示上限。保存する引用の範囲とは別に扱う。 */
export const OUTCOME_TEXT_MAX_LENGTH = 160;

export type CommentResponse = {
  comment: PageComment;
};

/**
 * PATCH /api/comments（まとめて解決 / 戻す）の戻り。
 *
 * 返すのは**本当に動いた件数**だけ。すでにその状態のものは触らないので、
 * 選んだ件数と一致しないことがある（片付いたものが混ざっていたとき）。
 * 動いたあとの中身は一覧を引き直して受け取る（ここに並べて 2 通りにしない）。
 */
export type BulkResolveResponse = {
  changed: number;
};

export type ErrorResponse = {
  error: string;
};

/** ページの版（git のコミット 1 つ）。書いた人は表示名だけ持つ。 */
export type PageVersion = {
  sha: string;
  shortSha: string;
  /** そのページの何版目か（1 から数える）。人に見せる版の呼び方はこれ。分からなければ null。 */
  number: number | null;
  authorName: string;
  committedAt: string;
  /** 機械語（feat: や末尾のチケット番号）を落とした一言。 */
  message: string;
  /** 1 つ前の版と比べて何か所変わったか。数えられなければ null。 */
  changeCount: number | null;
};

/**
 * available が false なら、履歴を引く鍵が置かれていない（機能ごと出さない）。
 *
 * more は「返した並びより前にも版がある」こと。これが無いと、一覧の最下段を
 * いつでも「これが最初の版です」と言ってしまい、上限に達したページで嘘になる。
 */
export type HistoryResponse = {
  available: boolean;
  versions: PageVersion[];
  more: boolean;
};

/**
 * 赤入れ 1 か所の居場所。
 *
 * DOM の場所も「本文の何文字目か」も覚えない。覚えるのは**文言と、その前後の文字**だけ。
 * サーバーの本文取り出しとブラウザの読み取りが 1 文字も違わないことを前提にすると、
 * どちらかを直した瞬間に印が全部静かにずれる。コメントの引用を探し直す仕組みと
 * 同じ方式にそろえてあるので、探す側の部品も 1 つで済む。
 */
export type RedlineAnchor = {
  /** 新しい版の本文にある文字列（最大 REDLINE_HEAD_MAX） */
  head: string;
  /** 範囲の終わり。null なら head の終わりが範囲の終わり */
  tail: string | null;
  /** head の直前の文字（同じ文言が複数あるときの決め手） */
  before: string;
  /** 範囲の直後の文字 */
  after: string;
};

export type RedlineChange = {
  /** 1 始まり。画面の「2 / 5」と一致する */
  index: number;
  /**
   * 何が起きたか。
   *
   * `title` はページの名前（`<title>`）が変わったこと。本文には出ないので
   * 印を置く先が無い（place は必ず "none"）。それでも数えるのは、
   * 名前だけ直した版を「変化なし」と出すと、何も変わっていないように読めるため。
   */
  kind: "add" | "del" | "title";
  /** 足された / 消された文章そのもの */
  text: string;
  /** 行まるごとか（del のとき段落として挿し戻す） */
  block: boolean;
  /** add=wrap / del=after（先頭なら before）/ 置く先が無いものは none */
  place: "wrap" | "after" | "before" | "none";
  anchor: RedlineAnchor;
};

export type RedlineDiff = {
  /** 細かな比較の上限を超え、変更していない部分も含む範囲で表示している。 */
  coarse?: boolean;
  changes: RedlineChange[];
  /** 文章がまったく変わっていない（体裁だけの版） */
  identical: boolean;
  addedCount: number;
  removedCount: number;
  images: { added: string[]; removed: string[] };
};

export type RedlineResponse = {
  diff: RedlineDiff;
};

/** 居場所の手がかりに使う文言の長さ。長すぎると別の更新で当たらなくなる。 */
export const REDLINE_HEAD_MAX = 60;
export const REDLINE_CONTEXT_MAX = 50;

/** このページで使える機能。鍵が置かれていない機能はボタンごと出さない。 */
export type PageFeatures = {
  /**
   * 道具箱そのものを出してよいか（コメントも履歴も、まとめてこの 1 本で決まる）。
   *
   * 偽になるのは、門なし公開のページを社外の人が開いたとき。あの画面に出すのは
   * 記事だけで、道具箱は影も見せない。可否の正本は src/lib/access/access.ts の `canUsePageTools`。
   * 偽のときはこの下の旗も全部偽になる（出しようがないため）。
   */
  tools: boolean;
  history: boolean;
  /** 共有範囲を触れるか。そのページを作った人と管理者だけ true */
  sharing: boolean;
  /**
   * ページの本文をブラウザから直せるか。
   *
   * 可否の正本は src/lib/access/access.ts の `canEditPage`（管理者・作った人・共同の作った人）。
   * ここが偽なら、直す入口はボタンごと出さない（押せないボタンを見せない）。
   */
  edit: boolean;
  /**
   * 道具箱からコメントを書けるか（投稿・返信・解決・直し・消す・まとめて解決）。
   *
   * 偽になるのは、道具箱を閉じた答え（`tools` が偽）のとき。
   */
  write: boolean;
  /**
   * その人が個人設定で入れているベータ機能（台帳は src/lib/settings/beta-features.ts）。
   *
   * 機能ごとに旗を足さず、この 1 本に名前で並べる。道具箱は `hasBetaFeature` で聞く。
   * 載っていない答え（道具箱を閉じた答え）は「何も入れていない」と同じ。
   */
  beta?: BetaFeatureId[];
};

/** 引用の保存上限。選択範囲を丸ごと残し、超過は切り捨てず投稿時に知らせる。 */
export const QUOTE_MAX_LENGTH = 100_000;
/** 同じ文言を見分ける前後の手がかり。引用の保存範囲とは別に短く保つ。 */
export const QUOTE_CONTEXT_MAX_LENGTH = 50;
export const BODY_MAX_LENGTH = 5000;
export const GUEST_NAME_MAX_LENGTH = 40;

/**
 * 投稿に添える一言の長さ。履歴の 1 行に収まるところで切る。
 *
 * 上限が無いと、改行の無い巨大な 1 行がそのまま履歴に並ぶ。
 * 本文（5MB）やトークンの覚え書き（40 文字）と同じで、切る長さはここだけに置く。
 */
export const PUBLISH_MESSAGE_MAX_LENGTH = 200;
