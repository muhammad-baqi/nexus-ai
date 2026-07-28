# Search

## Overview

Global Search is the primary retrieval mechanism of Nexus and, per the
project Vision, is as important as capture itself. A user should be able
to find any Knowledge Item by title, tag, content fragment, or metadata,
from a single search bar, regardless of item type or which Collection it
lives in.

## Requirements

Users shall be able to:

- Search across all Knowledge Items from one global search entry point
- See results spanning all item types (notes, bookmarks, PDFs, images,
  files, code snippets) in a unified, ranked list
- Filter results by: item type, Collection, tag, favorite status,
  archived status, and date range
- Sort results by: relevance (default), most recently updated, most
  recently created, or title (A–Z)
- See their recent searches and re-run them quickly
- See paginated results for large result sets

## What Gets Searched

| Field | Included |
|---|---|
| Title | All types |
| Description | All types |
| Tags | All types |
| Note body content | Notes only |
| Extracted PDF text | PDFs only |
| Bookmark metadata (title, description, domain) | Website Bookmarks only |
| Code snippet content | Code Snippets only |
| Filename | Files, Images |

Archived items are included in results by default (marked with an
"Archived" badge) unless the user explicitly filters them out. Trashed
items are **never** included in Global Search results — they must be
restored first, or found via the separate Trash view.

## Search Mechanics

- Search is full-text, not just substring matching on titles — it must
  match against indexed content fields listed above.
- Relevance ranking should weight title matches above tag matches, and
  tag matches above body-content matches, so an exact title hit surfaces
  first.
- Search-as-you-type (instant results) is expected for the primary
  search bar, backed by a debounced query (e.g., ~200–300ms) to avoid
  overwhelming the backend on every keystroke.

## Filters

Filters are combinable (AND logic across filter categories, e.g., "type:
note AND tag: research AND collection: Thesis"). Within a single filter
category with multiple selections (e.g., two tags), OR logic is used
(item matches if it has *either* tag), which is the more useful default
for tag filtering specifically.

## Sorting

Default sort is relevance when a search query is present; when browsing
without a query (e.g., viewing "all items"), default sort is most
recently updated.

## Recent Searches

- The last several distinct search queries are stored per user and
  shown as suggestions when the search bar is focused with no query
  typed yet.
- Recent searches are a convenience list, not a saved-search feature —
  users cannot name or pin a recent search in the MVP (see Future).

## Performance Requirements

Per `Success_Metrics.md`, search must return results in under 500ms
server-side against a dataset of up to 5,000 items per user (validated
by the Thursday stress test in the Roadmap). This requires:
- Appropriate database indexes on searchable fields (see
  `03_Architecture/Database_Schema.md`)
- A full-text search index (e.g., Postgres `tsvector`/GIN index) rather
  than naive `LIKE` queries across large text fields
- Pagination at the database query level (not fetch-all-then-paginate
  client-side)

## Error States

- Empty query with no filters: show recent items instead of an empty
  state, so the search view is never just a blank box.
- No results for a query + filter combination: clear "no results" state
  that also suggests removing filters, rather than just "nothing found."
- Search backend timeout/error: show a retry-able error state distinct
  from "no results," so users don't mistake a failure for an empty
  result set.

## Out of Scope for MVP

- Semantic / AI-powered search (see `02_Development/Semantic_Search.md`)
- Saved searches (naming and re-running a specific filter combination
  later)
- Search across shared/public items belonging to other users (search is
  always scoped to the logged-in user's own data)

## Acceptance Criteria

- [ ] A single search bar returns ranked, mixed-type results across all
      Knowledge Items.
- [ ] Filters for type, Collection, tag, favorite, archived, and date
      range all work individually and in combination.
- [ ] Trashed items never appear in Global Search results.
- [ ] Recent searches are shown when the search bar is focused with no
      query.
- [ ] Search against a 5,000-item dataset returns within the 500ms
      performance target.
- [ ] Covered by unit tests (query-building/filter-combination logic),
      integration tests (search API correctness against seeded data),
      and a performance test using the 5,000-item generated dataset
      described in the Roadmap's Thursday QA plan.
