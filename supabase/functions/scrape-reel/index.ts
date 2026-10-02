import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function readAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function getMeta(html: string, attribute: 'property' | 'name', key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((item) => readAttribute(item, attribute).toLowerCase() === key.toLowerCase());
  return tag ? readAttribute(tag, 'content') : '';
}

function parseDescription(description: string) {
  const match = description.match(/(?:^|\s)-\s*([\w.]+)\s+on\s+[^:]+:\s*([\s\S]*)$/);
  if (!match) return { creator: '', caption: description.trim() };
  const rawCaption = match[2].trim();
  return {
    creator: match[1],
    caption: rawCaption.startsWith('"') && rawCaption.endsWith('"')
      ? rawCaption.slice(1, -1)
      : rawCaption,
  };
}

function placeDetailsFromCaption(caption: string) {
  const locationLine = caption.split(/\r?\n/)
    .find((line) => /^\s*[📍📌]/u.test(line))
    ?.replace(/^\s*[📍📌]\s*/u, '')
    .trim() ?? '';
  const separator = locationLine.match(/\s+[-–—]\s+/u);
  if (!separator || separator.index === undefined) {
    return { placeName: '', location: locationLine };
  }
  return {
    placeName: locationLine.slice(0, separator.index).trim(),
    location: locationLine.slice(separator.index + separator[0].length).trim(),
  };
}

function normalizeImageUrl(value: unknown) {
  let candidate = decodeHtml(String(value ?? '')).trim();
  const cssUrl = candidate.match(/^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)$/i);
  if (cssUrl) candidate = (cssUrl[1] ?? cssUrl[2] ?? cssUrl[3] ?? '').trim();
  candidate = candidate.replace(/^['"]|['"]$/g, '').trim();
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function collectEmbeddedData(html: string, shortcode: string) {
  const values: Record<string, unknown> = {};
  const scripts = html.match(/<script\b[^>]*type=["']application\/(?:ld\+json|json)["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const visit = (value: unknown, depth = 0): unknown => {
    if (!value || typeof value !== 'object' || depth > 30) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }

    const record = value as Record<string, unknown>;
    if (record.shortcode === shortcode || record.code === shortcode) return record;
    for (const child of Object.values(record)) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  for (const script of scripts) {
    const jsonText = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const reel = visit(JSON.parse(decodeHtml(jsonText)));
      if (!reel || typeof reel !== 'object') continue;
      const media = reel as Record<string, unknown>;
      const captionValue = media.caption;
      const caption = typeof captionValue === 'string'
        ? captionValue
        : captionValue && typeof captionValue === 'object'
          ? (captionValue as Record<string, unknown>).text
          : '';
      const owner = media.owner && typeof media.owner === 'object'
        ? media.owner as Record<string, unknown>
        : {};
      const location = media.location && typeof media.location === 'object'
        ? media.location as Record<string, unknown>
        : {};
      const likesNode = media.edge_media_preview_like;
      const commentsNode = media.edge_media_preview_comment;
      const likes = media.like_count ?? (likesNode && typeof likesNode === 'object'
        ? (likesNode as Record<string, unknown>).count
        : 0);
      const comments = media.comment_count ?? (commentsNode && typeof commentsNode === 'object'
        ? (commentsNode as Record<string, unknown>).count
        : 0);
      Object.assign(values, {
        caption: typeof caption === 'string' ? caption : '',
        creator: typeof owner.username === 'string' ? owner.username : '',
        videoUrl: typeof media.video_url === 'string' ? media.video_url : '',
        thumbnailUrl: typeof media.display_url === 'string'
          ? media.display_url
          : typeof media.thumbnail_src === 'string' ? media.thumbnail_src : '',
        location: typeof location.name === 'string' ? location.name : '',
        likes: Number(likes),
        comments: Number(comments),
        date: media.taken_at_timestamp ? new Date(Number(media.taken_at_timestamp) * 1000).toISOString() : '',
      });
      break;
    } catch {
      // Ignore unrelated or non-JSON script contents.
    }
  }
  return values;
}

async function scrapeReel(reelUrl: string) {
  const url = new URL(reelUrl);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) ||
      !/^\/(?:reel\/[^/]+|[^/]+\/reel\/[^/]+)\/?$/.test(url.pathname)) {
    throw new Error('Enter a valid https://www.instagram.com/reel/... link');
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  const reelSegmentIndex = pathParts.indexOf('reel');
  const shortcode = pathParts[reelSegmentIndex + 1];
  // Instagram's public oEmbed response includes the post caption, author, and
  // poster image without needing a browser session or a third-party scraper.
  const oembedUrl = new URL('https://www.instagram.com/api/v1/oembed/');
  oembedUrl.searchParams.set('url', reelUrl);
  try {
    const oembedResponse = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (oembedResponse.ok) {
      const oembed = await oembedResponse.json();
      if (oembed.title || oembed.author_name || oembed.thumbnail_url) {
        const caption = String(oembed.title || '');
        const placeDetails = placeDetailsFromCaption(caption);
        return {
          success: true,
          reelUrl,
          caption,
          location: placeDetails.location,
          placeName: placeDetails.placeName,
          date: '',
          creator: String(oembed.author_name || ''),
          likes: Number(oembed.like_count) || null,
          comments: Number(oembed.comment_count) || null,
          hashtags: [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
          videoUrl: '',
          thumbnailUrl: normalizeImageUrl(oembed.thumbnail_url),
        };
      }
    }
  } catch (error) {
    console.warn('Instagram oEmbed lookup failed; trying page metadata:', error);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Instagram returned HTTP ${response.status}`);

  const html = await response.text();
  const description = getMeta(html, 'property', 'og:description') ||
    getMeta(html, 'name', 'description') || getMeta(html, 'name', 'twitter:description');
  const parsedDescription = parseDescription(description);
  const embedded = collectEmbeddedData(html, shortcode);
  const caption = String(embedded.caption || parsedDescription.caption || '');
  const captionPlaceDetails = placeDetailsFromCaption(caption);
  const hashtags = [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]);
  const likesText = description.match(/([\d,.]+\s*[KMB]?)\s+likes?/i)?.[1] ?? '';
  const commentsText = description.match(/([\d,.]+\s*[KMB]?)\s+comments?/i)?.[1] ?? '';
  const parseCount = (text: string) => {
    const match = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
    if (!match) return 0;
    const scale = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
    return Math.round(Number(match[1]) * scale);
  };

  const result = {
    success: true,
    reelUrl,
    caption,
    location: captionPlaceDetails.location || String(embedded.location || ''),
    placeName: captionPlaceDetails.placeName,
    date: String(embedded.date || ''),
    creator: String(embedded.creator || parsedDescription.creator || ''),
    likes: Number(embedded.likes) || parseCount(likesText),
    comments: Number(embedded.comments) || parseCount(commentsText),
    hashtags,
    videoUrl: String(embedded.videoUrl || getMeta(html, 'property', 'og:video') || ''),
    thumbnailUrl: normalizeImageUrl(embedded.thumbnailUrl || getMeta(html, 'property', 'og:image') ||
      getMeta(html, 'name', 'twitter:image') || ''),
  };

  if (!result.caption && !result.creator && !result.thumbnailUrl) {
    throw new Error('Instagram did not expose public Reel metadata. The Reel may be private, require login, or be temporarily unavailable.');
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    if (typeof body.reelUrl !== 'string' || !body.reelUrl.trim()) {
      return jsonResponse({ error: 'reelUrl is required' }, 400);
    }
    return jsonResponse(await scrapeReel(body.reelUrl.trim()));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scraper error';
    console.error('Reel scrape failed:', message);
    const status = message.startsWith('Enter a valid') ? 400 : 502;
    return jsonResponse({ error: message }, status);
  }
});
