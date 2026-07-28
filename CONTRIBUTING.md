# Contributing Guide

Solo-dev (or small-team), agent-assisted workflow. This merges the team guideline
you provided (branch model, PR conventions, AI review/QA pipeline) with the
Vercel + Supabase deploy specifics from the rest of this repo.

## Branch structure

| Branch | Purpose | Branches off | Merges into |
|---|---|---|---|
| `main` | Production. Always stable. Deploys to the production Vercel project. | — | — |
| `staging` | QA / release candidate. Deploys to the staging Vercel project + staging Supabase. | `develop` | `main` |
| `develop` | Integration branch, **open** — agent self-merges feature work here, no PR gate. | `main` | `staging` |
| `feature/*` | New feature or change (day-prefixed: `feature/dN-<name>`) | `develop` | `develop` |
| `fix/*` | Non-urgent bug fix | `develop` | `develop` |
| `chore/*` | Tooling/maintenance | `develop` | `develop` |
| `hotfix/*` | Urgent production fix | `main` | `main` **and** `develop` |

`staging` and `main` are human-only — the agent must never commit, merge, or push to either.
`develop` is deliberately **not** PR-gated: this is a solo-dev, agent-assisted repo, and the
per-feature loop (`/ship-feature`) is designed to self-merge without blocking on review. Full
rationale and the exact flow → `.claude/docs/git-workflow.md`.

## Specs first: hand-written build order, not OpenSpec

This repo does **not** use OpenSpec for day-to-day feature work. The spec mechanism is
`build-order-complete.md` — one concrete, copy-paste prompt per feature, written against the
PRD in `docs/00_Project/` through `docs/03_Architecture/` — plus `/ship-feature`'s own
plan-approval gate (read the docs, propose a plan and test cases, wait for your approval,
*then* write code). See `PROMPTING_AND_SDD_GUIDE.md` for why this replaces OpenSpec here and
what to prompt for a feature that isn't in `build-order-complete.md` yet.

## Day-to-day workflow

1. `git checkout develop && git pull origin develop`
2. Run `/ship-feature` (or `git checkout -b feature/dN-short-description` if working manually)
3. Implement with Claude Code against the plan approved in step 1 of `/ship-feature`. Commit in
   small, logical chunks — imperative mood present tense (`"Add retry logic"`, not
   `"Added"`/`"Adding"`).
4. Verify locally before merging: `docker compose exec app npm run typecheck`,
   `docker compose exec app npm test`, `npm run build` — see `CLAUDE.md` for exact commands.
5. Self-review via the `code-reviewer` subagent (advisory, not a gate).
6. Squash-merge into `develop` yourself (`/ship-feature` does this): `git checkout develop &&
   git merge --squash feature/dN-short-description && git commit && git push origin develop`.
7. Tick `PROGRESS.md`, delete the branch.

## AI-assisted review and QA (informational, since develop has no PR gate)

Two agents sit in the pipeline — see `.github/workflows/claude-review.yml` and
`.github/workflows/claude-qa.yml`. Because feature work self-merges into `develop` without a
PR, both now trigger on **push**, not pull request, for `develop`:

- **Code review (Claude):** runs on every push to `develop`. Posts a Critical / Warnings /
  Suggestions comment via the `code-reviewer` subagent (`.claude/agents/code-reviewer.md`) as a
  commit comment. **A second, independent look after the agent's own self-review in
  `/ship-feature` — not a merge gate**, since the merge already happened.
- **QA (Playwright):**
  - Push to `develop`: fast smoke suite (`@smoke`-tagged tests) against a local build.
  - Push to `staging`: full regression suite against the deployed staging URL, using the
    `qa-playwright` subagent so failures come with a real pass/fail narrative, not just a red X.
    **This is the actual gate to read before promoting `staging → main`.**
  - Human QA still does exploratory testing on `staging` — the agent covers regressions, not
    judgment calls.

Rules of thumb:
- Treat agent output as a capable junior reviewer's notes — useful signal, not final word.
- If an agent flags a false positive, note it and proceed; don't let it block the loop.
- If a pushed commit to `develop` fails smoke tests or gets a critical review comment, fix it
  on a `fix/*` branch like any other bug — don't try to "undo" a self-merge.
- Required secret: `CLAUDE_CODE_OAUTH_TOKEN` (see `SETUP_CHECKLIST.md`). The
  `STAGING_URL` secret feeds the full regression job.

## Promoting to staging / production

```bash
# develop -> staging, once a batch of work is ready for QA
git checkout staging && git pull origin staging
git merge develop && git push origin staging   # triggers full regression + Vercel staging deploy

# staging -> main, once QA signs off
git checkout main && git pull origin main
git merge staging
git tag vX.Y.Z
git push origin main --tags                     # triggers Vercel production deploy

# sync main back into develop so nothing is lost
git checkout develop && git merge main && git push origin develop
```

## Hotfixes

```bash
git checkout main && git pull origin main
git checkout -b hotfix/short-description
# fix, commit, push, PR into main, review, merge, tag, deploy
git checkout develop && git merge main && git push origin develop
```

## Branch protection

| Branch | Rules |
|---|---|
| `main` | Human-merge only, no direct pushes from the agent, no force-push |
| `staging` | Human-merge only, no direct pushes from the agent |
| `develop` | Open — agent self-merges via `/ship-feature`; local `.githooks` + `.claude/settings.json` enforce the agent never touches `staging`/`main` |

## Ground rules

- Pull before you branch.
- One branch = one logical change, self-merged via `/ship-feature`.
- Resolve conflicts locally, not in the GitHub UI, so you test the merged result before pushing.
- Don't let `develop` or `main` stay broken — fix CI before doing anything else.
- Squash-merge by default.

## What Claude Code should NOT do

- Don't push directly to `staging` or `main` — ever.
- Don't install new dependencies without flagging it when reporting the feature back.
- Don't touch `.github/workflows/*` unless explicitly asked.
- Don't skip or delete failing tests to make CI pass — fix the issue or flag it.
