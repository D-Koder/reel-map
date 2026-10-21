// A TikTok video's cover and creator, from TikTok's public oEmbed (the official way for other sites
// to show a video). The app shows the cover, credited to the creator, and a tap opens TikTok.
// Nothing is stored: TikTok's image links expire after a few days, so each view asks again (the
// CDN keeps an answer for an hour).
module.exports = async function handler(req, res) {
  const id = String(req.query?.id || '');
  if (!/^\d{5,25}$/.test(id)) return res.status(400).json({ error: 'Expected a TikTok video id' });

  const oembedUrl = new URL('https://www.tiktok.com/oembed');
  oembedUrl.searchParams.set('url', `https://www.tiktok.com/video/${id}`);
  try {
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(404).json({ error: `TikTok returned HTTP ${response.status}` });
    const data = await response.json().catch(() => ({}));
    const thumbnailUrl = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
    if (!thumbnailUrl) return res.status(404).json({ error: 'No cover for this video' });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      thumbnailUrl,
      creator: typeof data.author_unique_id === 'string' ? data.author_unique_id : null,
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
