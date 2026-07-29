import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { verifyEmailQuerySchema } from "@/lib/validation/auth";

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

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const origin = getRedirectOrigin(requestOrigin);

  const result = verifyEmailQuerySchema.safeParse({
    token_hash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
  });

  if (!result.success) {
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp(result.data);

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error);
    const status = error.code === EXPIRED_TOKEN_ERROR_CODE ? "expired" : "invalid";
    return NextResponse.redirect(`${origin}/verify-email?status=${status}`);
  }

  return NextResponse.redirect(`${origin}/verify-email?status=success`);
}
