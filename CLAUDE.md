# Nexus — CLAUDE.md

> **This file is the always-loaded brief.** Keep it short and stable. Detail lives in
> `.claude/docs/*` and `docs/*` and is read on demand — see the pointer index at the bottom.
> When a doc and this file disagree, the doc wins.

## What this is

Nexus is a personal knowledge hub: one searchable home for everything a person wants to
remember — notes, website bookmarks, PDFs, images, files, code snippets — unified under a
single "Knowledge Item" model so tagging, favoriting, archiving, trash, and search all work
identically regardless of type. Full product framing → `docs/00_Project/`.

**Core promise:** save anything in under 10 seconds; find it again in under 5.

## Non-negotiable rules

1. **Authorization is enforced at the Postgres RLS layer**, not just in route handlers. No
   table holding user data goes live without an RLS policy in the same migration.
2. **Every route handler validates input with zod** before touching Supabase. Never trust a
   client-supplied user id — pull identity from the session.
3. **TypeScript strict mode** everywhere. No `any` without a comment justifying it, no
   `@ts-ignore` without a linked issue.
4. **Never swallow errors silently** — empty `catch` blocks are review-blocking. Fail loudly
   in dev, show a clean message in prod, log full detail server-side.
5. **Background work never runs inline** in the request/response cycle — metadata fetch, PDF
   extraction, export/import, reminders all go through a scheduled function or webhook.
6. **No secrets in code or in the client bundle.** All keys via environment variables;
   `NEXT_PUBLIC_`-prefixed vars must never contain a secret.
7. **A failing enhancement never takes down the core feature it's attached to** — bookmark
   screenshot, PDF text extraction, etc. degrade gracefully (see `Non_Functional_Requirements.md`).

## Build discipline

- **Build in the day-by-day order in `Roadmap.md`. Never jump ahead** to a later day's
  features before the current day's are shipped and the release for that day is out.
- **Test + commit after every feature** (each step in `build-order-complete.md`).
- **Update `PROGRESS.md`** whenever a feature ships — it's the source of truth for what's built.
- Read `PROGRESS.md` at the start of a work session before picking the next feature.

**How we build:** one feature = one branch off `develop`, via **`/ship-feature`**:
plan → you approve → branch `feature/dN-<name>` → implement → self-review (`code-reviewer`
subagent, advisory) → verify (`tsc` + `vitest` inside Docker + drive the flow in the browser)
→ squash-merge into `develop` → tick `PROGRESS.md` → delete branch. Day/release gates via
**`/qa-gate`**. A Stop hook runs typecheck + tests after every turn — a red build blocks
finishing.

**Git rule:** the agent works only on `feature/*` / `fix/*` / `chore/*` branches off `develop`
and **self-merges into `develop` — no PR needed for feature work.** **NEVER commit/merge/push
to `staging` or `main` — the human owns promotion**, on the cadence in `Roadmap.md` (daily
staging deploy, production every other day). Bugs go on a `fix/*` branch off `develop`. Full
flow → `.claude/docs/git-workflow.md`. Local git hooks enforce this — run
`git config core.hooksPath .githooks` once after cloning.

This repo no longer uses OpenSpec for day-to-day feature work — `build-order-complete.md`'s
per-feature prompts plus `/ship-feature`'s plan-approval gate are the spec mechanism now (see
`PROMPTING_AND_SDD_GUIDE.md`). The PRD in `docs/00_Project/` through `docs/03_Architecture/`
remains the source of truth for *what* to build; `build-order-complete.md` and `PROGRESS.md`
track *how much* of it is built.

## Tech stack (summary)

Next.js 16 App Router + TypeScript + Tailwind + **shadcn/ui (+ shadcn MCP)** · Supabase
(Postgres + Auth + Storage) — separate project per environment · Vercel (Fluid Compute,
default — don't add `export const runtime = 'edge'` to new routes) · Vitest + Playwright ·
Docker for local dev (matches the Linux runtime Vercel actually runs). Full stack rationale →
`docs/03_Architecture/Tech_Stack.md`. Deploy specifics → `.claude/docs/infrastructure.md`.

**Next.js 16 note:** middleware.ts is renamed `proxy.ts` (same runtime/purpose, see
`lib/supabase/proxy.ts` + root `proxy.ts`) — don't create a `middleware.ts` file.

## Local dev — Docker

```bash
docker compose up            # start full stack (app + local Postgres for quick iteration)
docker compose exec app sh   # shell into the app container
docker compose down          # stop
```

Use the Supabase CLI's local stack (`supabase start`, needs Docker) for anything touching RLS,
Auth, or Storage — see `.claude/docs/infrastructure.md`. Don't run the app natively outside
Docker beyond a quick syntax check. **`supabase start` doesn't auto-stop** — run
`supabase stop` at the end of each work session and `supabase start` at the beginning of the
next; don't leave the local stack running idle overnight.

## Common commands

```bash
docker compose exec app npm run dev                          # dev server
docker compose exec app npm test                             # unit/integration tests (Vitest)
docker compose exec app npm run lint                          # lint
docker compose exec app npm run typecheck                     # tsc --noEmit
docker compose exec app npx playwright test --grep @smoke    # smoke tests
npm run build                                                  # production build — run before calling a task "done"
```

## Code conventions

**Naming & structure**
- Descriptive over short: `getActiveUsers()` not `getUsr()`. Booleans read as a question:
  `isValid`, `hasPermission`.
- One function does one thing; prefer early returns; max ~3 levels of nesting.
- Files/folders: match the existing case convention within a directory.

**Next.js-specific**
- App Router: route handlers in `app/**/route.ts`, server components by default —
  `"use client"` only when the component needs interactivity/hooks.
- Data fetching in Server Components or Route Handlers, not client-side `useEffect` fetches,
  unless there's a specific reason.
- Server Actions for mutations where practical.
- `next/image` and `next/link` — no raw `<img>`/`<a>` without a specific reason.

**Tests**
- New logic needs a test; bug fixes need a regression test that fails before the fix.
- Test file lives next to the source: `foo.ts` → `foo.test.ts`.
- Tag critical-path Playwright tests `@smoke`.
- This feature's own concrete test cases are recorded in `test-cases.md` during `/ship-feature`
  — see `.claude/docs/testing.md`. Cross-cutting rules (RLS, no info leak, error handling) live
  in `.claude/docs/qa-checklist.md` — don't re-test those per feature.

**Comments & git hygiene**
- Comment *why*, not *what*. TODOs reference an issue: `// TODO(#123): handle pagination`.
- Commit messages: imperative, present tense — `"Add retry logic"`.
- No committed secrets/`.env` files — use `.env.example` with placeholders.

## What Claude Code should NOT do

- Don't push directly to `staging` or `main` — ever.
- Don't install new dependencies without flagging it when you report the feature back.
- Don't touch `.github/workflows/*` unless explicitly asked.
- Don't skip or delete failing tests to make the build pass.
- Don't build anything from a later day in `Roadmap.md` before the current day's features ship.

## Agents & review/QA

- `code-reviewer` (`.claude/agents/code-reviewer.md`) — read-only diff review, invoked locally
  during `/ship-feature`'s self-review step. Advisory, never a merge gate.
- `qa-playwright` (`.claude/agents/qa-playwright.md`) — drives a real browser against a
  preview/staging URL to verify acceptance criteria. Used in CI on push to `staging` and
  on demand for anything that needs browser-level proof.
- CI (`.github/workflows/`): an informational review comment posts on push to `develop`; a
  Playwright smoke suite (`@smoke`) also runs on push to `develop`; the full regression suite
  via `qa-playwright` runs on push to `staging`. None of these gate the agent's own
  self-merge — they're a second, independent check.

## Doc index — read on demand

| When you're working on… | Read |
|---|---|
| What Nexus is, who it's for, why | `docs/00_Project/Mission.md`, `Vision.md`, `Personas.md` |
| What's in/out of scope right now | `docs/00_Project/Scope.md` |
| The day-by-day build/release cadence | `docs/00_Project/Roadmap.md` |
| What "done" means, product & engineering | `docs/00_Project/Success_Metrics.md` |
| A specific MVP feature's exact behavior | `docs/01_MVP/<Feature>.md` (see `build-order-complete.md` for the mapping to build steps) |
| System design at a glance — request flow, auth, background jobs | `docs/03_Architecture/Architecture_Overview.md` |
| Tech choices and why | `docs/03_Architecture/Tech_Stack.md` |
| Data model / RLS | `docs/03_Architecture/Database_Schema.md`, `.claude/rules/database.md` |
| API route shape | `docs/03_Architecture/API_Design.md`, `.claude/rules/api-routes.md` |
| Cross-cutting perf/security/a11y/reliability bar | `docs/03_Architecture/Non_Functional_Requirements.md` |
| Branches, per-feature git flow, fix path, promotion | `.claude/docs/git-workflow.md` |
| Testing approach, per-feature tests, `@smoke` tags | `.claude/docs/testing.md` |
| Running the test suite locally and in CI | `docs/TESTING.md` |
| The actual per-feature test-case lists (source of truth) | `test-cases.md` |
| A day/release QA gate | `.claude/docs/qa-checklist.md` |
| Env vars, accounts, Vercel/Supabase/Docker deploy specifics | `.claude/docs/infrastructure.md` |
| The actual deploy/promotion sequence, migrations, rollback | `docs/DEPLOYMENT.md` |
| How to prompt, and the (no-longer-OpenSpec) spec loop | `PROMPTING_AND_SDD_GUIDE.md` |
| Installed/recommended skills | `SKILLS.md` |
| What's built / what's next | `PROGRESS.md` |
| The exact per-feature build steps and prompts | `build-order-complete.md` |
| Free-tier account setup, cost minimization | `SETUP_CHECKLIST.md` |
| Getting from empty repo to first deploy | `PHASES.md` |
