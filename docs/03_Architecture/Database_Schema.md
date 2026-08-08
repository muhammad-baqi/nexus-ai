# Database Schema

## Purpose

This document describes the schema as it actually exists after `supabase/migrations/001`
through `010`, reconciled against the original conceptual sketch this file used to contain.
It describes the current state of each table/function/policy — where a later migration
redefined or extended something from `001_initial_schema.sql`, only the final, current
behavior is documented (the migration history itself is the audit trail for that; see
`.claude/rules/database.md`: `001` is already applied to staging/prod, so nothing after it
ever edits it directly — only adds or `create or replace`s).

## Enums

Defined in `001_initial_schema.sql` unless noted:

- `knowledge_item_type`: `note | website | pdf | image | file | code_snippet`
- `fetch_status_type`: `pending | success | failed`
- `extraction_status_type`: `not_applicable | pending | success | failed`
- `reminder_type`: `one_time | daily | weekly | monthly | custom`
- `activity_action_type`: `created | edited | deleted | restored | shared`
- `theme_preference_type`: `light | dark | system`
- `data_job_status` (`009_settings_data_jobs.sql`): `pending | processing | success | failed`
- `export_format_type` (`009`): `markdown | json | zip`
- `import_source_format_type` (`009`): `json | markdown`

## Core Tables

### profiles
Linked 1:1 to `auth.users` (Supabase Auth). Auto-created by the `handle_new_user` trigger.

- `id` uuid PK, references `auth.users(id) on delete cascade`
- `display_name` text
- `avatar_url` text — despite the name, stores a private Storage *object path* (e.g.
  `{user_id}/avatar`), not a public URL. The `avatars` bucket is private; callers sign it via
  `createSignedUrl` before rendering (`lib/supabase/avatar.ts`).
- `theme_preference` theme_preference_type, not null, default `'system'`
- `notification_email_enabled` boolean, not null, default `true`
- `language_preference` text, not null, default `'en'` — added in `009_settings_data_jobs.sql`;
  only `"en"` is accepted at the application layer today (scaffolding for future
  localization), but the column itself is unconstrained text.
- `created_at` timestamptz, not null, default `now()`

RLS: `profiles_owner_access` — `id = auth.uid()`, both `using` and `with check`.

### collections
- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `name` text, not null
- `description` text
- `color` text
- `icon` text
- `is_favorite` boolean, not null, default `false`
- `is_archived` boolean, not null, default `false`
- `deleted_at` timestamptz — nullable, Trash support
- `created_at`, `updated_at` timestamptz, not null, default `now()`

Indexes: unique on `(owner_id, lower(name)) where deleted_at is null`; `(owner_id,
deleted_at)`.

Trigger: `collections_set_updated_at` — before update, `set_updated_at()` (see Functions
below).

RLS: `collections_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

### knowledge_items
The shared base table for every item type.

- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `collection_id` uuid, references `collections(id) on delete cascade`, **not null** — every
  item belongs to exactly one collection (the sketch left this ambiguous; in practice it's a
  required FK, with new users seeded a default "Inbox" collection to always have a home).
- `type` knowledge_item_type, not null
- `title` text, not null
- `description` text — doubles as a note's body content; there is no separate note-body
  column (Day 3 scope decision).
- `is_favorite` boolean, not null, default `false`
- `is_archived` boolean, not null, default `false`
- `deleted_at` timestamptz — nullable
- `created_at`, `updated_at` timestamptz, not null, default `now()`
- `search_vector` tsvector — see Search Vector Maintenance below

Type-specific data lives in dedicated 1:1 child tables (`website_metadata`, `file_assets`,
`code_snippet_data`), not a flexible JSON column, exactly per the original sketch's
recommendation — every type's searchable content needed to be indexed, which drove that
choice.

Indexes: `gin(search_vector)`; `(collection_id)`; `(owner_id, deleted_at)`; `(owner_id,
deleted_at, updated_at desc)` and `(owner_id, deleted_at, created_at desc)` (added in
`004_search_ranking.sql` — narrow the common "browse without a query" scan at the 5,000-item
scale; they do **not** let Postgres skip sorting for `search_knowledge_items()`'s
`CASE WHEN`-wrapped `ORDER BY`, which a plain btree can't satisfy).

Trigger: `knowledge_items_set_updated_at` — before update, `set_updated_at()`.
Trigger: `knowledge_items_search_vector_trigger` — before insert/update of `title,
description`, populates `search_vector` via `knowledge_item_search_vector()` (see below).

RLS: `knowledge_items_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

### note_versions
- `id` uuid PK, default `gen_random_uuid()`
- `knowledge_item_id` uuid, references `knowledge_items(id) on delete cascade`
- `content` text, not null — Markdown snapshot
- `created_at` timestamptz, not null, default `now()`

Index: `(knowledge_item_id, created_at desc)`.

RLS: `note_versions_owner_access` — owner-scoped transitively: `exists (select 1 from
knowledge_items ki where ki.id = note_versions.knowledge_item_id and ki.owner_id =
auth.uid())`, both `using` and `with check`.

### website_metadata
1:1 with a `website`-type item.

- `knowledge_item_id` uuid PK, references `knowledge_items(id) on delete cascade`
- `url` text, not null
- `canonical_url` text
- `domain` text
- `og_image_url` text
- `favicon_url` text
- `screenshot_url` text — nullable; column exists but no feature currently writes to it
- `fetch_status` fetch_status_type, not null, default `'pending'`

RLS: `website_metadata_owner_access` — owner-scoped transitively through
`knowledge_item_id`'s `knowledge_items.owner_id`, both `using` and `with check`.

### file_assets
1:1 with a `pdf`/`image`/`file`-type item.

- `knowledge_item_id` uuid PK, references `knowledge_items(id) on delete cascade`
- `storage_path` text, not null — object path in the `files` Storage bucket
- `original_filename` text, not null
- `mime_type` text, not null
- `size_bytes` bigint, not null
- `extracted_text` text — nullable; PDFs only, feeds `search_vector` (see below)
- `extraction_status` extraction_status_type, not null, default `'not_applicable'`

Trigger (`007_file_uploads.sql`): `file_assets_search_vector_trigger` — after insert/update
of `extracted_text`, re-derives the parent `knowledge_items.search_vector` via
`knowledge_item_search_vector()`.

RLS: `file_assets_owner_access` — owner-scoped transitively through `knowledge_item_id`,
both `using` and `with check`.

### code_snippet_data
1:1 with a `code_snippet`-type item.

- `knowledge_item_id` uuid PK, references `knowledge_items(id) on delete cascade`
- `language` text, not null
- `code_content` text, not null

Trigger (`008_code_snippets_search.sql`): `code_snippet_data_search_vector_trigger` — after
insert/update of `language, code_content`, re-derives the parent item's `search_vector`.

RLS: `code_snippet_data_owner_access` — owner-scoped transitively through
`knowledge_item_id`, both `using` and `with check`.

### tags
- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `name` text, not null
- `created_at` timestamptz, not null, default `now()`

Index: unique on `(owner_id, lower(name))`.

Trigger (`004_search_ranking.sql`): `tags_search_vector_trigger` — after update of `name`,
re-derives `search_vector` on every `knowledge_items` row currently tagged with the renamed
tag.

RLS: `tags_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

### knowledge_item_tags
Join table.

- `knowledge_item_id` uuid, references `knowledge_items(id) on delete cascade`
- `tag_id` uuid, references `tags(id) on delete cascade`
- PK: `(knowledge_item_id, tag_id)`

Trigger (`004_search_ranking.sql`): `knowledge_item_tags_search_vector_trigger` — after
insert/delete, re-derives the affected item's `search_vector` (so attaching/detaching a tag
keeps search current without bumping the item's `updated_at` — see `set_updated_at()` below).

RLS: `knowledge_item_tags_owner_access` — requires both the referenced `knowledge_items` row
and the referenced `tags` row to belong to `auth.uid()`, both `using` and `with check`.

### reminders
- `id` uuid PK, default `gen_random_uuid()`
- `knowledge_item_id` uuid, references `knowledge_items(id) on delete cascade`
- `type` reminder_type, not null
- `schedule` jsonb, not null, default `'{}'` — recurrence definition; shape depends on
  `type` (see `lib/reminders/recurrence.ts`/`lib/reminders/validate-schedule.ts` — e.g.
  `{ hour, minute }` for daily, `{ hour, minute, dayOfWeek }` for weekly, `{ kind,
  intervalDays }` for a custom every-N-days rule)
- `next_fire_at` timestamptz — nullable
- `is_active` boolean, not null, default `true`
- `created_at` timestamptz, not null, default `now()`
- `deactivated_by_trash` boolean, not null, default `false` — added in `010_reminders.sql`;
  distinguishes "auto-deactivated because its item was trashed" from a user's own manual
  cancel, so restore only ever reactivates the former.
- `last_fired_at` timestamptz — added in `010`; scheduler bookkeeping, last successful send.
- `failure_count` integer, not null, default `0` — added in `010`; consecutive-failure
  counter for the scheduler's retry-with-backoff.
- `claimed_at` timestamptz — added in `010`; set by the cron scheduler's atomic claim
  `UPDATE` before processing a due reminder, cleared once resolved — prevents two overlapping
  cron invocations from double-sending the same reminder.

Index: `(next_fire_at, is_active) where is_active` — the scheduler's due-reminder poll.

RLS: `reminders_owner_access` — owner-scoped transitively through `knowledge_item_id`, both
`using` and `with check`. `010_reminders.sql`'s new columns need no additional policy — the
existing policy already covers every column on the table.

### share_links
- `id` uuid PK, default `gen_random_uuid()`
- `knowledge_item_id` uuid, references `knowledge_items(id) on delete cascade`
- `token` text, not null — unique, unguessable
- `is_active` boolean, not null, default `true`
- `created_at` timestamptz, not null, default `now()`

Index: unique on `(token)`.

RLS: `share_links_owner_access` — owner-scoped transitively through `knowledge_item_id`,
both `using` and `with check`. Note: the *owner-facing* create/revoke routes go through this
RLS-scoped policy; the *public* `GET /api/share/:token` route reads through the service-role
admin client instead, since there's no session to scope through at all for an anonymous
viewer (see `API_Design.md`).

### activity_log
- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `knowledge_item_id` uuid, references `knowledge_items(id) on delete set null` — nullable;
  some activity is collection-level
- `collection_id` uuid, references `collections(id) on delete set null` — nullable
- `action` activity_action_type, not null (`created | edited | deleted | restored | shared`)
- `created_at` timestamptz, not null, default `now()`

Index: `(owner_id, created_at desc)`.

RLS: `activity_log_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

Note the `on delete set null` FKs: a permanently-deleted item/collection doesn't take its
activity history with it — the log row survives with a nulled-out reference, and
`GET /api/activity` just shows the bare action with no label in that case.

### recent_searches
- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `query` text, not null
- `created_at` timestamptz, not null, default `now()`

Index: `(owner_id, created_at desc)`.

RLS: `recent_searches_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

## Tables Added After the Original Sketch

These tables didn't exist in the original conceptual model — they were added as Day 4–6
features were built out and needed dedicated storage the original sketch hadn't anticipated.

### item_views
Added in `006_dashboard.sql`, for Dashboard's "Recently Viewed" — explicitly distinct from
"recently edited" (`activity_log`'s `edited` action); tracks opening an item, one row per
`(item, owner)` pair (only "when did I last open this" is needed, not a full view history).

- `knowledge_item_id` uuid, references `knowledge_items(id) on delete cascade`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `viewed_at` timestamptz, not null, default `now()`
- PK: `(knowledge_item_id, owner_id)`

Index: `(owner_id, viewed_at desc)`.

RLS: `item_views_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

### export_jobs
Added in `009_settings_data_jobs.sql`, backing Settings' background data export.

- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `format` export_format_type, not null
- `status` data_job_status, not null, default `'pending'`
- `storage_path` text — nullable; set once the export file is written
- `error_message` text — nullable
- `created_at` timestamptz, not null, default `now()`
- `completed_at` timestamptz — nullable

Index: `(owner_id, created_at desc)`.

RLS: `export_jobs_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

### import_jobs
Added in `009_settings_data_jobs.sql`, backing Settings' background data import. Kept as a
separate table from `export_jobs` rather than one polymorphic table — their success-state
columns genuinely differ (an import has counts/skip-reasons; an export has a download path).

- `id` uuid PK, default `gen_random_uuid()`
- `owner_id` uuid, references `auth.users(id) on delete cascade`
- `source_format` import_source_format_type, not null
- `source_storage_path` text, not null — the client-uploaded source file
- `status` data_job_status, not null, default `'pending'`
- `created_count` integer, not null, default `0`
- `skipped_count` integer, not null, default `0`
- `skip_reasons` jsonb, not null, default `'[]'`
- `error_message` text — nullable
- `created_at` timestamptz, not null, default `now()`
- `completed_at` timestamptz — nullable

Index: `(owner_id, created_at desc)`.

RLS: `import_jobs_owner_access` — `owner_id = auth.uid()`, both `using` and `with check`.

## Functions & Triggers

### set_updated_at()
Generic `before update` trigger function used by `collections` and `knowledge_items`.
Originally a flat `new.updated_at := now()`; **redefined** in `004_search_ranking.sql` to
only bump `updated_at` when something *other than* `updated_at`/`search_vector` actually
changed — otherwise a tag attach/detach (which updates `knowledge_items.search_vector`
directly via its own trigger, not through the row's own update path) would silently reorder
"recently updated" sort as a side effect. Applies to both tables it's attached to.

### knowledge_item_search_vector(item_id, item_title, item_description) returns tsvector
Introduced in `004_search_ranking.sql`, **redefined twice more** (`007_file_uploads.sql`,
`008_code_snippets_search.sql`) as new searchable content types were added. Current (final)
weighting, per `Search.md`'s "title > tag > body" ranking:

- weight A: `title`
- weight B: the item's tag names (joined via `knowledge_item_tags`/`tags`)
- weight C: `description`, `file_assets.extracted_text` (PDF text), and
  `code_snippet_data.code_content` — all treated as body content
- weight D: `code_snippet_data.language`

This function is `stable sql`, not a trigger itself — it's called by every
`*_search_vector_update`/`*_refresh_search_vector` trigger function below, and directly by
`005_search_function.sql`'s backfill.

### knowledge_items_search_vector_update() — trigger function
`before insert or update of title, description on knowledge_items`. Calls
`knowledge_item_search_vector()` and assigns the result to `new.search_vector`.

### knowledge_item_tags_refresh_search_vector() — trigger function
Added in `004_search_ranking.sql`. `after insert or delete on knowledge_item_tags` — updates
the affected `knowledge_items` row's `search_vector` directly (an `UPDATE`, not a `NEW`
assignment, since this fires on the join table, not `knowledge_items` itself).

### tags_refresh_search_vector() — trigger function
Added in `004_search_ranking.sql`. `after update of name on tags` — when a tag is renamed,
updates `search_vector` on every `knowledge_items` row currently tagged with it.

### file_assets_refresh_search_vector() — trigger function
Added in `007_file_uploads.sql`. `after insert or update of extracted_text on file_assets` —
updates the parent item's `search_vector` once PDF text extraction completes.

### code_snippet_data_refresh_search_vector() — trigger function
Added in `008_code_snippets_search.sql`. `after insert or update of language, code_content
on code_snippet_data` — updates the parent item's `search_vector` on snippet content changes.

### handle_new_user() — trigger function
`security definer`, `after insert on auth.users`. Provisions a `profiles` row and a default
"Inbox" collection for every new signup. `Inbox` has no dedicated "is default" schema marker
— it's identified by name at read time (e.g. the item-restore fallback path), which matters
because Collections are renamable.

### search_knowledge_items(...) returns table(...)
Added in `005_search_function.sql`. The single server-side function backing `GET /api/items`'
full `q`/filter/sort/pagination combination — a plain PostgREST fluent query can't express
`ts_rank`-based ordering or a tag OR-filter without an extra round trip. Parameters:
`p_owner_id, p_query, p_collection_id, p_type, p_tag_ids[], p_favorite, p_archived,
p_created_from, p_created_to, p_sort, p_limit, p_offset`. Returns item summary rows plus a
`total_count` window column. **Not** `security definer` — runs as the calling (authenticated)
role, so RLS on `knowledge_items` still applies underneath; `p_owner_id` is a redundant,
explicit filter for defense-in-depth. `granted to authenticated`.

### dashboard_recently_viewed(p_owner_id, p_limit) returns table(...)
Added in `006_dashboard.sql`. Joins `item_views` to `knowledge_items` for Dashboard's
"Recently Viewed" section. Not `security definer`; `granted to authenticated`.

### dashboard_recent_collections(p_owner_id, p_limit) returns table(...)
Added in `006_dashboard.sql`. Returns non-archived, non-trashed collections ordered by
`greatest(collection.updated_at, max(its items' updated_at))` — "most recently active", not
alphabetical. Not `security definer`; `granted to authenticated`.

### dashboard_item_type_counts(p_owner_id) returns table(item_type, item_count)
Added in `006_dashboard.sql`. `group by type` count over the caller's non-trashed items. Not
`security definer`; `granted to authenticated`.

## Row Level Security

Every table above has RLS enabled and a policy in the same migration that created it — no
table went live without one (`CLAUDE.md` rule #1). The pattern used throughout:

- **Directly owner-scoped** (`owner_id = auth.uid()`, both `using` and `with check`):
  `profiles` (via `id = auth.uid()`), `collections`, `knowledge_items`, `tags`,
  `activity_log`, `recent_searches`, `item_views`, `export_jobs`, `import_jobs`.
- **Transitively owner-scoped through `knowledge_item_id`** (an `exists` subquery against
  `knowledge_items.owner_id`): `note_versions`, `website_metadata`, `file_assets`,
  `code_snippet_data`, `reminders`, `share_links`.
- **Transitively owner-scoped through both `knowledge_item_id` and `tag_id`**:
  `knowledge_item_tags` (must own both the item and the tag being linked).

The two routes that don't go through a user's RLS-scoped session client at all —
`GET /api/share/:token` (public share viewing) and `GET /api/cron/reminders` (the scheduler)
— use the service-role admin client (`lib/supabase/admin.ts`) instead, and are the only
places in the app where that's the correct call, per `API_Design.md`.

### A note on grants (003_grant_table_privileges.sql)
`001_initial_schema.sql` shipped every table's RLS policy correctly, but migrations run as
the `postgres` role, whose default-privilege entry for the `public` schema only included
`Dxtm` (delete/references/trigger/maintain) for `anon`/`authenticated`/`service_role` — not
`arw` (select/insert/update). RLS policies are meaningless without the underlying `GRANT`;
every table from `001` was missing it. This didn't surface until `PATCH /api/settings` (the
first write path that wasn't either Supabase Auth's own `auth.users` table or the `security
definer` `handle_new_user` trigger, both of which bypass role-based grants). `003` fixes this
retroactively (`grant select, insert, update, delete on all tables in schema public to anon,
authenticated, service_role`) and sets `alter default privileges` so every table created by
migrations *after* `003` gets the same grants automatically, matching Supabase's standard
project default.

## Indexing Notes

- `knowledge_items`: `gin(search_vector)` for full-text search; `(collection_id)`;
  `(owner_id, deleted_at)`; `(owner_id, deleted_at, updated_at desc)` and `(owner_id,
  deleted_at, created_at desc)` for the two default sort orders at the 5,000-item scale.
- `collections`: unique `(owner_id, lower(name)) where deleted_at is null`; `(owner_id,
  deleted_at)`.
- `tags`: unique `(owner_id, lower(name))`.
- `reminders`: `(next_fire_at, is_active) where is_active` — the scheduler's due-reminder
  polling query.
- `share_links`: unique `(token)`.
- `note_versions`: `(knowledge_item_id, created_at desc)`.
- `activity_log`, `recent_searches`, `item_views`, `export_jobs`, `import_jobs`: each
  `(owner_id, <timestamp> desc)` for their respective most-recent-first listing routes.
- `file_assets.extracted_text` and `code_snippet_data.code_content`/`language` are folded
  into `knowledge_items.search_vector` (weights C/D) via triggers rather than indexed
  directly — see Functions & Triggers above.

## Storage Buckets

All three buckets are **private** (`public: false`) — access only via a short-lived signed
URL scoped to the requesting user, never a public URL, per `.claude/docs/qa-checklist.md`'s
Storage requirement. Every bucket's RLS follows the same shape: objects are stored under a
`"{owner_id}/..."` path prefix, and each policy checks `(storage.foldername(name))[1] =
auth.uid()::text`. Bucket-level `file_size_limit`/`allowed_mime_types` are a backstop only —
the authoritative, per-flow check happens in application code (and, for uploads, a
content-sniffed verification against the actual bytes, not just the client-declared
Content-Type header).

### avatars (`002_avatars_storage.sql`)
5MB limit; `image/jpeg`, `image/png`, `image/webp`. Objects live at `{owner_id}/avatar`.
Policies: owner-scoped `select`, `insert`, `update`, `delete`.

### files (`007_file_uploads.sql`)
50MB limit (a backstop above the largest of the three per-type app-level caps — PDF 50MB /
Image 20MB / File 25MB, `lib/files/constants.ts`); a broad allow-list covering PDFs, images,
plaintext/CSV/Markdown/JSON, zip, and common Office/OpenDocument formats. Objects live at
`{owner_id}/{random-id}/{filename}`. Policies: owner-scoped `select`, `insert`, `delete` —
**no `update` policy**, since an uploaded file is an immutable object (a "re-upload" creates
a new item, same as bookmarks/notes don't let you swap a different URL/type onto an existing
row).

### data-jobs (`009_settings_data_jobs.sql`)
50MB limit; `application/json`, `application/zip`. Objects live at
`{owner_id}/exports/{jobId}.<ext>` (export output) and `{owner_id}/imports/{jobId}/
source.<ext>` (client-uploaded import source). Policies: owner-scoped `select`, `insert`,
`delete` — no `update` policy, same immutable-object reasoning as `files`.
