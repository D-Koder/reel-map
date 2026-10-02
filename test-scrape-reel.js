#!/usr/bin/env node
/** Smoke-test the local custom Puppeteer scraper. */

const scrapeReel = require('./api/scrape-reel');
process.env.PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  require('puppeteer').executablePath();
const req = {
  method: 'POST',
  body: { reelUrl: 'https://www.instagram.com/reel/DcQICfPx5TV/?stkn=MThsZGRndndyanp4YQ==' },
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
  console.error('Scrape test failed:', error.message);
  process.exitCode = 1;
});
