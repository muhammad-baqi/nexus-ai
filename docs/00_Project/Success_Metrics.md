# Success Metrics

## Purpose

These metrics define what "working" and "good" mean for Nexus, separate
from whether the code merely runs. They apply at two levels: the product
(does it do its job for a user) and the engineering exercise (does the
AI-driven SDLC actually function).

## Product-Level Metrics

**Capture speed.** Saving any Knowledge Item (note, bookmark, file)
should take under 10 seconds from intent to saved state, including
metadata fetch for bookmarks running asynchronously rather than blocking
the save.

**Retrieval speed.** A global search against a realistic dataset (up to
5,000 items, per the Thursday stress test) should return results in
under 500ms server-side.

**Retrieval accuracy.** A user searching by a remembered tag, partial
title, or content fragment should find the correct item within the first
page of results in the large majority of test cases.

**Data safety.** No accidental permanent data loss: everything deleted
goes to Trash first, and restore must work reliably.

**Reliability.** Core flows (auth, save, search, restore) should not
error under normal use; when something does fail, the user sees a clear
error state, not a blank screen or a stack trace.

## Engineering-Exercise Metrics

**SDLC completeness.** By the end of the week, the project should
demonstrate every stage listed in the Goals section of `Scope.md`:
auth, authorization, database design, storage, search, background jobs,
notifications, CI/CD, automated testing, deployment.

**Test coverage of critical paths.** Unit tests for business logic,
integration tests for API routes, and end-to-end tests for the primary
user journeys (register → create collection → save item → search →
find item) should all exist and pass in CI before any production
release.

**Release discipline.** Every production release (v0.1, v0.2, v1.0 RC,
v1.0) should be preceded by a passing staging deploy and QA pass — no
release skips the pipeline defined in `Roadmap.md`.

**Agent-to-human handoff quality.** Manual QA notes and agentic QA
reports for each day should be specific enough that a human reviewer can
understand what was tested and what passed/failed without re-deriving it
themselves.

## Non-Goals as Metrics

Metrics intentionally **not** tracked for v1.0, because the underlying
features are out of scope: collaboration engagement, multi-user
concurrency, payment conversion, mobile app installs, semantic search
relevance. Tracking these now would optimize for the wrong release.
