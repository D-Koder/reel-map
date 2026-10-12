const { fetchInstagramOembed } = require('./instagram-oembed');
const { fetchInstagramPage } = require('./instagram-page');

// A Reel's current cover from oEmbed, else from the public page's og:image. Both are asked at once.
// Returns { thumbnailUrl } (null when Instagram answered without one). Throws only when neither
// could be reached, which is not the Reel's fault.
async function fetchInstagramCover(reelUrl, timeoutMs = 10000) {
  const [oembed, page] = await Promise.allSettled([fetchInstagramOembed(reelUrl, timeoutMs), fetchInstagramPage(reelUrl, timeoutMs)]);
  if (oembed.status === 'rejected' && page.status === 'rejected') throw oembed.reason;
  const fromOembed = oembed.status === 'fulfilled' && oembed.value.ok ? oembed.value.thumbnailUrl : null;
  const fromPage = page.status === 'fulfilled' ? page.value.thumbnailUrl : null;
  return { thumbnailUrl: fromOembed || fromPage || null };
}

module.exports = { fetchInstagramCover };
