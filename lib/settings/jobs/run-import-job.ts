import JSZip from "jszip";

import { getOrCreateTag } from "@/lib/items/tags";
import { parseFrontmatter } from "@/lib/settings/export/frontmatter";
import {
  exportBundleSchema,
  exportedItemSchema,
  type ExportedItemInput,
} from "@/lib/settings/import/parse-json-import";
import { DATA_JOBS_STORAGE_BUCKET } from "@/lib/settings/constants";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
export type ImportSourceFormat = "json" | "markdown";

type ImportOutcome = { createdCount: number; skippedCount: number; skipReasons: string[] };

// Runs via `after()` from POST /api/settings/import. Job status is only ever 'failed' when the
// source file itself couldn't be read/parsed at all (not valid JSON, not a valid ZIP) — a job with
// some items skipped alongside some created is still 'success', per Settings.md: "Malformed or
// partially invalid import files should not fail the whole job."
export async function runImportJob(
  supabase: SupabaseClient,
  jobId: string,
  ownerId: string,
  sourceFormat: ImportSourceFormat,
  sourceStoragePath: string,
): Promise<void> {
  const { error: startError } = await supabase
    .from("import_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);
  if (startError) console.error("[runImportJob] marking processing failed:", startError);

  try {
    const { data: sourceBlob, error: downloadError } = await supabase.storage
      .from(DATA_JOBS_STORAGE_BUCKET)
      .download(sourceStoragePath);
    if (downloadError || !sourceBlob) throw downloadError ?? new Error("import source download returned nothing");

    const outcome =
      sourceFormat === "json"
        ? await importFromJson(supabase, ownerId, await sourceBlob.text())
        : // Buffer.from(...), not the raw ArrayBuffer — same lib/files/extract-pdf-text.ts-style
          // download-then-convert convention build-zip-export.ts's own comment documents.
          await importFromMarkdownZip(supabase, ownerId, Buffer.from(await sourceBlob.arrayBuffer()));

    const { error: doneError } = await supabase
      .from("import_jobs")
      .update({
        status: "success",
        created_count: outcome.createdCount,
        skipped_count: outcome.skippedCount,
        skip_reasons: outcome.skipReasons,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (doneError) console.error("[runImportJob] marking success failed:", doneError);
  } catch (error) {
    console.error("[runImportJob] import failed:", error);
    const { error: failError } = await supabase
      .from("import_jobs")
      .update({
        status: "failed",
        error_message: "This file couldn't be read as a valid export bundle.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (failError) console.error("[runImportJob] marking failed failed:", failError);
  }
}

async function importFromJson(
  supabase: SupabaseClient,
  ownerId: string,
  text: string,
): Promise<ImportOutcome> {
  // JSON.parse throwing here is correct — an unparseable file means the job itself failed, not
  // "everything skipped."
  const parsed: unknown = JSON.parse(text);
  const result = exportBundleSchema.safeParse(parsed);
  if (!result.success) throw new Error("not a valid export bundle");

  let createdCount = 0;
  let skippedCount = 0;
  const skipReasons: string[] = [];

  for (const collection of result.data.collections) {
    const { data: newCollection, error: collectionError } = await supabase
      .from("collections")
      .insert({
        owner_id: ownerId,
        name: collection.name,
        description: collection.description ?? null,
        color: collection.color ?? null,
        icon: collection.icon ?? null,
        is_favorite: collection.is_favorite,
        is_archived: collection.is_archived,
      })
      .select("id")
      .single();

    if (collectionError || !newCollection) {
      skippedCount += collection.items.length;
      skipReasons.push(`Collection "${collection.name}": ${collectionError?.message ?? "create failed"}`);
      continue;
    }

    for (const rawItem of collection.items) {
      const itemResult = exportedItemSchema.safeParse(rawItem);
      if (!itemResult.success) {
        skippedCount++;
        skipReasons.push(`An item in "${collection.name}" was skipped: invalid format`);
        continue;
      }

      const created = await createImportedItem(supabase, ownerId, newCollection.id, itemResult.data);
      if (created) {
        createdCount++;
      } else {
        skippedCount++;
        skipReasons.push(`"${itemResult.data.title}" in "${collection.name}" was skipped: create failed`);
      }
    }
  }

  return { createdCount, skippedCount, skipReasons };
}

// Only understands *this app's own* export frontmatter (build-markdown-export.ts) — round-tripping
// our own export, not arbitrary Obsidian/Notion vaults, which are explicitly out of scope per
// Settings.md.
async function importFromMarkdownZip(
  supabase: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
): Promise<ImportOutcome> {
  // JSZip.loadAsync throwing here is correct — not a valid ZIP means the job itself failed.
  const zip = await JSZip.loadAsync(bytes);

  const folders = new Map<string, string[]>();
  zip.forEach((relativePath, file) => {
    if (file.dir || !relativePath.endsWith(".md")) return;
    const [folder] = relativePath.split("/");
    if (!folder) return;
    const list = folders.get(folder) ?? [];
    list.push(relativePath);
    folders.set(folder, list);
  });

  let createdCount = 0;
  let skippedCount = 0;
  const skipReasons: string[] = [];

  for (const [folderName, filePaths] of folders) {
    const { data: newCollection, error: collectionError } = await supabase
      .from("collections")
      .insert({ owner_id: ownerId, name: folderName })
      .select("id")
      .single();

    if (collectionError || !newCollection) {
      skippedCount += filePaths.length;
      skipReasons.push(`Collection "${folderName}": ${collectionError?.message ?? "create failed"}`);
      continue;
    }

    for (const path of filePaths) {
      const raw = await zip.file(path)?.async("string");
      if (!raw) {
        skippedCount++;
        skipReasons.push(`"${path}" was skipped: couldn't read file`);
        continue;
      }

      const item = frontmatterToItem(raw);
      if (!item) {
        skippedCount++;
        skipReasons.push(`"${path}" was skipped: invalid or unrecognized format`);
        continue;
      }

      const created = await createImportedItem(supabase, ownerId, newCollection.id, item);
      if (created) {
        createdCount++;
      } else {
        skippedCount++;
        skipReasons.push(`"${item.title}" in "${folderName}" was skipped: create failed`);
      }
    }
  }

  return { createdCount, skippedCount, skipReasons };
}

// Tags are serialized as a JSON array string (build-markdown-export.ts), not a bare comma-joined
// list — a tag name legally containing a comma (tagNameSchema places no restriction on it) would
// otherwise round-trip through Markdown-ZIP export→import as two separate tags instead of one.
// Falls back to [] on any parse failure rather than throwing — this is one field among many on an
// already-untrusted frontmatter block, and a bad tags value shouldn't fail the whole item.
function parseFrontmatterTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function frontmatterToItem(raw: string): ExportedItemInput | null {
  const { fields, body } = parseFrontmatter(raw);

  const candidate = {
    type: fields.type,
    title: fields.title,
    description: fields.type === "note" || fields.type === "code_snippet" ? null : body || null,
    is_favorite: fields.is_favorite === "true",
    is_archived: fields.is_archived === "true",
    created_at: fields.created_at,
    tags: parseFrontmatterTags(fields.tags),
    ...(fields.type === "note" && { note: { content: body } }),
    ...(fields.type === "code_snippet" && {
      code_snippet: { language: fields.language ?? "plaintext", code_content: body },
    }),
    ...(fields.type === "website" && fields.url && { website: { url: fields.url } }),
  };

  const result = exportedItemSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

// Shared by both import paths — creates the knowledge_items row, its type-specific child row, and
// tags, per lib/items/tags.ts's getOrCreateTag. File bytes are never re-imported (Settings.md's
// Import section covers JSON/Markdown only, not the binary-inclusive 'zip' export format) — a
// pdf/image/file item is recreated as a bare knowledge_items row with no file_assets behind it,
// same as build-markdown-export.ts's frontmatter-only representation for those types.
async function createImportedItem(
  supabase: SupabaseClient,
  ownerId: string,
  collectionId: string,
  item: ExportedItemInput,
): Promise<boolean> {
  const { data: newItem, error: itemError } = await supabase
    .from("knowledge_items")
    .insert({
      owner_id: ownerId,
      collection_id: collectionId,
      type: item.type,
      title: item.title,
      description: item.type === "note" ? (item.note?.content ?? "") : (item.description ?? null),
      is_favorite: item.is_favorite,
      is_archived: item.is_archived,
      // Preserves the original timestamp when the export carried one, rather than every restored
      // item silently becoming "created now" — self-review caught that created_at was validated
      // and round-tripped through the export format but never actually reaching this insert.
      ...(item.created_at && { created_at: item.created_at }),
    })
    .select("id")
    .single();

  if (itemError || !newItem) {
    console.error("[runImportJob] item create failed:", itemError);
    return false;
  }

  let typeDataError: { message: string } | null = null;
  if (item.type === "website" && item.website) {
    const { error } = await supabase.from("website_metadata").insert({
      knowledge_item_id: newItem.id,
      url: item.website.url,
      canonical_url: item.website.canonical_url ?? null,
      domain: item.website.domain ?? null,
      og_image_url: item.website.og_image_url ?? null,
      favicon_url: item.website.favicon_url ?? null,
      fetch_status: "success",
    });
    typeDataError = error;
  } else if (item.type === "code_snippet") {
    const { error } = await supabase.from("code_snippet_data").insert({
      knowledge_item_id: newItem.id,
      language: item.code_snippet?.language ?? "plaintext",
      code_content: item.code_snippet?.code_content ?? "",
    });
    typeDataError = error;
  }

  if (typeDataError) {
    console.error("[runImportJob] type-specific data create failed:", typeDataError);
    await supabase.from("knowledge_items").delete().eq("id", newItem.id);
    return false;
  }

  for (const tagName of item.tags) {
    const tag = await getOrCreateTag(supabase, ownerId, tagName);
    if (tag) {
      await supabase.from("knowledge_item_tags").insert({ knowledge_item_id: newItem.id, tag_id: tag.id });
    }
  }

  return true;
}
