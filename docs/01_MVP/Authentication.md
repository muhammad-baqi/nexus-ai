# Authentication

## Overview

Authentication is the entry point into Nexus. Every action in the
application requires an authenticated user except the public landing
page and public share-link viewing (see `Sharing` in `Knowledge_Items.md`).

The MVP uses Supabase Auth with email/password credentials only. OAuth
providers (Google, GitHub, etc.) are a reasonable future addition but are
intentionally deferred to keep the MVP surface small.

## User Flow

```
Landing Page
     │
     ▼
  Sign Up ──────────────► Email Verification
     │                           │
     ▼                           ▼
  Login  ◄──────────────  Verified Account
     │
     ▼
 Dashboard
```

Password reset is a parallel flow accessible from the Login screen at any
time, independent of whether the user is currently signed in.

## Requirements

The user shall be able to:

- Register with email + password
- Verify their email via a confirmation link
- Log in
- Log out
- Request a password reset email
- Set a new password via a reset link
- Change their password while logged in (requires current password)
- Update basic profile fields (display name, avatar) — detailed in a
  future Settings-related note, but account existence/deletion is
  covered here
- Delete their account

## Registration

**Fields required:** email, password, password confirmation.

**Password requirements:** minimum 8 characters, at least one letter and
one number. Requirements should be shown inline before submission, not
only as a rejection after submitting.

**On submit:**
1. Client-side validation (format, match, minimum strength) runs before
   any request is sent.
2. Supabase Auth creates the user record in an unverified state.
3. A verification email is sent automatically by Supabase Auth.
4. The user is shown a "check your email" screen — they are **not**
   logged in yet.

**Duplicate email:** if the email is already registered, the system must
not reveal whether the account exists (see Error States below) — it
should behave identically to a successful registration from the user's
point of view, and rely on the verification email flow to naturally
resolve the situation (a real duplicate attempt sends a "you already
have an account" notice via email, not via the UI response).

## Email Verification

- A verification link is sent immediately on registration.
- Unverified accounts can attempt to log in, but should see a clear
  "please verify your email" state with an option to resend the
  verification email, rather than a generic auth error.
- Resend should be rate-limited (see Error States).

## Login

**Fields:** email, password.

**On success:** establish a session (Supabase Auth session/JWT), redirect
to the Dashboard.

**On failure:** show a single generic error — "Invalid email or
password" — regardless of whether the email exists or the password was
wrong. Do not distinguish these cases in the UI or the API response.

## Logout

- Clears the session client-side and invalidates it server-side.
- Redirects to the landing page.

## Password Reset

1. User requests a reset from the Login screen by entering their email.
2. The system always responds with the same confirmation message
   ("if an account exists, a reset link has been sent") regardless of
   whether the email is registered.
3. If registered, Supabase Auth sends a reset link with a short-lived
   token.
4. The reset link opens a "set new password" screen. On submit, the
   password is updated and all existing sessions for that user should be
   invalidated, requiring a fresh login.

## Change Password (Logged In)

- Requires current password + new password + confirmation.
- Same password strength rules as registration.
- On success, other active sessions for the account should be
  invalidated; the current session remains valid.

## Account Deletion

- Requires password confirmation as a safety check.
- Deletion should cascade: all Knowledge Items, Collections, and related
  data owned by the user are removed. This is a hard delete of the
  account, distinct from the Trash feature which applies to individual
  items, not the account itself.
- The user should see a clear warning that this action is irreversible
  before confirming.

## Error States

**Incorrect password or unknown email at login:** generic message,
inline, non-blocking. Do not reveal whether the email exists.

**Repeated failed login attempts:** rate-limit by IP and/or account after
a threshold (e.g., 5 failed attempts) with a temporary cooldown, to
mitigate brute-force attempts, without permanently locking the account.

**Repeated verification-email or password-reset requests:** rate-limited
per email address (e.g., no more than one request per 60 seconds) to
prevent abuse.

**Expired reset/verification link:** clear message explaining the link
expired, with a direct action to request a new one.

**Network/server error during any auth action:** show a retry-able error
state; never silently fail or leave the user on a spinner indefinitely.

## Security Requirements

- All authentication is handled through Supabase Auth; passwords are
  never stored or logged by the application itself.
- Sessions use short-lived access tokens with refresh tokens, per
  Supabase Auth defaults.
- Row Level Security policies must ensure a user can only read/write
  their own data — authentication establishes identity, but every data
  query is additionally scoped by RLS, not just by application-layer
  checks.
- All auth forms are served over HTTPS only (enforced at the hosting
  layer).

## Out of Scope for MVP

- OAuth / social login
- Multi-factor authentication
- Magic-link (passwordless) login
- Session management UI (viewing/revoking individual active sessions)

## Acceptance Criteria

- [ ] A new user can register, receive a verification email, verify, and
      log in.
- [ ] An unverified user attempting to log in sees a verification
      prompt with a working resend option.
- [ ] A user can reset their password via email and log in with the new
      password.
- [ ] A user can change their password while logged in, and other
      sessions are invalidated.
- [ ] Invalid login attempts never reveal whether the email is
      registered.
- [ ] A user can delete their account, and all owned data is removed.
- [ ] All the above are covered by unit tests (validation logic),
      integration tests (API routes), and at least one end-to-end test
      covering the full register → verify → login journey.
