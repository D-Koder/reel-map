-- The files a signed-in person has uploaded (visit photos, booking confirmations, avatar), so the app can remove
-- them from storage when they delete their account. Deleting the account's rows does not remove stored files.
create or replace function public.my_files()
returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner_id = (select auth.uid())::text;
$$;
revoke all on function public.my_files() from public, anon;
grant execute on function public.my_files() to authenticated;
