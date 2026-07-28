# Telegram Notifications (Future)

## Status
Skeleton — not scoped for detailed implementation. Directional only.

## Idea

Second notification delivery channel (after email), letting reminders
be delivered via a Telegram bot instead of / in addition to email.

## Anticipated Shape

- User links their Telegram account to Nexus (bot token / chat ID
  linking flow, TBD)
- Reminder delivery logic (see `01_MVP/Notifications.md`) gains a second
  channel implementation alongside email; the reminder *scheduling*
  logic doesn't change, only delivery.
- Settings screen gains a per-channel toggle once this exists.

## Open Questions

- Bot-initiated linking (user messages the bot first) vs. app-initiated
  (app generates a linking code the user enters into the bot)?
- Rate limits / retry behavior specific to the Telegram Bot API.

## Dependencies

Requires the Notifications system's channel abstraction (email today) to
already be structured so a second channel can be added without
reworking scheduling — noted as a forward-compatibility requirement in
`01_MVP/Notifications.md` and `01_MVP/Settings.md`.
