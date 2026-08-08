# Deployment Guide

> Practical "how do I actually deploy this" reference. For the compute model rationale (Fluid
> Compute vs. Edge Functions) see `docs/deployment-model.md`; for the branch/promotion rules
> themselves see `.claude/docs/git-workflow.md`; for account setup from scratch see
> `SETUP_CHECKLIST.md`. This doc ties those together into one sequence.

## Environments

| Environment | Vercel project | Supabase project | Domain/branch |
|---|---|---|---|
| Local | `next dev` in Docker | Local CLI stack (`npx supabase start`) | `localhost:3000` |
| Staging | Separate Vercel project | `nexus-staging` | tracks `staging` branch |
| Production | Separate Vercel project | `nexus-prod` | tracks `main` branch |

Full data isolation between `nexus-staging` and `nexus-prod` is load-bearing, not incidental — it's
what lets a stress test (e.g. the 5,000-item search benchmark) run against staging with zero risk
to real user data.

## Environment variables

See `.env.example` for the full list with explanations. Set every variable in **both** Vercel
projects' Environment Variables settings (Development/Preview/Production tabs), scoped so the
staging Vercel project points at `nexus-staging`'s Supabase keys and the production project at
`nexus-prod`'s — never share a Supabase project's keys across environments.

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Before any release, grep the built output to
confirm it never reached the client bundle (`.claude/docs/qa-checklist.md`'s 🔴 item):

```bash
docker compose exec app npm run build
grep -r "service_role" .next/static 2>/dev/null && echo "LEAK — investigate before shipping" || echo "clean"
```

## Database migrations

Migrations live in `supabase/migrations/`, applied in filename order. Push a new migration to a
hosted project (never edit a hosted schema by hand):

```bash
npx supabase link --project-ref <nexus-staging-or-prod-project-ref>
npx supabase db push
```

Push to `nexus-staging` as part of normal feature work (whenever a feature adds a migration);
push to `nexus-prod` only as part of a release, after the same migration has already been running
on staging without issue. Confirm RLS is actually active on every new table in the Supabase
dashboard after pushing — not just by reading the migration file (`.claude/docs/qa-checklist.md`).

## The promotion flow (human-only — the agent never touches `staging`/`main`)

```bash
# develop -> staging, on the daily cadence (docs/00_Project/Roadmap.md) or whenever a batch is ready
git checkout staging && git pull origin staging
git merge develop && git push origin staging
# → triggers claude-qa.yml's full Playwright regression against the deployed staging URL,
#   and a Vercel staging deploy

# staging -> main, on release days (Tue/Thu/Sat/Sun per Roadmap.md)
git checkout main && git pull origin main
git merge staging && git tag vX.Y.Z && git push origin main --tags
# → triggers a Vercel production deploy

# sync main back into develop so nothing from a hotfix is lost
git checkout develop && git merge main && git push origin develop
```

Read `claude-qa.yml`'s full-regression result on `staging` before promoting to `main` — that run
is the actual pre-release gate, not just an FYI. `.githooks/` and `.claude/settings.json` both
hard-block the agent from pushing to `staging`/`main` directly, so this sequence is always a
human, run locally or via `gh`.

## First deploy of a new environment

1. Create the Vercel project, connect it to this repo, set it to track the right branch
   (`staging` or `main`).
2. Create the Supabase project (`nexus-staging` or `nexus-prod`), then `supabase db push` every
   migration in order.
3. Set every env var from `.env.example` in that Vercel project.
4. Set `CRON_SECRET` as an env var in the Vercel project — Vercel automatically sends it as the
   `Authorization: Bearer` header on requests it makes to `vercel.json`'s cron path, and the
   route handler checks the incoming header against this same env var.
5. If using Resend for real (not just the graceful no-key degradation path): create a Resend
   account, verify a sending domain, set `RESEND_API_KEY`/`RESEND_FROM`.
6. Deploy, then run the pre-release sign-off checklist in `.claude/docs/qa-checklist.md`
   ("Pre-release sign-off" section) against the live URL before calling it done.

## Monitoring

- Vercel's function-invocation/duration/bandwidth dashboard per project.
- Supabase's connection-pool, query-performance, and storage-growth dashboards per project.
- `nexus-staging`/`nexus-prod`'s free-tier pause behavior (paused after 7 days with no API
  activity) — not worth a keep-alive cron at this scale; just be aware a long-idle staging
  project needs an unpause before its next use (see `SETUP_CHECKLIST.md`).

## Rollback

Vercel keeps every deployment; promote a previous deployment back to production from the Vercel
dashboard (or `vercel rollback`) if a release regresses. For a schema change that needs to be
rolled back, write a new forward migration that reverses it — this repo doesn't use down-
migrations; `supabase db push` is always forward-only.
