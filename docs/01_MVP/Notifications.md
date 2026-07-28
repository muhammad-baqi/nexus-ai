# Notifications

## Overview

Notifications in the MVP are limited to user-configured reminders tied
to Knowledge Items, delivered via email. The feature is scoped narrowly
on purpose: it exists to serve the Tomás persona's need ("remind me to
follow up on this") without building a general-purpose notification
platform in v1.

## Requirements

Users shall be able to:

- Attach a reminder to any Knowledge Item
- Choose a reminder type: one-time, daily, weekly, monthly, or custom
  (a specific recurrence rule)
- Edit or cancel an existing reminder
- Receive the reminder via email at the scheduled time
- See upcoming reminders on the Dashboard
- Toggle reminder emails on/off globally in Settings

## Reminder Types

| Type | Behavior |
|---|---|
| One-time | Fires once, at a specific date/time, then is automatically deactivated |
| Daily | Fires every day at a specified time until cancelled |
| Weekly | Fires on a specified day of the week at a specified time until cancelled |
| Monthly | Fires on a specified day of the month at a specified time until cancelled; if the day doesn't exist in a given month (e.g., the 31st), fires on the last day of that month instead |
| Custom | A user-specified recurrence (e.g., "every 3 days," "every weekday") |

## Creating a Reminder

- From any Knowledge Item's detail view, the user can add a reminder,
  choosing type and time.
- A single item may have more than one active reminder (e.g., a daily
  nudge and a separate one-time deadline reminder) — reminders are not
  limited to one-per-item.

## Delivery

- **Phase 1 (MVP): email only.** The system sends a transactional email
  containing the item's title, a short excerpt/description, and a
  direct link back into Nexus to the item.
- Delivery is handled via a background job scheduler (not a per-request
  synchronous send) that evaluates due reminders on a recurring interval
  (e.g., every minute) and dispatches emails for anything due.
- If the global "reminder emails" toggle in Settings is off, reminders
  still exist and show on the Dashboard, but no email is sent — the
  Dashboard view is the fallback delivery surface.

## Editing / Cancelling

- Editing a reminder's type/time reschedules future sends; it does not
  resend anything already delivered.
- Cancelling deactivates the reminder without deleting its history (so a
  past record of "this was reminded on X date" can still inform, e.g.,
  the Activity Log).

## Missed Reminders

If the background scheduler is down or delayed and a reminder's due
time has passed, the system should still send it as soon as the
scheduler recovers (catch-up), rather than silently skipping it — unless
it is more than a defined grace period late (e.g., 24 hours), in which
case it is logged as missed rather than sent stale.

## Error States

- Reminder email delivery failure (e.g., provider error): retried with
  backoff a limited number of times; persistent failure is logged, not
  silently dropped, and does not crash the scheduler job for other
  users' reminders.
- Creating a reminder with an invalid/past one-time date: inline
  validation before save.
- Deleting a Knowledge Item that has active reminders: reminders are
  deactivated automatically when their associated item is trashed, and
  reactivated if the item is restored before the reminder's next
  scheduled fire.

## Out of Scope for MVP

- Telegram, Discord, Slack, WhatsApp, or push notification channels
  (see `02_Development/Telegram.md` for the first planned expansion)
- Reminder templates or bulk reminder creation
- Snooze functionality

## Acceptance Criteria

- [ ] A user can attach one-time, daily, weekly, monthly, and custom
      reminders to any Knowledge Item.
- [ ] Reminders fire via email at the correct scheduled time, including
      correct recurrence behavior for daily/weekly/monthly.
- [ ] Monthly reminders on days that don't exist in a given month
      correctly fall back to the month's last day.
- [ ] Turning off the global email toggle stops emails but preserves
      reminders and their Dashboard visibility.
- [ ] Trashing an item deactivates its reminders; restoring re-activates
      them if still due in the future.
- [ ] Covered by unit tests (recurrence calculation logic, including
      edge cases like month-end dates), integration tests (scheduler
      job dispatch correctness), and an end-to-end test: create item →
      add reminder → verify it appears on Dashboard → verify email is
      sent at/after the scheduled time in a test environment.
