-- Fixes a latent Day 1 gap: migrations run as the `postgres` role, whose default-privilege
-- entry for the public schema only includes Dxtm (delete/references/trigger/maintain) for
-- anon/authenticated/service_role -- not arw (select/insert/update). RLS policies are meaningless
-- without the underlying GRANT; every table in 001_initial_schema.sql was created missing it.
-- This never surfaced until Profile management's PATCH /api/settings -- every feature before it
-- only wrote through Supabase Auth (auth.users, a different role entirely) or through the
-- `security definer` handle_new_user trigger, which bypasses role-based grants altogether.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- So every table/sequence created by future migrations (still run as `postgres`) gets the same
-- privileges automatically, matching Supabase's standard project default.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
