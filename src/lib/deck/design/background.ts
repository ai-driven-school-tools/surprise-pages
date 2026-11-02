import type { DeckAppearance } from "./design";

/** One background recipe for slides and their selection previews. It changes no
 * content geometry. All layers share the contrast-bounded opacity of one plane. */
export function deckBackground(appearance: DeckAppearance): { image: string; size: string; repeat: string } {
  const { accent, secondary, background, decoration, x, y, scale, angle } = appearance;
  const rgba = (hex: string, alpha: number) => `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`;
  // Several eased stops keep the edge from looking like a circle behind the copy.
  const falloff = (color: string) => [[0,1],[12,.94],[32,.72],[52,.4],[72,.13],[88,.02],[100,0]].map(([stop,alpha])=>`${rgba(color,alpha)} ${stop}%`).join(",");
  const field = (color: string, width: number, height: number, px: number, py: number) => `radial-gradient(ellipse ${width}% ${height}% at ${px}% ${py}%,${falloff(color)})`;
  let image = "none";
  if (decoration === "gradient") {
    image = [
      field(secondary, scale*.62, scale*.88, 100-x, 100-y),
      field(accent, scale*.88, scale*.96, x, y),
      `linear-gradient(${angle}deg,${background} 0%,${background} 18%,${rgba(accent,.16)} 42%,${rgba(accent,.56)} 72%,${secondary} 100%)`,
    ].join(",");
  } else if (decoration === "glow") {
    image = [field(accent,scale*.76,scale*.96,x,y),field(secondary,scale*.88,scale*.76,100-x,100-y)].join(",");
  } else if (decoration === "grid") {
    image = `linear-gradient(${angle}deg,transparent 98%,${accent} 98%),linear-gradient(${angle+90}deg,transparent 98%,${secondary} 98%)`;
  } else if (decoration === "wave") {
    image = `repeating-radial-gradient(ellipse at ${x}% ${y+40}%,transparent 0 6%,${accent} 6.1% 6.3%,transparent 6.4% 12%,${secondary} 12.1% 12.3%)`;
  } else if (decoration === "diagonal") {
    // Two separated planes echo the rising strokes of the company mark. The
    // quiet left half stays clear for copy; all paint remains contrast bounded.
    // A subpixel transition keeps the diagonal smooth without a percentage-wide
    // blur band. The planes, interior shading and motion remain unchanged.
    const offset = (x - 85) * .12, width = scale / 100;
    const a = 63 + offset, b = a + 11 * width, c = b + 6 * width, d = c + 12 * width;
    image = [
      `linear-gradient(${angle}deg,transparent ${a}%,${rgba(accent,.78)} calc(${a}% + .5px),${rgba(secondary,.5)} ${b}%,transparent calc(${b}% + .5px),transparent ${c}%,${rgba(accent,.92)} calc(${c}% + .5px),${rgba(secondary,.38)} ${d}%,transparent calc(${d}% + .5px))`,
      field(secondary,scale*.64,scale*.78,x,y),
    ].join(',');
  }
  // Percent units keep the preview and a full-size slide visually identical.
  return { image, size: decoration === "grid" ? `${scale/16}% ${scale/9}%` : appearance.motion ? decoration === "diagonal" ? "118% 118%" : "104% 104%" : "100% 100%", repeat: decoration === "grid" ? "repeat" : "no-repeat" };
}
