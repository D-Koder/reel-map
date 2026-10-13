-- Invite codes that work whatever shape the live tables have.
-- 1. create_collection_invite: makes (or reuses) a short code for a collection I own. The app used to
--    insert the invite itself, which the live table's insert rules refused.
-- 2. join_collection_by_code: joins with the role the live table allows ("member" isn't allowed there),
--    read from its check constraint, else the column's default.
-- Safe to run more than once.

alter table public.collection_invites add column if not exists code text;

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
       where m.collection_id = p_collection_id and m.user_id = v_user and m.role = 'owner'
     ) then
    raise exception 'Only the owner can invite people to this collection';
  end if;

  -- Reuse my newest short code with a week or more to go, so opening Share again doesn't pile up invites.
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

-- The role a joining member gets: "member" when the table allows it, else the first non-owner role
-- its check constraint names ("editor", "viewer", …), else null for the column's default.
create or replace function private.joining_member_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_role text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    where c.conrelid = 'public.collection_members'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
    limit 1;
  if v_def is null or v_def ilike '%''member''%' then
    return 'member';
  end if;
  select m[1] into v_role
    from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m
    where m[1] <> 'owner'
    limit 1;
  return v_role;
end;
$$;

create or replace function public.join_collection_by_code(p_code text)
returns table (collection_id uuid, collection_name text, joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite_id uuid;
  v_collection_id uuid;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'You must sign in to join a collection';
  end if;
  if char_length(v_key) < 6 or char_length(v_key) > 64 then
    raise exception 'That code doesn''t look right';
  end if;

  select i.id, i.collection_id
    into v_invite_id, v_collection_id
    from public.collection_invites i
    where upper(regexp_replace(i.code, '[^A-Za-z0-9]', '', 'g')) = v_key
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
    for update;

  if v_invite_id is null then
    raise exception 'That code is wrong or has expired';
  end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid()))
      on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role)
      on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.collection_invites
      set accepted_count = accepted_count + 1, last_used_at = now()
      where id = v_invite_id;
  end if;

  return query
    select c.id, c.name, v_inserted > 0
    from public.collections c
    where c.id = v_collection_id;
end;
$$;

revoke all on function public.join_collection_by_code(text) from public, anon;
grant execute on function public.join_collection_by_code(text) to authenticated;

-- Invite links (accept_collection_invite) join with the same role. Dropped first in case the live
-- version returns something else.
drop function if exists public.accept_collection_invite(uuid);
create or replace function public.accept_collection_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_collection_id uuid;
  v_expires_at timestamptz;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'You must sign in to accept an invite';
  end if;

  select i.collection_id, i.expires_at into v_collection_id, v_expires_at
    from public.collection_invites i
    where i.id = p_invite_id
    for update;

  if not found or v_expires_at <= now() then
    raise exception 'Invalid or expired invite link';
  end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid()))
      on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role)
      on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.collection_invites
      set accepted_count = accepted_count + 1, last_used_at = now()
      where id = p_invite_id;
  end if;

  return v_inserted > 0;
end;
$$;

revoke all on function public.accept_collection_invite(uuid) from public, anon;
grant execute on function public.accept_collection_invite(uuid) to authenticated;
