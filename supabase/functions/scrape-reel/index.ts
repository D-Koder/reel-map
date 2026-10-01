import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');

async function callApify(reelUrl: string) {
  const response = await fetch('https://api.apify.com/v2/acts/junglee~instagram-reel-scraper/run', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startUrls: [{ url: reelUrl }],
      maxPostsPerPage: 1
    })
  });

  if (!response.ok) {
    throw new Error(`Apify API error: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { reelUrl } = await req.json();

    if (!reelUrl) {
      return new Response(
        JSON.stringify({ error: 'reelUrl is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apifyResult = await callApify(reelUrl);

    // Extract data from Apify response
    const reel = apifyResult?.output?.items?.[0];

    if (!reel) {
      return new Response(
        JSON.stringify({ error: 'Failed to scrape reel data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse location from caption if not directly available
    let location = reel.locationName || '';
    let caption = reel.caption || '';
    let date = reel.createdAt || '';

    // Extract location from caption if needed (e.g., "Cafe Name, City, Country")
    if (!location && caption) {
      const locationMatch = caption.match(/(?:at|@)?\s*([A-Za-z\s,]+?)(?:\s*[📍🗺️]|$)/i);
      if (locationMatch) {
        location = locationMatch[1].trim();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        caption: caption,
        location: location,
        date: date,
        creator: reel.authorUsername || '',
        likes: reel.likesCount || 0,
        comments: reel.commentsCount || 0,
        hashtags: reel.hashtags || [],
        videoUrl: reel.videoUrl || '',
        thumbnailUrl: reel.thumbnailUrl || ''
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
});
