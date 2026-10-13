-- A vote (keen / maybe / meh) belongs to a collection's entry for a place, not the place itself.
-- Before this, voting on a place in group A also showed in group B when the place was in both.
-- Same change as bookings (20261012110000_bookings_per_collection.sql). Run in one go.

begin;

-- 1. Which collection each vote belongs to.
alter table public.reactions add column if not exists collection_id uuid;

-- The old key (place_id, user_id) allowed one vote per place; votes are now per collection entry.
alter table public.reactions drop constraint if exists reactions_pkey;

-- 2. Existing votes are copied to every collection that has the place and the voter can see,
--    so everyone keeps the votes they see today. A vote whose voter is in none of them goes to every
--    collection that has the place. Votes for places in no collection can't be shown, so they go.
insert into public.reactions (collection_id, place_id, user_id, feeling, created_at)
select cp.collection_id, r.place_id, r.user_id, r.feeling, r.created_at
from public.reactions r
join public.collection_places cp on cp.place_id = r.place_id
where r.collection_id is null
  and (
    exists (select 1 from public.collection_members m where m.collection_id = cp.collection_id and m.user_id = r.user_id)
    or exists (select 1 from public.collections c where c.id = cp.collection_id and c.owner_id = r.user_id)
    or not exists (
      select 1 from public.collection_places cp2
      where cp2.place_id = r.place_id
        and (
          exists (select 1 from public.collection_members m2 where m2.collection_id = cp2.collection_id and m2.user_id = r.user_id)
          or exists (select 1 from public.collections c2 where c2.id = cp2.collection_id and c2.owner_id = r.user_id)
        )
    )
  );

delete from public.reactions where collection_id is null;

alter table public.reactions alter column collection_id set not null;

-- 3. One vote per person per collection entry. Moving the entry carries its votes along;
--    removing the entry removes its votes.
alter table public.reactions add constraint reactions_pkey primary key (collection_id, place_id, user_id);

alter table public.reactions drop constraint if exists reactions_collection_place_fkey;
alter table public.reactions
  add constraint reactions_collection_place_fkey
  foreign key (collection_id, place_id)
  references public.collection_places (collection_id, place_id)
  on update cascade on delete cascade;

create index if not exists reactions_place_id_idx on public.reactions (place_id);

-- 4. Older app versions still send votes without a collection. Fill it in with the voter's
--    first collection that has the place, so their votes keep working until they update.
create or replace function private.fill_reaction_collection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collection_id is null then
    select cp.collection_id into new.collection_id
    from public.collection_places cp
    where cp.place_id = new.place_id
      and (
        exists (select 1 from public.collection_members m where m.collection_id = cp.collection_id and m.user_id = new.user_id)
        or exists (select 1 from public.collections c where c.id = cp.collection_id and c.owner_id = new.user_id)
      )
    order by cp.added_at
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists fill_reaction_collection on public.reactions;
create trigger fill_reaction_collection before insert on public.reactions
  for each row execute function private.fill_reaction_collection();

-- 5. Members of that collection see its votes; you only add, change or remove your own.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'reactions'
  loop
    execute format('drop policy %I on public.reactions', pol.policyname);
  end loop;
end $$;

create policy "reactions: members read" on public.reactions
  for select to authenticated
  using (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id));

create policy "reactions: add own" on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id))
  );

create policy "reactions: change own" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id))
  );

create policy "reactions: remove own" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
