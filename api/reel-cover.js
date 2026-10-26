const { requireUser } = require('./_lib/auth');
const { isRedNoteUrl } = require('./_lib/reel-url');
const { fetchRedNote } = require('./_lib/rednote-fetch');

// The cover image link of a RedNote note, for the app to show from RedNote's own server (nothing is copied or
// kept here). RedNote has no embed, so the app shows this picture, and taps open the note.
// Body: { reelUrl } → { coverUrl } ('' when the page gave none).
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  if (!isRedNoteUrl(reelUrl)) return res.status(400).json({ error: 'Not a RedNote link' });
  const read = await fetchRedNote(reelUrl);
  const coverUrl = read.reel?.thumbnailUrl || '';
  // Only an https picture link is passed on.
  return res.status(200).json({ coverUrl: /^https:\/\//.test(coverUrl) ? coverUrl : '' });
}, { endpoint: 'reel-cover', perHour: 200 });
