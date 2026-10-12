// Test webhook for Instagram DMs sent to the Reel Map account.
// Phase 1 only logs what Meta sends, so we can see whether a shared reel includes its caption.
// GET  → Meta's one-time verification check (hub.challenge).
// POST → a message event. The X-Hub-Signature-256 header proves it came from Meta.
// Env: IG_VERIFY_TOKEN (any secret you choose, also typed into Meta's webhook settings),
// META_APP_SECRET and/or IG_APP_SECRET. Instagram Login apps show their own "Instagram app secret",
// and either one may sign the webhook, so both are tried.

const crypto = require('node:crypto');

const VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
const APP_SECRETS = [process.env.META_APP_SECRET, process.env.IG_APP_SECRET].filter(Boolean);

// Meta signs the exact bytes it sent. Read them from the stream when the body has not been parsed yet,
// otherwise fall back to re-encoding the parsed body (which can differ, so the check may then fail).
async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (!req.readableEnded && typeof req.on === 'function') {
    const chunks = [];
    const done = new Promise((resolve) => {
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', resolve);
      req.on('error', resolve);
      setTimeout(resolve, 3000);
    });
    await done;
    if (chunks.length) return Buffer.concat(chunks);
  }
  return Buffer.from(req.body ? JSON.stringify(req.body) : '');
}

function signatureIsValid(rawBody, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const received = Buffer.from(header);
  return APP_SECRETS.some((secret) => {
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge ?? ''));
    }
    return res.status(403).send('Verification failed');
  }
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const rawBody = await readRawBody(req);
  const verified = signatureIsValid(rawBody, req.headers['x-hub-signature-256']);
  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    payload = req.body ?? null;
  }

  // Test phase: log everything. Remove this once we know the payload shape, since it contains users' messages.
  console.log(`[instagram-webhook] signature ${verified ? 'OK' : 'NOT VERIFIED'}`);
  console.log('[instagram-webhook] payload:', JSON.stringify(payload, null, 2));
  for (const entry of payload?.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      for (const attachment of event.message?.attachments ?? []) {
        console.log(`[instagram-webhook] attachment type=${attachment.type}`, JSON.stringify(attachment.payload));
      }
    }
  }

  // Meta retries anything that is not a quick 200, so always answer 200.
  return res.status(200).send('EVENT_RECEIVED');
};
