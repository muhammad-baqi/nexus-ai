# Nexus — Build Progress

> Single source of truth for **what's actually built**, updated after every feature ships.
> Feature list and build order live in `CLAUDE.md` and `build-order-complete.md`. Day themes
> and release cadence are `docs/00_Project/Roadmap.md`.
> `[ ]` = not started · `[~]` = in progress · `[x]` = done & committed.

Last updated: 2026-07-29 — Day 2: Register, Email verification, and Login shipped (3/16). Vercel is
connected (one project tracking `main`; a second project tracking `staging` is still
outstanding, see infra note below). `develop`/`staging`/`main` were promoted early as a
connection test — `nexus-prod` Supabase schema push is still outstanding too.

---

## Setup gate (before any code)

- [x] `.claude/`, `.github/` in place (this package)
- [x] Git repo + GitHub remote; branches `develop`, `staging`, `main` created and pushed
- [x] Git hooks active: `git config core.hooksPath .githooks` (blocks commits/pushes to staging/main)
- [x] Accounts created (below)
- [x] `CLAUDE_CODE_OAUTH_TOKEN` repo secret set (via `claude setup-token` + manual GitHub secret, since `gh` CLI wasn't available for `/install-github-app`)

### Accounts / credentials

- [x] GitHub — repo created (`muhammad-baqi/nexus-ai`)
- [x] Vercel (Hobby) — account created, not yet connected to the repo
- [x] Supabase — two free projects: `nexus-staging`, `nexus-prod`
- [x] Claude Code CLI — installed, logged into Pro/Max subscription

---

## Day 1 — Foundation (0 user-facing features — infra only)

- [x] Repo scaffold (Next.js 16 App Router + TS + Tailwind + shadcn/ui + ESLint/Prettier)
- [x] Docker local dev (`docker compose up` works)
- [x] Supabase clients wired — local CLI stack + `nexus-staging` hosted project; `nexus-prod` schema push deferred to the v0.1 production release (Day 2)
- [x] Vitest + Playwright configured
- [x] Initial database migration scaffolding + RLS convention in place (`supabase/migrations/001_initial_schema.sql` — 13 tables, RLS on all, verified locally and against `nexus-staging`)
- [x] Design tokens / component library base (shadcn/ui, base-nova preset)
- [ ] **Nothing user-facing ships today — that's expected.**

**Day 1 status: done.** Vercel is connected and deploying on push.

**Outstanding infra (not blocking Day 2 feature work, revisit before relying on them):**
- Second Vercel project tracking `staging` (currently only one project, tracking `main`);
  `nexus-prod` Supabase schema push.
- Local dev: the browser can't reach `NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321`
  (only resolvable from inside the app's Docker container, not from a host browser) — blocks
  driving a real signed-in flow against local Supabase from a host browser. Needs either a
  `127.0.0.1 host.docker.internal` hosts-file entry (requires admin rights) or splitting the
  client- and server-side Supabase URL env vars.
- The `playwright` Docker service hits `ERR_SSL_PROTOCOL_ERROR` launching Chromium against a
  plain-http URL inside its container (curl to the same URL works fine, so it's a browser-launch
  issue, not real network unreachability) — blocks running `e2e/*.spec.ts` via
  `docker compose --profile test run playwright` until resolved.

## Day 2 — Core Platform (v0.1) — release Tuesday (3/16)

- [x] Register (email + password) — `app/register`, `components/auth/register-form.tsx`; no
  custom API route (Supabase Auth client SDK direct from the frontend, per API_Design.md).
  Unit + component tests green (12/12), typecheck/lint clean. Manually driven in a real
  browser via Claude-in-Chrome — form render, validation, and the error state all confirmed
  live; the true happy-path ("check your email") wasn't confirmed against a live backend in a
  real browser due to two local-dev environment gaps (see note below) — it is covered by a
  mocked component test exercising the same render path, and by `e2e/register.spec.ts`
  (written, not yet green — same gaps). Also fixed several latent infra bugs this feature was
  the first to exercise: Docker's Node 20 image vs. deps requiring Node ≥22 (jsdom,
  `@supabase/supabase-js`, `@testing-library/jest-dom`) — bumped to `node:22-bookworm-slim`;
  Vitest missing Testing Library's `afterEach(cleanup)`; the `playwright` Docker service never
  had browsers installed; local Supabase had `enable_confirmations = false`, contradicting the
  spec and this project's own test instructions.
- [x] Email verification — custom Supabase confirmation email template links to our own
  `app/auth/confirm` route (`token_hash` + `type=email` params, not Supabase's default
  `/auth/v1/verify`, whose tokens land in an unusable URL fragment); the route validates the
  query with zod, calls `supabase.auth.verifyOtp()` server-side, and redirects to
  `/verify-email?status=success|expired|invalid`. Clicking the link signs the user in directly
  (verifyOtp establishes a session) — there's no separate manual-login step for this path, and
  register-form/verify-email copy says so explicitly. Added a rate-limited "Resend email" action
  to the register form's check-your-email screen (60s client-side cooldown, distinct messaging
  for Supabase's real `over_email_send_rate_limit` response vs. a generic failure, and a test
  locking in that an already-confirmed account gets the same generic message — no enumeration).
  26/26 unit/integration tests green, typecheck clean. Verified live against the real local
  Supabase stack via direct HTTP requests (register → real confirmation email → real
  `/auth/confirm` redirect with a session cookie set → `/verify-email?status=success`; also the
  `expired`/`invalid` paths and the real rate-limit response) — the Chrome extension wasn't
  connected this session, so this wasn't a visual browser walkthrough like Register's, but it did
  exercise the exact same server code paths end-to-end. `e2e/verify-email.spec.ts` is written but
  not yet green, blocked by the same `playwright`-in-Docker `ERR_SSL_PROTOCOL_ERROR` noted below
  for `register.spec.ts`. Self-review (code-reviewer subagent) caught two real issues, both
  fixed: the redirect origin was being built from the request's Host header (now prefers
  `NEXT_PUBLIC_APP_URL`), and the auto-login behavior above was an unflagged side effect (now
  documented and the UI copy matches it).
- [x] Login — `app/login`, `components/auth/login-form.tsx`; `supabase.auth.signInWithPassword()`
  direct from the client, same pattern as Register. Three-way error handling confirmed live
  against real Supabase error codes: `invalid_credentials` (Supabase returns this same code for
  both wrong password and an unknown email, so no-enumeration is free) shows one generic
  "Invalid email or password"; `email_not_confirmed` swaps to a "verify your email first" state
  with a resend option; anything else shows a generic retry-able error. Success redirects to `/`
  — there's no Dashboard yet (later Day 2 item). Extracted `ResendVerificationButton` out of
  `RegisterForm` into a shared component since Login's unverified state needed identical
  resend/cooldown behavior. Repeated-failed-login rate limiting relies on Supabase's
  already-configured IP-based `sign_in_sign_ups` limit rather than a new per-account
  attempt-counter table — a deliberate scope decision, not a silent gap. 33/33 unit tests green,
  typecheck clean. Verified live: register → real Mailpit confirmation link → login tested with
  correct password, wrong password, unknown email, and an unverified account, all matching the
  UI states above. Self-review caught a real bug in the new `e2e/helpers/mailpit.ts` shared
  helper (picked the oldest message for an address instead of the newest) — fixed and reverified
  live with two messages on one address. `e2e/login.spec.ts` written but not yet green, same
  known `playwright`-in-Docker blocker as the other two e2e specs.
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
