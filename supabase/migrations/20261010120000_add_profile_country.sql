-- Optional country on profiles. Null when the user leaves it blank at sign-up.
alter table public.profiles
  add column if not exists country text
  check (country is null or char_length(country) between 1 and 60);

-- Same as the original trigger, plus country from sign-up metadata.
-- Blank becomes null, and anything over 60 characters is cut short so sign-up can't fail on it.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar, country)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂'),
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60)
  );
  return new;
end;
$$;
