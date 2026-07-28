# Nexus — Git Workflow (authoritative)

> Branch model, per-feature flow, and the fix path. **The agent owns all feature-branch work
> and self-merges into `develop`. The human owns `staging` and `main`.** No PRs, no review gate
> on `develop` — so the day-by-day build loop never blocks. This is a deliberate deviation from
> a team-scale PR-gated model, chosen to match a solo-dev, agent-assisted workflow.

---

## Branch model

| Branch | Purpose | Who touches it |
|---|---|---|
| `main` | Production, always stable | **Human only** — agent must NEVER commit/merge/push here |
| `staging` | QA / release candidate | **Human only** — agent must NEVER touch |
| `develop` | Integration branch, **open** for the agent | Agent squash-merges each feature here |
| `feature/*` | One per feature, branched off `develop` | Agent |
| `fix/*` | Bug fix branched off `develop` | Agent |
| `chore/*` | Tooling/maintenance branched off `develop` | Agent |
| `hotfix/*` | Urgent fix off `main`, once live | Human-initiated, agent-assisted |

**Rules:**
- The agent NEVER commits, merges, or pushes to `main` or `staging`. Promotion is manual (human),
  on the cadence in `docs/00_Project/Roadmap.md` (staging daily, production every other day).
- `develop` stays open (no review gate) so the loop keeps running.
- One feature = one branch = one squash-merge into `develop` = branch deleted.

## Branch naming (day-prefixed)

Nexus's build order is organized by Roadmap day, not phase, so branches are day-prefixed:

```
feature/d2-<short-desc>    Day 2 (Core Platform)        e.g. feature/d2-collections
feature/d3-<short-desc>    Day 3 (Knowledge Management)  e.g. feature/d3-note-versions
feature/d4-<short-desc>    Day 4 (Search & Organization)
feature/d5-<short-desc>    Day 5 (Knowledge Sources)
feature/d6-<short-desc>    Day 6 (Polish / v1.0 RC)
fix/<short-desc>
chore/<short-desc>
hotfix/<short-desc>        once live
```

## Per-feature flow (baked into `/ship-feature`)

```
1. Sync        git checkout develop && git pull
2. Branch      git checkout -b feature/dN-<name>
3. Develop     implement the ONE feature
4. Self-review invoke the code-reviewer subagent on the diff — ADVISORY: apply real
               findings, note false positives. Does NOT gate or stop the loop.
5. QA / verify Stop hook runs tsc + vitest (in Docker); drive the actual flow in the browser
6. Merge       git checkout develop
               git merge --squash feature/dN-<name> && git commit
               git push origin develop
7. Progress    tick the feature in PROGRESS.md (commit)
8. Clean up    git branch -d feature/dN-<name>
```

Order recap: **develop → self-review → verify (QA) → push → mark progress → delete branch.**

## Fix path

Bugs are fixed on a **`fix/<name>` branch off `develop`**, squash-merged back into `develop`,
then (later) `staging` is re-synced from `develop` on the next scheduled promotion. **Never fix
directly on `staging` or `main`.**

## Promotion — human, manual (not the agent)

```
# develop -> staging, on the daily cadence (or whenever a batch is ready for QA)
git checkout staging && git pull origin staging
git merge develop && git push origin staging   # triggers the full Playwright regression + Vercel staging deploy

# staging -> main, on release days (Tue/Thu/Sat/Sun per Roadmap.md)
git checkout main && git pull origin main
git merge staging && git tag vX.Y.Z && git push origin main --tags   # triggers Vercel production deploy

# sync main back into develop so nothing is lost
git checkout develop && git merge main && git push origin develop
```

## Local enforcement

`.githooks/` hard-blocks commits/pushes to `main`/`staging` and checks branch naming. Activate
once at repo init:

```bash
git config core.hooksPath .githooks
```

`.claude/settings.json` also denies pushes to `main`/`staging` and `--force`. These are the
guardrails that keep the agent inside the flow even without a PR gate.

## CI — informational, not a gate on develop

Because feature work self-merges straight into `develop` without a PR, the CI in
`.github/workflows/` triggers on **push**, not pull request, for `develop`:

- `claude-review.yml` — the `code-reviewer` subagent posts an informational commit comment on
  every push to `develop`. This is a *second* look after the agent's own self-review in step 4
  above, not a merge gate (the merge already happened).
- `claude-qa.yml` — a Playwright `@smoke` suite runs on every push to `develop`; the full
  regression suite (via the `qa-playwright` subagent, against the deployed staging URL) runs on
  every push to `staging` — this is the actual pre-promotion gate a human should read before
  merging `staging → main`.

If a pushed commit to `develop` fails smoke tests or gets a critical review comment, treat it
like any other bug: fix it on a `fix/*` branch, don't try to "undo" the self-merge.
