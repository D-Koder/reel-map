#!/usr/bin/env node
/** Print Instagram Reel data and matching Google Maps details as one JSON document. */

const puppeteer = require('puppeteer');
const enrichReel = require('./api/enrich-reel');

process.env.PUPPETEER_EXECUTABLE_PATH ||= puppeteer.executablePath();

const args = process.argv.slice(2);
const placeArg = args.indexOf('--place');
const requestedPlace = placeArg >= 0 ? args[placeArg + 1] : undefined;
const reelUrls = args.filter((arg, index) => arg.startsWith('https://') && (placeArg < 0 || index !== placeArg + 1));

if (!reelUrls.length) {
  console.error('Usage: node test-reel-enrichment.js <instagram-reel-url> [more-reel-urls] [--place "Google Maps place name"]');
  process.exit(2);
}

function invoke(url) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    enrichReel({ method: 'POST', body: { reelUrl: url, placeName: requestedPlace } }, response)
      .catch(reject);
  });
}

(async () => {
  const results = [];
  for (const reelUrl of reelUrls) {
    const response = await invoke(reelUrl);
    results.push({ httpStatus: response.status, ...response.body });
  }
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  if (results.some((result) => result.httpStatus >= 400 || !result.success)) process.exitCode = 1;
})().catch((error) => {
  console.error(`Reel enrichment test failed: ${error.message}`);
  process.exitCode = 1;
});