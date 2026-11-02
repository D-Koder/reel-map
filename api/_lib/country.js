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

// The person's language as an English name ("English", "Chinese"), for what the AI writes to them: the
// app's own, else the first one their browser asks for (accept-language: "zh-CN,zh;q=0.9" → "Chinese").
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

function requestLanguage(req) {
  const given = typeof req.body?.language === 'string' ? req.body.language.trim() : '';
  if (given) return given;
  const tag = String(req.headers?.['accept-language'] || '').split(',')[0].split(';')[0].trim();
  try {
    return (tag && LANGUAGE_NAMES.of(tag.split('-')[0])) || 'English';
  } catch {
    return 'English';
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

module.exports = { requestCountry, requestLanguage, requestTimeZone, dayIn };
