// A TikTok video's cover and creator, from TikTok's public oEmbed (the official way for other sites
// to show a video). The app shows the cover, credited to the creator, and a tap opens TikTok.
// Nothing is stored: TikTok's image links expire after a few days, so each view asks again (the
// CDN keeps an answer for an hour).
module.exports = async function handler(req, res) {
  // oEmbed needs the full link, with the creator's name, not just the video id.
  const path = String(req.query?.path || '');
  if (!/^\/@[\w.-]{1,40}\/video\/\d{5,25}$/.test(path)) return res.status(400).json({ error: 'Expected /@name/video/123' });

  const oembedUrl = new URL('https://www.tiktok.com/oembed');
  oembedUrl.searchParams.set('url', `https://www.tiktok.com${path}`);
  try {
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.warn(`TikTok oEmbed returned HTTP ${response.status} for ${path}`);
    if (!response.ok) return res.status(404).json({ error: `TikTok returned HTTP ${response.status}` });
    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON: logged below with the start of what came back.
    }
    const thumbnailUrl = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
    if (!thumbnailUrl) console.warn(`TikTok oEmbed had no cover for ${path}:`, response.headers.get('content-type'), text.slice(0, 300));
    if (!thumbnailUrl) return res.status(404).json({ error: 'No cover for this video' });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      thumbnailUrl,
      creator: typeof data.author_unique_id === 'string' ? data.author_unique_id : null,
    });
  } catch (error) {
    console.warn(`TikTok oEmbed failed for ${path}:`, error.message);
    return res.status(502).json({ error: error.message });
  }
};
