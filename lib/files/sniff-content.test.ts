import { describe, expect, it } from "vitest";

import { isSniffedCategoryConsistent, sniffContentCategory } from "./sniff-content";

function bytesOf(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function asciiBytes(text: string, padTo = 0): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length >= padTo) return bytes;
  const padded = new Uint8Array(padTo);
  padded.set(bytes);
  return padded;
}

describe("sniffContentCategory", () => {
  it("recognizes a PDF header", () => {
    expect(sniffContentCategory(asciiBytes("%PDF-1.7\n..."))).toBe("pdf");
  });

  it("recognizes a PNG header", () => {
    expect(sniffContentCategory(bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(
      "image-png",
    );
  });

  it("recognizes a JPEG header", () => {
    expect(sniffContentCategory(bytesOf([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image-jpeg");
  });

  it("recognizes GIF87a and GIF89a headers", () => {
    expect(sniffContentCategory(asciiBytes("GIF87a..."))).toBe("image-gif");
    expect(sniffContentCategory(asciiBytes("GIF89a..."))).toBe("image-gif");
  });

  it("recognizes a WEBP (RIFF....WEBP) header", () => {
    const bytes = asciiBytes("RIFF");
    const full = new Uint8Array(16);
    full.set(bytes, 0);
    full.set(asciiBytes("WEBP"), 8);
    expect(sniffContentCategory(full)).toBe("image-webp");
  });

  it("recognizes a ZIP container (docx/xlsx/odt/ods/zip all share this)", () => {
    expect(sniffContentCategory(bytesOf([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe("zip-container");
  });

  it("recognizes an empty ZIP archive's signature too", () => {
    expect(sniffContentCategory(bytesOf([0x50, 0x4b, 0x05, 0x06, 0, 0]))).toBe("zip-container");
  });

  it("recognizes an OLE compound file (legacy .doc/.xls)", () => {
    expect(sniffContentCategory(bytesOf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(
      "ole-compound",
    );
  });

  it("recognizes plain UTF-8 text with no binary signature as 'text'", () => {
    expect(sniffContentCategory(asciiBytes("just a normal plain-text file\nwith a newline"))).toBe("text");
  });

  it("does not classify a disguised PDF (renamed to .txt) as text", () => {
    expect(sniffContentCategory(asciiBytes("%PDF-1.4 binary junk follows"))).toBe("pdf");
  });

  it("classifies binary content with null bytes as unknown, not text", () => {
    expect(sniffContentCategory(bytesOf([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]))).toBe("unknown");
  });
});

describe("isSniffedCategoryConsistent", () => {
  it("accepts matching declared type and sniffed category", () => {
    expect(isSniffedCategoryConsistent("application/pdf", "pdf")).toBe(true);
    expect(isSniffedCategoryConsistent("image/png", "image-png")).toBe(true);
    expect(isSniffedCategoryConsistent("text/plain", "text")).toBe(true);
    expect(
      isSniffedCategoryConsistent(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "zip-container",
      ),
    ).toBe(true);
    expect(isSniffedCategoryConsistent("application/msword", "ole-compound")).toBe(true);
  });

  it("rejects a declared PDF whose bytes are actually a PNG", () => {
    expect(isSniffedCategoryConsistent("application/pdf", "image-png")).toBe(false);
  });

  it("rejects a declared plain-text file whose bytes are actually a PDF (disguised upload)", () => {
    expect(isSniffedCategoryConsistent("text/plain", "pdf")).toBe(false);
  });

  it("rejects an unrecognized declared mime type outright", () => {
    expect(isSniffedCategoryConsistent("application/x-msdownload", "unknown")).toBe(false);
  });
});
