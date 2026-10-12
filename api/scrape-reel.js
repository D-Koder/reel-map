const { openPage, closePage, closeBrowser, browserFor } = require('./_lib/browser');
const { fetchInstagramOembed } = require('./_lib/instagram-oembed');
const { fetchInstagramPage } = require('./_lib/instagram-page');
const { captionVenue } = require('./_lib/caption');

// The video file and fonts are never read. Images are kept: the cover can come from an <img>.
const SKIP = ['media', 'font'];

function parseCount(value) {
  const match = String(value ?? '').trim().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return null;
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] ?? 1;
  return Math.round(Number(match[1]) * multiplier);
}

function normalizeImageUrl(value) {
  let candidate = String(value ?? '')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim();
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

// "Name:" and "Address:" lines win. Falls back to the 📍 line.
function parseCaptionDetails(caption) {
  const field = (label) => {
    const match = caption.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim() : '';
  };
  const fromLine = parseCaptionLocation(caption);
  return {
    placeName: field('Name') || fromLine.placeName,
    location: field('Address') || fromLine.location,
  };
}

// "Venue - Suburb" splits into a name and a location; anything else is all location.
function parseCaptionLocation(caption) {
  const line = captionVenue(caption);
  const separator = line.match(/\s+[-–—]\s+/u);
  if (!separator || separator.index === undefined) return { placeName: '', location: line };
  return {
    placeName: line.slice(0, separator.index).trim(),
    location: line.slice(separator.index + separator[0].length).trim(),
  };
}

function isInstagramUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) &&
      /^\/(?:reel\/[^/]+|p\/[^/]+|[^/]+\/reel\/[^/]+)\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isTikTokUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'vm.tiktok.com') return /^\/[^/]+\/?$/.test(url.pathname);
    return ['tiktok.com', 'www.tiktok.com'].includes(url.hostname) &&
      /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

// Runs inside the page. TikTok puts the caption in [data-e2e="video-desc"] and
// has no og:description or <main>, so the Instagram selectors don't apply.
function readTikTokPage(inputUrl) {
  const parseCount = (value) => {
    const match = String(value ?? '').trim().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i);
    if (!match) return null;
    const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] ?? 1;
    return Math.round(Number(match[1]) * multiplier);
  };
  const caption = document.querySelector('[data-e2e="video-desc"]')?.innerText.trim() ?? '';
  return {
    success: true,
    reelUrl: inputUrl,
    caption,
    creator: location.pathname.match(/^\/@([^/]+)/)?.[1] ?? null,
    likes: parseCount(document.querySelector('[data-e2e="like-count"]')?.innerText),
    comments: parseCount(document.querySelector('[data-e2e="comment-count"]')?.innerText),
    placeName: '',
    location: '',
    date: '',
    hashtags: [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
    videoUrl: '',
    // The video's src is a page-only blob: URL, so use the cover image, which is a real https link.
    thumbnailUrl: document.querySelector('[data-e2e="browse-video"] video')?.poster ||
      [...document.querySelectorAll('img')].find((image) => image.naturalWidth > 100 && image.src.startsWith('https://'))?.src ||
      '',
  };
}

// Two plain requests at once, no browser: oEmbed (full caption) and the public page's preview tags
// (cover, likes, comments). Returns null, so Chrome runs, when there's no caption or no cover.
async function readInstagramQuickly(reelUrl) {
  const [oembedResult, pageResult] = await Promise.allSettled([fetchInstagramOembed(reelUrl), fetchInstagramPage(reelUrl)]);
  const oembed = oembedResult.status === 'fulfilled' && oembedResult.value.ok ? oembedResult.value : {};
  const page = pageResult.status === 'fulfilled' ? pageResult.value : {};
  if (oembedResult.status === 'rejected') console.warn('Instagram oEmbed failed:', oembedResult.reason?.message);
  if (pageResult.status === 'rejected') console.warn('Instagram page read failed:', pageResult.reason?.message);

  const caption = oembed.caption || page.caption || '';
  const thumbnailUrl = normalizeImageUrl(oembed.thumbnailUrl || page.thumbnailUrl);
  if (!caption || !thumbnailUrl) {
    console.warn(`Quick Instagram lookup incomplete (caption: ${Boolean(caption)}, cover: ${Boolean(thumbnailUrl)}); using the browser`);
    return null;
  }
  const details = parseCaptionDetails(caption);
  return {
    success: true,
    reelUrl,
    caption,
    creator: oembed.creator || page.creator || null,
    likes: page.likes ?? null,
    comments: page.comments ?? null,
    placeName: details.placeName,
    location: details.location,
    date: '',
    hashtags: [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
    videoUrl: '',
    thumbnailUrl,
    source: 'quick',
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  const isTikTok = isTikTokUrl(reelUrl);
  if (!isTikTok && !isInstagramUrl(reelUrl)) {
    return res.status(400).json({ error: 'Enter a valid Instagram reel/post or TikTok video link' });
  }
  const platform = isTikTok ? 'TikTok' : 'Instagram';

  // Instagram's oEmbed has the caption, creator and cover in about a second. Start Chrome only
  // when it has no caption to search with (blocked, private, or deleted Reels).
  if (!isTikTok) {
    const quick = await readInstagramQuickly(reelUrl);
    if (quick) return res.status(200).json(quick);
  }

  let browser;
  let owned = false;
  let page;
  try {
    ({ browser, owned } = await browserFor(req));
    page = await openPage(browser, SKIP);
    await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (isTikTok) {
      await page.waitForSelector('[data-e2e="video-desc"]', { timeout: 15000 }).catch(() => {});
    } else {
      await page.waitForSelector('main', { timeout: 12000 });
      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && (main.querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]') ||
          main.querySelector('meta[property="og:image"]'));
      }, { timeout: 12000 }).catch(() => {});
    }

    const scraped = isTikTok ? await page.evaluate(readTikTokPage, reelUrl) : await page.evaluate((inputUrl) => {
      const parseCount = (value) => {
        const match = String(value ?? '').trim().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i);
        if (!match) return null;
        const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] ?? 1;
        return Math.round(Number(match[1]) * multiplier);
      };
      const main = document.querySelector('main');
      const caption = [...(main?.querySelectorAll('span') ?? [])]
        .filter((element) => element.querySelector('br') && element.innerText.trim().length > 40)
        .sort((a, b) => a.innerText.length - b.innerText.length)[0]?.innerText.trim() ??
        document.querySelector('meta[property="og:description"]')?.content ?? '';

      const reservedPaths = new Set(['accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories']);
      const ownerLink = [...(main?.querySelectorAll('a[href]') ?? [])].find((link) => {
        const match = link.getAttribute('href').match(/^\/([^/?#]+)\/$/);
        return match && !reservedPaths.has(match[1]);
      });
      const creator = ownerLink?.getAttribute('href').match(/^\/([^/]+)\/$/)?.[1] ?? null;

      const likeIcon = main?.querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]');
      const commentIcon = main?.querySelector('svg[aria-label="Comment"]');
      let engagementGroup = likeIcon;
      while (engagementGroup && commentIcon && !engagementGroup.contains(commentIcon)) {
        engagementGroup = engagementGroup.parentElement;
      }
      const countPattern = /^[\d,.]+\s*[KMB]?$/i;
      const countLabels = [...(engagementGroup?.querySelectorAll('[role="button"]') ?? [])]
        .filter((element) => countPattern.test(element.innerText.trim()))
        .map((element) => element.innerText.trim());

      const video = main?.querySelector('video');
      const directVideoUrl = video?.currentSrc || video?.querySelector('source')?.src || video?.src || '';
      const imageCandidates = [...(main?.querySelectorAll('img') ?? [])]
        .filter((image) => !/profile picture/i.test(image.alt) && image.naturalWidth > 100)
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
      const locationLine = caption.split(/\r?\n/).find((line) => /^\s*[📍📌]/u.test(line))
        ?.replace(/^\s*[📍📌]\s*/u, '').trim() ?? '';
      const separator = locationLine.match(/\s+[-–—]\s+/u);
      const thumbnail = video?.poster ||
        document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('meta[name="twitter:image"]')?.content || imageCandidates[0]?.currentSrc || '';

      return {
        success: true,
        reelUrl: inputUrl,
        caption,
        creator,
        likes: parseCount(countLabels[0]),
        comments: parseCount(countLabels[1]),
        placeName: separator && separator.index !== undefined
          ? locationLine.slice(0, separator.index).trim()
          : '',
        location: separator && separator.index !== undefined
          ? locationLine.slice(separator.index + separator[0].length).trim()
          : locationLine,
        date: main?.querySelector('time[datetime]')?.dateTime ?? '',
        hashtags: [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
        videoUrl: directVideoUrl.startsWith('http') ? directVideoUrl : '',
        thumbnailUrl: thumbnail,
      };
    }, reelUrl);

    if (isTikTok && !scraped.caption) throw new Error('TikTok caption was not found on the page');

    const captionDetails = parseCaptionDetails(scraped.caption || '');
    // The caption rule always wins over the in-page guess, which takes any first pin (even "📌 Details:").
    scraped.placeName = captionDetails.placeName;
    scraped.location = captionDetails.location;

    scraped.thumbnailUrl = normalizeImageUrl(scraped.thumbnailUrl);
    return res.status(200).json(scraped);
  } catch (error) {
    console.error('Reel DOM scrape failed:', error);
    return res.status(502).json({ error: `${platform} did not provide the video page data. Try again or enter the place details manually.` });
  } finally {
    if (owned) await closeBrowser(browser);
    else await closePage(page);
  }
};
