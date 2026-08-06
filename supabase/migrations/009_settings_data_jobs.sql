-- Day 6 Settings — full polish + Data Export/Import (docs/01_MVP/Settings.md).
-- Adds: (1) profiles.language_preference, the persisted half of the (English-only, functional)
-- language selector stub — notification_email_enabled already exists from 001_initial_schema.sql,
-- just never wired to a UI control until this feature; (2) export_jobs/import_jobs, two separate
-- tables (their success-state columns genuinely differ — see PROGRESS.md/plan for why not one
-- polymorphic table) backing the background export/import jobs; (3) a private `data-jobs` Storage
-- bucket for job output + client-uploaded import source files, RLS'd the same way 007's `files`
-- bucket is.
--
-- Per .claude/rules/database.md, 001_initial_schema.sql is already applied to
-- nexus-staging/nexus-prod, so this only ever adds — it never edits that file directly.

-- ── profiles: language preference ───────────────────────────────────────────

alter table profiles add column language_preference text not null default 'en';

-- ── Enums ────────────────────────────────────────────────────────────────

create type data_job_status as enum ('pending', 'processing', 'success', 'failed');
create type export_format_type as enum ('markdown', 'json', 'zip');
create type import_source_format_type as enum ('json', 'markdown');

-- ── export_jobs / import_jobs ────────────────────────────────────────────

create table export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  format export_format_type not null,
  status data_job_status not null default 'pending',
  storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index export_jobs_owner_idx on export_jobs (owner_id, created_at desc);

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_format import_source_format_type not null,
  source_storage_path text not null,
  status data_job_status not null default 'pending',
  created_count integer not null default 0,
  skipped_count integer not null default 0,
  skip_reasons jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index import_jobs_owner_idx on import_jobs (owner_id, created_at desc);

alter table export_jobs enable row level security;
alter table import_jobs enable row level security;

create policy export_jobs_owner_access on export_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy import_jobs_owner_access on import_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── Storage bucket ───────────────────────────────────────────────────────
-- 52428800 = 50MB, matching the same backstop ceiling 007's `files` bucket uses — the
-- authoritative per-flow limit (25MB for an import source upload, per lib/settings/constants.ts)
-- is enforced in application code, same reasoning as 007's own comment. Objects live under
-- "{owner_id}/exports/{jobId}.<ext>" and "{owner_id}/imports/{jobId}/source.<ext>", so
-- foldername()[1] scopes correctly either way.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'data-jobs',
  'data-jobs',
  false,
  52428800,
  array['application/json', 'application/zip']
)
on conflict (id) do nothing;

create policy data_jobs_owner_select on storage.objects
  for select using (
    bucket_id = 'data-jobs' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy data_jobs_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'data-jobs' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy data_jobs_owner_delete on storage.objects
  for delete using (
    bucket_id = 'data-jobs' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update policy — same reasoning as 007's `files` bucket: an object is written once
-- (export output, or the client's import upload) and never mutated in place.
