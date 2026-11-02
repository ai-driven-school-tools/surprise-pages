/** One finite set of image variants for private delivery. */
export const PAGE_IMAGE_WIDTHS = [320, 640, 960, 1280, 1920, 2560];
export const PAGE_IMAGE_BLUR_WIDTH = 32;
export const PAGE_IMAGE_QUALITY = 80;
export const PAGE_IMAGE_BLUR_QUALITY = 30;
export const PAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PAGE_IMAGE_WIDTH_PARAM = "sp-image";
export const PAGE_IMAGE_QUALITY_PARAM = "sp-quality";
export const PAGE_IMAGE_REVISION = "2";
export const PAGE_IMAGE_RASTER = /\.(?:png|jpe?g|webp|avif)$/i;

export function pageImageUrl(path: string, width: number, version: string): string {
  const url = new URL(path, "https://page.invalid");
  url.searchParams.set(PAGE_IMAGE_WIDTH_PARAM, String(width));
  url.searchParams.set(PAGE_IMAGE_QUALITY_PARAM, String(width === PAGE_IMAGE_BLUR_WIDTH ? PAGE_IMAGE_BLUR_QUALITY : PAGE_IMAGE_QUALITY));
  url.searchParams.set("sp-version", version);
  return url.pathname + url.search;
}
