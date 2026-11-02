// i18n-keep-file: 形式台帳。生成する文書（docs の形式台帳）と見本集に入る名前・説明・入力の説明
export type DeckFormatFamily = "role" | "image" | "chart" | "table" | "flow" | "media";
export type DeckFormatRenderer = "html" | "echarts-svg" | "mermaid-svg" | "native-svg";
export type DeckFormatFocusKind = "element" | "row" | "column" | "cell" | "series" | "point" | "range" | "region" | "node" | "edge";

export type DeckFormatInput = {
  name: string;
  type: "text" | "rich-text" | "number" | "asset" | "rows" | "series" | "nodes-edges" | "code" | "formula";
  required: boolean;
  description: string;
};

export type DeckFormatDefinition = {
  id: string;
  family: DeckFormatFamily;
  name: string;
  purpose: string;
  inputs: readonly DeckFormatInput[];
  compositionVariants: readonly string[];
  focusTargets: readonly DeckFormatFocusKind[];
  staticReading: string;
  renderer: DeckFormatRenderer;
};

const title: DeckFormatInput = { name: "title", type: "text", required: true, description: "この枚で伝える一文" };
const body: DeckFormatInput = { name: "body", type: "rich-text", required: false, description: "判断を支える説明" };
const source: DeckFormatInput = { name: "source", type: "text", required: false, description: "出典・基準日・集計条件" };
const rows: DeckFormatInput = { name: "rows", type: "rows", required: true, description: "安定した行IDを持つ項目" };
const series: DeckFormatInput = { name: "series", type: "series", required: true, description: "系列ID・点ID・値・ラベル" };
const graph: DeckFormatInput = { name: "graph", type: "nodes-edges", required: true, description: "安定した節点IDと辺IDを持つ関係" };
const asset: DeckFormatInput = { name: "asset", type: "asset", required: true, description: "非公開保管庫の画像・映像・音声" };

function define(
  family: DeckFormatFamily,
  renderer: DeckFormatRenderer,
  id: string,
  name: string,
  purpose: string,
  inputs: readonly DeckFormatInput[],
  compositionVariants: readonly string[],
  focusTargets: readonly DeckFormatFocusKind[],
  staticReading: string,
): DeckFormatDefinition {
  return { family, renderer, id, name, purpose, inputs, compositionVariants, focusTargets, staticReading };
}

const roleFormats: readonly DeckFormatDefinition[] = [
  define("role", "html", "title", "表紙", "資料の主題と対象期間を定める", [title, body], ["type", "hero-image", "brand-field"], ["element"], "表題・副題・日付・発行者を常に読む"),
  define("role", "html", "agenda", "見取り図", "これから進む論点と順序を示す", [title, rows], ["numbered", "chapters", "route"], ["row"], "全項目を順番どおり残す"),
  define("role", "html", "divider", "章扉", "話題の切り替わりと次の問いを示す", [title, body], ["number", "question", "image"], ["element"], "章番号・章題・問いを残す"),
  define("role", "html", "message", "一文の結論", "最も大事な判断を一文で記憶させる", [title, body], ["center", "left", "with-proof"], ["element"], "結論と補足を最初から読む"),
  define("role", "html", "evidence", "根拠", "結論を数字・事実・観察で支える", [title, rows, source], ["single", "paired", "three-proof"], ["row", "element"], "根拠を省かず出典とともに読む"),
  define("role", "html", "definition", "定義", "用語・対象・境界を揃える", [title, body], ["term", "formula", "in-out"], ["element"], "用語と定義、含むもの・含まないものを残す"),
  define("role", "html", "quote", "引用", "当事者の言葉や一次情報を示す", [title, body, source], ["short", "long", "paired"], ["element"], "引用全文・話者・出典を残す"),
  define("role", "html", "summary", "要約", "複数の根拠を一つの判断へ戻す", [title, rows], ["bullets", "decision", "now-next"], ["row"], "全要点と判断を残す"),
  define("role", "html", "action", "次の行動", "担当・期限・判定条件まで決める", [title, rows], ["one-action", "plan", "owner-date"], ["row"], "全行動の担当・期限・完了条件を残す"),
  define("role", "html", "qa", "質疑", "問いを受ける時間と議論の焦点を示す", [title, body], ["open", "prompts", "parking-lot"], ["element"], "問いかけと論点候補を残す"),
  define("role", "html", "reference", "参照", "追試に必要な資料・定義・条件をまとめる", [title, rows, source], ["sources", "method", "appendix"], ["row"], "参照先を省略せず読む"),
];

const imageVariants = ["equal", "split", "main-support", "before-after", "whole-detail"] as const;
const imageFormats: readonly DeckFormatDefinition[] = [
  define("image", "html", "image-one", "画像1点", "一つの対象を大きく観察する", [title, asset, source], ["landscape", "portrait", "square", "transparent-cutout"], ["element"], "画像・代替文・個別キャプションを残す"),
  define("image", "html", "image-two", "画像2点", "二つの対象を同じ基準で比べる", [title, asset, source], ["equal", "split", "before-after", "whole-detail"], ["element"], "両方の画像と対応する説明を残す"),
  define("image", "html", "image-three", "画像3点", "三つの段階・視点・候補を並べる", [title, asset, source], ["equal", "main-support", "sequence"], ["element"], "三つすべてを順番どおり残す"),
  define("image", "html", "image-many", "画像N点", "一覧性を保ちながら複数の対象を見渡す", [title, asset, source], ["equal", "main-support", "contact-sheet"], ["element"], "全画像と各説明を残し、枚に収まらなければ分割する"),
  define("image", "html", "image-captioning", "画像の説明", "画像と説明の対応関係を明示する", [title, asset, body], ["individual", "shared", "none", "two-level"], ["element"], "発表中に隠す補足も読み表示では最初から残す"),
  define("image", "html", "image-treatment", "画像の見せ方", "切り抜き・焦点・文字の読みやすさを別々に制御する", [title, asset, body], ["contain", "crop-focal", "transparent-cutout", "faded-photo", "text-backplate", "gradient-scrim"], ["element"], "画像の不透明度と文字背景を混ぜず、代替文を残す"),
];

const chartSpecs: readonly [string, string, string, readonly string[]][] = [
  ["chart-size", "大きさ", "値の絶対量を比較する", ["bar", "lollipop", "dot"]],
  ["chart-rank", "順位", "並びと差を同時に読む", ["sorted-bar", "bump"]],
  ["chart-time", "時系列", "時間に沿った変化と転換点を読む", ["line", "area", "step"]],
  ["chart-composition", "構成比", "全体に占める割合を読む", ["stacked-bar", "donut", "treemap"]],
  ["chart-change", "増減", "二時点または基準からの変化を読む", ["slope", "waterfall", "variance"]],
  ["chart-contribution", "寄与", "合計がどの要因で動いたか読む", ["waterfall", "stacked-change"]],
  ["chart-distribution", "分布", "中心・ばらつき・外れを読む", ["histogram", "boxplot", "violin"]],
  ["chart-correlation", "相関", "二つの量の関係と例外を読む", ["scatter", "bubble", "regression"]],
  ["chart-target", "目標差", "実績と目標の距離を読む", ["bullet", "actual-target", "gauge"]],
  ["chart-flow", "量の流れ", "入口から出口への量の移動を読む", ["sankey", "funnel"]],
  ["chart-heatmap", "濃淡分布", "二つの軸の集中箇所を読む", ["matrix", "calendar"]],
  ["chart-geography", "地理", "場所ごとの値と位置関係を読む", ["map", "symbol-map"]],
  ["chart-forecast", "予測と幅", "予測値と不確かさを同時に読む", ["line-band", "fan", "scenarios"]],
];
const chartFormats = chartSpecs.map(([id, name, purpose, variants]) => define(
  "chart", "echarts-svg", id, name, purpose, [title, series, source], variants,
  id === "chart-time" || id === "chart-forecast"
    ? ["series", "point", "range", "element"]
    : ["series", "point", "element"],
  "軸・単位・全系列・全データラベル・不確かさの幅を残す",
));

const tableSpecs: readonly [string, string, string, readonly string[]][] = [
  ["table-plain", "基本表", "項目を正確に照合する", ["plain", "dense"]],
  ["table-comparison", "比較表", "候補を同じ観点で比べる", ["options-columns", "criteria-columns"]],
  ["table-spec-pricing", "仕様・価格", "仕様と価格の条件を対応させる", ["plans", "line-items"]],
  ["table-actual-target", "実績・目標", "達成度と差を行ごとに読む", ["actual-target-gap", "periods"]],
  ["table-evaluation", "評価", "基準と判定理由を揃える", ["score", "verdict", "weighted"]],
  ["table-roles-dates", "担当・期限", "仕事の持ち主と期限を明確にする", ["owner-date", "raci"]],
  ["table-risk", "リスク", "確率・影響・対策を同時に読む", ["probability-impact", "register"]],
  ["table-checklist", "確認表", "完了・未完了・該当なしを確認する", ["status", "gate"]],
  ["table-grouped", "まとまり付き表", "階層を保って明細を読む", ["row-groups", "subtotals"]],
  ["table-sparklines", "小さな推移付き表", "数値と直近の動きを一行で読む", ["line", "bar", "band"]],
];
const tableFormats = tableSpecs.map(([id, name, purpose, variants]) => define(
  "table", "html", id, name, purpose, [title, rows, source], variants,
  ["row", "column", "cell", "element"], "全行・列見出し・単位・注記を残す",
));

const flowSpecs: readonly [string, string, string, DeckFormatRenderer, readonly string[], readonly DeckFormatFocusKind[]][] = [
  ["flow-sequence", "順番", "手順や段階の進み方を示す", "mermaid-svg", ["horizontal", "vertical"], ["node", "edge", "element"]],
  ["flow-state", "状態", "状態と移り変わる条件を示す", "mermaid-svg", ["state", "state-group"], ["node", "edge", "element"]],
  ["flow-input-output", "入出力", "入力・処理・出力の対応を示す", "mermaid-svg", ["pipeline", "system"], ["node", "edge", "element"]],
  ["flow-causal", "因果", "原因から結果までのつながりを示す", "mermaid-svg", ["chain", "feedback"], ["node", "edge", "element"]],
  ["flow-branch", "分岐", "条件ごとに進む道を示す", "mermaid-svg", ["decision", "tree"], ["node", "edge", "element"]],
  ["flow-converge", "合流", "複数の入口が一つへ集まる過程を示す", "mermaid-svg", ["funnel", "merge"], ["node", "edge", "element"]],
  ["flow-parallel", "並行", "同時に進む仕事と同期点を示す", "mermaid-svg", ["lanes", "fork-join"], ["node", "edge", "element"]],
  ["flow-cycle", "循環", "繰り返しと改善の輪を示す", "mermaid-svg", ["loop", "feedback"], ["node", "edge", "element"]],
  ["flow-swimlane", "役割別の流れ", "担当をまたぐ受け渡しを示す", "mermaid-svg", ["roles", "systems"], ["node", "edge", "element"]],
  ["flow-time", "時間の流れ", "期間・節目・依存を示す", "mermaid-svg", ["timeline", "gantt"], ["element"]],
  ["flow-hierarchy", "階層", "上下の所属・分解・優先を示す", "mermaid-svg", ["tree", "org"], ["node", "edge", "element"]],
  ["flow-network", "網目", "多数の関係と中心を示す", "mermaid-svg", ["network", "cluster"], ["node", "edge", "element"]],
  ["flow-set-overlap", "集合の重なり", "共通部分と固有部分を示す", "native-svg", ["venn-two", "venn-three"], ["node", "region", "element"]],
  ["flow-quadrant", "四象限", "二つの軸で位置づけを示す", "native-svg", ["points", "regions"], ["node", "element"]],
];
const flowFormats = flowSpecs.map(([id, name, purpose, renderer, variants, focusTargets]) => define(
  "flow", renderer, id, name, purpose, [title, graph, source], variants,
  focusTargets, "全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない",
));

const mediaFormats: readonly DeckFormatDefinition[] = [
  define("media", "html", "profile", "人物紹介", "人物の役割・経験・今回の関係を示す", [title, asset, rows], ["single", "team", "speaker"], ["element"], "氏名・役割・説明を残す"),
  define("media", "html", "product", "製品紹介", "製品の価値・対象・根拠を示す", [title, asset, rows], ["hero", "features", "proof"], ["element"], "製品名・価値・条件を残す"),
  define("media", "html", "screenshot", "画面説明", "画面上の場所と操作結果を対応させる", [title, asset, rows], ["whole-detail", "annotated", "steps"], ["element", "row"], "全体像・拡大箇所・注釈を残す"),
  define("media", "html", "code", "コード", "実行可能な例と要点を示す", [title, { name: "code", type: "code", required: true, description: "言語と行番号を持つコード" }, body], ["snippet", "before-after", "trace"], ["element"], "コード全文・言語・説明を残す"),
  define("media", "html", "formula", "数式", "式・変数・意味を対応させる", [title, { name: "formula", type: "formula", required: true, description: "数式と変数定義" }, rows], ["single", "derivation", "worked-example"], ["element", "row"], "式・変数定義・代入例を残す"),
  define("media", "html", "video", "動画", "時間変化・動作・証言を見せる", [title, asset, body], ["full", "with-transcript", "clip-notes"], ["element"], "ポスター・説明・公開補足または文字起こしを残す"),
  define("media", "html", "audio", "音声", "声・音・リズムを聞かせる", [title, asset, body], ["player", "waveform", "with-transcript"], ["element"], "再生できない場合も説明・文字起こしを残す"),
  define("media", "html", "question", "問い", "考える観点を一つに絞る", [title, body], ["open", "choice", "hypothesis"], ["element"], "問いと前提を残す"),
  define("media", "html", "exercise", "演習", "作業・時間・成果物・確認方法を示す", [title, rows, body], ["solo", "pair", "workshop"], ["row", "element"], "手順・制限時間・提出物・答え合わせを残す"),
];

export const DECK_FORMAT_CATALOG: readonly DeckFormatDefinition[] = [
  ...roleFormats, ...imageFormats, ...chartFormats, ...tableFormats, ...flowFormats, ...mediaFormats,
];

export const DECK_IMAGE_COMPOSITIONS = imageVariants;

export function deckFormatById(id: string): DeckFormatDefinition | undefined {
  return DECK_FORMAT_CATALOG.find((format) => format.id === id);
}

export function deckFormatsByFamily(family: DeckFormatFamily): readonly DeckFormatDefinition[] {
  return DECK_FORMAT_CATALOG.filter((format) => format.family === family);
}
