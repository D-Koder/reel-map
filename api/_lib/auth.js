// Only signed-in people (and this server itself) may call the lookup endpoints, since each call
// runs Chrome and the AI and costs money. The app sends the person's Supabase access token as
// "Authorization: Bearer …"; api/save-reel.js sends internalHeaders() when it looks a reel up.
// Off Vercel (vite dev, tools/live-scraper, the test scripts) nothing is checked.

const crypto = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || SERVICE_KEY;

// Made from the service key, so the key itself never travels in a request and no new setting is needed.
const internalToken = () => (SERVICE_KEY
  ? crypto.createHmac('sha256', SERVICE_KEY).update('reel-map internal api').digest('hex')
  : '');

function internalHeaders() {
  const token = internalToken();
  return token ? { 'x-reelmap-internal': token } : {};
}

function isInternal(req) {
  const token = internalToken();
  const sent = String(req.headers?.['x-reelmap-internal'] || '');
  return Boolean(token) && sent.length === token.length
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(token));
}

// The signed-in user for this request, or null.
async function requestUser(req) {
  const token = String(req.headers?.authorization || '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !SUPABASE_URL || !API_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch (error) {
    console.warn('Sign-in check failed:', error.message);
    return null;
  }
}

// Counts one call for this person and says whether it's within the hourly limit (migration
// 20261020100000_api_rate_limits.sql). When the count can't be made, the call is let through.
async function withinLimit(userId, endpoint, perHour) {
  if (!SUPABASE_URL || !SERVICE_KEY) return true;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/count_api_call`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        // New secret keys (sb_secret_…) go in apikey only; legacy JWT keys go in both.
        ...(SERVICE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId, p_endpoint: endpoint, p_limit: perHour }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) !== false;
  } catch (error) {
    console.warn('Rate limit check failed, letting the call through:', error.message);
    return true;
  }
}

// Wraps an endpoint so it answers 401 unless the caller is signed in or is this server, and 429 once a
// person has made `perHour` calls to it this hour. The server's own calls aren't counted.
// The unwrapped handler stays on .run for endpoints that call each other in-process.
function requireUser(handler, { endpoint, perHour } = {}) {
  const guarded = async function guardedHandler(req, res) {
    if (process.env.VERCEL && !isInternal(req)) {
      const user = await requestUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in to look places up' });
      if (endpoint && perHour && !(await withinLimit(user.id, endpoint, perHour))) {
        return res.status(429).json({ error: 'Too many lookups this hour. Try again later.' });
      }
    }
    return handler(req, res);
  };
  guarded.run = handler;
  return guarded;
}

module.exports = { requireUser, internalHeaders };
