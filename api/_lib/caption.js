// The venue written after a pin in a caption. 📍 wins over 📌, because captions also use 📌 for
// headings like "📌 Details:". A pin followed only by a label ending in ":" is skipped, and a
// "Location:" / "Address:" label in front of the venue is dropped.
// The pin can sit mid-line, e.g. "(📍@venue)", so the venue stops at the first "(", "#" or 🏷.
// Same rule as captionVenue in frontend/src/lib/places.js.
function captionVenue(caption) {
  const found = [...String(caption || '').matchAll(/([📍📌])\s*([^\n#()🏷]+)/gu)]
    .map(([, pin, text]) => ({
      pin,
      text: text.trim().replace(/^(?:location|address|where|venue|spot)\s*:\s*/i, '')
        // A pin mid-sentence ("my new quest to 📍Frenchie. all I can say…") ends at the sentence's end.
        .split(/[.!?](?:\s|$)/)[0].trim(),
    }))
    .filter(({ text }) => text && !text.endsWith(':'));
  return (found.find(({ pin }) => pin === '📍') ?? found[0])?.text ?? '';
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
