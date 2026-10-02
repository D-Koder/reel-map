#!/usr/bin/env node
/**
 * Complete Apify integration test
 * Tests direct API calls (no edge function)
 */

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const ACTOR_ID = 'apify~instagram-reel-scraper';
const TEST_URL = 'https://www.instagram.com/reel/DcQICfPx5TV/?stkn=MThsZGRndndyanp4YQ==';

if (!APIFY_API_KEY) {
  console.error('❌ Missing APIFY_API_KEY environment variable');
  process.exit(1);
}

console.log('🧪 Testing Apify API directly\n');
console.log(`📍 Actor: ${ACTOR_ID}`);
console.log(`🔗 URL: ${TEST_URL}\n`);

async function testApify() {
  try {
    // Step 1: Start actor run
    console.log('📤 Starting actor run...');
    const runResponse = await fetch(`https://api.apify.com/v2/actors/${ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: [TEST_URL]
      })
    });

    console.log(`📡 Run response status: ${runResponse.status}`);

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error(`❌ Run failed: ${errorText}`);
      return;
    }

    const runData = await runResponse.json();
    console.log('✅ Run started\n');
    console.log('Run data:', JSON.stringify(runData, null, 2));

    const datasetId = runData.data?.defaultDatasetId;
    if (!datasetId) {
      console.error('❌ No dataset ID in response');
      return;
    }

    console.log(`\n📊 Dataset ID: ${datasetId}`);

    // Step 2: Poll for results
    console.log('\n⏳ Polling for results (max 60 seconds)...');
    let items = [];
    for (let i = 0; i < 60; i++) {
      const datasetResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${APIFY_API_KEY}`
          }
        }
      );

      if (datasetResponse.ok) {
        items = await datasetResponse.json();
        if (items.length > 0) {
          console.log(`✅ Got results after ${i + 1} seconds\n`);
          break;
        }
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  ⏱️  ${i + 1}s...`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (items.length === 0) {
      console.error('❌ No items found in dataset');
      return;
    }

    const reel = items[0];
    console.log('📝 Scraped data:');
    console.log(`  Caption: ${reel.caption?.substring(0, 80)}...`);
    console.log(`  Location: ${reel.locationName || 'Not found'}`);
    console.log(`  Creator: ${reel.authorUsername}`);
    console.log(`  ❤️  Likes: ${reel.likesCount}`);
    console.log(`  💬 Comments: ${reel.commentsCount}`);
    console.log(`  🎬 Video: ${reel.videoUrl ? '✓' : '✗'}`);
    console.log(`  🖼️  Thumbnail: ${reel.thumbnailUrl ? '✓' : '✗'}`);
    console.log('\n✨ Apify API is working!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testApify();
