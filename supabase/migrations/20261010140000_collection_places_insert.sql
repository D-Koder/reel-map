-- Copying a place into a collection needs an insert rule. Production had none, so every copy was
-- rejected with "permission denied". You can add a place you can see into a collection you belong
-- to, unless that collection is locked (owners can always add).
drop policy if exists "collection_places: member adds" on public.collection_places;
create policy "collection_places: member adds"
  on public.collection_places for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and private.is_collection_member(collection_id)
    and (
      not exists (
        select 1 from public.collections c
        where c.id = collection_places.collection_id and c.is_locked
      )
      or private.is_collection_owner(collection_id)
    )
  );
