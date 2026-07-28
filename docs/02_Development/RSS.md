# RSS Feed Items (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Idea

A new Knowledge Item type representing an article from a subscribed RSS
feed, extending the Knowledge Item model described in
`01_MVP/Knowledge_Items.md` without requiring changes to its base
contract.

## Anticipated Shape

- User adds a feed URL; a background job polls it periodically for new
  entries.
- Each new entry becomes a Knowledge Item (type: `rss_article`), reusing
  the same metadata-extraction approach as Website Bookmarks (title,
  description, source).
- Feed management (subscribe/unsubscribe/view feed list) as a new,
  small settings-adjacent surface.

## Open Questions

- Polling interval and how to avoid duplicate-entry creation on feeds
  that republish/update existing entries.
- Whether feed items should auto-populate into a specific Collection
  per feed, or require manual sorting like other saved items.

## Dependencies

Reuses the background-job and metadata-extraction infrastructure built
for Website Bookmarks in the MVP.
