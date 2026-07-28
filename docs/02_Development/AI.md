# AI Features (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Candidate Features

- **Automatic summaries:** generate a short summary for long Notes,
  PDFs, or bookmarked articles.
- **Auto-generated tags:** suggest tags based on content, which the
  user can accept/reject rather than have applied silently.
- **Duplicate detection:** beyond the URL-based duplicate check already
  in MVP bookmarks, detect likely-duplicate Notes/content via
  similarity, not just exact URL match.
- **Related knowledge:** surface other items in the account related to
  the one currently being viewed.
- **Smart collections:** auto-suggested groupings based on content
  similarity, distinct from user-created Collections.

## Open Questions

- Which of these require an external LLM API call vs. can be done with
  simpler heuristics/embeddings run locally?
- Cost and latency implications of running AI features at write-time
  (on save) vs. on-demand (when viewed)?
- How much user control/override is needed before these feel trustworthy
  rather than intrusive (all four candidate features above should be
  suggestions, not silent automatic changes, as a working principle)?

## Dependencies

Most of these are easier to implement well once Semantic Search
(embeddings-based retrieval) already exists, since summaries, related-
items, and duplicate detection all benefit from the same underlying
embedding infrastructure.
