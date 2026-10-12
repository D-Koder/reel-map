// Reads a public Reel page's preview tags (og:image, og:description) with one plain request, no browser.
// These are the tags link previews use, so Instagram serves them to the Facebook link crawler.
// og:description reads like: 1,234 likes, 56 comments - someone on October 12, 2026: "caption…"
// Returns { thumbnailUrl, likes, comments, creator, caption } with empty values for anything missing.
// Throws on a timeout or network error.

function decodeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function metaContent(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    if (content) return decodeHtml(content[1] ?? content[2] ?? '').trim();
  }
  return '';
}

// "1,234" → 1234, "12K" → 12000, "1.2M" → 1200000.
function parseCount(text) {
  const match = String(text || '').replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  const scale = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] ?? 1;
  return Math.round(Number(match[1]) * scale);
}

function readPreviewTags(html) {
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const image = metaContent(html, 'og:image');
  const about = description.match(/^\s*([\d.,]+\s*[KMB]?)\s+likes?,\s*([\d.,]+\s*[KMB]?)\s+comments?\s*-\s*([\w.]+)\s+on\s+[^:]+:\s*([\s\S]*)$/i);
  const caption = about?.[4]?.trim().replace(/^"|"\.?$/g, '').trim() ?? '';
  return {
    thumbnailUrl: image.startsWith('https://') ? image : null,
    likes: about ? parseCount(about[1]) : null,
    comments: about ? parseCount(about[2]) : null,
    creator: about?.[3] ?? null,
    caption,
  };
}

async function fetchInstagramPage(reelUrl, timeoutMs = 10000) {
  const response = await fetch(reelUrl, {
    headers: {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { thumbnailUrl: null, likes: null, comments: null, creator: null, caption: '' };
  return readPreviewTags(await response.text());
}

module.exports = { fetchInstagramPage, readPreviewTags };
