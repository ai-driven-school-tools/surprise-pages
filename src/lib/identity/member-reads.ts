import { cache } from "react";
import { z } from "zod";
import { orgDb } from "../db/database";
import type { OrganizationScope } from "../organization/scope";
import { normalize } from "../access/rows";

/**
 * 本人まわりの小さな問い合わせ 13 本を、画面を描く 1 回の中で 1 回にまとめて読む（保存先の関数 `org_workspace_member_reads`・組織で絞る）。
 *
 * 本番の保存先は HTTP の受け口経由で、同時に 10 本以上を投げると 1 本ずつが単独のときの 5〜10 倍に伸びる
 * （docs/design/app-speed.md の「本番で分かったこと」）。一覧の画面は描くたびに、管理者か・個人設定・星・記録を残さない・名簿・
 * 議事録の材料・共有された録音・GitHub のつながり・登録の名前・読めるの覚え・覚えを捨てた回数・最後の知らせ・ページの一覧の終わりの目印、を
 * 同時に読んでいたので、これを 1 本にする。
 *
 * - **関数は判定しない。** 返すのは今までと同じ条件の行だけで、使う側（各欄の括弧の関数）が今までどおり判定する。
 * - **使うのは画面を描く 1 回の中だけ**（React の cache が効いているとき）。窓口・配信の口では毎回 1 本ずつ読む——
 *   1 つの欄のために 12 本分を読ませない。
 * - 読めなかった・形が違う・件数が多すぎる欄は `null`。使う側はそのとき今までの読み方に戻る（関数を当てる前の保存先でも動く）。
 */

const ROWS_LIMIT = 1000;

const grantRow = z.object({ page_id: z.string(), role: z.unknown(), added_at: z.string().nullable(), via_group: z.boolean() });
const memoryRow = z.object({
  repository_id: z.coerce.number().int().positive(),
  github_user_id: z.coerce.number().int().positive(),
  full_name: z.string(),
  branch: z.string(),
  asked_at: z.string(),
});

/** 欄ごとに確かめる（1 つの欄の形が違っても、ほかの欄は使う）。 */
const fields = {
  admin: z.boolean(),
  preferences: z.object({
    appearance: z.unknown(), locale: z.unknown(),
  }).nullable(),
  favorites: z.array(z.string()).max(ROWS_LIMIT - 1),
  view_optout: z.boolean(),
  grants: z.array(grantRow).max(ROWS_LIMIT - 1),
  recording_sources: z.array(z.unknown()).max(ROWS_LIMIT - 1),
  recording_grants: z.array(z.object({ recording_id: z.unknown(), member_email: z.unknown(), artifact: z.unknown() })).max(ROWS_LIMIT - 1),
  github_link: z.object({ github_user_id: z.coerce.number().int().positive(), refresh_expires_at: z.string(), revoked_at: z.string().nullable() }).nullable(),
  catalog: z.array(z.object({ repository_id: z.coerce.number().int().positive(), full_name: z.string() })),
  access_memory: z.array(memoryRow),
  access_generation: z.coerce.number().int().nonnegative().nullable(),
  latest_delivery: z.string().nullable(),
  last_page_id: z.string().nullable(),
};

type Fields = typeof fields;
/** 欄ごとの答え。`undefined` は「この欄はまとめて読めなかった」（使う側は今までの読み方に戻る）。 */
export type MemberReads = { readonly [K in keyof Fields]?: z.infer<Fields[K]> };

const body = z.record(z.string(), z.unknown());
/** 保存先へ HTTP で聞くと答えの物そのもの、直につなぐと `[{ org_workspace_member_reads: 物 }]` で返る。 */
const wrapped = z.tuple([z.object({ org_workspace_member_reads: body })]);

function picked<T>(result: { success: true; data: T } | { success: false }): T | undefined {
  return result.success ? result.data : undefined;
}

function parse(value: unknown): MemberReads | null {
  const inner = wrapped.safeParse(value);
  const found = inner.success ? { success: true as const, data: inner.data[0].org_workspace_member_reads } : body.safeParse(value);
  if (!found.success) return null;
  const at = found.data;
  return {
    admin: picked(fields.admin.safeParse(at["admin"])),
    preferences: picked(fields.preferences.safeParse(at["preferences"])),
    favorites: picked(fields.favorites.safeParse(at["favorites"])),
    view_optout: picked(fields.view_optout.safeParse(at["view_optout"])),
    grants: picked(fields.grants.safeParse(at["grants"])),
    recording_sources: picked(fields.recording_sources.safeParse(at["recording_sources"])),
    recording_grants: picked(fields.recording_grants.safeParse(at["recording_grants"])),
    github_link: picked(fields.github_link.safeParse(at["github_link"])),
    catalog: picked(fields.catalog.safeParse(at["catalog"])),
    access_memory: picked(fields.access_memory.safeParse(at["access_memory"])),
    access_generation: picked(fields.access_generation.safeParse(at["access_generation"])),
    latest_delivery: picked(fields.latest_delivery.safeParse(at["latest_delivery"])),
    last_page_id: picked(fields.last_page_id.safeParse(at["last_page_id"])),
  };
}

const load = cache(async (organization: OrganizationScope, email: string): Promise<MemberReads | null> => {
  const { data, error } = await orgDb(organization).rpc("org_workspace_member_reads", { p_email: email });
  if (error !== null) return null;
  return parse(data);
});

/** 画面を描く 1 回の中か（React の cache が効いていれば、同じ呼び出しが同じ物を返す）。 */
const requestScope = cache((): object => ({}));
export function insideRender(): boolean {
  return requestScope() === requestScope();
}

/**
 * まとめて読んだ答え。画面を描く 1 回の中でだけ返し（最初に呼んだ欄が読み始め、ほかの欄は同じ答えを待つ）、それ以外は `null`。
 * 使う側は `(await memberReads(email))?.<欄>` が `undefined` のとき、今までの読み方に戻る。
 */
export function memberReads(organization: OrganizationScope, email: string): Promise<MemberReads | null> | null {
  if (!insideRender()) return null;
  const pending = load(organization, normalize(email));
  pending.catch(() => undefined);
  return pending;
}

/** 1 つの欄だけを取り出す。まとめて読めなかったときは `undefined`。 */
export async function memberRead<K extends keyof Fields>(organization: OrganizationScope, email: string, key: K): Promise<MemberReads[K] | undefined> {
  const pending = memberReads(organization, email);
  if (pending === null) return undefined;
  try {
    return (await pending)?.[key];
  } catch {
    return undefined;
  }
}
