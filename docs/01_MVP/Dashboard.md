# Dashboard

## Overview

The Dashboard is the landing screen after login — an at-a-glance
overview of the user's knowledge base, oriented around "what did I save
recently" and "what do I care about most" rather than requiring the user
to navigate into a specific Collection first.

## Requirements

The Dashboard shall display:

- Recent items (most recently created or edited Knowledge Items,
  across all Collections)
- Recently viewed items (distinct from recently *edited* — items the
  user opened, even without changing them)
- Favorites (favorited Collections and favorited Knowledge Items)
- Recent Collections (most recently active Collections)
- Basic statistics (total items, item count by type, total Collections)
- Upcoming reminders (from Notifications — see `Notifications.md`)

## Layout Sections

**Recent Items:** a scrollable list/grid of the last N items (e.g., 10–20)
across all types, each showing type icon, title, Collection, and
relative timestamp ("2 hours ago"). Clicking opens the item directly.

**Recently Viewed:** similar presentation to Recent Items, but tracks
view events (opening an item) rather than mutation events (creating/
editing it). An item can appear in both lists if it was both recently
edited and recently viewed.

**Favorites:** a combined section showing favorited Collections (as
cards/icons) and favorited Knowledge Items (as a list), so a user's
"most important stuff" is one glance away regardless of whether it's a
whole Collection or a single item.

**Recent Collections:** Collections ordered by most recent activity
(any item created/edited within them), not alphabetically — this is the
fast path back into "what I was just working on."

**Statistics:** simple counters — total Knowledge Items, breakdown by
type (e.g., "24 notes · 10 bookmarks · 6 PDFs"), total Collections. No
charts required for MVP; numeric summary is sufficient.

**Upcoming Reminders:** a short list of the next few scheduled reminders
(from items with active notification schedules), each linking to its
associated item.

## Data Freshness

The Dashboard should reflect near-real-time state — creating an item
elsewhere in the app and returning to the Dashboard should show it in
Recent Items without requiring a manual refresh (client-side
revalidation on navigation is sufficient; a live-updating websocket feed
is not required for MVP).

## Empty States

For a brand-new account (or one with very few items), each section
should degrade gracefully:
- Recent Items / Recently Viewed: a friendly empty state encouraging
  the user to save their first item, rather than a blank section.
- Favorites: an empty state explaining what favoriting does, with no
  broken layout.
- Upcoming Reminders: simply omitted or shown as "no upcoming reminders"
  if none exist — not an error state.

## Performance

The Dashboard is the first screen most sessions load, so its combined
queries (recent items, recently viewed, favorites, recent collections,
statistics, reminders) should be optimized to load together efficiently
rather than as many sequential round-trips; a single aggregated backend
endpoint (or a small number of parallelized ones) is preferred over the
client firing six separate sequential requests.

## Error States

- If one Dashboard section fails to load (e.g., statistics query times
  out) the rest of the Dashboard should still render — a single
  section's failure should show a small inline error/retry for that
  section only, not block the whole page.

## Out of Scope for MVP

- Customizable/rearrangeable Dashboard widgets
- Cross-account or team activity feeds
- Charts/graphs for statistics (numeric summaries only)

## Acceptance Criteria

- [ ] Dashboard loads all six sections (recent items, recently viewed,
      favorites, recent collections, statistics, upcoming reminders)
      correctly for an account with existing data.
- [ ] Each section has a sensible, non-broken empty state for a new
      account.
- [ ] Creating or editing an item elsewhere in the app is reflected on
      the Dashboard on next navigation to it.
- [ ] A failure in one section does not prevent the rest of the
      Dashboard from rendering.
- [ ] Covered by integration tests (aggregated dashboard endpoint
      correctness) and an end-to-end test verifying newly created/
      favorited items appear in the correct Dashboard sections.
