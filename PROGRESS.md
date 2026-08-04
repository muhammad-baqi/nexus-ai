# Nexus — Build Progress

> Single source of truth for **what's actually built**, updated after every feature ships.
> Feature list and build order live in `CLAUDE.md` and `build-order-complete.md`. Day themes
> and release cadence are `docs/00_Project/Roadmap.md`.
> `[ ]` = not started · `[~]` = in progress · `[x]` = done & committed.

Last updated: 2026-08-04 — **Day 3 stress test complete** (build-order-complete.md #15):
`scripts/seed-stress-test.mjs` (new, kept for reuse on future stress tests) seeds a real account
via real signup + real Mailpit confirmation + `verifyOtp` (no service-role shortcuts) with 5
Collections, 8 Tags, and **15 Notes** with randomized favorite/archive flags and 0–3 tags each —
scaled down from build-order-complete.md's "a few hundred" to 15 per explicit user instruction
(local Docker/Supabase stack on this laptop can't comfortably run a few-hundred-note seed plus a
live browser session on top of it); every insert goes through the normal anon-key + user-session
client, never the service-role key, so seeding itself doubled as a live RLS exercise. Confirmed
responsive live in a real Chromium browser via the dockerized `playwright` service (the only
reliable way to drive a real login locally — both `claude-in-chrome` and a host-run Playwright
MCP browser hit the previously-documented `host.docker.internal` DNS gap when the client-side
Supabase SDK tries to reach local Supabase directly during login; the dockerized `playwright`
service resolves it fine, same as the existing `e2e/*.spec.ts` suite already relies on): login →
redirect 465ms, `/collections` render 1002ms, a populated Collection detail view (3 notes) render
1878ms, all on a warm dev-server route (a cold first hit was ~3.5s, Turbopack compile overhead,
not a real perf signal). Re-ran the RLS checklist items build-order-complete.md's prompt calls out
by name: a second real (freshly signed-up, Mailpit-confirmed) account attempted, directly against
PostgREST with real access tokens (no mocks), to read the seeded account's item and collection by
real (not guessed) id, favorite it, move it into its own collection, trash it, and attach its own
tag to it — all seven attempts denied (0 rows affected or an explicit RLS policy violation), and
the target item's favorite/collection/deleted_at state confirmed byte-for-byte unchanged
afterward. No app code changed — the stress test surfaced no responsiveness or RLS problems at
this scale, so nothing needed fixing. 438/438 unit/integration tests green (unchanged — no
production code touched), typecheck clean. Staging deploy (this Day's remaining item) is the
human's to run on the usual cadence, not this agent's.

Previously, 2026-08-03 — Shared item behavior — trash / restore / permanent delete shipped.

Previously, 2026-08-01 — **Day 2 QA gate passed**, both 🔴 blockers found and closed:
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

**Day 3 in progress (10/11)**: Notes — create/edit title+body, Notes — rich formatting, Notes —
Markdown source / WYSIWYG toggle, Notes — autosave, Notes — version history, Notes — checklist
toggle from rendered view, Shared item behavior — tag (create/rename/delete/merge), favorite,
archive, Shared item behavior — move between collections, Shared item behavior — trash /
restore / permanent delete, and the stress test all shipped — see below. Staging deploy is the
only Day 3 item left, and it's the human's to run. `develop` is ahead of `staging`/`main` again as
normal feature work resumes (Day 3 releases to staging only, not production, per `Roadmap.md`).

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

## Day 3 — Knowledge Management — release Wednesday (staging only) (10/11)

- [x] Notes — create, edit title/body — `app/api/items` (list/create) + `app/api/items/:id`
  (get/update) against the existing `knowledge_items` table (type='note'); no new migration, RLS
  already in place from Day 1. Scope deliberately narrow per user's choice: plain title + body
  in a textarea, explicit Save button — no WYSIWYG/rich formatting/checklists/autosave/version
  history yet (separate, later Day 3 lines below). Body lives in `knowledge_items.description`
  (the shared free-text field per `Database_Schema.md` — there's no dedicated note-body column).
  New `/collections/:id` detail view (with a "New Note" action) and `/items/:id` editor;
  `CollectionCard`'s name now links into the detail page (previously collections had no way to
  be opened at all). Self-review (code-reviewer subagent) caught a real cross-tenant gap, fixed:
  `POST /api/items` originally trusted any well-formed `collection_id` UUID without checking it
  belonged to the caller — RLS on `knowledge_items` only constrains the row being inserted, not
  the referenced `collection_id`, so a user could otherwise attach a note to another user's (or
  an already-trashed) collection just by guessing an id. Now verifies ownership first. 234/234
  unit/integration tests green (42 new), typecheck clean, all 6 Playwright `@smoke` tests green
  (new `e2e/notes.spec.ts`: create → edit title+body → Save → reload → confirms persistence).
  RLS cross-user isolation confirmed live against PostgREST with two real accounts (not just
  mocked): user B's token returns an empty result for user A's note id.
- [x] Notes — rich formatting (headings, bold/italic, lists, checklists, code blocks, tables,
  links, inline images) — `components/notes/note-body.tsx` renders the Markdown body via
  `react-markdown` + `remark-gfm` + `rehype-highlight` (first content-rendering library in the
  repo — safe by default: no `dangerouslySetInnerHTML`, raw HTML escaped not executed, dangerous
  URL schemes stripped, since note bodies are unsanitized user content). `NoteEditor` now opens
  in a read-only rendered view by default (Edit switches to the existing raw-textarea editor,
  Save returns to view); checklist checkboxes render disabled — toggling from the view and the
  WYSIWYG/raw-toggle surface are separate, later Day 3 lines below. Self-review (code-reviewer
  subagent) caught two real issues, both fixed: the mode-toggle refactor broke the existing
  `e2e/notes.spec.ts` smoke test without updating it (rewritten, now also asserts real rendered
  elements post-save/reload, not raw Markdown syntax); and always defaulting new notes to view
  mode forced an extra "Edit" click before a brand-new empty note could be typed into at all,
  against the "save in under 10s" promise — fixed to open freshly-created notes straight into
  edit mode. 248/248 unit/integration tests green (12 new), typecheck + lint clean, all 6
  Playwright `@smoke` tests green.
- [x] Notes — Markdown source / WYSIWYG toggle — `components/notes/note-rich-text-editor.tsx`
  (new, Tiptap 3 via `@tiptap/react` + `tiptap-markdown` for Markdown ⇄ ProseMirror
  serialization + `lowlight`/`@tiptap/extension-code-block-lowlight` for highlighted code
  blocks, reusing the same `highlight.js` grammar set `NoteBody`'s `rehype-highlight` already
  renders with). `NoteEditor` gained an explicit "Markdown" / "Rich text" toggle in edit mode —
  both surfaces read/write the same `body` string; switching surfaces works via React mount/
  unmount (the rich-text surface initializes fresh from the current Markdown each time it
  mounts, and continuously syncs back on every edit while mounted), not imperative
  `editor.commands.setContent` calls, which turned out to be simpler and avoids any cursor/
  feedback-loop risk. Toolbar covers every content type in `Notes.md`'s "Supported content"
  list: headings (H1–H3), bold/italic/strike, ordered/unordered/task lists, blockquote,
  horizontal rule, code blocks with a language select, tables (insert + add/remove row/column),
  and link/image — image is by-URL only (not upload-by-reference), same interim stand-in
  `NoteBody` already documents pending Day 5's Image uploads. **New dependencies** (flagging per
  CLAUDE.md): 12 `@tiptap/*` packages, `tiptap-markdown`, `lowlight` — no existing dependency
  does contenteditable rich-text editing; this is Tiptap's standard, actively-maintained
  extension set for exactly this MVP content list. Self-review (code-reviewer subagent) caught
  a real gap and fixed it: `Image`'s `setImage`, unlike `Link`'s `setLink`, has zero built-in URI
  validation, so a typed `javascript:` URL would have been stored verbatim in the note's
  Markdown relying entirely on the read-side renderer's sanitizer — now validated via the same
  `isAllowedUri` helper `@tiptap/extension-link` already uses internally. Also fixed an ARIA
  role/children mismatch (`role="radiogroup"` on a pair of `aria-pressed` toggle buttons, which
  aren't `role="radio"`) caught in the same pass. 280/280 unit/integration tests green (20 new:
  8 for the new `note-rich-text-editor.test.tsx` covering parse/serialize round-trip, toolbar
  commands, table/code-block/link/image behavior, and the `html:false` raw-HTML-safety
  regression case; 4 new in `note-editor.test.tsx` for the toggle itself), typecheck clean, all
  6 Playwright `@smoke` tests green (`e2e/notes.spec.ts` extended: authors a heading and bold
  text via the real WYSIWYG toolbar in a live Chromium browser, confirms the Markdown surface
  shows the equivalent raw syntax after switching back, Saves, and confirms the rendered view
  persists it through a reload). Also manually driven live in the browser (Claude-in-Chrome
  against the local Supabase stack): created a note, used the toolbar to build a heading, bold
  text, and a checklist, saved, and confirmed the rendered view matched.
- [x] Notes — autosave (debounced, save-status indicator, retry on failure) — replaces the
  manual Save/Cancel click-to-save model with continuous autosave, per `Notes.md`'s Autosave/
  Error States sections. New `components/notes/use-note-autosave.ts` hook: 1500ms debounce,
  automatic retry with backoff (2s/5s/10s) on failure, `"saved" | "saving" | "retrying" |
  "error"` status, a `resetBaseline` call (so loading a note doesn't itself look like an
  unsaved change) and a `retryNow` escape hatch. `NoteEditor`'s "Save"/"Cancel" buttons are
  replaced by a persistent status indicator (visible in both view and edit mode — shown once
  there's something to say) plus a "Retry now" action once retries are exhausted, and a single
  "Done" button (no discard concept anymore — everything autosaves). Conflict/version-mismatch
  detection from `Notes.md`'s Error States section is explicitly out of scope here — it depends
  on Version History, a separate not-yet-built line below; this is last-write-wins for now.
  Self-review (code-reviewer subagent) caught two real bugs, both fixed: (1) a lost-update race
  where `attemptSave`'s success handler stamped `lastSavedRef` from the live draft ref instead
  of the snapshot actually sent, so a newer edit arriving while an older save was still in
  flight could get silently marked already-saved and never autosave; (2) `NoteEditor` wasn't
  keyed by item id (`app/(app)/items/[id]/page.tsx`), so navigating between two notes without a
  remount could let a still-ticking autosave/retry timer for the previous note fire against —
  and overwrite — a different note once its own data loaded; fixed via `key={id}`. Also fixed,
  in the same pass: the status/retry indicator originally only rendered inside the edit-mode
  branch, so leaving edit mode while a save was still retrying/failed made it invisible,
  contradicting the spec's "persistent" indicator requirement — now shown in view mode too.
  Also fixes a latent discard bug the autosave model surfaces: `startEditing()` used to reset
  `title`/`body` from the last-fetched item every time Edit reopened, which would have silently
  thrown away an unsaved edit stuck retrying — it no longer resets them. 288/288 unit/
  integration tests green (19 new: 11 for `use-note-autosave.test.ts`, covering the debounce/
  retry/backoff state machine with fake timers including a regression test for the lost-update
  race above; 8 replacing the old Save/Cancel-based `note-editor.test.tsx` cases), typecheck
  clean, all 6 Playwright `@smoke` tests green (`e2e/notes.spec.ts` updated to wait for the
  debounced-autosave PATCH via `page.waitForResponse` instead of clicking a Save button that no
  longer exists). Verified live in the browser (Claude-in-Chrome against the local Supabase
  stack): typed into a note, watched the PATCH fire ~1.5s later with no Save click, reloaded to
  confirm persistence. Also re-hit and confirmed (not newly introduced by this feature) the
  known local Turbopack dev-server staleness issue from Day 1/2 — the running dev server kept
  serving pre-change compiled output until `docker compose restart app` after a `.next` cache
  clear; noted again here since it cost real debugging time before being recognized as the
  same pre-existing environment quirk.
- [x] Notes — version history (view list, view a version, restore) — no new migration needed:
  `note_versions`, its RLS policy, and its index already existed from Day 1's schema. New routes
  `GET /api/items/:id/versions` (list, `{id, created_at}` only), `GET .../versions/:versionId`
  (full content, for preview), `POST .../versions/:versionId/restore` (restores the item's
  `description` and inserts a **new** version entry — restoring never deletes/overwrites
  history, per `Notes.md`). New `components/notes/note-version-history.tsx` panel (list +
  preview via the existing `NoteBody` + restore), toggled by a new "History" button in
  `NoteEditor`, visible in both view and edit mode. **Scope decision**: version boundaries are
  per edit-session (Edit → ... → Done) rather than a rolling idle timer — the first autosave of
  a session opens a new version, later autosaves in the same session coalesce into it; a user
  who pauses for minutes without ever leaving Edit mode still coalesces into one version. This
  was a deliberate simplification flagged in the plan (a true idle-timer would need a server-side
  `updated_at` column and a tuned threshold, and is much harder to test deterministically).
  Self-review (code-reviewer subagent) caught two real data-integrity bugs in the original
  design (a client-supplied boolean `newVersionBoundary` flag, with the server inferring "the
  open version" as "whichever `note_versions` row has the newest `created_at`") and both were
  redesigned, not just patched: (1) that "latest" inference could silently coalesce into, and
  corrupt, an unrelated genuinely-historical row whenever an earlier boundary-opening insert had
  failed — fixed by tracking the open version's actual id explicitly, round-tripped between
  client and server (`openVersionId` in the request, `versionId` echoed back in the response),
  falling back to a fresh insert whenever the id doesn't resolve rather than guessing; (2) a
  slow autosave started before a restore could resolve after it and silently revert the restore
  (both the visible content and which version the next edit would coalesce into) — fixed with a
  `saveGenerationRef` guard in `NoteEditor` that ignores a stale response's effect on local state
  once a restore has happened, with a dedicated regression test proving it. Self-review also
  caught and fixed: the single-version GET route didn't check `deleted_at` on the parent item
  (a trashed note's old content should not stay readable via a previously-fetched version id);
  the `updateItemSchema` "at least one field" refine didn't exclude the new bookkeeping field, so
  a body containing only it would pass validation and reach a meaningless empty update; and a
  version-write failure was originally logged with the same generic message regardless of which
  step failed. 303/303 unit/integration tests green (34 new: PATCH's version-boundary logic,
  the three new route files' ownership/scoping and success/failure paths, the new
  `NoteVersionHistory` component, and `NoteEditor`'s wiring including the race-condition
  regression test), typecheck clean, all 6 Playwright `@smoke` tests green (`e2e/notes.spec.ts`
  extended: three separate edit sessions each open their own version, History lists all three,
  restoring the oldest updates the rendered view immediately and persists through a reload).
  Verified live in the browser (Claude-in-Chrome against the local Supabase stack): two edit
  sessions, opened History, previewed and restored the older version, confirmed the content
  updated immediately and persisted after a reload.
- [x] Notes — checklist items toggleable from rendered view: clicking a checkbox in `NoteBody`'s
  rendered (non-edit) view flips it and autosaves immediately (no Edit click needed), reusing the
  same `openVersionId` coalescing mechanism autosave and restore already use. `toggleTaskAtIndex`
  (`lib/notes/toggle-task.ts`) parses/re-serializes via the real `remark-parse`+`remark-gfm`
  pipeline (same libraries `react-markdown` itself uses) rather than a hand-rolled regex — self-
  review proved a first-draft regex miscounted ordered-list, blockquote-nested, and fenced-code-
  block content; the AST-based rewrite guarantees "the Nth checkbox this function finds" and "the
  Nth checkbox react-markdown renders" always agree. Self-review also caught the toggle handler
  reading stale `item.description` instead of live `body` (could silently drop an unsaved edit),
  and a missing `resetBaseline` call that could let the autosave hook's own debounce fire a
  redundant, racing PATCH for the same change — both fixed. 322/322 unit/integration tests green
  (7 new for `toggleTaskAtIndex`, extended `NoteBody`/`NoteEditor` coverage), typecheck clean, all
  6 Playwright `@smoke` tests green (`e2e/notes.spec.ts` extended: click a checkbox directly from
  the rendered view, confirm it checks immediately with no Edit click, and persists after reload).
  Verified live in the browser (Claude-in-Chrome): found and fixed a real bug in this step — the
  checkbox-index counter was a plain incrementing variable read during render, which React Strict
  Mode (on by default in Next.js dev) double-invokes, silently double-counting and handing out the
  wrong index; invisible in jsdom-based unit tests (no Strict Mode there). Fixed by memoizing the
  index per hast node (`WeakMap`) instead of an incrementing counter, then reconfirmed live:
  clicking either checkbox toggles only that one and persists through a reload.
- [x] Shared item behavior — tag (create/rename/delete/merge), favorite, archive — no new
  migration (`tags`, `knowledge_item_tags`, `is_favorite`/`is_archived` already existed with RLS
  from Day 1). `PATCH /api/items/:id` gained `is_favorite`/`is_archived`; `GET`/`PATCH` now embed
  the item's current tags. New `app/api/tags/*` routes (list, rename, delete, merge — merge
  reassigns every item from source to target via an `ignoreDuplicates` upsert, handling an item
  that already carries both tags before the merge, then deletes the source tag) and
  `app/api/items/:id/tags[/:tagId]` (attach with implicit get-or-create by case-insensitive name,
  detach). New `TagInput` (chip add/remove) wired into `NoteEditor` alongside new Favorite/Archive
  toggle buttons; new `/tags` management page (rename/delete/merge) plus a nav link. **Scope
  decision**: archived items are hidden from `CollectionDetailView`'s default list per
  `Knowledge_Items.md`, but a "Show archived" toggle reveals them — Day 4's global archived filter
  doesn't exist yet, and hiding with no way back would strand an archived item with no path to
  unarchive it; mirrors the existing Trash-view discoverability pattern. Self-review (code-reviewer
  subagent) caught a real gap, fixed: a transient tags-read failure right after a successful
  mutation was originally coalesced to `tags: []`, which would have silently wiped a note's visible
  tags on any autosave/toggle — routes now pass the failure through as `tags: null` (distinct from
  a genuinely empty list) and the client treats `null` as "unconfirmed, keep current state" rather
  than overwriting it; also added `lib/items/tags.test.ts` covering `getOrCreateTag`'s
  concurrent-insert race-retry path, which self-review flagged as the riskiest untested logic in
  the diff. 391/391 unit/integration tests green, typecheck clean. Verified live against the real
  local Supabase stack (favorite, archive, tag attach/detach/rename, and a merge where the item
  already carried both tags before merging — the dedupe case self-review flagged) and RLS
  cross-user isolation with a second real account via direct PostgREST calls (reads return `[]`,
  writes are silent no-ops, cross-tag-attach gets an explicit `42501`/403). `e2e/notes.spec.ts` was
  extended with matching `@smoke` assertions but **not confirmed green by an actual Playwright
  run** — this repo's shared spec's pre-existing version-history section fails in this local Docker
  environment independent of this change (reproduced on a clean `develop` checkout via
  `git stash -u`), the same kind of known local-only environment quirk as the Turbopack
  dev-server-staleness notes above; not re-diagnosed here, live API + RLS verification substituted.
- [x] Shared item behavior — move between collections — `PATCH /api/items/:id` gained
  `collection_id`, per `docs/03_Architecture/API_Design.md`; no new migration. Extracted the
  cross-user/trashed-collection ownership check `POST /api/items` already had (RLS on
  `knowledge_items` only validates the row's own `owner_id`, not that a client-supplied
  `collection_id` belongs to the same owner) into a shared `lib/items/verify-collection-ownership.ts`,
  now called by both create and move; a failed check returns a distinct `collection_not_found`
  (vs. the endpoint's existing item-level `not_found`). New `components/notes/move-item-control.tsx`
  — a `<select>` merging `GET /api/collections?view=active` + `?view=archived` (a note can already
  live inside a since-archived collection, so the current one must always be selectable even when
  not "active"), immediate-PATCH-on-change like the existing Favorite/Archive buttons, with a
  404 (`collection_not_found`) reverting the selection (it's a controlled component bound to the
  item's real `collection_id`) and re-fetching the list per `Knowledge_Items.md`'s Error States
  section. Wired into `NoteEditor` in both view and edit mode. Self-review (code-reviewer subagent)
  caught two real issues, both fixed: the move PATCH wasn't wrapped in try/catch, so a thrown
  fetch (not just a non-2xx response) would leave the control permanently stuck disabled; and the
  new e2e assertion referenced "New collection" (a control that only exists on the top-level
  `/collections` page) while the flow was still on a collection-detail page — re-sequenced. Also
  added logging to the shared ownership helper for genuine DB errors, distinct from the expected
  "no rows" case. 398/398 unit/integration tests green (7 new), typecheck clean. **Verified live
  against the real local Supabase stack via direct API calls with two real confirmed accounts**
  (real signup → Mailpit → confirm-link → verifyOtp, no mocks): as user A, moved a note (carrying
  a tag and `is_favorite: true`) between two of their own collections — `collection_id` updated
  correctly, tag and favorite state both confirmed unchanged afterward; as user B, reading user A's
  new collection directly returned `[]` (confirms `verifyCollectionOwnership`'s result is backed by
  `collections`' own RLS policy, not merely an app-level filter) and attempting to move user A's
  item into user A's own Inbox affected 0 rows (existing `knowledge_items` RLS, unchanged here,
  already blocks it). The actual browser-driven walkthrough was blocked this session by a
  local-environment issue unrelated to this change: the Chrome instance Claude-in-Chrome drives
  couldn't resolve `host.docker.internal` (this shell could, and `127.0.0.1` worked in both) —
  apparently a different network namespace for that one hostname — so registering an account
  through the real UI wasn't possible; direct-API verification substituted. `e2e/notes.spec.ts` was
  extended with a matching `@smoke` move assertion but **not confirmed green by an actual
  Playwright run** — the run hit the same pre-existing version-history-section failure the previous
  feature's entry above already documents (reproduced independent of this change, and it occurs
  earlier in the spec than the new assertion, so the new code was never reached).
- [x] Shared item behavior — trash / restore / permanent delete (cascades to collection delete) —
  `DELETE /api/items/:id` soft-deletes (sets `deleted_at`); `POST /api/items/:id/restore` restores
  in place if the item's original collection is still live, otherwise re-homes into the caller's
  "Inbox" collection, falling back further to the oldest surviving collection if "Inbox" itself
  was renamed (Collections are renamable since Day 2 — a real, reachable dead end otherwise);
  `DELETE /api/items/:id/permanent` hard-deletes, only from Trash. New unified `GET /api/trash`
  (items + collections together, per `API_Design.md`) backs a new `/trash` page — collection rows
  restore via the existing `POST /api/collections/:id/restore`; only items get a permanent-delete
  route, per `Knowledge_Items.md`. `NoteEditor` gained an inline-confirm "Move to Trash" action
  that DELETEs and navigates back to the item's collection. **Scope deviation from the original
  plan**: Trash listing became a unified `GET /api/trash` instead of `GET /api/items?view=trashed`
  (the `view` param was removed from `/api/items` entirely) — matches `API_Design.md`'s actual
  Trash section, which the original per-feature plan had missed.
  Self-review (code-reviewer subagent) caught one real gap, fixed: `POST
  /api/collections/:id/restore` only cleared the collection's own `deleted_at` — it never restored
  the items `DELETE /api/collections/:id`'s cascade had trashed along with it, silently stranding
  every item of a deleted-then-restored collection in Trash under a now-live parent. This is a
  named acceptance criterion for this exact feature ("cascades to collection delete"). Fixed by
  capturing the collection's `deleted_at` before clearing it, then restoring only the
  `knowledge_items` rows sharing that exact timestamp (not ones trashed individually before or
  after), mirroring `DELETE`'s own `itemCascadeIncomplete` partial-failure pattern rather than a
  silent no-op. Self-review also caught the item-restore success message hardcoding "restored to
  Inbox" even on the oldest-surviving-collection fallback path — fixed by having the restore route
  return the real target collection's name (`rehomedToCollectionName`) instead of assuming Inbox.
  438/438 unit/integration tests green (47 new/changed), typecheck clean. All `e2e/trash.spec.ts`
  `@smoke` tests green against the real local Supabase/Mailpit stack via a real Chromium browser
  (Playwright, not mocked): the original create→trash→restore→trash→permanent-delete loop, plus a
  new case added after the self-review finding (delete a collection with one note in it, confirm
  both show up in Trash, restore the collection, confirm the note is back inside it). Confirmed
  `npm run build`'s pre-existing `/_not-found`/`/_global-error` Turbopack prerender failure (noted
  above, 2026-08-01) still reproduces on a clean `develop` checkout with a fully fresh
  `node_modules`/`.next` volume — unrelated to this feature, not re-diagnosed here.
- [x] Stress test: agent creates hundreds of notes, confirm UI stays responsive — scaled to 15
  notes per explicit user instruction (local hardware); see the 2026-08-04 entry above for full
  detail on what was seeded and verified (responsiveness + a fresh RLS cross-user re-check).
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
