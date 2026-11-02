/**
 * 手元の画面のほかに、プロジェクターなどの画面がつながっているか。
 *
 * 見分けられるのは Chrome と Edge だけ（画面の配置を読む仕組みがこの 2 つにしか無い）。
 * ほかのブラウザでは常に「つながっていない」と答え、今までどおりの動きになる。
 */
type ScreenArea = { readonly availLeft: number; readonly availTop: number; readonly availWidth: number; readonly availHeight: number; readonly isPrimary: boolean };
type ScreenDetails = { readonly screens: readonly ScreenArea[]; readonly currentScreen: ScreenArea };

declare global {
  interface Screen { readonly isExtended?: boolean }
  interface Window { getScreenDetails?: () => Promise<ScreenDetails> }
}

export function hasSecondScreen(): boolean {
  return window.screen.isExtended === true;
}

/**
 * 開いた窓を、手元でない方の画面いっぱいへ動かす。
 *
 * 初回だけブラウザが「画面の配置を読んでよいか」を聞く。断られた・見分けられないときは
 * 何もしない（窓は手元に開いたままで、人が向こうへ動かせる）。
 */
export async function moveToOtherScreen(target: Window): Promise<boolean> {
  if (!hasSecondScreen() || typeof window.getScreenDetails !== "function") return false;
  try {
    const details = await window.getScreenDetails();
    const others = details.screens.filter(area => area !== details.currentScreen);
    const chosen = others.find(area => !area.isPrimary) ?? others[0];
    if (!chosen || target.closed) return false;
    target.moveTo(chosen.availLeft, chosen.availTop);
    target.resizeTo(chosen.availWidth, chosen.availHeight);
    return true;
  } catch {
    return false;
  }
}
