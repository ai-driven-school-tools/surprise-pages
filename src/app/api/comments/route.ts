import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { routeLog } from "@/lib/logging/server-log";

import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { isPersonalEdition } from "@/lib/settings/site-settings";
import {
  canEditPage,
  canManageSharing,
  canUsePageTools,
  gateError,
  hasOwnerGrant,
  isAdmin,
  openToolsPage as openPage,
  type AdminAnswer,
} from "@/lib/access/access";
import { currentIdentity, isMember, toViewer } from "@/lib/identity/identity";
import {
  createComment,
  listComments,
  parsePageSlug,
  replyProblemKey,
  resolveComments,
  validateBulkResolve,
  validateNewComment,
} from "@/lib/comments/comments";
import { historyAvailable } from "@/lib/revisions/revisions";
import { readBetaFeatures } from "@/lib/settings/beta-features-store";
import { favoritePageIds } from "@/lib/workspace/sidebar-favorites";
import type {
  BulkResolveResponse,
  CommentResponse,
  CommentsResponse,
} from "@/lib/comments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 誰がこのページのコメントを読み書きしてよいか。
 *
 *              読む                    書く
 *   社内 …… 会社アカウントのみ    会社アカウントのみ
 *   制限 …… 名簿に載っている人    同じ
 *   公開 …… 会社アカウントのみ    会社アカウントのみ（記事は誰でも読める）
 *
 * **公開ページの読みも閉じる。** あれは社外へ配る記事で、読み手にコメント欄が
 * 見えると、社内の直しの会話がそのまま外に出る。画面から消すだけでは足りない
 * （この口を直に叩けば読めてしまう）ので、返す側で閉じる。
 *
 * 決めるのは 2 つの門だけ。ページを見てよいかは `openPage`、道具箱を触ってよいかは
 * `canUsePageTools`。どちらも呼び名の頭の文字を見ない——制限つきのページも
 * 呼び名は `internal/...` のままなので、見分けが付かない。
 */

/**
 * 道具箱を閉じたときの答え。
 *
 * 断らずに 200 で返すのは、あの画面に出すものが何も無いから——記事だけを読んでいる人に、
 * 失敗の知らせを出す筋合いが無い。名乗りもコメントも載せない（旗が倒れていれば、
 * 受け取った側は何も描かない）。
 */
function closedTools(): CommentsResponse {
  return {
    viewer: null,
    comments: [],
    currentVersion: null,
    favorite: null,
    features: {
      tools: false,
      history: false,
      sharing: false,
      edit: false,
      write: false,
    },
  };
}

/** そのページに付いているコメントの一覧。 */
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/comments", request, async () => {
    const organization = await currentOrganization();
    const page = parsePageSlug(new URL(request.url).searchParams.get("page"));
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    const viewer = await currentIdentity();

    try {
      /*
       * 3 つとも互いの答えを要らないので、まとめて投げる。
       *
       * 関数は米国東部、保管庫は東京にあって 1 往復が 150 ミリ秒。縦に並べると
       * それだけで 0.45 秒待つことになる（保管庫の中の処理は 0.2 ミリ秒しかかからない）。
       *
       * **門より先にコメントを取りに行くのは、答えを返さない限り漏れにならない。**
       * 門が閉じていれば、下で 1 行も返さずに捨てる。ここは「そのページを開けた人の画面」
       * から呼ばれる口なので、たいてい門は開く。閉じていたときの 1 回ぶんを無駄に引く側へ
       * 倒して、開いたときの 1 往復（150 ミリ秒）を全員から取り除いた。
       * 無駄に引くのは目印 1 本で絞った小さな読みで、保管庫の中では 0.2 ミリ秒で終わる。
       */
      const asked: AdminAnswer = isMember(viewer) ? isAdmin(organization, viewer) : false;
      // 道具箱を触れない人のぶんは、コメント表を引きに行かない（返さないものは読まない）
      const tools = canUsePageTools(viewer);
      const [gate, comments, admin, beta, favorites] = await Promise.all([
        openPage(organization, viewer, page.slug),
        tools ? listComments(organization, page.slug, viewer) : [],
        asked,
        // 本人が入れたベータ機能。会社の人のぶんだけ引く（読めなければ空。窓口は落とさない）
        isMember(viewer) ? readBetaFeatures(organization, viewer.email) : [],
        // 本人のお気に入り（現在地の行の星）。門が開く前に引いても、返すのは門が開いたときだけ
        isMember(viewer) ? favoritePageIds(organization, viewer) : Promise.resolve<string[]>([]),
      ]);

      // 取りに行くのは先でよいが、**返すのは門が開いたときだけ**
      if (!gate.ok && isPersonalEdition() && gate.reason !== "notFound" && gate.page?.visibility === "public") return jsonResponse(closedTools(), 200);
      if (!gate.ok) return gateError(gate.reason);

      // ページは見られるが、道具箱は触れない人（＝公開ページを開いた社外の人）
      if (!tools) return jsonResponse(closedTools(), 200);

      /*
       * 共有範囲を触れるのは、作った人・管理者に加えて「共同の作った人」（役割つきの許可）。
       * 名簿を見に行くのは**答えがまだ変わりうるとき**だけにする:
       *   ・会社の人でなければ引かない（公開ページの読み手に 1 往復増やさない）
       *   ・作った人・管理者はもう通っているので引かない
       *   ・**制限つきのページのときだけ**引く
       *
       * 3 つめが要る。ここを「制限を付け外しできるページ」まで広げると、ふつうの
       * 社内ページ——つまり社員の誰が開いても通る大多数——の全員に 1 往復（150 ミリ秒）
       * 足すことになる。共同の作った人が意味を持つのは、名簿で見る人を絞っている
       * ページだけなので、共有の板を出すかどうかもそれで足りる。
       * 決めるのは canManageSharing 1 つだけ。ここで可否を数え直さない。
       */
      let sharing = isMember(viewer) && canManageSharing(viewer, gate.page, admin);
      /*
       * 本文をブラウザから直せるか。顔ぶれは共有と同じ 3 人（管理者・作った人・
       * 共同の作った人）で、可否の正本は canEditPage ただ 1 つ。ここで数え直さない。
       */
      let edit = canEditPage(viewer, gate.page, admin);
      if ((!sharing || !edit) && isMember(viewer) && gate.page.visibility === "restricted") {
        // 「共同の作った人か」は 1 回だけ引いて、2 つの旗で使い回す
        const ownerGrant = await hasOwnerGrant(organization, gate.page.id, viewer.email);
        sharing = canManageSharing(viewer, gate.page, admin, ownerGrant);
        edit = canEditPage(viewer, gate.page, admin, ownerGrant);
      }

      const payload: CommentsResponse = {
        viewer: toViewer(viewer),
        comments,
        // 「いま出す版」の目印は門を通ったページの行に載っている（引き直さない）
        currentVersion: gate.page.currentVersionId,
        // 現在地の行の星。会社の人が自分で開いているときだけ載せる
        favorite: isMember(viewer) ? favorites.includes(gate.page.id) : null,
        // 鍵が置かれていない機能は、ボタンごと出さないでもらう
        features: {
          // ここへ来ているのは会社の人だけ（上で閉じてある）
          tools: true,
          history: historyAvailable(),
          // 触れない人には道具箱に項目ごと出さない（押せないボタンを見せない）。
          // 「管理者か」は上で 1 回だけ引いてある（ここで引き直すと 1 往復増える）
          sharing,
          edit,
          // コメントを書ける（投稿・返信・解決・直し・消す）
          write: true,
          // 個人設定で本人が入れたベータ機能（入口を出すかは道具箱が名前で聞く）
          beta,
        },
      };
      return jsonResponse(payload, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}

/**
 * コメントを 1 件足す。書いた人は名乗り方から採る（申告は受け付けない）。
 *
 * 書けるのは会社の人だけ。公開ページも同じで、名前だけの参加はもう受け付けない。
 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/comments", request, async () => {
    const organization = await currentOrganization();
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("toolbox.server.unreadableBody"), 400);
    }

    const input = validateNewComment(payload);
    if (!input.ok) return jsonError(rt(input.reasonKey, input.reasonParams), 400);

    const page = parsePageSlug(input.value.pageSlug);
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    const viewer = await currentIdentity();
    // 断り方は門と同じ部品に任せる（文言と番号を入口ごとに書き比べない）
    if (!canUsePageTools(viewer)) return gateError("signin");

    try {
      const gate = await openPage(organization, viewer, page.slug);
      if (!gate.ok) return gateError(gate.reason);

      // 返信は 1 段まで。返信への返信と、別ページへのぶら下げは受け付けない（アプリの窓口と同じ判定）
      const badReply = await replyProblemKey(organization, input.value, viewer);
      if (badReply !== null) return jsonError(rt(badReply), 400);

      // どの版に対して付いたコメントかを、サーバー側で刻む。
      // ブラウザに版を申告させないのは、書いた人と同じく、後から書き換えられるため。
      const created: CommentResponse = {
        comment: await createComment(gate.page, input.value, viewer, gate.page.currentVersionId),
      };

      return jsonResponse(created, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}

/**
 * まとめて解決にする / まとめて未解決に戻す。
 *
 * 1 件ずつの口（`[id]/route.ts`）を N 回叩く形にしないのは、途中で失敗すると
 * **半分だけ閉じた状態**で止まるから。人が「まとめて」と言ったものは、
 * 1 回の書き込みで動かす。
 *
 * 誰が触ってよいかは 1 件の口とまったく同じ——道具箱を触れる会社の人で、
 * かつそのページを開ける人（解決の付け外しは書いた本人に限らない）。
 * 関門は `canUsePageTools` と `openPage` の 2 つだけで、ここで数え直さない。
 */
export async function PATCH(request: Request): Promise<Response> {
  return routeLog("/api/comments", request, async () => {
    const organization = await currentOrganization();
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("toolbox.server.unreadableBody"), 400);
    }

    const input = validateBulkResolve(payload);
    if (!input.ok) return jsonError(rt(input.reasonKey, input.reasonParams), 400);

    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return gateError("signin");

    try {
      const gate = await openPage(organization, viewer, input.value.page.slug);
      if (!gate.ok) return gateError(gate.reason);

      const done: BulkResolveResponse = {
        changed: await resolveComments(organization, 
          input.value.page,
          input.value.ids,
          input.value.resolved,
          viewer,
        ),
      };
      return jsonResponse(done, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
