import { DEFAULT_LOCALE } from "./locales";
import { ja } from "./messages/ja";
import { translator } from "./translate";

/**
 * 日本語の辞書を引く関数。言語を決められない場所（外枠の外の画面・ログに添える既定の文）が使う。
 * 日本語の辞書だけを読む（ここを読む葉に、ほかの言語の辞書を連れ込まない）。
 */
export const defaultTranslate = translator(DEFAULT_LOCALE, ja);
