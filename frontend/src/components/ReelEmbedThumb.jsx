import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { coverFor, savedCover } from '../lib/reelCover';
import { forgetPhoto, photoFor, placeIdFromMapsUrl } from '../lib/placePhoto';
import { isRedNoteUrl } from '../lib/shareText';

// Each platform's official embed: the size it is laid out at (then scaled down to the box's width)
// and how much of the bottom is cut off (0: the whole embed shows, untouched).
const PLATFORMS = {
  // Instagram's no-caption embed. Its name bar and footer show as Instagram draws them.
  instagram: { width: 326, height: 580, footer: 0 },
  // TikTok's embed player, with the settings its oEmbed gives out (muted, so iPhone lets it start
  // instead of showing "Server error"). Description and music info are off by default; controls=0
  // hides the play button and progress bar, since taps open the reel instead.
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
  // RedNote has no embed: its cover picture is shown instead (RedNoteCover).
  if (isRedNoteUrl(reelUrl)) return { platform: 'rednote', width: 0, height: 0, footer: 0, src: '' };
  const instagram = url.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p)\/([^/]+)/);
  if (/(^|\.)instagram\.com$/.test(url.hostname) && instagram) {
    const kind = instagram[1] === 'p' ? 'p' : 'reel';
    return { ...PLATFORMS.instagram, platform: 'instagram', src: `https://www.instagram.com/${kind}/${instagram[2]}/embed/` };
  }
  // Full links only (tiktok.com/@name/video/123). Short vm.tiktok.com links don't carry the video id.
  const tiktok = url.pathname.match(/^\/@[^/]+\/video\/(\d+)/);
  if (/(^|\.)tiktok\.com$/.test(url.hostname) && tiktok) {
    return { ...PLATFORMS.tiktok, platform: 'tiktok', src: `https://www.tiktok.com/player/v1/${tiktok[1]}?embed_from=oembed&muted=1&controls=0` };
  }
  return null;
}

// A reel's thumbnail: its platform's own embed (Instagram, TikTok), or RedNote's cover picture. Taps go to the
// button around it, which opens the reel.
export default function ReelEmbedThumb(props) {
  // mapsUrl: the place's saved Google Maps link, so a RedNote card can show the place's Google photo behind it.
  return isRedNoteUrl(props.reelUrl) ? <RedNoteCover {...props} /> : <EmbedFrame {...props} />;
}

// A RedNote note's cover picture, loaded straight from RedNote's server (no referrer sent). When it can't be
// shown (RedNote's image host may refuse it, and that is respected: it isn't fetched any other way), a RedNote-red
// card with the note's title.
function RedNoteCover({ reelUrl, mapsUrl = '', className = '' }) {
  const [saved] = useState(() => savedCover(reelUrl));
  const [cover, setCover] = useState(saved?.coverUrl || '');
  const [title, setTitle] = useState(saved?.title || '');
  const [failed, setFailed] = useState(false);
  // The place's own Google photo behind the card, when it has a Google place id and a photo.
  const [photo, setPhoto] = useState(null);
  const placeId = placeIdFromMapsUrl(mapsUrl);
  useEffect(() => {
    let current = true;
    setPhoto(null);
    photoFor(placeId).then((found) => current && setPhoto(found));
    return () => { current = false; };
  }, [placeId]);
  useEffect(() => {
    let current = true;
    setFailed(false);
    coverFor(reelUrl).then((found) => {
      if (!current) return;
      setCover(found.coverUrl);
      setTitle(found.title);
    });
    return () => { current = false; };
  }, [reelUrl]);
  return (
    <span className={`${className} reel-embed-thumb is-rednote is-loaded${photo && !(cover && !failed) ? ' has-photo' : ''}`}>
      {cover && !failed
        ? <img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
        : (
          <>
            {photo && <img src={photo.url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => { forgetPhoto(placeId); setPhoto(null); }} />}
            <span className="rednote-tile">
              <i>RedNote</i>{title && <b>{title}</b>}<small>View note ↗</small>
              {photo?.attribution && <em>Photo: {photo.attribution}</em>}
            </span>
          </>
        )}
    </span>
  );
}

// The official embed, scaled down to the box's width (set in CSS); the box's height follows. Nothing is
// drawn over it: the scaled-down player is too small to use.
function EmbedFrame({ reelUrl, className = '' }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0);
  // The box shows a light placeholder until the player has loaded, then the player fades in.
  const [loaded, setLoaded] = useState(false);
  const embed = reelEmbed(reelUrl);
  const embedWidth = embed?.width;

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
      {scale > 0 && (
        <iframe
          src={embed.src}
          title={embed.platform === 'tiktok' ? 'TikTok video' : 'Instagram reel'}
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          allow="encrypted-media"
          onLoad={() => setLoaded(true)}
          style={{ width: embed.width, height: embed.height, transform: `scale(${scale})` }}
        />
      )}
    </span>
  );
}
