-- Transfer collection ownership to another member
create or replace function public.transfer_collection_ownership(p_collection_id uuid, p_new_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  is_member boolean;
begin
  -- Only the current owner can transfer ownership
  select collection_id into current_owner_id
    from public.collection_members
    where collection_id = p_collection_id and user_id = (select auth.uid()) and role = 'owner'
    limit 1;

  if current_owner_id is null then
    raise exception 'You are not the owner of this collection';
  end if;

  -- Verify the new owner is a member
  select exists(
    select 1 from public.collection_members
    where collection_id = p_collection_id and user_id = p_new_owner_id
  ) into is_member;

  if not is_member then
    raise exception 'User is not a member of this collection';
  end if;

  -- Update current owner to member
  update public.collection_members
    set role = 'member'
    where collection_id = p_collection_id and user_id = (select auth.uid());

  -- Update new owner to owner
  update public.collection_members
    set role = 'owner'
    where collection_id = p_collection_id and user_id = p_new_owner_id;

  return true;
end;
$$;

revoke all on function public.transfer_collection_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_collection_ownership(uuid, uuid) to authenticated;

-- Delete user and their data
create or replace function public.delete_user()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid;
  orphan_collection_id uuid;
begin
  user_id := (select auth.uid());

  if user_id is null then
    raise exception 'You must be signed in to delete your account';
  end if;

  -- Orphan collections where user is the only owner
  -- (Collections with user as owner but no other members will just lose their owner)
  -- Actually, we keep them orphaned as requested

  -- Remove user from all collection_members
  delete from public.collection_members
    where user_id = user_id;

  -- Delete user's place orders
  delete from public.place_order
    where user_id = user_id;

  -- Delete user's reactions
  delete from public.reactions
    where user_id = user_id;

  -- Delete user's bookings
  delete from public.bookings
    where booked_by = user_id;

  -- Delete user's invites
  delete from public.collection_invites
    where created_by = user_id;

  -- Delete user's profile
  delete from public.profiles
    where id = user_id;

  -- Delete auth user
  delete from auth.users
    where id = user_id;

  return true;
end;
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
