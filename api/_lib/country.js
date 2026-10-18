// The person's country, for a search that names no area: the app's own ("Australia"), else the
// one Vercel reads from their connection (x-vercel-ip-country: "AU" → "Australia"). Without it,
// Google answers a vague search with places near the server, in the US.
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

function requestCountry(req) {
  const given = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  if (given) return given;
  const code = String(req.headers?.['x-vercel-ip-country'] || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  try {
    return REGION_NAMES.of(code) || '';
  } catch {
    return '';
  }
}

// The person's time zone, from their connection (x-vercel-ip-timezone: "Australia/Melbourne"), so a
// post's date and "today" are their days, not the server's. UTC when it's missing or unknown.
function requestTimeZone(req) {
  const zone = String(req.headers?.['x-vercel-ip-timezone'] || '');
  try {
    if (zone) new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// A moment as a plain day in a time zone: "2026-10-17T22:00:00Z" in Melbourne → "2026-10-18".
function dayIn(timeZone, moment = new Date()) {
  const date = new Date(moment);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

module.exports = { requestCountry, requestTimeZone, dayIn };
