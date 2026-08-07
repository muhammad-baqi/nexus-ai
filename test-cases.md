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

## Notes — checklist toggle from view (Day 3)

> Design note: the plan's original `toggleTaskAtIndex` was a hand-rolled line-scan regex.
> Self-review verified (against the real installed `react-markdown`/`remark-gfm`) that this
> miscounted checkboxes for realistic content — ordered-list task items, a task item nested in
> a blockquote, and a fenced code block containing task-marker-looking text all disagreed with
> react-markdown's actual rendering order. Replaced with a real `remark-parse`/`remark-gfm`
> parse + `unist-util-visit` walk + `remark-stringify` serialize, so "the Nth checkbox this
> function finds" and "the Nth checkbox react-markdown renders" are guaranteed to agree (same
> library, same rules). The cases below reflect that final design.

`lib/notes/toggle-task.test.ts`:
- [x] Flips an unchecked item (`[ ]` → `[x]`) at the given index, leaving every other line untouched
- [x] Flips a checked item (`[x]` → `[ ]`) at the given index
- [x] Returns `null` for an out-of-range index rather than corrupting content
- [x] Preserves the `-` bullet style (matches this app's own Markdown convention) rather than `remark-stringify`'s default `*`
- [x] Regression: counts task items nested in a blockquote and mixed with an ordered list in true document order, matching react-markdown's real rendering order (the case self-review's line-scan-regex version got wrong)
- [x] Regression: does not mistake task-marker-looking text inside a fenced code block for a real checkbox

`components/notes/note-body.test.tsx` (extended):
- [x] Checkboxes stay `disabled` and inert when `onToggleTask` is omitted (existing case, reconfirmed — the read-only/preview path is unchanged)
- [x] When `onToggleTask` is provided, checkboxes are not disabled, and clicking the Nth one calls `onToggleTask` with `index = N`

`components/notes/note-editor.test.tsx` (extended):
- [x] Clicking a checkbox in view mode immediately PATCHes the item with the toggled content — no debounce wait, no Edit click needed first
- [x] The view updates optimistically before the PATCH resolves, and reflects the server's response once it does
- [x] A failed toggle reverts the checkbox to its prior state and shows an inline error
- [x] The toggle sends the currently-open `openVersionId`, coalescing into the same version as autosave would

Fixed via self-review (not separately re-tested as distinct cases, since they're the same
mechanisms already covered above/elsewhere): the toggle handler reads its base content from
`body` (the true live state), not `item.description` (which can lag behind `body` for a moment
after Done is clicked before the autosave debounce fires) — reusing the exact regression
scenario already covered by "leaving edit mode (Done) and reopening it (Edit) preserves an
in-progress draft" case above, just for the toggle path instead of the reopen-Edit path. View
mode's `NoteBody` now also renders `body` instead of `item.description`, for the same reason.

- [x] (Playwright `@smoke`, `e2e/notes.spec.ts` extended) From the rendered (non-edit) view of a note with an existing checklist, click a checkbox directly — no Edit click — confirm it becomes checked immediately, reload, confirm it persisted.

## Shared item behavior — tag (create/rename/delete/merge), favorite, archive (Day 3)

> Self-review (code-reviewer subagent) caught a real gap: `PATCH`/`GET /api/items/:id` and the
> attach/detach tag routes originally coalesced a failed tags re-read to `tags: []` — on a
> transient failure right after a successful mutation (including every autosave!), that silently
> reported "this item now has zero tags" and the UI would wipe the tag chips even though nothing
> was actually lost server-side. Fixed by passing the read failure through as `tags: null`
> (distinct from a genuinely-empty `[]`) end-to-end; the client (`NoteEditor`'s `mergeServerItem`,
> `TagInput`'s add/remove handlers) treats `null` as "unconfirmed, keep what's already shown"
> instead of overwriting good local state. Also added `lib/items/tags.test.ts` (not in the
> original plan) covering `getOrCreateTag`'s concurrent-insert race-retry path, which self-review
> flagged as the riskiest untested logic in this diff.

`lib/validation/tags.test.ts`:
- [x] `tagNameSchema` rejects empty/whitespace-only and >50-char names
- [x] `mergeTagsSchema` rejects `source_tag_id === target_tag_id`

`lib/items/tags.test.ts` (added during self-review):
- [x] `fetchItemTags` flattens joined rows into a sorted list; returns `[]` for genuinely no tags, `null` (+ logs) on a query failure
- [x] `getOrCreateTag` reuses an existing case-insensitive match without inserting; creates a new tag when none matches; recovers from a concurrent-insert race (`23505`) by re-fetching; returns `null` (+ logs) on a non-race insert failure or a failed initial lookup

`app/api/items/[id]/route.test.ts` (extended):
- [x] `PATCH` accepts `is_favorite`/`is_archived` alone or together with other fields
- [x] `GET` response includes a `tags` array reflecting currently-attached tags, empty array when none
- [x] `GET`/`PATCH` return `tags: null` (not `[]`) when the tags read fails after an otherwise-successful request (regression for the self-review fix above)

`app/api/tags/route.test.ts`:
- [x] `GET` returns only the caller's tags, sorted by name; empty array when none
- [x] `GET` requires auth (401)

`app/api/tags/[id]/route.test.ts`:
- [x] `PATCH` renames; 400 invalid id/name; 404 not owned/doesn't exist; 409 case-insensitive duplicate name
- [x] `DELETE` removes the tag and detaches it from every item that had it (join rows gone); 404 not owned/doesn't exist

`app/api/tags/merge/route.test.ts`:
- [x] 400 when `source_tag_id === target_tag_id`; 404 when either tag isn't owned/doesn't exist
- [x] merging reassigns every item from source to target and deletes the source tag
- [x] merging when an item already has both tags doesn't error (dedupe, not a PK-conflict 500)
- [x] a failure deleting the source tag after reassignment logs and returns 500, not a silent "success"

`app/api/items/[id]/tags/route.test.ts`:
- [x] `POST` with a brand-new name creates the tag and attaches it
- [x] `POST` with a name matching an existing tag case-insensitively reuses it (no duplicate tag row) and attaches it
- [x] `POST` attaching an already-attached tag is a no-op success, not an error
- [x] 404 when the item isn't owned/doesn't exist/is trashed
- [x] still returns 201 with the attached tag when the post-attach tags re-read fails (regression)

`app/api/items/[id]/tags/[tagId]/route.test.ts`:
- [x] `DELETE` detaches the tag; item's other tags untouched
- [x] `DELETE` on a tag that isn't attached returns success (idempotent), not 404
- [x] 404 when the item isn't owned/doesn't exist
- [x] still returns 200 with `tags: null` when the post-detach tags re-read fails (regression)

`components/notes/tag-input.test.tsx`:
- [x] renders existing tags as chips
- [x] adding a tag (Enter or Add button) calls the attach endpoint and shows the new chip optimistically; rolls back + shows an error on failure
- [x] removing a tag (chip "×") calls the detach endpoint and removes it optimistically; rolls back + shows an error on failure
- [x] adding/removing when the server reports `tags: null` merges/keeps the local change instead of clobbering it (regression)

`components/notes/note-editor.test.tsx` (extended):
- [x] Favorite/Archive buttons toggle state and PATCH the expected body, in both view and edit mode
- [x] `TagInput` is rendered with the note's current tags

`components/collections/collection-detail-view.test.tsx` (extended):
- [x] archived items are hidden from the default list; "Show archived" reveals them with an "(Archived)" label
- [x] favorited items show the "★" marker

`components/tags/tag-management-view.test.tsx`:
- [x] lists tags; rename succeeds and reflects immediately; duplicate-name rename shows inline error
- [x] delete removes the tag from the list after confirmation
- [x] merge (select target + submit) removes the source tag from the list

`components/layout/app-nav.test.tsx` (extended):
- [x] links to the new `/tags` page

- [x] `e2e/notes.spec.ts` extended with the favorite/archive/tag/"Show archived" assertions (code
      written, appended after the existing version-history flow). **Not confirmed green by an
      actual Playwright run**: the existing (pre-this-feature) version-history section of this
      same spec fails in this local Docker environment independent of any change here — reproduced
      on a clean `develop` checkout with zero diff applied (`git stash -u`, re-ran, same failure at
      a different assertion in the same block). Given the day's "known local environment quirk"
      precedent (Turbopack dev-server staleness, documented repeatedly in `PROGRESS.md`), this is
      treated the same way: a pre-existing local-only gap, not a regression, not re-diagnosed here.
      The functionality itself (favorite, archive, tag attach/detach/rename/delete/merge,
      collection archived-hide/show) was instead verified live against the real local Supabase
      stack via direct `fetch()` calls from an authenticated browser tab (Claude-in-Chrome) —
      create note → favorite → archive → attach two tags → detach one → re-fetch confirms all
      four states persisted; collection list endpoint confirms `is_favorite`/`is_archived` are
      present per item (what `collection-detail-view.tsx`'s hide/show-archived logic reads); tag
      rename and a merge where the item already carried *both* tags before merging (the dedupe
      case self-review flagged) both confirmed correct against real Postgres, not mocks.

RLS — verified live against PostgREST with a second real account (`day3-rls-user2@...`), not just
mocked: its token gets `[]` reading the first account's item directly, `[]` (0 rows, silent) on a
PATCH attempting to favorite that item or rename the first account's tag, and an explicit `42501`
row-level-security-violation 403 attempting to attach the first account's tag to the first
account's item.

## Shared item behavior — move between collections (Day 3)

`app/api/items/route.test.ts` (unchanged behavior, regression after the ownership-check refactor):
- [x] `POST` still rejects a `collection_id` that doesn't belong to the caller or is trashed, exactly as before extracting `verifyCollectionOwnership`

`app/api/items/[id]/route.test.ts` (extended):
- [x] `PATCH` with a `collection_id` the caller owns (not trashed) moves the item; response reflects the new `collection_id`
- [x] `PATCH` with a `collection_id` owned by another user, or one that belongs to the caller but is trashed, returns 404 `collection_not_found` without touching `knowledge_items` (same combined case as the existing item-ownership 404 test above it)
- [x] Moving an item leaves its `tags`, `is_favorite`, `is_archived` untouched in the same response

`components/notes/move-item-control.test.tsx` (new):
- [x] renders the current collection preselected, merging both active and archived (non-trashed) collections from the two list fetches
- [x] selecting a different collection PATCHes `collection_id` and calls `onMoved` with the new id
- [x] a failed move (404) shows an inline error, reverts the select to the original collection, and re-fetches the collections list

`components/notes/note-editor.test.tsx` (extended):
- [x] `MoveItemControl` is rendered in both view and edit mode with the item's current `collection_id`
- [x] its `onMoved` callback updates the locally-held item's `collection_id`

- [ ] `e2e/notes.spec.ts` extended with the move assertion (code written and re-sequenced after
      self-review caught the new block referencing "New collection", a control that only exists on
      the top-level `/collections` page, while still on a collection-detail page — fixed). **Not
      confirmed green by an actual Playwright run**: the run hit the same pre-existing
      version-history-section failure documented under the previous feature's entry above
      (reproduced independent of this change), which occurs earlier in the same spec than the new
      move assertion, so the new code was never reached by that run. Substituted a full live
      verification against the real local Supabase stack instead (see below) — this also doubled as
      the "drive it in a real browser" verify step, since a separate local-environment issue this
      session (the Chrome instance driven by Claude-in-Chrome could not resolve
      `host.docker.internal`, unlike this shell, which could — apparently a different network
      namespace for that specific hostname — even though `127.0.0.1` worked fine in both) blocked
      registering an account through the actual UI this session.

Live verification (direct API calls against the real local Supabase stack, two real confirmed
accounts, no mocks): signed up and confirmed two accounts via the real Mailpit
signup→confirm-link→verifyOtp flow; as user A, created a second collection and a note (with a tag
and `is_favorite: true`) in Inbox, then moved it via a direct PATCH — `collection_id` updated
correctly, and the tag and `is_favorite` were confirmed unchanged afterward. As user B: reading
user A's new collection directly returned `[]` (RLS-blocked — the same query
`verifyCollectionOwnership` runs, confirming its result isn't merely an app-level filter but is
actually backed by `collections`' own `owner_id = auth.uid()` RLS policy already in
`001_initial_schema.sql`), and attempting to move user A's item into user A's own Inbox affected 0
rows (existing `knowledge_items` RLS, unchanged by this feature, already blocks it). Re-fetching
user A's item afterward confirmed it was untouched by B's attempt.

## Shared item behavior — trash / restore / permanent delete (Day 3)

**Scope deviations from the original plan below**, both discovered mid-implementation:
1. Trash listing is a **unified `GET /api/trash`** (items + collections in one response), per
   `docs/03_Architecture/API_Design.md`'s Trash section, not `GET /api/items?view=trashed` — the
   `view` query param was removed from `/api/items` entirely (it never shipped a real caller
   besides the old Trash view). `TrashView` renders two grouped sections ("Collections" /
   "Items"); collection rows restore via the existing `POST /api/collections/:id/restore`
   (collections have no permanent-delete route, only items do, per `Knowledge_Items.md`).
2. Item restore's re-home target isn't just "the Inbox collection": Collections are renamable
   (Day 2), so a user may have renamed their actual Inbox — falling through to "no collection to
   restore into" in that case would be a real dead end, not just a theoretical one. Restore now
   falls back to the caller's oldest surviving collection when no collection named "Inbox" is
   found, before giving up. Since the fallback doesn't always land in Inbox, the route also
   returns the actual target collection's name (`rehomedToCollectionName`) so `TrashedItemRow`'s
   message names where the item really went instead of assuming "Inbox".

**Self-review (code-reviewer subagent) caught one real gap, fixed**: `POST
/api/collections/:id/restore` only cleared the collection's own `deleted_at` — it never restored
the items that were cascade-trashed with it by `DELETE /api/collections/:id` (which stamps a
collection's items with its own `deleted_at` timestamp). This is a named acceptance criterion for
this exact feature ("cascades to collection delete" in `PROGRESS.md`), and the gap was real and
reachable: deleting a Collection with items, then restoring it from Trash, silently left every one
of its items stranded in Trash under a now-live collection. Fixed by capturing the collection's
`deleted_at` before clearing it, then restoring only the `knowledge_items` rows that share that
exact timestamp (not items the caller had trashed individually before or after) — mirrors
`DELETE`'s own cascade pattern, including surfacing a partial cascade failure via
`itemCascadeIncomplete` rather than a silent no-op. New route-level tests plus a new
`e2e/trash.spec.ts` case cover it (below).

`app/api/items/[id]/route.test.ts` (extended, `DELETE`):
- [x] `DELETE` soft-deletes (sets `deleted_at`), returns the updated item
- [x] `DELETE` on an already-trashed/not-owned/nonexistent item returns 404 `not_found`

`app/api/items/[id]/restore/route.test.ts` (new):
- [x] restores in place (`deleted_at: null`, `collection_id` unchanged) when the original
      collection is still live, reports `rehomed: false`
- [x] re-homes into the caller's "Inbox" collection and reports `rehomed: true` when the original
      `collection_id` is itself trashed or no longer exists
- [x] falls back to the caller's oldest surviving collection when no collection named "Inbox" can
      be found (e.g. it was renamed), reports `rehomed: true`
- [x] 404 `not_found` when the item isn't currently trashed, isn't owned, or doesn't exist
- [x] a genuine "no Inbox and no other live collection either" case (should be unreachable in
      practice) returns a clear 500, not a silent no-op

`app/api/items/[id]/permanent/route.test.ts` (new):
- [x] hard-deletes an item that is currently trashed
- [x] 404 `not_found` when the item isn't currently trashed (mirrors the restore guard), isn't
      owned, or doesn't exist

`app/api/trash/route.test.ts` (new):
- [x] returns the caller's trashed items and trashed collections together in one response
- [x] 401 with no session; 500 + log on a query failure (either half)

`app/api/collections/[id]/restore/route.test.ts` (extended):
- [x] 404 `not_found` when the collection isn't in Trash; 500 + log on a non-404 lookup/update
      failure
- [x] restores the collection and cascades restore to the items trashed with it (matched by the
      shared `deleted_at` timestamp)
- [x] still returns 200 but flags `itemCascadeIncomplete` if the item cascade fails

`components/notes/note-editor.test.tsx` (extended):
- [x] "Move to Trash" shows an inline confirm; Cancel makes no request
- [x] confirming DELETEs the item and navigates to its collection detail page

`components/notes/trashed-item-row.test.tsx` (new):
- [x] Restore calls the restore endpoint and reports success via a callback; names the actual
      target collection when the response's `rehomed` is true (both the Inbox case and the
      oldest-surviving-collection fallback case), a plain restored message otherwise
- [x] Permanently Delete requires its own inline confirmation before calling the permanent-delete
      endpoint

`components/notes/trash-view.test.tsx` (new):
- [x] fetches the unified `GET /api/trash` endpoint, renders both trashed items and collections;
      empty state "Trash is empty." only when both lists are empty
- [x] a restored/permanently-deleted item row, or a restored collection row, is removed from the
      list

- [x] New `e2e/trash.spec.ts` `@smoke`: create a note, trash it from the editor, confirm it's gone
      from its collection, visit `/trash`, restore it, confirm it's back in the collection, trash
      it again, permanently delete it from `/trash`, confirm it's gone for good.
- [x] Second `e2e/trash.spec.ts` `@smoke` case (added after self-review's cascade-restore finding):
      create a collection with one note in it, delete the collection (cascade-trashes the note
      too), visit `/trash` and confirm both the collection and the note show up, restore the
      collection, confirm the note is back inside it.

## Global search, filters, sorting, recent searches (Day 4)

Bundled into one feature — search without its own filters/sorting/recent-searches live at the
same time isn't a real product increment, and all five are the same `GET /api/items` route plus
one `/search` page.

`app/api/items/route.test.ts` (extended — GET rewritten to call the new `search_knowledge_items`
RPC instead of a plain `.from()` query):
- [x] 400 for a malformed `collection_id` or an invalid boolean filter value (not `"true"`/`"false"`)
- [x] scopes the search to the caller via `p_owner_id`
- [x] passes `q`/`collection_id` through; `sort` defaults to `relevance` when `q` is present
- [x] `sort` defaults to `updated` when there's no query
- [x] an explicit `sort` override wins even with a query present
- [x] repeated `tag` params collect into `p_tag_ids` (OR filter)
- [x] `favorite=false` maps to `p_favorite: false`, not `undefined` (the JS `Boolean()` coercion trap)
- [x] `page`/`limit` default correctly and compute the right offset
- [x] `created_to` extends to the end of the selected day, not midnight (regression — a
      date-only value must include everything created that day)
- [x] response strips `total_count` off each row and surfaces it as a top-level `total`
- [x] 500 + log on an RPC failure

`app/api/recent-searches/route.test.ts` (new):
- [x] 401 with no session (GET and POST)
- [x] GET returns just the query strings, most recent first
- [x] POST 400 for an empty/whitespace-only query
- [x] POST deduplicates case-insensitively before inserting (re-running a search bumps it, no
      duplicate), and escapes `ilike` wildcard characters first (regression — `%`/`_` in a query
      must match literally, not as a pattern)
- [x] POST trims anything beyond the recent-searches cap after inserting
- [x] 500 + log when the dedupe delete or the list query fails

`lib/search/build-items-query.test.ts` (new — pure query-string-building logic):
- [x] empty filters produce an empty querystring; `q`, filters, and `tag` (repeated per id) all
      serialize correctly, including `favorite: false` (not omitted)
- [x] `page` is omitted when it's 1 (the default), included otherwise
- [x] `hasActiveFilters` is false with nothing (or only `page`) set, true for `q`, a tag, or an
      explicitly-`false` boolean filter

`components/search/search-view.test.tsx` (new):
- [x] fetches items on mount with no query — never a blank screen, shows recent items instead
- [x] debounces search-as-you-type: no fetch mid-typing, exactly one fetch once typing settles
- [x] recent searches show on focus when the query is empty, hide once typing starts (a real bug
      caught manually, not by self-review — the dropdown didn't hide on the first keystroke)
- [x] clicking a recent search fills the input and re-runs the search
- [x] records a recent search only after the query settles — distinct from the shorter
      live-results debounce, confirmed no early record fires
- [x] a filter change adds the right querystring param and resets to page 1
- [x] "no results" state is distinct from the empty-query browse state
- [x] a retryable error state is distinct from an empty result set

- [x] Live-browser verification (dockerized `playwright` service, since a host-run browser can't
      complete login against local Supabase — see the `host.docker.internal` memory note): empty
      query shows items immediately, typing a query filters to matching items only, filter (type)
      + sort (title) combine and return live-sorted results.

## Website Bookmarks — save flow + metadata background job (Day 5)

`lib/validation/items.test.ts` (extended — `createNoteSchema` gains the `type` literal,
`createBookmarkSchema` is new):
- [x] `createNoteSchema` rejects a missing/wrong `type`
- [x] `createBookmarkSchema` accepts a valid http(s) URL, rejects an invalid format, rejects a
      non-http(s) scheme (`javascript:`, `ftp:`), rejects a missing/wrong `type`

`lib/bookmarks/normalize-url.test.ts` (new — pure):
- [ ] Invalid/unparseable URL returns `null`
- [ ] Lowercases scheme + host, drops a default port, strips the fragment and a trailing slash
- [ ] Strips known tracking params (`utm_*`, `fbclid`, `gclid`, `ref`, `igshid`) and sorts
      remaining query params for stable comparison
- [ ] Two URLs differing only by tracking params/case/trailing slash normalize identically

`lib/bookmarks/parse-html-metadata.test.ts` (new — pure, fixture HTML):
- [ ] OG tags (`og:title`/`og:description`/`og:image`) are preferred over `<title>`/meta
      description when both are present
- [ ] Falls back to `<title>`/`<meta name="description">` when OG tags are absent
- [ ] `<link rel="canonical">` extracted; falls back to the request URL when absent
- [ ] `<link rel="icon">` extracted; falls back to `/favicon.ico` on the domain when absent
- [ ] Malformed/incomplete HTML (no `<head>`, unclosed tags) doesn't throw — extracts whatever
      is parseable

`lib/bookmarks/fetch-bookmark-metadata.test.ts` (new — mocked `global.fetch`):
- [ ] A successful fetch updates `website_metadata` (canonical_url/domain/og_image_url/
      favicon_url, `fetch_status: 'success'`) and the item's title — only when the title is
      still the placeholder URL, not clobbering a title the user already edited
- [ ] A network error / unreachable host marks `fetch_status: 'failed'`, item stays usable
- [ ] A non-HTML `Content-Type` response is treated as a graceful failure, not parsed
- [ ] The fetch is aborted and marked `failed` after the ~10s timeout rather than hanging
- [ ] Never throws out of the function on any failure path (it runs after the response is sent)

`lib/items/website-metadata.test.ts` (new — mirrors `lib/items/tags.test.ts`'s `fetchItemTags` coverage):
- [x] returns the metadata row for the item
- [x] returns null and logs when the query fails

`app/api/items/route.test.ts` (extended — POST gains the `type` discriminator):
- [x] Invalid URL format is rejected 400 before any DB write
- [x] A non-http(s) URL scheme (e.g. `javascript:`) is rejected
- [x] Saving a valid URL creates the item immediately with `fetch_status: 'pending'` and the raw
      URL as title, without waiting on any network fetch
- [x] A URL that normalizes to match an existing non-trashed bookmark's `url`/`canonical_url`
      returns the non-blocking duplicate signal (`{ duplicate: true, existingItemId }`), not a
      hard rejection, and does not create a second item
- [x] `confirmDuplicate: true` creates the bookmark anyway despite a match
- [x] A match against a *trashed* bookmark is not flagged (the other-user case is the standing
      RLS boundary on `website_metadata`, not re-tested per testing.md — see qa-checklist.md)
- [x] (added) type is required — missing or an unsupported value is rejected 400
- [x] (added) still returns 201 when the `website_metadata` insert itself fails, but does not
      enqueue the background job (nothing for it to update)

`app/api/items/[id]/metadata/retry/route.test.ts` (new):
- [x] Resets `fetch_status` to `pending` and re-enqueues the job for the caller's own website item
- [x] 404 for an item that doesn't belong to the caller or doesn't exist
- [x] 400 (or equivalent) for an item that isn't `type: 'website'`

`app/api/items/[id]/route.test.ts` (extended):
- [x] GET embeds `website_metadata` alongside `tags` for a `website`-type item (and confirms a
      note-type item never queries `website_metadata` at all)
- [x] PATCH edits title/description on a website item without writing a `note_versions` row
      (pre-existing "version-write logic is skipped for non-note item types" case already
      exercised this with `type: "website"` specifically)

`components/bookmarks/save-bookmark-form.test.tsx` (new — mirrors `create-collection-form.test.tsx`'s toggle/error/success pattern):
- [x] starts collapsed, expands into a form, shows an inline error for an empty URL without
      calling fetch, posts and navigates to the created item on success, shows the server's
      validation message inline, shows the non-blocking duplicate prompt with working "View
      existing" / "Save anyway" actions

`components/bookmarks/bookmark-view.test.tsx` (new):
- [x] shows "Fetching metadata…" while `fetch_status` is pending
- [x] polls and picks up metadata once it resolves to success, without a manual refresh
- [x] shows "Metadata unavailable" + Retry on a failed fetch; Retry calls the retry endpoint and
      resumes polling
- [x] renders no favicon/preview image when there's no metadata at all
- [x] Edit/Save toggle: typing doesn't autosave (no PATCH until Save is clicked)
- [x] shows a load error when the initial fetch fails

`e2e/bookmarks.spec.ts` (new, `@smoke`):
- [ ] Paste a real reachable URL → item visible immediately → metadata fills in without a manual
      refresh → edit the title → persists on reload
- [ ] Paste an unreachable URL → item still saves → "metadata unavailable" shown → Retry
- [ ] Paste a URL duplicating an already-saved bookmark → duplicate prompt → "View existing"
      navigates to it

## Code Snippets (Day 5)

`lib/code-snippets/languages.test.ts` (new — pure):
- [x] resolves the correct extension for a supported language name
- [x] falls back to no-highlight/plain for an unrecognized language string
- [x] the curated list includes the documented common languages (spot-check a handful) plus `plaintext`

`app/api/items/route.test.ts` (extended):
- [x] POST creates a `code_snippet` item + `code_snippet_data` row with the given title/language/code_content
- [x] POST defaults title/language/code_content when omitted (blank-create path)
- [x] POST rolls back the `knowledge_items` row if the `code_snippet_data` insert fails
- [x] POST 404s when `collection_id` doesn't belong to the caller
- [x] `code_snippet` is accepted as a valid `type` (the existing invalid-type 400 test still rejects genuinely bogus types)

`app/api/items/[id]/route.test.ts` (extended):
- [x] GET embeds `code_snippet_data` for a `code_snippet` item (and a note never queries that table)
- [x] PATCH updates `language`/`code_content` on `code_snippet_data` without touching `knowledge_items` title unless also provided
- [x] PATCH with only `language`/`code_content` (no `knowledge_items` field) succeeds without sending an empty update to `knowledge_items`
- [x] PATCH sending `language`/`code_content` for a non-`code_snippet` item is a no-op on `code_snippet_data` (doesn't error, doesn't write)

`components/collections/collection-detail-view.test.tsx` (extended):
- [x] clicking "New Snippet" POSTs `type: code_snippet` and navigates to the created item

`components/code-snippets/code-snippet-view.test.tsx` (new):
- [x] renders pre-filled with the snippet's stored language/code_content
- [x] Edit/Save toggle: typing doesn't autosave (no PATCH until Save)
- [x] Copy button copies the exact raw `code_content` (mocked `navigator.clipboard.writeText`)
- [x] an unrecognized stored language value renders as plain text without crashing

`e2e/code-snippets.spec.ts` (new, `@smoke`, written this feature, run in the end-of-session
consolidated live-browser pass):
- [ ] Create a snippet with a distinctive function/variable name in its code → Global Search for
      that string → found
- [ ] Copy-to-clipboard reproduces the exact stored content
- [ ] Edit language and code → reload → both persist

## Settings — full polish + Data Export/Import (Day 6)

`app/api/settings/route.test.ts` (extended):
- [x] GET defaults `language_preference` to `en`
- [x] PATCH persists `language_preference`
- [x] PATCH rejects an invalid `language_preference` value with 400
- [x] PATCH flips `notification_email_enabled` true→false→true, reflected on the next GET

`lib/settings/export/build-json-export.test.ts` (new):
- [x] excludes trashed collections and trashed items
- [x] a note item's `note.content` matches `knowledge_items.description`
- [x] a website/file/code_snippet item embeds its own type-specific data, tags included
- [x] an item with no tags gets `tags: []`, not a missing/undefined field

`lib/settings/export/build-markdown-export.test.ts` (new):
- [x] produces one folder per collection, sanitizing/deduping folder names
- [x] a note's `.md` file body is its real content; a non-note item's `.md` body is the metadata
      frontmatter block instead
- [x] two items with the same title in one collection get distinct, non-colliding filenames

`lib/settings/export/build-zip-export.test.ts` (new):
- [x] `export.json` at the root matches `buildJsonExport`'s own output
- [x] `files/` contains the real bytes of every `file_assets` row for the account, correctly named
- [x] a Storage download failure for one file skips just that file, not the whole export

`lib/settings/jobs/run-export-job.test.ts` (new):
- [x] `json`/`markdown`/`zip` each end with `status: 'success'`, a `storage_path`, and `completed_at` set
- [x] a Storage upload failure resolves the job to `status: 'failed'` with an `error_message`, never throws

`app/api/settings/export/route.test.ts` (new):
- [x] POST 400s on an invalid `format`
- [x] POST creates a `pending` `export_jobs` row and returns it with 202

`app/api/settings/export/[jobId]/route.test.ts` (new):
- [x] GET returns the job's current status
- [x] GET includes a signed `download_url` only once `status` is `success`
- [x] GET 404s for a job id belonging to a different owner (never leaks existence)

`lib/settings/jobs/run-import-job.test.ts` (new):
- [x] JSON import: creates new collections/items/tags from a valid bundle, `created_count` matches,
      `skipped_count` is 0
- [x] JSON import: one deliberately malformed item is skipped (`skipped_count` 1, a reason
      recorded) while the other valid items in the same collection still get created
- [x] JSON import: an unparseable (non-JSON) source resolves the job to `status: 'failed'`, not a
      thrown exception
- [x] Markdown-ZIP import: items are recreated with the correct type-specific data reconstructed
      from frontmatter (note content, snippet language/code, bookmark url)
- [x] Markdown-ZIP import: a corrupt/non-ZIP source resolves the job to `status: 'failed'`
- [x] Round-trip: `buildJsonExport` → `runImportJob` (json) on that same bundle reproduces
      equivalent collection/item/tag counts
- [x] JSON import preserves `created_at` from the export rather than defaulting every item to
      import time (self-review-caught: was validated and round-tripped through the export format
      but never reached the actual insert)
- [x] JSON import rejects a website item with a non-http(s) URL (e.g. `javascript:`) as a skipped
      item, not created (self-review-caught: import bypassed the same URL/protocol validation real
      bookmark creation enforces, a stored-XSS path via a crafted/shared import file)
- [x] Markdown-ZIP import: a tag name containing a comma survives export→import as one tag, not two
      (self-review-caught: comma-joined tag serialization corrupted any tag whose own name
      contained a comma — fixed by JSON-encoding tags in frontmatter instead)

`app/api/settings/import/route.test.ts` (new):
- [x] POST 400s when `storage_path` isn't under the caller's own `{user.id}/imports/` prefix, no
      job row created
- [x] POST creates a `pending` `import_jobs` row and returns it with 202

`app/api/settings/import/[jobId]/route.test.ts` (new):
- [x] GET returns status + `created_count`/`skipped_count`/`skip_reasons` once done
- [x] GET 404s for a job id belonging to a different owner

`components/settings/language-selector.test.tsx` (new):
- [x] selecting English PATCHes `language_preference: 'en'`
- [x] a failed PATCH rolls the selection back and shows an error

`components/settings/notification-toggle.test.tsx` (new):
- [x] toggling PATCHes the flipped `notification_email_enabled` value
- [x] a failed PATCH rolls the toggle back and shows an error

`components/settings/data-export-form.test.tsx` (new):
- [x] clicking a format button POSTs `/api/settings/export` with that format and shows "Generating…"
- [x] polls until `status: 'success'`, then renders a Download link
- [x] polls until `status: 'failed'`, then renders the error with a working Retry button

## Reminders (Day 6)

`lib/reminders/recurrence.test.ts` (new):
- [x] daily/weekly/monthly happy-path `computeNextFireAt`
- [x] monthly on the 31st falls back to the 30th in a 30-day month
- [x] monthly on the 31st falls back to Feb 28 (non-leap) / Feb 29 (leap) in February
- [x] custom `every_n_days` advances by the configured interval
- [x] custom `every_weekday` skips Saturday/Sunday
- [x] `one_time` returns null (no next occurrence)

`app/api/items/[id]/reminders/route.test.ts` (new):
- [x] POST creates a reminder for each of the 5 types with a correctly-computed `next_fire_at`
- [x] POST rejects a `one_time` reminder with a past date, inline validation, no row created
- [x] POST allows a second active reminder on the same item (not one-per-item)
- [x] GET returns both active and cancelled reminders for the item (history preserved)

`app/api/reminders/[id]/route.test.ts` (new):
- [x] PATCH changing the time reschedules `next_fire_at` without touching `last_fired_at`
- [x] DELETE sets `is_active=false`; the row still exists and is still returned by GET
- [x] PATCH/DELETE 404 for a reminder id belonging to a different owner's item

`app/api/items/[id]/route.test.ts` (extended):
- [x] DELETE (trash) deactivates the item's active reminders and marks them `deactivated_by_trash`

`app/api/items/[id]/restore/route.test.ts` (extended):
- [x] restoring reactivates a recurring reminder that was deactivated by trash
- [x] restoring a `one_time` reminder whose `next_fire_at` has already passed does NOT reactivate it
- [x] restoring does NOT reactivate a reminder the user had manually cancelled before the item was trashed

`app/api/cron/reminders/route.test.ts` (new):
- [x] missing or wrong `CRON_SECRET` → 401, no reminders processed
- [x] claims due reminders via an atomic UPDATE (`claimed_at`) before processing them —
      self-review-caught: the original SELECT-then-process shape had no claim/lock, so two
      overlapping cron invocations could both pick up and email the same due reminder
- [x] a due reminder with the owner's email toggle on: sends via Resend, advances `next_fire_at`
      (recurring) or deactivates (`one_time`)
- [x] a due reminder with the owner's email toggle off: no send attempted, still
      advances/deactivates as if delivered
- [x] a reminder whose owner has no email on file: logged, skipped, still advances/deactivates
- [x] a reminder more than 24h past due: not sent, logged as missed, still advances/deactivates
- [x] a send failure backs off (bumps `failure_count`, clears `claimed_at`) without touching
      `next_fire_at` or `is_active` — self-review-caught regression fix: an earlier version
      overwrote `next_fire_at` with a retry time and later chained off of it, permanently
      shifting the reminder's schedule by the retry delay
- [x] a reminder that fails 5 times in a row gives up and advances/deactivates anyway
- [x] one reminder throwing during processing doesn't stop the rest of the batch from processing

`app/api/dashboard/route.test.ts` (extended):
- [x] upcoming reminders section returns active reminders with their embedded item title/type
- [x] upcoming reminders section defaults to empty when there are none
- [ ] upcoming reminders excludes a trashed item's (deactivated) reminders — DB/RLS-level
      guarantee (the query's own `is("knowledge_items.deleted_at", null)` filter plus trash
      already deactivating reminders), verified live rather than via the mocked unit test above,
      same treatment Day 4's "trashed items excluded from search" got

`components/reminders/reminders-panel.test.tsx` (new):
- [x] creating a daily reminder POSTs the right type-specific schedule shape (server-side coverage
      for the other 4 types already lives in app/api/items/[id]/reminders/route.test.ts)
- [x] creating a one-time reminder POSTs `fire_at` as an ISO string
- [x] cancelling a reminder calls DELETE and removes it from the active list
- [x] editing a reminder's time calls PATCH and updates the displayed next-fire time

`e2e/reminders.spec.ts` (new, `@smoke`, requires `CRON_SECRET` in the test environment — skips
itself with a clear reason if unset):
- [x] create a one-time reminder on a note, a few seconds in the future
- [x] it appears in Dashboard's Upcoming Reminders
- [x] triggering the cron route sends it and it disappears from Upcoming Reminders
- [x] trash the item → its new reminder deactivates
- [x] restore the item → the reminder reactivates

`components/settings/data-import-form.test.tsx` (new):
- [x] rejects a file that isn't `.json`/`.zip` client-side, before any upload
- [x] rejects a file over the size cap client-side, before any upload
- [x] a successful `.json` upload + job completion shows the created/skipped summary

`e2e/settings.spec.ts` (new, `@smoke`, written this feature and **run immediately this session**
via the dockerized `playwright` service — self-review's XSS finding is exactly the class of bug
this session's own precedent, Code Snippets, says warrants live proof rather than trusting the
mocked unit tests alone):
- [x] Toggle language and notification preferences → reload → both persist
- [x] Export as JSON → wait for ready → download link works (fetched directly, real JSON content
      confirmed, not just a UI success claim)
- [x] Import a bundle back in (one valid note + one item carrying a `javascript:` bookmark URL) →
      summary shows 1 imported / 1 skipped → the valid item's new collection appears in Collections
      → the malicious item was never created (live proof of the self-review URL-validation fix)
