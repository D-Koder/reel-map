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

// Wraps an endpoint so it answers 401 unless the caller is signed in or is this server.
// The unwrapped handler stays on .run for endpoints that call each other in-process.
function requireUser(handler) {
  const guarded = async function guardedHandler(req, res) {
    if (process.env.VERCEL && !isInternal(req) && !(await requestUser(req))) {
      return res.status(401).json({ error: 'Sign in to look places up' });
    }
    return handler(req, res);
  };
  guarded.run = handler;
  return guarded;
}

module.exports = { requireUser, internalHeaders };
