// Params that vary between otherwise-identical links to the same page (tracking/campaign
// noise) — stripped before comparison so "the same link, pasted twice with different tracking
// params" is caught as a duplicate. Not exhaustive; Website_Bookmarks.md frames duplicate
// detection as catching re-pasted links, not a comprehensive tracking-param registry.
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "igshid",
]);

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

// Used only to decide "does this URL match one already saved" (Website_Bookmarks.md's
// Duplicate Detection section) — never stored. The stored `canonical_url` comes from the
// background job's `<link rel="canonical">` fetch instead (see fetch-bookmark-metadata.ts).
export function normalizeUrlForDuplicateCheck(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port && parsed.port !== DEFAULT_PORTS[scheme] ? `:${parsed.port}` : "";

  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key)) params.delete(key);
  }
  params.sort();
  const query = params.toString();

  let pathname = parsed.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  return `${scheme}//${host}${port}${pathname}${query ? `?${query}` : ""}`;
}
