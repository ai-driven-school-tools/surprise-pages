/**
 * 配信のときに差し込む「描画を待たせない」部品の目印（src/lib/first-paint/first-paint.ts・src/lib/first-paint/chrome.ts）。
 *
 * 道具箱（src/widget/**）も読むので、目印だけをこの小さなファイルに分けてある（道具箱の最初の読み込みに、
 * 配信側の読み取り器を連れてこない）。保存される本文に焼き付いたら断る（src/lib/html/check.ts）。
 */
export const FIRST_PAINT_MARK = "data-sp-first-paint";

/**
 * 道具箱が届く前に場所を空けておく指定（`<style data-sp-first-paint="chrome">`）の目印の値。
 * 道具箱は、自分の部品を置く同じ処理の中でこの指定を外す（src/widget/reading/first-paint-chrome.ts）。
 */
export const FIRST_PAINT_CHROME = "chrome";
