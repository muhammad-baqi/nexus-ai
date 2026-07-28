# Knowledge Items

## Overview

The Knowledge Item is the core abstraction of Nexus. Every piece of saved
content — a note, a bookmarked website, a PDF, an image, a file, a code
snippet — is a Knowledge Item with a shared set of base fields and
shared behavior (tagging, favoriting, archiving, trashing, search
indexing, sharing, version history where applicable). Type-specific
behavior and fields are layered on top of this shared base.

This document defines the shared model and the behaviors that apply to
*all* Knowledge Item types. Type-specific requirements (Notes, Website
Bookmarks, PDFs, Images, Files, Code Snippets) are detailed in their own
documents; this document is the contract those documents build on.

## Conceptual Model

```
Knowledge Item (base)
 ├── id
 ├── owner (user)
 ├── collection (required, exactly one)
 ├── type: note | website | pdf | image | file | code_snippet
 ├── title
 ├── description
 ├── tags[]
 ├── is_favorite
 ├── is_archived
 ├── deleted_at (null unless trashed)
 ├── created_at / updated_at
 ├── type_specific_data (varies by type)
 └── attachments[] (optional, see below)
```

Every Knowledge Item belongs to exactly one Collection at a time. Moving
an item between Collections is supported (see Move below) but an item is
never in zero or multiple Collections simultaneously.

## Shared Fields

| Field | Required | Notes |
|---|---|---|
| Title | Yes | Auto-derived where possible (e.g., page title for bookmarks, filename for files); user-editable always |
| Description | No | Free text |
| Tags | No | Zero or more; see `Search.md` for tag mechanics shared with Global Search, and this doc's Tagging section |
| Collection | Yes | Exactly one |
| Favorite | — | Boolean, user-toggled |
| Archived | — | Boolean, user-toggled |
| Created / Updated | — | System-managed timestamps |

## Shared Behaviors

### Create
Every item type has its own creation entry point (e.g., "New Note," "Save
Website," "Upload File") but all created items immediately have: a
title, an owning Collection (the currently active one, or user-selected),
and are immediately searchable and taggable.

### Favorite / Unfavorite
Any item can be favorited regardless of type. Favorited items appear on
the Dashboard's Favorites widget alongside favorited Collections.

### Archive / Unarchive
Archiving an item removes it from default Collection views but keeps it
searchable (it appears in results with an "Archived" indicator).
Archiving is reversible and never touches Trash.

### Tagging
- Tags are free-form strings, created implicitly the first time they're
  typed (no separate "create a tag" step required, though a tag
  management view for edit/delete/merge also exists — see below).
- An item can have any number of tags.
- Tags are scoped per user (not global/shared across users).

**Tag management (separate from per-item tagging):**
- **Edit:** renaming a tag updates it everywhere it's used.
- **Delete:** removing a tag detaches it from all items; items are not
  deleted.
- **Merge:** combining two tags (e.g., "js" and "javascript") reassigns
  all items from the source tag to the target tag, then removes the
  source tag.

### Move Between Collections
An item can be moved to a different Collection at any time. This does
not affect its tags, favorite/archive state, or version history.

### Trash / Restore / Permanent Delete
- Deleting any Knowledge Item (individually, or via its parent
  Collection being deleted) sets a `deleted_at` timestamp rather than
  removing the row. Trashed items are excluded from default views,
  Collection views, and Global Search, but remain visible in the Trash
  view.
- **Restore** clears `deleted_at` and returns the item to its original
  Collection. If the original Collection was itself deleted and not
  restored, restoring the item should re-home it in the user's default
  Collection rather than failing.
- **Permanent delete** (from within Trash) removes the row and any
  associated stored files (Supabase Storage objects) irreversibly, and
  requires explicit confirmation.
- Trash is not automatically emptied on any fixed schedule in the MVP
  (no auto-purge after N days) — permanent deletion is always a
  user-initiated action. (An automatic retention policy is a reasonable
  future enhancement, not required for v1.)

### Version History
Applies fully to Notes (see `Notes.md`). For other item types in the
MVP, version history is limited to metadata edits (title, description,
tags) rather than content, since content for bookmarks/PDFs/images/files
is either fetched once or immutable after upload.

### Sharing
Any individual Knowledge Item can generate a public, view-only share
link.
- The link exposes a read-only rendering of the item (its title,
  description, and type-appropriate content view — e.g., rendered note
  content, PDF preview, image).
- Share links do not expose the owner's other data, Collections, or
  account information.
- Revoking a share link immediately invalidates it; a new link
  (different token) can be generated afterward if sharing is re-enabled.
- Password-protected and expiring links are out of scope for MVP (see
  `Scope.md`).

### Attachments
A Knowledge Item (most commonly a Note) may reference other files as
attachments — e.g., a note with an embedded image or linked PDF. In the
MVP, attachments are implemented as: the file is itself uploaded as its
own Knowledge Item (Image/PDF/File type), and the Note references it by
ID. This avoids a second, parallel storage model for "attachments" vs.
"items."

## Search Indexing

Every Knowledge Item must be indexed for Global Search on create and
update, including: title, description, tags, and — where applicable —
extracted content (note body, PDF extracted text). See `Search.md` for
the full search contract.

## Error States (Shared)

- Attempting to load an item that has been trashed or permanently
  deleted by another session: show a "this item is no longer available"
  state rather than a raw 404.
- Attempting to move an item into a Collection that no longer exists:
  reject with a clear message and refresh the Collection list.
- Attempting to permanently delete an item that has active share links:
  warn the user that existing share links will stop working.

## Acceptance Criteria (Shared, applies across all types)

- [ ] Every Knowledge Item always belongs to exactly one Collection.
- [ ] Favorite, archive, tag, move, trash, and restore work identically
      regardless of item type.
- [ ] Trashed items disappear from all default and search views but
      remain restorable until permanently deleted.
- [ ] Tag rename/delete/merge correctly propagates across all items
      using that tag.
- [ ] A public share link renders a read-only view of the item without
      exposing any other account data, and revoking it invalidates
      access immediately.
- [ ] Covered by integration tests verifying RLS: a user cannot read,
      tag, favorite, move, or trash another user's Knowledge Items, even
      by guessing IDs.
