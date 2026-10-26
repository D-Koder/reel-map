import { readJSON, writeJSON } from './storage';

// RedNote (Xiaohongshu) shares text, not just a link: "<start of the caption> <link> Copy and open
// rednote to view the note". The link can't be read without logging in, so the caption's start is kept
// with the link and sent to the lookup in its place.
const KEY = 'reelmap:share-notes';
const KEPT = 50;
const REDNOTE_HOSTS = ['xhslink.cn', 'www.xhslink.cn', 'xiaohongshu.com', 'www.xiaohongshu.com'];

export function isRedNoteUrl(value) {
  try {
    return REDNOTE_HOSTS.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

// { url, note } from pasted or shared text: the first link, and the text in front of it.
export function parseShare(text) {
  const raw = String(text || '');
  const url = raw.match(/https?:\/\/[^\s]+/)?.[0] ?? '';
  const note = url ? raw.slice(0, raw.indexOf(url)).trim() : '';
  return { url, note };
}

// Pasted text becomes its link, the caption's start kept for that link (RedNote only: Instagram and TikTok
// are read from the page). Text with no link is returned as it was typed.
export function takeShare(text) {
  const { url, note } = parseShare(text);
  if (!url) return text;
  if (note && isRedNoteUrl(url)) {
    const notes = readJSON(KEY, []).filter((entry) => entry.url !== url);
    writeJSON(KEY, [...notes, { url, note: note.slice(0, 1000) }].slice(-KEPT));
  }
  return url;
}

// The caption's start kept for a link, or ''.
export function shareNote(url) {
  return readJSON(KEY, []).find((entry) => entry.url === url)?.note ?? '';
}
