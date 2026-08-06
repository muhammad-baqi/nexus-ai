import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ExportedItem = {
  type: "note" | "website" | "pdf" | "image" | "file" | "code_snippet";
  title: string;
  description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  tags: string[];
  note?: { content: string };
  website?: {
    url: string;
    canonical_url: string | null;
    domain: string | null;
    og_image_url: string | null;
    favicon_url: string | null;
  };
  file?: { original_filename: string; mime_type: string; size_bytes: number };
  code_snippet?: { language: string; code_content: string };
};

export type ExportedCollection = {
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  items: ExportedItem[];
};

export type ExportBundle = {
  exported_at: string;
  collections: ExportedCollection[];
};

type ItemRow = {
  id: string;
  collection_id: string;
  type: ExportedItem["type"];
  title: string;
  description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
};

// Notes store their current Markdown body directly on knowledge_items.description (same column
// every other type uses for its summary text) — note_versions is historical-only bookkeeping, not
// where "the" current content lives, so no extra query is needed to get a note's real content.
async function fetchTagsByItem(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("knowledge_item_tags")
    .select("knowledge_item_id, tags(name)")
    .in("knowledge_item_id", itemIds);
  if (error) throw error;

  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as unknown as {
    knowledge_item_id: string;
    tags: { name: string } | null;
  }[]) {
    if (!row.tags) continue;
    const list = map.get(row.knowledge_item_id) ?? [];
    list.push(row.tags.name);
    map.set(row.knowledge_item_id, list);
  }
  return map;
}

async function fetchWebsiteByItem(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, ExportedItem["website"]>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("website_metadata")
    .select("knowledge_item_id, url, canonical_url, domain, og_image_url, favicon_url")
    .in("knowledge_item_id", itemIds);
  if (error) throw error;

  const map = new Map<string, ExportedItem["website"]>();
  for (const row of data ?? []) {
    map.set(row.knowledge_item_id, {
      url: row.url,
      canonical_url: row.canonical_url,
      domain: row.domain,
      og_image_url: row.og_image_url,
      favicon_url: row.favicon_url,
    });
  }
  return map;
}

// Deliberately excludes storage_path — it's meaningless outside this account's own private
// Storage bucket, and JSON export never carries binary content anyway (see build-zip-export.ts
// for the format that does). Metadata only, so a JSON export stays fully self-contained.
async function fetchFileByItem(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, ExportedItem["file"]>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("file_assets")
    .select("knowledge_item_id, original_filename, mime_type, size_bytes")
    .in("knowledge_item_id", itemIds);
  if (error) throw error;

  const map = new Map<string, ExportedItem["file"]>();
  for (const row of data ?? []) {
    map.set(row.knowledge_item_id, {
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
    });
  }
  return map;
}

async function fetchSnippetByItem(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, ExportedItem["code_snippet"]>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("code_snippet_data")
    .select("knowledge_item_id, language, code_content")
    .in("knowledge_item_id", itemIds);
  if (error) throw error;

  const map = new Map<string, ExportedItem["code_snippet"]>();
  for (const row of data ?? []) {
    map.set(row.knowledge_item_id, { language: row.language, code_content: row.code_content });
  }
  return map;
}

// Trashed collections/items (deleted_at not null) are excluded — export is "your active data,"
// not Trash, a deliberate scope decision (Settings.md doesn't say either way). Backs all three
// export formats: this is the single source of truth, 'json' just serializes it directly while
// 'markdown'/'zip' (build-markdown-export.ts / build-zip-export.ts) transform it further.
export async function buildJsonExport(supabase: SupabaseClient, ownerId: string): Promise<ExportBundle> {
  const { data: collections, error: collectionsError } = await supabase
    .from("collections")
    .select("id, name, description, color, icon, is_favorite, is_archived")
    .eq("owner_id", ownerId)
    .is("deleted_at", null);
  if (collectionsError) throw collectionsError;

  const { data: items, error: itemsError } = await supabase
    .from("knowledge_items")
    .select("id, collection_id, type, title, description, is_favorite, is_archived, created_at")
    .eq("owner_id", ownerId)
    .is("deleted_at", null);
  if (itemsError) throw itemsError;

  const itemRows = (items ?? []) as ItemRow[];
  const itemIds = itemRows.map((item) => item.id);

  const [tagsByItem, websiteByItem, fileByItem, snippetByItem] = await Promise.all([
    fetchTagsByItem(supabase, itemIds),
    fetchWebsiteByItem(supabase, itemIds),
    fetchFileByItem(supabase, itemIds),
    fetchSnippetByItem(supabase, itemIds),
  ]);

  const collectionsOut: ExportedCollection[] = (collections ?? []).map((collection) => ({
    name: collection.name,
    description: collection.description,
    color: collection.color,
    icon: collection.icon,
    is_favorite: collection.is_favorite,
    is_archived: collection.is_archived,
    items: itemRows
      .filter((item) => item.collection_id === collection.id)
      .map((item) => {
        const website = websiteByItem.get(item.id);
        const file = fileByItem.get(item.id);
        const codeSnippet = snippetByItem.get(item.id);
        return {
          type: item.type,
          title: item.title,
          description: item.description,
          is_favorite: item.is_favorite,
          is_archived: item.is_archived,
          created_at: item.created_at,
          tags: tagsByItem.get(item.id) ?? [],
          ...(item.type === "note" && { note: { content: item.description ?? "" } }),
          ...(website && { website }),
          ...(file && { file }),
          ...(codeSnippet && { code_snippet: codeSnippet }),
        };
      }),
  }));

  return { exported_at: new Date().toISOString(), collections: collectionsOut };
}
