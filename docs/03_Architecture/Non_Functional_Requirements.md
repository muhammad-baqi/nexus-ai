# Non-Functional Requirements

These requirements apply across the entire application, regardless of
feature, and are referenced rather than repeated in each MVP document.

## Performance

- Responsive UI across desktop and mobile browser widths.
- Global Search returns within 500ms server-side at up to 5,000 items
  per user (see `01_MVP/Search.md`, `00_Project/Success_Metrics.md`).
- Lazy loading and pagination for any list that could grow large (item
  lists, activity log, trash).
- Images are served at appropriately sized/optimized resolutions rather
  than always full-size (thumbnails for grid views, per
  `01_MVP/File_Uploads.md`).

## Security

- Authentication via Supabase Auth; no custom password storage.
- Authorization enforced via Row Level Security at the database layer
  on every table containing user data, not solely at the application
  layer (see `03_Architecture/Database_Schema.md`).
- Rate limiting on sensitive actions: login attempts, password
  reset/verification email requests (see `01_MVP/Authentication.md`).
- Input validation on both client and server for all user-submitted
  data — client-side validation is a UX convenience, never the
  authoritative check.
- Secure file uploads: private-by-default storage, MIME-type
  verification, size/type limits enforced server-side (see
  `01_MVP/File_Uploads.md`).

## Accessibility

- Full keyboard navigation for all interactive elements (forms, menus,
  the note editor, search).
- Screen reader support: semantic HTML and ARIA labeling where needed,
  particularly for icon-only buttons and the rich-text editor toolbar.
- Color contrast meeting WCAG AA at minimum, including in both light and
  dark themes.

## Reliability

- Error boundaries around major UI sections so one component's failure
  doesn't blank the whole page (see `01_MVP/Dashboard.md` for a concrete
  application of this).
- Retry mechanisms for transient failures (autosave, background job
  dispatch, email delivery) with sensible backoff, not infinite silent
  retry loops.
- Structured logging for background jobs and API errors, sufficient to
  debug a failure after the fact without needing to reproduce it live.
- Graceful degradation: a failing enhancement (e.g., bookmark
  screenshot, PDF text extraction) should never take down the core
  feature (saving/viewing the item) it's attached to.

## Testing

Per `00_Project/Success_Metrics.md`, every MVP feature requires:
- Unit tests for business logic (validation, recurrence calculation,
  URL canonicalization, etc.)
- Integration tests for API routes, including explicit RLS/authorization
  checks (a user cannot access another user's data even by guessing IDs)
- At least one end-to-end test (Playwright) covering its primary user
  journey

CI must run lint, type-check, and the full test suite before any
staging or production deploy proceeds, per the Development Cadence in
`00_Project/Roadmap.md`.
