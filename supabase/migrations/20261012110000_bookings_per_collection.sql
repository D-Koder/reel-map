-- A booking belongs to one collection's entry for a place, not the place itself.
-- Before this, booking a place in group A also showed as booked in group B when the place was copied there.

-- 1. Which collection each booking belongs to.
alter table public.bookings add column if not exists collection_id uuid;

-- Existing bookings go to the collection the booker is in (the earliest one if several), else the place's first collection.
update public.bookings b
set collection_id = coalesce(
  (select cp.collection_id
     from public.collection_places cp
     join public.collection_members m on m.collection_id = cp.collection_id and m.user_id = b.booked_by
    where cp.place_id = b.place_id
    order by cp.added_at
    limit 1),
  (select cp.collection_id
     from public.collection_places cp
    where cp.place_id = b.place_id
    order by cp.added_at
    limit 1)
)
where b.collection_id is null;

-- A booking for a place that is in no collection can't be shown anywhere.
delete from public.bookings where collection_id is null;

alter table public.bookings alter column collection_id set not null;

-- 2. One booking per collection entry. The entry's key replaces the old one-per-place key.
--    Moving the entry carries its booking along; removing the entry removes its booking.
alter table public.bookings drop constraint if exists bookings_pkey;
alter table public.bookings add constraint bookings_pkey primary key (collection_id, place_id);

alter table public.bookings drop constraint if exists bookings_collection_place_fkey;
alter table public.bookings
  add constraint bookings_collection_place_fkey
  foreign key (collection_id, place_id)
  references public.collection_places (collection_id, place_id)
  on update cascade on delete cascade;

-- 3. Only members of that collection can see or make its booking.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookings' and cmd in ('SELECT', 'INSERT')
  loop
    execute format('drop policy %I on public.bookings', pol.policyname);
  end loop;
end $$;

create policy "bookings: members read" on public.bookings
  for select to authenticated
  using (private.is_collection_member(collection_id));

create policy "bookings: member books" on public.bookings
  for insert to authenticated
  with check (booked_by = (select auth.uid()) and private.is_collection_member(collection_id));
