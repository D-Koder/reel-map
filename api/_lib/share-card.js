// What a shared place link (/p/<id>) shows in Messages, WhatsApp and other chat apps.
//   /p/<id>?g=<col>  → "Let's go here?" card: a drawn map with a pin. When the collection has more than
//                      one member, their initials and votes are on it too.
//   /p/<id>?c=<col>  → booking card: the same map with a BOOKED stamp, the date and the time.
// Everything on the card is the app's own: the venue's public info, the booking time, and the
// collection's member initials and votes. No reel cover or other Instagram picture is used.

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

// { place, booking, crew } for the link, or null when the place doesn't exist.
// The collection only counts when the place is in it, so a made-up link can't list a collection's members.
async function loadShare(placeId, { group, booking: bookingCollection } = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY || !UUID.test(String(placeId || ''))) return null;
  const place = await rest('rpc/shared_place', { method: 'POST', body: JSON.stringify({ pid: placeId }) });
  if (!place) return null;
  const collectionId = [bookingCollection, group].find((id) => UUID.test(String(id || '')));
  if (!collectionId) return { place, booking: null, crew: null };
  const [entry, bookings] = await Promise.all([
    rest(`collection_places?collection_id=eq.${collectionId}&place_id=eq.${placeId}&select=place_id&limit=1`),
    bookingCollection === collectionId
      ? rest(`bookings?collection_id=eq.${collectionId}&place_id=eq.${placeId}&select=planned_at,booked_by&limit=1`)
      : [],
  ]);
  if (!entry.length) return { place, booking: null, crew: null };
  const booking = bookings[0]?.planned_at ? { plannedAt: bookings[0].planned_at, bookedBy: bookings[0].booked_by } : null;
  return { place, booking, crew: await loadCrew(collectionId, placeId, booking) };
}

const FEELING_ORDER = { keen: 0, maybe: 1, meh: 2 };

// The collection's members as { userId, initial, feeling, booked }, keen first; null for a collection of one.
async function loadCrew(collectionId, placeId, booking) {
  const members = await rest(`collection_members?collection_id=eq.${collectionId}&select=user_id`);
  if (members.length < 2) return null;
  const ids = members.map((member) => member.user_id);
  const [profiles, votes] = await Promise.all([
    rest(`profiles?id=in.(${ids.join(',')})&select=id,display_name`),
    rest(`reactions?collection_id=eq.${collectionId}&place_id=eq.${placeId}&select=user_id,feeling`),
  ]);
  const names = Object.fromEntries(profiles.map((profile) => [profile.id, profile.display_name]));
  const feelings = Object.fromEntries(votes.map((vote) => [vote.user_id, vote.feeling]));
  return ids
    .map((userId) => ({
      userId,
      initial: (String(names[userId] || '').trim()[0] || '?').toUpperCase(),
      feeling: feelings[userId] || null,
      booked: booking?.bookedBy === userId,
    }))
    .sort((a, b) => Number(b.booked) - Number(a.booked) || (FEELING_ORDER[a.feeling] ?? 3) - (FEELING_ORDER[b.feeling] ?? 3));
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

// The street from the address, for the drawn map: "650 Little Bourke St, Melbourne VIC" → "LITTLE BOURKE ST".
function streetOf(address) {
  const first = String(address || '').split(',').map((part) => part.trim()).find((part) => /\d/.test(part) && /[a-z]{2}/i.test(part)) || '';
  return first.replace(/^.*?\d+[a-z]?(?:[-–]\d+[a-z]?)?\s+/i, '').toUpperCase().slice(0, 28);
}

module.exports = { loadShare, areaOf, bookingWhen, shareTitle, streetOf, UUID };
