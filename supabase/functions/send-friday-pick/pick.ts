// One random unbooked place from the collections this user is in, or null if there isn't one.
// Kept apart from index.ts (no npm: imports) so it can be tested: frontend/tests/unit/fridayPick.test.js.
// `random` is Math.random unless a test passes its own.
// deno-lint-ignore no-explicit-any
export async function pickPlaceFor(supabase: any, userId: string, random: () => number = Math.random): Promise<{ id: string; name: string } | null> {
  const { data: memberships } = await supabase
    .from('collection_members')
    .select('collection_id')
    .eq('user_id', userId);
  const collectionIds = (memberships ?? []).map((m: { collection_id: string }) => m.collection_id);
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
  const id = ids[Math.floor(random() * ids.length)];
  return { id, name: places.get(id)! };
}

export type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

// Sends each subscribed device its user's pick (one pick per user, shared by their devices).
// A 404 or 410 means the browser no longer accepts the subscription, so it is removed.
// `send(sub, payload)` is web-push's sendNotification in production, a fake in tests.
export async function sendPicks(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  subscriptions: Subscription[],
  send: (sub: Subscription, payload: string) => Promise<unknown>,
  random: () => number = Math.random,
): Promise<{ sent: number; removed: number }> {
  let sent = 0;
  let removed = 0;
  const pickByUser = new Map<string, { id: string; name: string } | null>();

  for (const sub of subscriptions) {
    if (!pickByUser.has(sub.user_id)) pickByUser.set(sub.user_id, await pickPlaceFor(supabase, sub.user_id, random));
    const pick = pickByUser.get(sub.user_id);
    if (!pick) continue;

    const payload = JSON.stringify({
      title: 'This Friday?',
      body: `${pick.name}. Tap to plan it.`,
      url: `/?pick=${pick.id}`,
    });

    try {
      await send(sub, payload);
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        removed++;
      }
    }
  }
  return { sent, removed };
}
