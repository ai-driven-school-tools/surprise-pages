/** Pixel footprint of the image itself, including the part cropped by object-fit. */
export function imageDisplaySize(width: number, height: number, intrinsicWidth: number, intrinsicHeight: number, fit: string): {width: number; height: number} {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) return {width, height};
  if (fit === "fill") return {width, height};
  const contain = Math.min(width / intrinsicWidth, height / intrinsicHeight);
  const ratio = fit === "cover" ? Math.max(width / intrinsicWidth, height / intrinsicHeight)
    : fit === "none" ? 1 : fit === "scale-down" ? Math.min(1, contain) : contain;
  return {width: intrinsicWidth * ratio, height: intrinsicHeight * ratio};
}

/** Production authoring density; also used while filtering search candidates. */
export const IMAGE_QUALITY_DENSITY = 2;
export function imagePixelRequirements(width: number, height: number, intrinsicWidth: number, intrinsicHeight: number, fit: string) {
  const painted = imageDisplaySize(width, height, intrinsicWidth, intrinsicHeight, fit);
  return {width:Math.ceil(painted.width * IMAGE_QUALITY_DENSITY - .01), height:Math.ceil(painted.height * IMAGE_QUALITY_DENSITY - .01)};
}
