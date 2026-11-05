-- Reviews belong to the location, not to a collection or a visit: one per person per location,
-- shown to everyone who shares a collection with them. location_id is the place's venue_id
-- (the real-world spot, shared across collections), or the place's own id when it has no venue.
create table public.place_reviews (
  location_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, user_id)
);

alter table public.place_reviews enable row level security;

create policy "place reviews: read own and collection-mates" on public.place_reviews as permissive for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_collection_with(user_id));
create policy "place reviews: add own" on public.place_reviews as permissive for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "place reviews: change own" on public.place_reviews as permissive for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "place reviews: remove own" on public.place_reviews as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger touch_place_reviews before update on public.place_reviews
  for each row execute function private.touch_updated_at();

alter publication supabase_realtime add table public.place_reviews;

-- Reviews written on the earlier per-visit review box move across.
insert into public.place_reviews (location_id, user_id, body)
select distinct on (coalesce(p.venue_id, p.id), b.marked_by) coalesce(p.venue_id, p.id), b.marked_by, b.review
from public.bookings b
join public.places p on p.id = b.place_id
where b.review is not null and b.marked_by is not null
order by coalesce(p.venue_id, p.id), b.marked_by, b.updated_at desc
on conflict do nothing;

-- Review photos: "<location_id>/<user_id>/<file>". Anyone who can read the review can see its photos;
-- only the author adds or removes them.
drop policy if exists "visit photos: members upload" on storage.objects;
drop policy if exists "visit photos: members read" on storage.objects;
drop policy if exists "visit photos: uploader deletes" on storage.objects;

create policy "review photos: author uploads" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "review photos: author and collection-mates read" on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or private.shares_collection_with(((storage.foldername(name))[2])::uuid)
    )
  );
create policy "review photos: author deletes" on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[2] = (select auth.uid())::text);
