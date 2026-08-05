import { after, NextResponse, type NextRequest } from "next/server";

import { fetchBookmarkMetadata } from "@/lib/bookmarks/fetch-bookmark-metadata";
import { normalizeUrlForDuplicateCheck } from "@/lib/bookmarks/normalize-url";
import { formatMaxSizeLabel, maxBytesForType } from "@/lib/files/constants";
import { extractPdfText } from "@/lib/files/extract-pdf-text";
import { validateFileUpload } from "@/lib/files/validate-upload";
import { deleteUploadedObject, verifyUploadedFileContent } from "@/lib/files/verify-upload";
import { verifyCollectionOwnership } from "@/lib/items/verify-collection-ownership";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  createBookmarkSchema,
  createFileItemSchema,
  createNoteSchema,
  DEFAULT_ITEMS_PAGE_LIMIT,
  DEFAULT_NOTE_TITLE,
  listItemsQuerySchema,
} from "@/lib/validation/items";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// The primary listing/search endpoint (API_Design.md) — also backs Global Search when `q` is
// present, with filters/sort/pagination. Backed by the search_knowledge_items() Postgres
// function (005_search_function.sql): a plain PostgREST query can't express ts_rank ordering,
// and doing the tag OR-filter as a separate round trip would cost an extra query per request —
// this keeps every combination to one indexed query, which is what the <500ms/5,000-item target
// in Search.md actually requires. RLS on knowledge_items still applies underneath the function
// (it isn't `security definer`) — p_owner_id here is a redundant, explicit filter for
// defense-in-depth, matching every other route's pattern (CLAUDE.md rule #1), not the real
// authorization boundary.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = listItemsQuerySchema.safeParse({
    collection_id: searchParams.get("collection_id") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    tag: searchParams.getAll("tag").length > 0 ? searchParams.getAll("tag") : undefined,
    favorite: searchParams.get("favorite") ?? undefined,
    archived: searchParams.get("archived") ?? undefined,
    created_from: searchParams.get("created_from") ?? undefined,
    created_to: searchParams.get("created_to") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid query parameters." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { q, collection_id, type, tag, favorite, archived, created_from, created_to, sort } =
    result.data;
  const page = result.data.page ?? 1;
  const limit = result.data.limit ?? DEFAULT_ITEMS_PAGE_LIMIT;
  // Relevance only means something with a query; default to most-recently-updated when browsing
  // without one, per Search.md's Sorting section.
  const effectiveSort = sort ?? (q ? "relevance" : "updated");

  const { data, error } = await supabase.rpc("search_knowledge_items", {
    p_owner_id: user.id,
    p_query: q ?? null,
    p_collection_id: collection_id ?? null,
    p_type: type ?? null,
    p_tag_ids: tag ?? null,
    p_favorite: favorite ?? null,
    p_archived: archived ?? null,
    // created_to is an inclusive end-of-day bound — an `<input type="date">` value like
    // "2026-08-01" parses to 2026-08-01T00:00:00.000Z, and comparing created_at <= that would
    // exclude nearly everything actually created on the selected end date. Push it to the last
    // millisecond of that day instead. created_from's plain midnight start is correct as-is.
    p_created_from: created_from ? new Date(created_from).toISOString() : null,
    p_created_to: created_to
      ? new Date(new Date(created_to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      : null,
    p_sort: effectiveSort,
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });

  if (error) {
    console.error("[api/items] search failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading items." } },
      { status: 500 },
    );
  }

  type SearchRow = {
    id: string;
    collection_id: string;
    type: string;
    title: string;
    is_favorite: boolean;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    total_count: number;
  };
  const rows = (data ?? []) as SearchRow[];
  const total = rows[0]?.total_count ?? 0;
  const items = rows.map((row) => ({
    id: row.id,
    collection_id: row.collection_id,
    type: row.type,
    title: row.title,
    is_favorite: row.is_favorite,
    is_archived: row.is_archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ items, total, page, limit });
}

// Dispatches on the required `type` discriminator — the two creatable types (note, website) have
// different payload shapes and create paths, per CREATABLE_ITEM_TYPES in lib/validation/items.ts.
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const type =
    body && typeof body === "object" && "type" in body ? (body as { type: unknown }).type : undefined;

  if (type === "website") return createBookmark(body);
  if (type === "note") return createNote(body);
  if (type === "pdf" || type === "image" || type === "file") return createFileItem(body);

  return NextResponse.json(
    {
      error: {
        code: "invalid_request",
        message: "type must be one of 'note', 'website', 'pdf', 'image', 'file'.",
      },
    },
    { status: 400 },
  );
}

async function createNote(body: unknown) {
  const result = createNoteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid note.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const ownsCollection = await verifyCollectionOwnership(supabase, result.data.collection_id, user.id);
  if (!ownsCollection) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This collection doesn't exist." } },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("knowledge_items")
    .insert({
      owner_id: user.id,
      collection_id: result.data.collection_id,
      type: "note",
      title: result.data.title || DEFAULT_NOTE_TITLE,
      description: result.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/items] create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong creating the note." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}

// Fetches every one of the caller's own (non-trashed) bookmarks and compares normalized URLs in
// JS, rather than a dot-notation embedded-resource filter — same "small list, compare in JS"
// reasoning lib/items/tags.ts's getOrCreateTag already documents for this app's scale. RLS on
// website_metadata (scoped via its knowledge_items.owner_id subquery, 001_initial_schema.sql)
// already restricts this to the caller's own rows — the real authorization boundary, not this
// query's shape (CLAUDE.md rule #1).
async function findDuplicateBookmark(supabase: SupabaseClient, url: string): Promise<string | null> {
  const normalized = normalizeUrlForDuplicateCheck(url);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("website_metadata")
    .select("knowledge_item_id, url, canonical_url, knowledge_items(deleted_at)");

  if (error) {
    console.error("[api/items] duplicate check failed:", error);
    return null;
  }

  type Row = {
    knowledge_item_id: string;
    url: string;
    canonical_url: string | null;
    knowledge_items: { deleted_at: string | null } | null;
  };

  const match = ((data ?? []) as unknown as Row[]).find((row) => {
    if (row.knowledge_items?.deleted_at) return false;
    const candidate = row.canonical_url ?? row.url;
    return normalizeUrlForDuplicateCheck(candidate) === normalized;
  });

  return match?.knowledge_item_id ?? null;
}

async function createBookmark(body: unknown) {
  const result = createBookmarkSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid bookmark.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { url, collection_id, confirmDuplicate } = result.data;

  const ownsCollection = await verifyCollectionOwnership(supabase, collection_id, user.id);
  if (!ownsCollection) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This collection doesn't exist." } },
      { status: 404 },
    );
  }

  // Non-blocking per Website_Bookmarks.md's Duplicate Detection section: surfaced as a normal
  // 200 response the client turns into a prompt, not a 4xx rejection — the user can still choose
  // to save a duplicate intentionally by resubmitting with confirmDuplicate: true.
  // Accepted race: two concurrent submits of the same URL (double-click, two tabs) can both pass
  // this check before either insert lands, and there's no unique DB constraint stopping it either
  // — acceptable since the product allows intentional duplicates anyway; the worst case is the
  // prompt gets silently skipped under a race, not data corruption.
  if (!confirmDuplicate) {
    const existingItemId = await findDuplicateBookmark(supabase, url);
    if (existingItemId) {
      return NextResponse.json({ duplicate: true, existingItemId });
    }
  }

  // Item is created and visible immediately, title as the raw URL — metadata fills in
  // asynchronously below. Never blocked on the metadata fetch (Website_Bookmarks.md's Save Flow).
  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .insert({
      owner_id: user.id,
      collection_id,
      type: "website",
      title: url,
    })
    .select()
    .single();

  if (itemError) {
    console.error("[api/items] bookmark create failed:", itemError);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong saving this bookmark." } },
      { status: 500 },
    );
  }

  const { error: metadataError } = await supabase
    .from("website_metadata")
    .insert({ knowledge_item_id: item.id, url, fetch_status: "pending" });

  if (metadataError) {
    // The item itself already saved successfully — a failed metadata-row insert shouldn't fail
    // the whole save (CLAUDE.md rule #7). There's simply nothing for the background job below to
    // update; GET will show the item with no metadata row rather than a broken item.
    console.error("[api/items] website_metadata create failed:", metadataError);
  } else {
    // Runs after this response has been sent (CLAUDE.md rule #5 — never inline). Closes over the
    // same already-authenticated `supabase` client built above rather than re-deriving it from
    // cookies inside the deferred callback.
    after(() => fetchBookmarkMetadata(supabase, item.id, url));
  }

  return NextResponse.json(item, { status: 201 });
}

// The file's bytes are already uploaded to Storage (direct browser-to-Storage, see
// lib/validation/items.ts's createFileItemSchema comment) by the time this arrives — this
// creates the Knowledge Item + file_assets row pointing at that upload, after re-verifying
// everything the client already checked (File_Uploads.md: "client-side validation alone is not
// sufficient since it can be bypassed"). Any rejection past this point deletes the just-uploaded
// Storage object rather than leaving it orphaned (File_Uploads.md's Error States).
async function createFileItem(body: unknown) {
  const result = createFileItemSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid file upload.",
        },
      },
      { status: 400 },
    );
  }

  const { type, collection_id, storage_path, filename, mime_type, size_bytes } = result.data;

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // The upload itself already went through Storage RLS (files_owner_insert,
  // 007_file_uploads.sql), which only lets the caller write under their own "{owner_id}/..."
  // prefix — this is a defense-in-depth check that the path a client claims to have uploaded to
  // is actually theirs, same spirit as verifyCollectionOwnership below. Deliberately checked
  // before validateFileUpload below (not just for defense-in-depth's own sake): every later
  // rejection branch cleans up the Storage object it just confirmed is this caller's own, and
  // that cleanup itself relies on this authenticated, RLS-scoped `supabase` client existing —
  // self-review caught an earlier ordering where the size/type check ran first and could reject
  // (leaving the upload orphaned) before this client was even created.
  if (!storage_path.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid storage path." } },
      { status: 400 },
    );
  }

  const sizeCheck = validateFileUpload({ mimeType: mime_type, sizeBytes: size_bytes });
  if (!sizeCheck.valid || sizeCheck.type !== type) {
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "invalid_request", message: sizeCheck.valid ? "File type mismatch." : sizeCheck.error } },
      { status: 400 },
    );
  }

  const ownsCollection = await verifyCollectionOwnership(supabase, collection_id, user.id);
  if (!ownsCollection) {
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "not_found", message: "This collection doesn't exist." } },
      { status: 404 },
    );
  }

  // Content-sniffed verification against the actual uploaded bytes, not just the client-declared
  // mime_type (File_Uploads.md's Security Requirements) — see lib/files/verify-upload.ts.
  const contentCheck = await verifyUploadedFileContent(supabase, storage_path, mime_type);
  if (!contentCheck.ok) {
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "invalid_request", message: contentCheck.reason } },
      { status: 400 },
    );
  }

  // The size cap above only ever checked whatever size_bytes the client claimed — a client could
  // simply lie about it in the POST body to slide under the cap while the real (larger) bytes
  // already sit in Storage. verifyUploadedFileContent's Range response reports the object's real
  // size for free; re-check against it authoritatively when available, and store the real value
  // rather than the client's claim.
  const authoritativeSizeBytes = contentCheck.actualSizeBytes ?? size_bytes;
  if (authoritativeSizeBytes > maxBytesForType(type)) {
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "invalid_request", message: `This file is too large — the limit for this type is ${formatMaxSizeLabel(type)}.` } },
      { status: 400 },
    );
  }

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .insert({ owner_id: user.id, collection_id, type, title: filename })
    .select()
    .single();

  if (itemError) {
    console.error("[api/items] file item create failed:", itemError);
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong saving this file." } },
      { status: 500 },
    );
  }

  const { error: assetError } = await supabase.from("file_assets").insert({
    knowledge_item_id: item.id,
    storage_path,
    original_filename: filename,
    mime_type,
    size_bytes: authoritativeSizeBytes,
    extraction_status: type === "pdf" ? "pending" : "not_applicable",
  });

  if (assetError) {
    // The item row itself already saved — but a file item with no file_assets row is useless
    // (no way to ever read the file back), unlike a bookmark's website_metadata insert failure
    // (CLAUDE.md rule #7 doesn't apply the same way here: there's no meaningful degraded state to
    // fall back to). Undo both the item and the upload rather than leaving a broken item behind.
    console.error("[api/items] file_assets create failed:", assetError);
    await supabase.from("knowledge_items").delete().eq("id", item.id);
    await deleteUploadedObject(supabase, storage_path);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong saving this file." } },
      { status: 500 },
    );
  }

  if (type === "pdf") {
    // Runs after this response has been sent (CLAUDE.md rule #5). Closes over the same
    // already-authenticated `supabase` client, same pattern as the bookmark metadata job.
    after(() => extractPdfText(supabase, item.id, storage_path));
  }

  return NextResponse.json(item, { status: 201 });
}
