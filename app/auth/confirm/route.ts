import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { authConfirmQuerySchema } from "@/lib/validation/auth";

// GoTrue's single error code for "link is invalid or has expired" — verified locally that a
// bogus token_hash returns this same code, not a distinct "invalid" one, so in practice this
// is the branch nearly every rejected link takes. The separate "invalid" status this route can
// still redirect to is reached only by our own zod validation, before Supabase is ever called.
const EXPIRED_TOKEN_ERROR_CODE = "otp_expired";

// This is an unauthenticated route, so an attacker-controlled Host header shouldn't be able to
// drive a redirect Location — pin to the configured site origin on Vercel (VERCEL is set on
// every Vercel deployment, preview and production alike) and as a fallback whenever actually
// built for production, in case this is ever self-hosted outside Vercel. Everywhere else
// (`next dev`, Vitest), every origin that can reach the server is already trusted, and pinning
// to NEXT_PUBLIC_APP_URL would break it: confirmed live that Next's dev server doesn't vary
// request.url's origin by the incoming Host header at all, so local dev is reachable multiple
// ways at once (localhost, Docker's host.docker.internal) that a single fixed env var can't
// cover — whichever one NEXT_PUBLIC_APP_URL doesn't name would just break.
function getRedirectOrigin(requestOrigin: string): string {
  const isDeployed = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return isDeployed ? (process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin) : requestOrigin;
}

// type=email lands on /verify-email (Email Verification); type=recovery (Password Reset) lands
// on /reset-password instead — same status vocabulary (success/expired/invalid) for both.
const DESTINATION_BY_TYPE = {
  email: "/verify-email",
  recovery: "/reset-password",
} as const;

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const origin = getRedirectOrigin(requestOrigin);

  const result = authConfirmQuerySchema.safeParse({
    token_hash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
  });

  if (!result.success) {
    // Type is unknown/missing, so we can't know which page to send the user back to — the
    // email-verification destination is the safer generic fallback of the two. This branch
    // fires even for a genuine password-reset link if token_hash/type got dropped or mangled
    // before reaching us (e.g. an email client rewriting the URL, or a corporate link-scanner
    // pre-fetching it) — logged so a "reset link showed the wrong copy" report can actually be
    // diagnosed instead of guessed at.
    // Never log the raw token_hash — it's a live, single-use credential (redeeming it via
    // verifyOtp grants a session or lets the holder set a new password), equivalent to a
    // bearer token for that action. Presence/shape is enough to diagnose this branch.
    console.error(
      "[auth/confirm] query failed validation, falling back to /verify-email?status=invalid:",
      { hasTokenHash: Boolean(searchParams.get("token_hash")), type: searchParams.get("type") },
    );
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  const destination = DESTINATION_BY_TYPE[result.data.type];
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp(result.data);

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error);
    const status = error.code === EXPIRED_TOKEN_ERROR_CODE ? "expired" : "invalid";
    return NextResponse.redirect(`${origin}${destination}?status=${status}`);
  }

  return NextResponse.redirect(`${origin}${destination}?status=success`);
}
