// The one place that turns an AI answer into the places to save. Used by the Shortcut save (api/save-reel.js
// through enrich-reel) and by the app's Add place form, so both save the same things the same way.
//
// Input:  the AI's answer (api/_lib/ai-place.js) and the reel fields the lookup read (caption, location
//         tag, creator, tagged and collaborator accounts).
// Output: one entry per place in the post, in the order the AI listed them:
//         { name, handle, otherName, localName, area, address, category, temporary, startDate, endDate,
//           runs, price, contact, howToBook, locationNote, evidence, nameUnchecked }

const { nameInPost } = require('./name-check');

const CATEGORIES = ['cafe', 'food', 'event', 'other'];

// The text a place name can be copied from: caption, location tag, creator and the tagged accounts.
function postTexts(reel = {}) {
  const handles = [...(Array.isArray(reel.tagged) ? reel.tagged : []), ...(Array.isArray(reel.collaborators) ? reel.collaborators : [])];
  return [reel.caption, reel.locationTag, reel.creator, ...handles.map((handle) => String(handle?.handle ?? handle ?? ''))]
    .filter((text) => typeof text === 'string' && text.trim());
}

// One place from one AI entry. Pop-ups and stalls are events; their dates come from the post.
function placeFrom(pick = {}, ai = {}, texts) {
  const name = String(pick.name ?? '').trim();
  const temporary = Boolean(ai.temporary);
  const category = temporary ? 'event' : CATEGORIES.includes(pick.category) ? pick.category : 'food';
  return {
    name,
    handle: String(pick.handle ?? ''),
    otherName: String(pick.otherName ?? pick.other_script_name ?? ''),
    localName: String(pick.localName ?? pick.local_name ?? ''),
    area: String(pick.area || ai.postArea || ''),
    address: String(pick.address ?? ''),
    category,
    temporary,
    startDate: temporary ? String(pick.startDate ?? ai.startDate ?? '') : '',
    endDate: temporary ? String(pick.endDate ?? ai.endDate ?? '') : '',
    runs: temporary && Array.isArray(ai.runs) ? ai.runs : [],
    price: temporary ? String(ai.price ?? '') : '',
    contact: temporary ? String(ai.contact ?? '') : '',
    howToBook: temporary ? String(ai.howToBook ?? '') : '',
    locationNote: temporary ? String(ai.locationNote ?? '') : '',
    evidence: String(pick.evidence ?? ''),
    nameUnchecked: name !== '' && !nameInPost(name, texts),
  };
}

// All places in the AI's answer that have a name, with the same name not repeated.
function placesFromAi(ai, reel = {}) {
  if (!ai || !Array.isArray(ai.places)) return [];
  const texts = postTexts(reel);
  const seen = new Set();
  const out = [];
  for (const pick of ai.places) {
    const place = placeFrom(pick, ai, texts);
    const key = place.name.toLowerCase();
    if (!place.name || seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

module.exports = { placesFromAi, postTexts, CATEGORIES };
