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

module.exports = { requestCountry };
