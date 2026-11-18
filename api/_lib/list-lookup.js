// Looks up every place of a list post on its own, on the server: search Google Maps for it, pick the
// right result, then read its details (address, coordinates, hours, phone...). Each place ends as one of:
//   { status: 'saved', place }        found and read, ready to save
//   { status: 'needs_pick', candidates }  no single clear result: the person picks it
//   { status: 'failed', error }       the search or the details read failed: listed for the person too
// Nothing here saves anything. The caller saves the 'saved' places and lists the others.
//
// search(query, place) → { candidates: [{ name, address, url, ... }] }
// details(url) → { name, address, latitude, longitude, hours, phone, websiteUrl, bookingUrl, menuUrl, mapsUrl }
// pickBest(candidates, hints, areas, address) → the one clear result, or null

// The search text for one place: its name, then its address and area, when there are any.
function queryFor(place) {
  return [place.name, place.address, place.area].filter((part) => String(part || '').trim()).join(', ');
}

async function lookupOne(place, { search, details, pickBest }) {
  let found;
  try {
    found = await search(queryFor(place), place);
  } catch (error) {
    return { status: 'failed', error: `Search failed: ${error.message}` };
  }
  const candidates = Array.isArray(found?.candidates) ? found.candidates : [];
  if (!candidates.length) return { status: 'failed', error: 'Google Maps found nothing for this place' };

  const best = pickBest(candidates, [place.name], [place.area].filter(Boolean), place.address || '');
  if (!best) return { status: 'needs_pick', candidates };

  let read;
  try {
    read = await details(best.url);
  } catch (error) {
    return { status: 'failed', error: `Details failed: ${error.message}` };
  }
  if (!Number.isFinite(read?.latitude) || !Number.isFinite(read?.longitude)) {
    return { status: 'failed', error: 'Google Maps gave no location for this place' };
  }
  return {
    status: 'saved',
    candidates,
    place: {
      name: place.name,
      category: place.category,
      address: read.address || best.address || place.address || '',
      lat: read.latitude,
      lng: read.longitude,
      hours: read.hours || null,
      phone: read.phone || '',
      bookingUrl: read.bookingUrl || '',
      mapsUrl: read.mapsUrl || best.url || '',
      websiteUrl: read.websiteUrl || '',
      menuUrl: read.menuUrl || '',
      startDate: place.startDate || '',
      endDate: place.endDate || '',
    },
  };
}

// One result per place, in the order given. A failure in one place never stops the others.
// onResult(result, index) is called as each place finishes, so progress can be shown while the rest run.
async function lookupListPlaces(places, deps, { onResult } = {}) {
  const results = [];
  for (const [index, place] of places.entries()) {
    const result = { name: place.name, query: queryFor(place), ...(await lookupOne(place, deps)) };
    results.push(result);
    if (onResult) await onResult(result, index);
  }
  return results;
}

module.exports = { lookupListPlaces, queryFor };
