-- A quick review and one photo, added when a place is marked as done.
-- Photos live in their own private bucket (unlike booking files, they are kept).
alter table public.bookings
  add column review text check (char_length(review) <= 500),
  add column photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Folder is "<collection_id>/<place_id>/", same as booking-files.
create policy "visit photos: members upload" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'visit-photos' and private.is_booking_file_member(name));
create policy "visit photos: members read" on storage.objects as permissive for select to authenticated
  using (bucket_id = 'visit-photos' and private.is_booking_file_member(name));
create policy "visit photos: uploader deletes" on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);
