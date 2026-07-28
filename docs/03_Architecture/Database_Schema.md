# Database Schema (Conceptual)

## Purpose

This document describes the conceptual data model needed to satisfy the
functional requirements in `01_MVP/`. It is intentionally at the level of
entities and relationships, not exact column types or migration syntax —
those are implementation details for the engineering team/agent to
finalize against Supabase Postgres conventions.

## Core Entities

### users
Managed primarily by Supabase Auth; the application maintains a linked
`profiles` table for app-specific fields.

- `id` (matches Supabase Auth user id)
- `display_name`
- `avatar_url`
- `theme_preference`
- `notification_email_enabled`
- `created_at`

### collections
- `id`
- `owner_id` → users
- `name`
- `description`
- `color`
- `icon`
- `is_favorite`
- `is_archived`
- `deleted_at` (nullable — Trash support)
- `created_at`, `updated_at`

Unique constraint: (`owner_id`, lower(`name`)) among non-deleted rows.

### knowledge_items
The shared base table for all item types, per `01_MVP/Knowledge_Items.md`.

- `id`
- `owner_id` → users
- `collection_id` → collections
- `type` (enum: note, website, pdf, image, file, code_snippet)
- `title`
- `description`
- `is_favorite`
- `is_archived`
- `deleted_at` (nullable)
- `created_at`, `updated_at`
- `search_vector` (full-text search index column, see `01_MVP/Search.md`)

Type-specific data is stored either in dedicated child tables (preferred
for structured types like `website_metadata`, `code_snippet_data`) or a
flexible JSON column, depending on how much type-specific structure
needs querying versus just display. Given search requirements need to
index type-specific content, dedicated child tables are recommended over
opaque JSON for anything that must be searchable.

### note_versions
- `id`
- `knowledge_item_id` → knowledge_items
- `content` (Markdown snapshot)
- `created_at`

### website_metadata
- `knowledge_item_id` → knowledge_items (1:1)
- `url`
- `canonical_url`
- `domain`
- `og_image_url`
- `favicon_url`
- `screenshot_url` (nullable)
- `fetch_status` (enum: pending, success, failed)

### file_assets
Shared shape for PDFs, Images, and general Files.
- `knowledge_item_id` → knowledge_items (1:1)
- `storage_path` (Supabase Storage reference)
- `original_filename`
- `mime_type`
- `size_bytes`
- `extracted_text` (nullable, PDFs only, for search indexing)
- `extraction_status` (enum: not_applicable, pending, success, failed)

### code_snippet_data
- `knowledge_item_id` → knowledge_items (1:1)
- `language`
- `code_content`

### tags
- `id`
- `owner_id` → users
- `name`
Unique constraint: (`owner_id`, lower(`name`)).

### knowledge_item_tags
Join table.
- `knowledge_item_id` → knowledge_items
- `tag_id` → tags

### reminders
- `id`
- `knowledge_item_id` → knowledge_items
- `type` (enum: one_time, daily, weekly, monthly, custom)
- `schedule` (recurrence definition — exact representation, e.g.,
  cron-like string or structured fields, is an implementation decision)
- `next_fire_at`
- `is_active`
- `created_at`

### share_links
- `id`
- `knowledge_item_id` → knowledge_items
- `token` (unique, unguessable)
- `is_active`
- `created_at`

### activity_log
- `id`
- `owner_id` → users
- `knowledge_item_id` (nullable — some activity is collection-level)
- `collection_id` (nullable)
- `action` (enum: created, edited, deleted, restored, shared)
- `created_at`

### recent_searches
- `id`
- `owner_id` → users
- `query`
- `created_at`

## Row Level Security

Every table above that contains user data must have RLS policies scoped
to `owner_id = auth.uid()` (directly, or transitively through
`knowledge_item_id`/`collection_id` for child tables). No table should
rely solely on application-layer checks — RLS is the enforced boundary,
consistent with the Security requirements in `01_MVP/Authentication.md`
and the shared Knowledge Item contract's acceptance criteria.

## Indexing Notes

- `knowledge_items.search_vector`: GIN index for full-text search.
- `knowledge_items(collection_id)`, `knowledge_items(owner_id,
  deleted_at)`: for common filtered list queries.
- `reminders(next_fire_at, is_active)`: for the scheduler's due-reminder
  polling query.
- `file_assets.extracted_text` should also be included in (or unioned
  into) the searchable text feeding `knowledge_items.search_vector`,
  since PDF content search is a stated requirement.
