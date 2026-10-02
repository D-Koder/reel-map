#!/usr/bin/env node
/**
 * Test script for Apify Instagram reel scraping
 * Run with: node test-apify.js
 */

const testUrl = 'https://www.instagram.com/reel/DcQICfPx5TV/?stkn=MThsZGRndndyanp4YQ==';

async function testApifyIntegration() {
  console.log('🧪 Testing Apify Integration\n');
  console.log(`📍 Testing with URL: ${testUrl}\n`);

  try {
    // Call the edge function directly
    // Note: This requires SUPABASE_URL and SUPABASE_ANON_KEY environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing environment variables:');
      console.error('   SUPABASE_URL and SUPABASE_ANON_KEY required');
      console.error('\n📝 Set them with:');
      console.error('   export SUPABASE_URL=your_url');
      console.error('   export SUPABASE_ANON_KEY=your_key');
      process.exit(1);
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/scrape-reel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ reelUrl: testUrl }),
    });

    console.log(`📡 Response status: ${response.status}\n`);

    const data = await response.json();

    if (data.success) {
      console.log('✅ Success! Scraped data:\n');
      console.log('📝 Caption:', data.caption?.substring(0, 100) + '...' || 'N/A');
      console.log('📍 Location:', data.location || 'N/A');
      console.log('👤 Creator:', data.creator || 'N/A');
      console.log('❤️  Likes:', data.likes || 0);
      console.log('💬 Comments:', data.comments || 0);
      console.log('📅 Date:', data.date || 'N/A');
      console.log('🎬 Video URL:', data.videoUrl ? '✓' : '✗');
      console.log('🖼️  Thumbnail URL:', data.thumbnailUrl ? '✓' : '✗');
      console.log('🏷️  Hashtags:', (data.hashtags || []).length + ' found');
      console.log('\n✨ Apify integration is working!');
    } else {
      console.error('❌ Failed to scrape:');
      console.error('   Error:', data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Request failed:');
    console.error('   Error:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. Supabase edge function is deployed');
    console.error('   2. APIFY_API_KEY is set in Supabase env vars');
    console.error('   3. You have internet connection');
  }
}

testApifyIntegration();
