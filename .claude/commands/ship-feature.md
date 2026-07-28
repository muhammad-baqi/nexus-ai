---
description: Build the next feature on its own branch — plan → approve → branch → implement → self-review → verify → self-merge to develop.
---

# /ship-feature — interactive, one feature at a time

Ship exactly **one** feature from the current day in `docs/00_Project/Roadmap.md`, on its own
branch off `develop`, with the user approving the plan before any code is written and
reviewing the result after. Never build more than one feature per run. Never jump ahead of the
current day. Full git rules → `.claude/docs/git-workflow.md`.

If the user named a feature in the arguments, build that one. Otherwise read `PROGRESS.md` and
pick the **next unchecked feature in the lowest incomplete day**.

## Steps — follow in order, do not skip

1. **Plan (gate).** Enter plan mode. Read the relevant docs for this feature (doc index in
   `CLAUDE.md`) — the feature's own `docs/01_MVP/*.md` doc in full, plus
   `docs/03_Architecture/Database_Schema.md` / `API_Design.md` if it touches either. Present a
   short plan: what you'll build, which files, which schema/columns, and **this feature's own
   concrete test cases** — specific to *this* feature's behavior, not a generic template (see
   `.claude/docs/testing.md`). **Stop and wait for the user's approval** of the plan *and the
   test-case list*. On approval, record the agreed cases under this feature's heading in
   `test-cases.md`. No code until approved.

2. **Branch.** `git checkout develop && git pull`, then `git checkout -b feature/dN-<short-name>`
   (N = the Roadmap day number this feature belongs to, e.g. `feature/d2-collections`).

3. **Schema first (if needed).** If the feature needs new tables/columns beyond
   `001_initial_schema.sql`, write the migration → have the user run it (locally, then
   `nexus-staging`) → write a test that proves the tables + RLS work → confirm green before
   building on it. Every table follows `.claude/rules/database.md` — RLS in the same migration,
   no exceptions.

4. **Implement.** Build only this feature. Follow the 7 non-negotiable rules in `CLAUDE.md` and
   the relevant `.claude/rules/*.md` conventions. TypeScript strict — no `any`, no `@ts-ignore`.
   Background work goes through a scheduled function/webhook, never inline.

5. **Self-review (local, free, advisory).** Invoke the **`code-reviewer` subagent**
   (`.claude/agents/code-reviewer.md`) on the diff. Apply the real findings; note false
   positives in your summary to the user. This does **not** gate — it's a junior-reviewer pass.

6. **Verify / QA (the Stop hook also enforces this).** Write **this feature's own co-located
   test file(s)** implementing **exactly the cases recorded under this feature in
   `test-cases.md`** (`it(...)` name ↔ case). Tick each case `[x]` there as its test goes green;
   append any case you add. Don't re-test cross-cutting rules — those live in
   `.claude/docs/qa-checklist.md`. Run, inside Docker: `docker compose exec app npm run
   typecheck` and `docker compose exec app npm test` — must be green. Then **run the dev server
   and drive the actual flow in the browser** — show the user it working, not just green tests.
   For anything touching auth, RLS, or file uploads, exercise the real path (try another user's
   ID, an oversized file, a wrong password).

7. **Self-merge into develop.** `git checkout develop`, then
   `git merge --squash feature/dN-<name> && git commit` (one clean commit for the feature),
   then `git push origin develop`.

8. **Record.** Tick this feature under the correct Day heading in `PROGRESS.md` and commit.

9. **Clean up + hand back.** `git branch -d feature/dN-<name>`. Summarize what shipped and how
   you verified it, show the diff summary, and ask the user to review. **Wait for "next"** (or
   the next `/ship-feature`).

## Guardrails
- One feature = one branch = one squash-merge into `develop` = branch deleted.
- **Never commit/merge/push to `staging` or `main`** — the human owns promotion, on the cadence
  in `docs/00_Project/Roadmap.md`. Bugs → `fix/*` off `develop`.
- Never build a feature from a later Day, or anything in `PROGRESS.md`'s "Post-MVP / Future
  scope" or "Explicitly out of scope" sections, without explicit confirmation.
- If you hit a missing secret, an ambiguous product decision, or a repeated test failure you
  can't resolve, **stop and ask** — don't guess.
