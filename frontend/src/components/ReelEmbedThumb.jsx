import React, { useLayoutEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

// Instagram's embed is laid out at this size; it is then scaled down to fit the box.
const EMBED_WIDTH = 326;
const EMBED_HEIGHT = 580;

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

// Instagram's official embed, shrunk to fit the box it's in. The whole embed is scaled, so its
// header and footer stay visible (nothing is cropped). Taps go to the button around it, which
// opens the reel, because the shrunken player is too small to use.
export default function ReelEmbedThumb({ reelUrl, className = '' }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0);
  const src = instagramEmbedUrl(reelUrl);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const fit = () => setScale(Math.min(box.clientWidth / EMBED_WIDTH, box.clientHeight / EMBED_HEIGHT));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  if (!src) return null;
  return (
    <span ref={boxRef} className={`${className} reel-embed-thumb`}>
      {scale > 0 && (
        <iframe
          src={src}
          title="Instagram reel"
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          style={{ width: EMBED_WIDTH, height: EMBED_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
      <span className="thumb-play" aria-hidden="true">
        <Play fill="currentColor" strokeWidth={0} />
      </span>
    </span>
  );
}
