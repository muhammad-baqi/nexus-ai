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
- [ ] (Playwright `@smoke`) Filling the register form with valid unique data and submitting lands on the check-your-email screen — test written (`e2e/register.spec.ts`), but not yet green: blocked by a Chromium `ERR_SSL_PROTOCOL_ERROR` navigating to a plain-http URL inside the `playwright` container (curl to the same URL from that container works fine, so it's a browser-launch/flag issue, not real network unreachability). Unrelated to this feature's own logic — see PROGRESS.md's Day 2 note.

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
- [ ] (Playwright `@smoke`) Registering, fetching the confirmation email from local Inbucket, and following the link lands on `/verify-email?status=success` — test written (`e2e/verify-email.spec.ts`), not yet green: same known `playwright`-in-Docker `ERR_SSL_PROTOCOL_ERROR` blocker as `register.spec.ts`. The real round trip (register → local Mailpit/Inbucket email → custom `/auth/confirm` link → session cookie set → `/verify-email?status=success`) was proven live via direct HTTP requests against the running dev server and local Supabase instead — the Chrome extension wasn't connected this session so a visual browser walkthrough wasn't possible; also confirmed the two error paths (`?status=invalid` for missing/malformed params, `?status=expired` for a bogus/rejected token) and the real `over_email_send_rate_limit` resend response, all matching what the mocked unit tests assert.

## Login (Day 2)
- [x] Submitting with an empty email and/or password shows inline "required" errors, no `signInWithPassword` call
- [x] Submitting an invalid email format shows an inline error, no call
- [x] A mocked `invalid_credentials` error shows "Invalid email or password" inline and stays on the login form (not swapped to a different screen)
- [x] A mocked `email_not_confirmed` error swaps to the "please verify your email" state and renders a working resend control
- [x] A successful `signInWithPassword` call redirects to `/`
- [x] A mocked network/server error shows a retry-able message, distinct from the invalid-credentials copy
- [x] The submit button is never left stuck disabled after an error
- [ ] (Playwright `@smoke`) Register, verify via the real Mailpit link, then log in — lands on `/` with a session cookie set — test written (`e2e/login.spec.ts`), expected to hit the same known `playwright`-in-Docker blocker as the other two e2e specs; verified live instead via direct HTTP requests per PROGRESS.md's established approach.

## Logout (Day 2)
- [x] Clicking "Log out" calls `supabase.auth.signOut()`
- [x] A successful sign-out redirects to `/` and refreshes
- [x] A mocked sign-out failure shows a retry-able inline error and does not navigate away
- [x] The logout button is never left stuck disabled after an error
- [x] The landing page renders "Signed in as {email}" and a working Logout button when `getUser()` returns a user
- [x] The landing page renders Log in/Register links and no Logout button when `getUser()` returns no user
- [ ] (Playwright `@smoke`) Register, verify via the real Mailpit link (already signed in), confirm `/` shows the signed-in state, log out, confirm no session cookie remains — test written (`e2e/logout.spec.ts`), expected to hit the same known `playwright`-in-Docker blocker as the other three e2e specs; verified live instead via direct HTTP + cookie checks.
