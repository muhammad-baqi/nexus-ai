# Nexus — Testing Approach (authoritative)

> How we test. **Tests are authored per feature during the Verify step — never pre-written.**
> So at any point, the tests that exist = the features already built. The `code-reviewer`
> subagent's diff review is a *separate* advisory step and is NOT a test — see `git-workflow.md`.

---

## Tooling (decided — see `docs/03_Architecture/Tech_Stack.md`)

| Kind | Tool | Where |
|---|---|---|
| Unit / integration | **Vitest** | co-located `*.test.ts` next to the code |
| End-to-end (critical flows) | **Playwright** | `e2e/` (or `tests/e2e/`) |
| Type safety | `tsc --noEmit` | whole repo |

The Stop hook (`.claude/hooks/verify.sh`) runs `tsc` + `vitest` after every turn (inside Docker
where available) — a red build blocks finishing.

## Per-feature expectation — every feature owns its tests

**The rhythm is: feature → implement → dev-style edge-case tests in that feature's own file →
verify green → merge.** No feature merges into `develop` without its tests green.

Tests are **co-located**, one file per unit the feature touches (a feature may span a route + a
component — put a test file beside each; don't force everything into one file):

```
lib/search.ts                        → lib/search.test.ts
app/api/items/route.ts               → app/api/items/route.test.ts
components/notes/ChecklistItem.tsx    → components/notes/ChecklistItem.test.tsx
e2e/register-verify-login.spec.ts     (one @smoke end-to-end path per critical flow)
```

During the Verify step of `/ship-feature`:
1. **Enumerate this feature's own concrete test cases** into **`test-cases.md`** (the source of
   truth) — think like a developer building *that* feature and list what could break *for it
   specifically*, from its acceptance criteria in `docs/01_MVP/<Feature>.md` and its recipe in
   `build-order-complete.md`. **Not a generic template** — the cases differ every feature.
2. Write the co-located test file(s) implementing **exactly** those cases — `it(...)` name ↔ case.
   Append to `test-cases.md` any case you add, so doc and tests stay one-to-one. Run `tsc` +
   `vitest` — must be green.
3. **Drive the actual flow** (dev server / Playwright) — green units alone are not enough,
   especially for auth, RLS, and upload features: exercise the real path (another user's ID, an
   oversized file, a wrong password, a duplicate URL).

The user may **pre-seed or add** cases in `test-cases.md` before a feature is built — implement
those too.

### Do NOT re-test cross-cutting rules here

RLS ownership checks, no info leak on auth failures, error handling, background-job graceful
degradation — these are **cross-cutting**, the same across all features, and already owned by
`qa-checklist.md`. Reference those lines; don't copy them into every feature's file.
`test-cases.md` and each feature's test file are only about the cases **unique to that feature**.

## `@smoke` tag convention (set this up from day one)

Tag the handful of critical-path Playwright tests with `@smoke`:

```ts
test('register → verify → login → dashboard @smoke', async ({ page }) => { /* ... */ })
```

Reason: `claude-qa.yml` runs the fast `@smoke` suite on every push to `develop`, and the full
suite on every push to `staging`. Tagging now means CI works with zero retrofitting.

## What to test — read the checklist

`qa-checklist.md` is the map of *what must be true*; the test files *prove* it. 🔴 items are
launch blockers. You don't invent test cases from scratch — you turn checklist lines and
per-feature acceptance criteria (in `docs/01_MVP/*.md`) into tests.

## Notes

- Keep tests deterministic — no reliance on live external services in unit tests; mock
  Supabase Storage / Resend at the boundary. Background jobs (metadata fetch, PDF extraction,
  reminder scheduler, export/import) should be testable by invoking the job function directly
  with a fake payload, not only by waiting for a real cron trigger.
- The 5,000-item search performance test and the "hundreds of notes" stress test
  (`build-order-complete.md`, Days 3–4) are integration-level, not unit tests — seed the data,
  measure, assert against the 500ms budget in `docs/00_Project/Success_Metrics.md`.
