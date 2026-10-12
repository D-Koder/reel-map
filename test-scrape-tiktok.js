#!/usr/bin/env node
/** Smoke-test the TikTok branch of the custom Puppeteer scraper. */

const scrapeReel = require('./api/_lib/scrape-reel');
process.env.PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  require('puppeteer').executablePath();
const reelUrl = process.argv[2] || 'https://www.tiktok.com/@eatswithclaire/video/7543957031141657874';
const req = {
  method: 'POST',
  body: { reelUrl },
};
const res = {
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    console.log(`HTTP ${this.statusCode}`);
    console.log(JSON.stringify(body, null, 2));
    if (this.statusCode >= 400 || !body.success) process.exitCode = 1;
  },
};

scrapeReel(req, res).catch((error) => {
  console.error('TikTok scrape test failed:', error.message);
  process.exitCode = 1;
});
