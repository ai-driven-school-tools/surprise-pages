import { FIX_PRIORITIES, type CommentPriority, type PageComment } from "../../lib/comments/types";
import { t } from "../shared/i18n";

/**
 * コメント一覧の絞り込みと並べ替え。
 *
 * 画面の組み立て（comments.ts）から分けてあるのは、並びの決まりを
 * 保管庫にも DOM にも繋がずに確かめられるようにするため。
 * 一覧に出す／出さない、上からどう並べるか、の答えはここ 1 か所。
 */

export const FILTER_KEYS = ["open", "changed", "resolved", "all"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const SORT_KEYS = ["document", "newest", "oldest", "priority"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * 絞り込みの選択肢。言葉は /activity の「書いたコメント」と同じ
 * （未解決 / 解決済）。同じものを 2 通りに呼ばない。
 *
 * 並びは既定から始めて、絞り込みの深い順に読める形にしてある。
 * 「本文が変わった」は未解決の中の一部なので、未解決のすぐ下に置く。
 */
export const FILTER_CHOICES: ReadonlyArray<readonly [FilterKey, string]> = [
  ["open", t("toolbox.list.filter.open")],
  ["changed", t("toolbox.list.filter.changed")],
  ["resolved", t("toolbox.list.filter.resolved")],
  ["all", t("toolbox.list.filter.all")],
];

export const SORT_CHOICES: ReadonlyArray<readonly [SortKey, string]> = [
  ["document", t("toolbox.list.sort.document")],
  ["newest", t("toolbox.list.sort.newest")],
  ["oldest", t("toolbox.list.sort.oldest")],
  ["priority", t("toolbox.list.sort.priority")],
];

/**
 * 既定は未解決。
 *
 * 片付いたものを既定で並べると、まだ手が要るものが下へ押し流される
 * （解決にした当人にとっては、閉じた瞬間から邪魔になる）。
 * 消すのではなく一覧から外し、外したことは末尾の 1 行で告げる（listTail）。
 */
export const DEFAULT_FILTER: FilterKey = "open";
export const DEFAULT_SORT: SortKey = "document";

export function filterLabel(key: FilterKey): string {
  const found = FILTER_CHOICES.find((choice) => choice[0] === key);
  return found === undefined ? key : found[1];
}

export function sortLabel(key: SortKey): string {
  const found = SORT_CHOICES.find((choice) => choice[0] === key);
  return found === undefined ? key : found[1];
}

/**
 * 一覧に出すか。
 *
 * 「本文が変わった」だけは、コメント 1 件を見ても答えが出ない
 * （引用の成り行きは版と版を突き合わせて計算するもの）。だから
 * **変わったものの目印を外から渡す**。省略できる引数にしないのは、
 * 渡し忘れたときに「0 件」として静かに通ってしまうため。
 */
export function matchesFilter(
  comment: Pick<PageComment, "id" | "resolvedAt">,
  filter: FilterKey,
  changed: ReadonlySet<string>,
): boolean {
  if (filter === "open") return comment.resolvedAt === null;
  if (filter === "resolved") return comment.resolvedAt !== null;
  // 片付いたものは手が要らないので、本文が動いていても入れない（未解決の一部）
  if (filter === "changed") return comment.resolvedAt === null && changed.has(comment.id);
  return true;
}

/**
 * その 1 件が主役になる絞り込み。
 *
 * リンクで開いたときと、書いて送った直後に使う。既定が未解決なので、
 * 解決済のコメントへのリンクを開いても既定の一覧には出てこない。
 * 「すべて」へ逃がさないのは、なぜ一覧が入れ替わったのかを頭の 1 行
 * （listSummary）に言わせるため。
 */
export function filterFor(comment: Pick<PageComment, "resolvedAt">): FilterKey {
  return comment.resolvedAt === null ? "open" : "resolved";
}

/**
 * 一覧での強さ。いいねは直してほしさの下に置く（無いと must より上に浮く）。
 */
export function priorityRank(priority: CommentPriority): number {
  if (priority === "good") return FIX_PRIORITIES.length;
  return FIX_PRIORITIES.indexOf(priority);
}

export function isListDefault(filter: FilterKey, sort: SortKey): boolean {
  return filter === DEFAULT_FILTER && sort === DEFAULT_SORT;
}

/**
 * 既定から外れているときだけ出す 1 行。
 *
 * 絞り込みと並べ替えの両方を変えていれば ` ・ ` で継ぐ
 * （行の 2 行目の継ぎ方と同じ）。どちらも既定なら空文字。
 */
export function listSummary(filter: FilterKey, sort: SortKey): string {
  const parts: string[] = [];
  if (filter !== DEFAULT_FILTER) parts.push(filterLabel(filter));
  if (sort !== DEFAULT_SORT) parts.push(sortLabel(sort));
  return parts.join(" ・ ");
}

/** 絞り込みごとの件数（親コメントだけ数えたもの）。 */
export type ListCounts = Record<FilterKey, number>;

/**
 * メニューに出す絞り込みの行。
 *
 * 「本文が変わった」は成り行きが届いてからしか数えられないので、
 * **数が分かっていて 1 件以上のときだけ**出す（分かる前に 0 と書かない）。
 * いま選んでいる行は 0 件でも消さない——足元が消えると戻る道が無くなる。
 */
export function filterRows(
  current: FilterKey,
  counts: ListCounts,
  changedKnown: boolean,
): ReadonlyArray<readonly [FilterKey, string]> {
  return FILTER_CHOICES.filter(([key]) => {
    if (key !== "changed") return true;
    if (key === current) return true;
    return changedKnown && counts.changed > 0;
  });
}

/**
 * 一覧の末尾に置く、いま外している側への扉。
 *
 * 既定で解決済を外すからこそ要る 1 行。**隠したことを黙って隠さない**ための告知で、
 * 件数と行き先をここだけで決める。0 件の側へは出さない（押せないボタンを置かない）。
 * 「すべて」では何も隠れていないので出さない。
 */
export type ListTail = { to: FilterKey; label: string };

export function listTail(filter: FilterKey, counts: ListCounts): ListTail | null {
  if (filter === "open") {
    if (counts.resolved === 0) return null;
    return { to: "resolved", label: t("toolbox.list.tail.seeResolved", { count: counts.resolved }) };
  }
  // 絞った先からは、いつでも既定（未解決）へ 1 歩で戻れるようにする
  if (filter === "resolved" || filter === "changed") {
    if (counts.open === 0) return null;
    return { to: "open", label: t("toolbox.list.tail.backToOpen", { count: counts.open }) };
  }
  return null;
}

/**
 * まとめて選んだものに対して、どちらへ動かすか。
 *
 * ボタンを 2 つ並べず、選んだ中身から 1 つに決める。未解決が 1 件でも
 * 混ざっていれば前へ（解決へ）進める。全部片付いているときだけ戻す向きになる。
 */
export type BulkAction = "resolve" | "reopen";

export function bulkAction(
  selected: readonly Pick<PageComment, "resolvedAt">[],
): BulkAction | null {
  if (selected.length === 0) return null;
  return selected.some((one) => one.resolvedAt === null) ? "resolve" : "reopen";
}

export function bulkLabel(action: BulkAction, count: number): string {
  return action === "resolve" ? t("toolbox.list.bulk.resolve", { count }) : t("toolbox.list.bulk.reopen", { count });
}

/**
 * 2 件の前後。既定は本文の縦位置。見つからないものは最後に回す。
 * 位置で決まらないときは強さ、それから書かれた順。
 */
export function compareComments(
  left: PageComment,
  right: PageComment,
  sort: SortKey,
  positions: ReadonlyMap<string, number>,
): number {
  if (sort === "newest") return right.createdAt.localeCompare(left.createdAt);
  if (sort === "oldest") return left.createdAt.localeCompare(right.createdAt);
  if (sort === "priority") {
    const weight = priorityRank(left.priority) - priorityRank(right.priority);
    if (weight !== 0) return weight;
    return left.createdAt.localeCompare(right.createdAt);
  }
  const gap =
    (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
    (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  if (gap !== 0) return gap;
  const weight = priorityRank(left.priority) - priorityRank(right.priority);
  if (weight !== 0) return weight;
  return left.createdAt.localeCompare(right.createdAt);
}

export function sortComments(
  comments: readonly PageComment[],
  sort: SortKey,
  positions: ReadonlyMap<string, number>,
): PageComment[] {
  return [...comments].sort((left, right) => compareComments(left, right, sort, positions));
}
