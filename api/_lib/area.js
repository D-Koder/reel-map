// Where a post is, so a vague search ("Salted egg burger") isn't answered with places near the
// server, which runs in the US. Read from the post's location tag, else a city named in the caption.

// Cities a caption can name. Kept to places that aren't also food names ("Paris-Brest",
// "New York cheesecake"), so a dessert never sets the city.
const CITIES = [
  'Melbourne', 'Sydney', 'Brisbane', 'Perth', 'Adelaide', 'Hobart', 'Canberra', 'Darwin', 'Gold Coast',
  'Sunshine Coast', 'Geelong', 'Ballarat', 'Bendigo', 'Newcastle', 'Wollongong', 'Cairns', 'Townsville',
  'Auckland', 'Wellington', 'Christchurch', 'Queenstown',
  'Singapore', 'Kuala Lumpur', 'Bangkok', 'Bali', 'Tokyo', 'Osaka', 'Kyoto', 'Seoul', 'Taipei',
  'Hong Kong', 'Hanoi', 'Ho Chi Minh',
];
// Hashtags that start with these ("#melbfood", "#sydneyeats") name the city too.
const HASHTAG_SHORT = { melb: 'Melbourne', syd: 'Sydney' };

const key = (text) => text.toLowerCase().replace(/\s+/g, '');

// The city a caption names most, counting words ("Melbourne CBD") and hashtags ("#melbourneeats").
// The first one named wins a tie. Empty when it names none.
function captionCity(caption) {
  const text = String(caption || '');
  const words = text.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const hashtags = [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1].toLowerCase());
  const counts = new Map();
  const add = (city, at) => {
    const entry = counts.get(city) ?? { city, count: 0, first: at };
    entry.count += 1;
    entry.first = Math.min(entry.first, at);
    counts.set(city, entry);
  };
  for (const city of CITIES) {
    // Written as a name ("Melbourne", "MELBOURNE"), not inside another word.
    const pattern = new RegExp(`(?<![\\p{L}])(?:${city}|${city.toUpperCase()})(?![\\p{L}])`, 'gu');
    for (const match of words.matchAll(pattern)) add(city, match.index);
    hashtags.forEach((tag, index) => {
      if (tag.startsWith(key(city))) add(city, words.length + index);
    });
  }
  hashtags.forEach((tag, index) => {
    const short = Object.keys(HASHTAG_SHORT).find((prefix) => tag.startsWith(prefix));
    if (short) add(HASHTAG_SHORT[short], words.length + index);
  });
  const best = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first)[0];
  return best?.city ?? '';
}

// True when the text already says where: the area itself, a known city, a state or a postcode.
// Hashtags don't count: Google reads "#sydneyfood" as one word, not as Sydney.
function saysWhere(text, area) {
  const value = String(text || '').replace(/#[\p{L}\p{N}_]+/gu, ' ');
  if (area && value.toLowerCase().includes(area.toLowerCase())) return true;
  if (captionCity(value)) return true;
  return /\b(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT|Australia)\b|\b(?!19|20)\d{4}\b/.test(value);
}

// "Salted egg burger" + "Melbourne" → "Salted egg burger Melbourne". Left alone when it already says where.
function withArea(text, area) {
  const value = String(text || '').trim();
  if (!area || !value || saysWhere(value, area)) return value;
  return `${value} ${area}`;
}

module.exports = { captionCity, saysWhere, withArea };
