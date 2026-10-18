// Saves a reel sent from the iPhone share sheet Shortcut, so the user never leaves Instagram.
// POST { key, url } (JSON or form) → plain text the Shortcut shows as a notification.
// POST { key, connect: true } is sent once by the Shortcut after Connect, so Settings can show it is set up.
// The reel waits in public.shared_reels (see migration 20261012130000_shortcut_inbox.sql), and an
// Instagram reel is looked up straight away, while the app is closed (see lookInBackground below):
// a clear match is saved to TBD, otherwise the lookup waits for the app's Finish card. Either way a
// push says so (migration 20261019140000_background_shared_reels.sql).

const { requestCountry } = require('./_lib/country');
const { canonicalInstagramUrl, instagramSlide } = require('./_lib/reel-url');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// The server key when there is one, so save_shared_reel and mark_shortcut_connected needn't be open to
// the public (anon). The anon key still works until those are revoked from anon.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Calls a database function as the server.
function rpc(name, args) {
  return fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      // New secret keys (sb_secret_…) go in apikey only; legacy JWT keys go in both.
      ...(SUPABASE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SUPABASE_KEY}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
}

// The place to save from a lookup, the way the app's reel inbox saves it (useReelInbox.js), or null
// when the lookup didn't pick one. A pop-up keeps its own name and is an event on its days.
function placeToSave(data) {
  const details = data.maps?.details;
  if (!details?.name) return null;
  const popup = data.popup;
  return {
    name: popup?.name || details.name,
    address: details.address || data.location || '',
    category: popup ? 'event' : data.category || 'food',
    lat: details.latitude ?? null,
    lng: details.longitude ?? null,
    hours: details.hours || null,
    phone: details.phone || '',
    bookingUrl: details.bookingUrl || '',
    mapsUrl: details.mapsUrl || '',
    websiteUrl: details.websiteUrl || '',
    menuUrl: details.menuUrl || '',
    eventDate: popup?.startDate || '',
    eventEndDate: popup?.endDate || '',
  };
}

// Looks the reel up after the Shortcut has its answer, by asking /api/enrich-reel (a request rather
// than a require, so this function doesn't carry its own copy of Chrome), then finishes it: a clear
// match is saved to TBD, anything else is kept for the app. If any step fails, the app looks the
// reel up itself when it opens. Vercel keeps this function alive for the work (up to maxDuration in
// vercel.json); elsewhere it just runs on.
function lookInBackground(req, key, sharedText) {
  const sharedUrl = String(sharedText).match(/https?:\/\/[^\s]+/)?.[0];
  const reelUrl = canonicalInstagramUrl(sharedUrl);
  // The photo that was shared, so a list post looks up that photo's place.
  const slide = instagramSlide(sharedUrl);
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!reelUrl || !host) return;
  const protocol = /^(localhost|127\.)/.test(host) ? 'http' : 'https';
  const finish = (lookup, place) => rpc('finish_shared_reel', { p_key: key, p_url: sharedUrl, p_lookup: lookup, p_place: place })
    .then(async (response) => console.log('Background reel finished:', response.ok ? await response.json() : `HTTP ${response.status}`));
  const work = (async () => {
    // The app waits for this lookup instead of starting its own.
    await rpc('start_shared_reel_lookup', { p_key: key, p_url: sharedUrl }).catch(() => {});
    let data = null;
    try {
      const response = await fetch(`${protocol}://${host}/api/enrich-reel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // This request comes from Vercel itself, so the person's country is passed on from theirs.
        // from: 'inbox' keeps a lookup_debug row when no place is matched, like a reel shared in the app.
        body: JSON.stringify({ reelUrl, slide, background: true, from: 'inbox', country: requestCountry(req) }),
        // Leaves time to save the result within this function's 120 seconds.
        signal: AbortSignal.timeout(105000),
      });
      data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) console.warn(`Background reel lookup returned HTTP ${response.status}`);
    } catch (error) {
      console.warn('Background reel lookup failed:', error.message);
    }
    // A failed Maps search (Google or Chrome) is tried again by the app, rather than asking to pick.
    if (!data?.success || !data.maps?.success) return finish(null, null);
    const place = placeToSave(data);
    return finish(place ? null : data, place);
  })().catch((error) => console.warn('Background reel finish failed:', error.message));
  globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(work);
}

function reply(res, status, message) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(message);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, 'Use POST');
  if (!SUPABASE_URL || !SUPABASE_KEY) return reply(res, 500, '⚠️ Waylit Maps is missing its Supabase settings');

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  // Keys are letters and digits only. A file read back by Shortcuts can carry a newline,
  // and a key saved without its prefix removed still starts with "reelmap-key:".
  const key = typeof body.key === 'string' ? body.key.replace(/^\s*reelmap-key:/i, '').replace(/\s+/g, '') : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const connecting = body.connect === true || body.connect === 'true';
  if (!key) return reply(res, 401, '⚠️ Open Waylit Maps → Settings → Connect first');
  if (!connecting && !url) return reply(res, 400, '⚠️ No link was shared');

  let response;
  try {
    response = connecting
      ? await rpc('mark_shortcut_connected', { p_key: key })
      : await rpc('save_shared_reel', { p_key: key, p_url: url });
  } catch {
    return reply(res, 502, '⚠️ Could not reach Waylit Maps. Try again.');
  }

  const result = await response.json().catch(() => null);
  if (response.ok) {
    if (connecting) return reply(res, 200, '✅ Waylit Maps connected');
    if (result === 'duplicate') return reply(res, 200, '👍 Already saved to Waylit Maps');
    lookInBackground(req, key, url);
    return reply(res, 200, '✅ Saved to Waylit Maps');
  }

  // Postgres error codes raised by save_shared_reel().
  const messages = {
    28000: [401, '⚠️ Your Shortcut needs reconnecting. Open Waylit Maps → Settings → Connect.'],
    22023: [400, '⚠️ No link found in what was shared'],
    54000: [429, '⏳ Too many reels this hour. Try again later.'],
  };
  const [status, message] = messages[result?.code] ?? [502, '⚠️ Could not save. Try again.'];
  return reply(res, status, message);
};
