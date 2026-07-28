---
description: Run the QA & security checklist for a day/release before marking it complete.
---

# /qa-gate — day/release completion gate

Run the QA & Security Checklist (`.claude/docs/qa-checklist.md`) for the day given in the
arguments (default: the current day from `PROGRESS.md`).

For each applicable checklist item:
- If it's covered by an automated test, run it and report pass/fail.
- If it needs a manual check, give the user exact steps to run.
- **🔴 items are launch blockers** — the day cannot be marked complete if any 🔴 fails.

Focus only on items relevant to features actually built by this day (check `PROGRESS.md`).
Produce a short report: passed / failed / needs-manual, most important first. List every
failure with the file and a one-line fix suggestion. Do not mark the day complete in
`PROGRESS.md` until every applicable 🔴 passes — surface anything outstanding to the user.

On a production-release day (Tuesday/Thursday/Saturday/Sunday per
`docs/00_Project/Roadmap.md`), also confirm: `npm run build` is green, the staging deploy
already passed the full Playwright regression (`.github/workflows/claude-qa.yml`'s
`full-regression` job), and there is no outstanding 🔴 from a previous day that regressed.
