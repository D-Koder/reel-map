import { createClient } from 'npm:@supabase/supabase-js@2';

// Deletes booking confirmations 1 day after the booking ends (see public.expired_booking_files).
// Called hourly by pg_cron (migration 20261016110000_booking_files_cleanup.sql).
// It needs no secret: it only ever deletes files that are already due, so calling it early or
// often changes nothing.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

Deno.serve(async () => {
  const { data, error } = await supabase.rpc('expired_booking_files');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const names = (data ?? []) as string[];
  let deleted = 0;
  for (let i = 0; i < names.length; i += 100) {
    const { data: removed, error: removeError } = await supabase.storage
      .from('booking-files')
      .remove(names.slice(i, i + 100));
    if (removeError) return Response.json({ deleted, error: removeError.message }, { status: 500 });
    deleted += removed?.length ?? 0;
  }
  return Response.json({ deleted });
});
