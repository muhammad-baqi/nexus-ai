# API Design (Conceptual)

## Purpose

This document sketches the API surface implied by the functional
requirements in `01_MVP/`, at the level of resources and operations —
not final route signatures, which the implementing engineer/agent should
finalize consistent with Next.js Route Handler conventions.

## Conventions

- RESTful resource-oriented routes under `/api/`.
- All routes (except public share-link viewing) require an authenticated
  session; authorization is additionally enforced at the database layer
  via RLS, per `Database_Schema.md`.
- List endpoints support pagination (`page`/`cursor` + `limit`),
  filtering, and sorting, consistent with `01_MVP/Search.md`.
- Mutating endpoints return the updated resource representation.

## Resource Groups

### Auth
Handled largely by Supabase Auth client SDK directly from the frontend;
application-specific routes are needed only for:
- `POST /api/auth/account` — account deletion (cascading, per
  `Authentication.md`)

### Collections
- `GET /api/collections` — list (with search/filter by name, archived
  state)
- `POST /api/collections`
- `GET /api/collections/:id`
- `PATCH /api/collections/:id`
- `DELETE /api/collections/:id` — soft delete (moves collection + items
  to Trash)
- `GET /api/collections/:id/stats`

### Knowledge Items
- `GET /api/items` — the primary listing/search endpoint; also backs
  Global Search when a `q` param is present, with filters for `type`,
  `collection_id`, `tag`, `favorite`, `archived`, date range, and `sort`
- `POST /api/items` — create (type-specific payload shape per type)
- `GET /api/items/:id`
- `PATCH /api/items/:id` — shared field updates (title, description,
  favorite, archived, collection_id/move) and type-specific content
  updates
- `DELETE /api/items/:id` — soft delete (Trash)
- `POST /api/items/:id/restore`
- `DELETE /api/items/:id/permanent`
- `POST /api/items/:id/share` — generate/enable a share link
- `DELETE /api/items/:id/share` — revoke
- `GET /api/share/:token` — public, unauthenticated read-only view

### Notes-Specific
- `GET /api/items/:id/versions`
- `GET /api/items/:id/versions/:versionId`
- `POST /api/items/:id/versions/:versionId/restore`

### Website Bookmarks-Specific
- `POST /api/items/:id/metadata/retry` — re-trigger metadata fetch job

### Tags
- `GET /api/tags`
- `PATCH /api/tags/:id` — rename
- `DELETE /api/tags/:id`
- `POST /api/tags/merge` — body: `{ source_tag_id, target_tag_id }`

### Dashboard
- `GET /api/dashboard` — aggregated endpoint returning recent items,
  recently viewed, favorites, recent collections, statistics, and
  upcoming reminders in one response, per the performance requirement in
  `01_MVP/Dashboard.md`

### Reminders
- `GET /api/items/:id/reminders`
- `POST /api/items/:id/reminders`
- `PATCH /api/reminders/:id`
- `DELETE /api/reminders/:id`

### Settings
- `GET /api/settings`
- `PATCH /api/settings` — profile, theme, notification preferences
- `POST /api/settings/export` — enqueue background export job
- `GET /api/settings/export/:jobId` — poll job status/download link
- `POST /api/settings/import` — enqueue background import job
- `GET /api/settings/import/:jobId` — poll job status/summary

### Trash
- `GET /api/trash` — list trashed items and collections
- (restore/permanent-delete reuse the item/collection routes above)

## Background Jobs (Not User-Facing HTTP Routes)

Represented as scheduled functions or queue consumers, not directly
exposed as API routes:
- Bookmark metadata fetch
- PDF text extraction
- Reminder scheduler (polls `reminders.next_fire_at`)
- Export/import processing

## Error Response Shape

A consistent error shape across all routes (e.g., `{ error: { code,
message } }`) so the frontend can handle errors uniformly rather than
special-casing each endpoint's failure format.
