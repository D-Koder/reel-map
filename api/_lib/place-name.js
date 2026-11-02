// A place name as it should be saved: no emoji or flags, and no "Save & Share" lead-in from a post's title.
// "📌 Save & Share- Free Diwali celebration in Melbourne 🎇🇦🇺" → "Free Diwali celebration in Melbourne".
function cleanName(name) {
  return String(name || '')
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍/gu, ' ')
    .replace(/^\s*save\s*&\s*share\s*[-–:|]*\s*/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { cleanName };
