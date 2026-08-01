# Nexus — Build Progress

> Single source of truth for **what's actually built**, updated after every feature ships.
> Feature list and build order live in `CLAUDE.md` and `build-order-complete.md`. Day themes
> and release cadence are `docs/00_Project/Roadmap.md`.
> `[ ]` = not started · `[~]` = in progress · `[x]` = done & committed.

Last updated: 2026-08-01 — **Day 2 QA gate passed**, both 🔴 blockers found and closed:
`e2e/login.spec.ts`/`e2e/logout.spec.ts` were stale (still asserted the pre-Dashboard-shell
landing-on-`/` behavior instead of the redirect to `/dashboard`) — fixed on
`fix/e2e-dashboard-redirect`, all 5 `@smoke` tests green. `npm run build` fails locally in this
Docker/Windows dev environment — both Turbopack and `--webpack` throw inside React internals
while prerendering Next's own auto-generated `/_not-found`/`/_global-error` boilerplate pages
(not app code), reproducible on a clean `next_cache` volume; **confirmed NOT a production
issue** — Vercel's `main` deploy from the same commit built and is live. Treat as a known
local-only environment quirk (Turbopack/webpack + Windows bind-mount over Docker Desktop,
likely) alongside the Day 1 dev-cache-staleness note below — don't re-diagnose it as an app bug;
re-investigate only if it starts affecting Vercel too. `develop`/`staging`/`main` are in sync.
Infra is now fully set up: two Vercel projects (staging → `staging`, production → `main`), two
Supabase projects (`nexus-staging`, `nexus-prod`) with all 3 migrations applied to both.

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
- ~~Second Vercel project tracking `staging`~~ — **done 2026-08-01**: two Vercel projects now
  exist (staging → `staging`, production → `main`); `nexus-prod`'s schema was already pushed, so
  both prod-side pieces are complete.
- Supabase Auth's Site URL/Redirect URLs (both projects) still point at `localhost:3000` —
  expected while testing locally, needs pointing at the real Vercel URLs before testing a
  deployed (non-localhost) signed-in flow.
- Local dev: the browser can't reach `NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321`
  (only resolvable from inside the app's Docker container, not from a host browser) — blocks
  driving a real signed-in flow against local Supabase from a host browser. Needs either a
  `127.0.0.1 host.docker.internal` hosts-file entry (requires admin rights) or splitting the
  client- and server-side Supabase URL env vars.

**Resolved 2026-07-29 (`chore/e2e-playwright-docker-fixes`):** `e2e/*.spec.ts` now runs green via
a real Chromium browser in `docker compose --profile test run playwright` — previously blocked
end-to-end, several compounding root causes, each confirmed live rather than guessed:
1. `ERR_SSL_PROTOCOL_ERROR` on every navigation: the Docker service was named `app`, and Chromium
   hardcodes HSTS (forced-HTTPS) for the real `.app` gTLD, which matches a bare hostname literally
   named "app". Routing the playwright service through `host.docker.internal:3000` (published
   port) instead of a same-network service-name/alias avoided the collision.
2. `net::ERR_CONNECTION_REFUSED` mid-test, from Mailpit: `e2e/helpers/mailpit.ts` defaulted to
   `127.0.0.1:54324`, correct for a host-run Playwright but self-referential from inside the
   playwright container — now configurable via `MAILPIT_URL`, set to `host.docker.internal:54324`
   for the Docker service.
3. Hydration silently broken (native form submit instead of React's, blank/uninteractive pages):
   Next 15+'s dev-server origin protection (DNS-rebinding defense) rejects HMR/RSC requests from
   hostnames not in `allowedDevOrigins` — added `host.docker.internal` there (`next.config.ts`).
4. `/auth/confirm`'s redirect `Location` always uses `NEXT_PUBLIC_APP_URL`
   (`http://localhost:3000`) — confirmed live that Next's dev server doesn't vary this per the
   request's actual Host, so pinning to that env var (added during Email verification's
   self-review, for production's sake) broke the same server being reached multiple ways at once
   locally. Now only pinned when `NODE_ENV === "production"`; every origin that can reach the dev
   server locally is already trusted, unlike a real deployment.
5. Even after that, the *browser* never re-navigated correctly: Playwright/Chromium doesn't
   surface a cross-origin *navigation* redirect to `page.route()` interception at all (confirmed
   live with a catch-all route) — apparently a site-isolation-related gap. `followConfirmationLink`
   (`e2e/helpers/mailpit.ts`) now hits `/auth/confirm` via the browser context's own request API
   (shares its cookie jar with `page`) instead of `page.goto()`, reads the `Location` header
   itself, and navigates to the corrected same-origin path.
6. Two smaller test bugs surfaced once the above was fixed and specs could actually run for the
   first time: `getByLabel("Password")` substring-matched both "Password" and "Confirm password"
   (needed `{ exact: true }`), and the session-cookie regex `/^sb-.*-auth-token/` also matched
   Supabase's PKCE `-auth-token-code-verifier` cookie (tightened to anchor the end).

Also pushed `nexus-prod`'s Supabase schema (`supabase link --project-ref
qdhtdqccuycljzvzvyis && supabase db push`, migration `001_initial_schema.sql`) — it existed since
initial setup but was never linked/pushed. Re-linked back to `nexus-staging` afterward so local
CLI commands don't default to prod.

## Day 2 — Core Platform (v0.1) — release Tuesday (16/16)

- [x] Register (email + password) — `app/register`, `components/auth/register-form.tsx`; no
  custom API route (Supabase Auth client SDK direct from the frontend, per API_Design.md).
  Unit + component tests green (12/12), typecheck/lint clean. Manually driven in a real
  browser via Claude-in-Chrome — form render, validation, and the error state all confirmed
  live; the true happy-path ("check your email") wasn't confirmed against a live backend in a
  real browser due to two local-dev environment gaps (see note below) — it is covered by a
  mocked component test exercising the same render path, and by `e2e/register.spec.ts` (written
  then, later confirmed green — see the Day 1 "Resolved 2026-07-29" note above). Also fixed
  several latent infra bugs this feature was
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
  exercise the exact same server code paths end-to-end. `e2e/verify-email.spec.ts` (written then,
  later confirmed green — Day 1 note above). Self-review (code-reviewer subagent) caught two real issues, both
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
  live with two messages on one address. `e2e/login.spec.ts` (written then, later confirmed
  green — Day 1 note above).
- [x] Logout — `components/auth/logout-button.tsx` calls
  `supabase.auth.signOut({ scope: "global" })` (explicit rather than relying on the library
  default), then redirects to `/`. Confirmed live that this genuinely revokes the session
  server-side — an access token that worked before logout got a real `session_not_found` from
  Supabase after, not just a client-side cookie clear. `app/page.tsx` (still the untouched
  `create-next-app` scaffold until now) became an auth-aware Server Component since there's no
  Dashboard yet: signed-in shows "Signed in as {email}" + Logout, signed-out shows Log
  in/Register links. 39/39 unit tests green, typecheck clean. Self-review: clean approve, no
  critical/warning findings; applied the one suggestion (explicit `signOut` scope).
  `e2e/logout.spec.ts` (written then, later confirmed green — Day 1 note above).
- [x] Password reset (request + set new password) — reuses `app/auth/confirm/route.ts` (now
  handling both `type=email` and `type=recovery`) instead of Supabase's default fragment-based
  verify link, same trick Email Verification already established. New `/forgot-password` (always
  the same "if an account exists..." message, no enumeration) and `/reset-password` pages.
  Setting the new password calls `signOut({scope: "global"})`, ending every session including the
  one the recovery link just established, per `Authentication.md`. Verified live: real Mailpit
  round-trip (request → email → `/auth/confirm?type=recovery` → `/reset-password` → new password
  → forced back to `/login` → old password rejected, new one works).
- [x] Change password (logged in) — `components/auth/change-password-form.tsx` on the new
  `/settings` page; re-verifies the current password via `signInWithPassword` before calling
  `updateUser`, then `signOut({scope: "others"})` — other sessions end, the current tab stays
  signed in (distinct from Password Reset's `scope: "global"`). Verified live.
- [x] Delete account (cascading) — password-confirmation gate, irreversible-action warning;
  `app/api/auth/account/route.ts` re-verifies the password via a stateless client, best-effort
  cleans up the user's avatar Storage objects, then calls a new service-role admin client
  (`lib/supabase/admin.ts`) to delete the auth user. Cascading delete of `profiles`/
  `collections`/`knowledge_items` is handled entirely by the `on delete cascade` FKs already in
  `supabase/migrations/001_initial_schema.sql` — verified live directly against Postgres (user,
  profile, and Inbox collection rows all gone after deletion, not just a 200 response). Also
  introduces `app/(app)/layout.tsx`, a shared auth-gated route group Settings/Collections/
  Dashboard all build on, and fixed `supabase/config.toml`'s `max_frequency` (was `1s`, now `60s`
  to actually match `Authentication.md`'s 1-request-per-60s rate limit both this feature's and
  Email Verification's resend flows rely on). 86/86 unit/integration tests green, typecheck
  clean. Self-review (code-reviewer subagent) caught a real issue — avatar Storage cleanup
  silently swallowed a resolved `{error}` response instead of just a thrown exception — fixed and
  covered by a new test.
- [x] Profile management — display name, avatar (basic) — `components/settings/profile-form.tsx`
  on `/settings`; new `GET`/`PATCH /api/settings` route (zod-validated), and a private `avatars`
  Storage bucket (`supabase/migrations/002_avatars_storage.sql`) with RLS scoped to a
  `{owner_id}/avatar` path — avatars are always served via a short-lived signed URL, never a
  public one. Avatar uploads go directly from the browser to Storage (RLS-protected by the
  caller's own session), then the resulting path is PATCHed onto `profiles.avatar_url` (which,
  despite its name, stores a Storage path, not a URL — noted in `Database_Schema.md`). Initials
  fallback (e.g. "AD" for "Ada Lovelace", or from email if no name is set) when no avatar is set.
  Also fixed a latent Day 1 bug this feature was the first to expose: `public.profiles` (and
  every other table from migration 001) was missing real `SELECT`/`INSERT`/`UPDATE` grants for
  the `anon`/`authenticated` roles underneath its RLS policies — migrations run as `postgres`,
  whose default-privilege entry for `public` only ever granted `DELETE`/`REFERENCES`/`TRIGGER`/
  `MAINTAIN`. Every prior Day 2 feature only ever touched `auth.users` (via Supabase Auth) or
  wrote through the `security definer` `handle_new_user` trigger, so this never surfaced until
  Profile management became the first feature to read/write a table directly through the
  session's `authenticated` role. Fixed via a new migration (`003_grant_table_privileges.sql`)
  granting the standard Supabase default going forward — this would otherwise have silently
  blocked Collections, Notes, and everything else built on direct table access. 107/107
  unit/integration tests green, typecheck clean. Verified live against the real local Supabase
  stack: display name save round-trips through a real page reload and is confirmed directly in
  Postgres; the Storage RLS boundary was proven directly against the Storage API with a real
  session token (own-folder upload → 200, another user's folder → 403 RLS denial); the full
  read path (DB path → server-generated signed URL → `<img>`) renders a real uploaded image.
  Both new migrations were also pushed to `nexus-staging`. Self-review (code-reviewer subagent)
  caught two real issues, both fixed: the settings page silently swallowed the profile-fetch/
  sign errors instead of logging them (CLAUDE.md rule #4), and the initials fallback read the
  stale initial-render name instead of the live just-saved one.
- [x] Default "Inbox" collection provisioned on signup — verified live (already worked via the
  Day 1 `handle_new_user` trigger; Collections work just confirmed it end-to-end).
- [x] Collections — create, rename, edit (description/color/icon) — `/collections`,
  `app/api/collections/*` (zod-validated, case-insensitive duplicate-name → inline 409).
- [x] Collections — delete (→ Trash, with affected-item-count confirmation) — real stats-backed
  count shown before deleting; a Trash view + Restore action also shipped (needed for this
  feature's own create→delete→restore acceptance criterion). Cascades to `knowledge_items`
  (no items exist until Day 3, but correct today regardless of row count).
- [x] Collections — archive / unarchive
- [x] Collections — favorite / unfavorite (favorites sort first)
- [x] Collections — search by name (client-side), statistics (item count by type, last updated,
  computed on read per Collections.md)

  All of the above: 175/175 unit/integration tests green, typecheck clean, `e2e/collections.spec.ts`
  (@smoke) covers create → duplicate-name rejection → delete → restore live against Mailpit +
  local Supabase. RLS verified directly against PostgREST with a second real account (cross-user
  read/write both return empty/0-rows). Self-review (code-reviewer subagent) caught real gaps,
  all fixed: the missing restore UI/e2e coverage above, a stale-zero bug where a failed stats
  fetch could understate the delete confirmation's item count, and missing UUID validation on
  path params (shared into a new `lib/supabase/require-user.ts` helper). Also hit a recurring
  Turbopack dev-server staleness issue this session (routes silently 404s until a full
  `docker compose down` + cache-volume removal) — environment quirk, not an app bug; noted here
  in case it recurs in Day 3.
- [x] App navigation + Dashboard shell (layout only — widgets land Day 4) — `components/layout/app-nav.tsx`
  (Dashboard/Collections/Settings/Logout) rendered from `app/(app)/layout.tsx`; `/dashboard`
  shows the six section placeholders from `Dashboard.md` as friendly empty states (real data
  needs Notes/Search, Day 3/4). Landing page (`app/page.tsx`) now redirects signed-in visitors
  to `/dashboard` instead of the old ad hoc "Signed in as {email}" block.
- [x] Theming — light / dark / system, persisted per-account — hand-rolled (no new dependency):
  a `theme` cookie read server-side in the root layout avoids a flash for the common case, a
  static inline pre-paint script (`components/theme/theme-script.tsx`) covers first-load/
  no-cookie/system, and `profiles.theme_preference` is the actual cross-device source of truth
  — `ThemeSync` reconciles it into the local cookie on every authenticated page load. No live
  OS-preference-change listener while a tab stays open — a deliberate Day 2 scope cut, not
  required by `Settings.md`'s acceptance criteria (only explicit-selection immediacy is).
  192/192 unit/integration tests green, typecheck clean. Self-review (code-reviewer subagent)
  caught a real bug: the layout silently swallowed the profile-fetch error and defaulted to
  "system," which `ThemeSync` would then treat as authoritative and use to overwrite a user's
  actual theme on any transient DB error — fixed to log and skip the sync instead of guessing.
  Also fixed an unhandled-rejection gap in the toggle's own save.
- [x] **v0.1 code-complete on `develop` — 16/16 Day 2 features shipped.** Promoting
  `develop → staging → main` (tag `v0.1`) is the human's action, not the agent's — see
  `.claude/docs/git-workflow.md`. Day 2 QA gate (`.claude/docs/qa-checklist.md`) still to run
  before that promotion.

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
