/**
 * ウィジェットの見た目の値をまとめて決める 1 か所（SSoT）。
 *
 * 余白・文字の大きさ・角丸・色は、ここで名前を付けたものだけを使う。
 * 各所で `12px` のような素の値を書き足さないこと。揃わない UI はそこから始まる。
 *
 * 影の中（Shadow DOM）は CSS のカスタムプロパティで参照する。
 * ページ本体に直接付ける見た目（引用の印）だけは CSS が届かないので、
 * このファイルの下半分にある文字列を使う。
 */

/**
 * 横に送る・払って抜く動きの長さ（ミリ秒）。
 *
 * 見た目（CSS の移り変わり）と、抜けきってから片付けるまでの待ち時間は
 * 必ず同じ長さでなければならない。片方だけ変えると、抜けきる前に消える／
 * 消えたあとに残るのどちらかになるので、数はここ 1 か所だけに置く。
 */
import { EASE, EASE_SWIPE, MOTION } from "../../lib/settings/ui-motion";
import readingLayout from "../../templates/reading-layout.json";
import { TITLEBAR_HEIGHT_CSS } from "../../lib/workspace/window-titlebar";

export const SWIPE_MS: number = MOTION.swipe;

/** 読書用目次。本文 768 + 目次 256 + 間 48 + 外側 48 が並ぶ最小幅。 */
export const READING_LAYOUT = readingLayout;

/** 影の中で使うトークン。styles.ts の先頭に差し込む。 */
export const TOKENS = `
:host {
  /* 余白: 4 の倍数だけ。迷ったら 1 段大きいほうを選ぶ */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 40px;

  /* 文字の大きさ */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 13px;
  --font-md: 14px;
  --font-lg: 16px;
  /* 発表者ノートの字（部品の目盛りの外）。話しながら 1〜2 秒の一瞥で 1 文を拾うための「読ませる本文」で、
     使ってよいのは発表者画面のノートだけ。4 段から人と会場に合わせて選ぶ */
  --font-notes-1: 20px;
  --font-notes-2: 24px;
  --font-notes-3: 28px;
  --font-notes-4: 32px;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-bold: 600;

  --leading-tight: 1.35;
  --leading-normal: 1.6;

  /* 角丸 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-pill: 999px;

  /* 線の太さ。区切りは細いほう、目印は太いほう。この 2 種類だけ */
  --rule-thin: 1px;
  --rule-thick: 2px;

  /* 決まった大きさの部品 */
  --size-dot: 6px;
  --size-avatar: 24px;
  --size-control: 32px;
  --size-bar: 44px;
  --size-grip: 8px;
  --size-popover: 320px;
  --size-input-min: 72px;
  /* キーボードが出ている間の入力欄。16px の文字で 2 行ぶん */
  --size-input-compact: 64px;
  /* OS が下端に浮かせる帯（iOS Safari の URL の錠剤・入力補助の ∧∨✓）を
     よけておく高さ。あちらは測れないので、こちらが場所を空けて避ける */
  --size-os-strip: 56px;
  --size-scroll-max: 240px;
  /* 指で押す的の最小の大きさ。見た目が控えめな文字でも、ここまでは余白で広げる */
  --size-touch: 44px;
  /* チェックの四角。13px の文字とつり合い、指でも狙える最小のところ */
  --size-check: 18px;
  /* 1 つだけ選ぶ印の、中の点。四角のチェックと同じ枠の中に収める */
  --size-radio-dot: 8px;
  /* 触れている間だけ出る吹き出しの上限。小窓（320px）の中に収まる幅 */
  --size-bubble-max: 220px;

  /* 動きの長さと減速。正本は src/lib/settings/ui-motion.ts（DESIGN.md 12 章）。数字を直に書かない */
  --duration: ${MOTION.quick}ms;
  --duration-base: ${MOTION.base}ms;
  --ease: ${EASE};
  /* 横に送るときの動き。減速だけで、行きすぎて戻る跳ね返りは付けない。
     長さは SWIPE_MS から作る（JS の待ち時間と食い違わせないため） */
  --duration-swipe: ${SWIPE_MS}ms;
  /* 出だしが速く、長い尾を引いて吸い付くカーブ。
     前のカーブ（0.22, 1, 0.36, 1）は出だしで一気に進んでほぼ終わってしまうため、
     移動している途中が見えず「ぱっと変わった」ように感じられた */
  --ease-swipe: ${EASE_SWIPE};

  /* 端末の安全域。env() をここで一度だけ px に解いておき、
     JS からも同じ値を読めるようにする（別々に数えると食い違う） */
  --safe-top: env(safe-area-inset-top, 0px);
  /* 上端の知らせが占めている高さ。知らせを描き直したときだけ入れ替わる */
  --toast-lane: 0px;
  /* 比べている間だけ上端に出る帯の高さ。出していない間は 0。
     板も知らせも、この帯の下から始める（帯の裏に潜り込ませない） */
  --compare-bar: 0px;
  /* その上にある帯（環境の帯・現在地の行）の高さ。配るのは top-inset.ts */
  --top-lane: 0px;
  /* デスクトップアプリの窓の題名の帯の高さ。ブラウザでは 0（src/lib/workspace/window-titlebar.ts）。
     全面を覆う画面は、この下から始める——帯には信号機ボタンと戻る・進むがある */
  --titlebar-h: ${TITLEBAR_HEIGHT_CSS};

  /* 色（ベース）: 90% はこの範囲で足りる */
  --surface: #ffffff;
  --surface-sunken: #f6f7f9;
  /* 選んでいる・いま鳴っている行の地。指を乗せた地（sunken）と同じ向きに、もう 1 段進めたもの。
     明暗どちらでも「指を乗せた < 選んでいる」になるよう、暗い側でも値を持つ */
  --surface-pressed: #eceef2;
  --text: #1a1a2e;
  --muted: #6b7280;
  --border: #e3e5e9;
  --border-light: #eef0f3;
  --shadow: 0 8px 30px rgba(15, 17, 25, .14);

  /* 色（アクセント）: hover / focus / いま選んでいるもの、だけに使う */
  --accent: #c8a86e;
  --accent-soft: rgba(200, 168, 110, .16);

  /* 色（シグナル）: 小さな丸印と、危険な操作の文字にだけ使う */
  --signal-must: #dc2626;
  --signal-better: #d97706;
  --signal-want: #9aa1ac;
  --danger: #dc2626;

  /* 差分。読ませるのは下線と取り消し線の形で、色は添えるだけ。
     機能色の範囲（緑=足した / 赤=消した）から出ない */
  --diff-add: #15803d;
  --diff-del: #b91c1c;
  /* 変更の一覧で、行の意味をごく薄く添える塗り。文字は読みやすさを保つため触らない */
  --diff-add-soft: rgba(21, 128, 61, .10);
  --diff-del-soft: rgba(185, 28, 28, .09);

  /* 顔の地色。名前から決まる 4 択。彩度を落としてあるので人物の区別だけに効く */
  --avatar-0: #e6e8ec;
  --avatar-1: #eae7e2;
  --avatar-2: #e4eae7;
  --avatar-3: #e9e6ec;
}

@media (prefers-color-scheme: dark) {
  :host {
    --surface: #1c2035;
    --surface-sunken: #171a2b;
    --surface-pressed: #11131f;
    --text: #e8e6e3;
    --muted: #9a9ba4;
    --border: rgba(255, 255, 255, .12);
    --border-light: rgba(255, 255, 255, .07);
    --shadow: 0 8px 30px rgba(0, 0, 0, .45);
    --accent-soft: rgba(200, 168, 110, .20);
    --signal-must: #f87171;
    --signal-better: #e0a44a;
    --signal-want: #8b93a1;
    --danger: #f87171;
    --diff-add: #4ade80;
    --diff-del: #f87171;
    --diff-add-soft: rgba(74, 222, 128, .14);
    --diff-del-soft: rgba(248, 113, 113, .13);
    --avatar-0: #2b3048;
    --avatar-1: #322f2b;
    --avatar-2: #263630;
    --avatar-3: #322c3c;
  }
}
`;

/** アイコンの大きさ。線画の太さと釣り合う 2 段階だけ。 */
export const ICON_SIZE = { small: 14, medium: 16 } as const;

/**
 * 選んだ文のそばに出す小窓の置き方。
 *
 * 影の中の CSS では決められない（画面の座標を測って置くので JS の数が要る）。
 * 値は余白の刻みからそのまま借りる: gap = --space-2、edge = --space-3。
 * ここで独自の数を発明しない。
 */
export const POPOVER_PLACEMENT = {
  /** 選んだ場所と小窓のあいだの隙間 */
  gap: 8,
  /** 画面の端から空けておく幅 */
  edge: 12,
} as const;

/**
 * ページ本体に付ける引用の目印。影の中の CSS が届かないので、値をここに持つ。
 *
 * **蛍光ペンで塗った形**にしてある。下線にすると、書いた人が元から引いていた
 * 下線と見分けが付かず、「これは注釈なのか、元からの強調なのか」が分からない。
 * 薄く塗るぶんには、本文が自前で背景色を敷いていることはまず無いので混ざらない。
 *
 * 色は 1 種類だけ（優先度では塗り分けない）。半透明にしてあるので、
 * 白いページでも暗いページでも下地に馴染み、明暗どちらの設定でも同じ 1 つで足りる。
 * 文字の色には触れない（読みやすさを損なわないため）。
 *
 * **塗っても場所は取らない。** 印は本文の文字ノードを割って差し込むので、
 * 内側余白を持たせると印 1 個ごとに行の送り幅が伸び、文字の位置と折り返しが動く
 * （赤入れが余白を 0 に固定しているのと同じ理由）。字にぴったり張り付くのを
 * 避けるためのはみ出しは、場所を取らない影（bleedShadow）だけで作る。
 *
 * **だから余白の値はここに置かない。** 取りうる値が 0 の 1 つだけなら目盛りではないので、
 * 当てる側（anchor.ts の paintBleed）が中で 0 に固定する。ここに `padding` を
 * 足し戻すと、値を差し替えられる口ができてしまう（`"0 2px"` に戻すだけで、
 * 印 1 個あたり 4px ずつ字送りが伸びる）。`tests/checks/check-draftmark.mjs` が見張っている。
 */

/** 塗りを文字の左右へはみ出させる幅。内側余白の代わりなので、影の幅として使う。 */
const BLEED = "2px";

/**
 * 左右だけに落とす影。塗りと同じ色を渡して、はみ出しに見せる。
 *
 * 影は行の中で幅を持たないため、いくつ付けても字送りと折り返しは動かない。
 *
 * 折り返した印には、切れ端ごとではなく**1 個として描いてから切る**（既定の振る舞い）。
 * 切れ端ごとに描かせると、折り返しの切れ目にも端の飾りが出て、2 行目以降の行頭より
 * 左へはみ出しの爪が出る（切れ目は印の端ではない）。
 */
export function bleedShadow(tint: string): string {
  return `${BLEED} 0 0 0 ${tint}, -${BLEED} 0 0 0 ${tint}`;
}

/**
 * まだ送っていない引用に付ける印。
 *
 * 確定したものより薄く塗り、下に点線を添える。
 * 「いま書いている最中」と「もう残っている」が、色の濃さと線の有無で見分けられる。
 * 塗りの色は確定と同じ（濃さだけ違う）ので、同じものの途中だと分かる。
 */
export const DRAFT_MARK = {
  radius: "2px",
  tint: "rgba(200, 168, 110, .16)",
  /** 下に添える点線。書いている最中はアクセント、失敗したら危険の色 */
  lineColor: "#c8a86e",
  failedColor: "#dc2626",
  thickness: "2px",
  offset: "3px",
} as const;

export const MARK = {
  radius: "2px",
  /** ふだんの塗り */
  tint: "rgba(200, 168, 110, .30)",
  /** いま開いているもの・触れているもの。半段だけ濃く */
  activeTint: "rgba(200, 168, 110, .44)",
  /** 片付いたもの。消しはせず、うんと薄くする */
  resolvedTint: "rgba(200, 168, 110, .12)",
  resolvedOpacity: "0.75",
  /** 塗りと、その左右のはみ出し（影）は同じ速さで動かす。片方だけだと段差が見える */
  transition: `background ${MOTION.quick}ms ${EASE}, box-shadow ${MOTION.quick}ms ${EASE}`,
} as const;

/**
 * ページ本体に入れる赤入れの見た目。影の中の CSS は届かないので、値をここに持つ。
 *
 * **役割は色ではなく形で分ける。**
 *
 *   コメントの引用 … 塗りだけ（蛍光ペン）
 *   足した文       … 下線だけ
 *   消した文       … 取り消し線だけ
 *
 * 赤入れに塗りを使わないのは、コメントの引用と見分けが付かなくなるため。
 * 同じ本文の上に出るもの同士なので、**片方が塗りを使ったら、もう片方は使えない**。
 * 色を全部落としても、線の引かれ方だけで足したのか消したのかが分かる。
 *
 * 「いま見ている 1 件」も塗らない。線を太くするだけで示す
 * （600ms だけとはいえ、塗りを 1 か所でも許すと上の約束が崩れる）。
 *
 * ページ側の CSS が ins / del を装飾していても、要素に直接書くこちらが勝つ。
 * `!important` は使わない（書いた人の指定を力ずくで黙らせない）。
 */
export const REDLINE = {
  /** 塗らないので余白も要らない。0 に固定して、ページ側の指定で字送りが動くのを防ぐ */
  padding: "0",
  thickness: "2px",
  /** いま見ている 1 件。塗る代わりに線を太くする */
  activeThickness: "4px",
  offset: "3px",
  /**
   * 変わった段落の左に出す細い縦線（Word の「変更された行」と同じ作法）。
   *
   * 色は中立の 1 本だけにする。足した／消したは本文の線がもう言っているので、
   * ここで色分けすると同じことを 2 回言うことになる（情報の重複）。
   * 縦線の役目は「この段落は変わった」と目を引くことだけ。
   */
  barWidth: "2px",
  /** 本文の左端から離す距離。影の中の余白の刻み（8px）に合わせてある */
  barGap: "8px",
  light: {
    addLine: "#15803d",
    delLine: "#b91c1c",
    /** 中立の目印。影の中の --signal-want と同じ色 */
    barLine: "#9aa1ac",
  },
  dark: {
    addLine: "#4ade80",
    delLine: "#f87171",
    barLine: "#8b93a1",
  },
} as const;

/**
 * 帯に凡例を出しておける最小の幅。
 *
 * これより狭いと、帯に置くものを削る必要が出る。削る順は
 * **凡例 → 件数 → 人名**（人名は最後まで残す）。凡例は「読み方の説明」なので、
 * 場所が無いときにいちばん先に譲れる。
 */
export const LEGEND_MIN_WIDTH = 900;
