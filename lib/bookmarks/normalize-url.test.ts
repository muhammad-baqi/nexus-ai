import { describe, expect, it } from "vitest";

import { normalizeUrlForDuplicateCheck } from "./normalize-url";

describe("normalizeUrlForDuplicateCheck", () => {
  it("returns null for an unparseable URL", () => {
    expect(normalizeUrlForDuplicateCheck("not a url")).toBeNull();
    expect(normalizeUrlForDuplicateCheck("")).toBeNull();
  });

  it("lowercases scheme and host, drops a default port, strips the fragment and a trailing slash", () => {
    expect(normalizeUrlForDuplicateCheck("HTTPS://Example.COM:443/Path/#section")).toBe(
      "https://example.com/Path",
    );
  });

  it("keeps a non-default port", () => {
    expect(normalizeUrlForDuplicateCheck("https://example.com:8443/path")).toBe(
      "https://example.com:8443/path",
    );
  });

  it("strips known tracking params and sorts remaining query params", () => {
    const result = normalizeUrlForDuplicateCheck(
      "https://example.com/article?utm_source=x&b=2&fbclid=abc&a=1&gclid=y",
    );
    expect(result).toBe("https://example.com/article?a=1&b=2");
  });

  it("normalizes two URLs differing only by tracking params, case, and a trailing slash identically", () => {
    const first = normalizeUrlForDuplicateCheck("https://Example.com/Article/?utm_source=twitter");
    const second = normalizeUrlForDuplicateCheck("https://example.com/Article?utm_campaign=spring");
    expect(first).toBe(second);
  });

  it("does not collapse the root path's single slash", () => {
    expect(normalizeUrlForDuplicateCheck("https://example.com/")).toBe("https://example.com/");
  });
});
