# Skills — How to Add Them, and What to Install for This Stack

## How adding a skill actually works

A skill is a folder containing `SKILL.md` (YAML frontmatter + instructions,
optionally with supporting scripts). Claude Code looks for skills in two places:

| Scope | Path | Applies to |
|---|---|---|
| Personal | `~/.claude/skills/` | every project on your machine |
| Project | `.claude/skills/` | this repo only, travels with it in git |

**Three ways to add one, in order of preference:**

1. **Install a plugin that bundles it** (best — stays updated, can also bundle
   agents/hooks/MCP servers):
   ```
   /plugin marketplace add <org>/<repo>
   /plugin install <skill-name>@<marketplace-name>
   ```
2. **Skills CLI**, for skill repos that support it:
   ```bash
   npx skills add <skill-source>
   ```
   (shadcn/ui's official skill uses this pattern — see below.)
3. **Manual copy**, for a skill you found as a standalone repo/gist:
   ```bash
   mkdir -p .claude/skills/my-skill
   curl -o .claude/skills/my-skill/SKILL.md https://raw.githubusercontent.com/<owner>/<repo>/main/SKILL.md
   # or: git clone <repo-url> .claude/skills/my-skill
   ```

**After adding one:** start a new session (or run `/reload-plugins`), then
confirm it loaded with `/skills`. Claude matches your request against the
skill's `description` field automatically — if it's not triggering, the fix is
almost always to sharpen that description, not the skill's body content. You
can also invoke it directly: `/skill-name`.

**Trust matters here.** Skills can instruct Claude to install packages or run
scripts — only add skills from sources you trust (official Anthropic repos,
your own team, well-known maintainers). Check `SKILL.md`'s content before
adding anything pulled from a random GitHub search result.

**Project vs. personal — which to use:** if a skill is genuinely repo-specific
(e.g. "how we structure Supabase migrations here"), it belongs in
`.claude/skills/` so it's version-controlled and shared. If it's a general
capability you want everywhere (e.g. a personal commit-message style), use
`~/.claude/skills/`.

## Recommended for this stack (Next.js + Vercel + Supabase + Playwright)

Install these during Phase 0/1 setup (`PHASES.md`), not before you need them:

- **shadcn/ui's official skill** — straight from the maintainers, reads your
  actual `components.json` live rather than describing components generically:
  ```bash
  pnpm dlx skills add shadcn/ui
  ```
- **`laguagu/claude-code-nextjs-skills`** — bundle matching this exact stack:
  `web-design-guidelines` (UI/UX review against real interface guidelines, not
  vibes), `next-best-practices`, `react-best-practices`,
  `supabase-postgres-best-practices`. **Not a plugin marketplace** — it's a
  plain skills collection (no `.claude-plugin/marketplace.json`), so
  `/plugin marketplace add` fails against it. Install via manual copy instead
  (method 3 above) — already done in this repo, vendored under
  `.claude/skills/{next-best-practices,react-best-practices,web-design-guidelines,supabase-postgres-best-practices}`
  (MIT-licensed, copied 2026-07-28). To refresh: re-clone the repo and re-copy
  those four folders.
- **Anthropic's official plugin directory** (`claude.com/plugins`) — the
  `frontend-design` and `code-review` plugins are worth a look; skip
  `frontend-design` if you've already installed `web-design-guidelines` above,
  they overlap.
- **Playwright** — you don't need a separate "skill" for this; it's already
  wired in as an MCP server scoped to the `qa-playwright` subagent
  (`.claude/agents/qa-playwright.md`), which is the right mechanism for
  something that needs live tool access, not just reference knowledge.

## What NOT to install

Don't install a skill "because it exists." Every loaded skill's description
costs a small amount of context on every session, even before it's invoked.
Two overlapping UI-guideline skills, or a skill for a framework you're not
using, is pure overhead. Check `docs/skill-strategy.md` for the fuller
reasoning on scoping (subagents vs. skills vs. MCP servers) if you're deciding
whether something should be a skill at all versus a subagent.
