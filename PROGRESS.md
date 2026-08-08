# Nexus — Build Progress

> Single source of truth for **what's actually built**, updated after every feature ships.
> Feature list and build order live in `CLAUDE.md` and `build-order-complete.md`. Day themes
> and release cadence are `docs/00_Project/Roadmap.md`.
> `[ ]` = not started · `[~]` = in progress · `[x]` = done & committed.

**2026-08-08 — Post-MVP: Rich Link Embeds shipped** (`feature/rich-link-embeds`), squash-merged
into `develop`. First Post-MVP feature, per explicit user confirmation (AskUserQuestion) after
Day 6 finished and Day 7's remaining items all turned out to be blocked on either a deferred
live-testing pass or human-only release actions — nothing left to build there without one of
those unblocking first. `docs/01_MVP/Website_Bookmarks.md` explicitly excluded "rich embeds for
specific platforms" from MVP and pointed at `docs/02_Development/` for future direction, but no
spec existed yet — new `docs/02_Development/Rich_Embeds.md` is that spec, written alongside the
implementation.

**Scope note, flagged to the user during planning and approved:** the original AskUserQuestion
preview mentioned "YouTube/Vimeo player embeds + tweet/X post embeds." Tweet/X embeds were
deliberately **not** built this round — a real tweet embed needs either trusting/rendering a
provider's oEmbed HTML via `dangerouslySetInnerHTML` plus loading their `widgets.js` third-party
script, or a from-scratch renderer; neither is a small, safe addition alongside YouTube/Vimeo.
Documented as an explicit non-goal in the new spec doc, not silently dropped.

New `lib/bookmarks/detect-embed.ts`: a pure function, no network call, no oEmbed dependency —
regex-matches known YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`) and Vimeo
(`vimeo.com/{id}`, `player.vimeo.com/video/{id}`) URL shapes and returns a hardcoded embed URL
(`youtube-nocookie.com`/`player.vimeo.com`) built only from a regex-captured id — the `<iframe
src>` is always one of exactly two fixed origins, never a URL or HTML fetched from a third party
at render time. New `components/bookmarks/link-embed.tsx` (shared by `BookmarkView` and the
public `SharedItemView`) renders that as a plain, unsandboxed 16:9 iframe — same pattern
`FileItemView` already uses for PDF preview — falling back to the existing OG-image card when no
provider matches. No schema change, no migration, no new dependency.

Self-review (`code-reviewer` subagent) caught one real, **content-spoofing** bug, fixed: detection
originally preferred `website_metadata.canonical_url` over the user-saved `url`. `canonical_url`
is scraped from the bookmarked page's own `<link rel="canonical">` — content the *page owner*
controls, not the user — so any bookmarked site could silently pick what video got embedded
instead of what the user actually saved, on both the owner's private view and the public,
unauthenticated share page representing that bookmark to anyone holding the link. Fixed to detect
off `url` only (this also let `app/api/share/[token]/route.ts`'s `canonical_url` select addition
be reverted — no longer needed). Self-review also caught a real, lower-severity correctness bug:
the Vimeo id regexes weren't anchored to a path-segment boundary, so a garbage-suffixed numeric
path (e.g. `vimeo.com/123abc`) silently "succeeded" with a partial-match id instead of falling
back like every other unrecognized URL — fixed with a lookahead anchor. Both fixed with regression
tests.

851/851 unit/integration/component tests green (23 new: 14 in `detect-embed.test.ts` — including
the two self-review regression cases plus an explicit host-spoofing negative test
(`youtube.com.evil.example`) — 3 in `link-embed.test.tsx`, 3 extending `bookmark-view.test.tsx`
including its own canonical_url-spoofing regression case, and a new `shared-item-view.test.tsx`
(2 cases) — this component had no prior unit coverage of its own, scoped here to just the embed
behavior being added, not full retroactive coverage), typecheck clean, lint clean (no new
violations).

**Not verified this session:** local Supabase failed to start again this session (same Windows
port-permission error as earlier — `ports are not available ... 54322`, retried once, unresolved),
so no live-browser pass was possible (creating/viewing a real bookmark requires login). Covered by
unit tests exercising the real detection/rendering logic (including the spoofing-fix regression
tests, which would fail against the pre-fix code) but not a substitute for seeing an actual
YouTube/Vimeo iframe render and play in a real browser. Before relying on this further: fix the
local Supabase port issue, then manually save a YouTube and a Vimeo bookmark, confirm both embeds
render and play, confirm a shared link to each also renders the embed publicly, and confirm a
bookmark with a spoofed `<link rel="canonical">` pointing at a video does *not* embed it.

**2026-08-08 — 🐛 Critical bug fixed: data export/import silently dropped every item in a
colliding collection** (`fix/import-collection-name-collision`), squash-merged into `develop`.
Found by a targeted cross-feature-integration review (a `code-reviewer` subagent pass specifically
looking for interactions between features that each individually shipped correctly — Trash ×
Reminders, Trash × Sharing, Trash × Search, Collections × Items cascade, Tags × Merge × Search,
Export/Import, Activity Log × permanent delete — 6 of 7 checked out correct; this was the one
real finding), not from a user report.

**The bug:** every account gets an "Inbox" collection from signup (`handle_new_user`,
`001_initial_schema.sql`); every export includes it (`buildJsonExport` doesn't exclude default
collections); import always creates *new* collections, never merging into existing ones
(`Settings.md`'s explicit design). So re-importing an account's own export — the single most
common real use of "export as backup" — hit `collections`' `(owner_id, lower(name)) where
deleted_at is null` unique index on the very first collection almost every time.
`lib/settings/jobs/run-import-job.ts`'s collection-insert error handling treated *any* insert
failure as "skip this whole collection's items" (`skippedCount += collection.items.length`), so
the unique-constraint violation silently dropped every item that had lived in Inbox, surfaced
only as an opaque raw Postgres error string in the job's skip reasons. This directly contradicted
both `Settings.md`'s own acceptance criteria (export→import should "reproduce equivalent" data)
and its explicit design note that a second import should create a *duplicate*-named collection,
not silently fail. No existing test caught it — the test suite's own `VALID_BUNDLE` fixture is
literally named "Inbox," but the fake Supabase client's mocked collection insert always
succeeded unconditionally, never modeling the real unique-constraint collision.

**The fix:** `fetchExistingCollectionNames()` reads the importing account's current collection
names once per job; `uniqueCollectionName()` disambiguates a colliding name (`"Inbox" →
"Inbox (2)"`) before the insert, mirroring `build-markdown-export.ts`'s existing `uniqueName()`
collision-avoidance shape for ZIP entry names, applied to both the JSON and Markdown-ZIP import
paths. Two regression tests added (`run-import-job.test.ts`) seeding a pre-existing "Inbox" and
confirming the import still succeeds with 0 skipped and a disambiguated collection name. 829/829
tests green (2 new), typecheck clean.

**2026-08-08 — Day 7 #29/#31 static bug-fixing/refactor + security review pass**
(`chore/d7-requireUser-consistency`), squash-merged into `develop`. Given no real RC feedback
exists yet (nothing has been promoted to `staging`/`main`), #29's "bug fixing from RC feedback"
was interpreted as a self-directed static audit rather than fixing reported issues that don't
exist; folded together with #31's non-browser-checkable `qa-checklist.md` items, since a security
audit and a bug pass cover overlapping ground. Findings:

- **Fixed**: `app/api/settings/route.ts` (`GET`/`PATCH`) and `app/api/auth/account/route.ts`
  (`POST`) both duplicated the auth-check logic `lib/supabase/require-user.ts`'s `requireUser()`
  already centralizes for every other route handler — its own comment says "shared by every
  route handler," but these two didn't use it. No behavior change, same checks/response shapes;
  827/827 tests still green, typecheck clean.
- **Confirmed clean, no fix needed**: `SUPABASE_SERVICE_ROLE_KEY` doesn't reach the client bundle
  (grepped `.next/static` after a production build); no route trusts a client-supplied
  `owner_id`/`user_id` (grepped every route handler); no raw `error.message`/`.stack` returned in
  any API response; the sole `dangerouslySetInnerHTML` usage (`components/theme/theme-script.tsx`)
  is a static string, not user input; `supabase/config.toml`'s auth rate limits (60s resend
  cooldown, 2 emails/hour) match what's already documented from the earlier auth bug-fix session;
  the one empty `catch` block (`theme-script.tsx`'s pre-hydration theme-flash-prevention script)
  is a deliberate, standard pattern for that exact use case, not a swallowed real error.
- Every route handler (except the two documented public ones, `GET /api/share/:token` and
  `GET /api/cron/reminders`) calls `requireUser` or the admin client — confirmed via
  `docs/03_Architecture/API_Design.md`'s reconciliation earlier this session plus a direct grep
  sweep.

**Not verified this session (deferred per the user's explicit 2026-08-08 prioritization call):**
everything in `.claude/docs/qa-checklist.md` that genuinely requires a live browser or a second
real account — RLS bypass attempts against a running API, an actual oversized/wrong-type upload,
a forced server error checked in the Network tab, the account-enumeration / full register→
verify→login→save→search journey, and the 🔴 "verify in the Supabase dashboard, not just by
reading migration files" RLS check. These need the consolidated bulk-testing pass, not a fix
here — static code reading is real signal but isn't a substitute for exercising the live system.

**2026-08-08 — Day 7 #30 Full documentation pass shipped** (`chore/d7-documentation`), squash-
merged into `develop`. Per explicit user instruction this round, Day 7 is being tackled ahead of
a full live-browser/stress-testing QA gate on Day 6 — that testing is deliberately deferred to a
later consolidated pass (see this session's own instruction, not repeated per-entry below).

New/rewritten docs: `README.md` (was entirely about the *meta-workflow package* — "no scaffolded
Next.js app" — stale since Day 1; rewritten to describe the actual Nexus app, quick start, and a
real doc map), `docs/03_Architecture/Architecture_Overview.md` (new — system design at a glance:
request lifecycle, RLS shape, background-work mechanism, search, storage), `docs/TESTING.md`
(new — practical "how to run the suite locally and in CI" reference, distinct from
`.claude/docs/testing.md`'s authoring-discipline doc), `docs/DEPLOYMENT.md` (new — environments,
migrations, the actual promotion command sequence, first-deploy checklist, rollback), and a new
`.env.example` with explanatory comments (the file itself already existed with the right keys,
just undocumented). `docs/03_Architecture/API_Design.md` and `Database_Schema.md` were fully
reconciled against the actual implementation (every real route handler / every migration through
`010`, not the original Day-1 sketch) — real drift found and now documented: Search
(`recent-searches`) and Activity Log resource groups, item-level tag routes, and three tables
(`item_views`, `export_jobs`, `import_jobs`) all existed in code but were never in the original
docs; the reminder cron turned out to be a real public HTTP route (not a headless scheduled
function as originally sketched); background jobs run inline via `after()` rather than as
separate webhooks; and `003_grant_table_privileges.sql`'s retroactive-grants fix (RLS policies
existed from Day 1 but were inert without the underlying `GRANT`s) is now documented as its own
subsection, a genuinely non-obvious authorization detail worth surfacing. `CLAUDE.md`'s doc index
updated to point at the three new docs.

No code changes, no tests (documentation-only). Reviewed for accuracy against this session's own
first-hand knowledge of the features described (Reminders, Sharing, Activity Log, Settings
export/import all shipped earlier this same session).

**2026-08-05 — session-wide testing scope note.** For the remainder of Day 5 (this session),
load/stress testing and live-browser (Playwright/`claude-in-chrome`) verification are being
**deliberately skipped per explicit user instruction**, to keep shipping velocity up — the user
will test those manually, retroactively. Every feature below that skips them says so explicitly
in its own entry, under a **"Not verified this session (manual retest needed):"** line. Unit/
integration/component tests, typecheck, and lint are still run and green for every feature —
only the browser-driven and at-scale checks are deferred.

**2026-08-06 — session testing-scope update.** New session, same spirit as above with one
refinement: live-browser/e2e specs are still **written** per feature (with concrete, feature-
specific test cases), but their actual run is deferred to a consolidated pass rather than
per-feature — except where self-review surfaces a real bug whose fix specifically needs live
proof (see Code Snippets below), in which case that one spec is run immediately rather than
deferred. Unit/integration/component tests, typecheck, and lint remain per-feature, unchanged.

**2026-08-08 — Day 6 Accessibility pass + error/empty-state sweep shipped**
(build-order-complete.md #27's remainder — Activity Log itself shipped 2026-08-07), squash-merged
into `develop`. Day 6 is now 13/14 — only #28 (full regression + Lighthouse + the
`.claude/docs/qa-checklist.md` gate) remains before the v1.0 Release Candidate.

An Explore audit against `docs/03_Architecture/Non_Functional_Requirements.md`'s Accessibility/
Reliability sections found the codebase already in good shape — no unlabeled icon buttons (every
button renders visible text or an explicit `aria-label`), no modals to audit (none exist, every
confirm flow is inline), and every list/form already has a real empty state. Five concrete,
verified gaps were fixed rather than a generic checklist re-derivation:

1. **Two color-token pairs failed WCAG AA in light mode** — verified by computed sRGB contrast
   ratio (new `lib/theme/contrast.ts`, a hand-rolled OKLCH→sRGB→WCAG-contrast helper, same
   "hand-roll it, unit-test it" precedent as `lib/files/sniff-content.ts`), not by eyeballing
   OKLCH lightness: `--muted-foreground` on `--muted` (badges, tag-remove glyph, code-block
   syntax highlighting — 4.34:1) and `text-destructive` on the destructive `Button` variant's
   `bg-destructive/10` background (3.99:1). Both darkened slightly in `app/globals.css` (light
   mode only; dark mode already passed both) until `lib/theme/contrast.test.ts` — which also
   pins the two already-passing pairs as a regression guard — goes green.
2. **Auth form field errors weren't announced to screen readers.** All 6 forms under
   `components/auth/` rendered field-level validation errors visibly but without `role="alert"`,
   unlike each form's own top-level submit error. Added `id` + `role="alert"` on the error, and
   `aria-describedby` on the paired input.
3. **Rich-text editor's link/image inline forms had no keyboard dismiss.** Added `Escape`
   handling in `note-rich-text-editor.tsx` alongside the existing `Enter`-to-submit.
4. **Four background-polling surfaces silently and permanently stalled on a single failed
   request** — `bookmark-view.tsx`'s metadata poll, `file-item-view.tsx`'s extraction-status
   poll, and `data-export-form.tsx`/`data-import-form.tsx`'s job-status polls all had the same
   bug shape (a bare `return;` on a failed poll fetch, with nothing left to reschedule it — a
   stale comment on the export form even claimed "next scheduled poll will retry," which it
   never did). Worse, the bookmark/file views' poll failure handling was routed through the same
   `loadError` state as the *initial* load failure, so a transient blip after a successful load
   replaced the whole already-rendered item with a full-page error, discarding real content.
   Fixed with a bounded-retry pattern (`MAX_POLL_FAILURES = 5`) in all four: a background poll
   failure now retries silently up to the cap rather than either dying instantly or nuking the
   page; the export/import forms surface an inline `role="alert"` + manual Retry action once the
   cap is hit.
5. **`FileItemView`'s text-preview fetch failed silently** (`console.error` only, blank preview
   area). Added a `textPreviewFailed` state rendering "Preview unavailable" (`role="status"`,
   matching the sibling "not searchable" indicator's convention), distinct from the correct
   silent `null` for genuinely non-previewable file types.

Two lower-severity gaps the audit surfaced were deliberately left as documented scope cuts, not
omissions: the rich-text toolbar's lack of roving-tabindex (WCAG doesn't require it — every
button stays independently Tab+Enter/Space operable) and the Global Search recent-searches list's
non-strict combobox ARIA semantics (it already handles Escape and click-away correctly; full
`role="listbox"`/`aria-activedescendant` wiring is a nice-to-have, not a fix for something
broken).

Self-review (`code-reviewer` subagent) caught two real issues, both fixed: (1) `bookmark-view.tsx`'s
`handleRetry()` (the manual metadata-retry button) resumed polling via a bare `setTimeout(load, ...)`
that bypassed the new bounded-retry mechanism entirely — a failure on that one resumed tick would
silently dead-end with no further retry and no surfaced error, worse than the pre-fix behavior it
was replacing. Fixed by restructuring `loadAndSchedule` to component scope (was effect-local) so
`handleRetry` routes through the same bounded-retry path as every other poll tick; regression test
added. (2) `FileItemView`'s new "Preview unavailable" message used `role="alert"` while its sibling
degraded-state indicator ("not searchable") used `role="status"` for the same category of
non-actionable, non-urgent notice — fixed for consistency.

827/827 unit/integration/component tests green (17 new, up from 810: 5 in `lib/theme/contrast.test.ts`,
2 in `login-form.test.tsx`/`register-form.test.tsx` each, 2 in `note-rich-text-editor.test.tsx`, 3 in
`bookmark-view.test.tsx` — including the self-review regression test — 2 in `file-item-view.test.tsx`,
2 each in `data-export-form.test.tsx`/`data-import-form.test.tsx`), typecheck clean, lint clean (no
new violations — the pre-existing, already-documented `react-hooks/set-state-in-effect` pattern is
unchanged in count on every file this feature touched). No new dependency, no schema/migration
change.

Live-verified in a real browser (not just the mocked unit tests): the login form's field-level
validation error, confirmed via the accessibility tree and `aria-describedby`/`role="alert"`
DOM inspection — `email`'s `aria-describedby="email-error"` correctly resolves to a `role="alert"`
element containing the message — and the darkened destructive-red text read clearly, not washed
out, against the white login card.

**Not verified this session (manual retest needed):** local Supabase failed to start this
session (`ports are not available: exposing port TCP 0.0.0.0:54322` — a Windows port-permission
error, not a code issue; retried once, same result) — this blocked driving any *login-gated* flow
through a real browser: the rich-text editor's Escape-to-dismiss fix (needs an authenticated note
page) and the bookmark/file poll-failure-doesn't-blank-the-page fix in their real rendered
context. Both are directly exercised by their own new unit tests (each confirmed to fail against
the pre-fix code during self-review's trace), which is real coverage but not a substitute for a
live pass. Before this is relied on further: `npx supabase start` (may need a Windows networking
fix first — check `netsh int ipv4 show excludedportrange protocol=tcp` or restart Docker Desktop
if the port conflict recurs), then drive both flows through the dockerized `playwright` service
per this repo's established pattern for login-gated verification.

**2026-08-07 — Day 6 Activity Log shipped** (build-order-complete.md #27, Activity Log portion
only), squash-merged into `develop`. Day 6 is now 11/14. **Scope note, per explicit user
instruction this round:** #27's original prompt bundles three things — Activity Log, a full
accessibility pass, and an error/empty-state sweep. Only Activity Log shipped this round; the
other two are deliberately deferred to #28's QA gate rather than done piecemeal now (see #28's
own checklist entries below, still unchecked). Same reduced-testing-scope instruction as Sharing:
unit coverage only, no e2e/live-browser pass.

No new migration — `activity_log` (+ RLS, owner-scoped) already existed from
`001_initial_schema.sql`. New `lib/activity/log-activity.ts` — a best-effort insert (never
throws, CLAUDE.md rule 7) — wired into the success path of every existing item/collection
create/edit/trash/restore/share mutation (`POST /api/items` ×4 create branches, `PATCH`/`DELETE
/api/items/:id`, `POST /api/items/:id/restore`, the new-link branch of `POST
/api/items/:id/share`, and the collections equivalents). New `GET /api/activity` (paginated,
most-recent-first, embeds each row's current item/collection title/name — a target since
permanently deleted just shows the action with no link, since `activity_log`'s FKs are `on delete
set null`) + `components/activity/activity-view.tsx` + `app/(app)/activity/page.tsx` + an
"Activity" link in `components/layout/app-nav.tsx`.

**Known, documented simplification, not a bug:** `PATCH /api/items/:id` logs `"edited"` on every
successful PATCH, including each autosave debounce tick — a single note-editing session can log
several "edited" rows rather than one per meaningful edit. Matches this round's "move fast" scope;
worth revisiting (e.g. debounce the log write itself, or only log on `Done`/session-end) before
this is relied on as a genuinely readable timeline rather than a raw event log.

Wiring `logActivity` into 7 existing mutation routes broke 4 of those routes' own existing tests
— not self-review, just the mechanical consequence of adding a real DB call their mocked query
builders didn't model (`app/api/collections/[id]/route.test.ts`,
`app/api/collections/[id]/restore/route.test.ts`, `app/api/items/[id]/restore/route.test.ts`,
`app/api/items/[id]/share/route.test.ts`) — fixed by mocking `logActivity` out in each (or adding
a generic `insert` stub where the route under test never asserts on it), isolating it the same
way `RemindersPanel`/`ShareControl` were mocked out of the item-view component tests in the
previous two features. 810/810 unit/integration/component tests green (5 new, up from 805: 2 for
`logActivity` itself, 3 for the new `GET /api/activity` route — `app-nav.test.tsx`'s existing
test was extended in place, not a new case), typecheck clean, lint clean (one new
`react-hooks/set-state-in-effect` instance on `ActivityView`'s mount-fetch effect, the same
accepted pattern now in 8 files).

**Not verified this session:** no live-browser pass — the actual `/activity` page render, and
whether the timeline reads sensibly at real usage volume (given the autosave-spam caveat above),
were not driven through a real browser.

**2026-08-07 — Day 6 Sharing — public view-only links shipped**
(build-order-complete.md #26), squash-merged into `develop`. Day 6 is now 10/14. **Per explicit
user instruction this round, testing scope was deliberately reduced** — unit coverage only (the
token generator plus both route handlers, including the two actually security-relevant cases: a
revoked/nonexistent token and a trashed item behind an otherwise-valid link), no e2e spec, no
live-browser verification. Flagged here as a real gap, not silently skipped.

No new migration — `share_links` (+ RLS, owner-scoped transitively through `knowledge_item_id`)
already existed from `001_initial_schema.sql`. New `lib/sharing/generate-token.ts`
(`crypto.randomBytes(24).toString("base64url")`, 192 bits of entropy). `POST`/`DELETE
/api/items/:id/share` (idempotent create — an already-shared item returns its existing active
link rather than creating a duplicate; revoke is a **soft** `is_active=false`, matching Reminders'
cancel-not-delete precedent, so "a new link (different token) can be generated afterward" per
`Knowledge_Items.md` always means a fresh row, never reactivating an old one). `GET
/api/share/:token` (new `app/api/share/[token]/route.ts`) is genuinely public — no
`requireUser`, using `lib/supabase/admin.ts`'s service-role client since there's no session at
all here (the same legitimate RLS-bypass case the Reminders scheduler already established, not a
new pattern). A trashed item behind a still-active link returns "this item is no longer
available" (`Knowledge_Items.md`'s Error States section calls for exactly this, not a raw 404);
an invalid/revoked token 404s with a distinct message. The response body is deliberately narrow —
title/description/type + type-specific content only, never tags, collection, or owner info.
New public page `app/share/[token]/page.tsx` (outside the `(app)` route group, same as
`login`/`register` — no nav chrome, no auth) + `components/sharing/shared-item-view.tsx`, a
read-only per-type renderer reusing `NoteBody` (notes) and `CodeEditor readOnly` (snippets)
rather than duplicating their rendering logic. `GET /api/items/:id` now embeds `share_link`
(new `lib/items/share-link.ts`, mirrors `fetchWebsiteMetadata`'s shape) so the new
`components/sharing/share-control.tsx` — embedded in all 4 item-view components next to
`RemindersPanel` — can show current share state without a separate, undocumented GET endpoint
(`API_Design.md` only lists `POST`/`DELETE` for `/api/items/:id/share`).

Adding `ShareControl` to all 4 item-view components broke the same 4 existing component test
files' fetch-mock call-count assumptions `RemindersPanel` did the session before — fixed the same
way, mocking `ShareControl` out in each, matching the established `MoveItemControl` precedent.
805/805 unit/integration/component tests green (12 new), typecheck clean, lint clean (one new
`react-hooks/set-state-in-effect` instance on `ShareControl`'s mount-fetch effect, the same
pre-existing accepted pattern now used by 7 files in this codebase).

**Not verified this session (manual retest needed, more so than usual per the reduced scope
above):** no live-browser pass at all for this feature — the actual public `/share/:token` page
render (per type: note/website/pdf/image/file/code_snippet), the Share/Copy/Revoke UI flow, and a
second real account confirming a share link exposes *only* that one item's content and nothing
else reachable from it, were none of them driven through a real browser this session. Given this
is the one feature this session whose entire point is "safe to expose publicly," this is worth
prioritizing before Day 6 is called release-ready — recommend at minimum a manual click-through
of generate → open in an incognito window → revoke → confirm the old link 404s, before promoting
past staging.

**2026-08-07 — Day 6 Reminders — full notification system shipped**
(build-order-complete.md #25), squash-merged into `develop`. Day 6 is now 9/14. The first real
use of the previously-installed-but-unused `resend` dependency, and the first Vercel Cron job in
this repo.

New `supabase/migrations/010_reminders.sql` extends the existing `reminders` table (RLS already
covered every column, transitively through `knowledge_item_id`, from `001_initial_schema.sql`)
with three scheduler bookkeeping columns: `deactivated_by_trash` (distinguishes "auto-deactivated
because its item was trashed" from "the user manually cancelled this reminder" — restore only
ever reactivates the former), `last_fired_at`, and `claimed_at` (added mid-feature by self-review,
see below). `schedule` (already `jsonb`) holds type-specific fields — `{hour, minute}` plus
`dayOfWeek`/`dayOfMonth`/`kind`+`intervalDays` as applicable — all evaluated in UTC (no timezone
field exists anywhere in this schema, a documented scope decision, not an oversight).
`lib/reminders/recurrence.ts`'s `computeNextFireAt()` is the one place recurrence math lives:
daily/weekly/monthly (clamping day-of-month to the target month's real last day for the
day-31-in-a-30-day-month case) and two concrete "custom" forms — every-N-days and every-weekday —
matching the exact examples `Notifications.md` itself names, not a general RRULE parser.

New `GET`/`POST /api/items/:id/reminders` and `PATCH`/`DELETE /api/reminders/:id` (the latter a
**soft** cancel — `is_active=false`, row preserved, per "deactivates... without deleting its
history"). `app/api/items/:id`'s `DELETE` (trash) and `.../restore` now call
`lib/items/reminders.ts`'s `deactivateRemindersForItem`/`reactivateRemindersForItem` — restore
only reactivates rows this app itself deactivated via trash (`deactivated_by_trash=true`),
recomputing `next_fire_at` for recurring types and only reactivating a `one_time` reminder if its
stored fire time is still in the future. New `GET /api/cron/reminders` — the actual scheduler,
protected by a `CRON_SECRET` bearer-token check, using `lib/supabase/admin.ts`'s pre-existing
service-role client (the one legitimate new call site for it, since dispatch is inherently
cross-user in a single tick). Per due reminder: skip-and-log if more than 24h late ("missed," per
the spec's grace period), skip the send but still advance if the owner's `notification_email_enabled`
toggle is off (Dashboard stays the fallback surface), otherwise send via
`lib/email/send-reminder-email.ts` (HTML-escapes user-supplied title/description before
interpolating into the email body) with failure-count-based backoff, giving up after 5 consecutive
failures rather than wedging a recurring reminder forever. New `components/reminders/
reminders-panel.tsx` (create/edit/cancel, embedded in all 4 item-view components next to the
existing `TagInput`/`MoveItemControl` row) and a real `GET /api/dashboard` Upcoming Reminders
query (previously a stubbed `ok([])` deferred here from Day 4). New `vercel.json` (cron schedule
`* * * * *`, matching `.claude/docs/infrastructure.md`'s documented design) — flagged, not fixed:
Vercel's Hobby plan (this project's tier) caps cron frequency below once-per-minute in practice;
the scheduler's own 24h grace-period catch-up is the deliberate mitigation, so a reminder still
fires (just later than its exact scheduled minute) as long as the cron runs at least once within
24h of it coming due.

Self-review (`code-reviewer` subagent) caught two real bugs in the scheduler, both fixed: (1) the
backoff-on-failure path overwrote `next_fire_at` with the retry time, and the later successful
send's `resolvedUpdate()` chained the *next* occurrence off of that shifted value instead of the
original anchor — a daily 9am reminder that failed once and backed off 2 minutes would
permanently become a 9:02am reminder going forward. Fixed by leaving `next_fire_at` untouched
during backoff (only `failure_count` changes) — the row simply gets reprocessed on the scheduler's
next run, which is itself a real backoff given the Hobby-tier cron-frequency cap noted above. (2)
No claim/lock existed before processing due reminders — a plain SELECT-then-loop-of-UPDATEs, so
two overlapping cron invocations (a slow tick still running when the next one fires, or a manual
trigger racing the scheduled one) could both select and email the same due reminder. Fixed with
the new `claimed_at` column and an atomic claim step: a single `UPDATE ... RETURNING` (PostgREST
issues `.update().select()` as one SQL statement) claims all due, unclaimed-or-stale-claimed rows
before processing — Postgres's own row-level locking means only one overlapping invocation
actually claims each row. Self-review also flagged (fixed) a `test-cases.md` splice bug from this
feature's own editing (a Data Export test-case bullet had been orphaned into the middle of the new
Reminders section) and (left as a documented, unreachable-today edge case) that `PATCH
/api/reminders/:id` doesn't block editing a cancelled reminder's schedule — the UI never exposes
this since cancelled reminders are edit-locked in `reminders-panel.tsx`.

793/793 unit/integration/component tests green (57 new, up from 736: `lib/reminders/recurrence.test.ts` — 17
cases covering every recurrence type plus the month-end-fallback edge cases in both a 30-day month
and February leap/non-leap — the reminders CRUD routes, the extended trash/restore route tests,
11 scheduler tests covering every outcome branch including the claim step and the backoff-drift
regression, the extended dashboard route test, and `reminders-panel.test.tsx`), typecheck clean,
lint clean (one new `react-hooks/set-state-in-effect` instance on `RemindersPanel`'s mount-fetch
effect — the same pre-existing, already-accepted pattern now used by 6 files in this codebase, not
newly introduced as an anti-pattern). Adding `RemindersPanel` to all 4 item-view components broke
3 existing component test files' fetch-mock call-count assumptions (a real, if unglamorous, find
mid-session, not self-review) — fixed by mocking `RemindersPanel` out in
`note-editor.test.tsx`/`bookmark-view.test.tsx`/`file-item-view.test.tsx`/`code-snippet-view.test.tsx`,
matching the exact precedent those files already established for `MoveItemControl`.

New `e2e/reminders.spec.ts` (`@smoke`) written **and run this session** via the dockerized
`playwright` service: register → turn the "Reminder emails" toggle off first (deliberately — this
makes the scheduler resolve deterministically via the toggle-off path regardless of whether a real
`RESEND_API_KEY` is configured, which it isn't in any environment yet; this repo still has no
actual Resend account wired up, so a real send would always fail here and the spec shouldn't be
flaky/gated on third-party credentials it doesn't need) → create a note → attach a one-time
reminder → confirm it's on Dashboard's Upcoming Reminders → trigger `/api/cron/reminders` directly
with the real `CRON_SECRET` (Vercel Cron doesn't run in this environment) → confirm it disappears
→ trash the item → restore it → confirm a newly-added daily reminder survives the round-trip. Two
real bugs surfaced writing this spec (not self-review, and not app bugs — both in the spec
itself): `<input type="datetime-local">` has minute granularity, so a flat 30s buffer intermittently
lost up to 59s to truncation-toward-the-past once the browser re-parsed the value, occasionally
failing the past-date validation; fixed with a 90s buffer. And the Dashboard legitimately lists the
same item title in both Recent Items and Upcoming Reminders, needing the same
`.locator("..")`-from-heading section-scoping `e2e/dashboard.spec.ts` already established. Also
confirmed live: `docker-compose.yml`'s `playwright` service needed its own `env_file: .env.local`
added (it previously only had a few explicit `environment:` entries) — `CRON_SECRET` must reach
the test-runner process itself, not just the app container, to drive the scheduler route directly.

**Not verified this session (manual retest needed):** real email delivery — no `RESEND_API_KEY`
exists in any environment for this project yet (a human action, `RESEND_FROM`/`CRON_SECRET` were
added to local `.env.local` this session but not a real Resend account); `sendReminderEmail`'s
graceful no-key degradation path is what's actually exercised end-to-end here, not a real send.
Before staging/prod reminder emails work: create a Resend account, set `RESEND_API_KEY`/
`RESEND_FROM` + a generated `CRON_SECRET` value in both Vercel projects' env vars (per
`.claude/docs/infrastructure.md`'s existing instructions), and confirm `vercel.json`'s cron
actually fires on the deployed Hobby-tier plan (or accept its likely-reduced real frequency, per
the grace-period mitigation noted above).

**2026-08-06 — session paused cleanly at end of day.** Day 6 is now 6/14 (Settings — full polish +
Data Export/Import, below, shipped and squash-merged into `develop` this session; Day 5 was already
code-complete going in). Local Supabase (`npx supabase stop`) and Docker (`docker compose down`)
were both stopped cleanly at the end of this session. **To resume:** `git checkout develop && git
pull`, `docker compose up -d app`, `npx supabase start` (needed — the next feature, Reminders
build-order-complete.md #25, touches the `reminders` table/RLS and will need live DB testing). Next
up per `build-order-complete.md`: #25 Reminders — full notification system (one-time/daily/weekly/
monthly/custom recurrence, background scheduler + email via Resend — the first real wiring of the
`resend` dependency, already installed but unused per this session's Settings entry below), then #26
Sharing, #27 Activity log/accessibility/error states, #28 Day 6 QA gate.

**2026-08-06 — Day 6 Settings — full polish + Data Export/Import shipped**
(build-order-complete.md #24), squash-merged into `develop`. First Day 6 feature — Day 5
(Knowledge Sources) is code-complete on `develop` (11/13, the 2 remaining lines are explicitly
optional bookmark extras, plus the human's staging deploy).

New `supabase/migrations/009_settings_data_jobs.sql`: `profiles.language_preference` (persisted
the same way `theme_preference` already is — `notification_email_enabled` already existed from
`001_initial_schema.sql`, just never wired to a control until this feature); new `export_jobs`/
`import_jobs` tables (two separate tables rather than one polymorphic one — their success-state
columns genuinely differ, `storage_path` vs `created_count`/`skipped_count`/`skip_reasons`) with
owner-scoped RLS; a new private `data-jobs` Storage bucket + RLS, same `{owner_id}/...`-scoped
pattern as every other bucket in this app. Applied to local Supabase and, in the same push,
**`nexus-staging`** — which turned out to be several migrations behind (004–008 had never actually
been pushed there, only ever applied locally) and is now caught up.

Export runs as a background job via `after()` (same never-throw contract as
`fetchBookmarkMetadata`/`extractPdfText`): `lib/settings/export/build-json-export.ts` is the single
source of truth (owner's active, non-trashed collections + items + tags + type-specific data, one
batched query per related table rather than N+1), which `build-markdown-export.ts` (one folder per
Collection, a hand-rolled frontmatter block + real content for Notes / a metadata-only block for
every other type, `jszip`) and `build-zip-export.ts` (`export.json` + each `file_assets` row's real
bytes under `files/`) both build on. `POST /api/settings/export` enqueues, `GET
/api/settings/export/:jobId` polls status + a freshly-signed download link, matching the exact
endpoint shape `API_Design.md` had already specified. Import (`lib/settings/jobs/run-import-job.ts`)
accepts a previous JSON or Markdown-ZIP export (uploaded direct-to-Storage by the client, same
pattern avatars/files already use), always creates *new* collections/items (never merges/dedupes
against existing data, per Settings.md), and skips-and-continues per malformed item rather than
failing the whole job — job `status` is only ever `'failed'` when the source file itself couldn't
be read/parsed at all. File bytes are deliberately never re-imported (Settings.md's Import section
only covers JSON/Markdown, not the binary-inclusive `zip` export format) — a `pdf`/`image`/`file`
item comes back as a bare `knowledge_items` row with no `file_assets` behind it, which
`FileItemView` already degrades from cleanly (`{asset && (...)}`, confirmed by reading the code
rather than assumed).

**New dependency** (flagging per CLAUDE.md): `jszip` — no existing dependency does ZIP read/write,
and unlike `lib/files/sniff-content.ts`'s magic-byte checks, a real DEFLATE-compressed ZIP isn't
reasonably hand-rollable; `npm audit` confirmed no new/elevated vulnerabilities (same 6 pre-existing
transitive advisories as every prior feature this Day).

Self-review (`code-reviewer` subagent) caught one **critical, security-relevant** bug, fixed: JSON/
Markdown-ZIP import validated a website item's `url` with a bare `z.string().min(1)`, unlike every
other path that writes `website_metadata.url` (`createBookmarkSchema`), which requires a real
http(s) URL and explicitly rejects other schemes. That URL is later rendered as a real, unescaped
anchor `href` (`components/bookmarks/bookmark-view.tsx`), and this app has no CSP — a crafted/shared
`export.json` (or a `url:` frontmatter field in a Markdown-ZIP) containing a `javascript:` URI would
execute in the importing user's authenticated session on click. Fixed by reusing
`createBookmarkSchema.shape.url` (the exact same schema real bookmark creation already enforces)
inside the import validator. Verified live, not just via the mocked unit test that pins it: a new
`e2e/settings.spec.ts` (`@smoke`) was written **and run this session** (not deferred, per this
session's own "self-review surfaces a bug whose fix specifically needs live proof" exception,
first invoked for Code Snippets) — a real import bundle containing one valid note plus one
`javascript:`-URL bookmark item resolved to "1 imported, 1 skipped," with the malicious item never
created, confirmed against the real dev server + local Supabase via the dockerized `playwright`
service. That same live run also confirmed language/notification preferences persist across a real
reload, and that a triggered JSON export's signed download link resolves to real, correct exported
content (fetched directly and parsed, not just trusted from the UI's success state).

Self-review also caught two further real bugs, both fixed with regression tests: (1) import
validation was materially looser than every other create/update path for the same fields (no
`max()` on title/note-content/snippet-code, no `tagNameSchema` reuse on tag names, free-text
`color`/`icon` instead of the real `COLLECTION_COLORS`/`COLLECTION_ICONS` enums) — fixed by
importing and reusing the real schemas/enums rather than parallel, weaker ad hoc ones; (2)
`created_at` was validated and round-tripped all the way through the export/frontmatter format but
never actually reached the `knowledge_items` insert, so every imported item silently became
"created now" instead of preserving its original timestamp — fixed by wiring it into the insert
when present. Separately, while writing this feature's own tests (not self-review), two more real
bugs surfaced and were fixed before either ever shipped: `build-markdown-export.ts`'s frontmatter+
body concatenation had one extra `"\n"`, so every imported note/snippet body came back with a
spurious leading newline (frontmatter already ends in its own trailing `\n`); and Markdown export
serialized tags as a bare `join(", ")`, which would silently split any tag whose own name legally
contains a comma into two tags on import — fixed by JSON-encoding tags within the frontmatter value
instead.

736/736 unit/integration/component tests green (52 new: `lib/settings/export/*` — json/markdown/zip
builders — `lib/settings/jobs/run-export-job.ts`/`run-import-job.ts`, the four new
`app/api/settings/export|import(/:jobId)` route tests, the extended `app/api/settings/route.test.ts`
for the two new profile fields, and the four new `components/settings/*` component tests), typecheck
clean, lint clean on every touched file. `npm run build` hit the same already-documented, pre-existing
local-only Turbopack prerender failure noted in the Day 2 QA gate entry (on `/forgot-password`, a page
this feature never touched; compile and typecheck both succeeded first) — not re-diagnosed here,
consistent with every prior feature that's hit it.

Also confirmed, live and not just by reading the code: an imported `pdf`/`image`/`file` item with no
`file_assets` row renders without crashing (the existing `{asset && (...)}` guard in `FileItemView`
already short-circuits cleanly) — a self-review suggestion, not a bug, so left as-is.

**Not verified this session (manual retest needed):** the RLS on `export_jobs`/`import_jobs` was
confirmed structurally (policies exist, same owner-scoped pattern as every other table) and the
`GET .../:jobId` routes are unit-tested to 404 a different owner's job id — but no second real
account was spun up to attempt reading/downloading another user's export/import job live, the same
bar Day 3/5's stress tests held other tables to. Worth a live second-account check before this is
relied on for a production release.

**2026-08-06 — Day 5 Code Snippets shipped** (build-order-complete.md #22), squash-merged into
`develop`. The sixth Knowledge Item type. `code_snippet_data` (language, code_content) and its
RLS already existed from `supabase/migrations/001_initial_schema.sql`; new
`supabase/migrations/008_code_snippets_search.sql` folds both into `knowledge_items.search_vector`
(code_content at weight C alongside description/file text, language at weight D), mirroring
`007_file_uploads.sql`'s identical pattern for `file_assets.extracted_text` — verified live
against local Supabase that a string existing only inside a snippet's code is findable via
`search_knowledge_items()`. `POST /api/items` gained a `createCodeSnippet` branch (title/language/
code_content all optional with defaults, same "New Snippet → blank item → edit in place" flow
Notes already established) that rolls back the `knowledge_items` row if the `code_snippet_data`
insert fails, mirroring `createFileItem`'s rollback precedent. `GET`/`PATCH /api/items/:id`
extended to embed/update `code_snippet_data` — a snippet-fields-only PATCH (no `knowledge_items`
column touched) skips the `knowledge_items` UPDATE entirely rather than sending PostgREST an empty
patch body. New `lib/code-snippets/languages.ts` curates ~20 languages on top of
`@uiw/codemirror-extensions-langs`, falling back to plain-text rendering for anything unrecognized
(`Code_Snippets.md`'s Error States requirement, not a separate code path — just what an unmatched
lookup naturally does). New `components/code-snippets/code-editor.tsx` (thin `@uiw/react-codemirror`
wrapper, theme read once from the `dark` class on mount — no live listener, same Day-2-established
scope cut) and `code-snippet-view.tsx` (Edit/Save toggle, explicit Save rather than autosave — the
spec explicitly leaves this to implementation and snippets are typically pasted in rather than
composed over a session — plus one-click copy-to-clipboard). `CollectionDetailView` gained a "New
Snippet" button mirroring "New Note"'s create-blank-and-navigate flow.

**New dependencies** (flagging per CLAUDE.md): `@uiw/react-codemirror` +
`@uiw/codemirror-extensions-langs` — real per-language syntax highlighting with line numbers isn't
reasonable to hand-roll; `npm audit` confirmed no new/elevated vulnerabilities (same 6 pre-existing
transitive-dependency advisories as every other feature this Day, unrelated to this addition).

Self-review (`code-reviewer` subagent) caught one real, significant bug, fixed: a failed
`code_snippet_data` write on `PATCH` returned **200 with the user's edited code silently
dropped** — unlike `note_versions` (history bookkeeping, where the current state is already saved
regardless), `code_snippet_data` *is* the item's current content, so a write failure there has no
safe fallback and must fail loudly (CLAUDE.md rule 4) rather than return success. Fixed to return
500. Investigating that surfaced a second, related bug in the client: `code_snippet_data` is only
included in a PATCH response when that request actually touched `language`/`code_content` — a
plain favorite/archive toggle omits it — but `CodeSnippetView`'s merge logic didn't fall back to
the previous value the way `tags` already does, so toggling Favorite or Archive on any snippet
would have blanked the visible code editor. Fixed with the same `?? prev?.` fallback `tags` uses.
Both fixed with regression tests (one unit test each, plus the live e2e spec below run immediately
rather than deferred, specifically to prove the save-failure fix works end-to-end — self-review
flagged that this bug class is exactly the kind that needs live proof, not just a mocked test).
Self-review's remaining suggestions (a `.min(1)` on the `language` schema field, clarifying
comments) were also applied; one (client-side pre-submit length-check on `code_content`, matching
File_Uploads.md's precedent) was left as a deliberate, documented scope gap — server-side
validation already blocks it correctly via zod, this is purely a UX nicety.

20 new/extended unit/integration tests green (5 in `languages.test.ts`, extensions to both
`app/api/items/route.test.ts` and `app/api/items/[id]/route.test.ts` including a regression test
for the self-review-caught save-failure bug, `collection-detail-view.test.tsx`, and the new
`code-snippet-view.test.tsx` including a regression test for the merge-logic bug), 683/683 full
suite green, typecheck clean, lint clean on every touched file (one new
`react-hooks/set-state-in-effect` instance on `CodeEditor`'s mount-time theme read — the same
pre-existing, already-accepted pattern documented repeatedly elsewhere in this file, now 8 total
instances repo-wide). `e2e/code-snippets.spec.ts` (`@smoke`) was written and **run this session**
(not deferred, per the testing-scope update above) via the dockerized `playwright` service: create
→ edit language/code → save → Global Search for a string that only exists inside the code → found
→ copy-to-clipboard (gracefully degrades to "Couldn't copy" in this specific Docker/insecure-
context test harness, where `navigator.clipboard` is unavailable for the same reason this repo's
WebCrypto console warning already documents — the exact-copy behavior itself is covered by the
mocked-clipboard unit test instead) → edit again → reload → both language and code persist. Also
re-ran `collections.spec.ts`/`notes.spec.ts`/`bookmarks.spec.ts` as a regression check on the
shared files this feature touched (`items/route.ts`, `collection-detail-view.tsx`) — `notes.spec.ts`
failed on an unrelated tag-input step, confirmed via the established stash+rerun-against-clean-
`develop` check to be a pre-existing Turbopack cold-compile flake, not a regression from this
feature (reproduced identically against the stashed-out baseline).

**2026-08-06 — Day 5 bulk-import stress test + QA gate** (build-order-complete.md #23), Day 5
now feature-complete (10/13 — the 3 remaining lines are the two explicitly-optional Website
Bookmarks extras, screenshot/reading-mode, and this gate itself). New
`e2e/bulk-import-stress-test.spec.ts` (`@smoke`), registers a fresh account and drives a real
mixed batch through the actual UI: 3 website bookmarks (2 reachable, 1 guaranteed-unreachable, all
saved immediately without blocking on metadata) + 4 files in one `<input multiple>` batch — a
valid PDF, a valid PNG, a file declared under the 20MB image cap but actually 21MB (client-side
rejected before ever reaching Storage), and a file declared `application/pdf` but whose real bytes
aren't a PDF (passes the client-side check, reaches Storage, then correctly rejected server-side
by content-sniffing). Directly verified against Postgres (`storage.objects`) afterward that
exactly the 2 valid files' objects exist for that account — the mismatched-content file's
Storage object was actually cleaned up (`deleteUploadedObject`), not orphaned, and the oversized
one never got there in the first place.

This surfaced a real, previously-undiscovered bug (`fix/collection-view-batch-upload-unmount`,
squash-merged into `develop` before this gate could pass): `UploadFileForm`'s `onUploaded`
callback fires once per successfully-uploaded file, and `CollectionDetailView.load()`
unconditionally set the page to its full-page "Loading..." state on every call — unmounting the
entire page, including `UploadFileForm` itself and its own per-file progress list, the moment the
*first* file in a multi-file batch finished. File_Uploads.md's own Shared Upload Requirements ask
for visible "per-file progress"; this bug silently defeated that for any batch of 2+ files
succeeding together — exactly the scenario a bulk import is. Never caught before because, per this
file's own File Uploads entry, live-browser verification of that feature was explicitly skipped
when it shipped. Fixed by giving `load()` a `background` option that refetches without touching
the full-page loading/error state, used specifically for `onUploaded`. Regression test added
(mocks `@/lib/supabase/client`'s Storage/`getUser` the same way `upload-file-form.test.tsx` does,
so it drives a real upload through the real component) — confirmed it fails against the pre-fix
code (full "Loading..." replaces the page, "Done" never found) via the established stash+rerun
check, then passes against the fix. 684/684 full suite green, typecheck clean, lint clean.

Separately (and only in this specific Docker/`host.docker.internal`-over-plain-HTTP test
environment, confirmed not a production issue): `crypto.randomUUID()` threw inside
`upload-file-form.tsx`, the *only* client-side call site for it in this codebase (avatar upload
uses a fixed `{user.id}/avatar` path instead, never hitting this) — same secure-context class of
gap already documented for WebCrypto and, as of this session, the Clipboard API. Worked around
with a test-only `page.addInitScript` polyfill in the stress-test spec itself (not an app change).
**Flagged as a real, standalone follow-up, not fixed here:** `upload-file-form.tsx` has no
fallback for a missing `crypto.randomUUID`, unlike WebCrypto's own graceful plain-PKCE fallback in
`register-form.tsx` — worth either a small runtime fallback there for defense-in-depth, or (lower
priority, since this never reproduces on Vercel's real HTTPS origin) fixing why
`playwright.config.ts`'s `--unsafely-treat-insecure-origin-as-secure` flag isn't fully unlocking
secure-context APIs in this harness, so future e2e specs touching file upload aren't silently
blocked the same way.

Remaining qa-checklist.md items in the File Uploads / Website Bookmarks / Code Snippets sections
were spot-checked rather than re-derived from scratch, since each is already covered by existing,
currently-green test suites or this session's own live verification: size/type limits (client +
server) and content-sniffing — this stress test, live; private-by-default Storage + signed-URL
access — `lib/files/signed-url.ts`'s existing tests + `fetchFileAsset`; permanent-delete removes
the Storage object (🔴) — `app/api/items/[id]/permanent/route.test.ts`'s existing
"removes the underlying Storage object" test; PDF-extraction-failure graceful degradation — this
stress test's synthetic PDF hit exactly this path live (`[extractPdfText] extraction failed`,
item still usable); bookmark save never blocked on metadata, duplicate prompt, manual retry —
existing `e2e/bookmarks.spec.ts` plus this stress test's immediate-save confirmation;
`code_snippet_data`'s RLS policy — not re-verified live this session (no second real account was
spun up specifically for it), but it's structurally identical to `file_assets`/`website_metadata`'s
already-live-verified owner-scoped-through-`knowledge_items` pattern (same migration file, same
shape) — worth a live second-account check before this is relied on for a production release, same
bar every other table's RLS got.

**🐛 Auth flow confusion bug, reported 2026-08-05 — investigated and partially fixed 2026-08-06**
(`fix/register-resend-rate-limit`, squash-merged into `develop`). Two reports, investigated
separately by reproducing live against real local Supabase + Mailpit (`docker compose down` +
`next_cache` volume removal was needed first — the dev server was serving a stale Turbopack
client bundle, same known local-only staleness quirk documented elsewhere in this file):

**(2) Registration confirmation confusion — real bug, fixed.** Reproduced: re-submitting the
register form for an email that had just signed up moments earlier hits Supabase's 60s
`max_frequency` resend cooldown (`over_email_send_rate_limit`, confirmed live —
`AuthApiError: "For security purposes, you can only request this after 58 seconds."`).
`RegisterForm` only special-cased `user_already_exists` (the duplicate-confirmed-email code), so
a rate-limited resend fell through to a generic "Something went wrong creating your account"
error — exactly matching the report: user expected a fresh email, got an opaque failure instead,
and had to fall back to the original attempt's link. Fixed by treating
`over_email_send_rate_limit` as a second success-adjacent case landing on the check-your-email
screen. Self-review (code-reviewer subagent) caught a real follow-on issue: GoTrue returns this
same code for two different things the client can't distinguish — the per-address cooldown (an
email genuinely was already sent) vs. `[auth.rate_limit] email_sent`, a project-wide hourly quota
that only bites once custom SMTP is configured. This repo hasn't wired up Resend yet
(`.claude/docs/infrastructure.md` still lists it as "needed from Day 6"), so staging/prod are
currently on Supabase's own hosted mailer, which has its own low default quota — meaning the
project-wide-quota case is plausible on the actual deployed environment the user hit, not just
local dev. Fixed by softening the UI copy to not assert with false certainty that a new email
exists when rate-limited, rather than claiming one was sent either way. **Flagged, not fixed
here:** whether staging/prod's actual Supabase Auth email quota is a real risk needs checking
directly in the Supabase dashboard (both projects) — if it's as low as local's `email_sent = 2`/hr
default, wiring up Resend sooner than Day 6 may be the real fix. Self-review also caught the new
diagnostic logging in `app/auth/confirm/route.ts` (see below) originally logging the raw
`token_hash` in cleartext — a live, single-use credential equivalent to a bearer token — fixed to
log presence/shape only, with a regression test pinning that.

**(1) Password-reset link showing verify-email's "Register again" copy — could not reproduce
against current code.** Live-tested: requesting a reset twice in a row before using either
returns the *identical* token_hash (Supabase doesn't rotate it), using it once correctly redirects
to `/reset-password?status=success`, and re-using the same (now-consumed) link correctly shows
`/reset-password`'s own distinct copy ("This link has expired... Request a new one" — never
"Register again," which only exists on `/verify-email`). `DESTINATION_BY_TYPE` in
`app/auth/confirm/route.ts` has always mapped `recovery → /reset-password` (unchanged since the
Password Reset feature shipped, `bc80e81`) — the only path to landing on `/verify-email` for a
recovery attempt is this route's own zod-validation-failure fallback, which fires if
`token_hash`/`type` are missing or malformed in the incoming query string (e.g. an email client
rewriting/truncating the link, or a corporate link-scanner pre-fetching and consuming the
single-use token before the real click). Added a `console.error` to that previously-silent
fallback branch (redacted per the finding above) so a recurrence can actually be diagnosed instead
of guessed at — not a fix for a symptom that didn't reproduce, just visibility for next time.

19/19 new/updated unit tests green (8 in `register-form.test.tsx` including the new rate-limit
case, 10 in `route.test.ts` including the token_hash-redaction regression test), 662/662 full
suite green, typecheck clean, lint clean on touched files. Live-verified via the dockerized
`playwright` service: `register.spec.ts` (including a new regression test for the resend-cooldown
case), `verify-email.spec.ts`, and `login.spec.ts` all green against a freshly-built dev server.

**2026-08-05 — session paused cleanly at end of day.** Day 5 is now 9/13 (Website Bookmarks'
4 lines + File Uploads' 5 lines below, both shipped and squash-merged into `develop` this
session). Local Supabase was never started this session (not needed — no feature this session
touched RLS/Auth/Storage behavior that required live-testing against it, per the session-wide
testing-scope note above); Docker (`docker compose up -d app`) was stopped cleanly at the end of
this session. **To resume:** `git checkout develop && git pull`, `docker compose up -d app` (add
`npx supabase start` first only if the next feature needs live DB/RLS/Storage testing). Next up
per `build-order-complete.md`: #22 Code Snippets, then #23 Bulk import stress test + Day 5 QA
gate — see the "Not verified this session" notes on both shipped features below for what still
needs a manual, real-browser pass before Day 5 can be called fully done.

**2026-08-05 — Day 5 File uploads — PDFs, Images, general Files shipped**
(build-order-complete.md #21, bundled as one feature/branch/commit per its own prompt — "Build the
shared upload mechanism and all three types" isn't a real increment split across five separate
merges — covering all 5 PROGRESS.md lines below it): drag-and-drop + file-picker batch upload,
PDF in-app preview + background text-extraction, Image thumbnail/full-size rendering, general File
inline-preview-or-metadata, and size/type limits enforced client- and server-side.

No new migration for the item tables themselves — `file_assets` (with RLS) already existed from
`supabase/migrations/001_initial_schema.sql`, matching `website_metadata`'s precedent. New
`supabase/migrations/007_file_uploads.sql`: a private `files` Storage bucket (RLS scoped to
`{owner_id}/...`, same pattern as `002_avatars_storage.sql`'s `avatars` bucket) plus folding
`file_assets.extracted_text` into `knowledge_items.search_vector` (mirrors `004_search_ranking.sql`'s
tag-folding — same `knowledge_item_search_vector()` shared function, extended rather than
duplicated, so the base title/description trigger and the tag triggers pick up PDF text
automatically). Files upload **directly from the browser to Storage** (`components/files/
upload-file-form.tsx`), same architecture this repo already established for avatars — the right
call for PDFs up to 50MB, which would strain a Next.js route handler's body-size limits. `POST
/api/items` (new `createFileItem` branch) then re-validates everything authoritatively:
`lib/files/validate-upload.ts` re-checks the declared size/type server-side, and — the actual
security-relevant step — `lib/files/verify-upload.ts` fetches the first 4KB of the just-uploaded
object via a signed URL + Range request and sniffs its real content (`lib/files/sniff-content.ts`,
hand-rolled magic-byte signatures for PDF/PNG/JPEG/GIF/WebP/ZIP-container/OLE-compound/plain-text
— no new dependency, same "small enough to hand-roll and unit-test" reasoning `safe-fetch.ts` used
for the bookmarks feature's SSRF guard) against the declared MIME type, rejecting (and cleaning up
the orphaned Storage object) on any mismatch — File_Uploads.md's "MIME type matching the file's
actual content, not just its extension" requirement. PDF text extraction
(`lib/files/extract-pdf-text.ts`, new `pdf-parse` dependency) runs via `after()` exactly like the
bookmarks feature's metadata job — never throws, marks `extraction_status: 'failed'` (visible to
the user as "not full-text searchable") on a scanned/corrupt/encrypted PDF rather than failing the
upload. `GET /api/items/:id` now embeds `file_asset` with a freshly-signed 10-minute download URL
(`lib/items/file-asset.ts` + `lib/files/signed-url.ts`, mirrors the website-metadata/avatar signed-
URL pattern). `DELETE /api/items/:id/permanent` now also removes the Storage object (previously
only deleted the DB row) — fetches `file_assets.storage_path` *before* the cascading delete removes
it. New `components/files/file-item-view.tsx` (one shared component for all three types, each with
type-specific preview: PDF via a plain `<iframe>` — a deliberate choice over bundling a pdf.js
viewer — Image via `next/image` with `fill`/`sizes` for real on-the-fly resizing, general File via
an inline `<pre>` text preview when the MIME type is plain-text-ish, else metadata + Download only)
plus the same favorite/archive/trash/tags/move actions every other item-detail view already has.
`next.config.ts` now allowlists the Supabase Storage host in `images.remotePatterns` (derived from
`NEXT_PUBLIC_SUPABASE_URL` at config-load time) — safe to allowlist unlike the bookmarks feature's
favicon/OG-image URLs, since this is *our own* Storage host known at build/deploy time, not an
arbitrary third-party one. `CollectionDetailView` gained a plain emoji type-marker per item type
(📝/🔗/📄/🖼️/📎/💻) — not an actual thumbnail in list/grid view (see below).

**New dependencies** (flagging per CLAUDE.md): `pdf-parse` + `@types/pdf-parse` — no existing
dependency does PDF text extraction; pure-JS (no native/canvas dependency, unlike using `pdfjs-dist`
directly), and `npm audit` confirmed it introduces no new/elevated vulnerabilities (the 6
pre-existing moderate/high advisories on this branch are all transitive deps of `next`/tooling,
unrelated to this addition).

Self-review (`code-reviewer` subagent) caught two real issues, both fixed: (1) the size/type
validation (`validateFileUpload`) originally ran *before* authentication, so a request that failed
only that check returned 400 without ever creating the authenticated Storage client needed to clean
up the already-uploaded object — reordered so auth + the `storage_path` ownership check run first,
and the size/type-mismatch branch now cleans up too; (2) the size cap only ever checked the
client-declared `size_bytes` field from the POST body, which a client could simply lie about to
slide a file under a per-type cap while the real (larger) bytes already sat in Storage — fixed by
having `verifyUploadedFileContent` also parse the real object size out of its Range-response
headers (`Content-Range` on the common 206 case, `Content-Length` on a 200 for an object smaller
than the requested range) and using that authoritative value both for the cap re-check and for what
gets stored in `file_assets.size_bytes`. Self-review also raised a third, more serious-sounding
finding — that `search_vector` would go stale on title/description edits and silently drop PDF
text/tags from search — which was investigated and confirmed a **false positive**: `004_search_ranking.sql`
already redefined the base `knowledge_items_search_vector_update()` trigger function to delegate to
the shared `knowledge_item_search_vector()` function this migration extends via `create or replace
function` (same name/signature), and Postgres threads a redefined function through to every trigger
already bound to it by name without needing the trigger itself recreated — the exact mechanic this
repo's own `set_updated_at()` redefinition already relies on and had "verified live" in the Day 4
PROGRESS.md entry below. Not re-verified live this session (local Supabase wasn't started — see the
session-close note above), but high-confidence from the migration history alone; flagged here in
case a future session wants to double-check it live before relying on it further.

Self-review also flagged two items deliberately left as-is rather than fixed, both worth revisiting
before Day 5 is called fully done: (a) **no periodic orphan-Storage-object cleanup job** — if a
browser closes the tab after the direct-to-Storage upload succeeds but before `POST /api/items`
ever fires, that object is orphaned with nothing to sweep it (File_Uploads.md's own Error States
section anticipates this exact gap needing "a periodic cleanup job"); every *request-time* rejection
path does clean up correctly (self-review confirmed and this is unit-tested), just not this
no-second-request case. (b) **no real thumbnails in list/grid views** — `CollectionDetailView`
currently shows a static emoji marker for every item type rather than an actual image thumbnail for
`image`-type items, and `GET /api/items` (backed by `search_knowledge_items()`) doesn't return any
`file_asset`/signed-URL data on list rows at all, so there's no data to render one from without a
further change to that RPC/route. File_Uploads.md's acceptance criteria explicitly call for
thumbnails "in list/grid views," so this is a real, named gap, not just a nice-to-have — next
session should either build it or make an explicit, documented scope decision to defer it (matching
this repo's usual pattern for such calls, e.g. Day 3's version-history-boundary decision).

661/661 unit/integration/component tests green (106 new: `lib/files/*` — constants/validate-upload/
sniff-content/verify-upload/extract-pdf-text/signed-url — `lib/items/file-asset.ts`,
`lib/format/format-bytes.ts`, the extended `POST /api/items`, `GET /api/items/:id`, and `DELETE
/api/items/:id/permanent` route tests, `UploadFileForm`, `FileItemView`, and the extended
`CollectionDetailView` tests), typecheck clean, lint clean on every file this feature touched (the
one new `react-hooks/set-state-in-effect` instance in `FileItemView`'s text-preview effect matches
the same pre-existing, already-accepted pattern used by 6 other files in this codebase — confirmed
via `npm run lint` before this feature touched anything). `npm run build` hit the same
already-documented, pre-existing local-only Turbopack `/_not-found` prerender failure noted in the
Day 2 QA gate entry below (compile and typecheck both succeeded first; the failure is unrelated to
any file this feature touched) — not re-diagnosed here, consistent with every prior feature that's
hit it.

**Not verified this session (manual retest needed):** per the session-wide note at the top of this
file, load/stress testing (the "bulk import stress test" is its own separate, not-yet-started
build-order item, #23) and live-browser verification were both skipped for this feature entirely —
unlike the Website Bookmarks feature above (which at least had a prior session's real Playwright
run to fall back on), **this feature has zero real-browser or real-Supabase verification of any
kind yet** — no local Supabase Storage bucket was ever created/tested against, no real upload was
ever driven through a browser, and no `e2e/*.spec.ts` file was written for it at all. Before
trusting this in production: (1) run `supabase start` (creates the local `files` bucket for the
first time from this migration) and manually drive a real upload of each of the three types
through the browser, including an oversized file and a PDF with no text layer, per
`build-order-complete.md` #21's own test note; (2) write and run an `e2e/files.spec.ts` smoke test;
(3) manually verify the Supabase Storage RLS policies directly (a second real account attempting to
read/delete another user's file's storage path) the way every other feature's Storage/RLS surface
in this codebase has been.

**2026-08-05 — Day 5 Website bookmarks — save flow + metadata background job shipped**
(build-order-complete.md #20), squash-merged into `develop`. Resumed from a prior session's
paused implementation (branch `feature/d5-website-bookmarks`, pushed to origin as a backup) —
that session's work was functionally complete but not yet self-reviewed or merged; this session
ran self-review, fixed what it found, and merged:

No new migration — `website_metadata` (with RLS) already existed from
`supabase/migrations/001_initial_schema.sql`. New `lib/bookmarks/` (URL normalization for
duplicate-check comparison, `cheerio`-based HTML metadata parsing, the `fetchBookmarkMetadata`
background job itself — fetch with a 10s timeout, `Content-Type` check, never throws) and
`lib/items/website-metadata.ts` (mirrors `fetchItemTags`'s shape). `POST /api/items` now requires
a `type: 'note' | 'website'` discriminator (the comment already in that file called this out as
the planned Day-5 change) and branches to a new bookmark-create path: duplicate check (non-blocking
— a normal 200 response with `{duplicate: true, existingItemId}`, not a rejection) → immediate
insert (`fetch_status: 'pending'`, raw URL as title) → `after()` (Next's post-response background
API, closing over the already-authenticated `supabase` client) enqueues the metadata fetch, so the
create response never waits on the network fetch. New `POST /api/items/:id/metadata/retry`
re-enqueues the job. `GET /api/items/:id` embeds `website_metadata` for website-type items. New
`SaveBookmarkForm` (mirrors `CollectionDetailView`'s existing "New Note" pattern, wired in
alongside it) and `BookmarkView` (polls while `fetch_status` is `pending` so metadata fills in
without a manual refresh; plain Edit/Save toggle for title/description, no autosave — not required
by the spec, unlike Notes; favicon/OG preview image render via a plain `<img>`, not `next/image`,
since they're arbitrary external URLs discovered at runtime that can't be pre-allowlisted in
`remotePatterns`). `app/(app)/items/[id]/page.tsx` now does a lightweight server-side `type`
lookup (same direct-Supabase-in-a-Server-Component pattern `settings/page.tsx` already uses) to
dispatch to `BookmarkView` vs. the existing `NoteEditor`. **New dependency** (flagging per
CLAUDE.md): `cheerio`, for parsing arbitrary third-party HTML — nothing already in `package.json`
parses general HTML (the `remark`/`rehype` stack is Markdown-only), and the spec's malformed-HTML
tolerance requirement is exactly what a real parser handles correctly and hand-rolled regex
doesn't; no new/elevated vulnerabilities from it (`npm audit` checked). Screenshot capture and
Reading Mode are out of scope — both explicitly "Optional"/"if time allows" in
`Website_Bookmarks.md`.

Self-review (`code-reviewer` subagent, run this session) caught one real, critical issue, fixed:
**SSRF** — `fetchBookmarkMetadata` fetched an arbitrary user-supplied URL server-side with zero
protection against internal/private-network targets (e.g. `http://169.254.169.254/...` cloud
metadata, `http://localhost:<port>`, RFC1918 ranges), reachable from both the create path and the
no-rate-limit retry route, with the response reflected back into the item's visible
title/description/og-image. `fetch`'s automatic redirect-following also meant a check on only the
initial URL wouldn't have stopped a public URL that 302s into an internal one. Fixed with new
`lib/bookmarks/safe-fetch.ts`: resolves/validates the hostname (literal IP or DNS lookup) against
loopback/private/link-local/reserved ranges before every fetch, following redirects manually so
each hop is independently re-validated (not left to native `fetch` redirect-following), plus a
response-body size cap (`readBodyWithLimit`, 5MB) so a spoofed `Content-Type: text/html` can't
stream an unbounded body into memory ahead of the 10s timeout. Self-review's two secondary findings
were left as accepted, documented trade-offs rather than fixed: the duplicate-check-then-insert
race under concurrent submits (acceptable — the product already allows intentional duplicates, and
there's no data-corruption risk, just a possible skipped prompt) and `findDuplicateBookmark`'s O(n)
in-JS scan (same "small list, compare in JS" pattern already accepted for `getOrCreateTag`).

574/574 unit/integration/component tests green (52 new since the prior session's 556: the original
34 across `lib/bookmarks/*`, `lib/items/website-metadata.ts`, the extended `POST /api/items` and
`GET /api/items/:id` route tests, the new retry route, `SaveBookmarkForm`, and `BookmarkView`, plus
18 new this session for `lib/bookmarks/safe-fetch.ts`'s SSRF-guard/redirect/body-cap behavior),
typecheck clean, lint clean on every touched file.

**Not verified this session (manual retest needed):** per explicit instruction this session,
load/stress testing and live-browser verification were skipped for this feature (see the
session-wide note at the top of this file). `e2e/bookmarks.spec.ts` (`@smoke`, covering
save/poll/edit/reload, unreachable-URL/"Metadata unavailable"/Retry, and duplicate-prompt/"View
existing") was written and confirmed green in the *prior* session (standalone, against real local
Supabase + a real fetch to `https://example.com/` per RFC 2606, and a guaranteed-unreachable
`.invalid` domain for the failure path) but was **not re-run this session**, including after this
session's SSRF fix — the fix only changes internal request-validation logic the e2e spec doesn't
exercise (it fetches public example.com/.invalid, neither of which the new guard blocks/affects),
so a regression here is unlikely, but it's still an actual live-browser proof this feature is
missing until manually re-run. A full `@smoke`-suite regression run (not just this feature's own
spec) was also not attempted this session — the prior session's attempt at that showed failures
across several *other*, unrelated specs (login, collections, notes, trash ×2, dashboard) matching
this repo's already-documented Turbopack/parallel-run dev-server staleness flakiness, but that was
never confirmed via the established stash + rerun-against-a-clean-baseline check either.

Previously, 2026-08-04 — **Day 4 Dashboard — full widgets shipped** (build-order-complete.md #18, the 4
Dashboard lines below bundled into one feature — same rationale as Search: a Dashboard without
its stats/favorites/recent-collections sections live isn't a real increment): Recent Items,
Recently Viewed, Favorites (Collections + items combined), Recent Collections (by most recent
activity, not alphabetical), Statistics (counts by type), and Upcoming Reminders (left as its
empty-state placeholder — Reminders doesn't exist until Day 6, per the prompt's own explicit
scope note).

`supabase/migrations/006_dashboard.sql` — new `item_views` table + RLS (tracks "recently viewed"
distinct from edit events per `Dashboard.md`; deliberately NOT built on top of Day 6's
not-yet-existing `activity_log` "viewed" support — small purpose-built table instead) plus three
RPCs backing sections a plain PostgREST query can't express: `dashboard_recently_viewed()` (join),
`dashboard_recent_collections()` (GROUP BY latest-activity aggregate — "most recently active" per
`Dashboard.md`, not alphabetically), `dashboard_item_type_counts()` (GROUP BY count). None
`security definer` — RLS still applies underneath, same pattern as Day 4's search RPCs. New
`GET /api/dashboard` runs all six sections in parallel, each independently try/catch'd (never
throws), so one section's failure (e.g. a timed-out query) can't blank the rest of the page, per
`Dashboard.md`'s Error States section — verified live by deliberately breaking the Statistics
response and confirming the other five sections still render with a per-section "Couldn't load
this section · Retry." Recent Items reuses `search_knowledge_items()` (no query, sorted by
`updated`) rather than a new query, matching how plain browsing already falls back when there's no
search term. `GET /api/items/:id` now upserts into `item_views` on every successful fetch
(best-effort, logs and continues on failure — CLAUDE.md rule 7). New `DashboardView` client
component (mirrors `SearchView`'s fetch-on-mount pattern, with an `AbortController` guarding
retry-race staleness) replaces the static placeholder shell in `app/(app)/dashboard/page.tsx`; new
`lib/format/relative-time.ts` for the "2 hours ago"-style timestamps `Dashboard.md` calls for.

Self-review (code-reviewer subagent) caught three real issues, all fixed: (1) `PATCH
/api/collections/:id`'s archive toggle bumps `updated_at` like any other update (via the generic
`set_updated_at` trigger), so without an explicit filter, archiving a collection to get it out of
the way would jump it to the *top* of Recent Collections — `dashboard_recent_collections()` now
excludes `is_archived = true`; (2) `DashboardView`'s retry button had no request-cancellation
guard, so clicking retry while a slower prior request was still in flight could let that stale
response resolve after the fresh one and silently clobber good state — fixed with the same
`AbortController` pattern `search-view.tsx` already uses; (3) `loadUpcomingReminders` had been
built as a real, working query against the `reminders` table (which already exists from Day 1's
schema) — flagged as scope creep ahead of Day 6 with zero real test coverage for untriggerable
code, and build-order-complete.md's own step-18 prompt explicitly says to leave this section as
its empty state. Scoped back to a plain `ok([])`; Day 6 gets the real query and its test coverage
together. 499/499 unit/integration tests green (28 new: 4 for the aggregated route including the
per-section-isolation case, 8 for `DashboardView`, 5 for `relative-time`, 2 new item-view-recording
cases in the existing items/:id route test), typecheck clean, lint clean on every touched file (one
new `react-hooks/set-state-in-effect` instance on `DashboardView`'s mount-fetch effect — the same
pre-existing, already-accepted pattern used by `collections-view.tsx`/`collection-detail-view.tsx`/
`trash-view.tsx`/`tag-management-view.tsx`/`move-item-control.tsx`, 5 confirmed via `npm run lint`
before this feature touched anything; not newly introduced as an anti-pattern, matching the
codebase's existing "fetch on mount" shape). New `e2e/dashboard.spec.ts` (`@smoke`) verified green
via the dockerized `playwright` compose service (a host-run browser — `claude-in-chrome` or
Playwright MCP — can't complete login against local Supabase, per the `host.docker.internal`
memory note): create → edit → favorite → open (recording a view) a note, confirm it surfaces in
Recent Items/Recently Viewed/Favorites/Recent Collections/Statistics on the Dashboard with no
manual refresh, then deliberately break Statistics via `page.route` and confirm the rest of the
page still renders. Also re-ran `login`/`logout`/`trash`/`collections`/`register`/`verify-email`
`@smoke` specs individually — all green; a first parallel `--workers=5` run showed several
unrelated failures that turned out to be the already-documented local Turbopack dev-server
staleness quirk (confirmed by reproducing collections.spec.ts's failure against this feature's own
*stashed-out* baseline, then clearing the `next_cache` volume and re-running clean — passed), not
a real regression from this feature.

**2026-08-04 — Day 4 performance validation complete** (build-order-complete.md #19): seeded a
real account (`scripts/seed-search-stress-test.mjs`, new, kept for reuse — same real-signup/
real-Mailpit-confirmation/no-service-role-shortcuts pattern as Day 3's seed script, batched in
groups of 500 rather than 5,000 individual inserts) with 5,000 notes (only type that exists until
Day 5) across 5 Collections and 8 Tags, randomized favorite/archive flags and 0–3 tags each.
Confirmed the actual Success_Metrics.md/Search.md claim — "search returns in under 500ms
server-side" — by timing `search_knowledge_items()` directly (`scripts/measure-search-performance.mjs`,
new, kept for reuse), zero debounce/network/browser-compile noise: worst case across 7 query
shapes (plain browse, single/multi-word full-text, query+favorite filter, query+date-range
filter, deep pagination at offset 4000, title A–Z sort) was **41ms — over 12x under budget**.
New `e2e/search-performance.spec.ts` (not `@smoke` — depends on this large seeded dataset, so it's
a one-off validation script) confirmed search/filtering/pagination stay functionally correct at
this scale in a real browser via the dockerized `playwright` service: total counts correct,
favorite filter returns only favorited rows, 250-page pagination navigates cleanly 5 pages deep.
Two in-browser timing approaches were tried and abandoned as unreliable in this environment before
settling on the RPC-level measurement as authoritative: wall-clock-from-click-to-response wrongly
included `SearchView`'s intentional ~250ms results debounce as if it were server latency, and
Playwright's Resource Timing API (`request.timing().responseEnd`) returned `-1` (unavailable) for
every request here. Also ran the Day 4 QA-checklist items build-order-complete.md's own prompt
calls out (`.claude/docs/qa-checklist.md`'s Search/Dashboard/Performance sections): trashed items
excluded from search confirmed at the SQL level (`005_search_function.sql`'s `deleted_at is null`
filter), filter-combining and title>tag>body ranking already covered by the Search feature's own
tests, and Dashboard's per-section-failure-isolation and same-navigation-reflects-changes both
re-confirmed live by this session's `e2e/dashboard.spec.ts`. No app code changed — the stress test
surfaced no performance problems at 5,000 items, so nothing needed fixing.

**Day 4 (Search & Organization, v0.2) is now code-complete on `develop` — 10/10.** Promoting
`develop → staging → main` (tag `v0.2`) is the human's action, not the agent's — see
`.claude/docs/git-workflow.md`.

Previously, 2026-08-04 — **Day 4 Global Search shipped** (build-order-complete.md #16/#17,
5 PROGRESS.md lines bundled into one feature since they're all the same route/UI surface —
shipping "search" without its own filters/sorting/recent-searches live at the same time isn't a
real increment): Global search (full-text across title/description/tags/note body),
search-as-you-type, filters (type/collection/tag/favorite/archived/date range, combinable),
sorting (relevance/recently updated/recently created/title A–Z), and recent searches.

Two new migrations. `004_search_ranking.sql` folds tags into `knowledge_items.search_vector`
(weight A=title, B=tags, C=description/note-body, matching Search.md's "title > tag > body"
ranking — previously only title/description were weighted) via new triggers on
`knowledge_item_tags`/`tags` that keep it in sync as tags are attached/detached/renamed. That
surfaced a real design problem before any bug existed: tag-attach today never touches the
`knowledge_items` row itself, so writing `search_vector` from a *different* table's trigger would
have silently started bumping `updated_at` too (via the existing generic `set_updated_at()`
trigger, which fires on any `UPDATE`) — reordering "recently updated" sort just from tagging, an
item's `is_favorite`/`is_archived` toggle would still be a real update but a *pure* rename-driven
refresh should not read as "the user touched this item." Fixed by redefining `set_updated_at()`
(via `create or replace function`, per `.claude/rules/database.md` — `001_initial_schema.sql` is
already applied to `nexus-staging`/`nexus-prod`, never hand-edited) to only bump `updated_at` when
something other than `search_vector` actually changed. Verified live against local Supabase: tag
rename does NOT bump the item's `updated_at`, a real title edit still does, and — the specific
case self-review asked to confirm wasn't an accidental over-broadening — a genuine no-op update
(setting a collection's name to its own current value) also no longer bumps `updated_at`, while a
real rename still does. `005_search_function.sql` adds `search_knowledge_items()`, a single
Postgres function doing filter/tag-OR-match/`ts_rank_cd`-ranking/pagination in one indexed query
(not `security definer` — RLS on `knowledge_items` still applies underneath regardless of what
`p_owner_id` is passed; verified by having a second real account call the RPC directly with a
forged owner id and confirming it still only sees its own empty result). `GET /api/items` (already
"the primary listing/search endpoint" per `API_Design.md`) now backs both plain collection
browsing and Search off the same RPC — no separate `/api/search` needed. New `GET`/`POST
/api/recent-searches` (table + RLS already existed from Day 1) records a query only after it
settles (a longer timer, distinct from the ~250ms live-results debounce) or on Enter, not on every
keystroke-driven fetch, and dedupes case-insensitively so re-running a search bumps it to the top
instead of duplicating. New `/search` page + nav link.

Self-review (code-reviewer subagent) caught two real bugs, both fixed: (1) `created_to`'s
date-only value (`<input type="date">` → midnight UTC) was compared as an inclusive upper bound
against `created_at`, so selecting today as a range's end excluded almost everything actually
created today — fixed by extending it to the last millisecond of that day, with a regression test;
(2) recent-search dedup used `ilike` for what was meant to be an exact case-insensitive match, so
a query containing `%`/`_` (e.g. "50% off") would match/miss unrelated rows as an unintended
wildcard pattern — fixed by escaping those characters first, with a regression test. Self-review
also caught genuinely empty `catch` blocks in the search view (collections/tags/recent-search
fetch failures) with zero diagnostic trail, a CLAUDE.md rule-4 violation — fixed with
`console.error` logging while keeping the "don't surface this to the user" behavior, since those
are secondary to the core search results. Manual testing (not self-review) separately caught a
real bug: the recent-searches suggestion dropdown didn't hide once the user started typing a new
query — fixed. Also took two of self-review's optional suggestions: title sort now uses
`lower(title)` for true case-insensitive A–Z (verified live: "apple, Banana, cherry" in that
order), and a duplicated page-size constant in the search view now imports the shared one instead.
477/477 unit/integration tests green (39 new), typecheck clean, lint clean on every touched file
(5 pre-existing `react-hooks/set-state-in-effect` errors in unrelated Day 2/3 files, confirmed via
`git stash` comparison to predate this change, left untouched — out of scope here). Verified live
end-to-end via the dockerized `playwright` compose service (the confirmed-working path for a real
login against local Supabase, per the `host.docker.internal` memory note — a host-run browser,
`claude-in-chrome` or Playwright MCP alike, cannot complete login at all): query returns matching
notes and excludes non-matching ones, type+sort filters combine correctly and return live-sorted
results, recent searches populate on focus. Hit and resolved (not a regression, previously-known
issue) the Turbopack dev-server route-staleness quirk — a brand-new `app/(app)/search/page.tsx`
404'd until `docker compose restart app`.

Previously, 2026-08-04 — **Day 3 stress test complete** (build-order-complete.md #15):
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

## Day 4 — Search & Organization (v0.2) — release Thursday (10/10)

- [x] Global search — full-text across title, description, tags, note body — see the 2026-08-04
  entry above.
- [x] Search-as-you-type (debounced instant results) — see the 2026-08-04 entry above.
- [x] Filters — type, collection, tag, favorite, archived, date range (combinable) — see the
  2026-08-04 entry above.
- [x] Sorting — relevance (default w/ query), recently updated, recently created, title A–Z —
  see the 2026-08-04 entry above.
- [x] Recent searches (shown on focus, no query typed) — see the 2026-08-04 entry above.
- [x] Dashboard — recent items, recently viewed widgets — see the 2026-08-04 entry above.
- [x] Dashboard — favorites widget (collections + items), recent collections widget — see the
  2026-08-04 entry above.
- [x] Dashboard — statistics widget (counts by type) — see the 2026-08-04 entry above.
- [x] Dashboard — upcoming reminders widget (empty until Day 6 ships Notifications) — see the
  2026-08-04 entry above.
- [x] 5,000-item stress test — confirm search <500ms server-side, pagination holds — see the
  2026-08-04 entry above (41ms worst case).
- [ ] **v0.2 released to production** ✅

## Day 5 — Knowledge Sources — release Friday (staging only) (11/13)

- [x] Website bookmarks — paste URL → immediate save, async metadata fetch — see the 2026-08-05
  entry above
- [x] Website bookmarks — metadata extraction (title, description, OG image, favicon, canonical URL, domain) — see the 2026-08-05 entry above
- [x] Website bookmarks — duplicate detection prompt (non-blocking) — see the 2026-08-05 entry above
- [x] Website bookmarks — manual retry on metadata failure — see the 2026-08-05 entry above
- [ ] Website bookmarks — screenshot (optional, best-effort)
- [ ] Website bookmarks — reading mode (optional, time-permitting)
- [x] File uploads — PDFs (upload, in-app preview, download) — see the 2026-08-05 entry above.
  **Verified live 2026-08-06** via the bulk-import stress test (upload, item creation, download
  path) — list/grid-view in-app preview rendering itself still not manually eyeballed.
- [x] File uploads — PDF text extraction background job (search-indexed; graceful failure state) — see the 2026-08-05 entry above. **Verified live 2026-08-06** — the stress test's synthetic PDF hit the graceful-failure path for real (`[extractPdfText] extraction failed`, item still usable).
- [x] File uploads — Images (upload, thumbnail + full-size preview, download) — see the 2026-08-05 entry above; list/grid-view thumbnails specifically remain a named, not-yet-closed gap (self-review). **Upload path verified live 2026-08-06** via the stress test; thumbnail rendering itself not manually eyeballed.
- [x] File uploads — General files (allow-listed types, metadata view or inline preview, download) — see the 2026-08-05 entry above. Not yet manually verified live (this session's stress test covered PDF/Image, not the general-file type specifically).
- [x] File uploads — size/type limits enforced client- and server-side — see the 2026-08-05 entry above. **Verified live 2026-08-06** — the stress test's oversized/mismatched-content files were rejected client- and server-side respectively, confirmed via direct Postgres check that no Storage orphan remained.
- [x] Code snippets — create/edit, language select, syntax highlighting, copy-to-clipboard — see
  the 2026-08-06 entry above. Verified live this session (create, edit, search-by-in-code-string,
  copy, reload-persistence all confirmed via the dockerized `playwright` service).
- [x] Bulk import stress test (websites + files) — see the 2026-08-06 QA-gate entry above. Also
  caught and fixed a real bug (`fix/collection-view-batch-upload-unmount`) that only surfaces with
  a multi-file batch, exactly what this test exists to catch.
- [ ] **Staging deploy — no production release today**

## Day 6 — Polish (v1.0 Release Candidate) — release Saturday (6/14)

- [x] Settings — profile (display name, avatar) full polish — already built Day 2; re-confirmed
  working as part of this feature, no changes needed.
- [x] Settings — theme persistence confirmed cross-device — already built Day 2; re-confirmed, no
  changes needed.
- [x] Settings — language selector stub (English only, functional) — see the 2026-08-06 entry above.
- [x] Settings — notification preferences (global email reminders on/off) — see the 2026-08-06 entry
  above. In-app toggle only — the email-sending side of "notification preferences" is wired up when
  Day 6's Reminders step (#25) builds the actual Resend integration.
- [x] Settings — data export (Markdown / JSON / ZIP, background job + completion notice) — see the
  2026-08-06 entry above. Completion notice is in-app only (poll-driven download link) for the same
  reason — email notification is deferred to #25, documented as a deliberate scope decision, not an
  oversight.
- [x] Settings — data import (JSON / Markdown, background job + summary) — see the 2026-08-06 entry
  above.
- [x] Reminders — one-time, daily, weekly, monthly, custom recurrence — see the 2026-08-07 entry
  above.
- [x] Reminders — email delivery via background scheduler, missed-reminder catch-up — see the
  2026-08-07 entry above.
- [x] Reminders — deactivate on trash, reactivate on restore — see the 2026-08-07 entry above.
- [x] Sharing — public view-only share link per Knowledge Item (generate/revoke) — see the
  2026-08-07 entry above.
- [x] Activity log (created/edited/deleted/restored/shared events) — see the 2026-08-07 entry
  above. The accessibility pass and error/empty-state sweep originally bundled into this same
  build-order-complete.md #27 step are deliberately deferred to #28's QA gate (explicit user
  instruction this session) — not done yet, tracked separately below.
- [x] Accessibility pass — keyboard nav, ARIA labeling, WCAG AA contrast (both themes) — see the
  2026-08-08 entry above.
- [x] Error/empty states pass across all surfaces — see the 2026-08-08 entry above.
- [ ] Full Playwright regression + Lighthouse performance/accessibility audit
- [ ] **v1.0 Release Candidate — staging + production** ✅

## Day 7 — Production (v1.0) — release Sunday (2/6)

- [ ] Bug fixing from RC feedback — no real RC exists yet (nothing promoted to `staging`/`main`),
  so nothing to fix from feedback; a self-directed static audit ran instead, see the
  2026-08-08 entry above.
- [x] Refactoring pass — see the 2026-08-08 entry above (requireUser consistency fix). Scoped to
  what a static read-through surfaced, not an exhaustive whole-repo refactor.
- [x] Full documentation (architecture, API, database, README, deployment, testing) — see the
  2026-08-08 entry above.
- [ ] Final manual + automated regression pass
- [ ] Security review (`.claude/docs/qa-checklist.md` full pass, all 🔴 items) — static/code-
  reading portion done this session (see the 2026-08-08 entry above); live/browser/second-account
  items explicitly deferred to the consolidated bulk-testing pass per this session's own
  prioritization instruction.
- [ ] **v1.0 released to production** 🎉

**MVP = 43 features across Days 2–6 (Day 1 and Day 7 are infra/hardening, not new features).**

---

## Post-MVP / Future scope — build only on explicit confirmation

Default rule (`docs/00_Project/Roadmap.md`, "Beyond v1.0"): build only after v1.0 ships. **Deviated
from on 2026-08-08 by explicit user decision** — Day 7's remaining checklist items were all
blocked on either a deferred live-testing pass or human-only release actions, with no more
concretely actionable MVP work available; the user explicitly chose (via AskUserQuestion) to start
Post-MVP work rather than wait. Priority among these is not fixed otherwise.

- [x] Rich Link Embeds (YouTube/Vimeo video embeds for bookmarks) — see the 2026-08-08 entry
  above. Not in the original list below (Website_Bookmarks.md pointed here for "future direction"
  with no dedicated doc); `docs/02_Development/Rich_Embeds.md` is the spec, written this round.
- [ ] Browser extension (one-click capture) — `docs/02_Development/Browser_Extension.md`
- [ ] Telegram notification channel — `docs/02_Development/Telegram.md`
- [ ] AI features — auto-summary, auto-tagging, duplicate detection, related items, smart collections — `docs/02_Development/AI.md`
- [ ] Semantic search — `docs/02_Development/Semantic_Search.md`
- [ ] RSS feed items as a Knowledge Item type — `docs/02_Development/RSS.md`
- [ ] GitHub repository items as a Knowledge Item type — `docs/02_Development/GitHub.md`
- [ ] Tweet/X post embeds — deliberately deferred from Rich Link Embeds above, see that entry and
  `docs/02_Development/Rich_Embeds.md`'s Out of Scope section for why

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
