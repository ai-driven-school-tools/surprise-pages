# ASTER NOTEの63形式の完成例

- `content.mjs`：判断・根拠・表・グラフの値・焦点手順の正本。すべて架空の例。
- `assets.mjs`：意味が異なるUI画面をSVGで作る。オフィス写真や外部素材に置き換えない。
- `media.mjs`：5段階の操作イメージを15秒の動画へ、想定インタビューを明示的な合成音声へ出力する。
- 見た目の共通部品は `src/deck-design/`。このフォルダで別のスライドCSSを作らない。

出力先はGit管理外に指定する。

```sh
node scripts/generate/deck-catalog/assets.mjs /path/to/deck/assets
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/generate/deck-catalog/media.mjs /path/to/deck/assets
node scripts/generate/deck-format-catalog.mjs --output /path/to/deck/index.html
```

媒体の書き出しにはPlaywright/Chrome、ffmpeg、macOSの`Kyoko`音声が必要。音声原文と媒体の記録はassetsの一つ上に出る。SVG・PNG・MP4・MP3をGitへ追加しない。字幕VTTは動画と同じ手順から出力する。

主な数値の関係：6/1導入群と8/1導入群を各120チームで比較。初回保存は72→96チーム（60→80%）、30日継続は66→84チーム（55→70%）。保存時間の中央値は完了者だけを対象とする。月額契約売上と料金は利用調査とは別の架空モデル。9月以降の予測帯はシナリオの想定範囲で、統計的信頼区間ではない。

表の行・セルは意味名の目印を使う。列や行を並べ替える際に目印を振り直さない。表の行を増減するときは、対応する意味名と焦点対象も同時に更新する。

## 同じ一文と写真で10構図を比べる

```sh
node scripts/generate/message-image-compositions.mjs /path/to/compositions/index.html
node scripts/generate/deck-catalog/review-page.mjs /path/to/deck/index.html /path/to/coverage.json /path/to/review/index.html /path/to/compositions/index.html
```

構図の説明は `src/lib/deck/card/message-image.ts`、配置は共通の `formats.css` が正本。比較用の写真を `assets/composition-office.jpg` に置く。同じ画像を使い、表示上の切り取りだけを変える。各構図は用途別の章に含め、表紙・章扉を先に、本文用の画像構図を後に並べる。

全面写真や大きな文字を使う4種は表紙・章扉向け、残る6種は本文・結び向け。168構図候補の既存表とは区別し、今回実物を作った10種類として案内する。結合する2資料は、同じ最新の共通部品で組み立ててから渡す。

表紙のセクション名・サブコピー・組織名・所属・氏名は任意。共通の文字グループで組み、空の項目を出力しない。入力に連動して文字の面全体が伸縮しないよう、横幅は構図側で決める。

実際の編集画面で入力前・開始時・入力中・終了後を確認するには、10構図をローカル編集用プレビューで開き、次を実行する。書き込みを遮断したブラウザで検査し、保管庫やプレビューの保存済み本文を変更しない。

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs DECK_QA_URL=http://127.0.0.1:60713 node tests/checks/browser/deck-message-image-editing.mjs
```

## 表紙・章扉・箇条書きを増やす

```sh
node scripts/generate/editorial-compositions.mjs /path/to/editorial/index.html
node scripts/generate/deck-catalog/editorial-assets.mjs /path/to/editorial/assets
node scripts/generate/deck-catalog/review-page.mjs /path/to/deck/index.html /path/to/coverage.json /path/to/review/index.html /path/to/compositions/index.html /path/to/editorial/index.html
```

表紙5・章扉4・箇条書き9の実例。実物の目印を保ち、表紙・見出し・本文の分類順へ配置する。比較用の写真は既存の `composition-office.jpg` を使い、3項目の絵は上の生成器で作る。絵の説明は素材へ焼き込まず、各項目の本文として置く。項目ごとの段階表示は実際の「順に見る」で確認する。

## 全体のデザイン基準

本文は、章名・結論と根拠を40pxの間隔で組む。表紙と章扉は大きな題名を中心にまとめる。形式名と繰り返す資料説明は公開補足、データの対象・期間・定義は紙の中へ置く。数値・表の内容・図の原文・素材の参照先は見た目と切り離して維持する。見本集の順番は `chapters.mjs` が正本。表紙・見出しを先にし、本文の9分類と巻末の対応表を一つの目次へまとめる。実物の目印を保ち、枚番号は現在の順番から計算する。

表の文字は24px、行の多い表は20px。罫線はセルごとに持ち、間隔を0にする。Safari系で表の補足を編集し始める際の1pxの移動を防ぐ。`tests/checks/browser/deck-table-editing.mjs` が10表の入力開始・入力中・確定後を両ブラウザで確認する。

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs DECK_QA_URL=http://127.0.0.1:60745 node tests/checks/browser/deck-table-editing.mjs
```

## 見本の並び

`chapters.mjs` の9分類を、本文の並びと目次の両方に使う。表紙・人物紹介 → 見出し・章扉 → 一文・引用・問い → 箇条書き・目次 → 画像・製品紹介 → 流れ・関係の図 → 数字・グラフ → 表・比較・行動計画 → 補足・実演・演習。構図候補の対応表は巻末。

全体は131枚（実物91枚、入口2枚、章の案内9枚、巻末29枚）。各例は一つの章にだけ属し、抜け・重複は生成時にエラーにする。ページ内のリンクは枚番号を手書きせず、変わらない目印で指定する。

構成の参照：2026年8月の最初の組織月次総会。保存された表紙・章扉・本文の画像とスライド順を確認し、「導入 → 区切り → 具体的な内容」の役割分担を参考にした。総会の本文・数値・画像はこの見本集へ転載しない。

## 編集画面で見本を選ぶ

`pnpm build:deck-library` は同じ4つの生成器から94例を取り出し、9分類の目次とともに編集画面へ配布する。配布物は `src/lib/deck/design/library.generated.json`。手で編集しない。見本・共通の描画部品を変更したら作り直す。ウィジェットの組み立てと検査表が古い配布物を検出する。

編集用は私有素材の参照を素材欄へ置き換え、本文・構図・段階表示を保持する。追加した資料の配色を使い、見本専用の着せ替えやロゴは持ち込まない。段階表示の対象は枚の中での目印を保持し、枚そのものと編集対象の目印は追加ごとに新しくする。図に必要な道具だけがない場合、既存の図の雛形を一括の保存操作で追加する。取り消すとその追加も戻る。

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
DECK_QA_URL=http://127.0.0.1:PORT \
node tests/checks/browser/deck-library-workflow.mjs
```

この検査はローカルの編集用プレビューへ94例を保存する。本番や共有の保管庫へは実行しない。
