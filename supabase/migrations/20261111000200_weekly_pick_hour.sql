-- The weekly pick time: each person chooses the hour it arrives (0 to 23, in their own time zone), next to the day they
-- already choose (weekly_pick_day). 19 (7pm) is the default, so everyone who set a day before keeps getting it at 7pm.
alter table public.profiles
  add column if not exists weekly_pick_hour smallint not null default 19 check (weekly_pick_hour between 0 and 23);
