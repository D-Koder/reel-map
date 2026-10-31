import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Sends a push to every subscribed device of one user, for a row just added to public.notifications.
// Called by the trigger in migration 20261011160000_notification_push.sql.
// Uses the same FRIDAY_PICK_SECRET as send-friday-pick, plus the VAPID secrets.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const TITLES: Record<string, string> = {
  place_added: '📍 New place saved',
  place_reacted: '💬 New reaction',
  place_booked: '🟢 Place booked',
  place_done: '✅ Date done',
  place_removed: '🗑️ Place removed',
  collection_joined: '👋 Joined a collection',
  collection_left: '🚪 Left a collection',
  collection_private: '🔒 Collection made private',
  booking_reminder: '⏰ Coming up',
  role_changed: '✏️ Your role changed',
};

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('FRIDAY_PICK_SECRET')}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

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

  const { user_id, type, message } = await req.json().catch(() => ({}));
  if (!user_id || !message) return json({ error: 'user_id and message are required' }, 400);

  // The account's switch in Settings: off silences every device. (A missing column reads as on.)
  const { data: profile } = await supabase.from('profiles').select('notifications_enabled').eq('id', user_id).maybeSingle();
  if (profile?.notifications_enabled === false) return json({ sent: 0, skipped: 'notifications are off' });

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id);
  if (error) return json({ error: error.message }, 500);

  // Tapping the push opens the app on this notification (?notification=<id>), which takes you to its place.
  // The trigger doesn't send the row id, so it is the newest row with this message.
  const { data: row } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', user_id)
    .eq('message', message)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = JSON.stringify({
    title: TITLES[type] ?? 'Waylit Maps',
    body: message,
    url: row?.id ? `/?notification=${encodeURIComponent(row.id)}` : '/',
  });

  let sent = 0;
  let removed = 0;
  for (const sub of (subscriptions ?? []) as Subscription[]) {
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

  return json({ sent, removed });
});
