-- Day 4 Global Search: a single server-side function backing GET /api/items' q/filter/sort/
-- pagination combination (API_Design.md: "the primary listing/search endpoint; also backs
-- Global Search when a q param is present"). A plain fluent PostgREST query can't express
-- ts_rank-based ordering, and doing the tag OR-filter as a separate round trip from the app
-- would cost an extra query per search — this keeps it to one indexed query, important for the
-- <500ms/5,000-item target in Search.md.
--
-- Not `security definer` — runs as the calling (authenticated) role, so RLS on knowledge_items
-- still applies underneath regardless of what p_owner_id is passed; p_owner_id is an explicit,
-- redundant filter for clarity/defense-in-depth, matching the existing route handlers' pattern
-- of also filtering by owner_id even though RLS already enforces it (CLAUDE.md rule #1).

create or replace function search_knowledge_items(
  p_owner_id uuid,
  p_query text default null,
  p_collection_id uuid default null,
  p_type knowledge_item_type default null,
  p_tag_ids uuid[] default null,
  p_favorite boolean default null,
  p_archived boolean default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_sort text default 'updated',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  collection_id uuid,
  type knowledge_item_type,
  title text,
  is_favorite boolean,
  is_archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql stable as $$
  select
    ki.id, ki.collection_id, ki.type, ki.title, ki.is_favorite, ki.is_archived,
    ki.created_at, ki.updated_at,
    count(*) over() as total_count
  from knowledge_items ki
  where ki.owner_id = p_owner_id
    and ki.deleted_at is null
    and (p_collection_id is null or ki.collection_id = p_collection_id)
    and (p_type is null or ki.type = p_type)
    and (p_favorite is null or ki.is_favorite = p_favorite)
    and (p_archived is null or ki.is_archived = p_archived)
    and (p_created_from is null or ki.created_at >= p_created_from)
    and (p_created_to is null or ki.created_at <= p_created_to)
    and (p_query is null or ki.search_vector @@ websearch_to_tsquery('english', p_query))
    and (
      p_tag_ids is null or exists (
        select 1 from knowledge_item_tags kit
        where kit.knowledge_item_id = ki.id and kit.tag_id = any(p_tag_ids)
      )
    )
  order by
    case when p_sort = 'relevance' and p_query is not null
      then ts_rank_cd(ki.search_vector, websearch_to_tsquery('english', p_query)) end desc nulls last,
    case when p_sort = 'created' then ki.created_at end desc nulls last,
    case when p_sort = 'title' then lower(ki.title) end asc nulls last,
    case when p_sort is null or p_sort = 'updated' then ki.updated_at end desc nulls last,
    ki.updated_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function search_knowledge_items(
  uuid, text, uuid, knowledge_item_type, uuid[], boolean, boolean, timestamptz, timestamptz, text, int, int
) to authenticated;
