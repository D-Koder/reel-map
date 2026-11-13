-- Friends. A friend is someone you chose to connect with, so you can add them to a collection in one tap.
-- Only additive: two new tables and some functions. Nothing that exists is changed.
--
-- How people find each other (there is deliberately no search by email or name, which would let anyone
-- find out who has an account):
--   1. People you already share a collection with can be sent a request, which they accept or decline.
--   2. Your friend link (a code only you can read) connects you straight away when someone opens it,
--      because you chose to send it.

-- Your own friend code. Kept apart from profiles, which collection-mates can read.
create table public.friend_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  created_at timestamptz not null default now()
);

create table public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- One row per pair, whichever way round it was asked.
create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

alter table public.friend_codes enable row level security;
alter table public.friendships enable row level security;
create policy "friend_codes: read own" on public.friend_codes as permissive for select to authenticated
  using (user_id = (select auth.uid()));
-- Friendships are only written by the functions below.
create policy "friendships: read mine" on public.friendships as permissive for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));

-- Your friend link's code (made the first time it is asked for).
create function public.get_friend_code()
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;
  insert into public.friend_codes (user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
  select code into v_code from public.friend_codes where user_id = (select auth.uid());
  return v_code;
end;
$$;

-- My friends and open requests. direction: 'friend', 'incoming' (they asked me) or 'outgoing' (I asked them).
create function public.my_friends()
returns table (id uuid, display_name text, avatar text, avatar_url text, direction text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar, p.avatar_url,
         case when f.status = 'accepted' then 'friend'
              when f.addressee = (select auth.uid()) then 'incoming'
              else 'outgoing' end,
         f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  where (select auth.uid()) in (f.requester, f.addressee)
  order by p.display_name;
$$;

-- Ask someone I share a collection with. If they had already asked me, we are friends now.
create function public.request_friend(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_row public.friendships;
  v_name text;
begin
  if v_me is null then raise exception 'You must be signed in'; end if;
  if p_user_id = v_me then raise exception 'That''s you'; end if;
  if not private.shares_collection_with(p_user_id) then
    raise exception 'You can add people you share a collection with, or use their friend link';
  end if;

  select * into v_row from public.friendships
    where least(requester, addressee) = least(v_me, p_user_id) and greatest(requester, addressee) = greatest(v_me, p_user_id);
  if found then
    if v_row.status = 'pending' and v_row.addressee = v_me then
      update public.friendships set status = 'accepted' where requester = v_row.requester and addressee = v_row.addressee;
      return 'friend';
    end if;
    return case when v_row.status = 'accepted' then 'friend' else 'outgoing' end;
  end if;

  insert into public.friendships (requester, addressee) values (v_me, p_user_id);
  select display_name into v_name from public.profiles where id = v_me;
  insert into public.notifications (user_id, type, message)
    values (p_user_id, 'friend_request', coalesce(v_name, 'Someone') || ' sent you a friend request');
  return 'outgoing';
end;
$$;

-- Accept or decline a request someone sent me.
create function public.respond_friend_request(p_user_id uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_name text;
begin
  if v_me is null then raise exception 'You must be signed in'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where requester = p_user_id and addressee = v_me and status = 'pending';
    if not found then return false; end if;
    select display_name into v_name from public.profiles where id = v_me;
    insert into public.notifications (user_id, type, message)
      values (p_user_id, 'friend_added', coalesce(v_name, 'Someone') || ' accepted your friend request');
    return true;
  end if;
  delete from public.friendships where requester = p_user_id and addressee = v_me and status = 'pending';
  return found;
end;
$$;

-- Remove a friend, or cancel a request I sent.
create function public.remove_friend(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'You must be signed in'; end if;
  delete from public.friendships
    where (requester = v_me and addressee = p_user_id) or (requester = p_user_id and addressee = v_me);
  return found;
end;
$$;

-- Open someone's friend link: we are friends straight away. Returns their name.
create function public.friend_by_code(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
  v_name text;
  v_my_name text;
begin
  if v_me is null then raise exception 'You must be signed in'; end if;
  select fc.user_id into v_other from public.friend_codes fc where fc.code = lower(btrim(coalesce(p_code, '')));
  if v_other is null then raise exception 'That friend link doesn''t work any more'; end if;
  if v_other = v_me then raise exception 'That''s your own link'; end if;

  if exists (select 1 from public.friendships
              where least(requester, addressee) = least(v_me, v_other) and greatest(requester, addressee) = greatest(v_me, v_other)) then
    update public.friendships set status = 'accepted'
      where least(requester, addressee) = least(v_me, v_other) and greatest(requester, addressee) = greatest(v_me, v_other);
  else
    insert into public.friendships (requester, addressee, status) values (v_me, v_other, 'accepted');
    select display_name into v_my_name from public.profiles where id = v_me;
    insert into public.notifications (user_id, type, message)
      values (v_other, 'friend_added', coalesce(v_my_name, 'Someone') || ' is now your friend');
  end if;
  select display_name into v_name from public.profiles where id = v_other;
  return v_name;
end;
$$;

-- Add a friend to a collection I own. They join as a viewer, like anyone joining with an invite.
create function public.add_friend_to_collection(p_collection_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_name text; v_private boolean;
  v_inserted integer;
begin
  if v_me is null then raise exception 'You must be signed in'; end if;
  select c.name, c.is_private into v_name, v_private from public.collections c
    where c.id = p_collection_id and c.owner_id = v_me;
  if not found then raise exception 'Only the owner can add people'; end if;
  if v_private then raise exception 'This collection is locked. Unlock it to add people'; end if;
  if not exists (select 1 from public.friendships
                  where status = 'accepted'
                    and ((requester = v_me and addressee = p_user_id) or (requester = p_user_id and addressee = v_me))) then
    raise exception 'You can only add friends';
  end if;

  insert into public.collection_members (collection_id, user_id, role)
    values (p_collection_id, p_user_id, private.joining_member_role())
    on conflict (collection_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    insert into public.notifications (user_id, type, message, collection_id)
      values (p_user_id, 'collection_added',
              coalesce((select display_name from public.profiles where id = v_me), 'Someone') || ' added you to "' || v_name || '"',
              p_collection_id);
  end if;
  return v_inserted > 0;
end;
$$;

revoke execute on function public.get_friend_code(), public.my_friends(), public.request_friend(uuid),
  public.respond_friend_request(uuid, boolean), public.remove_friend(uuid), public.friend_by_code(text),
  public.add_friend_to_collection(uuid, uuid) from public, anon;
grant execute on function public.get_friend_code(), public.my_friends(), public.request_friend(uuid),
  public.respond_friend_request(uuid, boolean), public.remove_friend(uuid), public.friend_by_code(text),
  public.add_friend_to_collection(uuid, uuid) to authenticated;
