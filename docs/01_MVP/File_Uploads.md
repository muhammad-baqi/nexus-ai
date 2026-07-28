# File Uploads

## Overview

This document covers the three upload-based Knowledge Item types that
share a common storage mechanism: **PDFs**, **Images**, and general
**Files**. Website Bookmarks and Notes are covered separately since they
are not upload-based. Code Snippets are also covered separately as they
are text-entry-based, not upload-based.

All uploaded content is stored via Supabase Storage, with database
records holding metadata (filename, size, MIME type, storage path) and
Supabase Storage holding the actual bytes.

## Shared Upload Requirements

- Users can upload via drag-and-drop or a file picker.
- Upload progress is shown for each file (percentage or spinner for
  small files).
- Multiple files can be uploaded in a single action, each becoming its
  own Knowledge Item.
- Uploaded files are placed into the currently active/selected
  Collection by default, editable afterward like any other item.
- File size limits are enforced client-side (immediate feedback) and
  server-side (authoritative check) — client-side validation alone is
  not sufficient since it can be bypassed.
- Storage access is governed by Row Level Security / signed URLs so that
  a user can only retrieve their own files, even if a storage path were
  guessed.

## PDFs

**Upload:** standard PDF files, with a reasonable size cap (e.g., 50MB
per file for MVP — exact limit is an implementation decision, not a
product requirement, but must be enforced consistently client- and
server-side).

**Preview:** an in-app PDF viewer (page-by-page or continuous scroll)
without requiring download.

**Text extraction:** on upload, a background job extracts the PDF's text
content for search indexing (per `Search.md`). Extraction failures
(e.g., scanned/image-only PDFs with no embedded text layer) should not
fail the upload — the file is still saved and previewable, simply not
full-text searchable, and this state should be visible to the user
("text search unavailable for this file") rather than silently absent.

**Download:** users can download the original file at any time.

**Delete:** standard Knowledge Item trash/restore/permanent-delete
behavior applies (see `Knowledge_Items.md`); permanent deletion removes
the underlying Storage object.

## Images

**Upload:** common formats (JPEG, PNG, WebP, GIF), with a reasonable
size cap (e.g., 20MB).

**Preview:** full-size and thumbnail rendering; thumbnails are generated
(or resized on the fly) for grid/list views to keep those views fast,
rather than loading full-resolution images everywhere.

**Organize:** images behave as standard Knowledge Items — taggable,
favoritable, movable between Collections — with no image-specific
organizational features (e.g., albums) beyond what Collections and tags
already provide.

**Download:** original file download supported.

## General Files

**Upload:** a defined allow-list of common, safe file types for MVP
(e.g., documents, spreadsheets, archives, text files) rather than
accepting arbitrary file types — reduces both security surface and the
complexity of preview/handling logic. The exact allow-list is a technical
decision made alongside `03_Architecture/Tech_Stack.md`, but the product
requirement is: reject disallowed types with a clear message rather than
silently failing.

**Preview:** where feasible (e.g., plain text), an inline preview;
otherwise, the item shows metadata (filename, size, type) with a
download action, since building a universal in-browser previewer for
every file type is not required for MVP.

**Download / Delete:** same as PDFs/Images.

## Security Requirements

- All uploaded files are scanned for basic validity (correct MIME type
  matching the file's actual content, not just its extension) before
  being accepted, to reduce the risk of disguised malicious files.
- Storage buckets are private by default; access requires an
  authenticated, authorized request (signed URL generation scoped to
  the requesting user), never public-by-default buckets.
- Public share links (per `Knowledge_Items.md`) generate a separate,
  scoped access mechanism for the specific shared item only — they do
  not grant broader bucket access.

## Error States

- File exceeds size limit: rejected before upload begins (client-side),
  and rejected server-side as a backstop with a clear error message.
- Disallowed file type: rejected with a message naming what is and
  isn't supported.
- Upload interrupted (network failure mid-upload): user can retry
  without needing to re-select the file if the browser session still
  holds it; partial/orphaned Storage objects from failed uploads should
  be cleaned up (either not created until upload completes, or removed
  by a periodic cleanup job).
- PDF text extraction failure: file remains usable, with a visible
  "not full-text searchable" indicator, not a failed upload.

## Out of Scope for MVP

- Video file support as a distinct, playable item type (explicitly
  listed as a future Knowledge Item type in the project Vision, not
  built in MVP)
- OCR for scanned/image-only PDFs
- Universal in-browser preview for all file types

## Acceptance Criteria

- [ ] Users can upload PDFs, Images, and general Files via drag-and-drop
      or file picker, individually or in batches.
- [ ] PDF text is extracted and searchable when extraction succeeds,
      and the item remains usable with a clear indicator when it fails.
- [ ] Images render thumbnails in list/grid views and full-size on
      detail view.
- [ ] File size and type limits are enforced both client- and
      server-side.
- [ ] Trash/restore/permanent-delete correctly manages the underlying
      Storage object lifecycle.
- [ ] Covered by unit tests (MIME/type validation logic), integration
      tests (upload API, background text-extraction job, RLS on storage
      access), and an end-to-end test: upload a PDF → verify it's
      previewable and searchable by its content.
