// Derives a safe, playable embed URL directly from a bookmark's own URL — no oEmbed call, no
// third-party HTML ever trusted. The returned `embedUrl` is always one of exactly two hardcoded
// origins built from a regex-captured ID, never a URL fetched from a third party at render time.
// See docs/02_Development/Rich_Embeds.md for the full rationale and explicit non-goals (tweet
// embeds, generic oEmbed).

export type DetectedEmbed = { provider: "youtube" | "vimeo"; embedUrl: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);

function isValidYouTubeId(id: string | null | undefined): id is string {
  return !!id && YOUTUBE_ID_PATTERN.test(id);
}

function youtubeEmbed(id: string): DetectedEmbed {
  return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
}

function vimeoEmbed(id: string): DetectedEmbed {
  return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
}

function detectYouTube(parsed: URL): DetectedEmbed | null {
  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return isValidYouTubeId(id) ? youtubeEmbed(id) : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (parsed.pathname === "/watch") {
    const id = parsed.searchParams.get("v");
    return isValidYouTubeId(id) ? youtubeEmbed(id) : null;
  }

  const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) {
    return isValidYouTubeId(shortsMatch[1]) ? youtubeEmbed(shortsMatch[1]) : null;
  }

  const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) {
    return isValidYouTubeId(embedMatch[1]) ? youtubeEmbed(embedMatch[1]) : null;
  }

  return null;
}

function detectVimeo(parsed: URL): DetectedEmbed | null {
  const host = parsed.hostname.toLowerCase();

  if (host === "player.vimeo.com") {
    // The lookahead requires the digit run to end at a `/` or the end of the path — without it,
    // "/video/123abc" would still match the leading digits and embed an id that was never a real
    // Vimeo video id (self-review-caught: the unanchored version silently "succeeded" on garbage
    // input instead of falling back to the OG-image card like every other unrecognized URL).
    const match = parsed.pathname.match(/^\/video\/(\d+)(?=\/|$)/);
    return match ? vimeoEmbed(match[1]) : null;
  }

  if (!VIMEO_HOSTS.has(host)) return null;

  // Drops a trailing /{privacy-hash} segment on an unlisted video's URL — a documented,
  // acceptable limitation (Rich_Embeds.md's Out of Scope): such a video's embed shows Vimeo's
  // own "this video is private" state rather than actually playing. Same end-of-segment
  // anchoring as the player.vimeo.com branch above, for the same reason.
  const match = parsed.pathname.match(/^\/(\d+)(?=\/|$)/);
  return match ? vimeoEmbed(match[1]) : null;
}

/** Returns null (never throws) for any URL that isn't a recognized YouTube/Vimeo video link. */
export function detectEmbed(url: string): DetectedEmbed | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  return detectYouTube(parsed) ?? detectVimeo(parsed);
}
