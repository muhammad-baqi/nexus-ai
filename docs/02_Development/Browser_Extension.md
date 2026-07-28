# Browser Extension (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Idea

A lightweight browser extension (Chrome/Firefox) that lets a user save
the current page to Nexus in one click, without switching tabs.

## Anticipated Capture

- Current page URL
- Screenshot of the visible viewport (or full page)
- Standard metadata (title, description, OG image, favicon) — reusing
  the same extraction logic as `01_MVP/Website_Bookmarks.md`
- Target Collection picker at save time

## Open Questions

- Does the extension need its own lightweight auth flow (token-based),
  separate from the main app's session?
- Should it support saving a text selection as a Note excerpt, not just
  the whole page?
- Keyboard shortcut for save-without-opening-popup?

## Dependencies

Builds directly on the metadata-fetch mechanism already required for
Website Bookmarks in the MVP — this is additive capture UX, not a new
backend capability.
