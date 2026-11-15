-- A new seasonal profile frame, 'winter' (Dec to Feb), and 'cosy' now covers Sep to Nov
-- (see frontend/src/lib/achievements.js). This replaces the frame check so 'winter' can be saved on a profile.
-- Everyone who already wears 'cosy' keeps it.

alter table public.profiles
  drop constraint if exists profiles_frame_known;

alter table public.profiles
  add constraint profiles_frame_known check (
    frame is null or frame in (
      'bronze', 'silver', 'pin', 'gold', 'couple', 'hearts', 'rainbow', 'blossom', 'sunny', 'cosy', 'winter', 'laurel', 'glow'
    )
  );
