import * as cheerio from "cheerio";

export type ParsedBookmarkMetadata = {
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
  faviconUrl: string;
  canonicalUrl: string;
};

// href/src attributes on a page are frequently relative (or, rarely, garbage) — resolves
// against the page's own URL, falling back to null rather than throwing on something
// unparseable (Website_Bookmarks.md requires tolerating malformed HTML).
function resolveUrl(href: string, requestUrl: string): string | null {
  try {
    return new URL(href, requestUrl).toString();
  } catch {
    return null;
  }
}

function defaultFaviconUrl(requestUrl: string): string {
  return new URL("/favicon.ico", requestUrl).toString();
}

// Extraction order per Website_Bookmarks.md's Metadata Extraction section: Open Graph tags
// first, then standard `<title>`/meta description; `<link rel="canonical">` falling back to the
// fetched URL itself; `<link rel="icon">` falling back to `/favicon.ico`. cheerio (htmlparser2
// under the hood) tolerates malformed/incomplete HTML by design, so no try/catch is needed
// around the parse itself — only around resolving individual, possibly-garbage href values.
export function parseHtmlMetadata(html: string, requestUrl: string): ParsedBookmarkMetadata {
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const ogDescription = $('meta[property="og:description"]').attr("content")?.trim() || null;
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() || null;

  const htmlTitle = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;

  const canonicalHref = $('link[rel="canonical"]').first().attr("href")?.trim();
  const iconHref = $('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href")?.trim();

  return {
    title: ogTitle || htmlTitle,
    description: ogDescription || metaDescription,
    ogImageUrl: ogImage ? resolveUrl(ogImage, requestUrl) : null,
    canonicalUrl: (canonicalHref && resolveUrl(canonicalHref, requestUrl)) || requestUrl,
    faviconUrl: (iconHref && resolveUrl(iconHref, requestUrl)) || defaultFaviconUrl(requestUrl),
  };
}
