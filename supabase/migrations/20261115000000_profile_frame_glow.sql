-- A free profile frame for everyone, 'glow' (First Light), and the reward of the Test Driver badge
-- (see frontend/src/lib/achievements.js). This replaces the frame check so 'glow' can be saved on a profile.
-- It also adds the frame and title columns if they are missing, so it works whether or not
-- 20261112000000_profile_flair.sql ran first (same approach as 20261113000000_profile_frame_laurel.sql).

alter table public.profiles
  add column if not exists frame text,
  add column if not exists title text;

alter table public.profiles
  drop constraint if exists profiles_frame_known,
  drop constraint if exists profiles_title_short;

alter table public.profiles
  add constraint profiles_frame_known check (
    frame is null or frame in (
      'bronze', 'silver', 'pin', 'gold', 'couple', 'hearts', 'rainbow', 'blossom', 'sunny', 'cosy', 'laurel', 'glow'
    )
  ),
  add constraint profiles_title_short check (title is null or char_length(title) between 1 and 40);
