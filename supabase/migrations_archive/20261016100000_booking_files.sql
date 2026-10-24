-- Booking confirmations (screenshots, PDFs) uploaded on a booked place, so the collection can see them.
-- Files live at booking-files/<collection_id>/<place_id>/<file>. The bucket is private: members read
-- them through signed links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-files', 'booking-files', false, 10485760,
	array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

-- The first folder must be a collection id. CASE keeps a non-uuid folder from failing the cast.
create or replace function private.is_booking_file_member(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
	select case
		when (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F-]{36}$'
			then private.is_collection_member(((storage.foldername(object_name))[1])::uuid)
		else false
	end;
$$;

grant execute on function private.is_booking_file_member(text) to authenticated;

create policy "booking files: members read"
	on storage.objects for select to authenticated
	using (bucket_id = 'booking-files' and private.is_booking_file_member(name));

create policy "booking files: members upload"
	on storage.objects for insert to authenticated
	with check (bucket_id = 'booking-files' and private.is_booking_file_member(name));

create policy "booking files: uploader deletes"
	on storage.objects for delete to authenticated
	using (bucket_id = 'booking-files' and owner_id = (select auth.uid())::text);
