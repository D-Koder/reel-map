-- Claimed badges and level prizes (see frontend/src/lib/claims.js). Until now they were remembered per device, so a new
-- device showed them as unclaimed and XP dropped. They now live on the account as { "badges": [ids], "prizes": [levels] }.
-- Claims only ever grow, and the app copies a device's earlier claims up the first time it opens, so nothing is lost.
-- "profiles: update self" already lets a person write their own claims; reading needs no new policy.

alter table public.profiles
  add column if not exists claims jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_claims_is_object,
  add constraint profiles_claims_is_object check (jsonb_typeof(claims) = 'object' and pg_column_size(claims) < 4096);
