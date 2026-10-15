-- reel_lookups now keeps the whole caption: data.place.caption (see /api/enrich-reel).
-- Never the hashtags, creator or cover.
-- Rows saved before this have no caption. Fill the ones lookup_debug has a caption for;
-- the rest are read from Instagram again on their next lookup. Safe to run more than once.

comment on table public.reel_lookups is
  'One row per Instagram Reel. data = { place: { placeName, location, venue, caption }, candidates }. Keeps the whole caption; never the hashtags, creator or cover.';

with debug as (
  select distinct on (key)
    regexp_replace(reel_url, '^(https://www\.instagram\.com/(reel|p)/[^/?#]+)/?.*$', '\1/') as key,
    caption
  from public.lookup_debug
  where coalesce(caption, '') <> ''
  order by key, created_at desc
)
update public.reel_lookups r
set data = jsonb_set(r.data, '{place,caption}', to_jsonb(debug.caption))
from debug
where r.key = debug.key
  and jsonb_typeof(r.data->'place') = 'object'
  and not (r.data->'place' ? 'caption');
