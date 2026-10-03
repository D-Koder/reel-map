#!/usr/bin/env node
// Open the failing Google Maps search in visible Chrome and leave it open for inspection.
const puppeteer = require('puppeteer');

const query = process.argv.slice(2).join(' ') || '@bourkiesbakehouse 1-3/115 High St, Woodend';
const isPlaceUrl = /^https:\/\/(?:www\.)?google\.com\/maps\/place\//i.test(query);
const mapsUrl = isPlaceUrl ? query : `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  console.log(`${isPlaceUrl ? 'Opening selected place' : 'Searching Google Maps'}: ${query}`);
  await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() =>
    document.querySelector('a[aria-label][href*="/maps/place/"]') ||
    (location.pathname.includes('/maps/place/') && document.querySelector('h1')) ||
    document.body?.innerText?.toLowerCase().includes('no results'),
  { timeout: 25000 }).catch(() => {});

  const state = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: document.body?.innerText?.slice(0, 1800) || '',
    results: [...document.querySelectorAll('a[aria-label][href*="/maps/place/"]')].slice(0, 8).map((link) => ({
      label: link.getAttribute('aria-label'),
      href: link.href,
    })),
  }));
  console.log('Search finished. Page remains open; inspect it, then close Chrome when done.');
  console.log(JSON.stringify(state, null, 2));

  await new Promise((resolve) => browser.once('disconnected', resolve));
}

main().catch((error) => {
  console.error('Visible Maps search failed:', error);
  process.exitCode = 1;
});
