alter table public.profiles add column avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "profile avatars: user uploads own image"
	on storage.objects for insert to authenticated
	with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "profile avatars: user replaces own image"
	on storage.objects for update to authenticated
	using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
	with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "profile avatars: user deletes own image"
	on storage.objects for delete to authenticated
	using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.get_user_collections()
returns table (
	id uuid,
	name text,
	emoji text,
	is_private boolean,
	owner_id uuid,
	created_at timestamptz,
	collection_members jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		c.id,
		c.name,
		c.emoji,
		c.is_private,
		c.owner_id,
		c.created_at,
		jsonb_agg(
			jsonb_build_object(
				'user_id', cm.user_id,
				'role', cm.role,
				'profile', jsonb_build_object(
					'id', p.id,
					'display_name', p.display_name,
					'avatar', p.avatar,
					'avatar_url', p.avatar_url
				)
			)
		) as collection_members
	from public.collections c
	left join public.collection_members cm on cm.collection_id = c.id
	left join public.profiles p on p.id = cm.user_id
	where c.owner_id = (select auth.uid())
		or exists (
			select 1 from public.collection_members m
			where m.collection_id = c.id and m.user_id = (select auth.uid())
		)
	group by c.id, c.name, c.emoji, c.is_private, c.owner_id, c.created_at
	order by c.created_at;
$$;

revoke all on function public.get_user_collections() from public, anon;
grant execute on function public.get_user_collections() to authenticated;

notify pgrst, 'reload schema';
