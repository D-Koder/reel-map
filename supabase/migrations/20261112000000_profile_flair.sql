-- Profile frame and title (see frontend/src/lib/achievements.js).
-- Both are cosmetic and optional. Reading them needs no new policy: "profiles: read self and
-- collection-mates" already lets people read each other's rows, and "profiles: update self" lets
-- people change their own. The checks keep the values to the known frames and a short title.

alter table public.profiles
  add column if not exists frame text,
  add column if not exists title text;

alter table public.profiles
  drop constraint if exists profiles_frame_known,
  drop constraint if exists profiles_title_short;

alter table public.profiles
  add constraint profiles_frame_known check (
    frame is null or frame in (
      'bronze', 'silver', 'pin', 'gold', 'couple', 'hearts', 'rainbow', 'blossom', 'sunny', 'cosy'
    )
  ),
  add constraint profiles_title_short check (title is null or char_length(title) between 1 and 40);
