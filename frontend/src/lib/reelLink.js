import { isRedNoteUrl, takeShare } from './shareText';

const REEL_HOSTS = ['instagram.com', 'tiktok.com'];

// The reel link inside some pasted text, or null when it isn't an Instagram, TikTok or RedNote link.
export function reelLinkFrom(text) {
  const link = String(takeShare(text) || '').match(/https?:\/\/\S+/)?.[0];
  if (!link) return null;
  try {
    const host = new URL(link).hostname.replace(/^(www|m|vm|vt)\./, '');
    return REEL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || isRedNoteUrl(link) ? link : null;
  } catch {
    return null;
  }
}
