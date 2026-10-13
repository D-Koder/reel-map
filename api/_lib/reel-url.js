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

module.exports = { canonicalInstagramUrl, instagramSlide };
