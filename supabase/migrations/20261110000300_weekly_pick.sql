-- The weekly pick: each person chooses the day it arrives (0 = Sunday ... 6 = Saturday), or turns it off (null).
-- It is sent at 7pm in the person's own time zone (profiles.timezone). last_pick_on stops a second send that day.
alter table public.profiles
  add column if not exists weekly_pick_day smallint default 5 check (weekly_pick_day between 0 and 6),
  add column if not exists last_pick_on date;
