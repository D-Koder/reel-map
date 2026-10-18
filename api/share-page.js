const { loadShare, shareTitle, UUID } = require('./_lib/share-card');

// /p/<id>[?g=<collection> | ?c=<collection>] (rewritten here, see vercel.json; share-card.js says what each shows).
// Chat apps fetching the link get a page of preview tags (title, picture). People are sent on
// to the app, which opens the place. Messages, WhatsApp and the others announce themselves as bots.
const PREVIEW_BOTS = /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|applebot|googlebot|bingbot|embedly|pinterest|redditbot|bot\b|crawler|spider/i;

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

module.exports = async function handler(req, res) {
  const id = String(req.query.id || '');
  const group = String(req.query.g || '');
  const booking = String(req.query.c || '');
  const appUrl = UUID.test(id) ? `/?place=${encodeURIComponent(id)}` : '/';

  // Never cached: chat apps and people get different answers from the same link, and a cached
  // preview page would be shown to the person tapping the link right after it was sent.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'User-Agent');
  if (!PREVIEW_BOTS.test(req.headers['user-agent'] || '')) return res.redirect(302, appUrl);

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  let share = null;
  try {
    share = await loadShare(id, { group, booking });
  } catch (error) {
    console.warn('[share-page] lookup failed:', error.message);
  }
  const title = share ? shareTitle(share) : 'waylit maps';
  const description = share?.place.address || 'Places from reels, on one map.';
  // The same link details go to the picture, which is drawn from the same lookup.
  const query = share?.booking ? `?c=${encodeURIComponent(booking)}` : share?.crew ? `?g=${encodeURIComponent(group)}` : '';
  const image = share
    ? `${origin}/api/share-image?id=${encodeURIComponent(id)}${query.replace('?', '&')}`
    : `${origin}/icon-512.png`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="waylit maps">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(`${origin}/p/${id}${query}`)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1044">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:image" content="${escape(image)}">
</head><body style="margin:0;font-family:-apple-system,sans-serif;background:#12162a;color:#f1eee8;display:flex;min-height:100vh;align-items:center;justify-content:center">
<a href="${escape(appUrl)}" style="color:#fff;background:#d4421d;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:600">Open in waylit maps</a>
</body></html>`);
};
