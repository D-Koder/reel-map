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

  // Search with caption but remove emojis and clean up
  let searchQuery = location || caption;
  if (searchQuery === caption) {
    // Remove all emojis and clean up hashtags
    searchQuery = caption
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/#[\w]+/g, '') // Remove hashtags
      .trim();
  }

  let browser;
  try {
    const isVercel = Boolean(process.env.VERCEL);
    console.log(`[scrape-location] Starting browser launch for query: ${searchQuery}`);
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: isVercel
        ? await chromium.executablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
    });
    console.log('[scrape-location] Browser launched successfully');

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Navigate to Google Maps search
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    console.log(`[scrape-location] Navigating to: ${mapsUrl}`);
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(err => {
      console.log('[scrape-location] Page timeout, continuing with partial load:', err.message);
    });
    console.log('[scrape-location] Page load attempted');

    // Wait for search results to load (max 5 seconds)
    console.log('[scrape-location] Waiting for results to load...');
    await page.waitForFunction(() => {
      // Try multiple selectors to find the result container
      const selector1 = document.querySelectorAll('[role="region"] [role="button"]');
      const selector2 = document.querySelectorAll('div[data-msa-name]');
      const selector3 = document.querySelectorAll('div[data-result-index]');
      return selector1.length > 0 || selector2.length > 0 || selector3.length > 0;
    }, { timeout: 5000 }).catch(() => {
      console.log('[scrape-location] Results wait timeout, continuing anyway');
    });

    // Click the hours dropdown to expand full hours if it exists
    await page.evaluate(() => {
      // Look for the hours/opening times section with expand button
      const hoursButtons = Array.from(document.querySelectorAll('[role="button"]')).filter(btn =>
        btn.textContent?.match(/closed|open|am|pm|hours/i)
      );
      if (hoursButtons.length > 0) {
        hoursButtons[0].click();
      }
    }).catch(() => {});

    // Wait a bit for hours to expand
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await page.evaluate(() => {
      // Try multiple strategies to find the result card
      let resultCard = document.querySelector('[role="region"] [role="button"]');

      if (!resultCard) {
        // Fallback: look for data attributes
        resultCard = document.querySelector('div[data-result-index="0"]');
      }

      if (!resultCard) {
        // Fallback: look for the first prominent div with text
        const mainRegion = document.querySelector('[role="region"]');
        if (mainRegion) {
          resultCard = mainRegion.querySelector('[role="button"]');
        }
      }

      if (!resultCard) return null;

      // Get all text content and split by lines
      const allText = resultCard.innerText || resultCard.textContent || '';
      const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      console.log('[scrape-location] Extracted lines:', lines.length);
      console.log('[scrape-location] First 10 lines:', lines.slice(0, 10));

      // Extract name - first line that's not a rating or special marker
      let name = '';
      for (const line of lines) {
        if (!line.match(/★|⭐|reviews?|rating|[0-9]+\.[0-9]\s*★|opened|closed|open/i) && line.length > 2) {
          name = line;
          break;
        }
      }

      // Extract address - look for street patterns or state codes (must have multiple words)
      let address = '';
      for (const line of lines) {
        const hasNumber = line.match(/^\d+\s+\w/);  // Starts with number + word (street)
        const hasState = line.match(/\bVIC\b|\bNSW\b|\bQLD\b|\bWA\b|\bSA\b|\bACT\b|\bNT\b/);  // State
        const hasPostcode = line.match(/\b\d{4}\b/);  // Postcode
        const hasComma = line.includes(',');  // Address has comma

        if ((hasNumber || hasState || (hasPostcode && hasComma)) && line.length > 5) {
          address = line;
          break;
        }
      }

      // Extract hours - collect day names + times
      const hoursLines = [];
      for (const line of lines) {
        if (line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i) ||
            line.match(/^(Closed|Open|Opens|Closes)/i) ||
            line.match(/\d{1,2}:\d{2}\s*[ap]\.?m/i)) {
          hoursLines.push(line);
        }
      }

      let hours = hoursLines.join(' | ');

      // Get coordinates from href
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
        name: name || 'Unknown',
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

    console.log('[scrape-location] Extracted result:', {
      name: result.name,
      address: result.address,
      hours: result.hours,
      latitude: result.latitude,
      longitude: result.longitude
    });

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
