# Nexus

A personal knowledge hub — one searchable home for notes, website bookmarks, PDFs, images,
files, and code snippets, unified under a single "Knowledge Item" model so tagging, favoriting,
archiving, trash, and search all work identically regardless of type.

**Core promise:** save anything in under 10 seconds; find it again in under 5.

See `docs/00_Project/Mission.md` / `Vision.md` for the full product framing.

## Status

Days 2–6 of the MVP build (`docs/00_Project/Roadmap.md`) are code-complete on `develop` — see
`PROGRESS.md` for the exact, currently-shipped feature list. Day 7 (this pass) is documentation,
a bug-fixing/refactor sweep, and the final security review ahead of the v1.0 release.

## Tech stack

Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Auth +
Storage), separate project per environment · Vercel (Fluid Compute) · Vitest + Playwright ·
Docker for local dev, matching the Linux runtime Vercel actually runs. Full rationale →
`docs/03_Architecture/Tech_Stack.md`. System design → `docs/03_Architecture/Architecture_Overview.md`.

## Quick start (local dev)

Prerequisites: Docker, the [Supabase CLI](https://supabase.com/docs/guides/cli), Node.js (only
needed for the CLI itself and `supabase` commands — the app runs inside Docker).

```bash
git clone <this repo> && cd ai-dev-workflow
cp .env.example .env.local        # fill in real values — see docs/DEPLOYMENT.md
git config core.hooksPath .githooks   # activates local guardrails (blocks direct staging/main pushes)

npx supabase start                # local Postgres + Auth + Storage stack (needed for RLS/Auth/Storage work)
docker compose up                 # app on http://localhost:3000

docker compose exec app npm run dev        # (already running via `docker compose up`)
docker compose exec app npm test           # unit/integration tests
docker compose exec app npm run typecheck  # tsc --noEmit
docker compose exec app npm run lint
npx playwright test --grep @smoke          # or via the dockerized `playwright` compose service — see docs/TESTING.md
```

Stop cleanly at the end of a session: `docker compose down` and `npx supabase stop` — the local
Supabase stack does not auto-stop.

Full local-dev walkthrough (first-time setup, account creation, cost minimization) →
`SETUP_CHECKLIST.md`. Deploying to staging/production → `docs/DEPLOYMENT.md`.

## Documentation map

| Doc | Covers |
|---|---|
| `CLAUDE.md` | Always-loaded engineering brief — non-negotiable rules, conventions, doc index |
| `docs/00_Project/` | Mission, vision, personas, scope, roadmap, success metrics |
| `docs/01_MVP/<Feature>.md` | Exact behavior spec per MVP feature |
| `docs/03_Architecture/Architecture_Overview.md` | System design — request flow, auth, background jobs, data model at a glance |
| `docs/03_Architecture/API_Design.md` | The actual API surface, reconciled against what was built |
| `docs/03_Architecture/Database_Schema.md` | The actual database schema, RLS, and Storage buckets, reconciled against what was built |
| `docs/03_Architecture/Tech_Stack.md`, `Non_Functional_Requirements.md` | Stack rationale; perf/security/a11y/reliability bar |
| `docs/TESTING.md` | How to run the test suite locally and in CI |
| `docs/DEPLOYMENT.md` | Environments, env vars, the promotion flow, monitoring |
| `PROGRESS.md` | Source of truth for what's actually built |
| `build-order-complete.md` | The day-by-day build prompts (source-of-truth build order) |
| `test-cases.md` | Per-feature concrete test cases |
| `.claude/docs/qa-checklist.md` | Cross-cutting security/QA checklist — 🔴 = launch blocker |
| `.claude/docs/git-workflow.md` | Branch model, per-feature flow, promotion |
| `PROMPTING_AND_SDD_GUIDE.md`, `SKILLS.md` | How this repo is built with Claude Code — prompting patterns, installed skills |

## How this repo is built

One feature = one branch off `develop`, via **`/ship-feature`**: plan → human approves → branch
→ implement → self-review → verify (typecheck + tests + a driven-through flow) → squash-merge
into `develop` → tick `PROGRESS.md` → delete branch. The agent works only on `feature/*`/`fix/*`/
`chore/*` branches and never touches `staging`/`main` — a human owns promotion, enforced by local
git hooks (`.githooks/`) and `.claude/settings.json`. Full flow → `.claude/docs/git-workflow.md`.
