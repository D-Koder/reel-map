const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';

  if (!caption && !location) {
    return res.status(400).json({ error: 'Provide caption or location text' });
  }

  const searchQuery = location || caption;

  let browser;
  try {
    const isVercel = Boolean(process.env.VERCEL);
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: isVercel
        ? await chromium.executablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Navigate to Google Maps search
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 25000 });

    // Wait for search results to load
    await page.waitForFunction(() => {
      const results = document.querySelectorAll('[role="region"] [role="button"]');
      return results.length > 0;
    }, { timeout: 10000 }).catch(() => {});

    const result = await page.evaluate(() => {
      // Find the first result card
      const resultCard = document.querySelector('[role="region"] [role="button"]');
      if (!resultCard) return null;

      const nameEl = resultCard.querySelector('[class*="fontHeadlineSmall"]') || resultCard.querySelector('h3') || resultCard;
      const name = nameEl?.textContent?.trim() || '';

      // Try to extract rating/reviews
      const ratingEl = resultCard.querySelector('[class*="fontBodySmall"]');
      const rating = ratingEl?.textContent?.trim() || '';

      // Try to get coordinates from data attributes or URL
      const link = resultCard.closest('a') || resultCard;
      const href = link?.getAttribute('href') || '';

      let lat = null;
      let lng = null;
      const coordMatch = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
      }

      return {
        name: name || searchQuery,
        rating,
        link: href || null,
        latitude: lat,
        longitude: lng
      };
    });

    if (!result) {
      return res.status(404).json({
        error: 'No location found on Google Maps',
        query: searchQuery
      });
    }

    return res.status(200).json({
      success: true,
      query: searchQuery,
      location: result.name,
      rating: result.rating || null,
      latitude: result.latitude,
      longitude: result.longitude,
      mapsUrl
    });
  } catch (error) {
    console.error('Google Maps scrape failed:', error);
    return res.status(502).json({
      error: 'Could not fetch location from Google Maps. Try entering location manually.',
      details: error.message
    });
  } finally {
    await browser?.close().catch(() => {});
  }
};
