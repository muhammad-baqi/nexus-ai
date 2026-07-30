import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteAccountSchema } from "@/lib/validation/auth";

const AVATAR_BUCKET = "avatars";

// docs/01_MVP/Authentication.md: account deletion requires a password-confirmation safety
// check. Uses a stateless client (no cookie side effects) purely to verify the credential —
// the real, cookie-bound session is untouched until deletion actually succeeds.
function createStatelessClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = deleteAccountSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Password is required." } },
      { status: 400 },
    );
  }

  // Identity always comes from the session, never a client-supplied id (.claude/rules/api-routes.md).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "You must be logged in." } },
      { status: 401 },
    );
  }

  const stateless = createStatelessClient();
  const { error: reauthError } = await stateless.auth.signInWithPassword({
    email: user.email,
    password: result.data.password,
  });

  if (reauthError) {
    console.error("[api/auth/account] password re-verification failed:", reauthError);
    return NextResponse.json(
      { error: { code: "invalid_password", message: "Incorrect password." } },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // Storage objects aren't foreign-keyed to auth.users, so they'd otherwise be orphaned once the
  // user row (and the cascading DB rows) are gone. Best-effort: a failing enhancement (or a
  // not-yet-created bucket) must never block the core deletion.
  try {
    const { data: files, error: listError } = await admin.storage
      .from(AVATAR_BUCKET)
      .list(user.id);
    if (listError) {
      console.error("[api/auth/account] avatar list failed, continuing with deletion:", listError);
    } else if (files && files.length > 0) {
      const { error: removeError } = await admin.storage
        .from(AVATAR_BUCKET)
        .remove(files.map((f) => `${user.id}/${f.name}`));
      if (removeError) {
        console.error(
          "[api/auth/account] avatar removal failed, continuing with deletion:",
          removeError,
        );
      }
    }
  } catch (storageError) {
    console.error("[api/auth/account] avatar cleanup threw, continuing with deletion:", storageError);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error("[api/auth/account] deleteUser failed:", deleteError);
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Something went wrong deleting your account." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
