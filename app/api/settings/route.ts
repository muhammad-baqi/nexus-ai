import { NextResponse, type NextRequest } from "next/server";

import { signAvatarUrl } from "@/lib/supabase/avatar";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/settings";

export async function GET() {
  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (response) return response;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, theme_preference, language_preference, notification_email_enabled")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[api/settings] fetching profile failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading your settings." } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    display_name: profile.display_name,
    avatar_url: await signAvatarUrl(supabase, profile.avatar_url),
    theme_preference: profile.theme_preference,
    language_preference: profile.language_preference,
    notification_email_enabled: profile.notification_email_enabled,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = profileUpdateSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid settings payload." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response: authResponse } = await requireUser(supabase);
  if (authResponse) return authResponse;

  // Storage RLS already prevents createSignedUrl from resolving a path outside the caller's own
  // folder, but a client-supplied string still shouldn't be trusted onto the row unvalidated —
  // the only legitimate value is this exact path the upload flow itself writes to.
  if (result.data.avatar_path && result.data.avatar_path !== `${user.id}/avatar`) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid avatar path." } },
      { status: 400 },
    );
  }

  const updates: Record<string, string | boolean | null> = {};
  if (result.data.display_name !== undefined) updates.display_name = result.data.display_name;
  if (result.data.avatar_path !== undefined) updates.avatar_url = result.data.avatar_path;
  if (result.data.theme_preference !== undefined) {
    updates.theme_preference = result.data.theme_preference;
  }
  if (result.data.language_preference !== undefined) {
    updates.language_preference = result.data.language_preference;
  }
  if (result.data.notification_email_enabled !== undefined) {
    updates.notification_email_enabled = result.data.notification_email_enabled;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("display_name, avatar_url, theme_preference, language_preference, notification_email_enabled")
    .single();

  if (error) {
    console.error("[api/settings] updating profile failed:", error);
    return NextResponse.json(
      { error: { code: "update_failed", message: "Something went wrong saving your settings." } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    display_name: profile.display_name,
    avatar_url: await signAvatarUrl(supabase, profile.avatar_url),
    theme_preference: profile.theme_preference,
    language_preference: profile.language_preference,
    notification_email_enabled: profile.notification_email_enabled,
  });
}
