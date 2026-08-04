-- Day 4 Dashboard: "Recently Viewed" (Dashboard.md) is explicitly distinct from recently
-- *edited* — it tracks opening an item, not changing it — and no existing table captures that.
-- `activity_log` (001_initial_schema.sql) is close but is Day 6's own not-yet-built feature (its
-- action enum doesn't even have a `viewed` value), so this adds a small, purpose-built table
-- instead of reaching ahead into Day 6's scope. One row per (item, owner) — this only ever needs
-- "when did I last open this", not a full view history.

create table item_views (
  knowledge_item_id uuid not null references knowledge_items (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (knowledge_item_id, owner_id)
);

create index item_views_owner_viewed_idx on item_views (owner_id, viewed_at desc);

alter table item_views enable row level security;

create policy item_views_owner_access on item_views
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Three small RPCs back GET /api/dashboard's sections that a plain PostgREST fluent query can't
-- express (a join for recently-viewed item details, a GROUP BY aggregate for recent-collection
-- activity, and a GROUP BY count for statistics) — same rationale as 005_search_function.sql.
-- None are `security definer`; RLS on the underlying tables still applies regardless of the
-- passed owner id.

create or replace function dashboard_recently_viewed(p_owner_id uuid, p_limit int default 10)
returns table (
  id uuid,
  collection_id uuid,
  type knowledge_item_type,
  title text,
  is_favorite boolean,
  is_archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  viewed_at timestamptz
)
language sql stable as $$
  select ki.id, ki.collection_id, ki.type, ki.title, ki.is_favorite, ki.is_archived,
    ki.created_at, ki.updated_at, iv.viewed_at
  from item_views iv
  join knowledge_items ki on ki.id = iv.knowledge_item_id
  where iv.owner_id = p_owner_id and ki.deleted_at is null
  order by iv.viewed_at desc
  limit p_limit;
$$;

grant execute on function dashboard_recently_viewed(uuid, int) to authenticated;

-- "Most recently active" (Dashboard.md) = the latest of the collection's own updated_at (covers
-- a brand-new, still-empty collection) and its non-trashed items' updated_at. Archived
-- collections are excluded — the generic set_updated_at trigger bumps updated_at on an
-- archive/unarchive toggle same as any other update, so without this filter the exact moment a
-- user archives a collection to get it out of the way would jump it to the top of "Recent
-- Collections" (self-review caught this as a real bug, not just a style nit).
create or replace function dashboard_recent_collections(p_owner_id uuid, p_limit int default 6)
returns table (
  id uuid,
  name text,
  color text,
  icon text,
  is_favorite boolean,
  last_activity_at timestamptz
)
language sql stable as $$
  select c.id, c.name, c.color, c.icon, c.is_favorite,
    greatest(c.updated_at, coalesce(max(ki.updated_at), c.updated_at)) as last_activity_at
  from collections c
  left join knowledge_items ki on ki.collection_id = c.id and ki.deleted_at is null
  where c.owner_id = p_owner_id and c.deleted_at is null and c.is_archived = false
  group by c.id
  order by last_activity_at desc
  limit p_limit;
$$;

grant execute on function dashboard_recent_collections(uuid, int) to authenticated;

create or replace function dashboard_item_type_counts(p_owner_id uuid)
returns table (item_type knowledge_item_type, item_count bigint)
language sql stable as $$
  select type, count(*)
  from knowledge_items
  where owner_id = p_owner_id and deleted_at is null
  group by type;
$$;

grant execute on function dashboard_item_type_counts(uuid) to authenticated;
