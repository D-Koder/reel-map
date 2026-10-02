#!/usr/bin/env node
/** Test the scrape-reel Supabase Edge Function. */

const TEST_URL = 'https://www.instagram.com/reel/DcQICfPx5TV/?stkn=MThsZGRndndyanp4YQ==';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY to test the deployed function.');
  process.exit(1);
}

async function testScrapeReel() {
  const response = await fetch(`${supabaseUrl}/functions/v1/scrape-reel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ reelUrl: TEST_URL }),
  });
  const result = await response.json();
  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok || !result.success) process.exitCode = 1;
}

testScrapeReel().catch((error) => {
  console.error('Scrape request failed:', error.message);
  process.exitCode = 1;
});