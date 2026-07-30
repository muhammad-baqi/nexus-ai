import { NextResponse } from "next/server";

import type { createClient } from "@/lib/supabase/server";

// Shared by every route handler that needs an authenticated session before touching Supabase —
// identity always comes from here, never a client-supplied id (.claude/rules/api-routes.md).
export async function requireUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: { code: "unauthenticated", message: "You must be logged in." } },
        { status: 401 },
      ),
    };
  }

  return { user, response: null };
}
