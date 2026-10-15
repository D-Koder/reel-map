// Place-name clues from Instagram handles, for captions without a 📍 line or a list:
//   "Thank you @sweetag.glenwaverley for the invite"  →  Sweetag, near Glen Waverley
//   posted by kickbakery: "try our new shiopan"         →  Kick Bakery

// Words shops end their handles with, so "kickbakery" can be read as "kick bakery".
const SHOP_WORDS = [
  'croissanterie', 'patisserie', 'creamery', 'dumplings', 'dumpling', 'bakehouse', 'roastery', 'roasters', 'brewery',
  'kitchen', 'bakery', 'eatery', 'bistro', 'dessert', 'desserts', 'gelato', 'noodles', 'noodle', 'coffee', 'pizza',
  'ramen', 'sushi', 'grill', 'cafe', 'deli', 'bar', 'tea', 'co',
];
const SHOP_WORD = new RegExp(`^(.{3,}?)(${SHOP_WORDS.join('|')})$`);

// Street words are part of a venue's name ("shanghai.street"), never a suburb.
const STREET_WORDS = new Set(['street', 'lane', 'road', 'place', 'arcade', 'avenue', 'square', 'alley', 'parade', 'terrace']);
const CITY_SHORT = { melb: 'Melbourne', mel: 'Melbourne', syd: 'Sydney', bne: 'Brisbane', bris: 'Brisbane', adl: 'Adelaide', cbr: 'Canberra', per: 'Perth', cbd: 'CBD' };

// Food guides and reviewers rather than venues: tried last, never first.
const GUIDE = /(?:foodie|foodies|eats|eat|food|guide|guides|reviews|diaries|diary|blog|official)$|^(?:whatson|eat|foodie)/i;

// Handles named in a caption, in order, without repeats: "@sweetag.glenwaverley" → "sweetag.glenwaverley".
function captionMentions(caption) {
  const seen = new Set();
  return [...String(caption || '').matchAll(/(?:^|[^\w@.])@([A-Za-z0-9_.]{2,30})/g)]
    .map((match) => match[1].replace(/\.+$/, '').toLowerCase())
    .filter((handle) => handle && !seen.has(handle) && seen.add(handle));
}

function isGuide(handle) {
  return GUIDE.test(String(handle || '').replace(/[._]/g, ''));
}

// "kickbakery" → "kick bakery"; words already apart are left alone.
function splitShopWord(word) {
  const match = word.match(SHOP_WORD);
  return match ? `${match[1]} ${match[2]}` : word;
}

function titleCase(text) {
  return text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

// A handle as a place name, plus a suburb when the handle carries one after a dot or underscore:
//   "sweetag.glenwaverley" → { name: "Sweetag", suburb: "glenwaverley" }
//   "kickbakery"           → { name: "Kick Bakery", suburb: "" }
//   "hectors_deli"         → { name: "Hectors Deli", suburb: "" }
function handleToPlace(handle) {
  const parts = String(handle || '').replace(/^@/, '').toLowerCase().split(/[._]+/).filter(Boolean);
  let suburb = '';
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    // City short forms ("frenchie.melb") say where, not what: dropped from the name.
    if (CITY_SHORT[last]) {
      suburb = CITY_SHORT[last];
      parts.pop();
    // The last part is a suburb when it's a long plain word, not a shop or street word ("glenwaverley").
    } else if (last.length >= 5 && !/\d/.test(last) && !SHOP_WORDS.includes(last) && !STREET_WORDS.has(last) && splitShopWord(last) === last) {
      suburb = parts.pop();
    }
  }
  const name = titleCase(parts.map(splitShopWord).join(' ').replace(/\s+/g, ' ').trim());
  return { name, suburb };
}

// Capitalised words not to take as a suburb after "in" or "at".
const NOT_PLACES = new Set(['The', 'This', 'That', 'These', 'Our', 'My', 'Your', 'Their', 'A', 'An', 'I', 'We', 'It',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Instagram', 'Stories']);

// A suburb or city named in the caption: "This spot in Glen Waverley serves…" → "Glen Waverley".
function captionSuburb(caption) {
  for (const match of String(caption || '').matchAll(/\b(?:in|at)\s+((?:[A-Z][a-z]+|CBD)(?:\s+(?:[A-Z][a-z]+|CBD)){0,2})/g)) {
    const words = match[1].split(/\s+/);
    if (!NOT_PLACES.has(words[0])) return match[1];
  }
  return '';
}

module.exports = { captionMentions, isGuide, handleToPlace, captionSuburb };
