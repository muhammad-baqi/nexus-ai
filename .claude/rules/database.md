---
paths:
  - "supabase/migrations/**"
  - "supabase/**/*.sql"
---

# Database / Supabase conventions

- Every table holding user data ships an RLS policy in the same migration that
  creates it. No table goes live without RLS enabled — this is the actual
  authorization boundary, not a nice-to-have.
- Migrations are additive and reversible where practical. Don't hand-edit a migration
  that has already been applied to staging or prod — write a new one.
- Never put a real secret or production connection string in a migration file or
  seed script.
- Test destructive migrations (drops, renames) against a local or dev Supabase
  instance first, never straight to staging.
