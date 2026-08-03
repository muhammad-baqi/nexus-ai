import type { createClient } from "@/lib/supabase/server";

// PostgREST's code for ".single() matched zero rows" — the expected/legitimate way this check
// fails (wrong owner, trashed, or a nonexistent id). Any other error is a genuine DB problem and
// gets logged rather than silently surfacing as an unremarkable 404.
const NO_ROWS_CODE = "PGRST116";

// The RLS policy on `knowledge_items` only checks `owner_id = auth.uid()` on the row being
// written — it doesn't (and can't, from an insert/update) verify a client-supplied
// `collection_id` belongs to that same owner. Without this check, a caller could attach or move
// a note into another user's collection (or one they've already trashed) just by
// guessing/enumerating a UUID. Shared by `POST /api/items` (create) and
// `PATCH /api/items/:id` (move between collections).
export async function verifyCollectionOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  collectionId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== NO_ROWS_CODE) {
    console.error("[verifyCollectionOwnership] lookup failed:", error);
  }

  return !error && !!data;
}
