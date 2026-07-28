# Nexus — Complete Build Order

Every feature has its own prompt below. Copy each prompt exactly as written, in sequence, using
**`/ship-feature`** (it reads `PROGRESS.md`, picks the next unchecked feature, and runs the
plan → approve → branch → implement → self-review → verify → self-merge loop for you — see
`.claude/docs/git-workflow.md`). Test and commit after every prompt before moving to the next.
`PROGRESS.md` is the source of truth for what's actually built — tick it as you go.

Day themes and the release cadence (staging daily, production every other day) are defined in
`docs/00_Project/Roadmap.md`. **Build strictly in day order** — don't start Day 4 features
before Day 2's are shipped.

---

## 0. Accounts to create first

| Service | Sign up at | Needed for |
|---|---|---|
| GitHub | github.com | Repo hosting |
| Vercel | vercel.com | Hosting the Next.js app (Hobby/free tier) |
| Supabase | supabase.com | Database + Auth + Storage — two projects: `nexus-staging`, `nexus-prod` |

Full free-tier setup and cost minimization → `SETUP_CHECKLIST.md`.

---

## 1. Machine setup

```bash
node --version        # confirm 20+, else: nvm install 20 && nvm use 20
npm install -g @anthropic-ai/claude-code
docker --version       # needed for local dev + local Supabase CLI stack
gh --version           # GitHub CLI — brew install gh, or winget install --id GitHub.cli
```

## 2. Create project and open in VS Code

```bash
mkdir nexus && cd nexus && code .
```

Open the integrated terminal (`` Ctrl+` ``) and run everything below from inside it. Copy this
whole `ai-dev-workflow` package (`CLAUDE.md`, `.claude/`, `.github/`, `CONTRIBUTING.md`,
`docs/`, `PROGRESS.md`, `build-order-complete.md`, and the rest) into the project root first.

```bash
ls    # confirm CLAUDE.md, .claude/, docs/ are all there
```

## 3. Git + GitHub

```bash
git init
git checkout -b develop
gh auth login
gh repo create nexus --private --source=. --remote=origin
git config core.hooksPath .githooks    # activates the local push/commit guardrails
git remote -v    # confirm origin is set
```

Inside a Claude Code session, as the repo admin, say **"install the GitHub app"** — this sets
`CLAUDE_CODE_OAUTH_TOKEN` as a repo secret in one step (see `SETUP_CHECKLIST.md` for the manual
alternative).

## 4. Scaffold the project

```bash
claude
```

> **Prompt — Scaffold**
> Read CLAUDE.md fully, including the doc index at the bottom, and skim `docs/00_Project/` and
> `docs/03_Architecture/Tech_Stack.md`. Scaffold a Next.js 16 App Router project with
> TypeScript, Tailwind, ESLint/Prettier, ESLint config matching CLAUDE.md's conventions.
> Install shadcn/ui (via the shadcn MCP in `.mcp.json`) and set up the base design tokens.
> Install: @supabase/supabase-js, @supabase/ssr, zod, resend, date-fns. Add Vitest and
> Playwright config. Add a `docker-compose.yml` + `Dockerfile` matching the commands in
> CLAUDE.md's "Local dev — Docker" section. Don't build any features yet — show me the tree
> and confirm `docker compose up` + `npm run dev` both load a clean localhost:3000 before
> continuing.

```bash
docker compose up   # confirm localhost:3000 loads clean, then Ctrl+C
git add . && git commit -m "Initial scaffold + design tokens" && git push -u origin develop
```

Tick the Day 1 scaffold items in `PROGRESS.md`.

---

## DAY 1 — Foundation (infra only, nothing user-facing ships)

### 5. Supabase project + local dev stack

Create the two Supabase projects (`nexus-staging`, `nexus-prod`) at supabase.com. Copy each
project's URL, anon key, and service_role key into `.env.local` (staging values for local dev
is fine early on) and `.env.example` (placeholders only):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
npx supabase init
npx supabase start    # local Postgres + Auth + Storage, needs Docker
```

> **Prompt — Database schema**
> Read `docs/03_Architecture/Database_Schema.md` in full. Create
> `supabase/migrations/001_initial_schema.sql` with the full schema — profiles, collections,
> knowledge_items, note_versions, website_metadata, file_assets, code_snippet_data, tags,
> knowledge_item_tags, reminders, share_links, activity_log, recent_searches — including RLS
> policies scoped to `owner_id = auth.uid()` on every table (per `.claude/rules/database.md`
> and CLAUDE.md's non-negotiable rule #1), the GIN index on `knowledge_items.search_vector`,
> and the `handle_new_user` trigger that provisions a profile row + a default "Inbox" collection
> on signup. Tell me exactly how to apply it against the local stack, then against
> `nexus-staging`.

Run it as instructed against local, then `nexus-staging`. Commit.

Tick the remaining Day 1 items in `PROGRESS.md` once Vitest/Playwright are confirmed running.

---

## DAY 2 — Core Platform (v0.1) — release Tuesday

### 6. Register, verify, login, logout

> **Prompt**
> Build "Register", "Email verification", "Login", and "Logout" per
> `docs/01_MVP/Authentication.md` — Supabase Auth email/password, the generic
> "Invalid email or password" error (never reveal which part was wrong), the unverified-login
> state with a rate-limited resend option, and proxy.ts (Next.js 16's rename of middleware —
> already stubbed with the Supabase session refresh, see lib/supabase/proxy.ts) protecting all
> routes except the landing page. Follow `.claude/rules/api-routes.md` for any route handlers
> needed. Tell me how
> to test locally.

Test: register, check the local Inbucket/mail capture for the verification email, verify, log
in, land on an empty dashboard shell. Commit.

### 7. Password reset, change password, delete account

> **Prompt**
> Build "Password reset" (request + set-new-password flow, same confirmation message whether
> or not the email exists, invalidates other sessions on success), "Change password" (requires
> current password, invalidates other sessions, current session stays valid), and "Delete
> account" (password-confirmation gate, irreversible-action warning, cascading delete of all
> owned Collections/Knowledge Items) — all per `Authentication.md`. Add the rate limits
> described there (5 failed logins → cooldown; verification/reset requests ≤1/60s per email).

Test each path, including that a cascading account delete actually removes owned rows. Commit.

### 8. Profile management (basic)

> **Prompt**
> Build basic profile management — display name and avatar upload (Supabase Storage, sensible
> initials-based default) — per the Profile section of `docs/01_MVP/Settings.md`. Full Settings
> polish (theme persistence UI, export/import, notification prefs) comes later on Day 6; just
> the profile fields for now.

Commit.

### 9. Collections — full CRUD, archive, favorite, search, stats

> **Prompt**
> Build all "Collections" features from `docs/01_MVP/Collections.md`: create (name required +
> unique per user case-insensitive, description, color, icon), the default "Inbox" collection
> provisioned on signup (confirm the trigger from step 5 actually fires), rename/edit,
> delete (→ Trash, confirmation dialog showing affected item count), archive/unarchive,
> favorite/unfavorite, name-based search/filter in the Collections list, and per-collection
> statistics (item count by type, last updated). Enforce the uniqueness constraint with an
> inline validation error, not a generic failure.

Test: create a duplicate name (rejected inline), delete a collection with items (items move to
Trash, count shown correctly). Commit.

### 10. Navigation, Dashboard shell, theming

> **Prompt**
> Build the app navigation shell and an empty Dashboard layout (no widgets yet — those need
> items and search, which don't exist until Day 3/4; just the six section placeholders from
> `docs/01_MVP/Dashboard.md` with friendly empty states) and "Theming" — light/dark/system,
> persisted per-account (not just localStorage), applied without a page reload, per
> `docs/01_MVP/Settings.md`'s Theme section.

Test: toggle theme, reload, confirm it persisted; log in from a different browser, confirm the
same theme applies. Commit.

### 11. Run the Day 2 QA gate and deploy v0.1

> **Prompt**
> Go through every 🔴 item in `.claude/docs/qa-checklist.md` that applies to auth, RLS, and
> Collections. For each, either write an automated test or give me exact manual steps. Flag
> anything that fails.

Fix everything flagged before continuing.

```bash
git add . && git commit -m "Day 2 complete — v0.1 features" && git push
```

**Deploy:**
1. vercel.com → Add New Project → import the `nexus` repo → create **two** Vercel projects:
   one tracking `staging`, one tracking `main`.
2. Add every `.env.local` variable into both projects' Environment Variables (staging project
   points at `nexus-staging`'s Supabase keys; production project at `nexus-prod`'s).
3. `git checkout staging && git merge develop && git push origin staging` → confirm the staging
   deploy is green and the full regression CI job runs (see `.github/workflows/claude-qa.yml`).
4. `git checkout main && git merge staging && git tag v0.1 && git push origin main --tags` →
   confirm the production deploy.

**✅ v0.1 live. Day 2 (Core Platform) shipped.**

---

## DAY 3 — Knowledge Management — staging only, no production release today

### 12. Notes — CRUD, rich formatting, Markdown/WYSIWYG

> **Prompt**
> Build "Notes" create/edit and the full editor from `docs/01_MVP/Notes.md`: Markdown as the
> canonical source, a WYSIWYG surface on top with a raw-Markdown toggle, and support for
> headings, bold/italic/strikethrough, ordered/unordered lists, checklists (task-list syntax,
> toggleable from the rendered view without entering edit mode), code blocks with language
> selection and syntax highlighting, tables, links, and inline images (embedded by reference to
> an uploaded Image Knowledge Item, per the Attachments model in
> `docs/01_MVP/Knowledge_Items.md`).

Test: create a note, use every supported content type, confirm checklist toggling doesn't
require entering edit mode. Commit.

### 13. Notes — autosave and version history

> **Prompt**
> Build "Autosave" (debounced ~1–2s, visible Saving/Saved indicator, retry with backoff on
> failure, never silently discard an unsaved edit) and "Version history" (a new version
> boundary after a period of inactivity or on explicit close, list previous versions with
> timestamps, read-only preview of a past version, restore-as-new-version) per the Autosave and
> Version History sections of `Notes.md`.

Test: edit a note, wait for autosave, edit again after a pause, confirm two version boundaries
were created; restore an older version and confirm it becomes current without losing the
version being replaced. Commit.

### 14. Shared item behavior — tags, favorite, archive, move, trash/restore

> **Prompt**
> Build the shared Knowledge Item behaviors from `docs/01_MVP/Knowledge_Items.md` that apply
> across all item types (only Notes exist so far, but build this generically): tagging
> (implicit creation, per-item add/remove, plus a tag management view for rename/delete/merge),
> favorite/unfavorite, archive/unarchive, move between collections, and trash/restore/permanent
> delete (with the re-home-to-default-collection fallback if the original collection was
> deleted). Wire trash cascading from Collection deletion (step 9) into this.

Test: rename a tag and confirm it updates everywhere it's used; merge two tags; trash a note,
confirm it disappears from default views, restore it. Commit.

### 15. Stress test and Day 3 gate

> **Prompt**
> Write a script (or a seed migration) that creates a few hundred Notes for a test account with
> varied tags/collections. Confirm the Notes list/Collection view stays responsive. Then run
> the relevant items in `.claude/docs/qa-checklist.md` for Notes and shared item behavior —
> particularly the RLS checks (a user cannot read/tag/trash another user's items even by
> guessing IDs).

```bash
git checkout staging && git merge develop && git push origin staging
git add . && git commit -m "Day 3 complete — Knowledge Management (staging)"
```

**✅ Staging deploy only — no production release today, per the Roadmap cadence.**

---

## DAY 4 — Search & Organization (v0.2) — release Thursday

### 16. Global search — indexing, query, ranking

> **Prompt**
> Build "Global search" per `docs/01_MVP/Search.md`: a `tsvector`/GIN full-text index on
> `knowledge_items.search_vector` (title, description, tags, note body for now — other types'
> content joins in as they ship on Day 5), a search API backing search-as-you-type (debounced
> ~200-300ms), and relevance ranking that weights title matches above tag matches above body
> matches. Exclude trashed items entirely; include archived items with an "Archived" badge
> unless filtered out.

Test a query matching only note body content ranks correctly relative to a title match.
Commit.

### 17. Filters, sorting, recent searches

> **Prompt**
> Build the filter bar (type, collection, tag, favorite, archived, date range — combinable, AND
> across categories, OR within a multi-select tag filter) and sorting (relevance default with a
> query, recently-updated default when browsing without one, recently-created, title A–Z) from
> `Search.md`. Add "Recent searches" — last several distinct queries per user, shown when the
> search bar is focused with no query typed.

Commit.

### 18. Dashboard — full widgets

> **Prompt**
> Build out the full Dashboard from `docs/01_MVP/Dashboard.md` on top of the shell from Day 2:
> Recent Items, Recently Viewed (track view events separately from edit events), Favorites
> (collections + items combined), Recent Collections (by most recent activity, not
> alphabetical), Statistics (counts by type), and Upcoming Reminders (leave this section
> rendering its empty state — Reminders don't exist until Day 6). Back it with a single
> aggregated `/api/dashboard` endpoint per the performance note in `Dashboard.md`, and make sure
> one section failing doesn't blank the rest of the page.

Test: create/edit/favorite an item elsewhere, return to Dashboard, confirm it shows up without
a manual refresh. Kill one section's query on purpose, confirm the rest of the page still
renders. Commit.

### 19. Performance validation and Day 4 QA gate

> **Prompt**
> Generate a 5,000-item seeded dataset for a test account (mixed types, realistic tag/collection
> spread) and confirm Global Search returns in under 500ms server-side, per
> `docs/00_Project/Success_Metrics.md`. Then run the search/dashboard-relevant items in
> `.claude/docs/qa-checklist.md`.

```bash
git add . && git commit -m "Day 4 complete — v0.2 features" && git push
git checkout staging && git merge develop && git push origin staging
git checkout main && git merge staging && git tag v0.2 && git push origin main --tags
```

**✅ v0.2 live. Day 4 (Search & Organization) shipped.**

---

## DAY 5 — Knowledge Sources — staging only, no production release today

### 20. Website bookmarks — save flow + metadata background job

> **Prompt**
> Build "Website Bookmarks" per `docs/01_MVP/Website_Bookmarks.md`: paste-URL immediate save
> (never blocked on metadata), a background job (per CLAUDE.md rule #5 — never inline) that
> fetches Open Graph tags, falls back to `<title>`/meta description, extracts favicon and
> canonical URL, with a 10s timeout after which the item is marked "metadata unavailable" with
> a manual retry action. Store both the submitted URL and the canonicalized one. Add duplicate
> detection (non-blocking prompt) on canonicalized-URL match.

Test: save a real URL and watch metadata fill in asynchronously; save an unreachable URL and
confirm the graceful "unavailable" + retry state; save a duplicate and confirm the prompt.
Commit.

### 21. File uploads — PDFs, Images, general Files

> **Prompt**
> Build the shared upload mechanism and all three types from `docs/01_MVP/File_Uploads.md`:
> drag-and-drop + file picker, per-file progress, batch upload into the active Collection,
> client- and server-side size/type enforcement (PDF 50MB, Images 20MB, general Files against
> an explicit allow-list), MIME-type verification against actual file content (not just
> extension), and private-by-default Supabase Storage access via signed URLs. PDFs: in-app
> viewer + a background text-extraction job feeding `search_vector` (graceful "not searchable"
> state on extraction failure, upload still succeeds). Images: thumbnail generation for
> grid/list views. General files: inline preview where feasible, otherwise metadata + download.

Test uploading one of each type, including an oversized file (rejected client- and
server-side) and a PDF with no text layer (uploads fine, shows "not searchable"). Commit.

### 22. Code snippets

> **Prompt**
> Build "Code Snippets" per `docs/01_MVP/Code_Snippets.md`: code-content field (whitespace
> preserving), language selector with syntax highlighting, title/description/tags, one-click
> copy-to-clipboard, and full-text search indexing of the code content itself (so a distinctive
> function/variable name inside the snippet is findable via Global Search).

Test: create a snippet, search for a string that only appears inside its code, confirm it's
found. Commit.

### 23. Bulk import stress test and Day 5 QA gate

> **Prompt**
> Simulate a bulk import — a batch of real website URLs and a folder of files (mix of PDFs,
> images, a couple of oversized/invalid ones on purpose) — and confirm the upload pipeline
> handles it without blocking the UI or leaving orphaned Storage objects on failed uploads. Then
> run the upload/storage-relevant items in `.claude/docs/qa-checklist.md`.

```bash
git add . && git commit -m "Day 5 complete — Knowledge Sources (staging)"
git checkout staging && git merge develop && git push origin staging
```

**✅ Staging deploy only — no production release today.**

---

## DAY 6 — Polish (v1.0 Release Candidate) — release Saturday

### 24. Settings — full polish, data export/import

> **Prompt**
> Finish "Settings" per `docs/01_MVP/Settings.md`: confirm theme persists cross-device (built
> Day 2, verify), add the language selector stub (English-only, functional), the notification
> preferences toggle (global reminder emails on/off — wire the toggle now even though Reminders
> ship next in this same day), and Data Export/Import — export as Markdown (ZIP of
> per-collection folders), JSON (full structured export), and ZIP (JSON + files) as a background
> job with a completion notification; import from a previous JSON or Markdown export as a
> background job with a created/skipped summary, no merge/de-dupe attempt.

Test a full export → import round-trip reproduces equivalent data. Commit.

### 25. Reminders — full notification system

> **Prompt**
> Build "Notifications" (Reminders) per `docs/01_MVP/Notifications.md`: attach one-time,
> daily, weekly, monthly (correctly falling back to month-end for dates like the 31st), or
> custom-recurrence reminders to any Knowledge Item; a background scheduler (polls
> `reminders.next_fire_at`, per the index in `Database_Schema.md`) that dispatches email via
> Resend, respects the Settings toggle from step 24 (reminder still shows on Dashboard even with
> email off), catches up on missed reminders within a grace period, and deactivates/reactivates
> automatically on trash/restore of the associated item.

Add Resend key:
```bash
RESEND_API_KEY=
RESEND_FROM=notifications@yourdomain.com
```

Test: create a one-time reminder in the near future, confirm the email arrives; test a monthly
reminder on the 31st against a 30-day month; trash the item and confirm the reminder
deactivates. Commit.

### 26. Sharing — public view-only links

> **Prompt**
> Build "Sharing" per the Sharing section of `docs/01_MVP/Knowledge_Items.md`: generate a
> public, view-only, token-based link for any Knowledge Item, a read-only public route that
> renders only that item's content (never other account data), and immediate invalidation on
> revoke (regenerating produces a different token).

Test: share a note, open the link in an incognito window, confirm it renders read-only with no
other account data reachable; revoke it, confirm the old link 404s/expires immediately. Commit.

### 27. Activity log, accessibility pass, error/empty states

> **Prompt**
> Build the Activity Log (created/edited/deleted/restored/shared events per
> `docs/03_Architecture/Database_Schema.md`'s `activity_log` table) as a simple per-account
> timeline. Then do a full accessibility pass per
> `docs/03_Architecture/Non_Functional_Requirements.md`: keyboard navigation for every
> interactive element (including the rich-text toolbar), ARIA labeling on icon-only buttons,
> and WCAG AA contrast in both themes. Finally, sweep the app for missing error/empty states —
> every list, form, and background-job status should have a real state, not a blank screen.

Commit.

### 28. Full regression, Lighthouse audit, Day 6 QA gate

> **Prompt**
> Run the full Playwright regression suite (not just `@smoke`) locally against a build, and a
> Lighthouse pass for performance and accessibility. Then run `.claude/docs/qa-checklist.md`
> end to end — every 🔴 item across every day so far, not just today's.

Fix everything flagged.

```bash
git add . && git commit -m "Day 6 complete — v1.0 Release Candidate" && git push
git checkout staging && git merge develop && git push origin staging
git checkout main && git merge staging && git tag v1.0-rc1 && git push origin main --tags
```

**✅ v1.0 Release Candidate live — staging and production.**

---

## DAY 7 — Production (v1.0) — release Sunday

### 29. Bug fixing and refactor pass

Fix anything flagged by the RC (step 28) or found in manual use. Each bug gets its own
`fix/<short-name>` branch off `develop` (see `.claude/docs/git-workflow.md`'s fix path), self-
merged the same way as a feature.

### 30. Full documentation pass

> **Prompt**
> Write the final project documentation: an architecture overview, the actual API reference
> (reconciled against what `docs/03_Architecture/API_Design.md` sketched vs. what was actually
> built), the actual database schema (reconciled against `Database_Schema.md`), a project
> README covering setup/run/deploy, a deployment guide, and a testing guide covering how to run
> the full suite locally and in CI.

Commit.

### 31. Final regression, security review, and the v1.0 release

> **Prompt**
> Run the entire QA & Security Checklist (`.claude/docs/qa-checklist.md`) end to end, all
> sections, one final time — this is the last pre-launch check. Also do a focused security
> review: RLS on every table (re-verify in the Supabase dashboard, not just by reading
> migrations), no service-role key in any client bundle (grep the built output), and every
> background job fails gracefully without leaking a stack trace to the user.

```bash
git add . && git commit -m "Day 7 complete — v1.0 production ready" && git push
git checkout staging && git merge develop && git push origin staging
git checkout main && git merge staging && git tag v1.0 && git push origin main --tags
git checkout develop && git merge main && git push origin develop   # sync main back into develop
```

**✅ v1.0 live in production. 🎉 MVP complete — 43/43 core features shipped across Days 2–6.**

---

## Beyond v1.0 — Post-MVP / Future scope

Not scheduled, and not part of the day-by-day cadence above. Build only after v1.0 ships and
usage informs priority (`docs/00_Project/Roadmap.md`, "Beyond v1.0"), and only on explicit
confirmation — never build any of these speculatively:

- Browser extension (`docs/02_Development/Browser_Extension.md`)
- Telegram notification channel (`docs/02_Development/Telegram.md`)
- AI features — auto-summary, auto-tagging, duplicate detection, related items, smart
  collections (`docs/02_Development/AI.md`)
- Semantic search (`docs/02_Development/Semantic_Search.md`)
- RSS feed items as a Knowledge Item type (`docs/02_Development/RSS.md`)
- GitHub repository items as a Knowledge Item type (`docs/02_Development/GitHub.md`)

Each gets its own build-order recipe + schema when its time comes, the same way this document
was written — read the relevant `docs/02_Development/*.md` in full first, then write the
per-feature prompts.

**Never build anything from `Scope.md`'s "Explicitly Out of Scope" list** (multi-user
collaboration, payments, native apps, offline sync, etc.) without first updating `Scope.md`
itself — that file is the single source of truth for what's in scope, and a scope change should
be a deliberate decision, not an incidental one made mid-implementation.

---

## Keeping PROGRESS.md in sync

`/ship-feature` already ticks `PROGRESS.md` as part of its own flow (step 8 in
`.claude/docs/git-workflow.md`). If you ever build something outside that command, tell Claude
Code directly:

> Mark "[feature name]" as complete under Day N in `PROGRESS.md`.

This keeps `PROGRESS.md` an accurate log of what's actually built, not just what was planned —
useful for you and for any future Claude Code session picking up where you left off.
