// Cover-only lookup: asks Instagram's oEmbed, and the public page's og:image, for a Reel's current cover.
// No Google Maps search and no headless browser, so it is quick and cheap.
const { fetchInstagramCover } = require('./_lib/instagram-cover');

const INSTAGRAM_REEL = /^https:\/\/(www\.)?instagram\.com\/(reel|p)\/[^/?#]+\/?/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  if (!INSTAGRAM_REEL.test(reelUrl)) return res.status(400).json({ error: 'Not an Instagram Reel link' });

  try {
    const { thumbnailUrl } = await fetchInstagramCover(reelUrl);
    // No cover (blocked or deleted): tell the app so it can stop asking for this Reel for a while.
    return res.status(200).json({ thumbnailUrl, status: thumbnailUrl ? 'ok' : 'missing' });
  } catch (error) {
    // A timeout or network error is not the Reel's fault: report it, but don't mark the Reel as missing.
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'Instagram took too long' : 'Could not reach Instagram' });
  }
};
