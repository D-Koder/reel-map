-- The Level 25 prize adds one more profile frame, 'laurel' (see frontend/src/lib/levels.js).
-- This replaces the check from 20261112000000_profile_flair.sql so it works whether or not that file ran first.

alter table public.profiles
  add column if not exists frame text,
  add column if not exists title text;

alter table public.profiles
  drop constraint if exists profiles_frame_known,
  drop constraint if exists profiles_title_short;

alter table public.profiles
  add constraint profiles_frame_known check (
    frame is null or frame in (
      'bronze', 'silver', 'pin', 'gold', 'couple', 'hearts', 'rainbow', 'blossom', 'sunny', 'cosy', 'laurel'
    )
  ),
  add constraint profiles_title_short check (title is null or char_length(title) between 1 and 40);
