#!/usr/bin/env bash
# Post-turn verification gate for Nexus.
# Runs after Claude finishes a turn. No-op until the project is scaffolded.
# Exit 0 = OK to stop. Exit 2 = block: TypeScript or tests are red; Claude must fix.

set -uo pipefail
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || cd "$(dirname "$0")/../.." || exit 0

# Nothing to check until the app exists.
[ -f package.json ] || exit 0

# Prefer running inside Docker (matches the Linux runtime Vercel actually runs on —
# see CLAUDE.md's "Local dev — Docker" section). Fall back to native npx if the
# Docker stack isn't up, rather than blocking every turn on Docker being running.
run() {
  if docker compose ps --status running 2>/dev/null | grep -q app; then
    docker compose exec -T app "$@"
  else
    "$@"
  fi
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
