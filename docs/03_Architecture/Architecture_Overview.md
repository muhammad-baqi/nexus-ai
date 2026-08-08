# Architecture Overview

> System-level view of how Nexus is actually built, as of Day 6. For the full API surface and
> data model, see `API_Design.md` and `Database_Schema.md`; this doc is the map that connects
> them. Stack rationale → `Tech_Stack.md`. Cross-cutting perf/security/a11y/reliability bar →
> `Non_Functional_Requirements.md`.

## Shape of the system

Nexus is a single Next.js 16 App Router application — no separate backend service. Route
Handlers under `app/api/**/route.ts` are the API layer; Server Components fetch data directly
(mostly via the Supabase client, occasionally by calling a Route Handler); Client Components
handle interactivity and call Route Handlers for mutations. Supabase provides Postgres, Auth,
and Storage as one coherent platform, with Row Level Security as the authorization layer — see
"Authorization" below.

```
Browser
  │
  ├─ Server Components (app/**/page.tsx)  ──────────┐
  │     fetch directly via a server-side              │
  │     Supabase client (cookie-based session)         ▼
  │                                              Supabase Postgres (RLS)
  ├─ Client Components (components/**)                 ▲  Supabase Auth
  │     fetch() → Route Handlers                        │  Supabase Storage
  │                                                      │
  └─ Route Handlers (app/api/**/route.ts) ───────────────┘
        zod-validate input → identify user from session
        → query/mutate via Supabase → JSON response
        → background work (if any) via after()
```

## Request lifecycle (a typical mutation)

1. A Client Component calls `fetch('/api/items', { method: 'POST', ... })`.
2. The Route Handler validates the request body with a zod schema (`lib/validation/*.ts`) —
   per `.claude/rules/api-routes.md`, this happens before any Supabase call, and a client-
   supplied user id is never trusted; identity always comes from `requireUser()`
   (`lib/supabase/server.ts`), which reads the session from cookies.
3. The handler performs the Supabase query/mutation using the request-scoped client (RLS
   applies automatically — see below), then returns a typed JSON response.
4. If the mutation has async side work that shouldn't block the response (bookmark metadata
   fetch, PDF text extraction, an export/import job, an activity-log write), it's enqueued via
   Next's `after()` API rather than run inline — see "Background work" below.

## Authorization: Postgres RLS, not application-layer checks

Every table holding user data has a Row Level Security policy defined in the same migration
that creates it (`.claude/rules/database.md`) — authorization is enforced at the database layer,
so even a bug in a Route Handler's own logic can't leak another user's data. Two ownership
shapes recur throughout the schema:

- **Direct ownership** — a table with its own `owner_id` column, policy `auth.uid() = owner_id`
  (e.g. `collections`, `knowledge_items`).
- **Transitive ownership** — a table with no `owner_id` of its own, scoped through a foreign key
  to a directly-owned row (e.g. `website_metadata`, `file_assets`, `reminders`, `share_links` are
  all scoped through `knowledge_item_id` → `knowledge_items.owner_id`).

The one deliberate exception: routes that are genuinely public or genuinely cross-user by design
(`GET /api/share/:token`, `GET /api/cron/reminders`) use a service-role Supabase client
(`lib/supabase/admin.ts`) that bypasses RLS — narrowly, and only in those two call sites, since
there's no user session to scope to in either case. See `API_Design.md` for exactly which routes
these are.

## Background work — serverless functions, not a hosted queue

Per `Tech_Stack.md`'s "keep infrastructure pieces to a minimum" rationale, there is no separately
hosted job queue. Background work runs one of two ways:

- **Fire-and-forget after the response** (`after()`, Next.js's post-response background-work
  API) — bookmark metadata fetch (`fetchBookmarkMetadata`), PDF text extraction
  (`extractPdfText`), activity-log writes (`logActivity`, best-effort/never-throws), and
  export/import job processing. Each of these is written to *never throw* into its caller
  (CLAUDE.md rule #7 — a failing enhancement never takes down the core feature it's attached to),
  and each has its own status column (`fetch_status`, `extraction_status`, job `status`) that the
  frontend polls until it resolves.
- **A scheduled Vercel Cron job** (`vercel.json`) hitting `GET /api/cron/reminders`, protected by
  a `CRON_SECRET` bearer-token check, which polls `reminders.next_fire_at` (indexed) and
  dispatches due reminders via Resend — with a claim step (`claimed_at`, an atomic
  `UPDATE ... RETURNING`) so two overlapping cron invocations can't double-send the same
  reminder, and a 24h grace period for missed reminders.

## File storage

Supabase Storage holds every binary asset (PDFs, images, general files, avatars, data-export/
import bundles) across private, RLS-scoped buckets (`{owner_id}/...` path convention) — nothing
is public by default. Large uploads (PDFs up to 50MB) go **directly from the browser to
Storage**, not through a Route Handler body, to avoid straining serverless function body-size
limits; the Route Handler that creates the corresponding `knowledge_items` row then
authoritatively re-validates the upload server-side (`lib/files/verify-upload.ts`): re-checks
declared size/type, fetches the first bytes via a signed URL + Range request, and sniffs the
real content against magic-byte signatures (`lib/files/sniff-content.ts`) before trusting the
client-declared MIME type. Downloads are served via freshly-signed, short-lived URLs
(`lib/files/signed-url.ts`), never a public bucket URL.

## Search

Full-text search runs inside Postgres — a `search_vector` `tsvector` column on `knowledge_items`,
maintained by a trigger (`knowledge_item_search_vector()`) that's been incrementally extended
(not duplicated) across several migrations to fold in tag names, PDF-extracted text, and code-
snippet content/language at different weights, then queried via `search_knowledge_items()`, a
Postgres function that also handles filtering (type/collection/tag/favorite/archived/date range)
and ranking. This keeps search co-located with the data it indexes rather than requiring a
separate search service, appropriate at this project's scale (see `Non_Functional_Requirements.md`
for the 500ms-at-5,000-items budget this is held to).

## Local dev vs. deployed environments

Local dev runs the whole stack in Docker (`docker-compose.yml`) — the Next.js app plus, when
needed, the Supabase CLI's local stack (`supabase start`) for anything touching RLS, Auth, or
Storage — so the dev runtime matches the Linux container Vercel actually runs, not whatever the
host OS happens to be. Staging and production are fully isolated: separate Vercel projects,
separate Supabase projects, separate env vars — see `DEPLOYMENT.md` for the full promotion flow
and `docs/deployment-model.md` for the Vercel compute model (Fluid Compute).
