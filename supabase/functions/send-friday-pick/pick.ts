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
