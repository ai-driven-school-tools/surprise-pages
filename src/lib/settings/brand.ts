/**
 * この置き場の印（マーク）と、印に使う色。
 *
 * ## 形の正本はここ 1 つ
 *
 * 同じ形を 3 か所で使う——ブラウザのタブに出る印（src/app/icon.svg）、iOS のホーム画面に
 * 並ぶ絵（src/app/apple-icon.tsx）、共有したときのカードの下段（src/app/api/og/card.tsx）。
 * 座標を写して回ると、1 か所だけ古い形が残っても誰も気づけない。
 *
 * `src/app/icon.svg` だけは Next の受け口の決まりで**実ファイルでなければならない**ので、
 * あちらには同じ道筋の文字列が書き写してある。ずれたら検査表が落ちる
 * （tests/checks/check-share.mjs の「印」の節）。
 *
 * ## なぜこの形か
 *
 * 「角を折った 1 枚の紙」。細い線を使わず**面だけ**で作ってあるのは、16px まで
 * 縮んだときに線が消えるため。色は地と墨の 2 つだけで、識別のための色は足さない
 * （DESIGN.md 3 章。色で意味を作らない）。
 */

/** 座標を決める枠。3 か所すべてこの枠で描く。 */
export const MARK_VIEW_BOX = "0 0 32 32";

/** 外枠（角丸の面）の丸み。 */
export const MARK_TILE_RADIUS = 7.5;

/**
 * 紙。右上が折った角のぶんだけ欠けている。
 *
 * 折る幅は紙の**半分**（16 のうち 8）。小さく控えると、16px まで縮んだときに折り目が
 * 消えてただの四角に見える——実際に 5 段の大きさで並べて見比べて決めた寸法。
 */
export const MARK_SHEET_PATH = "M8 5h8l8 8v14H8z";

/** 折った角。紙ではなく地と同じ色で塗ると、めくれて見える。 */
export const MARK_FOLD_PATH = "M16 5l8 8h-8z";

/**
 * 角を丸く見せるための縁の太さ。
 *
 * 塗りと同じ色で縁を引いて `stroke-linejoin="round"` を当てる。道筋の座標に
 * 丸みを書き込むより短くて、折った角の形（斜めの辺）も一緒に丸くなる。
 */
export const MARK_ROUND = 1.4;

/**
 * 墨・地・灰。**新しい値を作らない**——どれも src/app/_components/styles.ts と src/lib/access/no-access.ts が
 * すでに使っている neutral の写し。印やカードだけ別の黒にすると、画面と並べたときに濁る。
 *
 * 灰は「読み飛ばしてよい」の合図（DESIGN.md 3 章）。暗い側を 1 段明るくしてあるのも
 * 画面と同じ理由で、黒地では 500 のままだと本文として読めなくなるため。
 */
export const INK = { light: "#171717", dark: "#f5f5f5" } as const;
export const GROUND = { light: "#ffffff", dark: "#0a0a0a" } as const;
export const QUIET = { light: "#737373", dark: "#a3a3a3" } as const;

/**
 * 配信するページへ差し込む印の行き先。
 *
 * `src/app/icon.svg` を Next が配る道筋。`<link>` に付く `?...` は日付避けの飾りなので、
 * 差し込む側は素の道筋だけを書く（飾りが変わるたびに差し込む文字が変わってしまう）。
 */
export const ICON_HREF = "/icon.svg";
