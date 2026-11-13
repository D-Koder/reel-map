-- Peek into a collection from its invite link, without an account.
-- Only an unexpired invite to a collection that is not locked works. It returns the collection's name,
-- the owner's first name and the places' names and addresses: never notes, votes, bookings, files or members.
create or replace function public.peek_collection_invite(p_invite_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', c.name,
    'emoji', c.emoji,
    'owner_name', split_part(pr.display_name, ' ', 1),
    'place_count', (select count(*) from public.collection_places cp where cp.collection_id = c.id),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.place_id,
        'name', t.name,
        'emoji', t.custom_emoji,
        'category', t.category,
        'address', t.address
      ) order by t.added_at desc)
      from (
        select cp.place_id, cp.custom_emoji, cp.category, cp.added_at,
               coalesce(nullif(cp.custom_name, ''), p.name) as name,
               coalesce(cp.address, p.address) as address
        from public.collection_places cp
        join public.places p on p.id = cp.place_id
        where cp.collection_id = c.id
        order by cp.added_at desc
        limit 30
      ) t
    ), '[]'::jsonb)
  )
  from public.collection_invites i
  join public.collections c on c.id = i.collection_id
  left join public.profiles pr on pr.id = c.owner_id
  where i.id = p_invite_id
    and i.expires_at > now()
    and not c.is_private
    and not c.is_inbox;
$$;

revoke all on function public.peek_collection_invite(uuid) from public;
grant execute on function public.peek_collection_invite(uuid) to anon, authenticated;
