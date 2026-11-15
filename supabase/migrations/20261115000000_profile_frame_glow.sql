-- A free profile frame for everyone, 'glow' (First Light), and the reward of the Test Driver badge
-- (see frontend/src/lib/achievements.js). This replaces the frame check so 'glow' can be saved on a profile.

alter table public.profiles
  drop constraint if exists profiles_frame_known;

alter table public.profiles
  add constraint profiles_frame_known check (
    frame is null or frame in (
      'bronze', 'silver', 'pin', 'gold', 'couple', 'hearts', 'rainbow', 'blossom', 'sunny', 'cosy', 'laurel', 'glow'
    )
  );
