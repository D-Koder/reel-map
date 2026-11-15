-- Starter quests (see frontend/src/lib/quests.js): small one-time XP for things a new person needs to learn.
-- Each done quest is noted here as { "questId": "when" }. XP is worked out from the notes, once per quest, and a note
-- is never removed, so it follows the person to every device and cannot be earned twice.
-- "profiles: update self" already lets a person write their own notes; reading needs no new policy.

alter table public.profiles
  add column if not exists quests jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_quests_is_object,
  add constraint profiles_quests_is_object check (jsonb_typeof(quests) = 'object' and pg_column_size(quests) < 2048);
