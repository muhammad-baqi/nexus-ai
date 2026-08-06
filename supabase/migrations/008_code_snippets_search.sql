-- Day 5 Code Snippets — docs/01_MVP/Code_Snippets.md.
-- code_snippet_data and its RLS already exist from 001_initial_schema.sql (owner-scoped via
-- knowledge_items.owner_id, same pattern as website_metadata/file_assets). This migration only
-- folds code_snippet_data.language + code_snippet_data.code_content into
-- knowledge_items.search_vector, per 001's own comment anticipating this and the precedent
-- 007_file_uploads.sql already set for file_assets.extracted_text.
--
-- Per .claude/rules/database.md, 001_initial_schema.sql is already applied to
-- nexus-staging/nexus-prod, so this only ever adds/replaces — it never edits that file directly.

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
    ), '')), 'C') ||
    setweight(to_tsvector('english', coalesce((
      select csd.code_content from code_snippet_data csd where csd.knowledge_item_id = item_id
    ), '')), 'C') ||
    setweight(to_tsvector('english', coalesce((
      select csd.language from code_snippet_data csd where csd.knowledge_item_id = item_id
    ), '')), 'D');
$$ language sql stable;

create function code_snippet_data_refresh_search_vector() returns trigger as $$
begin
  update knowledge_items
    set search_vector = knowledge_item_search_vector(id, title, description)
    where id = coalesce(new.knowledge_item_id, old.knowledge_item_id);
  return null;
end;
$$ language plpgsql;

create trigger code_snippet_data_search_vector_trigger
  after insert or update of language, code_content on code_snippet_data
  for each row execute function code_snippet_data_refresh_search_vector();
