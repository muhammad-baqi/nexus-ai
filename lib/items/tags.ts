import type { createClient } from "@/lib/supabase/server";

export type ItemTag = { id: string; name: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Used by GET /api/items/:id and the attach/detach routes so every response shows the item's
// current tags without a second round trip from the caller. Reads through knowledge_item_tags
// (not a select-with-embed off knowledge_items) so RLS scopes it the same way whether called
// standalone or after an already-verified item lookup.
export async function fetchItemTags(
  supabase: SupabaseClient,
  itemId: string,
): Promise<ItemTag[] | null> {
  const { data, error } = await supabase
    .from("knowledge_item_tags")
    .select("tags(id, name)")
    .eq("knowledge_item_id", itemId);

  if (error) {
    console.error("[lib/items/tags] fetchItemTags failed:", error);
    return null;
  }

  return ((data ?? []) as unknown as { tags: ItemTag | null }[])
    .map((row) => row.tags)
    .filter((tag): tag is ItemTag => tag !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Tags are created implicitly the first time they're typed (Knowledge_Items.md), matched
// case-insensitively against the owner's existing tags (the same rule the DB's own
// `tags_owner_name_unique` index enforces). Fetches the owner's full tag list and compares in
// JS rather than an `ilike` query — tag names are free-form user input that may contain `%`/`_`,
// which `ilike` would treat as wildcards; at personal-knowledge-hub scale, fetching the (small)
// full list is simpler and correct.
export async function getOrCreateTag(
  supabase: SupabaseClient,
  ownerId: string,
  name: string,
): Promise<ItemTag | null> {
  const { data: existingTags, error: listError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("owner_id", ownerId);

  if (listError) {
    console.error("[lib/items/tags] tag lookup failed:", listError);
    return null;
  }

  const match = (existingTags ?? []).find(
    (tag) => tag.name.toLowerCase() === name.toLowerCase(),
  );
  if (match) return match;

  const { data: created, error: insertError } = await supabase
    .from("tags")
    .insert({ owner_id: ownerId, name })
    .select("id, name")
    .single();

  if (insertError) {
    // Race: another request created the same (case-insensitive) name between the lookup above
    // and this insert — the unique index rejects it. Re-fetch instead of failing the tag request.
    if (insertError.code === "23505") {
      const { data: refreshed, error: refreshError } = await supabase
        .from("tags")
        .select("id, name")
        .eq("owner_id", ownerId);
      const raceMatch = refreshed?.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
      if (raceMatch) return raceMatch;
      if (refreshError) console.error("[lib/items/tags] race re-fetch failed:", refreshError);
    }
    console.error("[lib/items/tags] tag create failed:", insertError);
    return null;
  }

  return created;
}
