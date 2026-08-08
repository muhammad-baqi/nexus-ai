# Rich Link Embeds

## Status
Built (Post-MVP, first feature after v0.2). `01_MVP/Website_Bookmarks.md` explicitly excluded
this from MVP scope and pointed here for future direction — this doc is that direction, now
implemented rather than speculative.

## What it does

A Website Bookmark whose URL points at a YouTube or Vimeo video renders that video as a live,
playable embed in place of the static Open Graph preview image — in both the owner's own
bookmark view and a public share-link view of the same item. Every other bookmark type/URL is
completely unaffected; this only changes what's rendered on top of data that already exists
(`website_metadata.url`/`canonical_url`), nothing about the save flow, metadata fetch, or search.

## Detection — no network call, no oEmbed

Rather than calling each provider's oEmbed discovery endpoint at fetch/render time (an extra
network dependency and a third-party HTML surface to trust), the embed URL is derived directly
from the bookmark's own URL via pattern matching (`lib/bookmarks/detect-embed.ts`):

- **YouTube**: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, or an already-embed
  `youtube.com/embed/` URL, each carrying an 11-character video ID → rendered via
  `https://www.youtube-nocookie.com/embed/{id}` (the privacy-enhanced embed domain — no tracking
  cookie is set until the viewer actually presses play).
- **Vimeo**: `vimeo.com/{numeric id}` or an already-embed `player.vimeo.com/video/{numeric id}`
  → rendered via `https://player.vimeo.com/video/{id}`.
- Anything else — playlist-only URLs, channel/profile URLs, a non-video-platform URL, malformed
  input — matches nothing and falls through to the existing OG-image/favicon card unchanged.

This is a deliberate security choice, not just a simplicity one: the embed `<iframe src>` is
always one of exactly two hardcoded origins (`youtube-nocookie.com`, `player.vimeo.com`), built
from a regex-captured ID and nothing else — never a URL or HTML string fetched from a third
party at render time. Matches this codebase's existing "don't trust fetched HTML" posture
(`lib/bookmarks/safe-fetch.ts`'s SSRF guard on the metadata-fetch job; the rich-text editor
renders raw HTML in note source as literal escaped text, never executed markup).

## Rendering

`components/bookmarks/link-embed.tsx` — a 16:9 (`aspect-video`) `<iframe>`, `loading="lazy"`,
`allowFullScreen`, `referrerPolicy="strict-origin-when-cross-origin"`, `title` set to the item's
own title for screen-reader users. No `sandbox` attribute, matching the same plain-iframe pattern
`components/files/file-item-view.tsx` already uses for PDF preview — sandboxing a fully
interactive third-party video player is more likely to silently break fullscreen/autoplay than
meaningfully add safety here, since the origin itself is already fixed and never
user/attacker-influenced.

Used from both `components/bookmarks/bookmark-view.tsx` (owner's authenticated view) and
`components/sharing/shared-item-view.tsx` (public, unauthenticated share-link view) — the same
detection/rendering component, since the embed itself carries no account-specific data. The
public share route (`app/api/share/[token]/route.ts`) needed `canonical_url` added to its
`website_metadata` select to make this possible on the share page (same privacy class as the
`url`/`domain` it already exposed there — nothing new leaked).

## Out of scope (explicit, not an oversight)

- **Tweet/X post embeds.** Unlike a video ID → iframe, a real tweet embed needs either
  rendering the provider's oEmbed-returned HTML (a `dangerouslySetInnerHTML` + trusting
  third-party markup) plus loading their `widgets.js` on every page with a tweet embed (a real
  script-injection/CSP surface, not a small addition), or a from-scratch tweet-content renderer.
  Deferred as a distinct scope decision, not bundled into this pass.
- **Generic oEmbed support** (arbitrary providers via discovery). Every provider's oEmbed
  response is untrusted HTML by spec — supporting this generically would mean sanitizing
  arbitrary third-party markup (a real dependency + attack-surface decision) rather than the
  fixed-two-origin approach here.
- **Spotify/SoundCloud/other embeddable media types.** Same shape as YouTube/Vimeo (a plausible,
  cheap fast-follow using the identical ID-extraction-then-iframe pattern) but not built in this
  pass — no user demand signal yet for this specific pairing.
- **Private/unlisted Vimeo videos requiring a playback hash** (`vimeo.com/{id}/{hash}`) — the
  hash segment is currently dropped; such a video's embed will show Vimeo's own "this video is
  private" state inside the iframe rather than actually playing. A fast-follow could carry the
  hash through if this turns out to matter in practice.
