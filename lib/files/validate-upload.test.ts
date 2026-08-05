import { describe, expect, it } from "vitest";

import { validateFileUpload } from "./validate-upload";

describe("validateFileUpload", () => {
  it("accepts a PDF under the 50MB cap", () => {
    const result = validateFileUpload({ mimeType: "application/pdf", sizeBytes: 10 * 1024 * 1024 });
    expect(result).toEqual({ valid: true, type: "pdf" });
  });

  it("rejects a PDF over the 50MB cap", () => {
    const result = validateFileUpload({ mimeType: "application/pdf", sizeBytes: 51 * 1024 * 1024 });
    expect(result.valid).toBe(false);
  });

  it("accepts an image under the 20MB cap", () => {
    const result = validateFileUpload({ mimeType: "image/png", sizeBytes: 5 * 1024 * 1024 });
    expect(result).toEqual({ valid: true, type: "image" });
  });

  it("rejects an image over the 20MB cap", () => {
    const result = validateFileUpload({ mimeType: "image/jpeg", sizeBytes: 21 * 1024 * 1024 });
    expect(result.valid).toBe(false);
  });

  it("accepts a general file under the 25MB cap", () => {
    const result = validateFileUpload({ mimeType: "text/plain", sizeBytes: 1024 });
    expect(result).toEqual({ valid: true, type: "file" });
  });

  it("rejects a general file over the 25MB cap", () => {
    const result = validateFileUpload({ mimeType: "application/zip", sizeBytes: 26 * 1024 * 1024 });
    expect(result.valid).toBe(false);
  });

  it("rejects a mime type outside every allow-list", () => {
    const result = validateFileUpload({ mimeType: "application/x-executable", sizeBytes: 100 });
    expect(result.valid).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    const result = validateFileUpload({ mimeType: "text/plain", sizeBytes: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects a negative size", () => {
    const result = validateFileUpload({ mimeType: "text/plain", sizeBytes: -1 });
    expect(result.valid).toBe(false);
  });
});
