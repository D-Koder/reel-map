-- Coming-soon waitlist. Anyone can add an email through join_waitlist(); nobody can read the list from the app
-- (RLS is on with no policies), so only you see it in the Supabase table editor.
create table public.waitlist (
  email text primary key check (email = lower(email) and length(email) <= 254),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;

create or replace function public.join_waitlist(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  insert into public.waitlist (email) values (v_email) on conflict do nothing;
end;
$$;
revoke all on function public.join_waitlist(text) from public;
grant execute on function public.join_waitlist(text) to anon, authenticated;
