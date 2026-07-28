# Phases — Nexus, Day 1 to First Deploy

Straight answer to "is the entire repo ready": **no, not yet** — what exists today
(from `nexus.zip`) is planning docs plus this workflow package. There is zero
application code — no `package.json`, no Next.js app, nothing runnable. That's
normal and expected; scaffolding the app is Phase 1 below, and it's a Claude Code
task like any other, not something you do by hand first.

This replaces the generic "Planning → Implementation → Verification → Review"
loop from the original draft with actual, sequenced steps for getting nexus off
the ground specifically.

## Phase 0 — Accounts and local tooling (you do this, ~20–30 min)

Nothing here is Claude's job — it's account creation and secrets, so it's yours.
See `SETUP_CHECKLIST.md` for the exact free-tier setup and cost-minimization
choices.

1. GitHub repo created (empty is fine).
2. Vercel account (Hobby/free), not yet connected to the repo.
3. Supabase account, two free projects created: `nexus-staging`, `nexus-prod`.
4. Claude Code CLI installed locally, logged into your Pro/Max subscription.
5. `CLAUDE_CODE_OAUTH_TOKEN` generated and saved as a GitHub repo secret (or just
   run `/install-github-app` from inside Claude Code once the repo exists — it
   does steps 4–5 of the GitHub Action wiring for you).

## Phase 1 — Scaffold (Claude's first real task)

This is the first thing you actually ask Claude to do, once the repo above exists
and you've dropped in `CLAUDE.md`, `.claude/`, `.github/`, `CONTRIBUTING.md`,
`docs/` from this package plus the original `nexus/docs/` PRD folder:

> "Scaffold this Next.js App Router project per `docs/03_Architecture/Tech_Stack.md`
> — TypeScript, Tailwind, shadcn/ui, Supabase client setup for both environments,
> Vitest, Playwright, ESLint/Prettier config. Don't build any features yet, just
> the skeleton, and confirm `npm run dev` and `npm run build` both work."

Install the shadcn skill and the Next.js/Supabase skill bundle at this point too
(see `docs/skill-strategy.md`) — right before you need them, not before.

## Phase 2 — Wire up Supabase

- Run the Supabase CLI locally for schema work (`supabase init`, `supabase start`)
  — this is your dev environment, so you don't need a third hosted project.
- Ask Claude to generate the first migration from `docs/03_Architecture/Database_Schema.md`,
  including RLS policies in the same migration (per `.claude/rules/database.md`).
- Push schema to `nexus-staging` via the Supabase CLI once it's verified locally.

## Phase 3 — First vertical slice

Pick the smallest real feature from `docs/01_MVP/` (Authentication is the natural
first slice — everything else depends on it; it's Day 2, step 6 in
`build-order-complete.md`). Run **`/ship-feature`**: it reads the feature's doc,
proposes a plan + test cases and waits for your approval, then branches →
implements → self-reviews → verifies → self-merges into `develop` — see
`.claude/docs/git-workflow.md`. No PR needed for this step; `develop` is open.

## Phase 4 — Connect Vercel, confirm Fluid Compute

- Import the repo into Vercel as two projects: `nexus-staging` (tracks `staging`
  branch) and `nexus` production (tracks `main`).
- Confirm Fluid Compute is active (it's default — nothing to turn on) and do one
  concrete test: hit a route handler with a handful of concurrent requests locally
  or via the preview URL and confirm it behaves — see `SETUP_CHECKLIST.md` §Fluid
  Compute test for the exact minimal way to do this on a dummy project.

## Phase 5 — Full loop, repeat

From here it's `build-order-complete.md` on repeat: `/ship-feature` per item, day
by day, self-merging into `develop`; you promote `develop → staging` on the
daily cadence and `staging → main` on release days
(`docs/00_Project/Roadmap.md`), running `/qa-gate` before each. This is also
where `WORK_ITEM_NEXUS_VALIDATION.md`'s acceptance criteria get checked off.
