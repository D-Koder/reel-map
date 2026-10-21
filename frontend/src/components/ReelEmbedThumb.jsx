import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// TikTok covers already asked for this visit, by /@name/video/123: a promise of { thumbnailUrl, creator } or null.
const tiktokCovers = new Map();
function tiktokCover(videoPath) {
  if (!tiktokCovers.has(videoPath)) {
    tiktokCovers.set(videoPath, fetch(`/api/tiktok-cover?path=${encodeURIComponent(videoPath)}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null));
  }
  return tiktokCovers.get(videoPath);
}

// Each platform's official embed: the size it is laid out at (then scaled down to the box's width)
// and how much of the bottom is cut off (0: the whole embed shows, untouched).
const PLATFORMS = {
  // Instagram's no-caption embed. Its name bar and footer show as Instagram draws them.
  instagram: { width: 326, height: 580, footer: 0 },
  // TikTok's cover image (from its oEmbed, via /api/tiktok-cover), not its player: on iPhone the
  // player's video fails inside other sites and shows "Server error".
  tiktok: { width: 324, height: 576, footer: 0 },
};

// The official embed for a reel link, or null when there isn't one (other sites, TikTok short links).
export function reelEmbed(reelUrl) {
  let url;
  try {
    url = new URL(reelUrl);
  } catch {
    return null;
  }
  const instagram = url.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p)\/([^/]+)/);
  if (/(^|\.)instagram\.com$/.test(url.hostname) && instagram) {
    const kind = instagram[1] === 'p' ? 'p' : 'reel';
    return { ...PLATFORMS.instagram, platform: 'instagram', src: `https://www.instagram.com/${kind}/${instagram[2]}/embed/` };
  }
  // Full links only (tiktok.com/@name/video/123). Short vm.tiktok.com links don't carry the video id.
  const tiktok = url.pathname.match(/^\/@[^/]+\/video\/\d+/);
  if (/(^|\.)tiktok\.com$/.test(url.hostname) && tiktok) {
    return { ...PLATFORMS.tiktok, platform: 'tiktok', videoPath: tiktok[0] };
  }
  return null;
}

// A reel's official embed (Instagram) or cover credited to its creator (TikTok), scaled down to the
// box's width (set in CSS); the box's height follows. Taps go to the button around it, which opens the
// reel, because the scaled-down player is too small to use.
export default function ReelEmbedThumb({ reelUrl, className = '' }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0);
  // The box shows a light placeholder until the player has loaded, then the player fades in.
  const [loaded, setLoaded] = useState(false);
  const embed = reelEmbed(reelUrl);
  const embedWidth = embed?.width;
  const videoPath = embed?.videoPath;
  const [cover, setCover] = useState(null);

  useEffect(() => {
    setCover(null);
    if (!videoPath) return undefined;
    let current = true;
    tiktokCover(videoPath).then((found) => { if (current) setCover(found); });
    return () => { current = false; };
  }, [videoPath]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !embedWidth) return undefined;
    const fit = () => setScale(box.clientWidth / embedWidth);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [embedWidth]);

  if (!embed) return null;
  return (
    <span
      ref={boxRef}
      className={`${className} reel-embed-thumb is-${embed.platform}${loaded ? ' is-loaded' : ''}`}
      style={scale ? { height: Math.round((embed.height - embed.footer) * scale) } : undefined}
    >
      {embed.platform === 'tiktok' ? cover && (
        <>
          <img src={cover.thumbnailUrl} alt="TikTok video cover" onLoad={() => setLoaded(true)} />
          {cover.creator && <span className="reel-embed-credit">@{cover.creator}</span>}
        </>
      ) : scale > 0 && (
        <iframe
          src={embed.src}
          title={embed.platform === 'tiktok' ? 'TikTok video' : 'Instagram reel'}
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          onLoad={() => setLoaded(true)}
          style={{ width: embed.width, height: embed.height, transform: `scale(${scale})` }}
        />
      )}
    </span>
  );
}
