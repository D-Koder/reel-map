// Cover-only lookup: asks Instagram's oEmbed for a Reel's current cover image.
// No Google Maps search and no headless browser, so it is quick and cheap.
const INSTAGRAM_REEL = /^https:\/\/(www\.)?instagram\.com\/(reel|p)\/[^/?#]+\/?/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  if (!INSTAGRAM_REEL.test(reelUrl)) return res.status(400).json({ error: 'Not an Instagram Reel link' });

  const oembedUrl = new URL('https://www.instagram.com/api/v1/oembed/');
  oembedUrl.searchParams.set('url', reelUrl);
  try {
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    // Blocked or deleted: tell the app so it can stop asking for this Reel for a while.
    if (!response.ok) return res.status(200).json({ thumbnailUrl: null, status: 'missing', upstreamStatus: response.status });

    const data = await response.json();
    const thumbnailUrl = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
    return res.status(200).json({ thumbnailUrl, status: thumbnailUrl ? 'ok' : 'missing' });
  } catch (error) {
    // A timeout or network error is not the Reel's fault: report it, but don't mark the Reel as missing.
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'Instagram took too long' : 'Could not reach Instagram' });
  }
};
