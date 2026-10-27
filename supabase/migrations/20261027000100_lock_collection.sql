-- Locking a collection (collections.is_private) no longer removes anyone: it only stops new people joining
-- until the owner unlocks it. Existing members and invite codes are kept, so unlocking brings them back.
create or replace function public.set_collection_private(p_collection_id uuid, p_private boolean, p_confirm boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
begin
  select c.owner_id into v_owner_id
  from public.collections as c
  where c.id = p_collection_id;

  if not found then
    raise exception 'Collection not found';
  end if;

  if v_owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the owner can lock or unlock a collection';
  end if;

  update public.collections
  set is_private = p_private
  where id = p_collection_id;

  return 0;
end;
$$;

create or replace function public.accept_collection_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid; v_expires_at timestamptz;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'You must sign in to accept an invite'; end if;
  select i.collection_id, i.expires_at into v_collection_id, v_expires_at
    from public.collection_invites i where i.id = p_invite_id for update;
  if not found or v_expires_at <= now() then raise exception 'Invalid or expired invite link'; end if;
  if exists (select 1 from public.collections c where c.id = v_collection_id and c.is_private) then
    raise exception 'This collection is locked. Ask the owner to unlock it.';
  end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid())) on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role) on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.collection_invites set accepted_count = accepted_count + 1, last_used_at = now()
      where id = p_invite_id;
  end if;
  return v_inserted > 0;
end;
$$;

create or replace function public.join_collection_by_code(p_code text)
returns table (collection_id uuid, collection_name text, joined boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_key text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite_id uuid; v_collection_id uuid;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'You must sign in to join a collection'; end if;
  if char_length(v_key) < 6 or char_length(v_key) > 64 then raise exception 'That code doesn''t look right'; end if;

  select i.id, i.collection_id into v_invite_id, v_collection_id from public.collection_invites i
    where upper(regexp_replace(i.code, '[^A-Za-z0-9]', '', 'g')) = v_key and i.expires_at > now()
    order by i.created_at desc limit 1 for update;
  if v_invite_id is null then raise exception 'That code is wrong or has expired'; end if;
  if exists (select 1 from public.collections c where c.id = v_collection_id and c.is_private) then
    raise exception 'This collection is locked. Ask the owner to unlock it.';
  end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid())) on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role) on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.collection_invites set accepted_count = accepted_count + 1, last_used_at = now()
      where id = v_invite_id;
  end if;
  return query select c.id, c.name, v_inserted > 0 from public.collections c where c.id = v_collection_id;
end;
$$;
