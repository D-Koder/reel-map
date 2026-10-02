const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const placeName = typeof req.body?.placeName === 'string' ? req.body.placeName.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
  const query = [placeName, location].filter(Boolean).join(' ') || location || caption;
  if (!query) return res.status(400).json({ error: 'Provide a place name or address to search Google Maps' });

  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  let browser;
  try {
    const isVercel = Boolean(process.env.VERCEL);
    console.log(`[scrape-location] Search query: ${query}`);
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: isVercel ? await chromium.executablePath() : process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    const firstResultSelector = 'a[aria-label][href*="/maps/place/"]';
    await page.waitForFunction((selector) =>
      document.querySelector(selector) ||
      (location.pathname.includes('/maps/place/') && document.querySelector('h1')),
    { timeout: 25000 }, firstResultSelector).catch(() => {});
    const firstResult = await page.$(firstResultSelector);
    const alreadyOnPlaceDetails = !firstResult && await page.evaluate(() =>
      location.pathname.includes('/maps/place/') && Boolean(document.querySelector('h1'))
    );
    if (!firstResult && !alreadyOnPlaceDetails) {
      const pageState = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        text: document.body?.innerText?.slice(0, 800) || '',
        placeLinks: [...document.querySelectorAll('a[href*="/maps/place/"]')].slice(0, 5).map((link) => ({
          href: link.href,
          label: link.getAttribute('aria-label'),
          text: link.innerText,
        })),
      }));
      console.warn('[scrape-location] No result link; Maps page state:', JSON.stringify(pageState));
      console.warn(`[scrape-location] No Maps results found for: ${query}`);
      return res.status(404).json({ error: `No Google Maps results found for "${query}"`, query, mapsUrl });
    }

    if (firstResult) {
      const firstResultLabel = await firstResult.evaluate((element) => element.getAttribute('aria-label') || '');
      console.log(`[scrape-location] Clicking first result: ${firstResultLabel || '(unnamed result)'}`);
      await firstResult.click();
      await page.waitForFunction(() => {
        const title = document.querySelector('h1');
        return title?.textContent?.trim() && location.pathname.includes('/maps/place/');
      }, { timeout: 15000 });
    } else {
      // Google Maps can resolve a uniquely matching search directly to its first place page.
      console.log('[scrape-location] Google Maps routed directly to the matching first place result');
    }

    // Expand the complete weekly schedule using the control's accessible label.
    const hoursButton = await page.$('[aria-label*="Show open hours" i]');
    if (hoursButton) {
      console.log('[scrape-location] Expanding weekly opening hours');
      await hoursButton.evaluate((element) => {
        (element.closest('button,[role="button"]') || element).click();
      }).catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll('table tr').length >= 7, { timeout: 5000 })
        .catch(() => {});
      const hoursState = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('table tr')].map((row) => row.innerText),
        buttons: [...document.querySelectorAll('button')]
          .map((button) => ({ label: button.getAttribute('aria-label'), expanded: button.getAttribute('aria-expanded') }))
          .filter((button) => /hours/i.test(button.label || '')),
      }));
      console.log('[scrape-location] Hours expansion state:', JSON.stringify(hoursState));
    } else {
      const pageControls = await page.evaluate(() => [...document.querySelectorAll('button')]
        .map((button) => button.getAttribute('aria-label') || button.innerText)
        .filter((label) => /hours|open|closed/i.test(label)));
      console.log('[scrape-location] Weekly-hours expand control was not present; similar buttons:', pageControls);
    }

    const result = await page.evaluate(() => {
      const textOf = (element) => (element?.innerText || element?.textContent || '').trim();
      const panel = document.querySelector('[role="main"]') || document.querySelector('main') || document;
      const name = textOf(panel.querySelector('h1'));
      const subtitle = textOf(panel.querySelector('button[jsaction*="category"]')) ||
        [...panel.querySelectorAll('button')].map(textOf).find((text) =>
          /restaurant|cafe|bar|hotel|store|shop|museum|park|venue/i.test(text)
        ) || '';

      const addressButton = panel.querySelector('[data-item-id="address"]') ||
        panel.querySelector('button[aria-label^="Address:"]');
      const address = textOf(addressButton?.querySelector('.Io6YTe')) ||
        textOf(addressButton).replace(/^Address:\s*/i, '').replace(/\s*Copy address\s*$/i, '').trim();

      const phoneButton = panel.querySelector('[data-item-id^="phone:tel:"]') ||
        panel.querySelector('button[aria-label^="Phone:"]');
      const phone = textOf(phoneButton?.querySelector('.Io6YTe')) ||
        textOf(phoneButton).replace(/^Phone:\s*/i, '').replace(/\s*Copy phone number\s*$/i, '').trim();

      const hoursRows = [...panel.querySelectorAll('table tr')].map((row) => {
        const cells = [...row.querySelectorAll('th, td')].map(textOf).filter(Boolean);
        if (cells.length < 2) return null;
        return {
          days: cells[0].replace(/[\uE000-\uF8FF]/g, '').trim(),
          time: cells.slice(1).join(' ').replace(/[\uE000-\uF8FF]/g, '').trim(),
        };
      }).filter(Boolean);
      const uniqueHours = [...new Map(hoursRows.map((row) => [row.days, row])).values()];

      const mapLink = location.href;
      const coords = mapLink.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      return {
        name,
        subtitle,
        address,
        phone,
        hours: uniqueHours,
        mapsUrl: mapLink,
        latitude: coords ? Number(coords[1]) : null,
        longitude: coords ? Number(coords[2]) : null,
      };
    });

    const menu = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
        .map((tab) => (tab.innerText || tab.textContent || '').trim());
      const menuTab = [...document.querySelectorAll('[role="tab"]')]
        .find((tab) => /^menu$/i.test((tab.innerText || tab.textContent || '').trim()));
      if (!menuTab) return { opened: false, tabs };
      menuTab.click();
      return { opened: true, tabs };
    });
    console.log('[scrape-location] Menu tab state:', JSON.stringify(menu));
    if (menu.opened) {
      await page.waitForFunction(() => [...document.querySelectorAll('[role="region"]')]
        .some((region) => /^menu$/i.test(region.getAttribute('aria-label') || '')),
      { timeout: 7000 }).catch(() => {});
    }
    const menuDetails = await page.evaluate(() => {
      const menuRegion = [...document.querySelectorAll('[role="region"]')]
        .find((region) => /^menu$/i.test(region.getAttribute('aria-label') || ''));
      const links = [...(menuRegion?.querySelectorAll('a[href]') ?? [])];
      const menuLink = links.find((anchor) => {
        const text = `${anchor.innerText || ''} ${anchor.getAttribute('aria-label') || ''}`.trim();
        return /^menu(?:\s|$)/i.test(text) || /drive\.google\.com|menu/i.test(anchor.href);
      });
      return {
        url: menuLink?.href || '',
        text: (menuRegion?.innerText || '').trim(),
      };
    });
    result.menuUrl = menuDetails.url;
    result.menuText = menuDetails.text;

    if (!result.name) {
      return res.status(404).json({ error: `Google Maps first result did not open for "${query}"`, query, mapsUrl });
    }
    if (!result.address) {
      return res.status(422).json({ error: `Google Maps found "${result.name}" but did not provide an address`, query, mapsUrl: result.mapsUrl });
    }

    const output = { success: true, query, ...result };
    console.log('[scrape-location] Extracted place details:', JSON.stringify(output, null, 2));
    return res.status(200).json(output);
  } catch (error) {
    console.error('[scrape-location] Google Maps scrape failed:', error);
    return res.status(502).json({
      error: 'Could not retrieve place details from Google Maps. Try another search or enter the location manually.',
      details: error.message,
      query,
      mapsUrl,
    });
  } finally {
    await browser?.close().catch(() => {});
  }
};
