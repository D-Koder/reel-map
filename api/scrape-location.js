const { requireUser } = require('./_lib/auth');
const { openPage, closePage, closeBrowser, browserFor } = require('./_lib/browser');
const { readCache, writeCache } = require('./_lib/lookup-cache');

// How long a place's saved details are reused. Kept long while there are few users; opening hours and
// phone numbers can change, so lower it as the app grows.
const PLACE_CACHE_DAYS = 100;

// Maps results are read as text, so images (map tiles, photos), video and fonts are skipped.
const SKIP = ['image', 'media', 'font'];
// Also skipped: the map's tiles (fetched as data, not images), and Google's logging and ads. None of it
// is read, and the tiles are most of what a Maps page downloads.
const SKIP_URLS = [
  /\/maps\/vt[/?]/, /\/maps\/preview\/log/, /\/gen_204/, /\/log\?/, /play\.google\.com\/log/,
  /doubleclick\.net/, /googlesyndication\.com/, /googleadservices\.com/, /google-analytics\.com/,
];

// Google answers in the server's language (English) unless asked, so 裕興記 comes back as "Yuxing Ji",
// which no name check can match. A search written in Chinese, Japanese or Korean asks for that language.
// A place's details stay in English, so the saved address reads "830 Weihai Rd, Jing'an, Shanghai".
function mapsLanguage(text) {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Han}/u.test(text)) return 'zh-CN';
  return '';
}

module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const placeName = typeof req.body?.placeName === 'string' ? req.body.placeName.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
  const action = req.body?.action;
  const providedQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const query = (['search', 'details'].includes(action) && providedQuery) ||
    [location, placeName].filter(Boolean).join(' ') || caption;
  if (!query) return res.status(400).json({ error: 'Provide a place name or address to search Google Maps' });

  const language = action === 'details' ? '' : mapsLanguage(`${query} ${placeName}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${language ? `&hl=${language}` : ''}`;
  let selectedPlaceUrl = '';
  let selectedPlaceSlug = '';
  let selectedPlaceCoordinates = null;
  if (action === 'details') {
    try {
      const candidateUrl = new URL(req.body?.placeUrl);
      if (candidateUrl.protocol !== 'https:' || !['google.com', 'www.google.com'].includes(candidateUrl.hostname) ||
          !candidateUrl.pathname.startsWith('/maps/place/')) {
        return res.status(400).json({ error: 'Choose a valid Google Maps place result' });
      }
      candidateUrl.searchParams.set('hl', 'en');
      selectedPlaceUrl = candidateUrl.href;
      selectedPlaceSlug = decodeURIComponent(candidateUrl.pathname.split('/')[3] || '').replace(/\+/g, ' ');
      selectedPlaceCoordinates = candidateUrl.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    } catch {
      return res.status(400).json({ error: 'Choose a valid Google Maps place result' });
    }
    // A place's details are shared by everyone who picks it (table place_lookups, keyed by its link).
    const cached = await readCache('place_lookups', selectedPlaceUrl, PLACE_CACHE_DAYS);
    if (cached?.data) return res.status(200).json(cached.data);
  }
  let browser;
  let owned = false;
  let page;
  try {
    console.log(`[scrape-location] Search query: ${query}`);
    ({ browser, owned } = await browserFor(req));
    page = await openPage(browser, SKIP, SKIP_URLS);
    await page.goto(action === 'details' ? selectedPlaceUrl : mapsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });

    const firstResultSelector = 'a[aria-label][href*="/maps/place/"]';
    if (action === 'search') {
      await page.waitForFunction((selector) => document.querySelector(selector) ||
        (location.pathname.includes('/maps/place/') && document.querySelector('h1')),
        { timeout: 25000 }, firstResultSelector).catch(() => {});
      const directCandidate = await page.evaluate(() => {
        const name = document.querySelector('h1')?.textContent?.trim();
        return location.pathname.includes('/maps/place/') && name
          ? {
            name,
            url: location.href,
            address: (() => {
              const addressButton = document.querySelector('[data-item-id="address"]') ||
                document.querySelector('button[aria-label^="Address:"]');
              return (addressButton?.querySelector('.Io6YTe')?.innerText || addressButton?.innerText || '')
                .replace(/^Address:\s*/i, '').replace(/\s*Copy address\s*$/i, '').trim();
            })(),
            category: '',
            rating: '',
            summary: '',
          }
          : null;
      });
      const candidates = directCandidate ? [directCandidate] : await page.$$eval(firstResultSelector, (anchors) => {
        const seen = new Set();
        return anchors.flatMap((anchor) => {
          const url = anchor.href;
          const name = (anchor.getAttribute('aria-label') || anchor.innerText || '').trim();
          if (!url || !name || seen.has(url)) return [];
          seen.add(url);

          let card = anchor.closest('[role="article"]');
          if (!card) {
            let parent = anchor.parentElement;
            for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
              const text = (parent.innerText || '').trim();
              if (text.includes(name) && text.length > name.length && text.length < 700) {
                card = parent;
                break;
              }
            }
          }
          const lines = (card?.innerText || anchor.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
          const summary = [...new Set(lines.filter((line) => line !== name))].slice(0, 5).join(' · ');
          // An address has a number and a street word: "830 Weihai Rd", or in Chinese, Japanese or Korean a
          // number with 号/番地/丁目/번지 or after a street (威海路830号, 松涛街1088号, 神南1-2-3, 세종대로 110).
          const parts = lines.flatMap((line) => line.split('·').map((part) => part.trim()));
          const address = parts.find((line) => /\d/.test(line) &&
            (/\b(?:street|st|road|rd|avenue|ave|highway|hwy|drive|dr|lane|ln|court|ct|way|place|pl|alley|arcade|parade|pde|boulevard|blvd|crescent|cres|terrace|tce|square|sq|walk|esplanade|esp|grove|gr|close|circuit|cct|mall|laneway|row)\b/i.test(line) ||
              /\d\s*(?:号|號|番地?|丁目|번지|번길)|(?:路|街|道|巷|弄|里|町|로|길)\s*\d|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\d+-\d+/u.test(line))) || '';
          const category = lines.find((line) => line.includes('·'))?.split('·')[0].trim() || '';
          // "4.6" on its own line, or "4.6(153)" with the review count.
          const rating = parts.map((part) => part.match(/^([1-5](?:\.\d)?)(?:\s*\([\d,]+\))?$/)?.[1]).find(Boolean) || '';
          return [{ name, url, address, category, rating, summary }];
        }).slice(0, 5);
      });

      if (candidates.length === 0) {
        const pageState = await page.evaluate(() => ({
          title: document.title,
          url: location.href,
          text: document.body?.innerText?.slice(0, 800) || '',
        }));
        console.warn('[scrape-location] No result links; Maps page state:', JSON.stringify(pageState));
        return res.status(404).json({
          error: `No Google Maps results found for "${query}"`, query, mapsUrl,
          page: { title: pageState.title, url: pageState.url, text: pageState.text.slice(0, 300) },
        });
      }

      return res.status(200).json({ success: true, query, candidates });
    }

    if (action === 'details') {
      const normalize = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      // The selected place URL was opened directly, so a loaded place page is the match.
      await page.waitForFunction(() => location.pathname.includes('/maps/place/') &&
        document.querySelector('h1')?.textContent?.trim(), { timeout: 15000 }).catch(() => {});
      const onPlacePage = await page.evaluate(() =>
        location.pathname.includes('/maps/place/') && Boolean(document.querySelector('h1')?.textContent?.trim())
      );

      if (!onPlacePage) {
        await page.waitForFunction((selector) => document.querySelector(selector),
          { timeout: 25000 }, firstResultSelector);
        const resultLinks = await page.$$(firstResultSelector);
        let selectedResult = null;
        for (const resultLink of resultLinks) {
          const candidate = await resultLink.evaluate((anchor) => ({
            name: anchor.getAttribute('aria-label') || anchor.innerText || '',
            slug: decodeURIComponent(new URL(anchor.href).pathname.split('/')[3] || '').replace(/\+/g, ' '),
          }));
          if (normalize(candidate.name) === normalize(placeName) || normalize(candidate.slug) === normalize(selectedPlaceSlug)) {
            selectedResult = resultLink;
            break;
          }
        }
        if (!selectedResult) {
          return res.status(404).json({ error: `Selected place "${placeName || selectedPlaceSlug}" was not in the search results`, query, mapsUrl });
        }
        await selectedResult.click();
      }
      await page.waitForFunction(() => document.querySelector('h1')?.textContent?.trim() &&
        location.pathname.includes('/maps/place/'), { timeout: 15000 });
    } else {
      await page.waitForFunction((selector) =>
        document.querySelector(selector) ||
        (location.pathname.includes('/maps/place/') && document.querySelector('h1')),
      { timeout: 25000 }, firstResultSelector).catch(() => {});
    }
    const firstResult = action === 'details' ? null : await page.$(firstResultSelector);
    const alreadyOnPlaceDetails = action === 'details' || (!firstResult && await page.evaluate(() =>
      location.pathname.includes('/maps/place/') && Boolean(document.querySelector('h1'))
    ));
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

    const result = await page.evaluate(() => {
      const textOf = (element) => (element?.innerText || element?.textContent || '').trim();
      const panel = document.querySelector('[role="main"]') || document.querySelector('main') || document;
      // Some places have a section heading (e.g. "Hours") ahead of the name, so skip generic headings.
      const headings = [...panel.querySelectorAll('h1'), ...document.querySelectorAll('h1')].map(textOf).filter(Boolean);
      // The page title ("Frenchie - Google Maps") is the fallback when the name heading is empty.
      const name = headings.find((text) => !/^(hours|menu|reviews|about|photos|overview)$/i.test(text)) ||
        document.title.replace(/\s+-\s+Google Maps$/i, '').trim();
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

      const mapLink = location.href;
      const coords = mapLink.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const links = [...panel.querySelectorAll('a[href]')].map((anchor) => ({
        href: anchor.href,
        label: `${textOf(anchor)} ${anchor.getAttribute('aria-label') || ''} ${anchor.title || ''}`.trim(),
      }));
      const validLink = (href) => {
        try {
          const url = new URL(href);
          return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
          return '';
        }
      };
      const authority = panel.querySelector('[data-item-id="authority"]');
      const websiteControl = authority || [...panel.querySelectorAll('button,a')].find((element) =>
        /website|official site/i.test(`${element.getAttribute('aria-label') || ''} ${element.title || ''} ${textOf(element)}`)
      );
      const websiteLabel = `${websiteControl?.getAttribute('aria-label') || ''} ${textOf(websiteControl)}`;
      const labelUrl = websiteLabel.match(/https?:\/\/[^\s]+|(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/[^\s]*)?/i)?.[0];
      const websiteUrl = validLink(websiteControl?.href || websiteControl?.querySelector('a[href]')?.href ||
        websiteControl?.getAttribute('data-url') || websiteControl?.getAttribute('data-href') ||
        (labelUrl ? (/^https?:\/\//i.test(labelUrl) ? labelUrl : `https://${labelUrl}`) : '') ||
        links.find((link) => /website|official site/i.test(link.label))?.href || '');
      const bookingUrl = validLink(links.find((link) =>
        /reserve|reservation|find a table|book(?:ing)?\s*(?:a\s*)?table|table booking/i.test(link.label)
      )?.href || '');
      return {
        name,
        subtitle,
        address,
        phone,
        hours: [],
        websiteUrl,
        bookingUrl,
        mapsUrl: mapLink,
        latitude: coords ? Number(coords[1]) : null,
        longitude: coords ? Number(coords[2]) : null,
      };
    });

    if (action === 'details') {
      if (!result.address) result.address = req.body?.placeAddress || location;
      // Keep the name the post and the results list use (裕兴记) rather than Google's English one (Yuxing Ji).
      const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
      if (cjk.test(placeName) && !cjk.test(result.name)) result.name = placeName;
      if (selectedPlaceCoordinates) {
        result.latitude = Number(selectedPlaceCoordinates[1]);
        result.longitude = Number(selectedPlaceCoordinates[2]);
      }
    }

    // Hours are read first, on the page as it loaded. The menu tab changes the page, so it's opened
    // last: reading hours after it used to mean loading the whole place page a second time.
    const hoursOpened = await page.evaluate(() => {
      const textOf = (element) => (element?.innerText || element?.textContent || '').trim();
      const controls = [...document.querySelectorAll('button,[role="button"]')];
      const control = controls.find((element) => /see more hours|show open hours|opening hours/i.test(
        `${element.getAttribute('aria-label') || ''} ${textOf(element)}`
      )) || controls.find((element) => /hours/i.test(element.getAttribute('aria-label') || ''));
      if (!control) {
        return {
          clicked: false,
          expanded: false,
          candidates: controls.map((element) => `${element.getAttribute('aria-label') || ''} ${textOf(element)}`.trim())
            .filter((label) => /hour|open|closed/i.test(label)).slice(0, 8),
        };
      }
      const label = `${control.getAttribute('aria-label') || ''} ${textOf(control)}`.trim();
      control.click();
      return { clicked: true, expanded: control.getAttribute('aria-expanded') === 'true', label };
    });
    if (hoursOpened.clicked) {
      await page.waitForFunction(() => {
        const rows = [...document.querySelectorAll('table tr,[role="row"]')];
        return rows.some((row) => /mon|tue|wed|thu|fri|sat|sun/i.test(row.innerText || row.textContent || '') &&
          /\d/.test(row.innerText || row.textContent || ''));
      }, { timeout: 9000 }).catch(() => {});
    }
    result.hours = await page.evaluate(() => {
      const textOf = (element) => (element?.innerText || element?.textContent || '').trim();
      const rows = [...document.querySelectorAll('table tr,[role="row"]')].map((row) => {
        const cells = [...row.querySelectorAll('th,td,[role="cell"],[role="columnheader"]')].map(textOf).filter(Boolean);
        if (cells.length < 2 || !/mon|tue|wed|thu|fri|sat|sun/i.test(cells[0])) return null;
        return {
          days: cells[0].replace(/[\uE000-\uF8FF]/g, '').trim(),
          time: cells.slice(1).join(' ').replace(/[\uE000-\uF8FF]/g, '').trim(),
        };
      }).filter(Boolean);
      // Maps lists each section after the place's own hours (e.g. the Kitchen). Keep the first full week only.
      const week = [];
      for (const row of rows) {
        if (week.some((existing) => existing.days === row.days)) break;
        week.push(row);
      }
      return week;
    });
    console.log('[scrape-location] Hours dropdown state:', JSON.stringify({ ...hoursOpened, pageUrl: page.url(), rows: result.hours }));

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
    if (!result.address && action !== 'details') {
      return res.status(422).json({ error: `Google Maps found "${result.name}" but did not provide an address`, query, mapsUrl: result.mapsUrl });
    }

    const output = { success: true, query, ...result };
    console.log('[scrape-location] Extracted place details:', JSON.stringify(output, null, 2));
    if (action === 'details') await writeCache('place_lookups', selectedPlaceUrl, output);
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
    if (owned) await closeBrowser(browser);
    else await closePage(page);
  }
}, { endpoint: 'scrape-location', perHour: 150 });
