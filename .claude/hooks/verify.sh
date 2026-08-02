#!/usr/bin/env bash
# Post-turn verification gate for Nexus.
# Runs after Claude finishes a turn. No-op until the project is scaffolded.
# Exit 0 = OK to stop. Exit 2 = block: TypeScript or tests are red; Claude must fix.

set -uo pipefail
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || cd "$(dirname "$0")/../.." || exit 0

# Nothing to check until the app exists.
[ -f package.json ] || exit 0

# Only run inside Docker (matches the Linux runtime Vercel actually runs on — see CLAUDE.md's
# "Local dev — Docker" section, and its "don't run the app natively outside Docker" rule).
# Skip entirely, rather than falling back to a native run, when the app container isn't up:
# the host's node_modules is never guaranteed to match the container's (e.g. packages added via
# `docker compose exec app npm install ...` only ever land in the container's own node_modules),
# so a native fallback here produces false "Cannot find module" errors, not real signal — most
# reliably right after `docker compose down` at the end of a session.
if ! docker compose ps --status running 2>/dev/null | grep -q app; then
  exit 0
fi

run() {
  docker compose exec -T app "$@"
}

# TypeScript strict must be clean.
if ! run npx --no-install tsc --noEmit; then
  echo "TypeScript errors — fix before finishing (rule #3: strict, no any, no @ts-ignore)." >&2
  exit 2
fi

# Tests must pass (green even with zero tests is fine early on).
if ! run npx --no-install vitest run --passWithNoTests; then
  echo "Tests are failing — fix before finishing." >&2
  exit 2
fi

exit 0
