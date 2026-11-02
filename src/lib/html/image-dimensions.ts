export type ImageDimensions = { width: number; height: number };

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) * 256 + (bytes[at + 1] ?? 0);
}
function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) + (bytes[at + 1] ?? 0) * 256;
}
function u24le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) + (bytes[at + 1] ?? 0) * 256 + (bytes[at + 2] ?? 0) * 65_536;
}
function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) * 16_777_216) + ((bytes[at + 1] ?? 0) * 65_536) +
    ((bytes[at + 2] ?? 0) * 256) + (bytes[at + 3] ?? 0);
}
function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.slice(at, at + length));
}
function valid(width: number, height: number): ImageDimensions | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 20_000 || height > 20_000) return null;
  return { width, height };
}

function png(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== "PNG") return null;
  return valid(u32be(bytes, 16), u32be(bytes, 20));
}
function gif(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || !ascii(bytes, 0, 6).startsWith("GIF8")) return null;
  return valid(u16le(bytes, 6), u16le(bytes, 8));
}
function jpeg(bytes: Uint8Array): ImageDimensions | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let at = 2;
  while (at + 8 < bytes.length) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    while (bytes[at] === 0xff) at += 1;
    const marker = bytes[at];
    at += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = u16be(bytes, at);
    if (length < 2 || at + length > bytes.length) return null;
    if (frames.has(marker)) return valid(u16be(bytes, at + 3), u16be(bytes, at + 5));
    at += length;
  }
  return null;
}
function webp(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const kind = ascii(bytes, 12, 4);
  if (kind === "VP8X") return valid(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return valid(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const width = 1 + (bytes[21] ?? 0) + (((bytes[22] ?? 0) & 0x3f) << 8);
    const height = 1 + (((bytes[22] ?? 0) >> 6) | ((bytes[23] ?? 0) << 2) | (((bytes[24] ?? 0) & 0x0f) << 10));
    return valid(width, height);
  }
  return null;
}
function svg(bytes: Uint8Array): ImageDimensions | null {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const tag = /<svg\b([^>]*)>/i.exec(text)?.[1];
  if (tag === undefined) return null;
  const number = (name: string): number | null => {
    const value = new RegExp(`\\b${name}\\s*=\\s*["']\\s*([0-9]+(?:\\.[0-9]+)?)(?:px)?\\s*["']`, "i").exec(tag)?.[1];
    return value === undefined ? null : Number(value);
  };
  const width = number("width");
  const height = number("height");
  if (width !== null && height !== null) return valid(Math.round(width), Math.round(height));
  const viewBox = /\bviewBox\s*=\s*["']\s*[-+0-9.e]+[ ,]+[-+0-9.e]+[ ,]+([0-9.e]+)[ ,]+([0-9.e]+)\s*["']/i.exec(tag);
  return viewBox === null ? null : valid(Math.round(Number(viewBox[1])), Math.round(Number(viewBox[2])));
}
function avif(bytes: Uint8Array): ImageDimensions | null {
  for (let at = 4; at + 16 <= bytes.length; at += 1) {
    if (ascii(bytes, at, 4) !== "ispe") continue;
    const found = valid(u32be(bytes, at + 8), u32be(bytes, at + 12));
    if (found !== null) return found;
  }
  return null;
}

export function imageDimensions(bytes: Uint8Array, contentType: string): ImageDimensions | null {
  if (contentType === "image/png") return png(bytes);
  if (contentType === "image/jpeg") return jpeg(bytes);
  if (contentType === "image/gif") return gif(bytes);
  if (contentType === "image/webp") return webp(bytes);
  if (contentType === "image/svg+xml") return svg(bytes);
  if (contentType === "image/avif") return avif(bytes);
  return null;
}
