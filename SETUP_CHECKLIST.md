# Setup Checklist — Free/Near-Free Nexus Environment

Goal: run the full dev/staging/prod loop from `docs/deployment-model.md` on a
dummy project for close to $0. This is realistic on current free tiers — here's
exactly how.

## Vercel

- Sign up for the **Hobby** plan (free, no card required).
- Hobby is scoped to "personal, non-commercial" use — a practice/dummy project
  like nexus is squarely inside that. If nexus later starts generating revenue or
  real users, that's the trigger to move to Pro ($20/mo), not before.
- Hobby includes, as of mid-2026: 100GB data transfer, 1M function invocations,
  **Fluid Compute enabled by default** with ~4 hours of Active-CPU included per
  month. Function duration cap is 60s on Hobby (vs 300s default / up to 30 min
  beta on Pro) — irrelevant for nexus, which has no long-running LLM streaming
  route the way Prism does.
- Create **two Vercel projects** from the same repo: one tracking `staging`, one
  tracking `main`. Both free under Hobby.
- Preview deployments (one per PR, auto) are included and are what the `run-qa`
  GitHub Action targets — no extra cost or setup.

## Supabase

- Free plan gives you **2 active projects** total (org-wide, across anything
  you're Owner/Admin on). Use them for `nexus-staging` and `nexus-prod`. For
  local dev, run the **Supabase CLI** (`supabase start`, needs Docker) instead of
  a third hosted project — that's free and unlimited, and is genuinely the better
  dev-loop anyway (faster, no network round trip, easy to reset).
- Free-tier limits that matter for a dummy project: 500MB database, 1GB file
  storage, 50k MAU, 5GB egress. Nexus won't get near these.
- **The one real gotcha:** free projects pause after 7 days with no API activity.
  For a project you're actively building on, this basically never triggers. If
  you go quiet for a week, log into the Supabase dashboard and click unpause —
  one click, no data loss (paused projects are restorable for up to a year). Not
  worth building a keep-alive cron for a dummy project; that's solving a problem
  you don't have yet.

## GitHub

- Free — a standard repo, private or public, either works. Private is more
  sensible even for a dummy project since it'll have real (if fake) env vars in
  its history/config.
- GitHub Actions minutes: free tier is 2,000 min/month for private repos,
  unlimited for public. The two workflows in this package are short-lived
  (single Claude Code invocation + npm install), so this won't be a binding
  constraint at solo-dev scale.
- **Run `git config core.hooksPath .githooks` right after cloning.** This
  activates the local guardrails (`.githooks/pre-commit`, `pre-push`) that
  hard-block direct commits/pushes to `staging`/`main` and enforce branch
  naming — the actual mechanism behind `develop` being self-merge-safe. See
  `.claude/docs/git-workflow.md`.

## Claude Code

- Requires a Pro or Max subscription to use interactively and to generate
  `CLAUDE_CODE_OAUTH_TOKEN` for the GitHub Actions. Pro is enough to start; Max
  matters more once you're running review/QA agents on every PR across two repos.
  This is the one piece of the stack that isn't free — there's no way around
  that, since it's Claude doing the actual work.

## Net result

Vercel: $0. Supabase: $0. GitHub: $0. Claude Code: whatever subscription tier you
already decided on. That's the whole cost surface for validating the workflow on
nexus.

## Testing Fluid Compute on this dummy project

Yes — and it costs nothing extra, since it's the Hobby default. The concrete way
to actually confirm it's doing something (not just "trust the docs"):

1. Pick a route handler that does at least one real I/O wait — e.g. a Supabase
   query in a list endpoint (`GET /api/items` from the API design doc is a good
   candidate once it exists).
2. Fire 5–10 concurrent requests at it against the Vercel preview URL (a simple
   script with `Promise.all` + `fetch`, or `npx autocannon <url> -c 10 -d 5` for a
   quick concurrency burst).
3. Check the Vercel dashboard's function invocation view: with Fluid Compute
   working, you should see those concurrent requests served by fewer function
   instances than the request count (shared warm instances), not one cold
   instance spun up per request.
4. That's the actual signal — "did concurrency get shared" — not just "did the
   request succeed," since a traditional serverless model would also succeed,
   just with more cold starts and higher cost per request at scale.

This is a fine thing to do once Phase 4 in `PHASES.md` is reached — no need to
do it before there's a real route handler to point it at.
