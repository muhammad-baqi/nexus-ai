# Notes

## Overview

Notes are the most flexible Knowledge Item type: free-form rich content
authored directly inside Nexus, rather than captured from an external
source. They must support enough formatting (Markdown, checklists, code
blocks, tables, images) to be genuinely useful for study notes, project
documentation, and journaling, without turning into a full document
editor competing with dedicated writing tools.

## Requirements

Users shall be able to:

- Create a new Note within a Collection
- Edit the Note's title and body
- Use rich formatting: headings, bold/italic, lists, checklists, code
  blocks, tables, links, and inline images
- Write in Markdown directly, or via a WYSIWYG rich-text toolbar that
  produces equivalent Markdown underneath
- Have the Note autosave continuously while editing
- View and restore previous versions of a Note
- Tag, favorite, archive, move, trash, and share a Note (shared behavior,
  see `Knowledge_Items.md`)

## Editor

**Model:** the Note body is stored as Markdown (the canonical source of
truth), with a rich-text (WYSIWYG) editing surface layered on top that
renders and edits that Markdown, plus a "raw Markdown" toggle for users
who prefer to type Markdown directly.

**Supported content:**
- Headings (H1–H3)
- Bold, italic, strikethrough
- Ordered and unordered lists
- Checklists (interactive checkboxes, toggled by clicking, stored as
  Markdown task-list syntax)
- Code blocks with language selection and syntax highlighting
- Tables (basic grid, add/remove row/column)
- Links (auto-detected and manually inserted)
- Inline images (uploaded as Image Knowledge Items and embedded by
  reference, per the Attachments model in `Knowledge_Items.md`)
- Horizontal rules and blockquotes

## Autosave

- Changes are saved automatically after a short pause in typing (debounced,
  e.g., ~1–2 seconds of inactivity) — the user should never need to press
  a "Save" button for normal editing.
- A visible, unobtrusive save-status indicator ("Saving…" / "Saved") gives
  the user confidence their work isn't lost.
- If a save request fails (e.g., network drop), the editor must retry and
  clearly indicate an unsaved/offline state rather than silently
  discarding the change; local edits should be preserved in memory until
  the save succeeds.

## Version History

- Each autosave that represents a meaningful change creates or updates a
  version snapshot. To avoid excessive storage/noise, minor keystroke-level
  autosaves within the same short editing session are coalesced into a
  single version rather than one version per debounce tick — a new
  version boundary is created after a period of inactivity (e.g., the
  user stops editing for several minutes) or on explicit "save version"
  points such as closing the note.
- Users can view a list of previous versions with timestamps.
- Users can view a read-only diff/preview of a previous version.
- Users can restore a previous version, which becomes the new current
  version (the version being replaced is not lost — restoring creates a
  new version entry rather than deleting history).

## Checklists

- Checklist items are individually toggleable without entering "edit
  mode" for the whole note — clicking a checkbox in the rendered view
  toggles it and autosaves immediately.
- Checked/unchecked state is part of the Markdown content itself
  (standard task-list syntax), not a separate data structure, so it
  survives export/import.

## Search Integration

The full Note body (plain-text extracted from Markdown, not raw
Markdown syntax) is indexed for Global Search, in addition to title,
description, and tags — per the shared contract in `Knowledge_Items.md`
and `Search.md`.

## Error States

- Autosave failure: retry with backoff; surface a persistent (not
  auto-dismissing) "not saved" indicator if retries are exhausted, with a
  manual "retry now" action.
- Conflicting edits (same note edited in two tabs/sessions): last write
  wins for the MVP, but the editor should detect a version mismatch on
  save and warn the user their view may be stale, prompting a refresh,
  rather than silently overwriting without any signal.
- Restoring a version that references since-deleted embedded images:
  restore the text content; broken image references should render a
  clear "image no longer available" placeholder rather than breaking the
  whole note view.

## Out of Scope for MVP

- Real-time collaborative editing (multiple users editing simultaneously)
- Comments/annotations on notes
- Note-to-note backlinks or a graph view
- Full offline editing with later sync

## Acceptance Criteria

- [ ] A user can create a Note, format it with all supported content
      types, and see it autosave without manual intervention.
- [ ] Checklists can be toggled directly from the rendered view.
- [ ] Version history captures meaningful edit boundaries and allows
      viewing and restoring prior versions.
- [ ] Note content (not just title/tags) is searchable via Global
      Search.
- [ ] Covered by unit tests (Markdown parsing/serialization, autosave
      debounce logic), integration tests (autosave API, version
      creation), and an end-to-end test: create note → format content →
      edit → verify version history → restore a version.
