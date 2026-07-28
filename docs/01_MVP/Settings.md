# Settings

## Overview

Settings is where a user manages their account, preferences, and data,
separate from the content-management surfaces (Collections, Items,
Search). It consolidates profile management, security, appearance, and
data export in one place.

## Requirements

Users shall be able to manage:

- Profile (display name, avatar)
- Password (change password — full flow defined in `Authentication.md`)
- Theme (light / dark / system)
- Language (interface language — see Localization note below)
- Notification preferences (which reminder channels are active — see
  `Notifications.md`)
- Privacy (account deletion — full flow defined in `Authentication.md`)
- Data export (see Import/Export below)

## Profile

- **Display name:** free text, shown throughout the app (e.g., nowhere
  else user-facing in MVP besides the profile screen itself, since there
  is no multi-user visibility yet — still required as a foundation for
  future shared features).
- **Avatar:** image upload, stored via Supabase Storage, with a
  sensible default (initials-based placeholder) if none is set.
  Reasonable size/format limits apply (e.g., JPEG/PNG/WebP, a few MB
  max), with client-side validation before upload.

## Theme

- Three options: Light, Dark, System (follows OS-level preference).
- Applies immediately without requiring a page reload.
- Persisted per-account (not just local browser storage) so the
  preference follows the user across devices/browsers.

## Language

- MVP ships with a single interface language (English). The Settings
  screen may still include a language selector as a foundation for
  future localization, but only one option needs to be functional at
  launch — this is explicitly scaffolding for later, not a requirement
  to fully localize the UI now.

## Notification Preferences

- Toggle: reminder emails on/off globally.
- Per-notification-channel settings are limited to email in the MVP
  (Phase 1); the Settings UI should be structured so additional channels
  (Telegram, etc., per `02_Development/Telegram.md`) can be added as
  future toggles without redesigning this screen.

## Privacy / Account Deletion

- Entry point to the account deletion flow defined in
  `Authentication.md`; Settings is where this action lives, but the
  detailed flow (confirmation, cascade behavior) is specified there to
  avoid duplicating requirements across documents.

## Data Export

Users can export their data in:
- **Markdown:** a ZIP of folders (one per Collection) containing
  Markdown files for Notes and a manifest/metadata file for other item
  types (bookmarks, file references) — a "raw" export a user could pull
  into another Markdown-based tool.
- **JSON:** a full structured export of all Collections, Knowledge
  Items, tags, and their metadata, suitable for backup or migration.
- **ZIP:** a combined bundle including the JSON export plus any
  uploaded files/images/PDFs, for a complete offline copy of the
  account's data.

Export is generated as a background job (given potentially large data
volume) and the user is notified (in-app, and via email per the
Notifications channel) when the export file is ready to download,
rather than the request blocking in the browser.

Import (Markdown, JSON) is a companion capability — see Import behavior
detailed in a dedicated section below, since it has distinct validation
requirements from export.

### Import

- Accepts a previously exported JSON bundle or a folder of Markdown
  files (as a ZIP).
- On import, items are created as new records (import does not attempt
  to merge/de-duplicate against existing data in the MVP) — this keeps
  the import logic straightforward at the cost of possible duplicates if
  a user imports the same export twice.
- Import runs as a background job; the user sees progress and a summary
  (items created, any rows skipped due to errors) on completion.
- Malformed or partially invalid import files should not fail the whole
  job — invalid entries are skipped and reported, valid entries are
  still imported.

## Error States

- Avatar upload exceeding size/format limits: inline validation before
  upload begins.
- Export job failure: retry-able, with a clear in-app notification
  rather than a silently stuck "generating…" state.
- Import job failure or malformed file: clear summary of what succeeded
  and what didn't, not a generic failure message.

## Out of Scope for MVP

- Full interface localization into multiple languages
- Notion / Obsidian / Evernote import (future — see `02_Development/`)
- Granular, per-notification-type channel preferences beyond a single
  global email on/off toggle

## Acceptance Criteria

- [ ] A user can update display name and avatar.
- [ ] Theme selection persists across sessions/devices and applies
      without a reload.
- [ ] A user can export their full account data as Markdown, JSON, or
      ZIP, generated via a background job with a completion
      notification.
- [ ] A user can import a previously exported JSON or Markdown bundle,
      with a clear summary of successes/skips.
- [ ] Covered by integration tests (export/import job correctness,
      round-trip: export then re-import should reproduce equivalent
      data) and an end-to-end test for the profile/theme update flow.
