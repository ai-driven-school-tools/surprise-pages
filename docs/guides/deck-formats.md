# スライド形式台帳

この一覧は `src/lib/deck/design/format-catalog.ts` から生成する。用途ごとの独立した雛形ではなく、共通の配置・表・画像・グラフ・図の部品を組み替える。

## 資料内の役割

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `title` 表紙 | 資料の主題と対象期間を定める | title* / body | type / hero-image / brand-field | element | 表題・副題・日付・発行者を常に読む |
| `agenda` 見取り図 | これから進む論点と順序を示す | title* / rows* | numbered / chapters / route | row | 全項目を順番どおり残す |
| `divider` 章扉 | 話題の切り替わりと次の問いを示す | title* / body | number / question / image | element | 章番号・章題・問いを残す |
| `message` 一文の結論 | 最も大事な判断を一文で記憶させる | title* / body | center / left / with-proof | element | 結論と補足を最初から読む |
| `evidence` 根拠 | 結論を数字・事実・観察で支える | title* / rows* / source | single / paired / three-proof | row / element | 根拠を省かず出典とともに読む |
| `definition` 定義 | 用語・対象・境界を揃える | title* / body | term / formula / in-out | element | 用語と定義、含むもの・含まないものを残す |
| `quote` 引用 | 当事者の言葉や一次情報を示す | title* / body / source | short / long / paired | element | 引用全文・話者・出典を残す |
| `summary` 要約 | 複数の根拠を一つの判断へ戻す | title* / rows* | bullets / decision / now-next | row | 全要点と判断を残す |
| `action` 次の行動 | 担当・期限・判定条件まで決める | title* / rows* | one-action / plan / owner-date | row | 全行動の担当・期限・完了条件を残す |
| `qa` 質疑 | 問いを受ける時間と議論の焦点を示す | title* / body | open / prompts / parking-lot | element | 問いかけと論点候補を残す |
| `reference` 参照 | 追試に必要な資料・定義・条件をまとめる | title* / rows* / source | sources / method / appendix | row | 参照先を省略せず読む |

## 画像

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `image-one` 画像1点 | 一つの対象を大きく観察する | title* / asset* / source | landscape / portrait / square / transparent-cutout | element | 画像・代替文・個別キャプションを残す |
| `image-two` 画像2点 | 二つの対象を同じ基準で比べる | title* / asset* / source | equal / split / before-after / whole-detail | element | 両方の画像と対応する説明を残す |
| `image-three` 画像3点 | 三つの段階・視点・候補を並べる | title* / asset* / source | equal / main-support / sequence | element | 三つすべてを順番どおり残す |
| `image-many` 画像N点 | 一覧性を保ちながら複数の対象を見渡す | title* / asset* / source | equal / main-support / contact-sheet | element | 全画像と各説明を残し、枚に収まらなければ分割する |
| `image-captioning` 画像の説明 | 画像と説明の対応関係を明示する | title* / asset* / body | individual / shared / none / two-level | element | 発表中に隠す補足も読み表示では最初から残す |
| `image-treatment` 画像の見せ方 | 切り抜き・焦点・文字の読みやすさを別々に制御する | title* / asset* / body | contain / crop-focal / transparent-cutout / faded-photo / text-backplate / gradient-scrim | element | 画像の不透明度と文字背景を混ぜず、代替文を残す |

## データグラフ

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `chart-size` 大きさ | 値の絶対量を比較する | title* / series* / source | bar / lollipop / dot | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-rank` 順位 | 並びと差を同時に読む | title* / series* / source | sorted-bar / bump | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-time` 時系列 | 時間に沿った変化と転換点を読む | title* / series* / source | line / area / step | series / point / range / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-composition` 構成比 | 全体に占める割合を読む | title* / series* / source | stacked-bar / donut / treemap | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-change` 増減 | 二時点または基準からの変化を読む | title* / series* / source | slope / waterfall / variance | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-contribution` 寄与 | 合計がどの要因で動いたか読む | title* / series* / source | waterfall / stacked-change | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-distribution` 分布 | 中心・ばらつき・外れを読む | title* / series* / source | histogram / boxplot / violin | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-correlation` 相関 | 二つの量の関係と例外を読む | title* / series* / source | scatter / bubble / regression | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-target` 目標差 | 実績と目標の距離を読む | title* / series* / source | bullet / actual-target / gauge | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-flow` 量の流れ | 入口から出口への量の移動を読む | title* / series* / source | sankey / funnel | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-heatmap` 濃淡分布 | 二つの軸の集中箇所を読む | title* / series* / source | matrix / calendar | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-geography` 地理 | 場所ごとの値と位置関係を読む | title* / series* / source | map / symbol-map | series / point / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |
| `chart-forecast` 予測と幅 | 予測値と不確かさを同時に読む | title* / series* / source | line-band / fan / scenarios | series / point / range / element | 軸・単位・全系列・全データラベル・不確かさの幅を残す |

## 表

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `table-plain` 基本表 | 項目を正確に照合する | title* / rows* / source | plain / dense | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-comparison` 比較表 | 候補を同じ観点で比べる | title* / rows* / source | options-columns / criteria-columns | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-spec-pricing` 仕様・価格 | 仕様と価格の条件を対応させる | title* / rows* / source | plans / line-items | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-actual-target` 実績・目標 | 達成度と差を行ごとに読む | title* / rows* / source | actual-target-gap / periods | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-evaluation` 評価 | 基準と判定理由を揃える | title* / rows* / source | score / verdict / weighted | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-roles-dates` 担当・期限 | 仕事の持ち主と期限を明確にする | title* / rows* / source | owner-date / raci | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-risk` リスク | 確率・影響・対策を同時に読む | title* / rows* / source | probability-impact / register | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-checklist` 確認表 | 完了・未完了・該当なしを確認する | title* / rows* / source | status / gate | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-grouped` まとまり付き表 | 階層を保って明細を読む | title* / rows* / source | row-groups / subtotals | row / column / cell / element | 全行・列見出し・単位・注記を残す |
| `table-sparklines` 小さな推移付き表 | 数値と直近の動きを一行で読む | title* / rows* / source | line / bar / band | row / column / cell / element | 全行・列見出し・単位・注記を残す |

## 関係・流れ

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `flow-sequence` 順番 | 手順や段階の進み方を示す | title* / graph* / source | horizontal / vertical | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-state` 状態 | 状態と移り変わる条件を示す | title* / graph* / source | state / state-group | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-input-output` 入出力 | 入力・処理・出力の対応を示す | title* / graph* / source | pipeline / system | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-causal` 因果 | 原因から結果までのつながりを示す | title* / graph* / source | chain / feedback | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-branch` 分岐 | 条件ごとに進む道を示す | title* / graph* / source | decision / tree | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-converge` 合流 | 複数の入口が一つへ集まる過程を示す | title* / graph* / source | funnel / merge | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-parallel` 並行 | 同時に進む仕事と同期点を示す | title* / graph* / source | lanes / fork-join | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-cycle` 循環 | 繰り返しと改善の輪を示す | title* / graph* / source | loop / feedback | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-swimlane` 役割別の流れ | 担当をまたぐ受け渡しを示す | title* / graph* / source | roles / systems | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-time` 時間の流れ | 期間・節目・依存を示す | title* / graph* / source | timeline / gantt | element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-hierarchy` 階層 | 上下の所属・分解・優先を示す | title* / graph* / source | tree / org | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-network` 網目 | 多数の関係と中心を示す | title* / graph* / source | network / cluster | node / edge / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-set-overlap` 集合の重なり | 共通部分と固有部分を示す | title* / graph* / source | venn-two / venn-three | node / region / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |
| `flow-quadrant` 四象限 | 二つの軸で位置づけを示す | title* / graph* / source | points / regions | node / element | 全節点・全辺・条件・軸名を残す。発表の最終状態だけに情報を置かない |

## 人物・製品・媒体・演習

| 形式 | 目的 | 必要な材料 | 構図 | 強調できる対象 | 読む表示 |
| --- | --- | --- | --- | --- | --- |
| `profile` 人物紹介 | 人物の役割・経験・今回の関係を示す | title* / asset* / rows* | single / team / speaker | element | 氏名・役割・説明を残す |
| `product` 製品紹介 | 製品の価値・対象・根拠を示す | title* / asset* / rows* | hero / features / proof | element | 製品名・価値・条件を残す |
| `screenshot` 画面説明 | 画面上の場所と操作結果を対応させる | title* / asset* / rows* | whole-detail / annotated / steps | element / row | 全体像・拡大箇所・注釈を残す |
| `code` コード | 実行可能な例と要点を示す | title* / code* / body | snippet / before-after / trace | element | コード全文・言語・説明を残す |
| `formula` 数式 | 式・変数・意味を対応させる | title* / formula* / rows* | single / derivation / worked-example | element / row | 式・変数定義・代入例を残す |
| `video` 動画 | 時間変化・動作・証言を見せる | title* / asset* / body | full / with-transcript / clip-notes | element | ポスター・説明・公開補足または文字起こしを残す |
| `audio` 音声 | 声・音・リズムを聞かせる | title* / asset* / body | player / waveform / with-transcript | element | 再生できない場合も説明・文字起こしを残す |
| `question` 問い | 考える観点を一つに絞る | title* / body | open / choice / hypothesis | element | 問いと前提を残す |
| `exercise` 演習 | 作業・時間・成果物・確認方法を示す | title* / rows* / body | solo / pair / workshop | row / element | 手順・制限時間・提出物・答え合わせを残す |
