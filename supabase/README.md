# Database

`migrations/` holds the whole database as it is live, read back from the live project on 2026-10-24:

| File | What it does |
|---|---|
| `20261024000000_baseline.sql` | Tables, keys, indexes, functions, triggers, row level security, storage, realtime |
| `20261024000100_project_jobs.sql` | Push notifications and scheduled jobs. These call the project's own address, so they need editing for a new project |

`migrations_archive/` holds the 53 earlier migrations. They no longer build the live database (several tables,
columns and functions were made by hand in the SQL editor and never written down), so they are kept only as
history. Do not run them.

Add new changes as new files in `migrations/`, named with a later timestamp.

## Build a new project (staging, test)

1. Create the Supabase project.
2. In `20261024000100_project_jobs.sql`, replace `bxkiuaapyiflnmqhodgm` with the new project's ref.
3. Add a Vault secret named `push_secret` (the value the edge functions check).
4. `supabase link --project-ref <ref>` then `supabase db push --linked`.
5. Deploy the edge functions in `functions/` and set their secrets.
6. Auth: add the app's address under Authentication > URL Configuration.

`scripts/reset-test-project.sh` wipes and rebuilds a test project from these files.

## Line up the live project

Live already has everything in the baseline, so it must not run it. Tell the CLI the files are already applied:

```
supabase link --project-ref bxkiuaapyiflnmqhodgm
supabase migration repair --status reverted 20261002000000 20261002000001 20261002000002 20261002130000 \
  20261002130100 20261011081055 20261016123624 20261016132548 20261016140655 20261016141456 20261018091605 \
  20261018092918 20261018095051 20261018122336 20261018130703 20261019231535 20261020022255
supabase migration repair --status applied 20261024000000 20261024000100
```

`scripts/live-fixups.sql` has the differences between live and these files (run once in the SQL editor).
