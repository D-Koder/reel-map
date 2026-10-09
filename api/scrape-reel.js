const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

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

function parseCaptionLocation(caption) {
  const line = caption.split(/\r?\n/).find((text) => /^\s*[📍📌]/u.test(text))
    ?.replace(/^\s*[📍📌]\s*/u, '').trim() ?? '';
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  if (!isInstagramUrl(reelUrl)) {
    return res.status(400).json({ error: 'Enter a valid Instagram link (reel or post)' });
  }

  let browser;
  try {
    const isVercel = Boolean(process.env.VERCEL);
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: isVercel
        ? await chromium.executablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: process.env.REEL_ENRICHMENT_VISIBLE !== '1',
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('main', { timeout: 12000 });
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && (main.querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]') ||
        main.querySelector('meta[property="og:image"]'));
    }, { timeout: 12000 }).catch(() => {});

    const scraped = await page.evaluate((inputUrl) => {
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

    const captionDetails = parseCaptionDetails(scraped.caption || '');
    if (captionDetails.placeName) scraped.placeName = captionDetails.placeName;
    if (captionDetails.location) scraped.location = captionDetails.location;

    scraped.thumbnailUrl = normalizeImageUrl(scraped.thumbnailUrl);
    return res.status(200).json(scraped);
  } catch (error) {
    console.error('Reel DOM scrape failed:', error);
    return res.status(502).json({ error: 'Instagram did not provide the Reel page data. Try again or enter the place details manually.' });
  } finally {
    if (process.env.REEL_ENRICHMENT_VISIBLE === '1' && browser) {
      globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__ ??= [];
      globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__.push(browser);
    } else {
      await browser?.close().catch(() => {});
    }
  }
};