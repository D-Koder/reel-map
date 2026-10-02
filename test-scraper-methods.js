#!/usr/bin/env node
/**
 * Test two methods for scraping Instagram reels:
 * 1. Parse HTML metadata (fast, lightweight)
 * 2. Headless browser (Puppeteer - slower, more reliable)
 */

const https = require('https');
const puppeteer = require('puppeteer');

const TEST_URL = 'https://www.instagram.com/reel/DcQICfPx5TV/?stkn=MThsZGRndndyanp4YQ%3D%3D';

// ============================================================================
// METHOD 1: Parse HTML Metadata
// ============================================================================
async function scrapeWithHTMLMetadata() {
  console.log('\n🔍 METHOD 1: Parsing HTML Metadata\n');

  try {
    const html = await fetchPage(TEST_URL);

    // Try to extract JSON from <script> tags
    const jsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      console.log('✅ Found structured data (ld+json)');
      const data = JSON.parse(jsonMatch[1]);
      console.log('Data:', JSON.stringify(data, null, 2));
      return data;
    }

    // Try to extract from window.__data or sharedData
    const dataMatch = html.match(/window\.__data\s*=\s*({[\s\S]*?});<\/script>/);
    if (dataMatch) {
      console.log('✅ Found window.__data');
      const data = JSON.parse(dataMatch[1]);
      console.log('Data:', JSON.stringify(data, null, 2));
      return data;
    }

    // Try to extract from Instagram's initial state
    const instMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
    if (instMatch) {
      console.log('✅ Found universal data');
      const data = JSON.parse(instMatch[1]);
      console.log('Data keys:', Object.keys(data));
      return data;
    }

    // Fallback: look for any JSON data
    const allJsonMatches = html.match(/{[\s\S]{50,10000}}/g);
    if (allJsonMatches) {
      console.log(`✅ Found ${allJsonMatches.length} JSON blobs, trying to parse...`);

      for (let i = 0; i < Math.min(3, allJsonMatches.length); i++) {
        try {
          const parsed = JSON.parse(allJsonMatches[i]);
          if (parsed.graphql || parsed.media || parsed.caption) {
            console.log(`✅ Found useful JSON at position ${i}`);
            console.log('Data:', JSON.stringify(parsed, null, 2).substring(0, 500));
            return parsed;
          }
        } catch (e) {
          // Continue to next match
        }
      }
    }

    console.error('❌ Could not find any usable JSON metadata');
    return null;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

// ============================================================================
// METHOD 2: Headless Browser (Puppeteer)
// ============================================================================
async function scrapeWithHeadlessBrowser() {
  console.log('\n🌐 METHOD 2: Headless Browser (Puppeteer)\n');

  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set realistic User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    console.log('🔄 Navigating to page...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('✅ Page loaded\n');

    // Close the Instagram dialog using the accessible label as a stable reference.
    await page.waitForSelector('[aria-label="Close"]', { timeout: 10000 });
    await page.click('[aria-label="Close"]');
    console.log('✖️ Closed the Instagram dialog\n');

    // Extract data from semantic HTML and metadata, not Instagram's generated classes.
    const reelData = await page.evaluate((reelUrl) => {
      const data = {};
      const getMeta = (selector) => document.querySelector(selector)?.content || null;
      data.reelUrl = reelUrl;

      // Captions are usually rendered as text with line breaks and mention links.
      const captionCandidates = [...document.querySelectorAll('main span')]
        .filter((element) => element.querySelector('br') && element.innerText.trim().length > 40)
        .sort((a, b) => a.innerText.length - b.innerText.length);
      const caption = captionCandidates[0]?.innerText.trim();
      data.caption = caption || getMeta('meta[property="og:description"]');

      // Owner links are profile URLs; use the first one in the post's document order.
      const reservedPaths = new Set(['accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories']);
      const ownerLink = [...document.querySelectorAll('main a[href]')].find((link) => {
        const match = link.getAttribute('href').match(/^\/([^/?#]+)\/$/);
        return match && !reservedPaths.has(match[1]);
      });
      data.creator = ownerLink?.getAttribute('href').match(/^\/([^/]+)\/$/)?.[1] || null;
      const profileImage = [...document.querySelectorAll('img[alt]')].find((image) =>
        image.alt.toLowerCase().includes('profile picture') &&
        (!data.creator || image.alt.toLowerCase().startsWith(data.creator.toLowerCase()))
      );
      data.profileImageUrl = profileImage?.currentSrc || profileImage?.src || null;

      // The reel page URL is not the direct media URL. Instagram may omit the
      // direct URL or expose only a blob when playback is blocked.
      const video = document.querySelector('main video');
      const videoUrl = video?.currentSrc || video?.querySelector('source')?.src || video?.src;
      data.videoUrl = videoUrl?.startsWith('http') ? videoUrl : null;
      data.thumbnailUrl = video?.poster || getMeta('meta[property="og:image"]') ||
        getMeta('meta[name="twitter:image"]');
      data.playbackError = [...document.querySelectorAll('main span')]
        .some((element) => element.innerText.includes("trouble playing this video"));

      return data;
    }, TEST_URL);

    console.log('📝 Scraped data:');
    console.log(JSON.stringify(reelData, null, 2));

    console.log('\n⏸️  Browser window is open. Close it when done to exit.\n');
    // Browser stays open for inspection - user must close manually

    return reelData;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

// ============================================================================
// Helper: Fetch page HTML
// ============================================================================
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ============================================================================
// Main test
// ============================================================================
async function runTests() {
  console.log('🧪 Instagram Reel Scraper Test\n');
  console.log(`📍 Testing: ${TEST_URL}\n`);
  console.log('=' . repeat(60));

  // Test Method 1
  const metadata = await scrapeWithHTMLMetadata();

  // Test Method 2
  const browser = await scrapeWithHeadlessBrowser();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 RESULTS:\n');
  console.log(`Method 1 (HTML Metadata):  ${metadata ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Method 2 (Headless Browser): ${browser ? '✅ SUCCESS' : '❌ FAILED'}`);

  if (metadata) {
    console.log('\n📝 Method 1 extracted:', Object.keys(metadata));
  }
  if (browser) {
    console.log('\n📝 Method 2 extracted:', Object.keys(browser));
  }
}

runTests().catch(console.error);
