/**
 * 窓の上端の取り決め（Mac のデスクトップアプリ）。
 *
 * デスクトップアプリは OS の題名の帯を出さず、信号機ボタン（閉じる・しまう・広げる）を画面の左上に重ねる。
 * そのぶんの場所は、画面の側が空ける——ブラウザが知らせてくる値（`env(titlebar-area-*)`）を読むだけで、
 * アプリから画面へ何かを渡す口は作らない（主画面に橋を付けない決まりのまま）。ふつうのブラウザでは
 * この値が無いので 0 になり、何も変わらない。全画面にしたときも 0 になる（信号機ボタンが消えるため）。
 *
 * 読むのは 2 か所で、同じ値を持つ（社内版のデスクトップアプリは個人配布版に含めない。CSS は汎用の窓の枠として残す）:
 *   - ワークスペースの画面（`src/app/globals.css`）      … `--titlebar-*`。CSS からはここを読めないので、
 *                                                      そろっていることは検査表（check-window-titlebar）が見る
 *   - ページの上端の現在地の行（`src/widget/reading/location-bar-styles.ts`）
 */

/** 帯の高さ（px）。押す部品（32px）の上下に 6px ずつ。ページの上端の現在地の行も同じ高さにする。 */
export const TITLEBAR_HEIGHT = 44;

/** 帯の高さ。窓の枠が無ければ 0。 */
export const TITLEBAR_HEIGHT_CSS = "env(titlebar-area-height, 0px)";

/** 信号機ボタンが使っている左の幅。窓の枠が無ければ 0。 */
export const TITLEBAR_START_CSS = "env(titlebar-area-x, 0px)";

/** 戻る・進むの 2 つが並ぶ幅（押す部品 32px が 2 つ）。 */
export const HISTORY_WIDTH = 64;

/**
 * 戻る・進むが使う幅。窓の枠があるときだけ長さを持ち、無ければ 0。
 *
 * 「あるときだけ ◯px」を CSS だけで書く切り替え——左の幅（0 か 78px ほど）を大きく掛けてから上限で切る。
 * 見分けを JS に任せると、描いたあとで出たり引っ込んだりする。
 */
export const TITLEBAR_HISTORY_CSS = `min(${HISTORY_WIDTH}px, calc(${TITLEBAR_START_CSS} * 999))`;
