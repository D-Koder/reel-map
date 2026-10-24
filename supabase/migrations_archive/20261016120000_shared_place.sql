-- A place shared by link (?place=<id>) can be previewed by anyone, signed in or not.
-- Only what's public about the venue is returned: no notes, votes, bookings, booking files,
-- collections or who added it.
create or replace function public.shared_place(pid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
	select jsonb_build_object(
		'id', p.id,
		'name', p.name,
		'category', p.category,
		'reel_url', p.reel_url,
		'reel_thumbnail_url', p.reel_thumbnail_url,
		'address', p.address,
		'lat', p.lat,
		'lng', p.lng,
		'hours', p.hours,
		'phone', p.phone,
		'booking_url', p.booking_url,
		'website_url', p.website_url,
		'menu_url', p.menu_url,
		'subtitle', p.subtitle,
		'source_id', p.source_id
	)
	from public.places p
	where p.id = pid;
$$;

revoke all on function public.shared_place(uuid) from public;
grant execute on function public.shared_place(uuid) to anon, authenticated;
