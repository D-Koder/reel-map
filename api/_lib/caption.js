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
function captionVenue(caption) {
  const found = [...String(caption || '').matchAll(/([📍📌])\s*([^\n#()🏷📍📌]+)/gu)]
    .map(([, pin, text]) => ({
      pin,
      text: text.trim().replace(/^(?:location|address|where|venue|spot)\s*:\s*/i, '')
        // A pin mid-sentence ("my new quest to 📍Frenchie. all I can say…") ends at the sentence's end.
        .split(/[.!?](?:\s|$)/)[0].trim(),
    }))
    .filter(({ text }) => text && !text.endsWith(':'));
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
// Returns those lines as { line, name, address }, or [] when the caption isn't such a list (fewer than two).
function captionPlaceList(caption) {
  const items = String(caption || '')
    .split(/\n|(?=\p{Extended_Pictographic})/u)
    .map((part) => part.trim())
    .map((part) => part.match(/^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]|\d️⃣)+\s*(.+)$/u)?.[1]?.trim() ?? '')
    // "Name, address" or "Name - address", starting with a letter, short enough to be one place.
    .filter((text) => /^[\p{Lu}\p{N}@]/u.test(text) && text.length <= 100 && !text.includes('#') && /,|\s[-–—]\s/.test(text));
  if (items.length < 2) return [];
  return items.map((line) => {
    const [name, ...rest] = line.split(/,|\s[-–—]\s/);
    return { line, name: name.replace(/^@/, '').trim(), address: rest.join(',').trim() };
  });
}

// The listed place for the slide that was shared (?img_index=3 is the third photo). A list post with an
// intro before the list usually has a cover slide first, so slide 3 is the second place. Without a
// slide, the first place. Null when the caption isn't a list: two lines only count when a slide was
// shared, so an ordinary caption with a couple of emoji lines isn't mistaken for one.
function captionPlaceForSlide(caption, slide) {
  const list = captionPlaceList(caption);
  if (list.length < (slide ? 2 : 3)) return null;
  const text = String(caption);
  const before = text.slice(0, Math.max(text.indexOf(list[0].line), 0))
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D\s]+$/u, '').trim();
  const index = slide ? slide - 1 - (before ? 1 : 0) : 0;
  return list[Math.min(Math.max(index, 0), list.length - 1)];
}

module.exports = { captionVenue, captionPlaceList, captionPlaceForSlide };
