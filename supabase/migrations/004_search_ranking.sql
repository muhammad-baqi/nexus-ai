-- Day 4 Global Search: fold tags into knowledge_items.search_vector so ranking matches
-- 01_MVP/Search.md ("title matches above tag matches, and tag matches above body-content
-- matches"): weight A = title, B = tags, C = description (description doubles as note body,
-- per Day 3's scope decision — there's no dedicated note-body column).
--
-- Tags live in separate tables, so keeping search_vector correct as tags are
-- attached/detached/renamed requires triggers on knowledge_item_tags and tags too, not just
-- knowledge_items itself. Those triggers write knowledge_items.search_vector directly, which
-- would otherwise also bump updated_at via the existing generic set_updated_at() trigger — a
-- tag-attach today never touches the knowledge_items row at all (see
-- app/api/items/[id]/tags/route.ts), so that would be a new, surprising side effect (tagging an
-- item would silently reorder "recently updated" sort). set_updated_at() is redefined below to
-- only bump updated_at when something other than search_vector actually changed.
--
-- Per .claude/rules/database.md, 001_initial_schema.sql has already been applied to
-- nexus-staging/nexus-prod, so this only ever adds/replaces — it never edits that file directly.

create or replace function set_updated_at() returns trigger as $$
begin
  if to_jsonb(new) - 'updated_at' - 'search_vector' = to_jsonb(old) - 'updated_at' - 'search_vector' then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create function knowledge_item_search_vector(item_id uuid, item_title text, item_description text)
returns tsvector as $$
  select
    setweight(to_tsvector('english', coalesce(item_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((
      select string_agg(t.name, ' ')
      from knowledge_item_tags kit
      join tags t on t.id = kit.tag_id
      where kit.knowledge_item_id = item_id
    ), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(item_description, '')), 'C');
$$ language sql stable;

create or replace function knowledge_items_search_vector_update() returns trigger as $$
begin
  new.search_vector := knowledge_item_search_vector(new.id, new.title, new.description);
  return new;
end;
$$ language plpgsql;

create function knowledge_item_tags_refresh_search_vector() returns trigger as $$
declare
  target_id uuid := coalesce(new.knowledge_item_id, old.knowledge_item_id);
begin
  update knowledge_items
    set search_vector = knowledge_item_search_vector(id, title, description)
    where id = target_id;
  return null;
end;
$$ language plpgsql;

create trigger knowledge_item_tags_search_vector_trigger
  after insert or delete on knowledge_item_tags
  for each row execute function knowledge_item_tags_refresh_search_vector();

create function tags_refresh_search_vector() returns trigger as $$
begin
  if new.name is distinct from old.name then
    update knowledge_items ki
      set search_vector = knowledge_item_search_vector(ki.id, ki.title, ki.description)
      where ki.id in (select knowledge_item_id from knowledge_item_tags where tag_id = new.id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tags_search_vector_trigger
  after update of name on tags
  for each row execute function tags_refresh_search_vector();

-- Backfill existing rows (only title/description were weighted before this migration).
update knowledge_items
  set search_vector = knowledge_item_search_vector(id, title, description);

-- These narrow the owner_id/deleted_at scan for the common "browse without a query" path at the
-- 5,000-item scale (Search.md's performance requirement). They do NOT let Postgres skip sorting
-- for "recently updated"/"recently created" — 005_search_function.sql's ORDER BY wraps each
-- column in a `CASE WHEN p_sort = '...' THEN col END`, which a plain btree index can't satisfy;
-- if the Day 4 perf test comes in slow, that ORDER BY shape is the first thing to revisit.
create index knowledge_items_owner_deleted_updated_idx
  on knowledge_items (owner_id, deleted_at, updated_at desc);

create index knowledge_items_owner_deleted_created_idx
  on knowledge_items (owner_id, deleted_at, created_at desc);
