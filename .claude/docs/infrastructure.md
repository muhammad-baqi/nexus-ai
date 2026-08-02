# Nexus — Infrastructure (authoritative)

> Accounts, env vars, and the background-job mechanism. Compute model (Fluid Compute, why not
> Edge Functions) and the dev/staging/prod environment table live in `docs/deployment-model.md`
> — this doc doesn't repeat that, it covers what that doc doesn't. Free-tier setup and cost
> minimization → `SETUP_CHECKLIST.md`.

---

## Accounts (see `SETUP_CHECKLIST.md` for the free-tier specifics)

| Service | Used for |
|---|---|
| GitHub | Source control, Actions CI |
| Vercel (Hobby) | Hosting — two projects: staging (tracks `staging`), production (tracks `main`) |
| Supabase | Two projects: `nexus-staging`, `nexus-prod` — Postgres + Auth + Storage |
| Resend | Transactional email — verification, password reset, reminder emails, export-ready notices |

No Stripe, no Cloudflare, no third-party storage — Supabase Storage covers PDFs/images/files/
avatars, and there's no payments surface in the MVP (`docs/00_Project/Scope.md`).

## Environment variables

```bash
# Supabase — per environment (local uses the Supabase CLI's local stack, not a third project)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, NEVER in a client bundle

NEXT_PUBLIC_APP_URL=              # http://localhost:3000 locally; the Vercel URL per environment

# Resend (needed from Day 6 — reminder emails, and Day 2 for verification/reset emails
# if not using Supabase Auth's built-in email sending)
RESEND_API_KEY=
RESEND_FROM=notifications@yourdomain.com
```

Set every variable in **both** Vercel projects' Environment Variables (Development / Preview /
Production tabs), scoped correctly — the staging Vercel project points at `nexus-staging`'s
Supabase keys, the production project at `nexus-prod`'s. Never commit `.env` or `.env.local` —
only `.env.example` with placeholders (enforced in `qa-checklist.md`).

## Background jobs — no separate queue service

Per `docs/03_Architecture/Tech_Stack.md`, background work (bookmark metadata fetch, PDF text
extraction, export/import processing, the reminder scheduler) runs as serverless functions
triggered on a schedule or via database triggers/webhooks — not a separately hosted queue.
Concretely, on Vercel:

- **Metadata fetch / PDF extraction**: triggered inline-but-async from the creating route
  handler (`POST /api/items`) via `after()` (Next.js's post-response background work API) or a
  fire-and-forget call to a dedicated route handler — either way, per CLAUDE.md rule #5, this
  must never block the response that creates the item.
- **Reminder scheduler**: a Vercel Cron job (`vercel.json`, e.g. every minute) hitting a
  `GET /api/cron/reminders` route handler that polls `reminders.next_fire_at` (indexed, per
  `docs/03_Architecture/Database_Schema.md`) and dispatches due emails via Resend.
- **Export / import**: enqueued from the Settings route handler, processed by a follow-up route
  handler invoked the same way as metadata fetch, with progress/completion tracked in a job-status
  row the frontend polls.

Protect any `/api/cron/*` route with a shared secret header (`CRON_SECRET` env var, checked
against Vercel's `Authorization: Bearer` header on cron-triggered requests) so it can't be hit
by an outside caller to spam reminder dispatch.

## Local dev

Docker Compose (`docker-compose.yml`, `Dockerfile`) runs the app in a Linux container matching
the Vercel runtime, per CLAUDE.md's "Local dev — Docker" section. For anything touching RLS,
Auth, or Storage, run the **Supabase CLI's local stack** (`supabase start`, needs Docker)
instead of a bare Postgres container — this is the free, fast, resettable dev loop; see
`SETUP_CHECKLIST.md` for why a third hosted Supabase project isn't needed.

**Start/stop discipline:** `supabase start` does not auto-stop — the local stack (Postgres,
Studio, Kong, Auth, Storage, etc., all suffixed `_nexus`) keeps running in Docker indefinitely
once started, across sessions, until explicitly stopped. Run `supabase stop` at the end of each
work session/day; run `supabase start` at the beginning of the next one. Don't leave it running
idle overnight — it holds a Postgres instance and several sidecars in memory for no benefit.

## Monitoring

- Vercel's function-invocation/duration/bandwidth dashboard.
- Supabase's connection-pool, query performance, and storage growth dashboards.
- Watch the `nexus-staging` / `nexus-prod` free-tier pause behavior (7 days with no API
  activity) — see `SETUP_CHECKLIST.md`'s gotcha note; not worth a keep-alive cron at this scale.
