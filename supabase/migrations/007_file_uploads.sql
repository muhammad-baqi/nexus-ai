-- Day 5 File Uploads (PDFs, Images, general Files) — docs/01_MVP/File_Uploads.md.
-- file_assets and its RLS already exist from 001_initial_schema.sql (owner-scoped via
-- knowledge_items.owner_id, same pattern as website_metadata). This migration adds:
-- (1) a private Storage bucket for the actual file bytes, RLS'd the same way 002's `avatars`
-- bucket is (objects live under "{owner_id}/{random-id}/{filename}", so foldername()[1] scopes
-- correctly); (2) folding file_assets.extracted_text into knowledge_items.search_vector (weight
-- C, alongside description — both are body-content per Search.md's "title > tag > body"
-- ranking), per Database_Schema.md's indexing note and 001's own comment anticipating this.
--
-- Per .claude/rules/database.md, 001_initial_schema.sql is already applied to
-- nexus-staging/nexus-prod, so this only ever adds/replaces — it never edits that file directly.

-- ── Storage bucket ──────────────────────────────────────────────────────────
-- 52428800 = 50MB, the largest of the three per-type caps (PDF 50MB / Image 20MB / File 25MB,
-- lib/files/constants.ts) — a backstop; the authoritative, per-type check happens in application
-- code both client- and server-side (File_Uploads.md's Shared Upload Requirements), since a
-- single bucket-level number can't express three different limits. allowed_mime_types mirrors
-- lib/files/constants.ts's allow-list — also just defense-in-depth, since this only checks the
-- client-declared Content-Type header (trivially spoofable); the real, content-sniffed check
-- (lib/files/sniff-content.ts) runs server-side after upload, per File_Uploads.md's Security
-- Requirements.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files',
  'files',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]
)
on conflict (id) do nothing;

create policy files_owner_select on storage.objects
  for select using (
    bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy files_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy files_owner_delete on storage.objects
  for delete using (
    bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update policy: uploaded files are immutable objects (a "re-upload" creates a new item, same
-- as bookmarks/notes don't let you swap a different URL/type onto an existing row) — only
-- select/insert/delete are needed.

-- ── search_vector: fold in file_assets.extracted_text ──────────────────────

create or replace function knowledge_item_search_vector(item_id uuid, item_title text, item_description text)
returns tsvector as $$
  select
    setweight(to_tsvector('english', coalesce(item_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((
      select string_agg(t.name, ' ')
      from knowledge_item_tags kit
      join tags t on t.id = kit.tag_id
      where kit.knowledge_item_id = item_id
    ), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(item_description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce((
      select fa.extracted_text from file_assets fa where fa.knowledge_item_id = item_id
    ), '')), 'C');
$$ language sql stable;

create function file_assets_refresh_search_vector() returns trigger as $$
begin
  update knowledge_items
    set search_vector = knowledge_item_search_vector(id, title, description)
    where id = coalesce(new.knowledge_item_id, old.knowledge_item_id);
  return null;
end;
$$ language plpgsql;

create trigger file_assets_search_vector_trigger
  after insert or update of extracted_text on file_assets
  for each row execute function file_assets_refresh_search_vector();
