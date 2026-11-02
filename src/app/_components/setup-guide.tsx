import { SETUP_PROBLEMS, setupProblemTitle, type SetupProblem } from "@/lib/settings/setup-error";
import { serverTranslate } from "@/lib/i18n/server";
import { CODE, PAGE, SECTION_HEADING, SECTION_NOTE, TITLE } from "./styles";

/**
 * 配布版の設置が足りないときに、どの画面の代わりにも出す案内。
 * 出すのは足りないものの種類・設定の名前・導入ガイドの章だけで、値と接続先は出さない。
 * 言語が読めない（保存先に繋がらない）ときは、ブラウザの言語か日本語で出す（`serverTranslate` が投げない）。
 */
export async function SetupGuide({ problem }: { problem: SetupProblem }) {
  const t = await serverTranslate();
  const guide = SETUP_PROBLEMS[problem.kind];
  const title = setupProblemTitle(problem.kind, t);
  return (
    <main className={PAGE}>
      <h1 className={TITLE}>{t("errors.setup.title")}</h1>
      <p className={SECTION_NOTE}>{t("errors.setup.intro")}</p>

      <h2 className={SECTION_HEADING}>{title}</h2>
      {problem.names && problem.names.length > 0 ? (
        <>
          <p className={SECTION_NOTE}>{t("errors.setup.missingNames")}</p>
          <pre className={`mb-4 ${CODE}`}>{problem.names.join("\n")}</pre>
        </>
      ) : null}
      <p className={SECTION_NOTE}>{t("errors.setup.openGuide", { chapter: guide.chapter })}</p>

      <h2 className={SECTION_HEADING}>{t("errors.setup.checkLocally")}</h2>
      <p className={SECTION_NOTE}>{t("errors.setup.checkLocallyDetail")}</p>
      <pre className={CODE}>node --env-file=.env.setup scripts/setup/personal.mjs doctor</pre>
    </main>
  );
}

