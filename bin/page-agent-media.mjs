import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pageAgentRequest, pageAgentMediaRequest } from "./pages-publish.mjs";
/** 手元の画像を、資料の素材として送る（動画はこの版では受け取らない）。 */
export async function uploadAgentMedia(page, path) {
  const overview = await pageAgentRequest({ action: "read", page });
  if (!overview.canEdit) throw new Error("編集できる資料を指定してください");
  page = overview.page;
  const info = await stat(path),
    extension = extname(path).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extension)) throw new Error("画像（PNG・JPEG・WebP・GIF・AVIF）を指定してください");
  if (info.size > 10 * 1024 * 1024) throw new Error("画像は10MBまでです");
  return pageAgentMediaRequest(page, "assets", "POST", await readFile(path), {
    name: basename(path),
  });
}
