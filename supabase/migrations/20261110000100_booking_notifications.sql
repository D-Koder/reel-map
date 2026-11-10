-- Booking notifications go to everyone in the booking's collection, including the person who did it.
-- Creating, moving (a new time) and cancelling a booking each send one. Times are written as {{2026-11-12T08:00:00Z}}
-- in the message, and each device shows them in its own time zone (the push function uses the person's profile
-- time zone). Only people in the booking's own collection are told, not every collection holding the place.

create or replace function private.notify_place_booked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_place text;
  v_actor text;
begin
  select p.name into v_place from public.places p where p.id = new.place_id;
  select pr.display_name into v_actor from public.profiles pr where pr.id = new.booked_by;
  if v_place is null then return new; end if;
  -- A place marked done straight away (no plan first) is a "done", not a booking.
  insert into public.notifications (user_id, type, message, collection_id, place_id)
  select m.user_id,
         case when new.done_at is null then 'place_booked' else 'place_done' end,
         case when m.user_id = new.booked_by then 'You' else coalesce(v_actor, 'Someone') end
           || case when new.done_at is null
                then ' booked "' || v_place || '" for {{' || to_char(new.planned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '}}'
                else ' marked "' || v_place || '" as done' end,
         new.collection_id,
         new.place_id
  from public.collection_members m
  where m.collection_id = new.collection_id;
  return new;
end;
$$;

-- A new time for a plan (or a done place planned again).
create or replace function private.notify_booking_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_place text;
  v_actor text;
  v_actor_id uuid := coalesce(auth.uid(), new.booked_by);
  v_replanned boolean := old.done_at is not null and new.done_at is null;
begin
  if new.done_at is not null then return new; end if;
  if new.planned_at is not distinct from old.planned_at and not v_replanned then return new; end if;
  select p.name into v_place from public.places p where p.id = new.place_id;
  select pr.display_name into v_actor from public.profiles pr where pr.id = v_actor_id;
  if v_place is null then return new; end if;
  insert into public.notifications (user_id, type, message, collection_id, place_id)
  select m.user_id,
         case when v_replanned then 'place_booked' else 'place_booking_changed' end,
         case when m.user_id = v_actor_id then 'You' else coalesce(v_actor, 'Someone') end
           || case when v_replanned then ' booked "' || v_place || '" for {{' else ' moved "' || v_place || '" to {{' end
           || to_char(new.planned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '}}',
         new.collection_id,
         new.place_id
  from public.collection_members m
  where m.collection_id = new.collection_id;
  return new;
end;
$$;

-- A person cancelling a plan. Not sent when the booking goes with its place or collection, when the clean-up
-- job removes an old plan, or when a place already marked done is cleared.
create or replace function private.notify_booking_cancelled()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_place text;
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or old.done_at is not null then return old; end if;
  if not exists (
    select 1 from public.collection_places cp where cp.collection_id = old.collection_id and cp.place_id = old.place_id
  ) then return old; end if;
  select p.name into v_place from public.places p where p.id = old.place_id;
  select pr.display_name into v_actor from public.profiles pr where pr.id = v_actor_id;
  if v_place is null then return old; end if;
  insert into public.notifications (user_id, type, message, collection_id, place_id)
  select m.user_id,
         'place_booking_cancelled',
         case when m.user_id = v_actor_id then 'You' else coalesce(v_actor, 'Someone') end
           || ' cancelled the booking for "' || v_place || '"',
         old.collection_id,
         old.place_id
  from public.collection_members m
  where m.collection_id = old.collection_id;
  return old;
end;
$$;

drop trigger if exists notify_booking_changed on public.bookings;
create trigger notify_booking_changed after update on public.bookings
  for each row execute function private.notify_booking_changed();
drop trigger if exists notify_booking_cancelled on public.bookings;
create trigger notify_booking_cancelled after delete on public.bookings
  for each row execute function private.notify_booking_cancelled();
