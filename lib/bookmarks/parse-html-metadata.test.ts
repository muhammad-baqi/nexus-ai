import { describe, expect, it } from "vitest";

import { parseHtmlMetadata } from "./parse-html-metadata";

const URL_UNDER_TEST = "https://example.com/article";

describe("parseHtmlMetadata", () => {
  it("prefers Open Graph tags over <title>/meta description when both are present", () => {
    const html = `
      <html><head>
        <title>Fallback Title</title>
        <meta name="description" content="Fallback description">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG description">
        <meta property="og:image" content="/og.png">
      </head></html>
    `;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.title).toBe("OG Title");
    expect(result.description).toBe("OG description");
    expect(result.ogImageUrl).toBe("https://example.com/og.png");
  });

  it("falls back to <title>/meta description when OG tags are absent", () => {
    const html = `
      <html><head>
        <title>Plain Title</title>
        <meta name="description" content="Plain description">
      </head></html>
    `;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.title).toBe("Plain Title");
    expect(result.description).toBe("Plain description");
    expect(result.ogImageUrl).toBeNull();
  });

  it("extracts a relative canonical link, resolved against the request URL", () => {
    const html = `<html><head><link rel="canonical" href="/canonical-path"></head></html>`;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.canonicalUrl).toBe("https://example.com/canonical-path");
  });

  it("falls back to the request URL when no canonical link is present", () => {
    const html = `<html><head></head></html>`;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.canonicalUrl).toBe(URL_UNDER_TEST);
  });

  it("extracts a relative favicon link, resolved against the request URL", () => {
    const html = `<html><head><link rel="icon" href="/assets/favicon.png"></head></html>`;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.faviconUrl).toBe("https://example.com/assets/favicon.png");
  });

  it("falls back to /favicon.ico on the domain when no icon link is present", () => {
    const html = `<html><head></head></html>`;
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.faviconUrl).toBe("https://example.com/favicon.ico");
  });

  it("doesn't throw on malformed/incomplete HTML (no <html>/<head> wrapper, unclosed meta tags) and extracts whatever is parseable", () => {
    const html = `<meta property="og:title" content="Recovered Title"><meta name="description" content="still found"<p>body text`;
    expect(() => parseHtmlMetadata(html, URL_UNDER_TEST)).not.toThrow();
    const result = parseHtmlMetadata(html, URL_UNDER_TEST);
    expect(result.title).toBe("Recovered Title");
    expect(result.description).toBe("still found");
  });

  it("doesn't throw on completely empty input", () => {
    expect(() => parseHtmlMetadata("", URL_UNDER_TEST)).not.toThrow();
    const result = parseHtmlMetadata("", URL_UNDER_TEST);
    expect(result.title).toBeNull();
    expect(result.canonicalUrl).toBe(URL_UNDER_TEST);
  });
});
