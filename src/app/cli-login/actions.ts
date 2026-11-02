"use server";

import { redirect } from "next/navigation";

import { currentOrganization, type OrganizationScope } from "@/lib/organization/scope";
import { depositHandoff } from "@/lib/identity/cli-login-pending";
import { currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { defaultTranslate } from "@/lib/i18n/default";
import {
  issueToken,
  listTokens,
  revokeToken,
  tidyLabel,
  type TokenSummary,
} from "@/lib/identity/publish-tokens";

import { computerName, usableState } from "./handoff-target";

/**
 * 「許可する」を押したときだけ、このパソコン用の名乗りを 1 つ用意する。
 *
 * 画面を開いただけでは何も用意しない。開いた時点で用意していたころは、
 *   1. 見に行っただけ・戻るボタンを押しただけで一覧が増え続ける
 *   2. リンクを踏ませるだけで、待ち構えているパソコンへ名乗りを届けさせられる
 * の 2 つが起きていた。2 は、その場かぎりの合図（state）では防げない
 * （合図は「届け先が本人か」を何も保証しないため）。人が 1 回押すことだけが門になる。
 *
 * 用意したものは戻り値でだけ返す。cookie にも URL にも置かない。
 */

/**
 * ターミナルが名前を送ってこなかったときの呼び名（src/app/devices/page.tsx と同じ）。
 * 一覧の名前として保存先に残るので、**辞書の日本語の字のまま**置く（出すときに画面が訳す・localizeStored）。
 */
const UNNAMED = defaultTranslate("auth.devices.unnamed");

/**
 * 名乗りを用意できたかどうか。
 *
 * sent にも中身が乗る。クラウド環境は起動のたびにまっさらで届けた分が残らないため、
 * 本人が「コピー」を押して自分の Secrets に入れられるようにする（画面には描かない）。
 */
export type ApproveState =
  | { kind: "idle" }
  | { kind: "ready"; secret: string }
  | { kind: "sent"; secret: string }
  | { kind: "failed" };

/**
 * 同じパソコンの古いログインを、ログアウト済みにする。
 *
 * 一覧は「いま投稿できるパソコンの一覧」であってほしい。同じパソコンから入り直すたびに
 * 行が増えると、どれが生きているのか本人にも分からなくなり、1 台ログアウトさせても
 * 別の行がまだ通ってしまう。
 *
 * 名前が分からないときは何も片付けない。呼び名が同じというだけで、別のパソコンを
 * 巻き添えにしてログアウトさせてしまうため。
 *
 * 片付けに失敗しても投稿できる状態は壊れない（多いぶんには通る）ので、黙って進む。
 */
async function retireOlder(organization: OrganizationScope, email: string, label: string, keepId: string): Promise<void> {
  if (label === UNNAMED) return;

  let known: TokenSummary[];
  try {
    known = await listTokens(organization, email);
  } catch {
    return;
  }

  for (const one of known) {
    if (one.id === keepId) continue;
    if (one.revokedAt !== null) continue;
    // アプリの鍵は別の端末。同じ呼び名でも巻き添えにしない
    if (one.kind !== "publish") continue;
    if (one.label !== label) continue;
    try {
      await revokeToken(organization, one.id, email);
    } catch {
      // 1 台片付けそこねただけ。残りを続ける
    }
  }
}

/**
 * 押されたら用意する。
 *
 * 先に新しいものを用意してから、古いものを片付ける。順番を逆にすると、用意に失敗した
 * ときに「古いものは消えた・新しいものは無い」になり、そのパソコンから投稿できなくなる。
 */
export async function approveAction(
  _previous: ApproveState,
  form: FormData,
): Promise<ApproveState> {
  const organization = await currentOrganization();
  const viewer = await currentBrowserIdentity();
  if (!isMember(viewer)) redirect("/signin");

  const label = tidyLabel(computerName(form.get("name"))) || UNNAMED;
  const remote = usableState(form.get("state"));

  let issued: { token: string; summary: TokenSummary };
  try {
    issued = await issueToken(organization, { email: viewer.email, name: viewer.name }, label);
  } catch {
    return { kind: "failed" };
  }

  if (remote !== null) {
    let deposited = false;
    try {
      deposited = await depositHandoff(organization, remote, issued.token, viewer.email);
    } catch {
      return { kind: "failed" };
    }
    if (!deposited) return { kind: "failed" };
    await retireOlder(organization, viewer.email, label, issued.summary.id);
    return { kind: "sent", secret: issued.token };
  }

  await retireOlder(organization, viewer.email, label, issued.summary.id);

  return { kind: "ready", secret: issued.token };
}
