# Research Notes

Answers to the specific questions raised, with what I checked to confirm each one.

## 1. Can nexus's approach replicate to prism? Yes — and it's closer than you'd think.

I unzipped both projects and compared `nexus/docs/03_Architecture/Tech_Stack.md`
against `prism/architecture.md`.

**Correction on the stack assumption:** PRISM is **not** NestJS. There is zero
mention of NestJS anywhere in `Prism_PRD_Full.md`, `architecture.md`,
`Prism_Mobile_PRD.md`, or `QA_Security_Test_Strategy.md`. PRISM's `architecture.md`
is titled "Prism — Architecture (Vercel + Supabase)" and describes: Next.js
(`apps/web` + a separate `apps/admin` Next.js app on its own Vercel
project/domain), Supabase (Postgres + Supavisor + Auth + Storage), Upstash Redis,
and Vercel Edge Functions for chat streaming, with a Python serverless function
(via Vercel's official Python runtime) for document processing.

That means **nexus and prism are the same stack family** — Next.js + Vercel +
Supabase — not two different architectures you need two different playbooks for.
The workflow package in this repo (CLAUDE.md conventions, branch model, RLS-first
authorization pattern, subagent definitions, GitHub Actions triggers) is directly
portable. The one real structural difference: prism is a **monorepo** with two
Next.js apps (`apps/web`, `apps/admin`) sharing one Supabase project, so prism's
`CLAUDE.md` needs to live at the repo root with stack/convention content, plus a
short app-specific note in each app if their conventions genuinely diverge (e.g.
admin auth is separate from user auth). Everything else — branch strategy, agent
definitions, GitHub Actions triggers, deployment model — copies over close to
verbatim; just update the Supabase/Vercel project names per app.

**Where prism does need something nexus doesn't**, based on its own docs: a
Playwright/QA pass on the admin app specifically (separate domain, separate auth
surface — `docs/QA_Security_Test_Strategy.md` in prism already outlines a chunk of
this), and the Python serverless function for document processing is a second
runtime to account for in the deployment doc (still Vercel Fluid-compute-adjacent,
but worth a line in prism's own `deployment-model.md`).

## 2. CLAUDE.md — is it one file or many?

Both — it's a layered system, not a single file. Confirmed against Anthropic's
current subagents/memory docs (code.claude.com/docs/en/sub-agents and the memory
docs it references):

- **Managed/enterprise policy** — org-wide, deployed by IT/DevOps. Not relevant for
  a solo dev.
- **Project memory** — `./CLAUDE.md` at the repo root, checked into git, shared by
  anyone working in the repo. This is what's in this package.
- **User memory** — `~/.claude/CLAUDE.md`, personal, applies across every project
  on your machine (e.g. "I prefer terse explanations").
- **`.claude/rules/*.md`** — same priority as project CLAUDE.md, but each file can
  carry a `paths:` frontmatter field so it only loads when Claude touches matching
  files. This repo uses two: `api-routes.md` and `database.md`. This is the
  mechanism for "don't load frontend conventions when Claude's working in
  migrations," and it's the right place for anything more specific than "always
  true about this whole repo."
- **Child-directory `CLAUDE.md`** — loads on demand when Claude works in that
  subdirectory. This is the mechanism prism's `apps/admin/CLAUDE.md` would use if
  admin conventions diverge enough to need it.

Practically: one root `CLAUDE.md` per repo, kept short (it costs context every
turn), plus `.claude/rules/` for anything path-specific. Don't try to front-load
everything into one file.

## 3. Are multiple agents (dev / review / QA) actually possible on Claude, fully?

Yes, natively — this isn't a workaround. Claude Code's **subagents** feature
(`.claude/agents/*.md`) is exactly this: a Markdown file with YAML frontmatter
defining a name, a description Claude uses to decide when to delegate, a tool
allowlist, a model choice, and optionally scoped MCP servers. Confirmed directly
against the official docs (code.claude.com/docs/en/sub-agents, fetched in full).

Key facts that shape this package's design:
- A subagent gets its **own context window** — the review/QA agent's verbose
  output doesn't pollute your main coding session.
- `tools:` and `disallowedTools:` let you make a subagent genuinely read-only
  (the `code-reviewer` agent here can't edit files — it only has Read/Grep/Glob/Bash).
- `mcpServers:` inside a subagent's frontmatter scopes an MCP server (like
  Playwright) to *just that subagent* — it never loads into your main
  conversation's context, which is exactly the toggle behavior you described
  wanting ("only some pushes need the QA agent").
- Subagents can be triggered three ways: automatically (Claude reads the
  `description` and decides), explicitly by name in a prompt, or **from CI** via
  the official `anthropics/claude-code-action@v1` GitHub Action — which is how the
  two workflow files in `.github/workflows/` implement your "toggleable per code
  push" requirement, using PR labels as the toggle.

## 4. Vercel: Edge Functions vs Fluid Compute — is scalable long-lived compute possible?

Confirmed via Vercel's own changelog and current docs. Short version: **your
instinct was right, and it's already resolved in Vercel's favor.**

- Vercel deprecated standalone Edge Functions as the *recommended default* over
  2025 (the product still runs — old Edge routes don't break — but new code
  shouldn't reach for `export const runtime = 'edge'` by default anymore).
- **Fluid Compute** is the replacement default: Node.js runtime, on by default for
  new projects since April 2025, with in-function concurrency (multiple requests
  sharing a warm instance) specifically aimed at I/O-bound workloads — which
  describes almost everything in a Next.js + Supabase app (waiting on Postgres,
  waiting on an LLM API, streaming a response).
- Default execution limit is now 300 seconds across all plans; Pro/Enterprise can
  opt into a 30-minute beta extension. So yes — long-lived functions at real scale
  are supported, and it's the path of least resistance, not a special
  configuration you have to fight for.
- Note: prism's own `architecture.md` currently specifies `export const runtime =
  'edge'` for its chat-streaming route. That was a reasonable choice under the old
  guidance, but given the above, it's worth revisiting — Fluid Compute on Node.js
  gets full Node API support at the same price/region profile, with no real
  downside for this use case (an 8-pane concurrent stream is exactly the
  I/O-bound, concurrency-heavy shape Fluid Compute optimizes for). This is called
  out again as a specific, low-effort recommendation in the work item doc.

## 5. What's the term for "spec everything out, then let Claude execute it"?

**Spec-Driven Development (SDD)**. It's an established, actively-discussed term as
of 2025–2026 (Microsoft, Thoughtworks, and multiple practitioner write-ups all use
it the same way), and it's exactly the practice you're describing: PRD → verified,
explicit specification (not just a PRD — a spec adds acceptance criteria, edge
cases, API contracts, explicit constraints) → task breakdown → AI-agent
implementation, with human review gates at defined checkpoints rather than at every
line.

A few adjacent terms you'll see, so you can recognize them if they come up:
- It's explicitly positioned as a *superset* of TDD, not a replacement — TDD
  verifies the code matches the tests; SDD verifies the tests (and the code) match
  the actual specified intent.
- Open-source tooling exists specifically for this pattern (e.g. GitHub's
  `spec-kit`, and various "PRD → spec → tasks → implementation" pipelines) if you
  want prior art beyond hand-rolling it, though what's in this package (PRD docs +
  CLAUDE.md + subagents + PR-gated review/QA) is a reasonable direct
  implementation of the same idea without adopting a separate framework.
- What you're describing for nexus/prism specifically — PRD already written,
  architecture already decided, now build the execution scaffolding — is the
  "specification is done, now build the pipeline" phase of SDD, which matches
  where both projects already are.
