// Sends server errors to Sentry, so a broken lookup emails you instead of waiting in Vercel's logs.
// Off until SENTRY_DSN is set in Vercel. Every console.error is reported (the lookups log their
// failures that way, like "Google Maps scrape failed"), at most once a minute per message on each
// server, plus anything an endpoint throws (see requireUser in auth.js).
// It posts Sentry's envelope format with fetch, so the Chrome functions don't carry an SDK.

const crypto = require('crypto');

const DSN = process.env.SENTRY_DSN || '';
const parsed = (() => {
  try {
    const url = new URL(DSN);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    return url.username && projectId ? { url, key: url.username, projectId } : null;
  } catch {
    return null;
  }
})();
const lastSent = new Map();
const QUIET_MS = 60000;

// Keeps Vercel's function alive until the report is sent, as api/save-reel.js does for its lookup.
const keepAlive = (promise) => globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(promise);

function reportError(error, extra = {}) {
  if (!parsed) return Promise.resolve();
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.name}: ${err.message}`.slice(0, 200);
  if (Date.now() - (lastSent.get(key) || 0) < QUIET_MS) return Promise.resolve();
  lastSent.set(key, Date.now());

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.VERCEL_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    exception: { values: [{ type: err.name, value: err.message }] },
    extra: { stack: err.stack, ...extra },
  };
  const { url, key: publicKey, projectId } = parsed;
  const body = [JSON.stringify({ event_id: eventId, dsn: DSN }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  const sending = fetch(`${url.protocol}//${url.host}/api/${projectId}/envelope/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=reel-map/1.0`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
  keepAlive(sending);
  return sending;
}

// Every console.error is also reported: its Error if it has one, else its text.
if (parsed && !console.error.reportsToSentry) {
  const original = console.error;
  console.error = (...args) => {
    const found = args.find((arg) => arg instanceof Error);
    const text = args.map((arg) => (typeof arg === 'string' ? arg : arg instanceof Error ? arg.message : '')).filter(Boolean).join(' ');
    reportError(found ? Object.assign(new Error(text), { name: found.name, stack: found.stack }) : new Error(text));
    original(...args);
  };
  console.error.reportsToSentry = true;
}

module.exports = { reportError };
