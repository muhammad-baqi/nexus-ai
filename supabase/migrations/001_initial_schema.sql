-- Nexus — initial schema
-- Every table with user data ships RLS in this same migration (CLAUDE.md rule #1,
-- .claude/rules/database.md). Policies scope to owner_id = auth.uid(), directly or
-- transitively through knowledge_item_id / collection_id for child tables.

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────

create type knowledge_item_type as enum ('note', 'website', 'pdf', 'image', 'file', 'code_snippet');
create type fetch_status_type as enum ('pending', 'success', 'failed');
create type extraction_status_type as enum ('not_applicable', 'pending', 'success', 'failed');
create type reminder_type as enum ('one_time', 'daily', 'weekly', 'monthly', 'custom');
create type activity_action_type as enum ('created', 'edited', 'deleted', 'restored', 'shared');
create type theme_preference_type as enum ('light', 'dark', 'system');

-- ── Core tables ──────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  theme_preference theme_preference_type not null default 'system',
  notification_email_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  color text,
  icon text,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index collections_owner_name_unique
  on collections (owner_id, lower(name))
  where deleted_at is null;

create index collections_owner_idx on collections (owner_id, deleted_at);

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  collection_id uuid not null references collections (id) on delete cascade,
  type knowledge_item_type not null,
  title text not null,
  description text,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector
);

create index knowledge_items_search_vector_idx on knowledge_items using gin (search_vector);
create index knowledge_items_collection_idx on knowledge_items (collection_id);
create index knowledge_items_owner_deleted_idx on knowledge_items (owner_id, deleted_at);

create table note_versions (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references knowledge_items (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index note_versions_item_idx on note_versions (knowledge_item_id, created_at desc);

create table website_metadata (
  knowledge_item_id uuid primary key references knowledge_items (id) on delete cascade,
  url text not null,
  canonical_url text,
  domain text,
  og_image_url text,
  favicon_url text,
  screenshot_url text,
  fetch_status fetch_status_type not null default 'pending'
);

create table file_assets (
  knowledge_item_id uuid primary key references knowledge_items (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  extracted_text text,
  extraction_status extraction_status_type not null default 'not_applicable'
);

create table code_snippet_data (
  knowledge_item_id uuid primary key references knowledge_items (id) on delete cascade,
  language text not null,
  code_content text not null
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index tags_owner_name_unique on tags (owner_id, lower(name));

create table knowledge_item_tags (
  knowledge_item_id uuid not null references knowledge_items (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (knowledge_item_id, tag_id)
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references knowledge_items (id) on delete cascade,
  type reminder_type not null,
  schedule jsonb not null default '{}'::jsonb,
  next_fire_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index reminders_due_idx on reminders (next_fire_at, is_active) where is_active;

create table share_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references knowledge_items (id) on delete cascade,
  token text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index share_links_token_unique on share_links (token);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  knowledge_item_id uuid references knowledge_items (id) on delete set null,
  collection_id uuid references collections (id) on delete set null,
  action activity_action_type not null,
  created_at timestamptz not null default now()
);

create index activity_log_owner_idx on activity_log (owner_id, created_at desc);

create table recent_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

create index recent_searches_owner_idx on recent_searches (owner_id, created_at desc);

-- ── updated_at maintenance ──────────────────────────────────────────────

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger collections_set_updated_at
  before update on collections
  for each row execute function set_updated_at();

create trigger knowledge_items_set_updated_at
  before update on knowledge_items
  for each row execute function set_updated_at();

-- ── search_vector maintenance ───────────────────────────────────────────
-- Populated from title + description here; Day 5's file_assets.extracted_text and
-- code_snippet_data.code_content are folded in via a separate update once those
-- features exist, per Database_Schema.md's indexing note.

create function knowledge_items_search_vector_update() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  return new;
end;
$$ language plpgsql;

create trigger knowledge_items_search_vector_trigger
  before insert or update of title, description on knowledge_items
  for each row execute function knowledge_items_search_vector_update();

-- ── New user provisioning: profile row + default "Inbox" collection ────

create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.collections (owner_id, name, description)
    values (new.id, 'Inbox', 'Default collection for new items');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table profiles enable row level security;
alter table collections enable row level security;
alter table knowledge_items enable row level security;
alter table note_versions enable row level security;
alter table website_metadata enable row level security;
alter table file_assets enable row level security;
alter table code_snippet_data enable row level security;
alter table tags enable row level security;
alter table knowledge_item_tags enable row level security;
alter table reminders enable row level security;
alter table share_links enable row level security;
alter table activity_log enable row level security;
alter table recent_searches enable row level security;

create policy profiles_owner_access on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy collections_owner_access on collections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy knowledge_items_owner_access on knowledge_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy note_versions_owner_access on note_versions
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = note_versions.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = note_versions.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy website_metadata_owner_access on website_metadata
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = website_metadata.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = website_metadata.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy file_assets_owner_access on file_assets
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = file_assets.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = file_assets.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy code_snippet_data_owner_access on code_snippet_data
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = code_snippet_data.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = code_snippet_data.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy tags_owner_access on tags
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy knowledge_item_tags_owner_access on knowledge_item_tags
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = knowledge_item_tags.knowledge_item_id and ki.owner_id = auth.uid()
    )
    and exists (
      select 1 from tags t
      where t.id = knowledge_item_tags.tag_id and t.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = knowledge_item_tags.knowledge_item_id and ki.owner_id = auth.uid()
    )
    and exists (
      select 1 from tags t
      where t.id = knowledge_item_tags.tag_id and t.owner_id = auth.uid()
    )
  );

create policy reminders_owner_access on reminders
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = reminders.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = reminders.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy share_links_owner_access on share_links
  for all using (
    exists (
      select 1 from knowledge_items ki
      where ki.id = share_links.knowledge_item_id and ki.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from knowledge_items ki
      where ki.id = share_links.knowledge_item_id and ki.owner_id = auth.uid()
    )
  );

create policy activity_log_owner_access on activity_log
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy recent_searches_owner_access on recent_searches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
