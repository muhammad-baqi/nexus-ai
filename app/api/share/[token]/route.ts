import { NextResponse, type NextRequest } from "next/server";

import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ token: string }> };

const SIGNED_URL_TTL_SECONDS = 60 * 10; // matches lib/files/signed-url.ts's own TTL

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "This link is invalid or has been revoked." } },
    { status: 404 },
  );
}

function unavailableResponse() {
  return NextResponse.json(
    { error: { code: "unavailable", message: "This item is no longer available." } },
    { status: 404 },
  );
}

// Public, unauthenticated route — the one legitimate place besides the cron scheduler where the
// service-role admin client is the right call, since there's no session at all here
// (API_Design.md: "all routes except public share-link viewing require an authenticated
// session"). Queries and the response shape are deliberately narrow — only what
// Knowledge_Items.md's Sharing section says a public viewer may see (title, description,
// type-appropriate content), never tags, collection, owner info, or any other account data.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("knowledge_item_id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (linkError) {
    console.error("[api/share/:token] link lookup failed:", linkError);
    return notFoundResponse();
  }
  if (!link) return notFoundResponse();

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id, title, description, type, deleted_at")
    .eq("id", link.knowledge_item_id)
    .single();

  if (itemError || !item) {
    console.error("[api/share/:token] item lookup failed:", itemError);
    return notFoundResponse();
  }

  // Knowledge_Items.md's Error States: a trashed/deleted item behind a still-active share link
  // shows "this item is no longer available," not a raw 404 — the link itself wasn't revoked.
  if (item.deleted_at) return unavailableResponse();

  const body: Record<string, unknown> = {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
  };

  if (item.type === "website") {
    const { data } = await supabase
      .from("website_metadata")
      .select("url, domain, og_image_url, favicon_url")
      .eq("knowledge_item_id", item.id)
      .maybeSingle();
    body.website_metadata = data;
  }

  if (item.type === "pdf" || item.type === "image" || item.type === "file") {
    const { data: asset } = await supabase
      .from("file_assets")
      .select("original_filename, mime_type, size_bytes, storage_path")
      .eq("knowledge_item_id", item.id)
      .maybeSingle();

    if (asset) {
      const { data: signed, error: signError } = await supabase.storage
        .from(FILES_STORAGE_BUCKET)
        .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signError) console.error("[api/share/:token] signed URL failed:", signError);

      body.file_asset = {
        original_filename: asset.original_filename,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        download_url: signed?.signedUrl ?? null,
      };
    }
  }

  if (item.type === "code_snippet") {
    const { data } = await supabase
      .from("code_snippet_data")
      .select("language, code_content")
      .eq("knowledge_item_id", item.id)
      .maybeSingle();
    body.code_snippet_data = data;
  }

  return NextResponse.json(body);
}
