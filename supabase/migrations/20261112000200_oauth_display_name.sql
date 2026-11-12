-- Signing in with Google gives a name as "full_name" or "name", not "display_name".
-- Use it for the new profile, then fall back to the start of the email as before.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid;
  v_default record;
begin
  insert into public.profiles (id, display_name, avatar, country)
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
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60)
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
