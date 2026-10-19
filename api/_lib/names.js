// Place names as the name-matching rules compare them. Same as in frontend/src/lib/places.js.

// Lower-case letters and digits only, so "Yo Art" and "YoArt" compare equal.
function squash(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// How long a squashed name is for the "too short to match by chance" rules. A Chinese, Japanese or
// Korean character says as much as two letters, so a three-character name like 人和馆 counts.
function letters(key) {
  let count = 0;
  for (const char of String(key || '')) count += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char) ? 2 : 1;
  return count;
}

module.exports = { squash, letters };
