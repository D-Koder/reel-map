-- TBD: each person's built-in inbox collection, where reels shared while scrolling land.
-- It's marked with is_inbox, so it can be renamed and still be found. The app hides its Delete button.
-- New accounts get it with Food and Events; existing accounts get one below. Safe to re-run.
alter table public.collections
  add column if not exists is_inbox boolean not null default false;

-- One inbox per person.
create unique index if not exists collections_one_inbox_per_owner
  on public.collections (owner_id) where is_inbox;

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

  for v_default in select * from (values ('Food', '🍽️', 1), ('Events', '🎉', 2), ('TBD', '📥', 3)) as d(name, emoji, sort) order by sort loop
    -- clock_timestamp() so they sort in this order (now() is the same for all three).
    insert into public.collections (name, emoji, owner_id, created_at, is_inbox)
    values (v_default.name, v_default.emoji, new.id, clock_timestamp(), v_default.name = 'TBD')
    returning id into v_collection_id;

    insert into public.collection_members (collection_id, user_id, role)
    values (v_collection_id, new.id, 'owner');
  end loop;

  return new;
end;
$$;

-- Existing accounts: mark their first collection named TBD as the inbox, or make one.
do $$
declare
  v_user uuid;
  v_collection_id uuid;
begin
  for v_user in
    select p.id from public.profiles p
    where not exists (select 1 from public.collections c where c.owner_id = p.id and c.is_inbox)
  loop
    select c.id into v_collection_id
    from public.collections c
    where c.owner_id = v_user and c.name = 'TBD'
    order by c.created_at
    limit 1;

    if v_collection_id is null then
      insert into public.collections (name, emoji, owner_id, created_at)
      values ('TBD', '📥', v_user, clock_timestamp())
      returning id into v_collection_id;

      insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, v_user, 'owner');
    end if;

    update public.collections set is_inbox = true where id = v_collection_id;
  end loop;
end;
$$;
