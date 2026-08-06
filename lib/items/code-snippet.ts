import type { createClient } from "@/lib/supabase/server";

export type CodeSnippetData = {
  language: string;
  code_content: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Mirrors lib/items/file-asset.ts's fetchFileAsset / lib/items/website-metadata.ts's
// fetchWebsiteMetadata shape/error-handling. `null` means the read itself failed (logged) or the
// row doesn't exist — the caller decides how to degrade.
export async function fetchCodeSnippetData(
  supabase: SupabaseClient,
  itemId: string,
): Promise<CodeSnippetData | null> {
  const { data, error } = await supabase
    .from("code_snippet_data")
    .select("language, code_content")
    .eq("knowledge_item_id", itemId)
    .maybeSingle();

  if (error) {
    console.error("[lib/items/code-snippet] fetchCodeSnippetData failed:", error);
    return null;
  }

  return data;
}
