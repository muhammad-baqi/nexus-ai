# Nexus — QA & Security Checklist (authoritative)

> Run before marking any Day/release complete (`/qa-gate`). 🔴 = **launch blocker** — never
> release a production version (v0.1/v0.2/v1.0) without them passing. Treat as living test
> coverage: as each feature is built, write the test that proves the matching line here
> (Vitest/Playwright — see `testing.md`). Sourced from `docs/01_MVP/*.md` acceptance criteria and
> `docs/03_Architecture/Non_Functional_Requirements.md`.

---

## Authentication & sessions
- [ ] 🔴 Invalid login never reveals whether the email exists — always the generic "Invalid email or password"
- [ ] 🔴 Duplicate email on registration behaves identically to success from the user's POV (no enumeration)
- [ ] 🔴 Unverified accounts see a "please verify" prompt with a working, rate-limited resend — not a generic auth error
- [ ] 🔴 Password reset always returns the same confirmation message regardless of whether the email is registered
- [ ] 🔴 Changing password (or completing a reset) invalidates other active sessions
- [ ] 🔴 Account deletion cascades — all owned Collections/Knowledge Items actually removed, verify in the DB, not just the UI
- [ ] Failed-login rate limiting triggers (e.g. 5 attempts → cooldown) without permanently locking the account
- [ ] Verification/reset email requests rate-limited (≤1/60s per email)
- [ ] All auth forms served over HTTPS only (hosting-layer enforced)

## Authorization / RLS
- [ ] 🔴 RLS active on every table holding user data — verify in the Supabase dashboard, not just by reading migration files
- [ ] 🔴 A user cannot read, tag, favorite, move, trash, or restore another user's Knowledge Items or Collections — test by guessing/enumerating IDs directly against the API, not just hiding UI
- [ ] 🔴 `SUPABASE_SERVICE_ROLE_KEY` never reaches the client bundle — grep the built output
- [ ] Every route handler validates input with zod before touching Supabase (per `.claude/rules/api-routes.md`)
- [ ] No route trusts a client-supplied user id — identity always comes from the session

## Collections & shared Knowledge Item behavior
- [ ] 🔴 Every new account gets exactly one default Collection on signup
- [ ] 🔴 Deleting a Collection moves it and its items to Trash (not permanent), with a confirmation showing the affected item count
- [ ] Duplicate Collection names (case-insensitive) rejected with inline validation, not a generic error
- [ ] Trashed items excluded from all default views and Global Search, but restorable until permanently deleted
- [ ] Restoring an item whose original Collection was deleted re-homes it to the default Collection instead of failing
- [ ] Permanently deleting an item with an active share link warns the user first

## Notes
- [ ] 🔴 Autosave never silently discards an edit on failure — retries with backoff, shows a persistent "not saved" state if retries exhaust
- [ ] Version history creates a new boundary after inactivity or explicit close, not one version per keystroke
- [ ] Restoring a version creates a new version entry rather than deleting the history it replaced
- [ ] Checklist items toggle from the rendered view without entering edit mode
- [ ] Conflicting edits (same note, two sessions) detected and surfaced, not silently overwritten

## Website Bookmarks
- [ ] 🔴 Saving a URL is never blocked on metadata fetch — item is visible immediately
- [ ] Metadata fetch job times out (~10s) and marks "unavailable" rather than hanging indefinitely
- [ ] Duplicate URL (post-canonicalization) triggers a non-blocking prompt, not a hard rejection
- [ ] Manual retry re-enqueues the job; no silent automatic retry loop hammering the target site

## File uploads (PDFs, Images, Files)
- [ ] 🔴 File size and type limits enforced both client- and server-side (server-side is authoritative)
- [ ] 🔴 MIME type verified against actual file content, not just the extension
- [ ] 🔴 Storage buckets are private by default — access only via signed URL scoped to the requesting user
- [ ] 🔴 Permanently deleting an item removes the underlying Supabase Storage object, not just the DB row
- [ ] PDF text-extraction failure leaves the file usable with a visible "not searchable" indicator, not a failed upload
- [ ] Interrupted upload doesn't leave an orphaned Storage object (cleaned up or never created until complete)

## Code Snippets
- [ ] Copy-to-clipboard reproduces the exact stored content, no added formatting/line numbers
- [ ] Unsupported language selection falls back to plain-text rendering, not a save/display failure

## Search
- [ ] 🔴 Trashed items never appear in Global Search results
- [ ] Search against a 5,000-item seeded dataset returns within 500ms server-side
- [ ] Filters combine correctly (AND across categories, OR within a multi-select tag filter)
- [ ] Relevance ranking weights title > tag > body content

## Dashboard
- [ ] A failure in one Dashboard section doesn't block the rest of the page from rendering
- [ ] Creating/editing/favoriting an item elsewhere is reflected on the Dashboard on next navigation

## Notifications / Reminders
- [ ] 🔴 Turning off the global email toggle stops emails but preserves reminders and Dashboard visibility
- [ ] 🔴 Trashing an item deactivates its reminders; restoring reactivates them if still due in the future
- [ ] Monthly reminders on a day that doesn't exist in a given month fall back to that month's last day
- [ ] Missed reminders catch up on scheduler recovery unless past the grace period (then logged, not sent stale)
- [ ] Reminder email delivery failure retried with backoff, logged on persistent failure, doesn't crash the scheduler for other users

## Settings — export / import
- [ ] Export (Markdown/JSON/ZIP) runs as a background job with a completion notification, not a blocking request
- [ ] Export → re-import round-trip reproduces equivalent data
- [ ] Malformed/partial import files don't fail the whole job — invalid entries skipped and reported, valid entries still imported

## Sharing
- [ ] 🔴 A public share link never exposes the owner's other data, Collections, or account info — only the shared item
- [ ] 🔴 Revoking a share link invalidates it immediately

## Error handling
- [ ] 🔴 No stack traces reach the browser — force a server error, check the Network tab
- [ ] Empty `catch` blocks are treated as review-blocking (per CLAUDE.md rule #4)
- [ ] A failing enhancement (screenshot, PDF extraction, reading mode) never takes down the core save/view feature it's attached to
- [ ] Structured logging exists for background job and API errors, sufficient to debug after the fact

## Accessibility (WCAG AA baseline)
- [ ] Full keyboard navigation for all interactive elements, including the rich-text editor toolbar
- [ ] Screen reader labeling (ARIA) on icon-only buttons
- [ ] Color contrast meets WCAG AA in both light and dark themes

## Performance
- [ ] Global Search <500ms server-side at 5,000 items/user
- [ ] Images served as appropriately sized/optimized thumbnails in grid/list views, not always full-size
- [ ] Lists that can grow large (items, activity log, trash) are paginated at the query level, not fetch-all-then-paginate client-side

## Infrastructure / CI
- [ ] Full data isolation confirmed between `nexus-staging` and `nexus-prod` (separate Supabase projects, separate env vars per Vercel project)
- [ ] `.env.local` / `.env` never committed — only `.env.example` with placeholders
- [ ] `git config core.hooksPath .githooks` active — verify a direct commit to `main`/`staging` is actually blocked locally
- [ ] `claude-qa.yml`'s full-regression job against staging is green before any `staging → main` promotion

## Pre-release sign-off (run before v0.1 / v0.2 / v1.0 RC / v1.0)
Run a full pass covering: an account-enumeration attempt at login/register, an RLS bypass
attempt (guess another user's item ID), an oversized/wrong-type file upload, a forced server
error (confirm no stack trace leaks), and the full register → verify → login → save an item →
search → find it journey end to end. Time "save something" as a real first-time user would;
target under 10 seconds per `docs/00_Project/Success_Metrics.md`.
