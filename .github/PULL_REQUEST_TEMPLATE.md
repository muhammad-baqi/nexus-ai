## Summary

<!-- One or two sentences: what changed and why. -->

## Acceptance criteria / issue

<!-- Link the doc or issue this closes, e.g. docs/01_MVP/Authentication.md#password-reset -->

## Architecture / docs touched

<!-- Which docs under docs/03_Architecture/ this relates to, if any. -->

## Verification

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] Manually verified locally / on preview deployment: <!-- how -->

## Automated checks

- Feature work into `develop` no longer goes through a PR — `/ship-feature`
  self-merges directly (see `.claude/docs/git-workflow.md`). This template is
  for the exception cases that still use a PR: a `hotfix/*` into `main`, or a
  manual promotion PR into `staging`/`main`. The review comment runs on push to
  `develop` and on any PR into `staging`/`main`; full regression runs on push to
  `staging`. See CONTRIBUTING.md.

## Environment / deployment notes

<!-- Migrations to run, env vars to add, anything the next deploy needs to know. -->
