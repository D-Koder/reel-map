-- New accounts start with only their TBD collection, not Food and Events as well.
-- The starter Food and Events collections nobody used (no places, nobody else in them) are removed.
-- Safe to run more than once.

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid;
begin
  insert into public.profiles (id, display_name, avatar, country)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂'),
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60)
  );

  insert into public.collections (name, emoji, owner_id, is_inbox)
  values ('TBD', '📥', new.id, true)
  returning id into v_collection_id;

  insert into public.collection_members (collection_id, user_id, role)
  values (v_collection_id, new.id, 'owner');

  return new;
end;
$$;

delete from public.collections c
where c.name in ('Food', 'Events')
  and not c.is_inbox
  and not exists (select 1 from public.collection_places cp where cp.collection_id = c.id)
  and not exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id <> c.owner_id);
