/**
 * Content sniffing: identify a file from its first bytes so a renamed or mislabelled file
 * (e.g. an .exe declared as image/png) is rejected. Pure, so it runs in the browser and on the server.
 */
export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm"
  | "application/pdf";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.slice(start, start + len));

export function sniffType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"; // EBML (webm/mkv)
  if (ascii(bytes, 4, 4) === "ftyp") return ascii(bytes, 8, 4) === "qt  " ? "video/quicktime" : "video/mp4";
  return null;
}

/** True when the detected content is consistent with the declared MIME type. */
export function mimeMatches(declared: string, detected: SniffedType | null): boolean {
  if (!detected) return false;
  if (declared === detected) return true;
  // ISO base media files: mp4 and mov share the `ftyp` container and are often mislabelled.
  const family = ["video/mp4", "video/quicktime"];
  return family.includes(declared) && family.includes(detected);
}

export function checkContent(declared: string, head: Uint8Array): string | null {
  return mimeMatches(declared, sniffType(head)) ? null : "This file’s contents don’t match its type. Upload a real image, video or PDF.";
}
