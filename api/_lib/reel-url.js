// One spelling per Reel, so "…/reel/ABC/?igsh=xyz" and "…/user/reel/ABC" share a cache entry.
// Returns null for anything that isn't an Instagram Reel or post link.
function canonicalInstagramUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p)\/([^/]+)\/?$/);
  if (!match) return null;
  const kind = match[1] === 'p' ? 'p' : 'reel';
  return `https://www.instagram.com/${kind}/${match[2]}/`;
}

// The photo a carousel link opens on ("?img_index=3" → 3), or null.
function instagramSlide(value) {
  try {
    const slide = Number(new URL(String(value || '').trim()).searchParams.get('img_index'));
    return Number.isInteger(slide) && slide >= 1 && slide <= 20 ? slide : null;
  } catch {
    return null;
  }
}

// The reel's clean link, its slide and its key in the shared lookup cache (table reel_lookups). Each
// photo of a carousel can be a different place, so the slide (from the link, else `bodySlide`) is part
// of the key. Only Instagram lookups are cached: cacheKey is null for anything else.
function reelLookupKey(reelUrl, bodySlide) {
  const cleanUrl = canonicalInstagramUrl(reelUrl);
  const asked = Number(bodySlide);
  const slide = instagramSlide(reelUrl) ?? (Number.isInteger(asked) && asked >= 1 && asked <= 20 ? asked : null);
  return { cleanUrl, slide, cacheKey: cleanUrl && slide ? `${cleanUrl}?img_index=${slide}` : cleanUrl };
}

// A short TikTok link (vm./vt.tiktok.com) has no video id, so the app can't embed it. It redirects
// to the full tiktok.com/@name/video/123 link; returns that, or the link as given if it can't.
async function expandTikTokUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return value;
  }
  if (!['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)) return value;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000) });
    response.body?.cancel().catch(() => {});
    const full = new URL(response.url);
    const match = full.pathname.match(/^\/@[^/]+\/video\/\d+/);
    return ['tiktok.com', 'www.tiktok.com'].includes(full.hostname) && match ? `https://www.tiktok.com${match[0]}` : value;
  } catch (error) {
    console.warn('TikTok short link not expanded:', error.message);
    return value;
  }
}

module.exports = { canonicalInstagramUrl, expandTikTokUrl, instagramSlide, reelLookupKey };
