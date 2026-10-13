-- Viewers and editors.
--   Viewer (everyone who joins): sees, votes, shares the invite code, leaves, and copies places into
--   their own collections. Can't add, edit, move or delete places here, or book them.
--   Editor: what the collection's rules already allow members to do.
--   Owner: everything, and picks who is an editor (set_member_role).
-- Viewers are blocked by a trigger, not by rewriting each policy, so it also covers the
-- add_place_to_collection / delete_place functions and whatever rules the live tables have.
-- Safe to run more than once.

-- 1. Can I change places in this collection? Owner, or a member whose role is owner or editor.
create or replace function private.can_edit_collection(p_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collections c
    where c.id = p_collection_id and c.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.collection_members m
    where m.collection_id = p_collection_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  );
$$;

-- 2. Stops viewers changing a collection's places or bookings.
create or replace function private.block_viewer_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_target uuid;
begin
  -- The server (shortcut saves, lookups) and the database's own clean-ups have no signed-in user.
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  -- Only who-added-it changing: a deleted account being tidied up, not someone editing.
  if tg_op = 'UPDATE' and (v_new - 'added_by') = (v_old - 'added_by') then
    return new;
  end if;

  -- Where it's coming from (move, edit, delete): I must be able to edit there.
  if v_old is not null then
    v_target := (v_old ->> 'collection_id')::uuid;
    if v_target is not null
       and exists (select 1 from public.collections c where c.id = v_target)
       and not private.can_edit_collection(v_target) then
      raise exception 'Viewers can''t change places in this collection. Ask the owner to make you an editor.'
        using errcode = '42501';
    end if;
  end if;

  -- Where it's going (add, copy, move): I must be able to edit there too. Copying into my own
  -- collection passes, because I own it.
  if v_new is not null then
    v_target := (v_new ->> 'collection_id')::uuid;
    if v_target is not null and not private.can_edit_collection(v_target) then
      raise exception 'Viewers can''t add places to this collection. Copy it to one of your own instead.'
        using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists block_viewer_changes on public.collection_places;
create trigger block_viewer_changes
  before insert or update or delete on public.collection_places
  for each row execute function private.block_viewer_changes();

do $$
begin
  if to_regclass('public.bookings') is not null then
    execute 'drop trigger if exists block_viewer_changes on public.bookings';
    execute 'create trigger block_viewer_changes before insert or update or delete on public.bookings
             for each row execute function private.block_viewer_changes()';
  end if;
end $$;

-- 3. New members join as viewers.
alter table public.collection_members alter column role set default 'viewer';

create or replace function private.joining_member_role()
returns text
language sql
stable
set search_path = ''
as $$
  select 'viewer'::text;
$$;

-- 4. Everyone who joined so far got "editor". Make them viewers; the owner can promote them again.
update public.collection_members m
  set role = 'viewer'
  where m.role = 'editor'
    and not exists (select 1 from public.collections c where c.id = m.collection_id and c.owner_id = m.user_id);

-- 5. The owner makes a member an editor or a viewer.
create or replace function public.set_member_role(p_collection_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'A member can be an editor or a viewer';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user and m.role = 'owner'
     ) then
    raise exception 'Only the owner can change roles';
  end if;
  if exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = p_user_id) then
    raise exception 'The owner''s role can''t be changed';
  end if;

  update public.collection_members m
    set role = p_role
    where m.collection_id = p_collection_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then
    raise exception 'That person isn''t in this collection';
  end if;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- 6. Any member can share the invite code, not only the owner.
create or replace function public.create_collection_invite(p_collection_id uuid)
returns table (invite_id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_letters constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_id uuid;
  v_has_invited_by boolean;
begin
  if v_user is null then
    raise exception 'You must sign in to share a collection';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user
     ) then
    raise exception 'Only people in this collection can invite others';
  end if;

  -- Reuse the newest short code with a week or more to go, so opening Share again doesn't pile up invites.
  select i.id, i.code into v_id, v_code
    from public.collection_invites i
    where i.collection_id = p_collection_id
      and i.code ~ '^[A-Z0-9]{8}$'
      and i.expires_at > now() + interval '7 days'
    order by i.created_at desc
    limit 1;
  if v_id is not null then
    return query select v_id, v_code;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collection_invites' and column_name = 'invited_by'
  ) into v_has_invited_by;

  for attempt in 1..5 loop
    -- 8 letters from strong random bytes. Bytes 248 and up are skipped so every letter is equally likely.
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      -- Bytes 6 and 8 carry the uuid's version and variant bits, so only the others are used.
      foreach v_byte in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15] loop
        exit when char_length(v_code) = 8;
        if get_byte(v_bytes, v_byte) < 248 then
          v_code := v_code || substr(v_letters, get_byte(v_bytes, v_byte) % 31 + 1, 1);
        end if;
      end loop;
    end loop;

    if exists (select 1 from public.collection_invites i where i.code = v_code) then
      continue;
    end if;

    if v_has_invited_by then
      execute 'insert into public.collection_invites (collection_id, code, invited_by, created_by, expires_at)
               values ($1, $2, $3, $3, now() + interval ''30 days'') returning id'
        into v_id using p_collection_id, v_code, v_user;
    else
      insert into public.collection_invites (collection_id, code, created_by, expires_at)
        values (p_collection_id, v_code, v_user, now() + interval '30 days')
        returning id into v_id;
    end if;
    return query select v_id, v_code;
    return;
  end loop;

  raise exception 'Couldn''t make an invite code. Try again.';
end;
$$;

revoke all on function public.create_collection_invite(uuid) from public, anon;
grant execute on function public.create_collection_invite(uuid) to authenticated;
