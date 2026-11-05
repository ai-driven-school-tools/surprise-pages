import { DeckDesignError } from "@/lib/deck/design/html";
import { currentOrganization, type OrganizationScope } from "@/lib/organization/scope";
import { documentLimitMb, siteOrigin } from "@/lib/settings/site-settings";
import { DeckCustomizationError, deckLogoAssetPaths } from "@/lib/deck/edit/customization-html";
import { del } from "@vercel/blob";
import { grantToGroup, listGroups, type Group } from "@/lib/access/access";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import {
  archivePrefix,
  assetPrefix,
  listAssetsUnder,
  outsideNestedBranches,
} from "@/lib/pages/assets";
import { PUBLISH_MESSAGE_MAX_LENGTH } from "@/lib/comments/types";
import { DECK_LOGO_ASSET_PREFIX } from "@/lib/deck/media/logo";
import { DECK_EDIT_ASSET_PREFIX } from "@/lib/deck/edit/assets";
import { isDeckHtml } from "@/lib/deck/deck";
import { isSafeSlug, urlPrefix, type Visibility } from "@/lib/pages/content";
import { humanMessage } from "@/lib/revisions/revisions";
import { localizedMessage } from "@/lib/i18n/errors";
import { requestTranslate, rt } from "@/lib/i18n/request";
import {
  commitRevision,
  InheritedDeckTooLargeError,
  markPageDeleted,
  nestedPageSlugs,
  pageRefFrom,
  RestrictedExistingPageError,
  RevisionRaceError,
  StaleBaseError,
  SlugConflictError,
  type CommitResult,
  type PageRefParts,
} from "@/lib/pages/store";
import { deckPublicationTarget, pageDeletionTarget } from "@/lib/access/page-edit-access";
import { deckRepublishConflicts } from "@/lib/deck/edit/republish-source";
import type { RepublishConflict } from "@/lib/deck/edit/republish-guard";
import { ownerFromRequest, identityOf, TOKEN_REJECTED } from "@/lib/identity/publish-tokens";
import { logEvent, routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ページの投稿と削除。
 *
 * 名乗り方は投稿トークン（Authorization: Bearer）だけ。ブラウザのログインでは通さない。
 * 投稿は手元の道具（bin/pages-publish）から打つもので、画面を開いている人が
 * うっかり別のページを上書きする道を増やしたくないため。
 *
 * 書いた人も、ページの名前も、版の目印も、全部サーバーが決める。
 * 送る側の名乗りを受け付けると、履歴に誰でも好きな名前を残せてしまう。
 */

const MB = 1024 * 1024;
const MAX_HTML_BYTES = documentLimitMb() * MB;

/** 巻き戻しの断りに並べる例の数と、1 つの例の字数。全部並べると断りの文が読めなくなる */
const REVERT_EXAMPLES = 3;
const REVERT_EXAMPLE_LENGTH = 40;

function revertMessage(reverts: readonly RepublishConflict[]): string {
  const clip = (text: string) => (text.length > REVERT_EXAMPLE_LENGTH ? `${text.slice(0, REVERT_EXAMPLE_LENGTH)}…` : text);
  const examples = reverts.slice(0, REVERT_EXAMPLES).map((revert) =>
    revert.current === null
      ? rt("server.publish.deckRevertRestored", { text: clip(revert.source ?? "") })
      : revert.proposed === null
        ? rt("server.publish.deckRevertDropped", { text: clip(revert.current) })
        : rt("server.publish.deckRevertChanged", { current: clip(revert.current), proposed: clip(revert.proposed) }));
  return rt("server.publish.deckRevertsEdits", { count: reverts.length, examples: examples.join(rt("server.publish.deckRevertSeparator")) });
}

type PublishResponse = {
  versionId: string;
  shortVersionId: string;
  versionNumber: number;
  changeCount: number | null;
  url: string;
  title: string;
  /** 中身が前と同じで、新しい版を積まなかったか */
  unchanged: boolean;
  /** 「選んだ人だけ」のページか。CLI が投稿後に見せ方を言い当てるのに使う */
  restricted: boolean;
  /** 今回の投稿で見せる指定をした閲覧グループの名前（無ければ空） */
  grantedGroups: string[];
};

/** 送られてきた中身を、型を壊さずに 1 段だけ開く。 */
function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record: Record<string, unknown> = { ...value };
  return record;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return toRecord(await request.json());
  } catch {
    return null;
  }
}

/**
 * 出来上がったページの URL。宛先は設置のサイトの URL（PAGES_SITE_URL）。読めないとき（設置の途中）だけ、来たリクエストの元を使う。
 */
function pageUrl(request: Request, visibility: Visibility, slug: readonly string[]): string {
  let origin: string;
  try { origin = siteOrigin(); } catch { origin = new URL(request.url).origin; }

  return `${origin}${urlPrefix(visibility)}/${slug.join("/")}`;
}

/**
 * 今回のページが使う素材の一覧を読み取る。
 *
 * 受け取り方は 3 通りあり、**「指定なし」と「空の一覧」は別物**として扱う:
 *   指定なし（null）… 素材には触らない。1 枚ものの HTML を投稿したときがこれ
 *   空の一覧（[]）  … この版は素材を使わない。つまり今ある素材は片付ける
 *   名前の並び       … その名前だけ残し、ほかを片付ける
 *
 * ここを一緒にすると、素材を触っていない投稿のたびにページの画像が全部消える。
 * また、1 つでも読めない形が混ざっていたら、まとめて突き返す（ok: false）。
 * 読めなかったぶんを黙って外すと、**まだ使っている画像を消す**ことになる。
 */
type KeepList = { ok: true; keep: string[] | null } | { ok: false };

/**
 * 見せる閲覧グループの名前の一覧を読み取る。
 *
 * 指定なし（undefined / null）は空の一覧と同じ扱い。「選んだ人だけ」を
 * グループなしで作ること自体は通す（作った人と管理者だけのページも作れてよい）。
 * 1 つでも読めない形が混ざっていたら、まとめて突き返す（ok: false）。
 * 名前の空白は、まとまりを作るときと同じ形（連続空白を 1 つ・前後を落とす）に
 * 揃えてから照合する。作る画面と投稿とで、同じ名前が別物に見えないように。
 */
type GroupNameList = { ok: true; names: string[] } | { ok: false };

function readGroupNames(value: unknown): GroupNameList {
  if (value === undefined || value === null) return { ok: true, names: [] };
  if (!Array.isArray(value)) return { ok: false };
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return { ok: false };
    const tidy = entry.replace(/\s+/g, " ").trim();
    if (tidy.length === 0) return { ok: false };
    names.push(tidy);
  }
  return { ok: true, names };
}

function readKeep(value: unknown): KeepList {
  if (value === undefined || value === null) return { ok: true, keep: null };
  if (!Array.isArray(value)) return { ok: false };

  const keep: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return { ok: false };
    const parts = entry.split("/");
    if (!isSafeSlug(parts)) return { ok: false };
    keep.push(parts.join("/"));
  }
  return { ok: true, keep };
}

/**
 * 投稿に添える一言を、履歴の 1 行に収まる形へ整える。
 *
 * まず人の言葉に直す（履歴を開いた人が `feat:` や末尾のチケット番号を読まされないため）。
 * そのうえで空白を 1 つに詰めて前後を落としてから切る。改行の無い巨大な 1 行が
 * そのまま保存されると、履歴が読めなくなる。切る長さは src/lib/comments/types.ts が正。
 */
function publishMessage(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return humanMessage(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PUBLISH_MESSAGE_MAX_LENGTH);
}

/** 1 度に消す数の上限。多すぎる指定で片付けごと失敗させないため、小分けにする。 */
const DELETE_BATCH = 200;

/**
 * 今回もう使わない素材を片付ける。
 *
 * `@archive` の下（過去の版の写し）には絶対に触らない。ここを消すと、
 * 去年のレポートを開いたときに画像が全部割れる。
 */
async function sweepAssets(organization: OrganizationScope, page: PageRefParts, keep: readonly string[]): Promise<number> {
  const prefix = assetPrefix(organization, page.slugPrefix, page.slug);
  const frozen = archivePrefix(organization, page.slugPrefix, page.slug);
  const wanted = new Set(keep.map((rel) => `${prefix}${rel}`));

  // 名前が入れ子になっているページ（この歯止めより前に作られたもの）の素材を巻き込まない。
  // 入れ子の名前は投稿の入口で断っているが、消す側にも歯止めを置く（消したら戻せない）
  const outside = outsideNestedBranches(organization, await nestedPageSlugs(organization, page.pageSlug));

  const unused = (await listAssetsUnder(prefix))
    .map((asset) => asset.pathname)
    .filter((pathname) =>
      !wanted.has(pathname) &&
      !pathname.startsWith(frozen) &&
      // Browser-saved revisions can each point to a distinct logo. They do not all pass
      // through the CLI freeze step, so keeping this private history prevents broken old revisions.
      !pathname.startsWith(`${prefix}${DECK_LOGO_ASSET_PREFIX}`) &&
      !pathname.startsWith(`${prefix}${DECK_EDIT_ASSET_PREFIX}`),
    );

  const stale = unused.filter(outside);
  const spared = unused.length - stale.length;
  // 応答には載せない（投稿した人に関わりの無い話）。あとで追えるようにログだけ残す（呼び名は載せない）
  if (spared > 0) {
    logEvent({ level: "info", event: "assets.spared", fields: { count: spared } });
  }

  for (let at = 0; at < stale.length; at += DELETE_BATCH) {
    await del(stale.slice(at, at + DELETE_BATCH));
  }
  return stale.length;
}

/** ページを 1 枚投稿する（新しい版を積む）。 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages", request, async () => {
    const organization = await currentOrganization();
    try {
      // 鍵を先に確かめる。中身の書き方の間違いを、通りもしない相手に教えないため
      const owner = await ownerFromRequest(organization, request);
      if (owner === null) return jsonError(TOKEN_REJECTED, 401);

      const body = await readBody(request);
      if (body === null) return jsonError(rt("server.publish.unreadableBody"), 400);

      const page = pageRefFrom(body["visibility"], body["slug"]);
      if (page === null) return jsonError(rt("server.publish.invalidPage"), 400);

      const html = body["html"];
      if (typeof html !== "string" || html.trim().length === 0) {
        return jsonError(rt("server.publish.emptyHtml"), 400);
      }
      const bytes = Buffer.byteLength(html, "utf8");
      if (bytes > MAX_HTML_BYTES) {
        return jsonError(rt("server.publish.tooLarge", { size: Math.round(bytes / MB), limit: MAX_HTML_BYTES / MB }), 400);
      }

      const keep = readKeep(body["keep"]);
      if (!keep.ok) {
        return jsonError(rt("server.publish.invalidKeep"), 400);
      }

      /**
       * 「選んだ人だけ」（restricted）と、見せる閲覧グループ（grantGroups）。
       *
       * 既定は今までどおり（社内限定＝社内の全員が見られる）。この 2 つは
       * **付けたときだけ**効く追加の指定で、付けなければ挙動は 1 ミリも変わらない。
       * グループだけの指定は断る——「選んだ人だけ」でないページに名簿は効かないので、
       * 通すと「絞ったつもりで全員に見えている」勘違いを作る。
       */
      const restrictedValue = body["restricted"];
      if (restrictedValue !== undefined && typeof restrictedValue !== "boolean") {
        return jsonError(rt("server.publish.invalidRestricted"), 400);
      }
      const restricted = restrictedValue === true;

      const groupNames = readGroupNames(body["grantGroups"]);
      if (!groupNames.ok) {
        return jsonError(rt("server.publish.invalidGrantGroups"), 400);
      }
      if (!restricted && groupNames.names.length > 0) {
        return jsonError(rt("server.publish.groupsNeedRestricted"), 400);
      }
      if (restricted && page.slugPrefix === "public") {
        return jsonError(rt("server.publish.publicCannotRestrict"), 400);
      }

      /**
       * 名前 → まとまりの解決は、版を積む**前**に済ませる。
       * 名前の打ち間違いで「ページだけできて、見せたい人に見せられない」を作らないため。
       * 見つからない名前は、どれが無いのかまで言って返す（直すのは送った側なので）。
       */
      let grantGroups: Group[] = [];
      if (restricted && groupNames.names.length > 0) {
        const known = await listGroups(organization);
        const byName = new Map(known.map((group) => [group.name, group]));
        const found: Group[] = [];
        const missing: string[] = [];
        for (const name of groupNames.names) {
          const group = byName.get(name);
          if (group === undefined) missing.push(name);
          else found.push(group);
        }
        if (missing.length > 0) {
          return jsonError(rt("server.publish.missingGroups", { names: missing.join(rt("server.publish.groupNameSeparator")) }), 400);
        }
        grantGroups = found;
      }

      let result: CommitResult;
      try {
        const target=await deckPublicationTarget(organization, identityOf(owner),page.pageSlug,isDeckHtml(html));
        if(!target.ok)return target.response;
        const expectedHead=body["baseVersionId"];
        if(target.deck && target.versionId && expectedHead!==target.versionId)return jsonError(rt("server.publish.deckNeedsLatest"),409);
        // 土台の版が最新でも、原稿が古いままなら丸ごと送るとその後の直しが消える。版の番号だけ最新にした送り直しをここで止める
        if(target.existingDeck && isDeckHtml(html)){
          const reverts=await deckRepublishConflicts(target.existingDeck.page,target.existingDeck.html,html);
          if(reverts.length>0){
            logEvent({ level: "info", event: "pages.deck-reverts-refused", fields: { count: reverts.length } });
            return jsonError(revertMessage(reverts),409);
          }
        }
        result = await commitRevision({
          organization,
          pageSlug: page.pageSlug,
          html,
          message: publishMessage(body["message"]),
          author: owner,
          restricted,
          preserveDeckAppearance: true,
          ...(target.deck ? {expectedHead:target.versionId} : {}),
        });
      } catch (error) {
        // 名前の付け方の間違いは打ち直せば直る。待てば直ると読める 500 に混ぜない。
        // 文はその人の言語で（辞書の鍵を持たない例外は message のまま）
        const t = requestTranslate();
        if (error instanceof DeckDesignError) return jsonError(localizedMessage(error, t), 400);
        if (error instanceof InheritedDeckTooLargeError) return jsonError(localizedMessage(error, t), 400);
        if (error instanceof DeckCustomizationError) return jsonError(localizedMessage(error, t), 400);
        if (error instanceof SlugConflictError) return jsonError(localizedMessage(error, t), 400);
        if (error instanceof RestrictedExistingPageError) return jsonError(localizedMessage(error, t), 400);
        if (error instanceof RevisionRaceError || error instanceof StaleBaseError) return jsonError(localizedMessage(error, t), 409);
        throw error;
      }

      // 台帳の行。見せ方（visibility）はここからだけ読む（コピーを作らない）
      const stored = result.page;

      /**
       * 名簿への足し込みは、版を積んだ**あと**。ページは作られた瞬間から「選んだ人だけ」なので、
       * ここで転んでも閉じすぎる側にしか倒れない（見え過ぎる事故にはならない）。
       * grantToGroup は同じ相手に二度出しても何も起きないので、同じ投稿の打ち直しで直せる。
       */
      if (restricted && grantGroups.length > 0) {
        try {
          for (const group of grantGroups) {
            await grantToGroup(organization, stored.id, group.id, owner.email, group.name);
          }
        } catch (error) {
          logEvent({ level: "error", event: "pages.grant-failed", error });
          return jsonError(rt("server.publish.grantFailed"), 500);
        }
      }

      // 片付けは版を積んだあと。ここで失敗しても投稿は成功として返す。
      // 500 を返すと送った側がやり直し、同じ本文の版が二重に積まれる
      // （版は消せないので、履歴に中身の変わらない直しが残り続ける）。
      if (keep.keep !== null && !isDeckHtml(html)) {
        try {
          const protectedLogoPaths = deckLogoAssetPaths(result.html);
          await sweepAssets(organization, page, [...new Set([...keep.keep, ...protectedLogoPaths])]);
        } catch (error) {
          logEvent({ level: "error", event: "assets.sweep-failed", error });
        }
      }

      const payload: PublishResponse = {
        versionId: result.versionId,
        shortVersionId: result.versionId.slice(0, 7),
        versionNumber: result.versionNumber,
        changeCount: result.changeCount,
        url: pageUrl(request, page.slugPrefix, page.slug),
        title: result.title,
        unchanged: result.unchanged,
        restricted: stored.visibility === "restricted",
        grantedGroups: grantGroups.map((group) => group.name),
      };
      return jsonResponse(payload, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}

/** ページを消す。URL は開けなくなるが、本文・素材・版はそのまま残る。 */
export async function DELETE(request: Request): Promise<Response> {
  return routeLog("/api/pages", request, async () => {
    const organization = await currentOrganization();
    try {
      const owner = await ownerFromRequest(organization, request);
      if (owner === null) return jsonError(TOKEN_REJECTED, 401);

      const body = await readBody(request);
      if (body === null) return jsonError(rt("server.publish.unreadableBody"), 400);

      const page = pageRefFrom(body["visibility"], body["slug"]);
      if (page === null) return jsonError(rt("server.deletePage.invalidPage"), 400);

      const target = await pageDeletionTarget(organization, page.pageSlug);
      if (!target.ok) return target.response;
      const deleted = await markPageDeleted(organization, page.pageSlug);
      if (!deleted) return jsonError(rt("server.deletePage.alreadyGone"), 404);

      return jsonResponse(
        {
          ok: true,
          message: rt("server.deletePage.done"),
        },
        200,
      );
    } catch (error) {
      return serverError(error);
    }
  });
}
