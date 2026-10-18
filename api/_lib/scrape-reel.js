const { openPage, closePage, closeBrowser, browserFor } = require('./browser');
const { fetchInstagramOembed } = require('./instagram-oembed');

// The video file and fonts are never read. Images are kept: the cover can come from an <img>.
const SKIP = ['media', 'font'];

function parseCount(value) {
  const match = String(value ?? '').trim().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return null;
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] ?? 1;
  return Math.round(Number(match[1]) * multiplier);
}

function isInstagramUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) &&
      /^\/(?:[^/]+\/)?(?:reels?|p)\/[^/]+\/?$/.test(url.pathname);
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

// Instagram's oEmbed: the caption and creator in one plain request, no browser.
// Returns null, so Chrome runs, when there's no caption to search with.
async function readInstagramQuickly(reelUrl) {
  let oembed;
  try {
    oembed = await fetchInstagramOembed(reelUrl);
  } catch (error) {
    console.warn('Instagram oEmbed failed, falling back to the browser:', error.message);
    return null;
  }
  if (!oembed.ok || !oembed.caption) return null;
  return {
    success: true,
    reelUrl,
    caption: oembed.caption,
    creator: oembed.creator,
    // oEmbed doesn't give counts or the date.
    likes: null,
    comments: null,
    // The AI reads the caption for the place (enrich-reel.js), so none is taken from it here.
    placeName: '',
    location: '',
    date: '',
    hashtags: [...oembed.caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
    videoUrl: '',
    // Reels show their platform's own embed, so no cover image is kept.
    thumbnailUrl: '',
    source: 'oembed',
  };
}

// The people tagged in the post ("3 people" on Instagram), which the page only shows after a tap but
// keeps in its data: {"position":[0,0],"user":{"full_name":"Ho Liao MELBOURNE",…,"username":"holiao.melbourne"}}.
// Only the first run of tags is read: tags of other posts on the page come later.
function taggedAccounts(html) {
  const tag = /\{"position":\[[^\]]*\],"user":\{[^{}]*?"username":"([\w.]+)"[^{}]*\}\}/g;
  const handles = [];
  let end = -1;
  for (const match of String(html || '').matchAll(tag)) {
    if (end >= 0 && match.index !== end + 1) break;
    handles.push(match[1].toLowerCase());
    end = match.index + match[0].length;
  }
  return [...new Set(handles)].slice(0, 10);
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
  // forceBrowser: the page is read even when oEmbed works, for what only the page shows (collab
  // posters and the location tag).
  if (!isTikTok && !req.body?.forceBrowser) {
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
      const captionElement = [...(main?.querySelectorAll('span') ?? [])]
        .filter((element) => element.querySelector('br') && element.innerText.trim().length > 40)
        .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      const caption = captionElement?.innerText.trim() ??
        document.querySelector('meta[property="og:description"]')?.content ?? '';

      const reservedPaths = new Set(['accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories']);
      const ownerLink = [...(main?.querySelectorAll('a[href]') ?? [])].find((link) => {
        const match = link.getAttribute('href').match(/^\/([^/?#]+)\/$/);
        return match && !reservedPaths.has(match[1]);
      });
      const creator = ownerLink?.getAttribute('href').match(/^\/([^/]+)\/$/)?.[1] ?? null;
      // A collab post names every poster at the top ("feedswithjen and sweetag.glenwaverley"): profile
      // links showing their own handle, above the caption (the comments below have links like that too).
      const collaborators = [...new Set([...(main?.querySelectorAll('a[href]') ?? [])]
        .filter((link) => !captionElement || (link.compareDocumentPosition(captionElement) & Node.DOCUMENT_POSITION_FOLLOWING))
        .map((link) => {
          const handle = link.getAttribute('href').match(/^\/([^/?#]+)\/$/)?.[1];
          return handle && !reservedPaths.has(handle) && link.innerText.trim() === handle ? handle : null;
        })
        .filter(Boolean))].slice(0, 3);
      // The post's location tag, e.g. "Glen Waverley, Victoria".
      const locationTag = main?.querySelector('a[href*="/explore/locations/"]')?.innerText.trim() ?? '';

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
      const thumbnail = video?.poster ||
        document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('meta[name="twitter:image"]')?.content || imageCandidates[0]?.currentSrc || '';

      return {
        success: true,
        reelUrl: inputUrl,
        caption,
        creator,
        collaborators,
        locationTag,
        likes: parseCount(countLabels[0]),
        comments: parseCount(countLabels[1]),
        // The AI reads the caption for the place (enrich-reel.js), so none is taken from it here.
        placeName: '',
        location: '',
        date: main?.querySelector('time[datetime]')?.dateTime ?? '',
        hashtags: [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
        videoUrl: directVideoUrl.startsWith('http') ? directVideoUrl : '',
        thumbnailUrl: thumbnail,
      };
    }, reelUrl);

    if (isTikTok && !scraped.caption) throw new Error('TikTok caption was not found on the page');
    if (!isTikTok) scraped.tagged = taggedAccounts(await page.content());


    // Reels show their platform's own embed, so no cover image is kept.
    scraped.thumbnailUrl = '';
    return res.status(200).json(scraped);
  } catch (error) {
    console.error('Reel DOM scrape failed:', error);
    return res.status(502).json({ error: `${platform} did not provide the video page data. Try again or enter the place details manually.` });
  } finally {
    if (owned) await closeBrowser(browser);
    else await closePage(page);
  }
};
