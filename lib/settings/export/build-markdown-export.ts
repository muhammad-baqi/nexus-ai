import JSZip from "jszip";

import type { ExportBundle, ExportedItem } from "@/lib/settings/export/build-json-export";
import { serializeFrontmatter } from "@/lib/settings/export/frontmatter";

// Filesystem-unsafe characters + trailing whitespace stripped; falls back to a generic name
// rather than an empty string so a pathological title (e.g. all-punctuation) never produces an
// unusable zero-length folder/file name.
function sanitizeName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || fallback;
}

function uniqueName(base: string, extension: string, used: Set<string>): string {
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}${extension}`;
    suffix++;
  }
  used.add(candidate);
  return candidate;
}

// Settings.md: "Markdown files for Notes and a manifest/metadata file for other item types" — a
// note's body is its real content; every other type's body is a short metadata block instead,
// using the same one-file-per-item shape rather than inventing a second file-naming convention.
function itemToMarkdown(item: ExportedItem): string {
  const frontmatter = serializeFrontmatter({
    title: item.title,
    type: item.type,
    // JSON-encoded, not comma-joined — a tag name may legally contain a comma itself
    // (lib/validation/tags.ts's tagNameSchema doesn't forbid it), which a bare `join(", ")` would
    // corrupt on the way back in (lib/settings/jobs/run-import-job.ts's parseFrontmatterTags).
    // serializeFrontmatter's own newline-escaping still applies to this single-line JSON string.
    tags: JSON.stringify(item.tags),
    created_at: item.created_at,
    is_favorite: String(item.is_favorite),
    is_archived: String(item.is_archived),
    ...(item.website && { url: item.website.url }),
    ...(item.file && { filename: item.file.original_filename, mime_type: item.file.mime_type }),
    ...(item.code_snippet && { language: item.code_snippet.language }),
  });

  // serializeFrontmatter already ends with a trailing "\n" after the closing fence — no extra
  // separator here, or parseFrontmatter's round-trip (lib/settings/export/frontmatter.ts) would
  // read back a spurious leading newline in the body every time (confirmed while writing this
  // feature's import round-trip test).
  if (item.type === "note") return frontmatter + (item.note?.content ?? "");
  if (item.type === "code_snippet") return frontmatter + (item.code_snippet?.code_content ?? "");
  return frontmatter + (item.description ?? "");
}

export async function buildMarkdownExport(bundle: ExportBundle): Promise<Buffer> {
  const zip = new JSZip();
  const usedFolderNames = new Set<string>();

  bundle.collections.forEach((collection, collectionIndex) => {
    const folderName = uniqueName(
      sanitizeName(collection.name, `collection-${collectionIndex + 1}`),
      "",
      usedFolderNames,
    );

    const usedFileNames = new Set<string>();
    collection.items.forEach((item, itemIndex) => {
      const fileName = uniqueName(
        sanitizeName(item.title, `item-${itemIndex + 1}`),
        ".md",
        usedFileNames,
      );
      zip.file(`${folderName}/${fileName}`, itemToMarkdown(item));
    });
  });

  return zip.generateAsync({ type: "nodebuffer" });
}
