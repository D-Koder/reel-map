-- DESTRUCTIVE: wipes the public and private schemas in the TEST project.
-- Run only through supabase/scripts/reset-test-project.sh, which refuses to run against the live project.
-- Auth users and storage files are not removed by this file.

drop schema if exists public cascade;
drop schema if exists private cascade;

create schema public;
create schema private;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema private to postgres, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
