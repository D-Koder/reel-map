// Instagram's public oEmbed: caption, creator and cover in one plain request, no headless browser.
// Returns { ok: true, caption, creator, thumbnailUrl } or { ok: false, status } when Instagram says no.
// Throws on a timeout or network error, which is not the Reel's fault.
async function fetchInstagramOembed(reelUrl, timeoutMs = 12000) {
  const oembedUrl = new URL('https://www.instagram.com/api/v1/oembed/');
  oembedUrl.searchParams.set('url', reelUrl);
  const response = await fetch(oembedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { ok: false, status: response.status };
  const data = await response.json().catch(() => ({}));
  const thumbnailUrl = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
  return {
    ok: true,
    caption: typeof data.title === 'string' ? data.title.trim() : '',
    creator: typeof data.author_name === 'string' ? data.author_name : null,
    thumbnailUrl,
  };
}

module.exports = { fetchInstagramOembed };
