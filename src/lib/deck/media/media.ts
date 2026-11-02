import {isYouTubeId} from "./youtube-id";
import {z} from "zod";

/** Files dropped inside the preview belong to another window, so instanceof
 * against the toolbar's File constructor rejects real browser File objects. */
export function isMediaFile(value: unknown): value is File {
  return value !== null && typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object File]" &&
    "name" in value && typeof value.name === "string" &&
    "type" in value && typeof value.type === "string" &&
    "size" in value && typeof value.size === "number" &&
    "arrayBuffer" in value && typeof value.arrayBuffer === "function" &&
    "slice" in value && typeof value.slice === "function";
}
export const MEDIA_IMAGE_TYPES = ["image/png","image/jpeg","image/webp","image/gif","image/avif"] as const;
/** 受け取れる素材の形式（この版は画像だけ。動画のファイルは受け取らない）。 */
export const mediaTypeSchema=z.enum(MEDIA_IMAGE_TYPES);
export type MediaType=z.infer<typeof mediaTypeSchema>;
export const MEDIA_EXTENSIONS:Record<MediaType,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
export function mediaFileType(file:Pick<File,"type"|"name">):MediaType|null{
  const type=mediaTypeSchema.safeParse(file.type);
  if(type.success)return type.data;
  if(file.type)return null;
  const extension=file.name.split(".").at(-1)?.toLowerCase();
  return Object.entries(MEDIA_EXTENSIONS).find(([,ext])=>ext===extension||ext==="jpg"&&extension==="jpeg")?.[0] ? mediaTypeSchema.parse(Object.entries(MEDIA_EXTENSIONS).find(([,ext])=>ext===extension||ext==="jpg"&&extension==="jpeg")?.[0]) : null;
}
export function youtubeId(value:string):string|null{
  try{
    const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port)return null;
    const host=url.hostname.toLowerCase();let id:string|null=null;
    if(host==="youtu.be")id=url.pathname.slice(1);
    else if(["youtube.com","www.youtube.com","m.youtube.com","www.youtube-nocookie.com"].includes(host))id=url.pathname==="/watch"?url.searchParams.get("v"): /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1]??null;
    return isYouTubeId(id)?id:null;
  }catch{return null;}
}
export const youtubeIdSchema=z.string().refine(isYouTubeId);

export function formatMediaBytes(bytes:number):string {return bytes<1024?`${bytes}B`:bytes<1048576?`${(bytes/1024).toFixed(1)}KB`:`${(bytes/1048576).toFixed(1)}MB`;}
