-- Places that aren't a cafe, food or an event (a shop, park, hotel, class...) are saved as "other".
-- The check on places.category only allowed the first three. Its name may differ on the live
-- database, so every check on that column is replaced. Safe to run more than once.

do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.places'::regclass and con.contype = 'c' and att.attname = 'category'
  loop
    execute format('alter table public.places drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.places
  add constraint places_category_check check (category in ('cafe', 'food', 'event', 'other'));
