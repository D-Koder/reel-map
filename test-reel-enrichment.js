#!/usr/bin/env node
/** Print Instagram Reel data and matching Google Maps details as one JSON document. */

const puppeteer = require('puppeteer');
const enrichReel = require('./api/enrich-reel');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

process.env.PUPPETEER_EXECUTABLE_PATH ||= puppeteer.executablePath();
process.env.REEL_ENRICHMENT_VISIBLE = '1';
globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__ = [];

const args = process.argv.slice(2);
const placeArg = args.indexOf('--place');
const requestedPlace = placeArg >= 0 ? args[placeArg + 1] : undefined;
const reelUrls = args.filter((arg, index) => arg.startsWith('https://') && (placeArg < 0 || index !== placeArg + 1));

if (!reelUrls.length) {
  console.error('Usage: node test-reel-enrichment.js <instagram-reel-url> [more-reel-urls] [--place "Google Maps place name"]');
  process.exit(2);
}

async function chooseCandidate(candidates) {
  if (!candidates.length) {
    console.log('\nNo Google Maps results to choose.');
    return null;
  }
  if (candidates.length === 1) return candidates[0];

  console.log('\nGoogle Maps results:');
  candidates.forEach((candidate, index) => {
    console.log(`${index + 1}. ${candidate.name}${candidate.address ? ` — ${candidate.address}` : ''}`);
  });

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await prompt.question('Enter result number to open in Maps: ');
      const selectedIndex = Number.parseInt(answer, 10) - 1;
      if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < candidates.length) {
        return candidates[selectedIndex];
      }
      console.log(`Enter a number from 1 to ${candidates.length}.`);
    }
  } finally {
    prompt.close();
  }
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
    enrichReel({
      method: 'POST',
      body: { reelUrl: url, placeName: requestedPlace },
      ...(!requestedPlace && { selectCandidate: chooseCandidate }),
    }, response)
      .catch(reject);
  });
}

async function keepBrowsersOpen() {
  const browsers = globalThis.__REEL_ENRICHMENT_TEST_BROWSERS__;
  if (!browsers.length) return;

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    await prompt.question('Browser windows are open. Press Enter to close them and exit.');
  } finally {
    prompt.close();
    await Promise.all(browsers.map((browser) => browser.close().catch(() => {})));
  }
}

(async () => {
  try {
    const results = [];
    for (const reelUrl of reelUrls) {
      const response = await invoke(reelUrl);
      results.push({ httpStatus: response.status, ...response.body });
    }
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    if (results.some((result) => result.httpStatus >= 400 || !result.success || !result.maps?.success)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Reel enrichment test failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await keepBrowsersOpen();
  }
})();