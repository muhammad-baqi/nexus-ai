# AI Dev Workflow — Claude Code Edition

A concrete, tool-specific dev workflow for nexus (and, once validated, prism):
`CLAUDE.md`, real Claude Code subagents, a **hand-written, day-by-day build
order** (`build-order-complete.md`) for spec-driven development, Docker for
local dev, and GitHub Actions wiring for automated review + QA. Modeled
directly on the Droplink project's workflow package — same mechanism
(always-loaded `CLAUDE.md` + on-demand docs + a `PROGRESS.md` source of truth
+ one-feature-per-branch `/ship-feature` self-merge loop), re-derived for
Nexus's actual PRD, stack, and day-based Roadmap instead of Droplink's
phase-based one.

## Status: process is ready, application code is not — that's expected

There is **no scaffolded Next.js app** in here — no `package.json`, no source
code. That's not a gap to fill by hand; it's Day 1 in `PHASES.md` /
`build-order-complete.md`, and it's a Claude Code task like any other once the
rest of this is in place.

## Read these first

- `SETUP_CHECKLIST.md` — Vercel/Supabase/GitHub account setup, how to keep the
  whole thing free, how to verify Fluid Compute is doing something.
- `PHASES.md` — Phase 0 (accounts, you) through Phase 5 (steady-state loop).
- `build-order-complete.md` — the actual per-feature build prompts, in order,
  day by day. This is the one you'll use the most.
- `PROMPTING_AND_SDD_GUIDE.md` — what spec-driven development means here (the
  hand-written loop, not OpenSpec) and prompt patterns that change output
  quality.
- `SKILLS.md` — how to add a skill you find, and what's recommended for this stack.

## What's in here

| File | Purpose |
|---|---|
| `CLAUDE.md` | Always-loaded brief — stack, non-negotiable rules, doc index, Docker commands. |
| `PROGRESS.md` | Source of truth for what's actually built — tick it as `/ship-feature` ships things. |
| `build-order-complete.md` | One copy-paste prompt per feature, in day-by-day build order. |
| `test-cases.md` | Per-feature concrete test cases, recorded during `/ship-feature`'s plan step. |
| `CONTRIBUTING.md` | Branch model (`develop` open/self-merge, `staging`/`main` human-only), review/QA pipeline |
| `PHASES.md` | Sequenced Phase 0–5 to take nexus from empty repo to running app |
| `SETUP_CHECKLIST.md` | Free-tier account setup, cost minimization, Fluid Compute test plan |
| `PROMPTING_AND_SDD_GUIDE.md` | The hand-written spec loop + concrete prompt patterns |
| `SKILLS.md` | How to install any skill you find, plus recommended ones for this stack |
| `RESEARCH_NOTES.md` | Sourced answers behind the earlier design decisions |
| `WORK_ITEM_NEXUS_VALIDATION.md` | The pilot-on-nexus, then-roll-out-to-prism work item |
| `Dockerfile` / `docker-compose.yml` | Local dev matching the Linux runtime prod actually runs on |
| `.claude/commands/ship-feature.md` | Plan → approve → branch → implement → self-review → verify → self-merge, one feature at a time |
| `.claude/commands/qa-gate.md` | Day/release completion gate against `.claude/docs/qa-checklist.md` |
| `.claude/agents/code-reviewer.md` | Review subagent — read-only, invoked locally by `/ship-feature` |
| `.claude/agents/qa-playwright.md` | QA subagent — drives real Playwright MCP browser sessions |
| `.claude/rules/api-routes.md`, `database.md` | Path-scoped conventions |
| `.claude/docs/git-workflow.md` | Full branch model, per-feature flow, fix path, promotion |
| `.claude/docs/testing.md` | Testing rhythm, `@smoke` convention, per-feature test-case discipline |
| `.claude/docs/qa-checklist.md` | Cross-cutting security/QA checklist, 🔴 = launch blocker |
| `.claude/docs/infrastructure.md` | Accounts, env vars, background-job mechanism, Docker/local dev |
| `.claude/hooks/verify.sh` | Stop hook — runs typecheck + tests after every turn |
| `.claude/settings.json` | Permission allow/deny list + the Stop hook wiring |
| `.githooks/pre-commit`, `pre-push` | Local guardrails — blocks direct commits/pushes to `staging`/`main` |
| `.mcp.json` | shadcn + Playwright MCP servers |
| `.github/workflows/claude-review.yml` | Informational review comment on push to `develop` (PR-triggered for `staging`/`main`) |
| `.github/workflows/claude-qa.yml` | Smoke suite on push to `develop`; full regression via subagent on push to `staging` |
| `.github/PULL_REQUEST_TEMPLATE.md` | Matches the CONTRIBUTING.md checklist (used for hotfixes/manual PRs) |
| `docs/deployment-model.md` | Dev/staging/prod + Fluid Compute specifics |
| `docs/skill-strategy.md` | Deeper reasoning: skills vs. subagents vs. MCP servers |
| `docs/00_Project` … `03_Architecture` | Nexus's PRD/architecture docs — the source of truth for *what* to build |

## Quick start

1. Unzip this into a new empty GitHub repo (or `git init` it directly).
2. Work through `SETUP_CHECKLIST.md` — Vercel Hobby, two free Supabase projects
   (`nexus-staging`, `nexus-prod`), GitHub repo, Claude Code CLI + subscription.
3. `git config core.hooksPath .githooks` — activates the local guardrails that
   block direct commits/pushes to `staging`/`main`.
4. From inside a Claude Code session, as a repo admin, say **"install the
   GitHub app"** — sets up `CLAUDE_CODE_OAUTH_TOKEN` as a repo secret in one step.
   Also add `STAGING_URL` once staging is deployed.
5. Install the skills in `SKILLS.md`.
6. Open `build-order-complete.md` and start at step 1 (machine setup) — it
   walks through scaffolding, Supabase, and every feature after that, in
   order, with `/ship-feature` doing the plan → implement → verify → self-merge
   loop for each one.
7. Watch `PROGRESS.md` fill in as features ship. Run `/qa-gate` before each
   release day (Tue/Thu/Sat/Sun per `docs/00_Project/Roadmap.md`).
8. Once this holds up over real commits, copy the core files into prism — see
   `RESEARCH_NOTES.md` §1 for the one structural difference (monorepo
   `apps/web` + `apps/admin`).
