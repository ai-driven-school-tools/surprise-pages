import { isPersonalEdition, siteOwnerEmail } from "../settings/site-settings";
import { headers } from "next/headers";

import { FIRST_ORGANIZATION } from "../organization/scope";
import type { Member } from "../identity/identity";

/**
 * 手元で動かしているときだけ、ログインを省いて見られるようにする仕掛け。
 *
 * 手元のパソコンには Google の鍵が置いていないので、ログイン画面まで行っても
 * 必ず Google に断られる（`client_id` が空のまま送られる）。それでは
 * 社内ページを 1 枚も開けないので、手元に限って「社内の人としてログイン済み」の
 * ふりをした仮の人を 1 人だけ用意する。
 *
 * **差し込む場所は src/lib/identity/identity.ts の 1 か所だけ。** あそこが「いま操作しているのは誰か」を
 * 決めるただ 1 つの口なので、そこで仮の人を返せば、画面・素材・コメント・OGP は
 * 何も知らないまま同じように動く。入口ごとに「手元なら通す」と書き足さない
 * （書き足した数だけ、本番で 1 つだけ外れる事故の種が増える）。
 *
 * 見てよいかの判定（src/lib/access/access.ts の `canViewPage`）には手を入れていない。
 * 仮の人は**ただの社内の人**として扱われるので、社内限定のページは開き、
 * 制限つきのページは名簿に載っていない以上ふつうに断られる。例外の枝は 1 本も無い。
 *
 * ## 本番で絶対に有効にならないための歯止め
 *
 * 「有効にする条件」ではなく**「無効にする条件」を並べる**向きで書いてある。
 * 判定の材料が読めないときも無効に倒れるので、思いがけない場所で素通しにならない。
 *
 *   1. production   … 組み立ての種類が本番
 *   2. vercel       … Vercel の上で動いている（Vercel が自分で立てる環境変数で分かる）
 *   3. remoteHost   … 受け取ったリクエストの宛先が手元向きでない
 *   4. optedOut     … 逃げ道の環境変数が立っている（本物のログインを試したいとき）
 *
 * 3 が肝。1 と 2 をすり抜ける事故——本番の設定を手元へ写した、逆に手元の設定が
 * 本番へ紛れた——が起きても、**宛先が本番のドメインなら効かない**。
 */

/** 逃げ道の環境変数。これを立てて起動すると、手元でも本物のログインに戻る。 */
export const REAL_LOGIN_FLAG = "LOCAL_LOGIN_REQUIRED";

/**
 * 無効にした理由。null（どの理由にも当てはまらない）のときだけ素通しになる。
 *
 * 理由を返すのは、ターミナルに出す 1 行の文言を分けるためではなく、
 * **検査表が 4 つの歯止めを 1 つずつ名前で確かめられるように**するため
 * （tests/checks/check-local-preview.mjs）。
 */
export type LocalPreviewBlock = "production" | "vercel" | "remoteHost" | "optedOut";

/** 手元の仮の人が名乗るアドレス（社内版の仮の人。配布版の手元は設置した本人として動く）。 */
export const LOCAL_PREVIEW_EMAIL = "local-preview@example.com";

/**
 * 仮の人の所属。最初の組織 の組織の member として**ここで作る**（名簿は引かない・書かない）。
 * 手元の `pnpm dev` は本番の保管庫を向いているので、名簿を引くと自動参加で仮の人の行が積まれてしまう。
 * 管理者にはしない（見える範囲はふつうの社員とまったく同じ、の約束を守る）。
 */
const LOCAL_PREVIEW_ORGANIZATION = { id: FIRST_ORGANIZATION.id, assetPrefix: FIRST_ORGANIZATION.assetPrefix, role: "member" } as const;

/**
 * 画面やコメントに出る名前。
 *
 * 本物の人の名前を騙らせない。コメントの書き手として並んだときに、
 * 手元で作った跡だと一目で分かる言い方にしてある。
 */
export const LOCAL_PREVIEW_NAME = "手元のお試し（ログイン省略）"; // i18n-keep: 手元の開発だけの仮の人の名前（人の名前は訳さない・名乗りとして保存される）

/**
 * その名乗りは、手元の仮の人か。
 *
 * **手元の `pnpm dev` は本番の保管庫を向いている。** 見ただけで行が積まれる類の控えを
 * 素直に書くと、手元でページを 1 枚開くたびに本物の行が本番へ溜まる（開発中は 1 日に何十枚も開く）。
 * 書き込む側はこれを呼んで、仮の人のぶんだけ手前で落とす。
 *
 * **見てよいかの判定には使わない。** 仮の人はあくまで「ただの社内の人」で、
 * 見える範囲はふつうの社員とまったく同じ（例外の枝を 1 本も作らない、が src/lib/access/access.ts の約束）。
 * ここが分けているのは「本番の保管庫に跡を残すか」だけ。
 *
 * 判定に使う名乗りは、この仕掛けが自分で作った 1 つだけ（LOCAL_PREVIEW_EMAIL）。
 * 本番では誰も名乗れない——この名前で Google のアカウントを作れば別だが、
 * そのときは会社の名簿に載っている本物の社員なので、控えが増えないだけの話になる。
 */
export function isLocalPreviewMember(identity: { email: string } | null): boolean {
  if (identity === null) return false;
  return identity.email.trim().toLowerCase() === LOCAL_PREVIEW_EMAIL;
}

/** 弾きを一時的に外す旗。手元で控えの動きを目で確かめたいときだけ立てる。 */
export const RECORD_ANYWAY_ENV = "LOCAL_PREVIEW_RECORD_VIEWS";

/**
 * 本番の保管庫に跡を残さず素通りさせるか。
 *
 * ふだんは仮の人のぶんを落とすが、**それだと手元で控えの動きを確かめられない**
 * （行が 1 つも作れないので、並んだ画面も、消す操作も、目で見られない）。
 * 旗（LOCAL_PREVIEW_RECORD_VIEWS=1）を立てたときだけ落とすのをやめる。
 *
 * 旗が本番で効くことはない。効くのは「仮の人として名乗れているとき」だけで、
 * 名乗れるかどうかは上の 4 つの歯止め（本番・Vercel・別ホスト・自分で切った）が
 * 先に決めている。本番ではそもそも仮の人になれないので、旗があっても素通りしない。
 *
 * 積まれる行のアドレスは仮の人のもの（local-preview@…）なので、本物の人の控えとは混ざらない。
 * 確かめ終わったら、その人のぶんを消せば元通りになる。
 */
export function skipsRealStore(identity: { email: string } | null): boolean {
  if (!isLocalPreviewMember(identity)) return false;
  return process.env[RECORD_ANYWAY_ENV] !== "1";
}

/** 手元の仮の人。社内の人（`kind: "member"`）としてだけ扱われる。 */
export const LOCAL_PREVIEW_MEMBER: Member = {
  kind: "member",
  email: LOCAL_PREVIEW_EMAIL,
  name: LOCAL_PREVIEW_NAME,
  image: null,
  organization: LOCAL_PREVIEW_ORGANIZATION,
};

/**
 * 「いま Vercel の上で動いている」ことだけを指す目印。
 *
 * **`VERCEL` / `VERCEL_ENV` / `VERCEL_URL` は使えない。** README のとおり、手元の環境は
 * `vercel env pull` で本番から丸ごと写して作る。あの 3 つは写しの中に入ってくるので、
 * 手元のパソコンでも「置いてある」状態になる——つまり、あれを目印にすると
 * 手元でこの仕掛けが一度も効かない（＝鍵が無いのにログインを求められる、元の困りごとに戻る）。
 *
 * ここに並べてあるのは、**動いている最中に Vercel が立てるもの**だけ。写しには入らない
 * （どの地域で動いたか・どの版として動いたかは、走らせてみないと決まらないため）。
 *
 * 万一 Vercel がこの名前をやめても、素通しにはならない。本番として組み立てたものは
 * 1 つめの歯止めで止まり、宛先が本番のドメインなら 3 つめで止まる。
 * 3 枚のうち 1 枚が薄くなるだけで、どの 1 枚でも単独で足りている。
 */
export const VERCEL_RUNTIME_MARKS = [
  "VERCEL_REGION",
  "VERCEL_DEPLOYMENT_ID",
  "AWS_LAMBDA_FUNCTION_NAME",
];

/** 環境変数が「置いてある」か。値が何であっても、あること自体を合図として読む。 */
function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** 人が立てた旗か。`0` と `false` は「立てていない」として読む（打ち間違いで戻らないため）。 */
function isRaised(value: string | undefined): boolean {
  if (!isSet(value)) return false;
  const flag = String(value).trim().toLowerCase();
  return flag !== "0" && flag !== "false";
}

/**
 * その宛先は自分のパソコンを指しているか。
 *
 * 受け取るのは Host に書いてある名前そのままなので、後ろに `:3000` のような
 * 番号が付いている。IPv6 は `[::1]:3000` と角かっこで囲まれた形で届く。
 * 知っている 3 つ（`localhost` / `127.0.0.1` / `[::1]`）以外は全部よそ扱いにする。
 */
export function isLoopbackHost(host: string): boolean {
  const name = host.trim().toLowerCase();
  if (name.length === 0) return false;

  // [::1]:3000 → [::1]。角かっこが閉じていない壊れた形は、よそ扱いにする
  if (name.startsWith("[")) {
    const close = name.indexOf("]");
    if (close === -1) return false;
    return name.slice(0, close + 1) === "[::1]";
  }

  const bare = name.split(":")[0];
  return bare === "localhost" || bare === "127.0.0.1";
}

/**
 * 受け取ったリクエストの宛先が、丸ごと手元向きか。
 *
 * 宛先の名乗りは 1 つに限らない（`Host` のほかに、間に立つものが足す
 * `X-Forwarded-Host` がある）。**挙がった名前が全部手元向きのときだけ**通す。
 * 1 つでもよその名前が混じっていたら手元ではない——どちらを信じるかで
 * 迷わないように、片方でも外を向いていたら止める向きにしてある。
 *
 * 名前が 1 つも読めないときも手元ではない扱い。読めない＝確かめられないので、
 * 素通しの側に倒さない。
 */
export function isLocalTarget(hosts: readonly (string | null | undefined)[]): boolean {
  const named = hosts.filter((host): host is string => isSet(host ?? undefined));
  if (named.length === 0) return false;
  return named.every((host) => isLoopbackHost(host));
}

/**
 * 素通しにしてよいか。だめなときは理由を返す（null のときだけ素通し）。
 *
 * 保管庫にも通信にも触らない純粋な計算。検査表がここへ作った環境変数と
 * 作った宛先を渡して、本番・Vercel・よその宛先で素通しにならないことを
 * 総当たりで確かめている。
 */
export function localPreviewBlock(
  env: Readonly<Record<string, string | undefined>>,
  hosts: readonly (string | null | undefined)[],
): LocalPreviewBlock | null {
  // 1. 本番として組み立てたもの
  if (env["NODE_ENV"] === "production") return "production";

  // 2. Vercel の上。走っている最中の目印が 1 つでもあれば、そこは手元ではない
  if (VERCEL_RUNTIME_MARKS.some((mark) => isSet(env[mark]))) return "vercel";

  // 3. 宛先が手元向きでない。1 と 2 をすり抜けた事故でも、ここで止まる
  if (!isLocalTarget(hosts)) return "remoteHost";

  // 4. 本物のログインを試したい人が自分で立てた旗
  if (isRaised(env[REAL_LOGIN_FLAG])) return "optedOut";

  return null;
}

/**
 * 素通しで見ていることを、開発サーバーのターミナルに 1 行だけ出す。
 *
 * 配信するページの本文には 1 バイトも足さない（保管庫の HTML は正本で、
 * 手元の都合を混ぜる場所ではない）。気づく手がかりは 2 つ:
 * ここの 1 行と、一覧の右上に出る名乗り（`local-preview@…`）。
 *
 * 1 回きり。リクエストごとに出すと、画像 1 枚ごとに行が積まれて読めなくなる。
 */
let announced = false;

function announceOnce(): void {
  if (announced) return;
  announced = true;
  console.log(
    `[手元のお試し] ログインを省いて「${LOCAL_PREVIEW_NAME}」として見ています。` + // i18n-keep: 開発者の端末のログにだけ出す
      `本物のログインを試すときは ${REAL_LOGIN_FLAG}=1 を付けて起動してください。`, // i18n-keep: 開発者の端末のログにだけ出す
  );
}

/**
 * 手元の仮の人（素通しにしてよいときだけ）。それ以外は null で、
 * 呼び出し側はふつうのログインの確かめ方に進む。
 *
 * 宛先が読めない場所から呼ばれたときも null。読めない＝確かめられないので、
 * ここでも素通しの側に倒さない。
 */
export async function localPreviewMember(): Promise<Member | null> {
  let hosts: readonly (string | null)[];
  try {
    const store = await headers();
    hosts = [store.get("host"), store.get("x-forwarded-host")];
  } catch {
    return null;
  }

  if (localPreviewBlock(process.env, hosts) !== null) return null;

  if (isPersonalEdition()) {
    try {
      const database = new URL(process.env.DATABASE_URL ?? "");
      if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) return null;
    } catch { return null; }
    // 配布版の手元は設置した本人として動く（持ち主・src/lib/organization/member-organization.ts の配布版の扱いと同じ）
    return { kind: "member", email: siteOwnerEmail(), name: LOCAL_PREVIEW_NAME, image: null,
      organization: { id: FIRST_ORGANIZATION.id, assetPrefix: FIRST_ORGANIZATION.assetPrefix, role: "owner" } };
  }
  announceOnce();
  return LOCAL_PREVIEW_MEMBER;
}
