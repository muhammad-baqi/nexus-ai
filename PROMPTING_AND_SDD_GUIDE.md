# Prompting and Spec-Driven Development (SDD) Guide

## What SDD actually means here

Spec-Driven Development: PRD (what/why, already written in `docs/00_Project/`
through `docs/03_Architecture/`) → a **spec** for the specific slice being
built now (acceptance criteria, edge cases, explicit constraints, a task
breakdown) → Claude implements against the spec → human reviews at defined
checkpoints, not line-by-line as it's typed.

This repo does **not** use OpenSpec. The spec mechanism is hand-written:
**`build-order-complete.md`** holds one concrete, copy-paste prompt per
feature, each one pointing at the exact `docs/01_MVP/<Feature>.md` (and
`docs/03_Architecture/*.md` where relevant) that defines what "done" means —
plus **`/ship-feature`'s own plan-approval gate**, which reads those docs,
proposes a plan and a concrete test-case list, and waits for your approval
before any code gets written. `PROGRESS.md` and `test-cases.md` are the living
record of what's built and what's been proven, the same role OpenSpec's
`specs/` library would otherwise play.

The reason this matters more than "just prompt Claude well": a spec is the
thing that stops an agent from quietly expanding scope, inventing an API shape
that doesn't match `docs/03_Architecture/API_Design.md`, or drifting from what
was actually asked three tool-calls into a long session. It's cheaper to catch
a wrong plan at the `/ship-feature` plan-approval step than in a 400-line diff.

## The loop, concretely

1. **Pick the feature.** Either name one, or let `/ship-feature` read
   `PROGRESS.md` and pick the next unchecked item in the lowest incomplete
   Day. Full mapping of features → prompts → docs is `build-order-complete.md`.

2. **Plan (the checkpoint).** Run:
   > `/ship-feature`

   Claude reads the feature's doc in `docs/01_MVP/`, plus schema/API docs if
   relevant, and proposes: what it'll build, which files, which
   schema/columns, and this feature's own concrete test cases. **It stops and
   waits for your approval** — this is the checkpoint, not the code review.

3. **Refine if needed.** If something's off, say so directly:
   > "The plan has the reset token expiring in 24h — change that to 1h, and
   > add rate limiting to the request-reset endpoint as an explicit part of
   > this feature."

4. **Implement.** Once you approve, Claude branches, implements, self-reviews,
   verifies (`tsc` + tests + a real browser pass), and squash-merges into
   `develop` on its own — see `.claude/docs/git-workflow.md` for the exact
   steps `/ship-feature` runs.

5. **Record.** `/ship-feature` ticks `PROGRESS.md` itself. If you build
   something outside that command, tell Claude directly: "Mark '[feature
   name]' as complete under Day N in PROGRESS.md."

For a feature that isn't in `build-order-complete.md` yet (a new idea, a
change to scope), don't skip the plan step — ask Claude to read the relevant
`docs/01_MVP/*.md` (or write a new one first if the feature doesn't exist in
the PRD yet), then run `/ship-feature` against it the same way.

## Prompt patterns that actually change output quality

**Narrow the task before implementation, every time.** "Build the dashboard"
produces a plausible-looking wrong thing. "Implement the `/api/items` list
endpoint per `docs/03_Architecture/API_Design.md` §2.3 — pagination, the
existing filter params, RLS-scoped to the current user" produces a reviewable
diff.

**Ask for the plan before the diff, on anything non-trivial.**
> "Don't write code yet — outline your approach for the search feature,
> including which files you'll touch and any schema changes, then wait for me."

This is exactly what `/ship-feature`'s Plan step already does automatically —
reach for it explicitly mid-session too, any time a change is bigger than a
one-liner but you're not running the full command.

**Point at the constraint, not just the goal.**
> "Add CSV export to the items list. Must stream, not buffer the whole file in
> memory — see the 300s function limit note in docs/deployment-model.md."

Claude will produce a working-but-wrong solution (buffer everything, blow the
memory/time budget) if the constraint that actually matters isn't stated.

**Ask it to show verification, not just claim it.**
> "After implementing, run `npm run build`, `npm run lint`, and the relevant
> tests yourself and show me the output before saying this is done."

This is already baked into `CLAUDE.md`'s working conventions — repeat it in a
prompt if a session seems to be skipping it.

**Use subagents for the things that shouldn't share context with implementation.**
Don't ask your main coding session to also review its own diff — that's the
same context reasoning about itself. Explicitly:
> "Now use the code-reviewer subagent on this diff before I open the PR."

**Correct scope creep immediately and explicitly, don't let it compound.**
> "That refactor of the auth module wasn't asked for — revert that part, keep
> only the password-reset changes."

Catching this at message N is cheap; catching it at message N+20 across a
30-file diff is not.

**For debugging, ask for a hypothesis before a fix.**
> "Don't patch this yet — what's your best hypothesis for why this query
> returns stale data, and how would you confirm it?"

Prevents guess-and-check loops that produce a fix that happens to make the
symptom go away without addressing the cause.

**Reference specific docs by path, not by description.** "Per
`docs/03_Architecture/Database_Schema.md`" retrieves and grounds against the
actual file. "Following our usual schema conventions" makes Claude guess what
those are.

## Further reading

- Anthropic's own Claude Code best-practices writeup (search "Claude Code best
  practices" on anthropic.com — covers plan mode, extended thinking triggers,
  and subagent delegation patterns in more depth than fits here)
- `code.claude.com/docs/en/sub-agents` — the underlying subagent mechanism this
  repo's `.claude/agents/` relies on
- `.claude/docs/git-workflow.md` and `build-order-complete.md` — the concrete
  mechanics of this repo's spec-and-build loop
