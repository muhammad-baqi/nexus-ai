# Testing Guide

> Practical "how do I run the tests" reference. For the *authoring* discipline — when tests get
> written, how test cases get chosen, the `@smoke` convention — see `.claude/docs/testing.md`.
> This doc is about running what already exists, locally and in CI.

## Running everything, locally

All app commands run inside Docker so the test environment matches the Linux runtime Vercel
actually runs (per `CLAUDE.md`'s Docker-first rule):

```bash
docker compose up -d app                    # start the app container, if not already running

docker compose exec app npm run typecheck   # tsc --noEmit, whole repo
docker compose exec app npm run lint        # eslint
docker compose exec app npm test            # vitest run — every *.test.ts(x) in the repo
docker compose exec app npm run test:watch  # vitest, watch mode
```

Run a single test file or a subset:

```bash
docker compose exec app npx vitest run components/notes/note-editor.test.tsx
docker compose exec app npx vitest run --grep "autosave"
```

## End-to-end (Playwright)

Playwright specs live under `e2e/`. Most of them log in a real account and need local Supabase
running (`npx supabase start`) plus, on Windows/most host setups, running **inside** the
dockerized `playwright` compose service rather than a host-installed browser — a host browser
generally cannot resolve `host.docker.internal` to reach the app/Supabase containers, which
blocks the login step every real-account spec needs (this is a known environment gap, not a spec
bug — see `.claude/docs/infrastructure.md` if it resurfaces).

```bash
npx supabase start                          # needed for any spec that logs in / touches RLS

# Run the fast smoke suite (tagged @smoke — the critical-path flows)
docker compose --profile test run --rm playwright npx playwright test --grep @smoke --reporter=line

# Run a single spec
docker compose --profile test run --rm playwright npx playwright test e2e/reminders.spec.ts --reporter=line

# Full regression (every spec, not just @smoke)
docker compose --profile test run --rm playwright npx playwright test --reporter=line
```

Stop local Supabase when you're done (`npx supabase stop`) — it does not auto-stop.

## What CI runs (`.github/workflows/`)

Because feature work self-merges straight into `develop` without a PR gate
(`.claude/docs/git-workflow.md`), CI triggers on **push**, not pull request:

| Trigger | Workflow | What runs |
|---|---|---|
| Push to `develop` | `claude-review.yml` | `code-reviewer` subagent posts an informational comment — a second look after the agent's own self-review, not a merge gate |
| Push to `develop` | `claude-qa.yml` | The `@smoke` Playwright suite |
| Push to `staging` | `claude-qa.yml` | The full Playwright regression suite, via the `qa-playwright` subagent, against the deployed staging URL — this is the actual gate a human should read before promoting `staging → main` |

None of these gate the agent's own self-merge into `develop` — they're an independent second
check, not a blocker on the day-by-day build loop.

## Test-writing conventions (brief — full detail in `.claude/docs/testing.md`)

- Co-located: `foo.ts` → `foo.test.ts`, right next to the source file.
- One feature's tests are recorded as concrete cases in `test-cases.md` before being written —
  that file is the source of truth for what each test file is supposed to prove.
- Cross-cutting rules (RLS, no-info-leak on auth failures, error handling) are **not** re-tested
  per feature — they live once in `.claude/docs/qa-checklist.md`.
- Background jobs are tested by invoking the job function directly with a fake payload, not by
  waiting for a real cron trigger or a real third-party call (Resend, Supabase Storage are mocked
  at the boundary in unit tests).

## Known environment quirks (not app bugs)

- **Turbopack cold-compile flake**: a Playwright spec occasionally fails on the very first
  request after a fresh `docker compose up` while Turbopack is still compiling a route for the
  first time. If a spec fails in a way that looks unrelated to what you changed, stash your
  changes and re-run against a clean `develop` baseline before treating it as a real regression.
- **`docker compose down` right before `npm run typecheck`**: can surface a spurious
  `Cannot find module '.next/dev/...'`-style error on the very next command if the dev server's
  `.next` build was mid-write. Restart the app container (`docker compose restart app`) and
  retry rather than debugging it as a real type error.
- **Windows + local Supabase port conflicts**: `npx supabase start` can fail with
  `ports are not available ... 54322` on some Windows/Docker Desktop setups (a host networking
  quirk, not a Supabase or app issue). Retrying once, restarting Docker Desktop, or checking
  `netsh int ipv4 show excludedportrange protocol=tcp` for a reserved range covering that port
  are the usual fixes.
