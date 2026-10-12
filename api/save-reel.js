// Saves a reel sent from the iPhone share sheet Shortcut, so the user never leaves Instagram.
// POST { key, url } (JSON or form) → plain text the Shortcut shows as a notification.
// The reel waits in public.shared_reels until the app next opens (see migration 20261012130000_shortcut_inbox.sql).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function reply(res, status, message) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(message);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, 'Use POST');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return reply(res, 500, '⚠️ Reel Map is missing its Supabase settings');

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!key) return reply(res, 401, '⚠️ Add your Reel Map key to the Shortcut');
  if (!url) return reply(res, 400, '⚠️ No link was shared');

  let response;
  try {
    response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/save_shared_reel`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key, p_url: url }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return reply(res, 502, '⚠️ Could not reach Reel Map. Try again.');
  }

  const result = await response.json().catch(() => null);
  if (response.ok) {
    return reply(res, 200, result === 'duplicate' ? '👍 Already saved to Reel Map' : '✅ Saved to Reel Map');
  }

  // Postgres error codes raised by save_shared_reel().
  const messages = {
    28000: [401, '⚠️ That Reel Map key is wrong. Copy it again from Settings.'],
    22023: [400, '⚠️ No link found in what was shared'],
    54000: [429, '⏳ Too many reels this hour. Try again later.'],
  };
  const [status, message] = messages[result?.code] ?? [502, '⚠️ Could not save. Try again.'];
  return reply(res, status, message);
};
