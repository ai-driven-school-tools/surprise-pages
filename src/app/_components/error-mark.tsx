import { useT } from "./i18n";
import { META } from "./styles";

/**
 * エラー画面に出す問い合わせの番号。Next がサーバーで起きた失敗に付ける照合用の番号（digest）で、
 * サーバーのログの同じ失敗の行（`fields.digest`）に残っている。失敗そのものに結び付いた値なので、
 * あとから届いた別の要求の番号と取り違えない。
 *
 * 画面の操作で起きた失敗には digest が無い（サーバーのログも無い）ので、何も出さない。
 * 置くのはエラー画面（ブラウザ側の部品）だけ。外枠の外（global-error）では日本語の辞書を引く。
 */
export function ErrorMark({ digest }: { digest: string | undefined }) {
  const t = useT();
  if (digest === undefined || !/^[0-9]{1,24}$/.test(digest)) return null;
  // 番号は等幅で置く。文の中の位置は言語で変わるので、辞書の {digest} の所で割る
  const [before = "", after = ""] = t("errors.digest").split("{digest}");
  return (
    <p className={META}>
      {before}
      <code>{digest}</code>
      {after}
    </p>
  );
}
