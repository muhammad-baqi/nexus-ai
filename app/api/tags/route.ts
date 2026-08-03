import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  if (error) {
    console.error("[api/tags] list failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading tags." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ tags: data });
}
