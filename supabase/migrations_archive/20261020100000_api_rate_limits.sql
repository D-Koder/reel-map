-- Hourly limits on the lookup endpoints (api/_lib/auth.js), one counter per person, endpoint and hour,
-- so one account can't run up the Chrome and AI bills. Only the server (service key) can count.
create table if not exists private.api_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  hour timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, endpoint, hour)
);

-- Counts one call and says whether it is within the limit. Last hour's rows and older are removed
-- as the person makes calls, so the table stays small.
create or replace function public.count_api_call(p_user_id uuid, p_endpoint text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_calls integer;
begin
  delete from private.api_calls where user_id = p_user_id and hour < v_hour;
  insert into private.api_calls (user_id, endpoint, hour, calls)
  values (p_user_id, p_endpoint, v_hour, 1)
  on conflict (user_id, endpoint, hour) do update set calls = private.api_calls.calls + 1
  returning calls into v_calls;
  return v_calls <= p_limit;
end;
$$;

revoke execute on function public.count_api_call(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.count_api_call(uuid, text, integer) to service_role;
