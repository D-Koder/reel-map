// Share links point back to this app. /p/<id> gives chat apps a preview card (api/share-page.js)
// and sends people on to /?place=<id>, which opens the place (see SharedPlaceSheet).
// ?g= names the collection it was shared from (the card shows its members' votes when there are
// several of them); ?c= is a booking share for that collection.
export function placeShareUrl(placeId, { group, booking } = {}) {
  const base = `${window.location.origin}/p/${encodeURIComponent(placeId)}`;
  if (booking) return `${base}?c=${encodeURIComponent(booking)}`;
  return group ? `${base}?g=${encodeURIComponent(group)}` : base;
}

// Only the link is sent, so Messages shows one card (picture + "Let's go here? 👀 …"), not a
// separate text bubble. The phone's share sheet when there is one, else the link is copied.
async function shareLink(url, title, showToast) {
  if (navigator.share) {
    try {
      await navigator.share({ url });
    } catch (error) {
      // Closing the share sheet isn't an error.
      if (error?.name !== 'AbortError') showToast("Couldn't open sharing");
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(`Link to ${title} copied`);
  } catch {
    showToast(url);
  }
}

export function sharePlace(place, showToast) {
  return shareLink(placeShareUrl(place.id, { group: place.collection_id }), place.name, showToast);
}

// For the collection's members: the card shows the booked date and time.
export function shareBooking(place, showToast) {
  return shareLink(placeShareUrl(place.id, { booking: place.collection_id }), place.name, showToast);
}

// The place id from a share link, kept until it is handled (signing in in between included).
const PENDING_KEY = 'reelmap:shared-place';
export function takeSharedPlaceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('place');
  if (!id) return null;
  params.delete('place');
  const rest = params.toString();
  window.history.replaceState({}, document.title, `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  return id;
}
export function rememberSharedPlace(id) {
  try { localStorage.setItem(PENDING_KEY, id); } catch { /* private mode */ }
}
export function pendingSharedPlace() {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
}
export function forgetSharedPlace() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* private mode */ }
}
