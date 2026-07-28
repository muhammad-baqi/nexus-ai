# Skill & Plugin Strategy — Claude Code

Prefer existing, tested skills/plugins over writing your own. Claude Code's building
blocks, and where each actually comes from:

## The building blocks (not interchangeable)

- **Skills** — a folder with a `SKILL.md` (plus optional scripts) that Claude can
  auto-invoke or you can run with `/skill-name`. Good for encoding repo-specific or
  domain-specific procedures (e.g. "how we do PDF text extraction here").
- **Subagents** — isolated-context specialists with their own tools/model/permissions
  (`.claude/agents/*.md`). Good for review, QA, research — anything whose verbose
  intermediate output you don't want polluting your main conversation. This repo's
  `code-reviewer` and `qa-playwright` are subagents, not skills.
- **MCP servers** — give Claude tools to talk to something external (a browser, a
  database, an issue tracker). Playwright MCP is an MCP server, not a skill.
- **Plugins** — a distributable bundle of any of the above (skills + subagents + MCP
  servers + slash commands) installed as one unit.

## Why skills aren't bundled as static files in this repo

Skills are meant to be **installed live**, not copy-pasted once and left to go stale.
The shadcn/ui skill, for example, runs `shadcn info --json` against your actual
`components.json` on every interaction — a static copy would describe a project
that doesn't exist. Install these with the commands below during Phase 0 setup
(see `PHASES.md`), not by unzipping files into `.claude/skills/`.

## Where to actually get tested ones (not "example naming patterns")

- **shadcn/ui's own official skill** (`ui.shadcn.com/docs/skills`) — straight from
  the shadcn maintainers, not a third-party guess. Install once inside the project:
  ```bash
  pnpm dlx skills add shadcn/ui
  ```
  This is the one to use for this stack — supersedes any community shadcn skill.
- **Anthropic's official plugin directory** (`claude.com/plugins`) — includes an
  official **Playwright plugin** (wraps Playwright MCP for browser automation,
  screenshots, form-filling) and a **Superpowers** plugin bundle (brainstorming,
  subagent-driven code review, debugging, TDD, skill authoring). Install rather than
  hand-roll.
- **`anthropics/claude-code-action`** (GitHub Marketplace, official) — the CI
  integration this repo's two workflow files use. Not a skill/plugin per se, but the
  supported path for "run a Claude Code agent on a PR event."
- **GitHub-curated subagent/plugin collections** — large, actively maintained, worth
  browsing before writing a custom one: `wshobson/agents`, `VoltAgent/awesome-claude-code-subagents`,
  and similar "awesome list" style repos aggregate hundreds of ready-made subagent
  definitions (security review, database, frontend, DevOps, etc.) you can drop into
  `.claude/agents/` directly. Read before adopting — quality varies — but it's a much
  faster start than writing from scratch.
- **`laguagu/claude-code-nextjs-skills`** — a bundle matching this exact stack:
  `web-design-guidelines` (UI/UX review against real interface guidelines),
  `next-best-practices`, `react-best-practices`, `supabase-postgres-best-practices`.
  This is **not** a plugin marketplace (no `.claude-plugin/marketplace.json`), so
  `/plugin marketplace add` doesn't work against it — it's a plain skills collection
  meant to be copied. Already vendored in this repo under `.claude/skills/` (manual
  copy, method 3 in `SKILLS.md`).
- **`@playwright/mcp`** (npm, official Microsoft/Playwright package) — the actual MCP
  server the `qa-playwright` subagent in this repo depends on:
  `npx @playwright/mcp@latest`. Not a Claude-specific package; it's Playwright's own
  MCP implementation, works with any MCP client.

## Rule of thumb

- Search the official plugin directory and a curated subagent list first.
- Use a repo-local `.claude/agents/` or `.claude/skills/` definition only when the
  workflow is genuinely specific to this codebase (as the two agents in this repo
  are — they reference this project's doc structure and branch model directly).
- Don't install a plugin just because it exists. Every installed MCP server's tool
  descriptions cost context on every session unless scoped into a subagent (see
  `mcpServers:` in `.claude/agents/qa-playwright.md` — it's scoped there specifically
  so the Playwright tool schemas don't load into your main conversation).

## Token / cost efficiency

- One scoped task at a time; don't dump the whole repo into a prompt.
- Prefer "explain the issue, propose the minimal fix" over "rewrite the module."
- Don't run `run-review` + `run-qa` on every PR by default — see CONTRIBUTING.md.
  Trivial diffs don't need either.
- Route review-style tasks to Sonnet, not Opus, unless the diff is unusually complex —
  set this per-subagent via the `model:` frontmatter field, as done in this repo's
  agent files.
