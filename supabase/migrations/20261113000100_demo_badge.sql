-- The Test Driver badge: earned by finishing the no-login demo, then making an account. It belongs to the account,
-- so it follows the person to every device (see frontend/src/hooks/useAchievements.js).
--   null     not earned
--   earned   earned, celebration not shown yet
--   claimed  collected (the celebration has played, so no other device replays it)
-- "profiles: update self" already lets a person move earned to claimed; reading needs no new policy.

alter table public.profiles
  add column if not exists demo_badge text;

alter table public.profiles
  drop constraint if exists profiles_demo_badge_known,
  add constraint profiles_demo_badge_known check (demo_badge is null or demo_badge in ('earned', 'claimed'));

-- A new account made from the demo carries demo_done in its sign-up data. Only new accounts are marked here,
-- so someone who already has an account and then tries the demo earns nothing.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid;
  v_default record;
begin
  insert into public.profiles (id, display_name, avatar, country, demo_badge)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      'New user'
    ), 40),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂'),
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60),
    case when new.raw_user_meta_data ->> 'demo_done' = 'true' then 'earned' end
  );

  for v_default in select * from (values ('Food', '🍽️', 1), ('Events', '🎉', 2), ('TBD', '📥', 3)) as d(name, emoji, sort) order by sort loop
    insert into public.collections (name, emoji, owner_id, created_at, is_inbox)
    values (v_default.name, v_default.emoji, new.id, clock_timestamp(), v_default.name = 'TBD')
    returning id into v_collection_id;

    insert into public.collection_members (collection_id, user_id, role)
    values (v_collection_id, new.id, 'owner');
  end loop;

  return new;
end;
$$;
