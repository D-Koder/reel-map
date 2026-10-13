// Export a collection to a file, and read one back in.
// Two formats:
// - Reel Map file (.json): everything needed to rebuild the collection somewhere else.
// - Spreadsheet (.csv): starts with Title, Note, URL like Google Maps' saved-list export
//   (Google Takeout → Saved), so the same reader takes both. Votes are never exported.

const FILE_KIND = 'reel-map-collection';
const CATEGORIES = new Set(['cafe', 'food', 'event']);
// Large files are cut here so an import can't run for minutes.
export const IMPORT_LIMIT = 300;

function slug(text) {
  return String(text || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
}

// A link that opens the place on Google Maps: the saved Maps link, else a search for its address or name.
export function mapsLinkFor(place) {
  if (place.source_id && /^https?:\/\//.test(place.source_id)) return place.source_id;
  const query = [place.name, place.address].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function placeForFile(place) {
  return {
    name: place.name,
    category: place.category,
    address: place.address || null,
    lat: Number.isFinite(place.lat) ? place.lat : null,
    lng: Number.isFinite(place.lng) ? place.lng : null,
    maps_url: mapsLinkFor(place) || null,
    reel_url: place.reel_url || null,
    url: place.url || null,
    phone: place.phone || null,
    booking_url: place.booking_url || null,
    hours: Array.isArray(place.hours) && place.hours.length ? place.hours : null,
    note: place.custom_info || null,
    event_date: place.event_date || null,
  };
}

export function collectionToJSON(collection, places) {
  return JSON.stringify({
    kind: FILE_KIND,
    version: 1,
    exported_at: new Date().toISOString(),
    collection: { name: collection.name, emoji: collection.emoji || null },
    places: places.map(placeForFile),
  }, null, 2);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = ['Title', 'Note', 'URL', 'Address', 'Category', 'Reel', 'Website', 'Latitude', 'Longitude'];

export function collectionToCSV(places) {
  const rows = places.map((place) => {
    const p = placeForFile(place);
    return [p.name, p.note, p.maps_url, p.address, p.category, p.reel_url, p.url, p.lat, p.lng];
  });
  return [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// Saves text as a file on this device.
export function downloadFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function exportCollection(collection, places, format) {
  const base = `${slug(collection.name)}-reel-map`;
  if (format === 'csv') downloadFile(collectionToCSV(places), `${base}.csv`, 'text/csv;charset=utf-8');
  else downloadFile(collectionToJSON(collection, places), `${base}.json`, 'application/json');
}

// ---------- Reading files ----------

// RFC 4180 CSV: quoted cells may hold commas, quotes ("") and line breaks.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Coordinates written into a Google Maps link: "@-37.81,144.96", "!3d-37.81!4d144.96" or "query=-37.81,144.96".
export function coordsFromMapsUrl(url) {
  const text = decodeURIComponent(String(url || ''));
  const patterns = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

function guessCategory(value, name, note) {
  const given = String(value || '').trim().toLowerCase();
  if (CATEGORIES.has(given)) return given;
  if (/\b(cafe|café|coffee|bakery|brunch|tea)\b/i.test(`${name} ${note}`)) return 'cafe';
  if (/\b(event|festival|market|gig|concert|show|exhibition)\b/i.test(`${name} ${note}`)) return 'event';
  return 'food';
}

function cleanText(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function cleanUrl(value) {
  const text = String(value ?? '').trim();
  return /^https?:\/\//i.test(text) ? text.slice(0, 2000) : null;
}

// One place in the shape addPlace understands, from a row of either format. Null when it has no name.
function toImportPlace(raw) {
  const name = cleanText(raw.name, 120);
  if (!name) return null;
  const note = cleanText(raw.note, 500);
  const mapsUrl = cleanUrl(raw.maps_url);
  const lat = Number.isFinite(Number(raw.lat)) && raw.lat !== null && raw.lat !== '' ? Number(raw.lat) : null;
  const lng = Number.isFinite(Number(raw.lng)) && raw.lng !== null && raw.lng !== '' ? Number(raw.lng) : null;
  const coords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : coordsFromMapsUrl(mapsUrl);
  return {
    name,
    category: guessCategory(raw.category, name, note),
    address: cleanText(raw.address, 300),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    mapsUrl,
    reelUrl: cleanUrl(raw.reel_url),
    url: cleanUrl(raw.url),
    phone: cleanText(raw.phone, 40),
    bookingUrl: cleanUrl(raw.booking_url),
    hours: Array.isArray(raw.hours)
      ? raw.hours
        .filter((h) => h && typeof h.days === 'string' && typeof h.time === 'string')
        .slice(0, 14)
        .map((h) => ({ days: h.days.slice(0, 40), time: h.time.slice(0, 80) }))
      : null,
    note,
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.event_date || '')) ? raw.event_date : null,
  };
}

// Header name → field, for Reel Map's own CSV, Google's saved-list CSV and hand-made sheets.
const HEADER_FIELDS = {
  title: 'name', name: 'name', place: 'name',
  note: 'note', notes: 'note', comment: 'note', description: 'note',
  url: 'maps_url', 'google maps url': 'maps_url', 'maps url': 'maps_url', 'maps link': 'maps_url', link: 'maps_url',
  address: 'address', location: 'address',
  category: 'category', type: 'category',
  reel: 'reel_url', 'reel url': 'reel_url', instagram: 'reel_url', tiktok: 'reel_url',
  website: 'url',
  latitude: 'lat', lat: 'lat',
  longitude: 'lng', lng: 'lng', lon: 'lng',
};

function readCSVFile(text, filename) {
  const [header, ...rows] = parseCSV(text);
  if (!header) throw new Error('This file is empty.');
  const fields = header.map((h) => HEADER_FIELDS[h.trim().toLowerCase()] ?? null);
  if (!fields.includes('name')) throw new Error('No Title or Name column found in this spreadsheet.');
  const places = rows.map((cells) => {
    const raw = {};
    fields.forEach((field, i) => { if (field && raw[field] == null) raw[field] = cells[i]; });
    // A "URL" that isn't a Maps link is the place's website.
    if (raw.maps_url && !/google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\./i.test(raw.maps_url)) {
      raw.url = raw.url || raw.maps_url;
      raw.maps_url = null;
    }
    return raw;
  });
  const name = String(filename || '').replace(/\.[^.]+$/, '').replace(/-reel-map$/, '').replace(/[-_]+/g, ' ').trim();
  return { name: name || 'Imported places', emoji: null, places };
}

function readJSONFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Reel Map file.");
  }
  if (data?.kind !== FILE_KIND || !Array.isArray(data.places)) throw new Error("This isn't a Reel Map file.");
  return { name: data.collection?.name || 'Imported places', emoji: data.collection?.emoji || null, places: data.places };
}

// Reads an export file (or a Google Maps list) into { name, emoji, places, skipped, cut }.
export function readCollectionFile(text, filename) {
  const isJSON = /\.json$/i.test(filename || '') || /^\s*\{/.test(text);
  const file = isJSON ? readJSONFile(text) : readCSVFile(text, filename);
  const all = file.places.map(toImportPlace);
  const places = all.filter(Boolean);
  return {
    name: cleanText(file.name, 60) || 'Imported places',
    emoji: file.emoji,
    places: places.slice(0, IMPORT_LIMIT),
    skipped: all.length - places.length,
    cut: Math.max(0, places.length - IMPORT_LIMIT),
  };
}
