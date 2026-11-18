// Checks that a place name the AI picked is really written in the post (caption, location tag, tagged
// accounts or creator). A name that isn't there may be a guess, so the app asks the person to check it.

// Letters and digits only, lower case: "Café Lumière!" → "cafelumiere".
const squash = (value) => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// True when the name's letters appear as one run inside one of the post's texts (spaces and punctuation
// ignored). Each text is checked on its own, so two texts never join into a false match.
function nameInPost(name, texts) {
  const key = squash(name);
  if (!key) return true;
  return texts.some((text) => squash(text).includes(key));
}

module.exports = { nameInPost, squash };
