import { describe, expect, it } from "vitest";
import { checkContent, mimeMatches, sniffType } from "../src/lib/sniff";

const bytes = (...n: number[]) => new Uint8Array([...n, ...new Array(Math.max(0, 16 - n.length)).fill(0)]);
const ascii = (s: string, offset = 0) => {
  const b = new Uint8Array(16);
  [...s].forEach((c, i) => (b[offset + i] = c.charCodeAt(0)));
  return b;
};

describe("content sniffing", () => {
  it("identifies common formats from magic bytes", () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffType(ascii("GIF89a"))).toBe("image/gif");
    expect(sniffType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(sniffType(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
    const webp = ascii("RIFF");
    ascii("WEBP").slice(0, 4).forEach((v, i) => (webp[8 + i] = v));
    expect(sniffType(webp)).toBe("image/webp");
    const mp4 = ascii("ftypisom", 4);
    expect(sniffType(mp4)).toBe("video/mp4");
    expect(sniffType(ascii("ftypqt  ", 4))).toBe("video/quicktime");
  });

  it("rejects executables and unknown content", () => {
    expect(sniffType(ascii("MZ"))).toBeNull();
    expect(sniffType(new Uint8Array(4))).toBeNull();
  });

  it("checks declared type against contents", () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(checkContent("image/png", png)).toBeNull();
    expect(checkContent("image/jpeg", png)).toMatch(/don’t match/);
    expect(checkContent("image/png", ascii("MZ"))).not.toBeNull();
    // mp4 and mov share a container and are often mislabelled
    expect(mimeMatches("video/mp4", "video/quicktime")).toBe(true);
    expect(mimeMatches("video/webm", "video/mp4")).toBe(false);
  });
});
