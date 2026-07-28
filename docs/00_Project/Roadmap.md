# Roadmap

## Overview

The MVP is built on a compressed one-week cadence, structured to mimic how
a small, disciplined engineering team would actually ship a product:
continuous development, daily staging deploys, and production releases
every other day. Each day carries a specific product theme, and every
feature moves through the same pipeline: product definition, AI
implementation, AI-generated tests, manual QA, agentic QA, bug fixing,
staging deploy, and — on release days — production deploy.

## Release Cadence

| Day       | Staging | Production        |
|-----------|---------|--------------------|
| Monday    | ✅      | —                  |
| Tuesday   | ✅      | ✅ v0.1            |
| Wednesday | ✅      | —                  |
| Thursday  | ✅      | ✅ v0.2            |
| Friday    | ✅      | —                  |
| Saturday  | ✅      | ✅ v1.0 Release Candidate |
| Sunday    | ✅      | ✅ v1.0            |

## Day-by-Day Themes

**Monday — Foundation.** Repository, hosting, CI/CD, database schema,
design system, and component library are established. Nothing
user-facing ships; this is infrastructure only.

**Tuesday — Core Platform (v0.1).** Authentication, profile, collections,
navigation, dashboard shell, and theming. First production release: a
user can register, log in, create collections, and navigate the app.

**Wednesday — Knowledge Management.** Full note CRUD, rich/Markdown
editor, autosave, tags, favorites, archive, and trash. Stress-tested by
an agent creating hundreds of notes.

**Thursday — Search & Organization (v0.2).** Global search, filtering,
sorting, dashboard widgets, recent items, statistics. Stress-tested with
5,000 generated notes to validate latency and pagination.

**Friday — Knowledge Sources.** Website bookmarking with metadata
fetch, file and PDF uploads, background metadata jobs. Stress-tested with
bulk imports of websites and files.

**Saturday — Polish (v1.0 Release Candidate).** Settings, notifications,
reminders, activity log, version history, accessibility pass, error and
empty states, logging and analytics. Full Playwright regression and a
Lighthouse performance/accessibility audit.

**Sunday — Production (v1.0).** Bug fixing, refactoring, full
documentation (architecture, API, database, README, deployment, testing),
final manual and automated regression, security review, and the v1.0
production release.

## Detailed Day Plans

Full day-by-day breakdowns (features, backend work, QA activities, and
release criteria) live in the project's engineering runbook, generated
alongside this documentation set. Each day's plan follows the same
internal structure:

1. Product — what's being built and why
2. Engineering — implementation work
3. AI Tasks — what agents generate autonomously
4. QA — automated and manual verification
5. Ship — staging deploy, and production release where scheduled

## Beyond v1.0

Once v1.0 ships, subsequent work moves out of the daily-release cadence
and into normal iterative development against the backlog described in
`02_Development/`. Priority among those future items (browser extension,
Telegram notifications, AI features, semantic search, RSS, GitHub items)
is not fixed yet and should be revisited based on v1.0 usage.
