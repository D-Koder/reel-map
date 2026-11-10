-- These two only make sense signed in (they also check who is calling), so signed-out visitors can't call them.
revoke execute on function public.delete_place(uuid, uuid) from public, anon;
revoke execute on function public.set_collection_private(uuid, boolean, boolean) from public, anon;
grant execute on function public.delete_place(uuid, uuid) to authenticated;
grant execute on function public.set_collection_private(uuid, boolean, boolean) to authenticated;
