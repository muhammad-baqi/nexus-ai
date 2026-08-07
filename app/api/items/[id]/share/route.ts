import { NextResponse, type NextRequest } from "next/server";

import { itemShareUrl } from "@/lib/items/share-link";
import { generateShareToken } from "@/lib/sharing/generate-token";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

type RouteParams = { params: Promise<{ id: string }> };

function shareFailedResponse() {
  return NextResponse.json(
    { error: { code: "share_failed", message: "Something went wrong with this share link." } },
    { status: 500 },
  );
}

async function verifyItemOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  ownerId: string,
) {
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", itemId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  return { exists: !!data, error };
}

// Idempotent — an item already shared just returns its existing active link rather than creating
// a duplicate (Knowledge_Items.md doesn't call for multiple simultaneous active links per item).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { exists, error: lookupError } = await verifyItemOwnership(supabase, id, user.id);
  if (lookupError) {
    console.error("[api/items/:id/share] item lookup failed:", lookupError);
    return shareFailedResponse();
  }
  if (!exists) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("share_links")
    .select("token")
    .eq("knowledge_item_id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    console.error("[api/items/:id/share] existing-link lookup failed:", existingError);
    return shareFailedResponse();
  }

  if (existing) {
    return NextResponse.json({ token: existing.token, url: itemShareUrl(existing.token) });
  }

  const token = generateShareToken();
  const { data: created, error: insertError } = await supabase
    .from("share_links")
    .insert({ knowledge_item_id: id, token })
    .select("token")
    .single();

  if (insertError) {
    console.error("[api/items/:id/share] insert failed:", insertError);
    return shareFailedResponse();
  }

  return NextResponse.json({ token: created.token, url: itemShareUrl(created.token) }, { status: 201 });
}

// Soft revoke — matches Reminders' cancel-not-delete precedent. A subsequent POST after this
// creates a fresh row with a new token (Knowledge_Items.md: "a new link (different token) can be
// generated afterward"), never reactivates this one.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { exists, error: lookupError } = await verifyItemOwnership(supabase, id, user.id);
  if (lookupError) {
    console.error("[api/items/:id/share] item lookup failed:", lookupError);
    return shareFailedResponse();
  }
  if (!exists) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  // No-op success if nothing is currently active — matches this app's idempotent-delete
  // convention (e.g. tag detach, permanent delete on an already-gone item).
  const { error: revokeError } = await supabase
    .from("share_links")
    .update({ is_active: false })
    .eq("knowledge_item_id", id)
    .eq("is_active", true);

  if (revokeError) {
    console.error("[api/items/:id/share] revoke failed:", revokeError);
    return shareFailedResponse();
  }

  return NextResponse.json({ revoked: true });
}
