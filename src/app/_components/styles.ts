/**
 * 画面で使い回す見た目の語彙。正本の説明は DESIGN.md にある。
 *
 * 同じ役割に別の値を書くと、画面ごとに少しずつ違う UI ができあがる。
 * 新しい見た目が要ると思ったら、まずここに同じ役割のものが無いかを見る。
 * 値そのものは Tailwind の目盛りだけを使い、リテラル（8px 等）を書かない。
 *
 * 文字の序列（上ほど強い＝大きい・濃い）。見出しは、その中身のどの行よりも必ず強い。
 *
 *   TITLE            20 太 濃     画面の名前（h1）
 *   ─────────────────────────────
 *   SECTION_HEADING  16 太 濃     節の見出し（h2）
 *     SECTION_NOTE   14    灰       └ その節が何のためにあるかの 1 行
 *     DETAIL_TITLE   14 太 濃     詳細面の題（h3。選んだページ・グループの名前）
 *     SUBHEADING     14 太 灰     行のかたまりのラベル（h3）
 *       ROW_TITLE    14 中太 濃     └ 行の 1 行目（人の名前・ページ名）
 *       ROW_LINK     14 中太 濃     └ 同じ強さのまま押せる（hover で濃さが動く）
 *       META         12    灰       └ 行の 2 行目と補足（アドレス・日時・件数）
 *
 * 強さは 大きさ → 太さ → 濃さ の順で効く。だから 16 の濃い見出し（SECTION_HEADING）は、
 * 14 中太の行（ROW_TITLE）より必ず強く見える。灰色にすると、この序列が引っくり返る。
 */

// --- 文字の目盛り -----------------------------------------------------------

/**
 * 画面の名前（h1）。1 画面に 1 つ。
 *
 * 下の余白は節の見出しと同じ mb-2。題のすぐ下には必ず説明の 1 行が来るので、
 * その間合いを画面ごとに手で足すと、同じ形なのに 4px と 8px に割れる（実際に割れた）。
 */
export const TITLE = "mb-2 text-xl font-semibold tracking-tight";

/**
 * 節の見出し（h2）。中身のどの行より必ず強い（大きく・濃く）。
 *
 * 濃さを書かない＝既定の濃さ（本文と同じ）。ここで灰色にすると、下に並ぶ行の名前
 * （ROW_TITLE・14 中太の濃色）のほうが強く見え、見出しと中身の上下が逆さになる。
 */
export const SECTION_HEADING = "mb-2 text-base font-semibold";

/**
 * 読み飛ばしてよい灰色の 1 行。次の 3 つに使う。
 *
 *   ・節の説明   … 見出しの直下で「何のための節か」を言う（見出しは名前しか言えない）
 *   ・空の案内   … 「まだありません。」中身が 0 件のときに、行の代わりに置く
 *   ・終わりの報告 … 「ログアウトしました。」押した結果が、その場から消えたときだけ
 *
 * どれも「読まなくても操作できる」ものなので灰色。読ませたい文（確認・注意書き）は
 * ここではなく素の text-sm（既定の濃さ）で書く。灰色は読み飛ばしてよいの合図なので、
 * 身の守り方を伝える文に使うと、いちばん読ませたいものが薄くなる。
 */
export const SECTION_NOTE = "mb-4 text-sm text-neutral-500 dark:text-neutral-400";

/**
 * 行のかたまりのラベル（h3）。節の中の小見出し。
 *
 * 大きさは行と同じ 14 のまま、太さと灰色で「これは中身ではなく札だ」と分ける。
 * 節の見出しから 1 段引くのが役目なので、ここを濃くしない。
 */
export const SUBHEADING = "mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400";

/**
 * 台帳の詳細面の題（h3。選んだページやグループの名前）。
 *
 * 節見出し（16）より一段引き、同じ 14 の小見出し（太字・灰）とは濃さで勝つ。
 * 中身の行（14 中太）より太さで強い。詳細面の中の序列はこの題が頭。
 *
 * 下の余白はほかの見出しと同じ mb-2。題のすぐ下には持ち主や人数の 1 行が来るので、
 * その間合いを画面ごとに足すと、同じ形の題が画面ごとに違う詰まり方になる。
 */
export const DETAIL_TITLE = "mb-2 text-sm font-semibold";

/** 行の 1 行目（主役の文字。人の名前・ページ名）。 */
export const ROW_TITLE = "text-sm font-medium";

/**
 * 行の 1 行目が押せるとき（詳細の中のページ名・グループ名）。濃いまま、hover で濃さが動く。
 *
 * **下線は引かない**（DESIGN.md 7 章）。押せることは指を乗せたときの濃さの変化で示す。
 * 下線はこの製品では赤入れ（追加された文）の記号として予約されている。
 *
 * 押せる印を色や薄さで出さない。目次の「選んでいない行」（灰）を流用すると、
 * 行の 1 行目が主役でなくなり、その下の補足と見分けが付かなくなる。
 * 高さは持たない——行の高さは行の側が持つ（ROW_TITLE と同じ理由）。
 */
export const ROW_LINK =
  "text-sm font-medium transition-colors hover:text-neutral-600 dark:hover:text-neutral-300";

/**
 * 行の 2 行目と補足（アドレス・日時・件数）。
 *
 * 主役の下に添えるものなので、1 段小さく・灰色にして、目が滑るようにする。
 */
export const META = "text-xs text-neutral-500 dark:text-neutral-400";

// --- 色と部品 ---------------------------------------------------------------

/**
 * 控えめなボタン・リンク（一覧のログアウトと同じ見た目）。
 *
 * **下線は引かない**（DESIGN.md 7 章）。押せることは hover で濃くなることだけで示す。
 *
 * 暗い背景では 1 段明るくする。同じ neutral-500 でも、白地なら地と 4.6 : 1 で足りるが、
 * 黒地だと 4.17 : 1 まで落ちて本文として読めなくなる（400 まで上げると 7.8 : 1）。
 *
 * after: の 3 つは、字の並びを動かさずに押す的だけを上下 4px ずつ広げるため
 * （12px の字のままだと的の高さが 16px しか無い）。余白で広げると、置いた側の mt- と
 * 足し算になって間隔が動く。DANGER も同じ。
 */
export const QUIET =
  "relative cursor-pointer text-xs text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100 after:absolute after:inset-x-0 after:-inset-y-1";

/** 取り返しのつかない操作だけ、文字を赤にする（塗りにはしない・下線も引かない）。 */
export const DANGER =
  "relative cursor-pointer text-xs text-red-700 transition-colors hover:text-red-900 disabled:opacity-50 dark:text-red-300 dark:hover:text-red-100 after:absolute after:inset-x-0 after:-inset-y-1";

/**
 * 確かめた結果が通ったことの 1 語（14 並 緑）。機能色の「緑＝成功」を使ってよいのはここだけ（連携の鍵の「確かめる」）。
 * 帯にも塗りにもしない（通ったことは読み飛ばしてよい 1 語で足りる。断りの `ALERT` とだけ対にする）。
 */
export const SUCCESS = "text-sm text-green-700 dark:text-green-300";

/** ログイン失敗と同じ赤い帯（src/app/signin/page.tsx）。 */
export const ALERT =
  "rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300";

/**
 * 主要ボタン（塗り）。1 画面に 1 か所まで。
 *
 * 形と色は共通の部品（src/app/globals.css の .ws-button / .ws-primary）が持つ。高さ 32px
 * （指で押す画面では 44px）・角丸 6px・墨の塗り。ここで値を書き直さない——ワークスペースの
 * 中と外で、同じ塗りのボタンが 2 通りの寸法になっていたのを 1 つに寄せた。
 */
export const PRIMARY = "ws-button ws-primary";

// --- 外枠と入れ物 -----------------------------------------------------------

/** 画面の外枠。 */
export const PAGE = "mx-auto max-w-3xl px-6 py-12";

/** 広い外枠（2 ペインの台帳を持つ画面）。読む列が 2 本並ぶぶんだけ広い。 */
export const PAGE_WIDE = "mx-auto max-w-5xl px-6 py-12";

/**
 * 作成画面の外枠。見本のために幅を取り、上下の操作と一つのスクロール領域を分ける。
 *
 * 高さは画面いっぱいから環境の帯のぶんを引いたもの（h-app・src/app/globals.css）。
 * h-dvh のままだと、帯が出る宛先でだけ下の操作が画面の外へ押し出される。
 */
export const PAGE_WORKSPACE = "mx-auto flex h-app w-full max-w-7xl flex-col px-6 py-6";

/**
 * 狭い外枠（ログイン系）。知らせが 1 つだけの画面を、縦の真ん中に置く。
 *
 * 上に詰めると、広い画面では文字が天井に貼り付いて下が全部余白になる。
 * ここだけ縦中央なのは、読むものが 1 つしか無く、探す動きが要らないから。
 */
export const PAGE_NARROW = "mx-auto flex min-h-app max-w-sm flex-col justify-center px-6";

/** 一覧の区切り線。行と行の間だけに引く（囲まない）。 */
export const LIST = "divide-y divide-neutral-200 dark:divide-neutral-800";

/**
 * 打ち込み口（input・select・textarea）。
 *
 * 形は共通の部品（src/app/globals.css の .ws-field）が持つ。高さは主要ボタンと同じなので、
 * 横に並べても上下がそろう。余白は持たない——置く場所の側が決める。
 */
export const FIELD = "ws-field";

/**
 * そのまま貼る 1 行（コマンド・設定の名前）。
 *
 * **この製品で面（塗り）を敷く唯一の場所。** 地の文と同じ見た目だと、どこからどこまでを
 * 貼るのかが分からない（「pages-publish login を実行します」の文中から、人はコマンドの
 * 境目を読み取れない）。等幅にするのも同じ理由で、記号と空白を 1 文字ずつ確かめられる形に
 * するため。読ませる文には使わない——面は「ここは字面のまま扱う」の合図に取ってある。
 *
 * 折り返さずに横だけ動かす。コマンドは 1 行として読ませたいので、途中で改行させない。
 */
export const CODE =
  "block overflow-x-auto whitespace-pre rounded-md bg-neutral-100 px-3 py-2 font-mono text-sm dark:bg-neutral-900";
