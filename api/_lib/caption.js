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

module.exports = { captionVenue };
