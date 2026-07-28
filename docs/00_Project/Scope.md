# Scope

This document defines the boundary of the first release (the MVP) and
distinguishes it from later phases. It is the single source of truth for
"is this in scope right now" questions during development.

## In Scope — MVP (v1.0)

### Account & Access
- Registration, login, logout
- Email verification
- Password reset and change
- Profile management (name, avatar, basic settings)

### Organization
- Collections (create, rename, delete, archive, favorite, color/icon)
- Tags (create, edit, delete, merge, filter)
- Favorites (collections and items)
- Archive (soft-hide without deleting)
- Trash (soft-delete with restore, and permanent delete)

### Knowledge Items
- Notes (rich text / Markdown, autosave, checklists, code blocks, tables,
  version history)
- Website bookmarks (URL metadata fetch: title, description, OG image,
  favicon, canonical URL, domain)
- PDFs (upload, preview, extracted-text search, download)
- Images (upload, preview, download)
- General file uploads (common file types via Supabase Storage)
- Code snippets (language tag, syntax highlighting, description)

### Search & Discovery
- Global search across titles, content, tags, and metadata
- Filtering and sorting
- Recent searches
- Dashboard (recent items, favorites, recently viewed, statistics,
  upcoming reminders)

### Notifications
- Reminders: one-time, daily, weekly, monthly, custom
- Delivery channel: email (Phase 1 only)

### Sharing
- Public, view-only share links for individual items

### Platform Quality
- Responsive UI (desktop and mobile browser, not a native app)
- Row Level Security and authorization on all data access
- Automated testing (unit, integration, end-to-end)
- CI/CD with staging and production environments
- Basic accessibility (keyboard navigation, screen reader labeling,
  color contrast)
- Error boundaries, retry logic, structured logging

## Explicitly Out of Scope — MVP

These are acknowledged, intentional exclusions from the first release —
not oversights:

- Multi-user collaboration and shared workspaces
- Real-time collaborative editing
- Complex, per-item permission systems
- Payments, billing, or subscriptions
- Native mobile or desktop applications
- Offline sync
- Live chat or messaging between users
- Advanced AI assistants
- Large-scale web crawling
- Notification channels beyond email (Telegram, Discord, Slack, WhatsApp,
  push)
- Password-protected or expiring share links
- Semantic / AI-powered search

## Planned Future Phases (Post-MVP)

Documented at a lower level of detail in `02_Development/`, these are
directional, not committed:

- Browser extension for one-click capture
- Telegram notification channel
- AI features: auto-summary, auto-tagging, duplicate detection, related
  items, smart collections
- Semantic search
- RSS feed items as a Knowledge Item type
- GitHub repository items as a Knowledge Item type

## How to Use This Document

If a feature request or implementation question isn't clearly answered by
"In Scope — MVP," the default answer is: it's out of scope for now. Any
change to this boundary should be a deliberate scope decision, recorded by
updating this file, not an incidental choice made mid-implementation.
