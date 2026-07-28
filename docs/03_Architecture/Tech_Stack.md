# Technology Stack

## Frontend
- **Next.js** (App Router) — routing, server components, and route
  handlers in one framework
- **React** — UI components
- **TypeScript** — type safety across the codebase
- **Tailwind CSS** — utility-first styling
- **shadcn/ui** — accessible, unstyled-by-default component primitives
  layered with Tailwind

## Backend
- **Next.js Route Handlers** — API layer, co-located with the frontend
  rather than a separate service, appropriate for this project's scale
- **Supabase PostgreSQL** — primary relational database
- **Supabase Auth** — authentication, session management
- **Supabase Storage** — file/object storage for PDFs, images, files,
  avatars

## Infrastructure
- **Vercel** — hosting for both Staging and Production, as separate
  environments/projects
- **Separate Supabase projects for staging and production** — full data
  isolation between environments, so staging stress-tests (e.g., the
  5,000-note search benchmark) never touch production data
- **GitHub** — source control
- **GitHub Actions** — CI/CD pipeline (lint, type-check, test, deploy)

## Testing
- **Vitest** — unit and integration tests
- **Playwright** — end-to-end browser tests
- **ESLint** — static analysis / linting
- **Prettier** — formatting

## Rationale

This stack is chosen to minimize the number of moving infrastructure
pieces (one hosting provider, one backend-as-a-service provider) while
still exercising every architectural concern in `Scope.md`'s Goals
section: auth, authorization, relational data modeling, file storage,
background jobs, search, and CI/CD. Supabase in particular is chosen
because it provides Postgres, Auth, and Storage as one coherent
platform with Row Level Security as a first-class primitive, which maps
directly onto this project's authorization requirements without needing
a separately built authorization layer.

## Background Jobs

Background job needs (bookmark metadata fetching, PDF text extraction,
export/import processing, reminder scheduling) are handled via
serverless functions triggered on a schedule or via database
triggers/webhooks, rather than a separately hosted job-queue service —
consistent with keeping infrastructure pieces to a minimum for a project
of this scope. If job volume or complexity outgrows this approach post-
MVP, introducing a dedicated queue (e.g., a hosted queue service) is a
reasonable evolution, but is not required to hit v1.0.
