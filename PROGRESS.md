# Nexus — Build Progress

> Single source of truth for **what's actually built**, updated after every feature ships.
> Feature list and build order live in `CLAUDE.md` and `build-order-complete.md`. Day themes
> and release cadence are `docs/00_Project/Roadmap.md`.
> `[ ]` = not started · `[~]` = in progress · `[x]` = done & committed.

Last updated: 2026-07-28 — repo carries planning docs + this workflow package only. No
application code exists yet (see `PHASES.md`). Day 1 (scaffold) is the first feature work.

---

## Setup gate (before any code)

- [x] `.claude/`, `.github/` in place (this package)
- [~] Git repo + GitHub remote; branches `develop`, `staging`, `main` created — `develop` pushed, `staging`/`main` pending (human-created)
- [x] Git hooks active: `git config core.hooksPath .githooks` (blocks commits/pushes to staging/main)
- [~] Accounts created (below)
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` repo secret set (`/install-github-app`, or manually — see `SETUP_CHECKLIST.md`)

### Accounts / credentials

- [x] GitHub — repo created (`muhammad-baqi/nexus-ai`)
- [x] Vercel (Hobby) — account created, not yet connected to the repo
- [x] Supabase — two free projects: `nexus-staging`, `nexus-prod`
- [x] Claude Code CLI — installed, logged into Pro/Max subscription

---

## Day 1 — Foundation (0 user-facing features — infra only)

- [ ] Repo scaffold (Next.js App Router + TS + Tailwind + shadcn/ui + ESLint/Prettier)
- [ ] Docker local dev (`docker compose up` works)
- [ ] Supabase clients wired for both environments (staging/prod projects, local CLI for dev)
- [ ] Vitest + Playwright configured
- [ ] Initial database migration scaffolding + RLS convention in place
- [ ] Design tokens / component library base (shadcn/ui installed via MCP)
- [ ] **Nothing user-facing ships today — that's expected.**

## Day 2 — Core Platform (v0.1) — release Tuesday (0/16)

- [ ] Register (email + password)
- [ ] Email verification
- [ ] Login
- [ ] Logout
- [ ] Password reset (request + set new password)
- [ ] Change password (logged in)
- [ ] Delete account (cascading)
- [ ] Profile management — display name, avatar (basic)
- [ ] Default "Inbox" collection provisioned on signup
- [ ] Collections — create, rename, edit (description/color/icon)
- [ ] Collections — delete (→ Trash, with affected-item-count confirmation)
- [ ] Collections — archive / unarchive
- [ ] Collections — favorite / unfavorite
- [ ] Collections — search by name, statistics (item count by type, last updated)
- [ ] App navigation + Dashboard shell (layout only — widgets land Day 4)
- [ ] Theming — light / dark / system, persisted per-account
- [ ] **v0.1 released to production** ✅

## Day 3 — Knowledge Management — release Wednesday (staging only) (0/11)

- [ ] Notes — create, edit title/body
- [ ] Notes — rich formatting (headings, bold/italic, lists, checklists, code blocks, tables, links, inline images)
- [ ] Notes — Markdown source / WYSIWYG toggle
- [ ] Notes — autosave (debounced, save-status indicator, retry on failure)
- [ ] Notes — version history (view list, view a version, restore)
- [ ] Notes — checklist items toggleable from rendered view
- [ ] Shared item behavior — tag (create/rename/delete/merge), favorite, archive
- [ ] Shared item behavior — move between collections
- [ ] Shared item behavior — trash / restore / permanent delete (cascades to collection delete)
- [ ] Stress test: agent creates hundreds of notes, confirm UI stays responsive
- [ ] **Staging deploy — no production release today**

## Day 4 — Search & Organization (v0.2) — release Thursday (0/10)

- [ ] Global search — full-text across title, description, tags, note body
- [ ] Search-as-you-type (debounced instant results)
- [ ] Filters — type, collection, tag, favorite, archived, date range (combinable)
- [ ] Sorting — relevance (default w/ query), recently updated, recently created, title A–Z
- [ ] Recent searches (shown on focus, no query typed)
- [ ] Dashboard — recent items, recently viewed widgets
- [ ] Dashboard — favorites widget (collections + items), recent collections widget
- [ ] Dashboard — statistics widget (counts by type)
- [ ] Dashboard — upcoming reminders widget (empty until Day 6 ships Notifications)
- [ ] 5,000-item stress test — confirm search <500ms server-side, pagination holds
- [ ] **v0.2 released to production** ✅

## Day 5 — Knowledge Sources — release Friday (staging only) (0/13)

- [ ] Website bookmarks — paste URL → immediate save, async metadata fetch
- [ ] Website bookmarks — metadata extraction (title, description, OG image, favicon, canonical URL, domain)
- [ ] Website bookmarks — duplicate detection prompt (non-blocking)
- [ ] Website bookmarks — manual retry on metadata failure
- [ ] Website bookmarks — screenshot (optional, best-effort)
- [ ] Website bookmarks — reading mode (optional, time-permitting)
- [ ] File uploads — PDFs (upload, in-app preview, download)
- [ ] File uploads — PDF text extraction background job (search-indexed; graceful failure state)
- [ ] File uploads — Images (upload, thumbnail + full-size preview, download)
- [ ] File uploads — General files (allow-listed types, metadata view or inline preview, download)
- [ ] File uploads — size/type limits enforced client- and server-side
- [ ] Code snippets — create/edit, language select, syntax highlighting, copy-to-clipboard
- [ ] Bulk import stress test (websites + files)
- [ ] **Staging deploy — no production release today**

## Day 6 — Polish (v1.0 Release Candidate) — release Saturday (0/14)

- [ ] Settings — profile (display name, avatar) full polish
- [ ] Settings — theme persistence confirmed cross-device
- [ ] Settings — language selector stub (English only, functional)
- [ ] Settings — notification preferences (global email reminders on/off)
- [ ] Settings — data export (Markdown / JSON / ZIP, background job + completion notice)
- [ ] Settings — data import (JSON / Markdown, background job + summary)
- [ ] Reminders — one-time, daily, weekly, monthly, custom recurrence
- [ ] Reminders — email delivery via background scheduler, missed-reminder catch-up
- [ ] Reminders — deactivate on trash, reactivate on restore
- [ ] Sharing — public view-only share link per Knowledge Item (generate/revoke)
- [ ] Activity log (created/edited/deleted/restored/shared events)
- [ ] Accessibility pass — keyboard nav, ARIA labeling, WCAG AA contrast (both themes)
- [ ] Error/empty states pass across all surfaces
- [ ] Full Playwright regression + Lighthouse performance/accessibility audit
- [ ] **v1.0 Release Candidate — staging + production** ✅

## Day 7 — Production (v1.0) — release Sunday (0/6)

- [ ] Bug fixing from RC feedback
- [ ] Refactoring pass
- [ ] Full documentation (architecture, API, database, README, deployment, testing)
- [ ] Final manual + automated regression pass
- [ ] Security review (`.claude/docs/qa-checklist.md` full pass, all 🔴 items)
- [ ] **v1.0 released to production** 🎉

**MVP = 43 features across Days 2–6 (Day 1 and Day 7 are infra/hardening, not new features).**

---

## Post-MVP / Future scope — NOT scheduled

Build only after v1.0 ships, and only on explicit confirmation. Priority among these is not
fixed — revisit based on real v1.0 usage (`docs/00_Project/Roadmap.md`, "Beyond v1.0").

- [ ] Browser extension (one-click capture) — `docs/02_Development/Browser_Extension.md`
- [ ] Telegram notification channel — `docs/02_Development/Telegram.md`
- [ ] AI features — auto-summary, auto-tagging, duplicate detection, related items, smart collections — `docs/02_Development/AI.md`
- [ ] Semantic search — `docs/02_Development/Semantic_Search.md`
- [ ] RSS feed items as a Knowledge Item type — `docs/02_Development/RSS.md`
- [ ] GitHub repository items as a Knowledge Item type — `docs/02_Development/GitHub.md`

### Explicitly out of scope — never build without a deliberate scope decision in `Scope.md`

- [ ] Multi-user collaboration / shared workspaces
- [ ] Real-time collaborative editing
- [ ] Complex per-item permission systems
- [ ] Payments, billing, subscriptions
- [ ] Native mobile / desktop apps
- [ ] Offline sync
- [ ] Live chat / messaging between users
- [ ] Notification channels beyond email (push, Discord, Slack, WhatsApp)
- [ ] Password-protected or expiring share links
- [ ] OAuth / social login, MFA, magic-link login
