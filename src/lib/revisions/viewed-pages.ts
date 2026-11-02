/**
 * 「見たページ」の控えの決まり。
 *
 * ブラウザの中に残す分（公開ページを、名乗らずに見たもの）の形・畳み方・並べ方を
 * 1 か所に置く。**書くのはウィジェット、読むのは /activity の画面**で、どちらも同じ鍵と
 * 同じ畳み方を通る。片方だけ直すと、書いたものが読めなくなる——しかもその食い違いは
 * 人が画面を開いたときにしか表に出ない。
 *
 * ここには実行時に重い処理を置かない（src/lib/comments/types.ts と同じ理由で、
 * ブラウザ側のバンドルにもそのまま入る）。窓（window）にも触らない。
 * **保存できるかどうかは呼ぶ側の事情**で、ここが決めるのは並べ方と畳み方だけ。
 */

/**
 * 見たページ 1 行。
 *
 * 訪問のたびに積まず、**1 ページ 1 行**にして「最後に見たのはいつか」「何回見たか」を持つ。
 * 同じページが時系列で何度も並ぶ一覧は、読み返す道具としては使えない。
 */
export type ViewedPage = {
  /** 押した先（/internal/… か /public/…）。ブラウザの中では、これが 1 行の目印そのもの */
  href: string;
  /** そのときページに出ていた題。あとから題が変わっても、控えは書き換わらない */
  title: string;
  /** 最後に見た時刻（ISO） */
  lastViewedAt: string;
  /** 何回見たか。1 回のときは画面に出さない */
  viewCount: number;
};

/**
 * アカウントに残っているほうの 1 行。
 *
 * ブラウザの中の行との違いは**ページの呼び名（`internal/…`）を連れていること**だけ。
 * 消す口はこれをそのまま送り返し、受けた側は本文を読むのとまったく同じ門を通す。
 * 行き先（`/internal/…`）から呼び名を組み直す形にすると、URL の頭と呼び名の頭を
 * 突き合わせる決まりが画面の側にもう 1 つ生まれる。
 */
export type AccountViewedPage = ViewedPage & {
  /** ページの呼び名（`internal/…` / `public/…`）。消すときに送り返す */
  pageSlug: string;
};

/**
 * 画面に並べる 1 行。
 *
 * 出どころ（ブラウザの中か、アカウントか）は**行ごとに 1 つの旗**で持つ。
 * 2 つの配列を画面で持ち回ると、並べ替えたとたんにどちらの行か分からなくなる。
 */
export type ViewedRow = ViewedPage & {
  /** ブラウザの中にしか無い行か。画面では 2 行目に「このブラウザにだけ」と添える */
  localOnly: boolean;
  /** アカウントにも残っている行なら、その呼び名。ブラウザの中だけの行は null */
  pageSlug: string | null;
};

/**
 * ブラウザの中に残す上限。
 *
 * 際限なく貯めない。読み返すのは新しいほうから数十行で、それより古い行は
 * 「消えたら困るもの」ではない（消えて困るものは、そもそもここではなく本人が
 * ブックマークしている）。あふれたら最後に見たのが古い行から落とす。
 */
export const VIEWED_LIMIT = 200;

/** ブラウザの中の控えを置く鍵（localStorage）。 */
export const VIEWED_STORAGE_KEY = "surprise-pages:views";

/** 「記録を残さない」を選んだ印を置く鍵（localStorage）。値が "1" のときだけ止める。 */
export const VIEWED_OFF_KEY = "surprise-pages:views:off";

/**
 * このタブで、このページを控え済みかの印を置く鍵（sessionStorage）。
 *
 * ページごとに 1 つ持つ。1 つの鍵に畳むと、同じタブで別のページへ移った 2 枚目が
 * 記録されない。印そのものはタブを閉じれば消えるので、新しいタブで開き直せば
 * 「2 回見ました」に増える。
 */
export function viewedMarkKey(pageSlug: string): string {
  return `surprise-pages:views:sent:${pageSlug}`;
}

/** 並べ替えの物差し。読めない時刻はいちばん古い扱いにする（落ちない・消さない）。 */
function timeOf(iso: string): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * 最後に見た順（新しいものが上）。
 *
 * 文字列のまま比べない。サーバーから来る時刻は末尾が `+00:00`、ブラウザが書くものは
 * `Z` と形が違うので、字面で比べると同じ時刻でも並びが入れ替わる。
 */
function byLastViewed<T extends ViewedPage>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => timeOf(right.lastViewedAt) - timeOf(left.lastViewedAt));
}

/**
 * このページを見たことを控えに足す。
 *
 * 同じページは 1 行に畳んで回数を 1 つ増やし、いちばん上へ持ち上げる。
 * 題は毎回そのときのもので上書きする（ページの題が直されたら、控えも追いつく）。
 * あふれた分は末尾（最後に見たのがいちばん古い行）から落ちる。
 */
export function recordViewed(
  list: readonly ViewedPage[],
  seen: { href: string; title: string },
  at: string,
): ViewedPage[] {
  const before = list.find((one) => one.href === seen.href) ?? null;
  const rest = list.filter((one) => one.href !== seen.href);
  const next: ViewedPage = {
    href: seen.href,
    title: seen.title,
    lastViewedAt: at,
    viewCount: before === null ? 1 : before.viewCount + 1,
  };
  return byLastViewed([next, ...rest]).slice(0, VIEWED_LIMIT);
}

/** 1 行だけ消す。 */
export function removeViewed(list: readonly ViewedPage[], href: string): ViewedPage[] {
  return list.filter((one) => one.href !== href);
}

/**
 * アカウントに残っている分と、ブラウザの中の分を 1 本に混ぜる。
 *
 * **混ぜてから 1 回で描く**ためのもの。先に片方を描いて後から差し込むと、
 * 一覧が出たあとに行が割り込んで、押そうとした行がずれる。
 *
 * 同じページが両方にあるときはアカウントの行を採る（端末をまたいで数えられる、
 * より確かなほう）。ログイン中はブラウザの中に書かないので、ふつうは重ならない。
 * **重なっていた行を消すときは、両方から消す**——採らなかったほうが残ると、
 * 消したはずのページが次に開いたときまた並ぶ（画面ではそれを呼び名の有無で見分ける）。
 */
export function mergeViewed(
  server: readonly AccountViewedPage[],
  local: readonly ViewedPage[],
): ViewedRow[] {
  const known = new Set(server.map((one) => one.href));
  return byLastViewed([
    ...server.map((one) => ({ ...one, localOnly: false })),
    ...local
      .filter((one) => !known.has(one.href))
      .map((one) => ({ ...one, localOnly: true, pageSlug: null })),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 控え 1 行を読み取る。形が違うものは黙って落とす（null を返す）。
 *
 * ブラウザの中身は誰でも書き換えられる。読み取りで信じるのは形だけにして、
 * 中身の値は画面が文字として出す（押した先が 404 になるのは受け入れる）。
 */
function viewedPageFrom(value: unknown): ViewedPage | null {
  if (!isRecord(value)) return null;
  const { href, title, lastViewedAt, viewCount } = value;
  if (typeof href !== "string" || href.length === 0) return null;
  if (typeof title !== "string") return null;
  if (typeof lastViewedAt !== "string") return null;
  if (typeof viewCount !== "number" || !Number.isFinite(viewCount)) return null;
  return { href, title, lastViewedAt, viewCount: Math.max(1, Math.floor(viewCount)) };
}

/**
 * ブラウザの中の文字列を控えに戻す。
 *
 * 読めなければ空として扱う（例外にしない）。ここで落ちると、控えが 1 文字壊れただけで
 * 画面そのものが出なくなる。「読み込めませんでした」を出すのは、保存の口ごと
 * 閉じられている（例外が飛ぶ）ときだけ——そちらは呼ぶ側が受け取る。
 */
export function parseViewed(raw: string | null): ViewedPage[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows: ViewedPage[] = [];
  for (const one of parsed) {
    const row = viewedPageFrom(one);
    if (row !== null) rows.push(row);
  }
  return byLastViewed(rows).slice(0, VIEWED_LIMIT);
}

/** 控えを文字列にする。 */
export function serializeViewed(rows: readonly ViewedPage[]): string {
  return JSON.stringify(rows);
}

/** 「記録を残さない」が立っているか。立っていれば、書く側は何もしない。 */
export function viewedPaused(raw: string | null): boolean {
  return raw === "1";
}
