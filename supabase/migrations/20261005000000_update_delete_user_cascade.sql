-- Update delete_user function to support cascade delete option
create or replace function public.delete_user(p_cascade_delete boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'You must be signed in to delete your account';
  end if;

  -- Handle collections owned by this user
  if p_cascade_delete then
    -- Delete all collections owned by the user (cascades to places, reactions, bookings, etc.)
    delete from public.collections
      where owner_id = v_user_id;
  else
    -- Just remove user from collection_members, leaving collections orphaned
    delete from public.collection_members
      where user_id = v_user_id;
  end if;

  -- Delete user's place orders
  delete from public.place_order
    where user_id = v_user_id;

  -- Delete user's reactions (if not already cascade deleted with collections)
  delete from public.reactions
    where user_id = v_user_id;

  -- Delete user's bookings
  delete from public.bookings
    where booked_by = v_user_id;

  -- Delete user's invites
  delete from public.collection_invites
    where created_by = v_user_id;

  -- Delete user's profile
  delete from public.profiles
    where id = v_user_id;

  -- Delete auth user
  delete from auth.users
    where id = v_user_id;

  return true;
end;
$$;

revoke all on function public.delete_user(boolean) from public, anon;
grant execute on function public.delete_user(boolean) to authenticated;
