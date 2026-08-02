# Nexus — Per-Feature Test Cases (source of truth)

> Populated during `/ship-feature`'s Plan step, one heading per feature, in build order. Each
> feature's test file implements exactly the cases listed under its heading — `it(...)` name ↔
> case. Cross-cutting rules (RLS, auth error shape, no info leak) are NOT repeated here — they
> live once in `.claude/docs/qa-checklist.md`. See `.claude/docs/testing.md` for the full
> rhythm.

Format per feature:

```
## <Feature name> (Day N)
- [ ] Case description, specific to this feature's actual behavior
- [ ] Another case — an edge case unique to this feature, not a generic template
```

---

## Worked example — Register / Login (Day 2)
- [ ] Registering with a password under 8 characters shows inline validation before submit, no request sent
- [ ] Registering with an already-used email behaves identically (same "check your email" screen) as a new registration
- [ ] Logging in with a correct email + wrong password shows the generic "Invalid email or password" message
- [ ] Logging in with an unverified account shows the verify-email prompt with a working resend button
- [ ] Resending the verification email twice within 60 seconds is rate-limited with a clear message

## Worked example — Website Bookmarks save flow (Day 5)
- [ ] Pasting a valid URL creates a visible item immediately, before metadata resolves
- [ ] Pasting an unreachable URL still creates the item, shows "metadata unavailable" within ~10s, and offers manual retry
- [ ] Pasting a URL that canonicalizes to an already-saved bookmark shows the non-blocking duplicate prompt
- [ ] Manually retrying a failed metadata fetch re-enqueues exactly one job, not a retry loop

---

*(Real feature headings get appended below this line as `/ship-feature` runs, in the order
built — delete these two worked examples once the first real feature's cases are recorded, or
leave them as a style reference; either is fine.)*

## Register (Day 2)
- [x] Password under 8 characters shows an inline error, no Supabase call is made
- [x] Password with no digit shows an inline error, no Supabase call is made
- [x] Password with no letter shows an inline error, no Supabase call is made
- [x] Password/confirmation mismatch shows an inline error, no Supabase call is made
- [x] Valid unique email/password calls `signUp` and shows the "check your email" screen, not a logged-in state
- [x] A mocked `user_already_exists` error (the shape Supabase returns locally, where email confirmation is disabled) shows the identical "check your email" screen — no distinguishing signal. With confirmations enabled (staging/prod), Supabase already returns `error: null` for a duplicate, which the plain success case (above) covers.
- [x] A mocked network/server error shows a retry-able error message, not a silent failure
- [x] Password requirement hints are visible before any submit attempt
- [x] The submit button is never left stuck disabled after an error
- [x] (Playwright `@smoke`) Filling the register form with valid unique data and submitting lands on the check-your-email screen — green, running the real Chromium browser (`e2e/register.spec.ts`), after fixing the `playwright`-in-Docker infra blocker (see PROGRESS.md's `chore/e2e-playwright-docker-fixes` note).

## Email verification (Day 2)
- [x] Visiting `/auth/confirm` with a valid `token_hash` + `type=email` calls `verifyOtp` and redirects to `/verify-email?status=success`
- [x] Visiting `/auth/confirm` with a missing `token_hash` redirects to `/verify-email?status=invalid` without calling `verifyOtp`
- [x] Visiting `/auth/confirm` with an unsupported `type` value redirects to `/verify-email?status=invalid` without calling `verifyOtp`
- [x] A `verifyOtp` error coded `otp_expired` redirects to `/verify-email?status=expired`
- [x] Any other `verifyOtp` error redirects to `/verify-email?status=invalid`
- [x] `/verify-email` renders distinct heading/body/action for `status=success`, `status=expired`, and `status=invalid`
- [x] `/verify-email` with a missing or unrecognized `status` value falls back to the `invalid` state rather than crashing
- [x] On the register "check your email" screen, clicking "Resend email" calls `supabase.auth.resend` with `{ type: "signup", email }`
- [x] After a successful resend, the button is disabled and shows a 60s cooldown; clicking again before it elapses does not call `resend` again
- [x] A mocked `over_email_send_rate_limit` resend response shows a "please wait" message (not the generic error) and still starts the cooldown
- [x] A mocked generic resend failure shows a retry-able error message, keeps the check-your-email screen visible, and does not start a cooldown
- [x] A mocked "already confirmed" resend error shows the same generic message as any other failure — doesn't reveal account state
- [x] (Playwright `@smoke`) Registering, fetching the confirmation email from local Mailpit, and following the link lands on `/verify-email?status=success` — green, running the real Chromium browser (`e2e/verify-email.spec.ts`).

## Login (Day 2)
- [x] Submitting with an empty email and/or password shows inline "required" errors, no `signInWithPassword` call
- [x] Submitting an invalid email format shows an inline error, no call
- [x] A mocked `invalid_credentials` error shows "Invalid email or password" inline and stays on the login form (not swapped to a different screen)
- [x] A mocked `email_not_confirmed` error swaps to the "please verify your email" state and renders a working resend control
- [x] A successful `signInWithPassword` call redirects to `/`
- [x] A mocked network/server error shows a retry-able message, distinct from the invalid-credentials copy
- [x] The submit button is never left stuck disabled after an error
- [x] (Playwright `@smoke`) Register, verify via the real Mailpit link, then log in — lands on `/` with a session cookie set — green, running the real Chromium browser (`e2e/login.spec.ts`).

## Logout (Day 2)
- [x] Clicking "Log out" calls `supabase.auth.signOut()`
- [x] A successful sign-out redirects to `/` and refreshes
- [x] A mocked sign-out failure shows a retry-able inline error and does not navigate away
- [x] The logout button is never left stuck disabled after an error
- [x] The landing page renders "Signed in as {email}" and a working Logout button when `getUser()` returns a user
- [x] The landing page renders Log in/Register links and no Logout button when `getUser()` returns no user
- [x] (Playwright `@smoke`) Register, verify via the real Mailpit link (already signed in), confirm `/` shows the signed-in state, log out, confirm no session cookie remains — green, running the real Chromium browser (`e2e/logout.spec.ts`).

## Notes — create, edit title/body (Day 3)
- [x] `CollectionCard`'s name links to `/collections/:id` (needed so a collection's notes are reachable at all)
- [x] `createNoteSchema` rejects a missing/malformed `collection_id`
- [x] `createNoteSchema` rejects a title over 200 characters
- [x] `updateItemSchema` rejects an empty payload (no fields at all)
- [x] `updateItemSchema` rejects a whitespace-only title
- [x] `POST /api/items` defaults the title to "Untitled Note" when omitted
- [x] `POST /api/items` always inserts `type: "note"` regardless of what's in the payload
- [x] `POST /api/items` returns 404 when `collection_id` doesn't belong to the caller (or is trashed) — the ownership check the self-review caught
- [x] `POST /api/items` returns 400 when `collection_id` is missing
- [x] `POST /api/items` returns 500 and logs server-side on an insert failure
- [x] `GET /api/items` only returns the caller's own items (`owner_id` filter passed to the query)
- [x] `GET /api/items` applies the `collection_id` filter when provided
- [x] `GET /api/items/:id` returns 404 (`not_found`) for an id that doesn't exist or belongs to another user
- [x] `PATCH /api/items/:id` updates title/description and returns the updated row
- [x] `PATCH /api/items/:id` returns 400 when the payload has no fields
- [x] `PATCH /api/items/:id` returns 404 (`not_found`) on a nonexistent/foreign id
- [x] `NoteEditor` loads the item and shows it (superseded by the rich-formatting feature below —
  now a rendered view by default, not the raw form fields)
- [x] `NoteEditor`'s Save button calls `PATCH` with the edited title/body (superseded by Notes —
  autosave below — there's no Save button anymore, PATCH now fires via debounced autosave)
- [x] `NoteEditor` shows an inline error for a blank title and never calls `PATCH` (still true
  under autosave — see Notes — autosave below)
- [x] `NoteEditor` shows a generic retry-able error when the save request fails (superseded by
  Notes — autosave below — replaced by the automatic-retry-with-backoff + persistent indicator)
- [x] `CollectionDetailView`'s "New Note" button POSTs with the current `collection_id` and navigates to the created item's editor page
- [x] `CollectionDetailView` lists existing notes, falling back to "Untitled Note" for a blank title
- [x] (Playwright `@smoke`) Register, open the default Inbox collection, create a note, edit title + body, Save, reload the page, confirm both persisted (superseded — this scenario is now folded into the extended `e2e/notes.spec.ts` test under the rich-formatting heading below, which also covers formatting).

## Notes — rich formatting (Day 3)
- [x] `NoteBody` shows a "No content yet" placeholder for an empty or whitespace-only body
- [x] `NoteBody` renders `#`/`##` as real `<h1>`/`<h2>` heading elements
- [x] `NoteBody` renders `**bold**`/`_italic_`/`~~strikethrough~~` as `<strong>`/`<em>`/`<del>`
- [x] `NoteBody` renders `-`/`1.` lists as real `<ul>`/`<ol>` elements
- [x] `NoteBody` renders a GFM table (`| A | B |`) as real `<table>`/`<th>`/`<td>` elements
- [x] `NoteBody` renders a link as a real `<a>` opening in a new tab with `rel="noopener"`
- [x] `NoteBody` renders `- [x]`/`- [ ]` task-list items as disabled checkboxes with the correct checked state
- [x] `NoteBody` renders a fenced code block with a language tag as highlighted `<code class="hljs language-*">`
- [x] `NoteBody` renders raw HTML embedded in the source as literal escaped text, not executed markup (XSS-safety case)
- [x] `NoteBody` does not turn a `javascript:` link into an executable `href` (self-review-requested regression case, alongside the raw-HTML one)
- [x] `NoteEditor` opens in view mode (rendered body), not the raw textarea — for a note that already has content
- [x] `NoteEditor` opens straight into edit mode for a freshly created note (default title, empty body) — self-review caught that always defaulting to view mode added a mandatory extra click before a brand-new note could be typed into at all, against the "save in under 10s" promise
- [x] `NoteEditor`'s "Edit" button switches to the textarea, pre-filled with the raw Markdown source
- [x] `NoteEditor`'s Save returns to view mode showing the newly rendered content (superseded by
  Notes — autosave below — "Save" is now "Done", and doesn't imply a save just happened)
- [x] `NoteEditor`'s "Cancel" button discards the draft and returns to view mode unchanged
  (superseded by Notes — autosave below — there's no discard concept anymore; "Done" replaces
  "Cancel" and never reverts unsaved content)
- [x] `NoteEditor` stays in edit mode with the draft intact when a save fails, showing the inline error (refined from the original plan's "click Edit again" framing — matches `CollectionCard`'s existing edit-form pattern of not auto-exiting on error) (superseded by Notes — autosave below)
- [x] (Playwright `@smoke`, `e2e/notes.spec.ts` extended/renamed) Creating a note (lands in edit mode immediately), saving a body with a heading, bold text, and a checklist item renders real `<h1>`/`<strong>`/checkbox elements — both immediately after Save and again after a full page reload, not raw Markdown syntax; Edit still shows the raw source afterward.

## Notes — Markdown source / WYSIWYG toggle (Day 3)
- [x] `NoteRichTextEditor` initialized with a Markdown string covering headings, bold/italic/strike, lists, a task list, a link, and a blockquote renders the equivalent rich elements (not raw Markdown syntax) — proves the parse side of the `Markdown` extension is wired correctly
- [x] `NoteRichTextEditor` round-trips: initialize with a Markdown string covering every supported content type, immediately read the serialized Markdown back out via its `onChange` callback, and confirm it's semantically equivalent to the input — proves parse and serialize both work, not just one direction
- [x] Clicking the Bold toolbar button after `editor.commands.selectAll()` wraps the selected text in `**...**` in the serialized Markdown
- [x] Selecting a language from the code-block `<select>` (shown only while the cursor is inside a code block) updates that block's `language` attribute, reflected in the serialized fenced-code-block markdown (` ```language `)
- [x] The "Insert table" toolbar button inserts a table whose serialized Markdown is a valid GFM table; "Add row" (shown only while inside a table) increases the row count
- [x] The Link toolbar button is disabled with no text selected, and enabled once text is selected; submitting the inline URL form applies a Markdown link (`[text](url)`) around the selection rather than navigating away
- [x] The Image toolbar button's inline URL form inserts a Markdown image reference (`![](url)`) for an `http(s)` URL, and does nothing for a `javascript:` URL (self-review-requested regression case — `Image`, unlike `Link`, has no built-in URI validation)
- [x] `Markdown.configure({ html: false })`: raw HTML typed into the editor is not executed as markup in the serialized output (regression case mirroring `NoteBody`'s existing raw-HTML-safety test)
- [x] `NoteEditor` defaults to the Markdown (textarea) surface when entering edit mode, unchanged from before
- [x] `NoteEditor`'s toggle switches from Markdown to Rich text and shows the same content, parsed
- [x] `NoteEditor`'s toggle switches from Rich text back to Markdown and shows the same content, serialized back to the original Markdown text (not a stale/reverted snapshot) — the mount/unmount sync round-trip
- [x] `NoteEditor`'s Save button works correctly when the last edit happened in Rich text mode (proves the continuous `onUpdate → setBody` sync while mounted, not just the toggle-boundary mount/unmount sync) (superseded by Notes — autosave below — no Save button anymore; see its "Rich text surface also drives autosave" case)
- [x] (Playwright `@smoke`, `e2e/notes.spec.ts` extended) Create a note, switch to Rich text, use the toolbar to add a heading and bold text, switch back to Markdown and confirm the raw syntax is present, Save, reload, confirm the rendered view (`NoteBody`) shows real elements for both.

## Notes — autosave (Day 3)
- [x] `useNoteAutosave` does not call `save` immediately on a draft change — waits out the 1500ms debounce
- [x] `useNoteAutosave` collapses rapid successive changes within the debounce window into a single `save` call
- [x] `useNoteAutosave` status goes `saving` → `saved` on a successful save
- [x] `useNoteAutosave` never schedules a save while `enabled` is false, even when the draft changes
- [x] `useNoteAutosave`'s `resetBaseline` marks the current draft as already-saved, so an unchanged draft never triggers a save (regression case for the "loading a note looks like an unsaved change" bug this call avoids)
- [x] `useNoteAutosave`: a failed save schedules an automatic retry with backoff; status is `retrying` meanwhile
- [x] `useNoteAutosave`: after exhausting all configured retries, status becomes `error` and auto-retrying stops
- [x] `useNoteAutosave`'s `retryNow()` re-attempts immediately from `error`; success returns status to `saved`
- [x] `useNoteAutosave`: a new edit arriving while a retry is pending/in-flight still autosaves once its own save settles — the newer draft is not silently marked "already saved" just because an older in-flight request resolved (self-review-caught race: `lastSavedRef` must be stamped with the draft that was actually sent, not whatever the live ref points at by the time the request resolves)
- [x] `useNoteAutosave`: pending timers are cleared on unmount (no post-unmount `setState`)
- [x] `NoteEditor`: typing in the title or body triggers an autosave PATCH after the debounce — no Save button present anywhere in edit mode
- [x] `NoteEditor`: the status indicator shows "Saving…" while in flight and "Saved" once it completes
- [x] `NoteEditor`: clearing the title shows "Title is required", disables "Done", and never triggers a PATCH
- [x] `NoteEditor`: a failed autosave leaves the typed content in the fields (nothing discarded) and, once retries are exhausted, shows "Not saved" with a working "Retry now" action
- [x] `NoteEditor`: the "Not saved"/"Retry now" indicator stays visible after leaving edit mode (Done) — self-review-caught gap: it previously only rendered inside the edit-mode branch, so a still-failing save became invisible the moment the user left edit mode, contradicting Notes.md's "persistent... indicator" requirement
- [x] `NoteEditor`: leaving edit mode (Done) and reopening it (Edit) preserves an in-progress draft instead of reverting to the last-synced server value (regression test for the `startEditing` discard-bug fix)
- [x] `NoteEditor`: editing via the Rich text surface also drives the same autosave cycle as Markdown
- [x] (Playwright `@smoke`, `e2e/notes.spec.ts`) Create a note, type a title/body, wait for the debounced autosave (no Save click), reload, confirm the content persisted.

## Notes — version history (Day 3)

> Design note: the plan originally scoped coalescing via a client-supplied `newVersionBoundary`
> boolean. Self-review found that inferring "the currently open version" as "whichever
> note_versions row has the newest created_at" could silently corrupt an unrelated, genuinely
> historical row whenever an earlier boundary-opening insert had failed. Fixed by tracking the
> open version's actual id end-to-end (`openVersionId` in the request, `versionId` echoed back
> in the response) instead of re-deriving "latest" — the cases below reflect that design, not
> the original boolean-flag one.

- [x] `PATCH /api/items/:id` returns 400 for a body containing only `openVersionId` (no real field) — the `updateItemSchema` refine needed to explicitly exclude it from the "at least one field" check
- [x] `PATCH /api/items/:id`: a title-only update (no `description`) never touches `note_versions` and returns `versionId: null`
- [x] `PATCH /api/items/:id`: `openVersionId` omitted inserts a new version row
- [x] `PATCH /api/items/:id`: `openVersionId` provided and matching an existing row updates it in place (coalesce) rather than inserting
- [x] `PATCH /api/items/:id`: an `openVersionId` that doesn't match any row for this item (stale/foreign id) falls back to inserting a new row rather than silently doing nothing
- [x] `PATCH /api/items/:id`: a `description` unchanged from the currently-stored value doesn't write a version
- [x] `PATCH /api/items/:id`: version-write logic is skipped entirely for non-note item types
- [x] `PATCH /api/items/:id`: a version-write failure (insert or coalesce-update throws) still returns 200 with the updated item and `versionId: null`, and logs server-side
- [x] `GET /api/items/:id/versions` returns 400 on an invalid item id, 401 unauthenticated, 404 when the item doesn't exist/isn't owned (explicit check, not just an empty list), and versions ordered newest-first as `{id, created_at}` only (no `content`); 500 + logs on a query failure
- [x] `GET /api/items/:id/versions/:versionId` returns 400 on an invalid item or version id, 404 when the item itself is gone/trashed (self-review-caught gap: this route didn't originally check `deleted_at`, unlike its sibling list route), 404 when the version doesn't exist or belongs to a different item, and the version's full content on success
- [x] `POST /api/items/:id/versions/:versionId/restore` returns 400/401/404 as above; on success updates the item's `description` to the version's content, inserts a **new** `note_versions` row with that content (not a reuse of the restored one), and returns the updated item plus the new version's id (`versionId`); a failure inserting that new row still returns 200 with the restored item and `versionId: null` (self-review-caught: this `null` is what tells the client's next autosave to open a fresh boundary instead of guessing at, and corrupting, some other row)
- [x] `NoteVersionHistory` fetches and renders the version list with formatted timestamps on mount
- [x] `NoteVersionHistory` shows an empty-state message when there are no versions yet
- [x] `NoteVersionHistory` shows a retry-able error if the list fetch fails
- [x] `NoteVersionHistory`: clicking "Preview" fetches and renders that version's content read-only via the existing `NoteBody` component (real elements, not raw Markdown)
- [x] `NoteVersionHistory`: clicking "Restore this version" calls the restore endpoint and invokes `onRestored` with the restored content and the new version's id
- [x] `NoteEditor`: the "History" toggle shows/hides the panel, in both view and edit mode
- [x] `NoteEditor`: restoring a version updates the visible body and does not immediately fire another autosave PATCH for that same content (proves `resetBaseline` is called)
- [x] `NoteEditor`: the first autosave after entering Edit mode sends `openVersionId: null`; after a restore, the next autosave sends the restore's returned `versionId` (proves the id round-trips through `NoteEditor` rather than being re-derived)
- [x] `NoteEditor` regression (self-review-caught race): a stale in-flight autosave response that resolves *after* a restore doesn't clobber the restored content or which version the next autosave coalesces into (`saveGenerationRef` guard)
- [x] (Playwright `@smoke`, `e2e/notes.spec.ts` extended) Three separate edit sessions on the same note each open their own version; opening History lists all three, previewing and restoring the oldest one brings its content back as the current rendered view immediately, and again after a reload.
