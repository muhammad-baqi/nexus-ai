# Collections

## Overview

A Collection is the primary organizing container in Nexus. Every
Knowledge Item belongs to exactly one Collection. Collections are how a
user creates the top-level structure of their knowledge base — by topic,
project, or however makes sense to them ("Programming," "Research,"
"Travel," "Recipes").

Collections are intentionally simple: a flat container with a name,
color, and icon. Nested sub-collections are not part of the MVP (see Out
of Scope).

## Data Model (Conceptual)

A Collection has:
- Name (required, unique per user)
- Description (optional)
- Color (from a fixed palette)
- Icon (from a fixed icon set)
- Favorite flag
- Archived flag
- Created / updated timestamps
- Item count (derived, not stored)
- Owner (user)

## Requirements

Users shall be able to:

- Create a Collection with a name (required), description, color, and
  icon
- Rename a Collection
- Edit description, color, and icon
- Delete a Collection
- Archive / unarchive a Collection
- Favorite / unfavorite a Collection
- Search collections by name
- View basic statistics for a Collection (item count, breakdown by item
  type, last updated)

## Create Collection

**Fields:** name (required), description (optional), color (default
provided, user can change), icon (default provided, user can change).

**Validation:** name must be non-empty and unique among the user's
non-deleted collections (case-insensitive). If a duplicate name is
submitted, show inline validation rather than a generic error.

**Default collection:** every new user account is provisioned with one
default Collection (e.g., "Inbox" or "General") on registration, so they
are never without a place to save their first item.

## Rename / Edit

- Renaming re-validates uniqueness the same way as creation.
- Editing color/icon/description has no other side effects.
- All edits update the `updated_at` timestamp.

## Delete Collection

Deleting a Collection is a significant action because it affects every
item inside it.

**Behavior:** deleting a Collection moves the Collection itself and all
of its Knowledge Items into Trash (soft delete), rather than immediately
and permanently destroying them. This keeps deletion consistent with the
Trash/Restore model used everywhere else in the app (see `Trash` section
of `Knowledge_Items.md`).

**Confirmation:** the delete action must show a confirmation dialog that
states how many items will be affected ("This will move 42 items to
Trash") before proceeding.

**Restoring a deleted Collection** restores the Collection and makes its
items visible again in their original Collection; it does not
automatically restore items that were individually deleted from within
the Collection before the Collection itself was deleted.

## Archive

- Archiving a Collection hides it from the default Collections view but
  does not affect its items' searchability — archived-collection items
  still appear in global search unless the items themselves are also
  archived or trashed.
- Archived Collections are shown in a separate "Archived" filter, not
  deleted or hidden entirely from the user.
- Unarchiving reverses this with no data changes.

## Favorite

- Favoriting a Collection adds it to the Dashboard's Favorites section.
- Multiple Collections can be favorited simultaneously; there is no
  limit.

## Search Collections

- A lightweight, name-based search/filter within the Collections list
  view (distinct from Global Search, which searches inside items — see
  `Search.md`).
- Should filter as the user types, client-side, given the expected small
  number of collections per user (tens, not thousands).

## Statistics

For a given Collection, display:
- Total item count
- Breakdown by Knowledge Item type (e.g., 12 notes, 5 bookmarks, 3 PDFs)
- Last updated date (most recent item creation or edit within the
  collection)

Statistics are computed on read (query-time aggregation), not maintained
as a separately stored counter, for the MVP's expected data volume.

## Error States

- Duplicate name on create/rename: inline validation error, form is not
  submitted.
- Attempting to delete a Collection that no longer exists (e.g., deleted
  in another tab): show a "this collection was already removed" message
  and refresh the list, rather than a raw error.
- Network failure on any action: retry-able error toast; local UI state
  should not silently diverge from server state (re-fetch on
  reconnect/retry).

## Out of Scope for MVP

- Nested / hierarchical collections (sub-collections)
- Shared or multi-user collections
- Collection-level permissions
- Reordering collections via drag-and-drop (a simple sort — alphabetical,
  recently updated, or favorite-first — is sufficient for v1)

## Acceptance Criteria

- [ ] A new user has exactly one default Collection on first login.
- [ ] A user can create, rename, edit, archive, favorite, and delete a
      Collection.
- [ ] Deleting a Collection moves it and its items to Trash, with a
      confirmation showing the affected item count.
- [ ] Duplicate Collection names (case-insensitive) are rejected with an
      inline error.
- [ ] Collection statistics correctly reflect item counts by type.
- [ ] Covered by unit tests (validation), integration tests (CRUD API
      routes and RLS enforcement — a user cannot access another user's
      collections), and an end-to-end test for create → add items →
      delete → restore.
