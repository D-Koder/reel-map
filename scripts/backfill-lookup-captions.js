// Fills in missing captions for lookup_debug rows, using the same oEmbed fetch the app uses.
// Usage: node scripts/backfill-lookup-captions.js <rows.json> <captions.json>
// rows.json: [{ "id": 1, "reel_url": "https://www.instagram.com/reel/..." }]
// Writes captions.json: [{ "id": 1, "caption": "..." }] or [{ "id": 1, "error": "..." }]
const fs = require('fs');
const { fetchInstagramOembed } = require('../api/_lib/instagram-oembed');

// Instagram rate-limits quick bursts, so requests go one at a time with a short pause.
async function backfillCaptions(rows, { fetcher = fetchInstagramOembed, delayMs = 1500 } = {}) {
  const results = [];
  for (const [index, { id, reel_url: reelUrl }] of rows.entries()) {
    try {
      const data = await fetcher(reelUrl);
      results.push(data.ok && data.caption
        ? { id, caption: data.caption }
        : { id, error: data.ok ? 'empty caption' : `status ${data.status}` });
    } catch (error) {
      results.push({ id, error: error.message });
    }
    if (index < rows.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return results;
}

module.exports = { backfillCaptions };

if (require.main === module) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/backfill-lookup-captions.js <rows.json> <captions.json>');
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  backfillCaptions(rows).then((results) => {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    const failed = results.filter((result) => result.error);
    console.log(`${results.length - failed.length} captions fetched, ${failed.length} failed`);
    for (const { id, error } of failed) console.log(`  id ${id}: ${error}`);
  });
}
