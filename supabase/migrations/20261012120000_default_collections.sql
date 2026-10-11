-- New accounts start with a Food and an Events collection, so a shared reel has somewhere to go.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid;
  v_default record;
begin
  insert into public.profiles (id, display_name, avatar, country)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂'),
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60)
  );

  for v_default in select * from (values ('Food', '🍽️', 1), ('Events', '🎉', 2)) as d(name, emoji, sort) order by sort loop
    -- clock_timestamp() so Food sorts before Events (now() is the same for both).
    insert into public.collections (name, emoji, owner_id, created_at)
    values (v_default.name, v_default.emoji, new.id, clock_timestamp())
    returning id into v_collection_id;

    insert into public.collection_members (collection_id, user_id, role)
    values (v_collection_id, new.id, 'owner');
  end loop;

  return new;
end;
$$;
