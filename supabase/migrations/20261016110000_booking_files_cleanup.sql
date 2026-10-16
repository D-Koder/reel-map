-- Booking confirmations are kept only while they're useful: they are deleted 1 day after the
-- booking ends (planned time + 2 hours, the length of the calendar event). Files uploaded for an
-- entry that was never booked (or whose booking was removed) go 2 days after upload.
-- The clean-booking-files Edge Function deletes them through the Storage API (so the stored file
-- itself is removed, not just its row), every hour from pg_cron.

create or replace function public.expired_booking_files()
returns setof text language sql stable security definer set search_path = '' as $$
	select o.name
	from storage.objects o
	left join public.bookings b
		on split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
		and split_part(o.name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
		and b.collection_id = split_part(o.name, '/', 1)::uuid
		and b.place_id = split_part(o.name, '/', 2)::uuid
	where o.bucket_id = 'booking-files'
		and (
			(b.planned_at is not null and b.planned_at + interval '2 hours' + interval '1 day' < now())
			or (b.planned_at is null and o.created_at < now() - interval '2 days')
		)
	limit 1000;
$$;

-- Only the server (service role) may list them.
revoke all on function public.expired_booking_files() from public, anon, authenticated;
grant execute on function public.expired_booking_files() to service_role;

select cron.schedule(
	'clean-booking-files',
	'17 * * * *',
	$$
	select net.http_post(
		url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/clean-booking-files',
		headers := jsonb_build_object('Content-Type', 'application/json'),
		body := '{}'::jsonb
	);
	$$
);
