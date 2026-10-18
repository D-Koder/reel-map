// Where tapping a notification should take you: { place } (a saved entry), { collection }, { home }
// (the reel inbox at the top of Home), or null.
// Uses place_id / collection_id when the notification row has them. Otherwise it finds the place
// and collection named in the message, e.g. 'Sam added "Pho Bar" to Date night'.

const norm = (text) => String(text ?? '').toLocaleLowerCase();

// The longest name that appears in the message, so "Pho Bar Richmond" wins over "Pho Bar".
function longestNamed(message, items, nameOf) {
  let best = null;
  for (const item of items) {
    const name = norm(nameOf(item)).trim();
    if (name.length < 2 || !message.includes(name)) continue;
    if (!best || name.length > norm(nameOf(best)).trim().length) best = item;
  }
  return best;
}

export function notificationTarget(notification, places, collections) {
  if (!notification) return null;
  // A reel shared from the Shortcut that needs its place picked: its Finish card is on Home.
  if (notification.type === 'reel_needs_place') return { home: true };
  // A removed place can't be opened; at most its collection can.
  const placeMayExist = notification.type !== 'place_removed';
  // A reel saved from the Shortcut opens the place it saved, found by name in its collection.
  if (notification.type === 'reel_saved' && notification.collectionId) {
    const place = longestNamed(norm(notification.message),
      places.filter((p) => p.collection_id === notification.collectionId), (p) => p.name);
    if (place) return { place };
  }

  if (notification.placeId && placeMayExist) {
    const entries = places.filter((p) => p.id === notification.placeId);
    const place = entries.find((p) => p.collection_id === notification.collectionId) ?? entries[0];
    if (place) return { place };
  }
  if (notification.collectionId) {
    const collection = collections.find((c) => c.id === notification.collectionId);
    if (collection) return { collection };
  }

  const message = norm(notification.message);
  const collection = longestNamed(message, collections, (c) => c.name);
  if (placeMayExist) {
    const candidates = collection ? places.filter((p) => p.collection_id === collection.id) : places;
    const place = longestNamed(message, candidates, (p) => p.name);
    if (place) return { place };
  }
  return collection ? { collection } : null;
}
