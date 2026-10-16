// What a shared place link (/p/<id>) shows in Messages, WhatsApp and other chat apps.
//   /p/<id>          → "Let's go here?" card: the reel cover (option A).
//   /p/<id>?c=<col>  → booking card for that collection's members: date and time on the cover (option D).
// Only public venue info and the booking time are used; never notes, votes or booking files.

const { fetchInstagramOembed } = require('./instagram-oembed');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Works with the newer secret key (sb_secret_…) and the legacy service_role key (eyJ…).
function headers() {
  const auth = SERVICE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` };
  return { apikey: SERVICE_KEY, ...auth, 'Content-Type': 'application/json' };
}

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
}

// { place, booking } for the link, or null when the place doesn't exist.
async function loadShare(placeId, collectionId) {
  if (!SUPABASE_URL || !SERVICE_KEY || !UUID.test(String(placeId || ''))) return null;
  const place = await rest('rpc/shared_place', { method: 'POST', body: JSON.stringify({ pid: placeId }) });
  if (!place) return null;
  let booking = null;
  if (UUID.test(String(collectionId || ''))) {
    const rows = await rest(`bookings?collection_id=eq.${collectionId}&place_id=eq.${placeId}&select=planned_at&limit=1`);
    booking = rows[0]?.planned_at ? { plannedAt: rows[0].planned_at } : null;
  }
  return { place, booking };
}

const STATES = { NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', VIC: 'Australia/Melbourne', TAS: 'Australia/Hobart', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide', WA: 'Australia/Perth', NT: 'Australia/Darwin' };

// "Shop 4/1 Elizabeth St, Sydney NSW 2000, Australia" → { suburb: 'Sydney', timeZone: 'Australia/Sydney' }.
function areaOf(address) {
  const parts = String(address || '').split(',').map((part) => part.trim()).filter(Boolean);
  const withState = parts.find((part) => /\b(NSW|ACT|VIC|TAS|QLD|SA|WA|NT)\b/.test(part));
  if (withState) {
    const state = withState.match(/\b(NSW|ACT|VIC|TAS|QLD|SA|WA|NT)\b/)[1];
    return { suburb: withState.replace(/\b(NSW|ACT|VIC|TAS|QLD|SA|WA|NT)\b.*$/, '').trim(), timeZone: STATES[state] };
  }
  const suburb = parts.length > 2 ? parts[parts.length - 2] : parts[parts.length - 1] || '';
  return { suburb: suburb.replace(/\s+\d{4,}$/, ''), timeZone: 'Australia/Melbourne' };
}

// "Fri 4 Dec" and "6:30 pm" in the place's own time zone.
function bookingWhen(plannedAt, timeZone) {
  const date = new Date(plannedAt);
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(date).replace(',', '');
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(date).replace(/\s?([ap])m/i, ' $1m').toLowerCase();
  return { day, time };
}

// The card's title line (Messages shows up to 2 lines of it).
function shareTitle({ place, booking }) {
  const { suburb, timeZone } = areaOf(place.address);
  if (booking) {
    const { day, time } = bookingWhen(booking.plannedAt, timeZone);
    return `Join me? ${place.name}, ${day} at ${time}`;
  }
  return `Let's go here? 👀 ${place.name}${suburb ? ` · ${suburb}` : ''}`;
}

// The reel's cover as a data URL, or null. Instagram cover links expire, so it's fetched fresh.
async function coverDataUrl(place) {
  try {
    let url = null;
    if (/instagram\.com\//.test(place.reel_url || '')) {
      const oembed = await fetchInstagramOembed(place.reel_url, 5000);
      url = oembed.ok ? oembed.thumbnailUrl : null;
    }
    url ||= place.reel_thumbnail_url || null;
    if (!url) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = { loadShare, areaOf, bookingWhen, shareTitle, coverDataUrl, UUID };
