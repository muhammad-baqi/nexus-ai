# Deployment Model — Vercel + Supabase

## Compute: use Fluid Compute, not Edge Functions

Vercel deprecated standalone Edge Functions as the recommended default over the
course of 2025. As of 2026:

- **Fluid Compute is on by default** for new Vercel projects and is the correct
  choice for this stack. It runs Node.js functions that can share a warm instance
  across concurrent requests (instead of one cold isolate per request), which is
  specifically valuable for I/O-bound work — waiting on Supabase queries, calling
  external APIs, streaming LLM responses.
- Default execution limit is 300 seconds on Fluid Compute (Pro/Enterprise can opt
  into an extended 1800s/30-minute beta for supported runtimes) — long enough for
  effectively any request in this stack, including long streaming responses. This
  answers the "is long-lived-function scalability possible" question directly: yes,
  and it's the default, not something you have to opt into or architect around.
- **Do not add `export const runtime = 'edge'`** to new route handlers. The Edge
  runtime still exists and still works (nothing breaks if you keep old Edge routes),
  but it's no longer the recommended path — you lose full Node.js API support and
  gain nothing at this project's scale. Reach for it only if you have a
  latency-critical, pure-transformation route running at very high RPS with no
  Node API needs — not the common case here.
- Routing Middleware (formerly "Edge Middleware") is a separate thing from
  standalone Edge Functions and is not deprecated — it now also runs on Fluid
  Compute under the hood.

## Environments

| Environment | Vercel | Supabase | Notes |
|---|---|---|---|
| Local | `next dev` | Local Supabase (or a shared dev project) | Fastest iteration loop |
| Preview | Auto preview deployment per PR | Dev/shared Supabase project | Used by the `run-qa` agent workflow |
| Staging | Separate Vercel project | Separate Supabase project (full data isolation) | Integration + regression validation before prod |
| Production | Separate Vercel project | Separate Supabase project | Real user data, protected secrets |

Full data isolation between staging and prod matters in practice, not just in
principle — it's what lets you run a stress test (e.g. a 5,000-row search
benchmark) on staging without any chance of it touching real user data.

## Secrets

- Supabase service-role key: server-side only, per environment, never in a client
  bundle. Rotate immediately on suspected compromise.
- LLM/third-party API keys: Vercel encrypted env vars, scoped per environment
  (development/preview/production).
- Anything that needs runtime admin-editability without a redeploy (e.g. payment
  gateway config) doesn't belong in env vars — store it encrypted at the application
  layer in Postgres instead, with the encryption key itself in a Vercel env var.

## Monitoring

- Vercel's function-invocation/duration/bandwidth dashboard.
- Supabase's connection-pool saturation, query performance, storage growth
  dashboards.
- Add an external uptime check (a lightweight Vercel Cron hitting a health endpoint)
  once there are real users — you want to find out about an outage before they do.

## When this stops being enough

If you hit a hard ceiling (function duration limits, connection-count limits) rather
than a cost ceiling, the next step is a dedicated compute layer (ECS/Fargate-style +
managed Postgres + a real queue), not a rewrite of the application logic. That's a
"replace the floor," not "redo the house" migration if the app layer stayed clean.
Don't build for that scale prematurely — Fluid Compute + Supabase auto-scales fine
for a single-project-scale product well past MVP.
