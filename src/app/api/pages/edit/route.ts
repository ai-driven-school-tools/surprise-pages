import { withCleanCopyLook } from "@/lib/settings/clean-copy-look";
import { currentOrganization } from "@/lib/organization/scope";
import { deckOverridesSchema } from "@/lib/deck/design/design";
import { requestTranslate, rt } from "@/lib/i18n/request";
import { defaultTranslate } from "@/lib/i18n/default";
import { DeckDesignError, readDeckDesignHtml, withDeckOverrides } from "@/lib/deck/design/html";
import {
  DeckCustomizationError,
  deckCustomizationSchema,
  withDeckCustomization,
} from "@/lib/deck/edit/customization-html";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { loadEditablePage as loadEditable } from "@/lib/access/page-edit-access";
import { parsePageSlug } from "@/lib/comments/comments";
import { PUBLISH_MESSAGE_MAX_LENGTH } from "@/lib/comments/types";
import { withAssetBase, withSafeAnchorIds, withVendorScripts } from "@/lib/pages/content";
import { addedIssues, describeIssues, findHtmlIssues } from "@/lib/html/check";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import {
  commitRevision,
  pageHrefOf,
  readHtmlOf,
  RevisionRaceError,
  StaleBaseError,
  type CommitResult,
} from "@/lib/pages/store";
import { humanMessage } from "@/lib/revisions/revisions";
import {createHash} from "node:crypto";
import {deckEditStore} from "@/lib/deck/edit/store";
import {saveDeckOperations,DeckEditBusyError,DeckEditRequestError} from "@/lib/deck/edit/service";
import {deckSourceSetting,refineDeckOperations,DeckEditConflictError} from "@/lib/deck/edit/source";
import type {DeckEditOperation} from "@/lib/deck/edit/model";
import {deckEditRecordOperationsSchema} from "@/lib/deck/edit/model";
import { routeLog } from "@/lib/logging/server-log";
import { deckErrorMessage } from "@/lib/deck/edit/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ページの本文を、ブラウザから直すための口（取り寄せと保存）。
 *
 * 名乗り方は currentIdentity（画面のログインも投稿の鍵も同じ口）。入口に
 * `ownerFromRequest` を書き足さない——鍵も `currentIdentity` が読む。直せるのは
 * そのページの持ち主の側（管理者・作った人・共同の作った人）だけで、可否の正本は
 * src/lib/access/access.ts の `canEditPage` ただ 1 つ。ボタンを出すかの旗（/api/comments の
 * `features.edit`）も同じ述語を通るので、出るのに通らないボタンは生まれない。
 *
 * 保存は投稿とまったく同じ積み方（`commitRevision`）を通る。版の目印の計算・
 * 同じ本文なら積まない冪等・同時投稿の検知（RevisionRaceError）を、ここで
 * 作り直さない。**見せ方（visibility）はここでは一切触らない**（変える口は
 * 共有範囲の画面ただ 1 つ）。
 *
 * 直せない人には「無い」と返す（404）。403 にすると、そのページがあることと、
 * 自分が持ち主でないことの 2 つを教えてしまう（共有範囲の口と同じ流儀）。
 */

type EditSourceResponse = {
  pageSlug: string;
  /** 保管庫にあるままの本文。保存はこれを土台に組み立てる */
  html: string;
  /**
   * 見たまま確かめるための本文。`<base>` と自前の vendor へ差し替えたもので、
   * **保存の土台にはしない**（差し込みが正本に焼き付いてしまう）。
   */
  previewHtml: string;
  /** いま出ている版の目印。保存のときに送り返し、すれ違いをここで見つける */
  baseVersionId: string | null;
  title: string;
};

type EditSaveResponse = {
  versionId: string;
  shortVersionId: string;
  versionNumber: number;
  changeCount: number | null;
  title: string;
  /** 中身が前と同じで、新しい版を積まなかったか */
  unchanged: boolean;
};

const MB = 1024 * 1024;
/** 本文の上限。投稿の口（/api/pages）と同じ 5MB。 */
const MAX_HTML_BYTES = 5 * MB;

/** いま出ている本文を、直すために取り寄せる。 */
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/pages/edit", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("toolbox.server.loginRequired"), 401);

    const page = parsePageSlug(new URL(request.url).searchParams.get("page"));
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    try {
      const found = await loadEditable(organization, viewer, page.slug);
      if (!found.ok) return found.response;


      const html = await readHtmlOf(found.page);
      if (html === null) return jsonError(rt("toolbox.server.pageBodyMissing"), 404);

      /*
       * 見たまま確かめる用の本文は、配信と同じ差し込みをサーバーで済ませて渡す。
       * ブラウザ側に vendor の行き先や差し込みの決まりを書き写させない
       * （withAssetBase / withVendorScripts / withSafeAnchorIds が SSoT。AGENTS.md）。
       * ここに差し込むのは 3 つ——道具箱の札（withCommentsWidget）は入れない。
       * 直している画面の中でもう 1 つ道具箱が動き出すため。
       */
      const href = pageHrefOf(found.page.pageSlug);
      const previewHtml = withSafeAnchorIds(
        withVendorScripts(href === null ? withCleanCopyLook(html) : withAssetBase(withCleanCopyLook(html), href)),
      );

      const payload: EditSourceResponse = {
        pageSlug: found.page.pageSlug,
        html,
        previewHtml,
        baseVersionId: found.page.currentVersionId,
        title: found.page.title,
      };
      return jsonResponse(payload, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}

/** 直しに添える一言。投稿の口と同じ整え方（履歴の 1 行に収める）。 */
function editMessage(value: unknown): string {
  // 版に残す一言は日本語の正本の文のまま（履歴で出すときに訳す）
  if (typeof value !== "string" || value.trim().length === 0) return defaultTranslate("toolbox.server.edit.defaultMessage");
  return humanMessage(value).replace(/\s+/g, " ").trim().slice(0, PUBLISH_MESSAGE_MAX_LENGTH);
}

/** 直した本文を、新しい版として積む。 */
export async function PUT(request: Request): Promise<Response> {
  return routeLog("/api/pages/edit", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("toolbox.server.loginRequired"), 401);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("toolbox.server.unreadableBody"), 400);
    }
    const record: Record<string, unknown> =
      typeof payload === "object" && payload !== null && !Array.isArray(payload) ? { ...payload } : {};

    const page = parsePageSlug(record["page"]);
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    const rawHtml = record["html"];
    if (typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
      return jsonError(rt("toolbox.server.edit.emptyHtml"), 400);
    }
    if (Buffer.byteLength(rawHtml, "utf8") > MAX_HTML_BYTES) return jsonError(rt("toolbox.server.edit.tooLarge"), 400);
    let html = rawHtml;
    if (record["deckCustomization"] !== undefined) {
      const customization = deckCustomizationSchema.safeParse(record["deckCustomization"]);
      if (!customization.success) return jsonError(rt("toolbox.server.edit.badCustomization"), 400);
      try {
        if (customization.data.appearance !== undefined) {
          html = withDeckOverrides(html, customization.data.appearance);
        }
        html = withDeckCustomization(html, customization.data);
      } catch {
        return jsonError(rt("toolbox.server.edit.customizationUnsaved"), 400);
      }
    }
    if (record["deckAppearance"] !== undefined) {
      const appearance = deckOverridesSchema.safeParse(record["deckAppearance"]);
      if (!appearance.success) return jsonError(rt("toolbox.server.edit.badAppearance"), 400);
      try { html = withDeckOverrides(html, appearance.data); }
      catch { return jsonError(rt("toolbox.server.edit.appearanceUnsaved"), 400); }
    }
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes > MAX_HTML_BYTES) {
      return jsonError(rt("toolbox.server.edit.tooLargeSized", { size: Math.round(bytes / MB) }), 400);
    }

    /*
     * どの版を土台に直したかは必ず言ってもらう。無しでも積めてしまう形にすると、
     * 別の人の直しの上へ、それを見ていない本文が黙って乗る（後勝ちの上書き）。
     */
    const baseVersionId = record["baseVersionId"];
    if (typeof baseVersionId !== "string" || baseVersionId.trim().length === 0) {
      return jsonError(rt("toolbox.server.edit.baseRequired"), 400);
    }

    try {
      readDeckDesignHtml(html);
      const found = await loadEditable(organization, viewer, page.slug);
      if (!found.ok) return found.response;

      const collaborativeStore=deckEditStore(found.page,viewer);
      const head=await collaborativeStore.read();
      if(head.collaboration){
        if(record["protocol"]!==2)return jsonError(rt("toolbox.server.edit.protocol"),409);
        const base=await collaborativeStore.readVersion?.(baseVersionId.trim());
        if(!base?.collaboration||rawHtml!==base.html)return jsonError(rt("toolbox.server.edit.collaboration"),409);
        const names:Array<"appearance"|"focus"|"logo">=["appearance","focus","logo"];
        const changes:DeckEditOperation[]=names.flatMap(name=>{
          const before=deckSourceSetting(base.html,name),after=deckSourceSetting(html,name);
          return before===after?[]:[{kind:"setting",target:"deck-document",name,before,after}];
        });
        let operations:DeckEditOperation[];
        try{operations=deckEditRecordOperationsSchema.parse(refineDeckOperations(base.html,changes,{settingsBatch:true}));}
        catch{return jsonError(rt("toolbox.server.edit.tooManySettings"),400);}
        const digest=createHash("sha256").update(JSON.stringify({author:viewer.email,base:baseVersionId,operations})).digest("hex");
        const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
        const saved=operations.length?await saveDeckOperations(collaborativeStore,{id,author:viewer.email,operations,baseVersionId:baseVersionId.trim(),client:"browser",protocol:2,epoch:base.collaboration.epoch,summary:editMessage(record["message"])}):head;
        return jsonResponse({versionId:saved.versionId,shortVersionId:saved.versionId.slice(0,7),versionNumber:saved.versionNumber,changeCount:null,title:found.page.title,unchanged:operations.length===0},200);
      }


      /*
       * 土台と比べるのは、元から壊れている古いページの編集を封じないため。
       * 増えていなければ通す。保存は稀なので、ここで本文をもう 1 度引く往復は許す。
       */
      const baseHtml = (await readHtmlOf(found.page)) ?? "";
      const added = addedIssues(findHtmlIssues(baseHtml), findHtmlIssues(html));
      if (added.length > 0) {
        return jsonError(rt("toolbox.server.edit.htmlIssues", { issues: describeIssues(added, requestTranslate()) }), 400);
      }

      /*
       * すれ違いの照合は commitRevision の 1 か所に寄せる（expectedHead）。
       * ここで currentVersionId と突き合わせないのは、あれが「版だけ入って
       * 目印が古い」状態で頭の版とずれうるから——頭の版で照合するほうが正確。
       */
      let result: CommitResult;
      try {
        result = await commitRevision({
          organization: found.page.organization,
          pageSlug: found.page.pageSlug,
          html,
          message: editMessage(record["message"]),
          // 書いた人はサーバーが持っている名乗りから採る（申告は受け付けない）
          author: { email: viewer.email, name: viewer.name },
          expectedHead: baseVersionId.trim(),
        });
      } catch (error) {
        if (error instanceof StaleBaseError) return jsonError(deckErrorMessage(error, requestTranslate()), 409);
        // RevisionRaceError の message は投稿（CLI）向けの文言なので、そのまま出さない
        if (error instanceof RevisionRaceError) {
          return jsonError(
            rt("toolbox.server.edit.race"),
            409,
          );
        }
        throw error;
      }

      const saved: EditSaveResponse = {
        versionId: result.versionId,
        shortVersionId: result.versionId.slice(0, 7),
        versionNumber: result.versionNumber,
        changeCount: result.changeCount,
        title: result.title,
        unchanged: result.unchanged,
      };
      return jsonResponse(saved, 200);
    } catch (error) {
      if(error instanceof DeckEditConflictError||error instanceof DeckEditRequestError)return jsonError(deckErrorMessage(error,requestTranslate()),409);
      if(error instanceof DeckEditBusyError)return jsonError(deckErrorMessage(error,requestTranslate()),503);
      if (error instanceof DeckDesignError) return jsonError(deckErrorMessage(error, requestTranslate()), 400);
      if (error instanceof DeckCustomizationError) return jsonError(deckErrorMessage(error, requestTranslate()), 400);
      return serverError(error);
    }
  });
}
