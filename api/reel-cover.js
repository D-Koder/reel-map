// Cover-only lookup: asks Instagram's oEmbed for a Reel's current cover image.
// No Google Maps search and no headless browser, so it is quick and cheap.
const { fetchInstagramOembed } = require('./_lib/instagram-oembed');

const INSTAGRAM_REEL = /^https:\/\/(www\.)?instagram\.com\/(reel|p)\/[^/?#]+\/?/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  if (!INSTAGRAM_REEL.test(reelUrl)) return res.status(400).json({ error: 'Not an Instagram Reel link' });

  try {
    const oembed = await fetchInstagramOembed(reelUrl);
    // Blocked or deleted: tell the app so it can stop asking for this Reel for a while.
    if (!oembed.ok) return res.status(200).json({ thumbnailUrl: null, status: 'missing', upstreamStatus: oembed.status });
    return res.status(200).json({ thumbnailUrl: oembed.thumbnailUrl, status: oembed.thumbnailUrl ? 'ok' : 'missing' });
  } catch (error) {
    // A timeout or network error is not the Reel's fault: report it, but don't mark the Reel as missing.
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'Instagram took too long' : 'Could not reach Instagram' });
  }
};
