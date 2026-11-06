-- A review lists its own photos (up to 5), instead of showing whatever sits in the person's folder.
-- Each entry is a storage path in the visit-photos bucket: "<location_id>/<user_id>/<file>".
alter table public.place_reviews
  add column if not exists photos text[] not null default '{}';

alter table public.place_reviews
  add constraint place_reviews_photos_max check (cardinality(photos) <= 5);

-- Photos already uploaded join their review (the newest 5).
update public.place_reviews r
set photos = coalesce((
  select array_agg(t.name order by t.created_at)
  from (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'visit-photos'
      and (storage.foldername(o.name))[1] = r.location_id::text
      and (storage.foldername(o.name))[2] = r.user_id::text
    order by o.created_at desc
    limit 5
  ) t
), '{}');
