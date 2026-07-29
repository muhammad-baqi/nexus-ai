import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { verifyEmailQuerySchema } from "@/lib/validation/auth";

// GoTrue's single error code for "link is invalid or has expired" — verified locally that a
// bogus token_hash returns this same code, not a distinct "invalid" one, so in practice this
// is the branch nearly every rejected link takes. The separate "invalid" status this route can
// still redirect to is reached only by our own zod validation, before Supabase is ever called.
const EXPIRED_TOKEN_ERROR_CODE = "otp_expired";

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  // Prefer the configured site origin over the request's Host header — this is an
  // unauthenticated route, so an attacker-controlled Host shouldn't drive a redirect Location.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin;

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
