/**
 * ページの地の色と明暗。上端に置く行（現在地の行・location-bar.ts と、新しい版の知らせ・latest-bar.ts）が
 * 同じ地を借り、同じ明暗にそろえる。端末の明暗ではなくページの地で決める——白い地のページを暗い端末で開いても、
 * 上端の行は明るい側にそろう。
 */

/** 色を数に直す。読めなければ null。CSS の色の書き方は多いので、ブラウザに描かせて読む。 */
function rgbaOf(color: string): readonly [number, number, number, number] | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue, alpha];
}

/**
 * ページの地の色。body に無ければ html、どちらにも無ければ null（ブラウザの既定の地）。
 * 行はこの色を借りるので、開いた瞬間は帯に見えない。
 */
export function pageGround(): { readonly color: string; readonly dark: boolean } | null {
  for (const node of [document.body, document.documentElement]) {
    if (node === null) continue;
    const color = getComputedStyle(node).backgroundColor;
    const rgba = rgbaOf(color);
    if (rgba === null || rgba[3] === 0) continue;
    // 人の目に近い明るさ（Rec. 709）。半分より暗い地には、明るい字を乗せる
    const light = (0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]) / 255;
    return { color: `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`, dark: light < 0.5 };
  }
  return null;
}

/** 行の入れ物に、ページの地（`--page-ground`）と明暗の印（`data-tone="dark"`）を付ける。 */
export function paintPageTone(host: HTMLElement): void {
  const ground = pageGround();
  if (ground === null) host.style.removeProperty("--page-ground");
  else host.style.setProperty("--page-ground", ground.color);
  // 地を持たないページは、ブラウザの既定の地。暗くなるのは、ページが暗い側を名乗っていて OS も暗いときだけ
  const dark = ground?.dark ?? (getComputedStyle(document.documentElement).colorScheme.includes("dark") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) host.setAttribute("data-tone", "dark");
  else host.removeAttribute("data-tone");
}
