// i18n-keep-file: 定期実行（Vercel Cron）だけが呼ぶ口。工程の名前と断り文はログ・見張りと照合する内部の語で、人の画面に出ない
import { sweepVideoUploads } from "@/lib/deck/media/video-storage";
import { sweepAgentDrafts } from "@/lib/page-agent/service";
import { timingSafeEqual } from "node:crypto";

import { jsonError, jsonResponse } from "@/lib/api";
import { sweepOldPageViews, VIEW_RETENTION_DAYS } from "@/lib/pages/views";
import { logEvent, routeLog } from "@/lib/logging/server-log";
import type { OrganizationScope } from "@/lib/organization/scope";
import { everyOrganization } from "@/lib/organization/organizations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 見たページの控えを、古いほうから片付ける（1 日 1 回）。
 *
 * 定期実行の側が付ける合言葉（`CRON_SECRET`）を必ず照らし合わせる。呼び出しの時刻は `vercel.json` に書いてある。
 *
 * ## 合言葉が置かれていないときも断る
 *
 * 「設定が無ければ素通し」にすると、設定を入れ忘れた配置——つまり**いちばん気づきにくい手違い**——だけが全開になる。
 * 無い＝確かめようがない、なので断る側へ倒す。
 *
 * ## 消した件数をログに残す
 *
 * 定期実行は人が見ていないところで走るので、動いていないことに気づく手立てが他に無い。
 * ログは入口と同じ 1 つの形（`logEvent`）。片付けの名前は決まった語彙（`STEP_IDS`）で添える。
 */

/** ログに添える片付けの名前（応答の `failed` には人の読む名前を返す）。 */
const STEP_IDS = {
  "見たページの掃除": "page-views",
  "動画の一時データの掃除": "video-uploads",
  "変更案の整理": "agent-drafts",
} as const;

/** 長さの違いで中身を推測されない形で確かめる。 */
function matches(expected: string, seen: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(seen, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/cron/views", request, async () => {
    const secret = process.env["CRON_SECRET"];
    // 置かれていない＝確かめようがない。素通しにしない
    if (typeof secret !== "string" || secret.length === 0) {
      return jsonError("この口は合言葉が設定されていないので使えません", 401);
    }

    const given = request.headers.get("authorization");
    if (given === null || !matches(`Bearer ${secret}`, given)) {
      return jsonError("合言葉が違います", 401);
    }

    const failed: string[] = [];
    /** 片付けは互いに無関係なので、1 つが失敗しても残りは必ず走らせる。失敗はどの片付けかと理由をログに残し、応答は 500 のままにする。 */
    async function step<T>(name: keyof typeof STEP_IDS, run: () => Promise<T>, fallback: T): Promise<T> {
      try {
        return await run();
      } catch (error) {
        failed.push(name);
        // 文面は残さない（保存先の断り文には題名やアドレスが混ざる）。種類・場所・符号で足りる
        logEvent({ level: "error", event: "cron.step-failed", error, fields: { step: STEP_IDS[name] } });
        return fallback;
      }
    }

    // 組織に属する表の掃除は、組織で絞った口で消す（素の口では組織に属する表を触れない）
    const organizations = await everyOrganization();
    const eachOrganization = async (sweep: (organization: OrganizationScope) => Promise<number>): Promise<number> => {
      let count = 0;
      for (const organization of organizations) count += await sweep(organization);
      return count;
    };
    const removed = await step("見たページの掃除", () => eachOrganization((organization) => sweepOldPageViews(organization)), 0);
    if (!failed.includes("見たページの掃除")) {
      logEvent({ level: "info", event: "cron.swept", fields: { step: STEP_IDS["見たページの掃除"], count: removed, retentionDays: VIEW_RETENTION_DAYS } });
    }
    const temporaryVideoChunks = await step("動画の一時データの掃除", () => eachOrganization((organization) => sweepVideoUploads(organization)), 0);
    await step("変更案の整理", async () => { for (const organization of organizations) await sweepAgentDrafts(organization); }, undefined);
    if (failed.length > 0) {
      return jsonResponse({ error: "片付けの一部に失敗しました", failed, removed, temporaryVideoChunks }, 500);
    }
    return jsonResponse({ removed, temporaryVideoChunks }, 200);
  });
}
