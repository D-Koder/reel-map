import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Sends each subscribed user one random place from their collections that isn't booked yet, on the day they chose
// (profiles.weekly_pick_day) at 7pm in their own time zone. Called every hour by pg_cron (see
// supabase/scripts/schedule-friday-pick.sql); it only sends to people for whom it is 7pm on their day.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address), FRIDAY_PICK_SECRET.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);


const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The weekday (0 = Sunday), hour and date right now in a time zone, or null for an unknown zone.
function localParts(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return day < 0 ? null : { day, hour: Number(get('hour')), date: `${get('year')}-${get('month')}-${get('day')}` };
  } catch {
    return null;
  }
}

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// One random unbooked place from the collections this user is in, or null if there isn't one.
async function pickPlaceFor(userId: string): Promise<{ id: string; name: string } | null> {
  const { data: memberships } = await supabase
    .from('collection_members')
    .select('collection_id')
    .eq('user_id', userId);
  const collectionIds = (memberships ?? []).map((m) => m.collection_id);
  if (collectionIds.length === 0) return null;

  const { data: links } = await supabase
    .from('collection_places')
    .select('place_id, places(id, name)')
    .in('collection_id', collectionIds);
  const places = new Map<string, string>();
  for (const link of links ?? []) {
    const place = link.places as unknown as { id: string; name: string } | null;
    if (place) places.set(place.id, place.name);
  }
  if (places.size === 0) return null;

  const { data: bookings } = await supabase
    .from('bookings')
    .select('place_id')
    .in('place_id', [...places.keys()]);
  for (const booked of bookings ?? []) places.delete(booked.place_id);
  if (places.size === 0) return null;

  const ids = [...places.keys()];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return { id, name: places.get(id)! };
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('FRIDAY_PICK_SECRET')}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Set up VAPID inside the handler so a missing or bad secret returns a readable error instead of crashing.
  const missing = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((name) => !Deno.env.get(name));
  if (missing.length > 0) return json({ error: `Missing secrets: ${missing.join(', ')}` }, 500);
  try {
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );
  } catch (err) {
    return json({ error: `VAPID setup failed: ${(err as Error).message}` }, 500);
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth');
  if (error) return json({ error: error.message }, 500);

  // Who is due now: their chosen day (null = off), at 7pm in their own time zone, once a day.
  // This runs every hour; the 7pm and 8pm hours both count, so one missed run doesn't skip a week.
  const userIds = [...new Set((subscriptions ?? []).map((sub: Subscription) => sub.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from('profiles').select('id, notifications_enabled, weekly_pick_day, last_pick_on, timezone').in('id', userIds)
    : { data: [], error: null };
  if (profileError) return json({ error: profileError.message }, 500);
  const due = new Map<string, { day: number; date: string }>();
  for (const profile of profiles ?? []) {
    if (profile.notifications_enabled === false || profile.weekly_pick_day === null) continue;
    const local = localParts(profile.timezone || 'UTC');
    if (!local || local.day !== profile.weekly_pick_day || ![19, 20].includes(local.hour)) continue;
    if (profile.last_pick_on === local.date) continue;
    due.set(profile.id, { day: local.day, date: local.date });
  }

  let sent = 0;
  let removed = 0;
  const pickByUser = new Map<string, { id: string; name: string } | null>();

  for (const sub of (subscriptions ?? []) as Subscription[]) {
    const when = due.get(sub.user_id);
    if (!when) continue;
    if (!pickByUser.has(sub.user_id)) pickByUser.set(sub.user_id, await pickPlaceFor(sub.user_id));
    const pick = pickByUser.get(sub.user_id);
    if (!pick) continue;

    const payload = JSON.stringify({
      title: `This ${DAY_NAMES[when.day]}?`,
      body: `${pick.name}. Tap to plan it.`,
      url: `/?pick=${pick.id}`,
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      // 404 or 410 means the browser no longer accepts this subscription, so remove it.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        removed++;
      }
    }
  }

  // Each person is marked for today, whether or not they had a place to pick, so they aren't tried again.
  for (const [userId, when] of due) await supabase.from('profiles').update({ last_pick_on: when.date }).eq('id', userId);

  return json({ sent, removed, subscriptions: subscriptions?.length ?? 0 });
});
