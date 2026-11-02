"use client";

import { useActionState, useEffect, useRef } from "react";

import { approveAction, type ApproveState } from "./actions";
import { CopyRow } from "../_components/copy-row";
import { ALERT, LIST, META, PRIMARY, ROW_LINK } from "../_components/styles";
import { SubmitButton } from "../_components/submit-button";
import { useT } from "../_components/i18n";

/**
 * 「許可する」の門と、そのあとの受け渡し。
 *
 * 押すまでは何も用意しない（用意するのは approveAction）。開いただけで用意していたころは、
 * リンクを踏ませるだけで待ち構えているパソコンへ名乗りが飛んでいた。
 *
 * 手元のときは、押したあとブラウザからターミナルへ 1 通だけ届ける。
 * 届けるものは URL に載せない。押した履歴に残ると、あとから同じ URL を開くだけで
 * 同じものが読めてしまう。だから本文（POST）で渡す。
 *
 * 渡し方は「画面ごと自分のパソコンへ移る」形（form の送信）にしてある。
 * 画面に居たまま裏で送る形（fetch）も試したが、いまのブラウザは
 * **外のページから自分のパソコンへ出す通信に、その都度の許可を求める**
 * （Chrome 151 で実測。許可の問い合わせが出て、答えるまで送信が止まる）。
 * ログインのたびに知らない確認が出るのは避けたいので、確認の要らない
 * 「移る」形を正面にした。移った先の短い知らせは、待っていたプログラムが返す。
 *
 * クラウドのときは手元へ送らない。許可した名乗りは郵便受けへ置き、
 * クラウド環境が取りに来る。画面には中身を描かない。ただしクラウド環境は
 * 起動のたびにまっさらで届けた分が残らないので、**「コピー」ボタンだけ**置く。
 * 押すと中身がそのまま手元に写り、自分だけの Secrets（PAGES_TOKEN）に貼れば
 * 次のクラウド環境からは聞かれなくなる。値を文字として画面に出す描き方はしない
 * （出せばスクリーンショットや画面共有に残る。コピー先は本人のクリップボードだけ）。
 *
 * 用意できたら自分で送る。うまく動かない場面のために同じ送信をするボタンも置いてある
 * （見えるのはほんの一瞬）。
 */

/** まだ押していない状態。 */
const BEFORE: ApproveState = { kind: "idle" };

function assertNever(value: never): never {
  throw new Error(`未対応の状態です: ${String(value)}`); // i18n-keep: 型で塞いだ分岐に来たときだけの内部の失敗（画面には出ない）
}

/**
 * 保存先の画面。ターミナルが名乗った環境の名前で選ぶ。
 *
 * 名前は URL から来る（外から書ける）ので、**行き先はここに書いた 2 つだけ**にする。
 * 受け取った文字をリンクの宛先に混ぜると、この画面が他所へ人を送る道具になる。
 */
const SECRETS_PAGES = [
  { match: "Cursor", label: "cursor.com/dashboard/cloud-agents", url: "https://cursor.com/dashboard/cloud-agents" },
  { match: "Claude", label: "claude.ai/settings/profile", url: "https://claude.ai/settings/profile" },
] as const;

function secretsPageFor(computer: string): (typeof SECRETS_PAGES)[number] | null {
  return SECRETS_PAGES.find((one) => computer.startsWith(one.match)) ?? null;
}

/** Secrets に入れる名前。この名前で環境変数として届く（bin/pages-publish が読む名前）。 */
const SECRET_NAME = "PAGES_TOKEN";

/** 投稿先の組織を選ぶ Secrets の名前（bin/pages-publish が読む名前）。鍵は組織に縛られているので、組み合わせて貼る。 */
const ORGANIZATION_SECRET_NAME = "PAGES_ORG";

/** 値の代わりに出す伏せ字。長さは伝えない（長さも手がかりになる）。 */
const MASKED_VALUE = "••••••••••••••••";

/**
 * 次のクラウド環境で聞かれないようにするための、Secrets への保存。
 *
 * 貼る先（Cursor の Secrets）は「名前」と「値」の 2 つを入れる欄なので、
 * **画面もその 2 つで出す**。文章で「PAGES_TOKEN として保存します」と書くだけだと、
 * 名前を手で打ち直すことになり、打ち間違いに気づけない。
 *
 * 値は画面に出さない（出した瞬間、スクリーンショットや画面共有に残る）。
 * 出るのは伏せ字だけで、クリップボードには本物が入る。
 *
 * 保存先の URL も出す。「Secrets に保存」と言われても、どこを開くのかが
 * 分からないと手が止まる（実際にそう言われた）。別のタブで開く——ここで
 * 画面を離れると、コピーし直しにこのページへ戻れない。
 */
function CopyForSecrets({ secret, computer, organizationSlug }: { secret: string; computer: string; organizationSlug: string | null }) {
  const t = useT();
  const where = secretsPageFor(computer);
  // 太字とリンクを文の途中に置く。語順は言語ごとに違うので、差し込みの印の所で文を割って描く
  const [ownBefore, ownAfter] = t("auth.cliLogin.secretsOwn").split("{own}");
  const [savedBefore, savedAfter] = t("auth.cliLogin.savedAt").split("{link}");

  return (
    <div className="mt-6">
      <p className="text-sm">{t(organizationSlug === null ? "auth.cliLogin.secretsIntro" : "auth.cliLogin.secretsIntroOrganization")}</p>
      <p className="mt-2 text-sm">
        {ownBefore}
        <strong>{t("auth.cliLogin.secretsOwnStrong")}</strong>
        {ownAfter}
      </p>
      <div className={`mt-2 ${LIST}`}>
        <CopyRow label={t("auth.cliLogin.secretName")} value={SECRET_NAME} name={t("auth.cliLogin.secretNameCopy")} />
        <CopyRow
          label={t("auth.cliLogin.secretValue")}
          value={secret}
          display={MASKED_VALUE}
          name={t("auth.cliLogin.secretValueCopy")}
          failNote={t("auth.cliLogin.copyFailed")}
        />
      </div>
      {/*
        最初の組織 以外の組織の鍵は、その組織の宛先でしか名乗れない。投稿コマンドが宛先を選べるように、組織の呼び名も一緒に貼る。
        呼び名は秘密ではないので、そのまま見せる。
      */}
      {organizationSlug !== null ? (
        <div className={`mt-4 ${LIST}`}>
          <CopyRow label={t("auth.cliLogin.secretName")} value={ORGANIZATION_SECRET_NAME} name={t("auth.cliLogin.organizationNameCopy")} />
          <CopyRow label={t("auth.cliLogin.organizationValue")} value={organizationSlug} name={t("auth.cliLogin.organizationValueCopy")} />
        </div>
      ) : null}
      {where !== null ? (
        <p className={`mt-4 ${META}`}>
          {savedBefore}
          <a href={where.url} target="_blank" rel="noreferrer" className={ROW_LINK}>
            {where.label}
          </a>
          {savedAfter}
        </p>
      ) : null}
    </div>
  );
}

export function Handoff({
  target,
  handshake,
  email,
  computer,
  organizationSlug,
}: {
  target: string | null;
  handshake: string;
  email: string;
  computer: string;
  /** 最初の組織 以外の組織の呼び名（Secrets に PAGES_ORG として一緒に貼る）。最初の組織 は null */
  organizationSlug: string | null;
}) {
  const [state, approve] = useActionState(approveAction, BEFORE);
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  /** 送るのは 1 回だけ。開発中は同じ処理が 2 度走るので、ここで止める。 */
  const sent = useRef(false);

  useEffect(() => {
    if (state.kind !== "ready") return;
    if (target === null) return;
    if (sent.current) return;
    sent.current = true;
    form.current?.submit();
  }, [state, target]);

  switch (state.kind) {
    case "ready":
      if (target === null) {
        return <p className="text-sm">{t("auth.cliLogin.approvedChat")}</p>;
      }
      return (
        <>
          <p className="text-sm">{t("auth.cliLogin.returning")}</p>
          {/*
            値は隠しの入力（本文）で渡す。URL にも履歴にも残らない。
          */}
          <form ref={form} method="post" action={target} className="mt-6">
            <input type="hidden" name="state" value={handshake} />
            <input type="hidden" name="token" value={state.secret} />
            <input type="hidden" name="email" value={email} />
            {/*
              この画面の宛先（ブラウザが開いている宛先そのもの）。ターミナルは、届いた鍵をこの宛先の鍵として控える
              （鍵は宛先の組織に縛られる）。ここは押したあとにだけ描くので、ブラウザの値を読める。
            */}
            <input type="hidden" name="origin" value={window.location.origin} />
            <button type="submit" className={PRIMARY}>
              {t("auth.cliLogin.continue")}
            </button>
          </form>
        </>
      );
    case "sent":
      return (
        <>
          <p className="text-sm">{t("auth.cliLogin.approvedPublish")}</p>
          <CopyForSecrets secret={state.secret} computer={computer} organizationSlug={organizationSlug} />
        </>
      );
    case "idle":
    case "failed":
      return (
        <>
          {/*
            何をする画面かと、心当たりがない人の逃げ道は、押す前にだけ出す
            （押したあとは、これからの話ではなく済んだ話になる）。
            2 行目は灰色に落とさない。頼んでいない人にとって唯一の身の守り方で、
            投稿の権限を渡す画面なので、読み飛ばされると取り返しがつかない。
            断りの文は手元でもクラウドでも同じにする（同じ危なさなので言い分けない）。
          */}
          <p className="text-sm">
            {target === null ? t("auth.cliLogin.fromCloud") : t("auth.cliLogin.fromComputer")}
          </p>
          <p className="mb-6 mt-2 text-sm">{t("auth.cliLogin.ignore")}</p>
          {/*
            押して初めて用意する。だから GET（開くだけ・戻るだけ）では何も起きない。
            ターミナルが送ってきたパソコンの名前は、一覧で見分けるためだけに持って回る。
            クラウドのときは合図も一緒に送り、郵便受けへ置く先を間違えないようにする。
            デスクトップのときはその印も送り、用意した中身を画面へ返させない。
          */}
          <form action={approve}>
            <input type="hidden" name="name" value={computer} />
            {target === null ? <input type="hidden" name="state" value={handshake} /> : null}
            <SubmitButton idle={t("auth.cliLogin.approve")} busy={t("auth.cliLogin.approving")} className={PRIMARY} />
          </form>

          {state.kind === "failed" ? (
            <p className={`mt-4 ${ALERT}`}>{t("auth.cliLogin.failed")}</p>
          ) : null}
        </>
      );
    default:
      return assertNever(state);
  }
}
