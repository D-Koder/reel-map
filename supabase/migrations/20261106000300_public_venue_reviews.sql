-- Reviews are public per venue: anyone signed in can read them (and the photos). Writing stays own-only.
alter policy "review photos: author and collection-mates read" on storage.objects
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$');

create or replace function public.reviews_for_locations(p_ids uuid[])
returns table (location_id uuid, user_id uuid, body text, photos text[], created_at timestamptz, updated_at timestamptz,
               display_name text, avatar text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select r.location_id, r.user_id, r.body, r.photos, r.created_at, r.updated_at, pr.display_name, pr.avatar, pr.avatar_url
  from public.place_reviews r
  join public.profiles pr on pr.id = r.user_id
  where r.location_id = any(p_ids)
  order by r.updated_at desc
$$;
revoke all on function public.reviews_for_locations(uuid[]) from public, anon;
grant execute on function public.reviews_for_locations(uuid[]) to authenticated;

-- Reports on a review: one per reporter per review. Only the reporter can see their own; the team reads them in the dashboard.
create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  review_user_id uuid not null references public.profiles (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (location_id, review_user_id, reporter_id)
);
alter table public.review_reports enable row level security;
create policy "review reports: report as myself" on public.review_reports as permissive for insert to authenticated
  with check (reporter_id = (select auth.uid()) and review_user_id <> (select auth.uid()));
create policy "review reports: read own" on public.review_reports as permissive for select to authenticated
  using (reporter_id = (select auth.uid()));
