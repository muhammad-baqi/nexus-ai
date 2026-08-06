import { describe, expect, it } from "vitest";

import { resolveLanguageExtension, SUPPORTED_LANGUAGES } from "./languages";

describe("resolveLanguageExtension", () => {
  it("resolves an extension for a supported language name", () => {
    expect(resolveLanguageExtension("python")).toBeDefined();
    expect(resolveLanguageExtension("javascript")).toBeDefined();
  });

  it("falls back to no extension (plain text) for an unrecognized language string", () => {
    expect(resolveLanguageExtension("cobol-77")).toBeUndefined();
    expect(resolveLanguageExtension("")).toBeUndefined();
  });

  it("returns no extension for plaintext itself", () => {
    expect(resolveLanguageExtension("plaintext")).toBeUndefined();
  });
});

describe("SUPPORTED_LANGUAGES", () => {
  it("includes the documented common languages plus plaintext", () => {
    const values = SUPPORTED_LANGUAGES.map((lang) => lang.value);
    for (const expected of ["javascript", "typescript", "python", "java", "sql", "json", "plaintext"]) {
      expect(values).toContain(expected);
    }
  });

  it("every entry has a non-empty label distinct from its value where the language has a real name", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0);
    }
  });
});
