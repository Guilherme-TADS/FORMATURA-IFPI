import { describe, expect, it } from "vitest";
import { sniffMimeType, DEFAULT_UPLOAD_LIMITS } from "@/lib/uploads";

// Regression coverage for the real security property of the upload routes:
// the accepted MIME type comes from sniffing the file's magic bytes, never
// from whatever Content-Type the browser/client claims.
describe("sniffMimeType", () => {
  it("identifies a JPEG by its magic bytes", () => {
    expect(sniffMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("image/jpeg");
  });

  it("identifies a PNG by its magic bytes", () => {
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
  });

  it("identifies a WEBP by its RIFF/WEBP markers", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0, 0, 0, 0], 4); // size (irrelevant)
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffMimeType(bytes)).toBe("image/webp");
  });

  it("identifies a PDF by its %PDF header", () => {
    expect(sniffMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]))).toBe(
      "application/pdf",
    );
  });

  it("rejects a file whose bytes don't match any known magic number, even if it claims to be an image", () => {
    // e.g. an .exe (MZ header) or a plain text file renamed to .jpg
    expect(sniffMimeType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("rejects an empty/too-short buffer instead of throwing", () => {
    expect(sniffMimeType(new Uint8Array([]))).toBeNull();
    expect(sniffMimeType(new Uint8Array([0xff]))).toBeNull();
  });
});

describe("DEFAULT_UPLOAD_LIMITS", () => {
  it("only allows the four MIME types the app actually knows how to sniff", () => {
    expect(DEFAULT_UPLOAD_LIMITS.allowedMimeTypes.sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].sort(),
    );
  });
});
