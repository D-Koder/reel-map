const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// On Vercel, Chrome is unpacked to /tmp once per server. One server can run several lookups at once,
// and chromium.executablePath() hands back a half-written file while another lookup is still
// unpacking it, so Chrome fails to start with "spawn ETXTBSY". Every lookup waits on the same unpack.
let unpacking = null;
const executablePath = () => {
  unpacking ??= chromium.executablePath().catch((error) => { unpacking = null; throw error; });
  return unpacking;
};

async function launchBrowser() {
  const isVercel = Boolean(process.env.VERCEL);
  const launch = async () => puppeteer.launch({
    args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
    executablePath: isVercel ? await executablePath() : process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: process.env.REEL_ENRICHMENT_VISIBLE !== '1',
  });
  try {
    return await launch();
  } catch (error) {
    // Another process (an earlier server on the same machine) may still be writing the file: try once more.
    if (!/ETXTBSY/.test(error.message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return launch();
  }
}

// Tabs already handed out, so two steps never share Chrome's starting tab.
const claimed = new WeakSet();

// A tab that skips downloads the scraper never reads, e.g. ['image', 'media', 'font'].
// Pages load faster and use less memory, which is what Vercel bills for.
// Stylesheets are kept: clicking an element needs the page laid out.
// Chrome starts with one empty tab; the first step uses it instead of opening a second one.
async function openPage(browser, skip = []) {
  const blank = (await browser.pages()).find((tab) => tab.url() === 'about:blank' && !claimed.has(tab));
  const page = blank ?? await browser.newPage();
  claimed.add(page);
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
