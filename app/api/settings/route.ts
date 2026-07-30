import { NextResponse, type NextRequest } from "next/server";

import { signAvatarUrl } from "@/lib/supabase/avatar";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/settings";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "You must be logged in." } },
      { status: 401 },
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "You must be logged in." } },
      { status: 401 },
    );
  }

  // Storage RLS already prevents createSignedUrl from resolving a path outside the caller's own
  // folder, but a client-supplied string still shouldn't be trusted onto the row unvalidated —
  // the only legitimate value is this exact path the upload flow itself writes to.
  if (result.data.avatar_path && result.data.avatar_path !== `${user.id}/avatar`) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid avatar path." } },
      { status: 400 },
    );
  }

  const updates: Record<string, string | null> = {};
  if (result.data.display_name !== undefined) updates.display_name = result.data.display_name;
  if (result.data.avatar_path !== undefined) updates.avatar_url = result.data.avatar_path;

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("display_name, avatar_url")
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
  });
}
