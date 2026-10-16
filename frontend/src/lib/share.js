// Share links point back to this app: /?place=<id> opens the place (see SharedPlaceSheet).
export function placeShareUrl(placeId) {
  return `${window.location.origin}/?place=${encodeURIComponent(placeId)}`;
}

// The phone's share sheet when there is one, else the link is copied.
export async function sharePlace(place, showToast) {
  const url = placeShareUrl(place.id);
  const text = `Let's go here? 👀 ${place.address ? `${place.name}, ${place.address}` : place.name}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: place.name, text, url });
    } catch (error) {
      // Closing the share sheet isn't an error.
      if (error?.name !== 'AbortError') showToast("Couldn't open sharing");
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied');
  } catch {
    showToast(url);
  }
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
