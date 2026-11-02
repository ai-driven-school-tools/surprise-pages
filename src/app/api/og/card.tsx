import {
  GROUND,
  INK,
  MARK_FOLD_PATH,
  MARK_ROUND,
  MARK_SHEET_PATH,
  MARK_VIEW_BOX,
  QUIET,
} from "@/lib/settings/brand";
import { siteName } from "@/lib/settings/site-settings";
import { drawableText } from "@/lib/pages/card-text";

/**
 * 共有したときに出る見出しカードの**額縁**。
 *
 * カードは 2 枚ある——公開ページの分（/api/og）と、社内ページの「ログインすると開けます」の分
 * （/api/og/locked）。別々に組み立てると余白も文字の大きさも少しずつ違う 2 枚ができるので、
 * 骨組みはここ 1 つに持たせ、中に入れる文字だけを渡してもらう。
 *
 * ## 字はここで描いてよい（日本語も出る）
 *
 * 絵を作る道具（next/og）は、束ねてある書体に無い字を見つけると、その**字だけ**を
 * 外から取り寄せて描く。だから日本語も出る。取り寄せるときに渡るのはその字の並びなので、
 * **中身に触れる字を渡してよいのは門なし公開ページだけ**。社内ページのカードには
 * 固定の文言しか入れない（決まりは src/lib/pages/og.ts と同じ筋）。
 *
 * ただし記号には取り寄せられないものがあり、黙って「□」になる。寄せ方は
 * src/lib/pages/card-text.ts に置いてある（何が出て何が出ないかを試した結果もあちら）。
 *
 * ## 見た目の決まり
 *
 * 色は 3 つだけ（地・墨・灰）で、どれも画面側と同じ値（src/lib/settings/brand.ts）。カードだけの
 * 色を作らない。識別に効かせるのは印 1 つに絞る——帯や罫線を足すと、印と役目が重なる
 * （DESIGN.md 3 章「識別色は 1 点に集中させる」）。
 */

export const CARD_SIZE = { width: 1200, height: 630 };

/** どこにも残さず作り直してよい絵ではないので、配信網には長めに持たせる。 */
export const CARD_CACHE = "public, max-age=300, s-maxage=86400";

/**
 * 絵の中の印。形は src/app/icon.svg と同じで、**色の当て方だけ逆**。
 *
 * タブの印は黒い面の中に白い紙を抜くが、ここでは白地に墨で紙を置く。面を敷くと、
 * 40px では紙が面の内側の 15/32 まで縮んで、折った角がただの汚れに見える。
 * 白地に直に置けば同じ 40px でも形が読める（面はタブのように地の色が
 * 分からない場所のためのもの）。
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEW_BOX}>
      <path
        d={MARK_SHEET_PATH}
        fill={INK.light}
        stroke={INK.light}
        strokeWidth={MARK_ROUND}
        strokeLinejoin="round"
      />
      <path
        d={MARK_FOLD_PATH}
        fill={GROUND.light}
        stroke={GROUND.light}
        strokeWidth={MARK_ROUND}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 絵に載せる形へ整える。**描ける形に寄せてから**長さを詰める。
 *
 * 順序が逆だと、落とす記号のぶんまで字数に数えて早く切ってしまう。
 *
 * 長さの頭打ちは行数（`WebkitLineClamp`）に任せない。あれは絵を作る道具の解釈に
 * 委ねることになるので、はみ出したときに**下段の印ごと押し出される**。
 * 字の数でも先に止めておけば、崩れ方が道具に左右されない。
 */
function fit(value: string, max: number): string {
  const text = drawableText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const TITLE_MAX = 60;
const SUMMARY_MAX = 90;

export type CardText = {
  /** 大きい字。公開ページならページの名前、社内ページなら固定の札 */
  title: string;
  /** その下の 1 行。無ければ置かない */
  summary: string | null;
};

/*
 * 縦は真ん中に寄せる。上下に振り分けると、札 1 行しか無い固定のカード
 * （/api/og/locked）で真ん中が丸ごと空いて、置き忘れのように見える。
 */
export function Card({ title, summary }: CardText) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "72px 80px",
        background: GROUND.light,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "block",
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.25,
            color: INK.light,
            letterSpacing: -1,
          }}
        >
          {fit(title, TITLE_MAX)}
        </div>
        {summary !== null ? (
          <div style={{ display: "block", fontSize: 28, lineHeight: 1.5, color: QUIET.light }}>
            {fit(summary, SUMMARY_MAX)}
          </div>
        ) : null}
      </div>
      {/* 印は名前と同じ重さで並べる（30px まで落とすと、折った角が消えてただの汚れに見えた） */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 56 }}>
        <Mark size={40} />
        <div style={{ fontSize: 24, color: QUIET.light }}>{siteName()}</div>
      </div>
    </div>
  );
}
