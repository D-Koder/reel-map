-- Reminders for a planned booking: 1 day, 1 hour, 30 minutes and 10 minutes before, and when it starts.
-- Everyone in the collection gets each one as a notification (which also goes out as a push; see
-- private.push_notification). A plan that is marked done gets no more. A reminder is only sent at its own moment
-- (up to 5 minutes late), so booking something 3 hours ahead doesn't fire the 1 day reminder straight away.
-- Planning a place again is a new planned time, so its reminders start over.

create table public.booking_reminders_sent (
  collection_id uuid not null,
  place_id uuid not null,
  planned_at timestamptz not null,
  minutes_before integer not null,
  primary key (collection_id, place_id, planned_at, minutes_before)
);

alter table public.booking_reminders_sent enable row level security;
revoke all on table public.booking_reminders_sent from public, anon, authenticated;

create or replace function public.send_booking_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_offsets constant integer[] := array[1440, 60, 30, 10, 0];
  v_due integer[];
  v_minutes integer;
  v_name text;
  v_when text;
  v_sent integer := 0;
begin
  for r in
    select b.collection_id, b.place_id, b.planned_at
    from public.bookings b
    where b.done_at is null
      and b.planned_at > now() - interval '5 minutes'
      and b.planned_at <= now() + interval '1 day'
  loop
    -- The reminders whose moment came in the last 5 minutes and haven't been sent.
    select array_agg(o order by o) into v_due
    from unnest(v_offsets) as o
    where r.planned_at - make_interval(mins => o) <= now()
      and r.planned_at - make_interval(mins => o) > now() - interval '5 minutes'
      and not exists (
        select 1 from public.booking_reminders_sent s
        where s.collection_id = r.collection_id and s.place_id = r.place_id
          and s.planned_at = r.planned_at and s.minutes_before = o
      );
    continue when v_due is null;

    insert into public.booking_reminders_sent (collection_id, place_id, planned_at, minutes_before)
    select r.collection_id, r.place_id, r.planned_at, o from unnest(v_due) as o
    on conflict do nothing;

    select p.name into v_name from public.places p where p.id = r.place_id;
    v_minutes := ceil(extract(epoch from (r.planned_at - now())) / 60.0);
    v_when := case
      when v_minutes <= 0 then 'is starting now'
      when v_minutes = 1 then 'is in 1 minute'
      when v_minutes < 60 then 'is in ' || v_minutes || ' minutes'
      when v_minutes < 120 then 'is in 1 hour'
      when v_minutes < 1440 then 'is in ' || round(v_minutes / 60.0) || ' hours'
      else 'is in 1 day'
    end;

    insert into public.notifications (user_id, type, message, collection_id, place_id)
    select m.user_id, 'booking_reminder', '"' || coalesce(v_name, 'Your plan') || '" ' || v_when, r.collection_id, r.place_id
    from public.collection_members m
    where m.collection_id = r.collection_id;

    v_sent := v_sent + 1;
  end loop;

  delete from public.booking_reminders_sent where planned_at < now() - interval '7 days';
  return v_sent;
end;
$$;

revoke all on function public.send_booking_reminders() from public, anon, authenticated;
grant execute on function public.send_booking_reminders() to service_role;

-- Every minute, where pg_cron is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('send-booking-reminders', '* * * * *', 'select public.send_booking_reminders()');
  end if;
end;
$$;
