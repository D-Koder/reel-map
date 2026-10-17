// Place-name clues from Instagram handles, for captions without a 📍 line or a list:
//   "Thank you @sweetag.glenwaverley for the invite"  →  "Sweetag Glenwaverley"
//   posted by hectors_deli: "try our new sandwich"     →  "Hectors Deli"
// No word lists: a handle is only split where it has a dot or underscore. The AI reads the
// handle into the business's own name ("thebrunswick_fishandchippery" → "The Brunswick Fish and Chippery").

// Handles named in a caption, in order, without repeats: "@sweetag.glenwaverley" → "sweetag.glenwaverley".
function captionMentions(caption) {
  const seen = new Set();
  return [...String(caption || '').matchAll(/(?:^|[^\w@.])@([A-Za-z0-9_.]{2,30})/g)]
    .map((match) => match[1].replace(/\.+$/, '').toLowerCase())
    .filter((handle) => handle && !seen.has(handle) && seen.add(handle));
}

function titleCase(text) {
  return text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

// A handle as words, split at its dots and underscores:
//   "sweetag.glenwaverley" → { name: "Sweetag Glenwaverley" }
//   "hectors_deli"         → { name: "Hectors Deli" }
function handleToPlace(handle) {
  const parts = String(handle || '').replace(/^@/, '').toLowerCase().split(/[._]+/).filter(Boolean);
  return { name: titleCase(parts.join(' ')) };
}

module.exports = { captionMentions, handleToPlace };
