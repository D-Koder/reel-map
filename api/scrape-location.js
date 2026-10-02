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

  // Always search with full caption for better results
  const searchQuery = caption || location;

  let browser;
  try {
    const isVercel = Boolean(process.env.VERCEL);
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: isVercel
        ? await chromium.executablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: false,
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

      // Extract name - look for h2 or h3
      let name = '';
      const nameEl = resultCard.querySelector('h2') || resultCard.querySelector('h3');
      if (nameEl) {
        name = nameEl.textContent?.trim() || '';
      }

      // Extract all text content and split by lines
      const allText = resultCard.innerText || resultCard.textContent || '';
      const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      // Name is usually the first line if not found by h2/h3
      if (!name && lines.length > 0) {
        name = lines[0];
      }

      // Look for address and hours - check each line
      let address = '';
      let hours = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Address pattern: contains numbers and street keywords, or state codes, or postcodes
        if ((line.match(/\d+/) && line.match(/St|Ave|Rd|Lane|Terr|Court|Crescent|Road|Street/i)) ||
            line.match(/VIC|NSW|QLD|WA|SA|ACT|NT/) ||
            line.match(/\d{4}\s*$/) ||
            line.match(/^\d{4}\s/)) {
          address = line;
          break;
        }
      }

      // Hours: look for "Closed", "Open" patterns, typically after address
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.match(/closed|open|am|pm/i) && line !== name && line !== address) {
          hours = line;
          break;
        }
      }

      // Try to get coordinates from href
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
        name: name || 'Unknown Place',
        address: address || 'Address not found',
        hours: hours || '',
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
      name: result.name,
      address: result.address,
      hours: result.hours,
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
