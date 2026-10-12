const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function launchBrowser() {
  const isVercel = Boolean(process.env.VERCEL);
  return (async () => puppeteer.launch({
    args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
    executablePath: isVercel ? await chromium.executablePath() : process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: process.env.REEL_ENRICHMENT_VISIBLE !== '1',
  }))();
}

// A new tab that skips downloads the scraper never reads, e.g. ['image', 'media', 'font'].
// Pages load faster and use less memory, which is what Vercel bills for.
// Stylesheets are kept: clicking an element needs the page laid out.
async function openPage(browser, skip = []) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  if (skip.length) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.isInterceptResolutionHandled()) return;
      if (skip.includes(request.resourceType())) request.abort().catch(() => {});
      else request.continue().catch(() => {});
    });
  }
  return page;
}

// Closes a browser, or keeps it open for the visible test tools (REEL_ENRICHMENT_VISIBLE=1).
async function closeBrowser(browser) {
  if (!browser) return;
  if (process.env.REEL_ENRICHMENT_VISIBLE === '1') {
    globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__ ??= [];
    globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__.push(browser);
    return;
  }
  await browser.close().catch(() => {});
}

// Closes a tab from a shared browser. The visible test tools keep it open to look at.
async function closePage(page) {
  if (page && process.env.REEL_ENRICHMENT_VISIBLE !== '1') await page.close().catch(() => {});
}

// The browser for one request: req.getBrowser() when a caller shares one Chrome across
// several steps (see enrich-reel.js), else a new one this handler must close itself.
async function browserFor(req) {
  if (typeof req.getBrowser === 'function') return { browser: await req.getBrowser(), owned: false };
  return { browser: await launchBrowser(), owned: true };
}

module.exports = { launchBrowser, openPage, closePage, closeBrowser, browserFor };
