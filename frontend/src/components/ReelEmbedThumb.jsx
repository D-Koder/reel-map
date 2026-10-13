import React, { useLayoutEffect, useRef, useState } from 'react';

// Instagram's embed is laid out at this size; it is then scaled down to the box's width.
const EMBED_WIDTH = 326;
const EMBED_HEIGHT = 580;
// How much of the bottom (likes, "View more on Instagram") is cut off. 0 shows the whole embed.
// The header at the top (creator and Instagram logo) is always kept, so the reel stays credited.
const FOOTER_HEIGHT = 140;

// The /embed/ link of an Instagram reel or post: Instagram's own no-caption embed. Null for anything else.
export function instagramEmbedUrl(reelUrl) {
  try {
    const url = new URL(reelUrl);
    const match = url.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p)\/([^/]+)/);
    if (!/(^|\.)instagram\.com$/.test(url.hostname) || !match) return null;
    return `https://www.instagram.com/${match[1] === 'p' ? 'p' : 'reel'}/${match[2]}/embed/`;
  } catch {
    return null;
  }
}

// Instagram's official embed, scaled down to the box's width (set in CSS); the box's height follows,
// down to just above the footer.
// Nothing is drawn over it. Taps go to the button around it, which opens the reel, because the
// scaled-down player is too small to use.
export default function ReelEmbedThumb({ reelUrl, className = '' }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0);
  // The box shows a light placeholder until Instagram's player has loaded, then the player fades in.
  const [loaded, setLoaded] = useState(false);
  const src = instagramEmbedUrl(reelUrl);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const fit = () => setScale(box.clientWidth / EMBED_WIDTH);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  if (!src) return null;
  return (
    <span
      ref={boxRef}
      className={`${className} reel-embed-thumb${loaded ? ' is-loaded' : ''}`}
      style={scale ? { height: Math.round((EMBED_HEIGHT - FOOTER_HEIGHT) * scale) } : undefined}
    >
      {scale > 0 && (
        <iframe
          src={src}
          title="Instagram reel"
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          style={{ width: EMBED_WIDTH, height: EMBED_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
    </span>
  );
}
