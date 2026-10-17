const { handleToPlace } = require('./handles');

// How much a pinned line looks like a place rather than a date or a promo. Higher is more place-like.
// "📍 Smolbitez, Flinders St" scores well; "📍 Flinders Shop: 17–18 Oct" and "📍 Pop-up: 3 days only" don't.
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DATE_OR_TIME = new RegExp([
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:[–-]\\s*\\d{1,2}(?:st|nd|rd|th)?\\s*)?${MONTH}\\b`, // 17–18 Oct, 3rd Nov
  `\\b${MONTH}\\s+\\d{1,2}\\b`, // Oct 17
  '\\b\\d{1,2}\\/\\d{1,2}\\b', // 28/10
  '\\b\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b', // 5pm, 5:30pm
  '\\b(?:till|until|til)\\s+late\\b', // till late
].join('|'), 'i');
const PROMO = /\b(?:only|until|till|promo|launch|sale|limited|pop-?up|days?|weeks?)\b/i;
const STREET = /\b(?:st|street|rd|road|lane|ln|ave|avenue|pl|place|arcade|parade|pde|hwy|highway|blvd|boulevard|dr|drive|cres|crescent|tce|terrace|square|sq|mall|centre|center|plaza)\b/i;
const STATE = /\b(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b|\b(?!19|20)\d{4}\b/;
function placeScore(text) {
  let score = 0;
  if (STREET.test(text)) score += 2;
  if (STATE.test(text)) score += 2;
  if (/\b\d+[a-z]?(?:\/\d+[a-z]?)?\s+[A-Z]/.test(text)) score += 1; // 61 Little Collins, 146/148 Little Bourke
  if (/^[^,]{2,40},\s*\S/.test(text)) score += 1; // Name, suburb
  if (/@[\w.]+/.test(text)) score += 1;
  if (DATE_OR_TIME.test(text)) score -= 3;
  if (PROMO.test(text)) score -= 2;
  return score;
}

// The venue written after a pin in a caption. 📍 wins over 📌, because captions also use 📌 for
// headings like "📌 Details:". A pin followed only by a label ending in ":" is skipped, and a
// "Location:" / "Address:" label in front of the venue is dropped.
// The pin can sit mid-line, e.g. "(📍@venue)", so the venue stops at the first "(", "#", 🏷 or the next pin.
// Same rule as captionVenue in frontend/src/lib/places.js.
// A venue written as a handle ("@introspectioncoffee , brunswick") becomes a name and a suburb
// ("Introspection Coffee, Brunswick"), so the search and the name match see words, not a handle.
function handleVenue(text) {
  const match = text.match(/^@([\w.]+)\s*(?:,\s*(.+))?$/);
  if (!match) return text;
  const { name, suburb: handleSuburb } = handleToPlace(match[1]);
  // The suburb written after the handle, else one in the handle ("@dancebakesmelbourne" → Melbourne).
  const suburb = (match[2] || handleSuburb)?.trim().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return [name, suburb].filter(Boolean).join(', ');
}

// A 📌 "call to action" ("Which one are you trying first? 👇") is not a venue. A 📍 with a question is still skipped by the
// place score, so only the 📌 rule needs this.
const CALL_TO_ACTION = /\?|👇/u;

function captionVenue(caption) {
  const text = String(caption || '');
  const pins = [
    ...text.matchAll(/([📍📌])\s*([^\n#()🏷📍📌]+)/gu),
    // A handle wrapped in symbols on its own line ("【 @yomiu.au 】", "✨@yomiu.au✨") is the venue too,
    // whatever the symbols are. Letters on either side mean it's a sentence, not a line of its own.
    ...[...text.matchAll(/^[^\p{L}\p{N}\s@]+\s*(@[\w.]+)\s*[^\p{L}\p{N}\s@]+\s*$/gmu)]
      .map((match) => [match[0], '📍', match[1]]),
  ];
  const found = pins
    .map(([, pin, raw]) => ({
      pin,
      // Checked before the sentence is cut at its "?", which is what marks a call to action.
      callToAction: CALL_TO_ACTION.test(raw),
      text: handleVenue(raw.trim().replace(/^(?:location|address|where|venue|spot)\s*:\s*/i, '')
        // A pin mid-sentence ("my new quest to 📍Frenchie. all I can say…") ends at the sentence's end.
        .split(/[.!?](?:\s|$)/)[0].trim()),
    }))
    .filter(({ text, pin, callToAction }) => text && !text.endsWith(':') && !(pin === '📌' && callToAction));
  // Lines that look like a place (score above 0) beat dates and promos; among them the first 📍, then
  // the first 📌. With none, the highest score. A lone pin is always used.
  const scored = found.map((entry) => ({ ...entry, score: placeScore(entry.text) }));
  const places = scored.filter(({ score }) => score > 0);
  const best = places.find(({ pin }) => pin === '📍') ?? places[0] ??
    [...scored].sort((a, b) => b.score - a.score || (a.pin === '📍' ? 0 : 1) - (b.pin === '📍' ? 0 : 1))[0];
  return best?.text ?? '';
}

// List posts ("Melbourne's best spots…") name one place per slide, each on its own line after an emoji:
//   🥪 Hector's Deli, 61 Little Collins Street
//   🥟 Shanghai Street, 146/148 Little Bourke Street
// Returns those lines as { line, name, address, pinned }, where pinned means the emoji was 📍 or 📌.
// Deal lines ("🍔 Salted egg burger — $7 every Wednesday") aren't places, so they're left out.
function captionPlaceList(caption) {
  return String(caption || '')
    .split(/\n|(?=\p{Extended_Pictographic})/u)
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/^((?:[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]|\d️⃣)+)\s*(.+)$/u);
      return match ? { emoji: match[1], text: match[2].trim() } : null;
    })
    // "Name, address" or "Name - address", starting with a letter, short enough to be one place.
    .filter((item) => item && /^[\p{Lu}\p{N}@]/u.test(item.text) && item.text.length <= 100 && !item.text.includes('#') &&
      /,|\s[-–—]\s/.test(item.text))
    .map(({ emoji, text }) => {
      const [name, ...rest] = text.split(/,|\s[-–—]\s/);
      return { line: text, name: name.replace(/^@/, '').trim(), address: rest.join(',').trim(), pinned: /[📍📌]/u.test(emoji) };
    })
    .filter(({ address }) => !isDeal(address));
}

// The part after the name says what's on offer, not where: "$7 every Wednesday", "7% off all August",
// "first 77 customers". Street addresses never have these.
// Whole words only, so "Queen Victoria Market", "Marrickville" and "Sun Theatre" stay addresses.
const WEEKDAY = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b(?:mon|tue|wed|thu|fri|sat|sun)\s*[-–]\s*(?:mon|tue|wed|thu|fri|sat|sun)\b/i;
const MONTH_WORD = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i;
const DEAL = /\b(?:deals?|specials?|discount|customers|free|bogo|happy hour)\b|\bfirst\s+\d+/i;
function isDeal(text) {
  return /[$%€£]/.test(text) || WEEKDAY.test(text) || MONTH_WORD.test(text) ||
    DATE_OR_TIME.test(text) || PROMO.test(text) || DEAL.test(text);
}

// A pinned line that sums up the list ("📍 All in Melbourne") rather than naming one of its places:
// no street or number, while three or more of the other lines have one.
function isSummary(item, others) {
  const hasStreet = (text) => STREET.test(text) || /\b\d+[a-z]?(?:\/\d+[a-z]?)?\s+[A-Z]/.test(text);
  return !hasStreet(item.line) && others.filter((other) => hasStreet(other.line)).length >= 3;
}

// The list post's places, after the pin rules:
//   exactly one pinned line that looks like a place → [] (it's a one-place post: the 📍 line is used instead)
//   one pinned line that sums up the list, or isn't a place → the other lines
//   two or more pinned lines → only the pinned lines
//   no pinned lines → every line
// A list needs two places when a slide was shared, else three.
function captionPlaces(caption, slide) {
  const lines = captionPlaceList(caption);
  const pinned = lines.filter((item) => item.pinned);
  const others = lines.filter((item) => !item.pinned);
  let list = lines;
  if (pinned.length === 1) {
    const [pin] = pinned;
    if (placeScore(pin.line) > 0 && !isSummary(pin, others)) return [];
    list = others;
  } else if (pinned.length > 1) {
    list = pinned;
  }
  return list.length >= (slide ? 2 : 3) ? list : [];
}

// The listed place for the slide that was shared (?img_index=3 is the third photo). A list post with an
// intro before the list usually has a cover slide first, so slide 3 is the second place.
// Returns null when the caption isn't a list. Without a slide there's no telling which place was meant,
// so it returns the first one with `choices` (every listed place) for the person to pick from.
function captionPlaceForSlide(caption, slide) {
  const list = captionPlaces(caption, slide);
  if (!list.length) return null;
  if (!slide) return { ...list[0], choices: list.map(({ name, address, line }) => ({ name, address, line })) };
  const text = String(caption);
  const before = text.slice(0, Math.max(text.indexOf(list[0].line), 0))
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D\s]+$/u, '').trim();
  const index = slide - 1 - (before ? 1 : 0);
  return list[Math.min(Math.max(index, 0), list.length - 1)];
}

// A pinned line that is a sentence, not a place: "📍A new cute cafe has opened up along High street
// this year". Six or more words, no number, and mostly lower-case words. Place lines are short or
// capitalised ("Lunetta Bakehouse, Hardware Lane, Melbourne"), and addresses have a number.
function isProse(text) {
  const words = String(text || '').split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length < 6 || /\d/.test(text)) return false;
  return words.filter((word) => /^\p{Ll}/u.test(word)).length >= 4;
}

module.exports = { captionVenue, captionPlaceList, captionPlaceForSlide, isProse };
