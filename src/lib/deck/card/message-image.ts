// i18n-keep-file: 見本の原稿と、見本集（src/lib/deck/design/library.generated.json）に入る構図の名前と説明
/** Real, reusable compositions; independent from the purpose-oriented format catalogue. */
export const DECK_MESSAGE_IMAGE_COMPOSITIONS = [
  { id: "split-right", use: "本文", format: "image-one", name: "写真を右に", purpose: "言葉を先に読ませ、写真で具体的な場所を伝える。", crop: "写真をほぼ半面に使い、机と窓を残す。" },
  { id: "split-left", use: "本文", format: "image-one", name: "写真を左に", purpose: "場所の印象から入り、言葉へ視線を渡す。", crop: "同じ机を中心に、左右分割の読む順だけを変える。" },
  { id: "headline-top", use: "本文", format: "image-one", name: "言葉の下に大きな写真", purpose: "先にメッセージを理解し、場所の広がりを見てもらう。", crop: "下側を広く取り、机・椅子・窓の関係を残す。" },
  { id: "headline-bottom", use: "本文", format: "image-one", name: "写真の下で締める", purpose: "写真を見たあとに、一文を結論として残す。", crop: "写真を上段にまとめ、言葉との間に一定の余白を置く。" },
  { id: "photo-bleed", use: "表紙・章扉", format: "title", name: "全面写真に言葉を重ねる", purpose: "場所の空気感を大きく伝えながら、強いメッセージを届ける。", crop: "机を残した全面表示。文字の後ろだけ明暗を補正する。" },
  { id: "photo-panel", use: "表紙・章扉", format: "divider", name: "中央の言葉を主役に", purpose: "写真の細部より、一文の印象を優先する。", crop: "写真全体を背景にし、中央に読みやすい文字の面を置く。" },
  { id: "wide-margin", use: "表紙・章扉", format: "title", name: "余白と小さな写真", purpose: "大きな言葉を主役にし、写真は具体性を添える。", crop: "写真を右下へ小さく置き、文字から画像へ斜めに視線を流す。" },
  { id: "photo-rail", use: "表紙・章扉", format: "divider", name: "縦帯で場所を添える", purpose: "言葉の強さを保ち、写真を細い縦のアクセントにする。", crop: "右端だけに、机と照明の縦の関係を切り取る。" },
  { id: "photo-strip", use: "本文・結び", format: "image-one", name: "横帯でリズムをつくる", purpose: "言葉と横長の風景を一つのまとまりとして読ませる。", crop: "写真を細い横帯にし、窓・机・椅子の連なりを残す。" },
  { id: "circle-crop", use: "本文", format: "image-one", name: "丸く切り取って添える", purpose: "柔らかな印象をつくり、言葉と場所を対にする。", crop: "円の中にも机が見える位置を選ぶ。背景透過ではなく形による切り取り。" },
] satisfies readonly { id: string; use: string; format: "title" | "divider" | "image-one"; name: string; purpose: string; crop: string }[];

export const MESSAGE_IMAGE_EXAMPLE = {
  message: "考える時間を、ここから。",
  image: "assets/composition-office.jpg",
  alt: "大きな窓から光が入る、木の会議机と椅子のある空間",
};

/** Optional source content, rendered as ordinary editable HTML, never saved as settings. */
export type DeckCoverDetails = {
  section?: string;
  subcopy?: string;
  organization?: string;
  affiliation?: string;
  name?: string;
};

export const MESSAGE_IMAGE_COVER_EXAMPLE = {
  section: "はたらく環境を考える",
  subcopy: "余白と光から、会話と集中の時間を見直す。",
  organization: "株式会社ASTER",
  affiliation: "プロダクトデザイン室",
  name: "山田 太郎",
} satisfies DeckCoverDetails;
