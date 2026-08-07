-- Day 6 Reminders — full notification system (docs/01_MVP/Notifications.md).
-- The `reminders` table + its owner-scoped RLS already exist from 001_initial_schema.sql
-- (transitively through knowledge_item_id, same shape as note_versions/tags). This migration
-- only adds scheduler bookkeeping columns; no RLS changes needed — the existing
-- reminders_owner_access policy already covers every column on the table.
--
-- Per .claude/rules/database.md, 001_initial_schema.sql is already applied to
-- nexus-staging/nexus-prod, so this only ever adds — it never edits that file directly.

alter table reminders
  -- Distinguishes "auto-deactivated because its item was trashed" from "the user manually
  -- cancelled this reminder" — restore should only ever reactivate the former.
  add column deactivated_by_trash boolean not null default false,
  -- Scheduler bookkeeping: last successful send, and consecutive-failure count for
  -- retry-with-backoff (Notifications.md's Error States).
  add column last_fired_at timestamptz,
  add column failure_count integer not null default 0,
  -- Set by the scheduler's atomic "claim" UPDATE (app/api/cron/reminders/route.ts) before
  -- processing a due reminder, and cleared once resolved. Prevents two overlapping cron
  -- invocations (a slow tick still running when the next one fires, or a manual trigger racing
  -- the scheduled one) from both picking up and emailing the same due reminder — self-review
  -- caught this repo's first cron job had no claim/lock at all.
  add column claimed_at timestamptz;
