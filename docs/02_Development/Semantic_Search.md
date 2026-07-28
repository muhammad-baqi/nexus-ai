# Semantic Search (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Idea

Extend Global Search (`01_MVP/Search.md`) beyond keyword/full-text
matching to also retrieve conceptually related items — e.g., searching
"places to eat in Tokyo" should surface a saved note titled "Best ramen
spots" even without exact keyword overlap.

## Anticipated Shape

- Generate vector embeddings for Knowledge Item content (title +
  description + body/extracted text) on create/update.
- Store embeddings in a vector-capable index (e.g., `pgvector` alongside
  the existing Postgres database, to avoid introducing a wholly separate
  data store).
- Combine keyword search (existing MVP mechanism) and vector similarity
  search into a single ranked result set, rather than replacing keyword
  search outright.

## Open Questions

- Embedding generation cost/latency at write-time for every item —
  batch/async vs. synchronous?
- How to blend keyword-match and semantic-match scores into one ranking
  without keyword-exact-matches losing their (currently strong) priority
  from `01_MVP/Search.md`.

## Dependencies

Depends on the existing Search indexing pipeline from the MVP; this is
additive to that pipeline, not a replacement.
