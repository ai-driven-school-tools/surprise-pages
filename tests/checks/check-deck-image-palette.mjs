// スライドの編集画面の画像棚（この資料・最近使った画像）の検査。
// この版には Web 画像の検索（src/lib/deck-image-search*・検索の費用台帳・手元の道具の取り寄せ）が無いので、棚・ドラッグ・画像索引だけを見る。
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {root} from "./paths.mjs";

const palette=await readFile(`${root}/src/widget/deck/edit/image-palette.ts`,"utf8"),canvas=await readFile(`${root}/src/widget/deck/canvas.ts`,"utf8");
const editorWords=await readFile(`${root}/src/lib/i18n/messages/ja/deckEditor.ts`,"utf8");for(const [key,words] of [["tabCurrent","この資料"],["recentTitle","最近使った画像"]]){assert.match(palette,new RegExp(`t\\("deckEditor\\.images\\.${key}"`));assert.match(editorWords,new RegExp(`${key}: "${words}"`));}console.log("OK  手元・現在・最近を一つの浅い画像棚に置く");
assert.doesNotMatch(palette,/deckEditor\.images\.searchWeb|image-search/);console.log("OK  この版の画像棚は Web 画像の検索を出さない");
assert.match(palette,/application\/x-surprise-image-palette/);assert.match(canvas,/application\/x-surprise-image-palette/);console.log("OK  過去画像をキャンバスへドラッグできる");
assert.match(canvas,/searchParams\.get\("imgurl"\)/);console.log("OK  Google画像検索のリンクから元画像を優先して取り出す");

const catalog=await readFile(`${root}/db/migrations/20260920054405_deck_image_palette.sql`,"utf8");
assert.match(catalog,/enable row level security/);console.log("OK  画像索引をサーバー専用に閉じる");
assert.match(catalog,/unique\(page_id,src\)/);assert.match(catalog,/references public\.pages/);console.log("OK  画像索引は資料と保存済み画像の組で重複しない");
