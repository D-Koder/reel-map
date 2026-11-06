-- Keep reminders tidy.
-- A: a new reminder for a plan replaces the older one ("in 10 minutes" replaces "in 30 minutes").
-- B: reminders go once they stop being useful: 30 minutes after the plan starts, or as soon as the plan
--    is cancelled, marked done or moved to another time.

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

    -- A: the older reminder for this plan goes before the new one arrives.
    delete from public.notifications n
    where n.type = 'booking_reminder' and n.collection_id = r.collection_id and n.place_id = r.place_id;

    insert into public.notifications (user_id, type, message, collection_id, place_id)
    select m.user_id, 'booking_reminder', '"' || coalesce(v_name, 'Your plan') || '" ' || v_when, r.collection_id, r.place_id
    from public.collection_members m
    where m.collection_id = r.collection_id;

    v_sent := v_sent + 1;
  end loop;

  -- B: reminders whose plan is gone, done, or started more than 30 minutes ago.
  delete from public.notifications n
  where n.type = 'booking_reminder'
    and not exists (
      select 1 from public.bookings b
      where b.collection_id = n.collection_id and b.place_id = n.place_id
        and b.done_at is null and b.planned_at + interval '30 minutes' > now()
    );

  delete from public.booking_reminders_sent where planned_at < now() - interval '7 days';
  return v_sent;
end;
$$;

-- B, straight away: cancelling, finishing or moving a plan clears its reminders.
create or replace function private.clear_booking_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where type = 'booking_reminder' and collection_id = old.collection_id and place_id = old.place_id;
    return old;
  end if;
  delete from public.notifications where type = 'booking_reminder' and collection_id = new.collection_id and place_id = new.place_id;
  return new;
end;
$$;

create trigger clear_reminders_on_change after update of planned_at, done_at on public.bookings
  for each row when (old.planned_at is distinct from new.planned_at or old.done_at is distinct from new.done_at)
  execute function private.clear_booking_reminders();
create trigger clear_reminders_on_cancel after delete on public.bookings
  for each row execute function private.clear_booking_reminders();
