# Work Item: Validate AI-Assisted Dev Workflow on Nexus, then Roll Out to Prism

**Type:** Infrastructure / process
**Status:** Ready to start
**Owner:** [you]

## Summary

I've built a concrete, Claude-Code-specific implementation of the AI dev workflow
(spec-driven development: PRD → CLAUDE.md + subagents + toggleable review/QA agents
→ implementation) — see `ai-dev-workflow/` in this repo. Nexus is the pilot: a
dummy project structurally identical to prism's stack (Next.js + Vercel + Supabase),
low-stakes, disposable if something needs to be redesigned. Once the workflow holds
up under a real stretch of commits on nexus, the same package copies into prism
with minimal changes (see `RESEARCH_NOTES.md` §1 for the one real difference —
prism's monorepo with `apps/web` + `apps/admin`).

## Why nexus first, not prism directly

Prism is the real project — mistakes there cost more, and validating process
changes against the thing you actually care about is how process debt sneaks in.
Nexus exercises the same architectural surface (auth, RLS-based authorization,
relational data modeling, file storage, background jobs, search, CI/CD) at a scale
small enough that a broken workflow is cheap to notice and fix.

## What "validated" means here — acceptance criteria

- [ ] `CLAUDE.md` loads correctly and Claude's output actually reflects it
      (verify with `/memory` in a session — confirm the file is listed as loaded).
- [ ] `.claude/rules/api-routes.md` and `database.md` load only when their path
      patterns are touched (verify by editing a file outside those paths and
      confirming Claude doesn't reference the rule).
- [ ] At least 5 real feature/fix branches merged through the full loop:
      `feature/<x>` → PR against `develop` → build/lint/test pass → merge.
- [ ] The `run-review` label reliably triggers `.github/workflows/claude-review.yml`
      and posts a review comment using the `code-reviewer` subagent's format.
- [ ] The `run-qa` label reliably triggers `.github/workflows/claude-qa.yml`,
      resolves a real Vercel preview URL, and the `qa-playwright` subagent produces
      a pass/fail report grounded in an actual browser session (not a guess from
      reading code — spot-check this).
- [ ] At least one `develop` → `staging` and one `staging` → `main` promotion completed
      via the branch model in `CONTRIBUTING.md`, with separate Supabase projects
      confirmed genuinely isolated (staging data doesn't touch prod).
- [ ] Fluid Compute confirmed working for at least one route with realistic
      concurrent load (doesn't need to be a formal load test — a handful of
      concurrent requests during dev is enough to confirm no surprises).
- [ ] You've run the loop enough to know the token/cost overhead is acceptable —
      i.e. `run-review`/`run-qa` aren't being triggered on every trivial PR, per
      the guidance in `CONTRIBUTING.md`.

## Explicitly out of scope for this pass

- Prism-specific work. Nothing in prism changes until nexus is validated.
- Writing actual Playwright `.spec.ts` regression tests beyond what the QA
  subagent produces incidentally — that's a separate, ongoing task, not a
  blocker for validating the workflow itself.
- Deciding whether to revisit prism's existing `runtime = 'edge'` chat-streaming
  route (flagged in `RESEARCH_NOTES.md` §4) — that's a prism-specific
  architecture decision to make once we're actually working in that repo, not
  part of validating the process on nexus.

## Rollout to Prism (next work item, after this one closes)

1. Copy `CLAUDE.md`, `CONTRIBUTING.md`, `.claude/`, `.github/` from the validated
   nexus setup into prism's repo root.
2. Adjust `CLAUDE.md` stack section for the monorepo layout (`apps/web`,
   `apps/admin`) and add prism-specific conventions (persona/content policy
   constraints from the PRD, the payment-gateway adapter pattern, etc.) as new
   entries — don't just paste nexus's content unedited.
3. Add a `.claude/rules/admin.md` scoped to `apps/admin/**` if admin's
   auth/security conventions diverge enough to warrant it.
4. Re-run the same acceptance criteria above against prism directly before
   trusting the workflow there for real feature work.
