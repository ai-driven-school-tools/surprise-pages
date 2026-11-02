import { orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";
import { isMember, type Identity, type Member } from "../identity/identity";
import { memberRead } from "../identity/member-reads";
import { skipsRealStore } from "./local-preview";
import { toPageEntry, type StoredPage } from "./store";
import { VIEWED_LIMIT, type AccountViewedPage } from "../revisions/viewed-pages";
import { VIEW_OPTOUTS_TABLE, VIEW_RETENTION_DAYS, viewSweepCutoff } from "../revisions/view-records";

// 日数と掃除の境目の正本は src/lib/revisions/view-records.ts（リポジトリの文書の見た記録と同じ決まりを読むため）
export { VIEW_RETENTION_DAYS, viewSweepCutoff };

/**
 * 見たページの控えのうち、**アカウントに残るほう**の読み書き。
 *
 * 残すのは会社の人が見た分だけ（社内ページと、ログイン中に開いた公開ページ）。
 * 名乗っていない人がブラウザの中に残す分は src/lib/revisions/viewed-pages.ts が持っていて、
 * 画面（/activity）が最後に 1 本へ混ぜる。並べ方・畳み方・上限は**あちらが正本**で、
 * ここでは書き写さない（同じ決まりが 2 つあると、混ぜた瞬間に食い違いが出る）。
 *
 * ## 読む口が自分でページを引かない
 *
 * `listViewedPages` は「見てよいページの台帳の行」を**引数で受け取る**。自分で引ける形に
 * すると、見える範囲の絞り込みをこの中でもう一度書くことになり、片方を直してもう片方を
 * 忘れる余地が残る（あとから制限がかかったページの題が、この一覧にだけ出続ける、が典型）。
 * 見える行を確定させるのは src/lib/access/access.ts の `visiblePagesFor` ただ 1 つ。
 *
 * ## 消すのは物理削除で、消せるのは自分の行だけ
 *
 * 決まりでは「重要データは消した印を立てる」が、ここだけは本当に消す（0009 の但し書き）。
 * 閲覧の控えは本人のプライバシーの記録で、「消えました」と言いながら保管庫に残っているのは
 * 約束を破ることになる。取り戻せることより、消える確かさのほうが重い。
 *
 * 消す口はどれも**アドレスを名乗りから採る**（引数で受けない）。受ける形にすると、
 * 他人のアドレスを書いて叩けば、その人の控えを消せる口になる。
 */

const VIEWS_TABLE = "page_views";

/** 「記録を残さない」と言った人の表（0009_page_views.sql）。 */
const OPTOUTS_TABLE = VIEW_OPTOUTS_TABLE;

/** 記録を 1 回の往復で終わらせる、保管庫側の関数（組織を引数に取る版。古い版は 0009_page_views.sql）。 */
const RECORD_FUNCTION = "org_record_page_view";

/** データベースが返したエラーを、そのまま外に漏らさずに投げ直す。 */
function fail(action: string, error: { message: string } | null): never {
  throw new Error(`見たページの控えの${action}に失敗しました: ${error?.message ?? "原因不明"}`); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
}

/** 保存も照合も小文字で。表の側にも同じ制約があり、揃っていない値は insert で落ちる。 */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** 素の値（データベースの行）を、型を壊さずに 1 段だけ開く。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

/**
 * このページを見たことを控える。
 *
 * 受け取るのは**門を通ったページの行**。呼び名や内部の目印を直に受ける形にすると、
 * いま自分が見られないページの目印を当てた人が、一度も開かずに「見た」行を作れてしまう。
 *
 * 手元の仮の人はここで落とす。手元の `pnpm dev` は本番の保管庫を向いているので、
 * 落とさないと開発中にページを 1 枚開くたび、本物の行が本番へ積まれる。
 *
 * 積み増しと「残さない」設定の確認は保管庫側の 1 文にまとめてある（0009）。
 * 手前で確認してから書く形にすると、往復が 1 回増えるうえ、その隙間が残る。
 */
export async function recordPageView(viewer: Member, page: StoredPage): Promise<void> {
  if (skipsRealStore(viewer)) return;

  const { error } = await orgDb(page.organization).rpc(RECORD_FUNCTION, {
    p_page_id: page.id,
    p_email: normalize(viewer.email),
  });

  if (error !== null) fail("保存", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
}

/**
 * 本人の控えの行を全部読む（見たページの一覧と、ホームの「開いたら消える」の判定が同じ行を使う）。
 *
 * 本人の控えだけを引く（1 人 1 ページ 1 行・90 日で消えるので、その人が見た枚数ぶんしか無い）。
 * 見てよいページの目印を 100 件ずつ渡して引く形にすると、全社の資料の数だけ問い合わせが増える
 * （1 万件で 101 回）。権限の絞り込みは**呼ぶ側が渡された行に当てる**——見えないページの行は 1 行も出ない。
 *
 * 読む量の歯止めを日次の掃除だけに頼らない。掃除が消す行（保持の日数より古い）は、ここでも読まない。
 * 掃除が動いていれば、もともと残っていない行なので、画面に出る内容は変わらない。日数の正本は VIEW_RETENTION_DAYS
 */
async function readViewRows(organization: OrganizationScope, viewer: Member): Promise<unknown[]> {
  const kept = viewSweepCutoff();
  const data: unknown[] = [];
  let after: string | undefined;
  for (;;) {
    let query = orgDb(organization)
      .from(VIEWS_TABLE)
      .select("page_id, last_viewed_at, view_count")
      .eq("viewer_email", normalize(viewer.email))
      .gt("last_viewed_at", kept)
      .order("page_id", { ascending: true })
      .limit(1000);
    if (after !== undefined) query = query.gt("page_id", after);
    const result = await query;

    if (result.error !== null) fail("取得", result.error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
    const batch = asRows(result.data);
    data.push(...batch);
    const tail = toRecord(batch[batch.length - 1]);
    const next = tail === null ? null : readString(tail, "page_id");
    if (batch.length < 1000 || next === null || next === after) break;
    after = next;
  }
  return data;
}

/**
 * その人が各ページを最後に見た時刻（台帳の目印 → 時刻）。
 *
 * ホームが「そのページを開いたら知らせが消える」を決めるための材料。**見てよいかはここでは見ない**
 * ので、使う側は `visiblePagesFor` が返した行の目印でだけ引くこと（題を出すのは必ずその行から）。
 * 会社の人でなければ空（アカウントの控えというものが無い）。
 */
export async function pageViewTimes(organization: OrganizationScope, viewer: Identity | null): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  if (!isMember(viewer)) return times;
  for (const row of await readViewRows(organization, viewer)) {
    const record = toRecord(row);
    if (record === null) continue;
    const pageId = readString(record, "page_id");
    const lastViewedAt = readString(record, "last_viewed_at");
    if (pageId !== null && lastViewedAt !== null) times.set(pageId, lastViewedAt);
  }
  return times;
}

/**
 * その人の控えを、最後に見た順に。
 *
 * **並ぶのは `visible` に入っているページだけ。** 見た当時は開けたが、あとから制限が
 * かかって開けなくなったページは行ごと落ちる（題を出すこと自体が漏れになる）。
 * 絞り込みは呼び出し側が確定させて渡す——この形にしてあるので、ここで書き忘れようがない。
 *
 * 会社の人でなければ 1 行も返さない。アカウントに紐づく控えなので、名乗っていない人と
 * ゲストには、そもそも自分の分というものが無い。
 * 件数の上限は絞り込みのあとに掛ける（先に掛けると、見えない行のぶんだけ見える行が欠ける）。
 */
export async function listViewedPages(
  organization: OrganizationScope,
  viewer: Identity | null,
  visible: readonly StoredPage[],
): Promise<AccountViewedPage[]> {
  if (!isMember(viewer)) return [];
  if (visible.length === 0) return [];

  const known = new Map(visible.map((page) => [page.id, page]));
  const data = await readViewRows(organization, viewer);

  const rows: AccountViewedPage[] = [];
  for (const row of data) {
    const record = toRecord(row);
    if (record === null) continue;

    const pageId = readString(record, "page_id");
    const lastViewedAt = readString(record, "last_viewed_at");
    const page = pageId === null ? undefined : known.get(pageId);
    if (page === undefined || lastViewedAt === null) continue;

    // 行き先と題は台帳から採る（控えの側には持たない＝題を直せば一覧も追いつく）。
    // URL に使えない呼び名の行は、一覧と同じくここでも出さない
    const entry = toPageEntry(page);
    if (entry === null) continue;

    rows.push({
      href: entry.href,
      title: entry.title,
      lastViewedAt,
      viewCount: readCount(record, "view_count"),
      // 消すときに送り返す呼び名。行き先から組み直させない（画面に呼び名の決まりを持たせない）
      pageSlug: page.pageSlug,
    });
  }
  return rows
    .sort((a, b) => Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
    .slice(0, VIEWED_LIMIT);
}

/**
 * その人が「記録を残さない」と言っているか。
 *
 * 画面はこれを見て、入口を「残さない」と「残す」で出し分ける。ブラウザの中の設定と
 * 別々に持っているので、**どちらか一方でも立っていれば止まっている**扱いにする
 * （画面の側でそう混ぜる）。会社の人でなければアカウント側の設定というものが無い。
 */
export async function viewOptedOut(organization: OrganizationScope, viewer: Identity | null): Promise<boolean> {
  if (!isMember(viewer)) return false;
  // 画面を描く 1 回の中では、本人まわりの問い合わせとまとめて 1 本で読む（src/lib/identity/member-reads.ts）
  const bundled = await memberRead(organization, viewer.email, "view_optout");
  if (bundled !== undefined) return bundled;

  const { data, error } = await orgDb(organization)
    .from(OPTOUTS_TABLE)
    .select("viewer_email")
    .eq("viewer_email", normalize(viewer.email))
    .limit(1);

  if (error !== null) fail("「残さない」の取得", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
  return asRows(data).length > 0;
}

/**
 * 1 行だけ消す。**消した印は立てず、行そのものを消す。**
 *
 * 受け取るのは門を通ったページの行で、消えるのは自分の行だけ。アドレスは名乗りから
 * 採るので、他人の控えにはどう叩いても手が届かない。
 */
export async function forgetPageView(viewer: Member, page: StoredPage): Promise<void> {
  if (skipsRealStore(viewer)) return;

  const { error } = await orgDb(page.organization)
    .from(VIEWS_TABLE)
    .delete()
    .eq("page_id", page.id)
    .eq("viewer_email", normalize(viewer.email));

  if (error !== null) fail("削除", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
}

/**
 * その人の控えを全部消す。
 *
 * **見えているページのぶんだけ、には絞らない。** あとから制限がかかって一覧に出なくなった
 * ページの行も一緒に消える。「全部消す」と言って消し残すほうが、約束としては重い違反になる。
 */
export async function forgetAllPageViews(organization: OrganizationScope, viewer: Member): Promise<void> {
  if (skipsRealStore(viewer)) return;

  const { error } = await orgDb(organization)
    .from(VIEWS_TABLE)
    .delete()
    .eq("viewer_email", normalize(viewer.email));

  if (error !== null) fail("削除", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
}

/**
 * 「記録を残さない」を、アカウントの側でも入り切りする。
 *
 * オンにするときは**先に印を置いてから消す**。逆にすると、消し終えてから印が立つまでの
 * 隙間に、別のタブが開いたページの行が 1 つ積まれて残りうる。印さえ先に置けば、
 * その隙間に届いた分は保管庫側の 1 文（`record_page_view`）が最初から積まない。
 */
export async function setViewOptOut(organization: OrganizationScope, viewer: Member, off: boolean): Promise<void> {
  if (skipsRealStore(viewer)) return;

  const email = normalize(viewer.email);
  if (!off) {
    // 戻すときは印を外すだけ。消えた控えは戻らない（戻せるものではない）
    const { error } = await orgDb(organization).from(OPTOUTS_TABLE).delete().eq("viewer_email", email);
    if (error !== null) fail("「残さない」の取り消し", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
    return;
  }

  const { error } = await orgDb(organization)
    .from(OPTOUTS_TABLE)
    .upsert({ viewer_email: email }, { onConflict: "organization_id,viewer_email" });
  if (error !== null) fail("「残さない」の保存", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）

  await forgetAllPageViews(organization, viewer);
}

/**
 * 古い控えを物理削除する（日次の掃除が呼ぶ）。消した件数を返す。
 *
 * 消した印を立てる方式にしない。閲覧の控えは本人のプライバシーの記録で、
 * 「消えました」と言いながら保管庫に残っているのは、約束を破ることになる。
 * 境目（`viewSweepCutoff`）の正本は src/lib/revisions/view-records.ts。
 */
export async function sweepOldPageViews(organization: OrganizationScope, now: Date = new Date()): Promise<number> {
  const { data, error } = await orgDb(organization)
    .from(VIEWS_TABLE)
    .delete()
    .lt("last_viewed_at", viewSweepCutoff(now))
    .select("page_id");

  if (error !== null) fail("削除", error); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
  return asRows(data).length;
}
