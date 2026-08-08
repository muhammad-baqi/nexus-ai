# API Design

## Purpose

This document describes the API surface as actually implemented through Day 6 of the
build (`build-order-complete.md`), reconciled against the original conceptual sketch this
file used to contain. Route signatures, request/response shapes, and status codes below are
read directly off the route handlers in `app/api/**/route.ts` and the zod schemas in
`lib/validation/*.ts` — this is documentation of what exists, not a plan for what to build.
Where the original sketch predicted something that was never built, or something got built
differently than sketched, that's called out inline.

## Conventions

- RESTful resource-oriented routes under `/api/`.
- Every route (except `GET /api/share/:token` and `GET /api/cron/reminders`, both genuinely
  public/unauthenticated) requires a session. Route handlers call `requireUser(supabase)`
  (`lib/supabase/require-user.ts`), which pulls identity from `supabase.auth.getUser()` —
  never a client-supplied id — and short-circuits with `401 { error: { code:
  "unauthenticated", message: "You must be logged in." } }` if there is none.
- Authorization is additionally enforced at the database layer via RLS, per
  `Database_Schema.md` — route handlers also filter by `owner_id`/ownership explicitly, but
  that's defense-in-depth, not the real boundary (`CLAUDE.md` rule #1).
- Every route validates its input with a zod schema before touching Supabase
  (`lib/validation/*.ts`, `lib/reminders/validate-schedule.ts`). A failed parse returns `400
  { error: { code: "invalid_request", message } }`.
- List endpoints (`GET /api/items`, `GET /api/activity`) support `page` + `limit`. Filtering
  and sorting are documented per-endpoint below.
- Mutating endpoints return the updated resource representation, not just `{ ok: true }` —
  per `.claude/rules/api-routes.md`. A few intentional exceptions are noted inline (e.g.
  `DELETE /api/items/:id/permanent` returns `{ id, deleted: true }` since there's no
  resource left to return).
- Background work (bookmark metadata fetch, PDF text extraction, export/import job
  processing) runs via Next's `after()` inside the same request that enqueues it, closing
  over the already-authenticated Supabase client — it is deliberately **not** a separate
  webhook/route, unlike the original sketch assumed. The one true separate scheduled route is
  the reminder cron (see Reminders below).

## Error Response Shape

Every error response across every route uses the same shape:

```json
{ "error": { "code": "some_code", "message": "Human-readable message." } }
```

Common `code` values recur across resources: `invalid_request` (400), `unauthenticated`
(401), `unauthorized` (401, cron secret only), `not_found` (404), `duplicate_name` (409,
unique-name violations), and a resource-specific `*_failed` code (500) for unexpected
DB/storage errors. Route-specific codes (e.g. `collection_not_found`, `merge_incomplete`)
are called out below where they exist.

## Auth

Handled largely by the Supabase Auth client SDK directly from the frontend
(login/register/password reset/logout never go through an `/api/*` route). Two
application-specific routes exist:

- `POST /api/auth/account` — account deletion. Body: `{ password }`
  (`lib/validation/auth.ts#deleteAccountSchema`). Re-verifies the password via a stateless
  (non-cookie) Supabase client before deleting anything (`401 { code: "invalid_password" }`
  on mismatch). Best-effort cleans up the caller's `avatars` bucket objects (a failure there
  never blocks the real deletion, per `CLAUDE.md` rule #7), then calls
  `admin.auth.admin.deleteUser`, cascading every owned row via each table's `on delete
  cascade` FK. Returns `{ deleted: true }`.
- `GET /auth/confirm` (outside `/api`, not a JSON API — a redirect handler) — verifies the
  `token_hash`/`type` query pair from a Supabase email link (`type=email` for verification,
  `type=recovery` for password reset) via `supabase.auth.verifyOtp`, then redirects to
  `/verify-email?status=...` or `/reset-password?status=...` (`success` / `expired` /
  `invalid`). Not part of the original sketch, which only anticipated the account-deletion
  route.

## Collections

- `GET /api/collections` — list. Query: `view` (`active` default | `archived` | `trashed`,
  `lib/validation/collections.ts#listCollectionsQuerySchema`), `q` (name substring filter,
  accepted but not currently called by the UI, which filters client-side). A `trashed`
  collection is excluded from both `active` and `archived` regardless of its own
  `is_archived` flag. Sorted favorites-first, then name. Response: `{ collections: [...] }`.
- `POST /api/collections` — body: `{ name, description?, color?, icon? }`
  (`createCollectionSchema`; `color`/`icon` default to `"gray"`/`"folder"`). `409 {
  code: "duplicate_name" }` on the `(owner_id, lower(name))` unique index. `201` with the
  created row on success. Logs an `activity_log` "created" row.
- `GET /api/collections/:id` — single collection (excludes trashed). `404` if missing/trashed/
  not owned.
- `PATCH /api/collections/:id` — body: any of `name, description, color, icon, is_favorite,
  is_archived` (`updateCollectionSchema`, at least one field required). Same `duplicate_name`
  conflict handling as create. Logs "edited".
- `DELETE /api/collections/:id` — soft delete (`deleted_at`). Cascades: also soft-deletes
  every non-trashed item in the collection with the *same* `deleted_at` timestamp (so restore
  can later tell "trashed with this collection" apart from an item trashed individually
  beforehand). Not transactional — a cascade failure returns the collection with
  `itemCascadeIncomplete: true` rather than silently reporting full success. Logs "deleted".
- `POST /api/collections/:id/restore` — restores a trashed collection and cascade-restores
  only the items that share its exact trashed-together `deleted_at` timestamp. Same
  `itemCascadeIncomplete` partial-failure signal as delete. Logs "restored".
- `GET /api/collections/:id/stats` — computed on read (no stored counter): `{ total,
  by_type: { [type]: count }, last_updated }` over the collection's non-trashed items.

## Knowledge Items

- `GET /api/items` — the primary listing/search endpoint; also backs Global Search when `q`
  is present. Query params (`lib/validation/items.ts#listItemsQuerySchema`): `q`,
  `collection_id`, `type`, `tag` (repeatable, OR-matched), `favorite`, `archived`
  (`"true"`/`"false"` literal strings, not zod-coerced booleans), `created_from`/`created_to`
  (date strings; `created_to` is pushed to end-of-day inclusive), `sort` (`relevance` |
  `updated` | `created` | `title`; defaults to `relevance` when `q` is present, else
  `updated`), `page` (default 1), `limit` (default 20, max 100). Backed entirely by the
  `search_knowledge_items()` Postgres function (`005_search_function.sql`) — one indexed
  query rather than a fluent-query-plus-tag-round-trip. Response: `{ items: [{ id,
  collection_id, type, title, is_favorite, is_archived, created_at, updated_at }], total,
  page, limit }` (list rows are summary shape, not the full item).
- `POST /api/items` — dispatches on the required `type` field in the body
  (`"note" | "website" | "pdf" | "image" | "file" | "code_snippet"`), each with its own zod
  schema and create path:
  - `note`: `{ type: "note", collection_id, title?, description? }` — title defaults to
    "Untitled Note".
  - `website`: `{ type: "website", collection_id, url, confirmDuplicate? }` — item is created
    immediately with the raw URL as title; metadata fetch runs async via `after()`
    (`fetchBookmarkMetadata`). If a non-`confirmDuplicate` submit matches an existing
    bookmark's normalized URL, returns `200 { duplicate: true, existingItemId }` instead of
    creating anything — a soft prompt, not a 409 rejection.
  - `pdf` | `image` | `file`: `{ type, collection_id, storage_path, filename, mime_type,
    size_bytes }` — the file's bytes are already uploaded direct-to-Storage by the client;
    this call re-verifies `storage_path` ownership prefix, size/mime against
    `lib/files/constants.ts`, and content-sniffs the actual bytes
    (`verifyUploadedFileContent`) before creating the `knowledge_items` + `file_assets` rows.
    Any rejection past the initial upload deletes the orphaned Storage object. PDF items
    trigger async text extraction via `after()`.
  - `code_snippet`: `{ type: "code_snippet", collection_id, title?, language?, code_content?
    }` — all content fields optional (blank-snippet-then-edit flow, like notes).
  All branches: `404 { code: "not_found" }` if `collection_id` isn't owned by the caller;
  `201` with the created `knowledge_items` row; logs "created".
- `GET /api/items/:id` — full detail. Also records an `item_views` upsert (Dashboard's
  "Recently Viewed", best-effort). Response is the `knowledge_items` row plus `tags` (`[]` or
  `null` if the tag read itself failed — distinguished so the client never overwrites a good
  local list), `share_link` (`{ token, url } | null`), and exactly one of
  `website_metadata`, `file_asset` (includes a freshly-signed `download_url`), or
  `code_snippet_data`, depending on `type`.
- `PATCH /api/items/:id` — body (`updateItemSchema`, at least one field besides
  `openVersionId` required): `title, description, is_favorite, is_archived, collection_id`
  (shared fields), `openVersionId` (notes — which `note_versions` row to coalesce into; a new
  boundary is opened if omitted/mismatched), `language`/`code_content` (code snippets only,
  written to `code_snippet_data` and type-gated server-side, silently ignored on other
  types). Moving `collection_id` re-verifies ownership of the target (`404 { code:
  "collection_not_found" }`, distinct from the item's own `not_found`). A note description
  change writes a `note_versions` row (insert or coalescing update); response includes
  `versionId` for the client to echo on the next save. Response: updated item + `tags` +
  `versionId` + (`code_snippet_data` when relevant). Logs "edited".
- `DELETE /api/items/:id` — soft delete (Trash). Best-effort deactivates the item's active
  reminders (`deactivateRemindersForItem`, marks `deactivated_by_trash`). Logs "deleted".
- `POST /api/items/:id/restore` — restores from Trash. If the item's original collection was
  itself deleted (and not restored), re-homes into "Inbox" by name, falling back to the
  caller's oldest surviving collection if Inbox was renamed/gone. Response includes
  `rehomed`/`rehomedToCollectionName` when a re-home happened. Best-effort reactivates
  reminders that this app itself deactivated via trashing (not ones the user had already
  cancelled). Logs "restored".
- `DELETE /api/items/:id/permanent` — only deletable *from* Trash (guards against
  hard-deleting a still-active item). Deletes the Storage object for `pdf`/`image`/`file`
  items after the DB row is confirmed gone. Response: `{ id, deleted: true }` (no resource to
  return).
- `POST /api/items/:id/share` — idempotent: an already-shared item returns its existing
  active token rather than creating a second one. Response: `{ token, url }` (`201` on
  create, `200` when reusing an existing link). Logs "shared".
- `DELETE /api/items/:id/share` — soft-revokes (`is_active = false`); a later POST creates a
  fresh row with a new token rather than reactivating. No-op success if nothing was active.
  Response: `{ revoked: true }`.
- `GET /api/share/:token` — **public, unauthenticated**, the one other route (besides the
  cron below) that legitimately uses the service-role admin client, since there's no session
  to scope through. `404 { code: "not_found" }` for an invalid/revoked token; `404 { code:
  "unavailable" }` if the item behind a still-active link has since been trashed. Response is
  deliberately narrow — `id, title, description, type`, plus exactly one type-appropriate
  block (`website_metadata` with `url/domain/og_image_url/favicon_url`; `file_asset` with a
  freshly-signed `download_url`; `code_snippet_data`) — never tags, collection, owner, or any
  other account data.

## Notes-Specific

- `GET /api/items/:id/versions` — `[{ id, created_at }]`, newest first. Explicit ownership
  check on the parent item (not just relying on `note_versions`' RLS) so a foreign/nonexistent
  item id 404s rather than looking like "no versions yet".
- `GET /api/items/:id/versions/:versionId` — `{ id, content, created_at }`, scoped by both
  ids so a version id belonging to another of the caller's own items can't resolve here.
  `404` if the parent item is trashed (its version history becomes unreadable, matching
  Knowledge_Items.md's "no longer available" treatment).
- `POST /api/items/:id/versions/:versionId/restore` — copies the version's `content` back
  onto the item's `description` and writes a **new** `note_versions` entry (restoring never
  deletes/overwrites history). Response: updated item + `versionId` (of the new history
  entry; `null` if that bookkeeping insert failed, even though the restore itself succeeded).

## Website Bookmarks-Specific

- `POST /api/items/:id/metadata/retry` — re-triggers the background metadata fetch
  (`fetchBookmarkMetadata` via `after()`). `400` if the item isn't type `website`. Resets
  `website_metadata.fetch_status` to `"pending"` before returning. Response: `{ id, type,
  website_metadata }`.

## Tags

- `GET /api/tags` — all of the caller's tags, `{ tags: [{ id, name }] }`, name-sorted.
- `PATCH /api/tags/:id` — rename. Body: `{ name }`. `409 { code: "duplicate_name" }` on the
  `(owner_id, lower(name))` unique index.
- `DELETE /api/tags/:id` — deletes the tag; its `knowledge_item_tags` rows cascade away.
- `POST /api/tags/merge` — body: `{ source_tag_id, target_tag_id }`
  (`mergeTagsSchema`; rejects merging a tag into itself). Reassigns every item tagged
  `source` onto `target` (`ignoreDuplicates` handles items that already carry both), then
  deletes `source`. If the reassign succeeds but the source delete fails, returns a distinct
  `500 { code: "merge_incomplete" }` rather than silently under-reporting. Response on full
  success: `{ merged: true, target_tag_id }`.
- `POST /api/items/:id/tags` — attach a tag to an item, creating the tag first if it doesn't
  exist yet (case-insensitive match against the caller's own tags,
  `getOrCreateTag`). Body: `{ name }`. Attaching an already-attached tag is a no-op, not an
  error. Response: `201 { tag, tags }` (`tags` is the item's full current tag list, so the
  client can merge without a second round trip). **Not present in the original API sketch**,
  which only documented the top-level `/api/tags` CRUD + merge group.
- `DELETE /api/items/:id/tags/:tagId` — detach; detaching a not-currently-attached tag is a
  no-op success (this app's general idempotent-delete convention). Response: `{ tags }`.
  Same "not in the original sketch" note as above.

## Search

- `GET /api/recent-searches` — `{ searches: [query, ...] }`, the caller's last 8 distinct
  settled queries, most-recent-first.
- `POST /api/recent-searches` — body: `{ query }`. Re-running an existing query bumps it to
  the top rather than duplicating (delete-then-insert, case-insensitive exact match with
  `%`/`_` escaped so a literal query containing those characters isn't treated as an `ilike`
  pattern). Self-trims to the 8-item cap. Response: `201 { query }`. **Not present in the
  original sketch at all** — Search was originally folded entirely into `GET /api/items`;
  "recent searches" as its own persisted, server-backed resource was added during Day 4 and
  never retrofitted into this doc until now.

## Dashboard

- `GET /api/dashboard` — aggregated endpoint, six independently-loaded sections running in
  parallel via `Promise.all`, each individually try/caught so one section failing (e.g. a
  timeout) never blocks the rest: `recentItems` (via `search_knowledge_items` with no
  filters, sort=updated), `recentlyViewed` (via the `item_views` table +
  `dashboard_recently_viewed()` RPC — distinct from "recently edited"), `favorites`
  (favorited collections + favorited items together), `recentCollections` (via
  `dashboard_recent_collections()` RPC — latest of the collection's own `updated_at` and its
  items', excluding archived collections), `statistics` (`{ totalItems, totalCollections,
  byType }` via `dashboard_item_type_counts()`), `upcomingReminders` (active, future-dated,
  soonest-first). Each section's value is `{ data, error: null } | { data: null, error:
  "<section>_failed" }` so the client can render every other section even when one fails.

## Reminders

- `GET /api/items/:id/reminders` — `{ reminders: [...] }`, both active and cancelled (history
  is preserved, not hidden).
- `POST /api/items/:id/reminders` — body is a discriminated union on `type`
  (`lib/reminders/validate-schedule.ts#reminderScheduleInputSchema`): `one_time` (`fire_at`,
  must be future-dated), `daily`/`weekly`/`monthly` (`hour`, `minute`, plus `dayOfWeek`/
  `dayOfMonth`), or `custom` with `kind: "every_n_days" | "every_weekday"` — not a general
  recurrence-rule parser, just the two concrete forms `Notifications.md` names. `next_fire_at`
  is computed server-side (`computeNextFireAt`) except for `one_time`, which uses the
  caller-supplied `fire_at` directly. Response: `201 { reminder }`.
- `PATCH /api/reminders/:id` — same schedule union as create; explicit ownership check via
  `verifyReminderOwnership` (transitively through `knowledge_item_id`) ahead of RLS, for a
  clean `404` instead of a generic zero-rows-affected response. Reschedules future sends from
  *now*, not chained off the old `next_fire_at`. Response: `{ reminder }`.
- `DELETE /api/reminders/:id` — soft cancel (`is_active = false`), history preserved, not a
  real delete. Response: `{ reminder }`.
- `GET /api/cron/reminders` — **the scheduler itself, and a genuinely public HTTP route** (no
  user session), protected instead by a shared-secret bearer token
  (`Authorization: Bearer $CRON_SECRET`, `401 { code: "unauthorized" }` otherwise). Triggered
  by Vercel Cron. This deviates from the original sketch, which assumed the reminder
  scheduler would be "represented as a scheduled function... not directly exposed as an API
  route" — in the actual implementation it *is* an HTTP route, just one with its own
  secret-based auth instead of a user session, since Vercel Cron's mechanism is an HTTP GET.
  Atomically claims due reminders via a single `UPDATE ... RETURNING` (guards against two
  overlapping invocations double-sending), processes each independently (one failure never
  blocks the batch), applies a 24h grace period past which a reminder is logged as "missed"
  rather than sent, and backs off (bumping `failure_count`, not `next_fire_at`) after a send
  failure, giving up after 5 consecutive failures. Response: `{ processed, sent, toggle_off,
  missed, backoff, gave_up, no_email, error }` counts.

## Settings

- `GET /api/settings` — `{ display_name, avatar_url, theme_preference, language_preference,
  notification_email_enabled }`. `avatar_url` is a freshly-signed URL derived from the
  private `avatars` bucket object path stored in `profiles.avatar_url`, never the raw path or
  a public URL.
- `PATCH /api/settings` — body (`profileUpdateSchema`, all optional): `display_name,
  avatar_path, theme_preference, language_preference, notification_email_enabled`.
  `avatar_path` is validated to exactly match `"${user.id}/avatar"` (the only path the
  upload flow itself ever writes to) before being trusted onto the row. `language_preference`
  only accepts `"en"` today (scaffolding for future localization, per `Settings.md`) — any
  other value 400s. Response: same shape as GET.
- `POST /api/settings/export` — body: `{ format: "markdown" | "json" | "zip" }`. Inserts a
  `pending` `export_jobs` row and returns immediately (`202`); the actual export
  (`runExportJob`) runs via `after()`, never inline. Response: `{ id, format, status,
  created_at }`.
- `GET /api/settings/export/:jobId` — poll job status. Scoped to `owner_id` explicitly so a
  guessed/foreign job id 404s rather than leaking existence. Response: `{ id, format, status,
  error_message, created_at, completed_at, download_url }` — `download_url` is a freshly-
  signed URL, populated only once `status === "success"`.
- `POST /api/settings/import` — body: `{ storage_path, source_format: "json" | "markdown" }`.
  The source file is already uploaded direct-to-Storage by the client; this validates the
  path's owner-prefix, inserts a `pending` `import_jobs` row, and enqueues `runImportJob` via
  `after()`. Response: `202 { id, source_format, status, created_at }`.
- `GET /api/settings/import/:jobId` — poll job status/summary, same owner-scoping as the
  export poll route. Response: `{ id, source_format, status, error_message, created_count,
  skipped_count, skip_reasons, created_at, completed_at }`.

## Trash

- `GET /api/trash` — `{ items: [...], collections: [...] }`, both lists loaded in parallel.
  Restore and permanent-delete reuse the item/collection routes documented above
  (`POST /api/collections/:id/restore`, `POST /api/items/:id/restore`,
  `DELETE /api/items/:id/permanent`) — there is no permanent-delete route for collections,
  only items, matching `Collections.md`/`Knowledge_Items.md`.

## Activity

`GET /api/activity` — a per-account timeline, most-recent-first, paginated the same way
`GET /api/items` is (`page`/`limit`, default 50, max 100). Embeds the target item's/
collection's *current* title/name via a PostgREST join; a target since permanently deleted
just shows the bare action with no label (`activity_log`'s FKs are `on delete set null` — the
log row itself always survives). Response: `{ activity: [...], total, page, limit }`. **Not
present in the original sketch** — Activity Log as a resource and this route were added on
Day 6 and never retrofitted into this doc until now.
