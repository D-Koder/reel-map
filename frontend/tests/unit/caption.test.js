// Finding the place in a Reel caption. Each case is one caption style seen on Instagram or TikTok.
// The parser lives twice (api/_lib/caption.js for the server, src/lib/places.js for the app), so every
// case runs against both, and they must agree.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { captionVenue as appCaptionVenue, reelPlaceHints } from '../../src/lib/places.js';

const require = createRequire(import.meta.url);
const { captionVenue: apiCaptionVenue, captionPlaceList, captionPlaceForSlide } = require('../../../api/_lib/caption.js');
const { canonicalInstagramUrl, instagramSlide } = require('../../../api/_lib/reel-url.js');

// [caption style, caption, expected venue]
const VENUE_CASES = [
  ['plain 📍 line', 'Best croissants in town!\n📍 Lune Croissanterie', 'Lune Croissanterie'],
  ['📍 with name and suburb', '📍 Smolbitez, Flinders St', 'Smolbitez, Flinders St'],
  ['📍 with full street address', '📍 Hector’s Deli, 61 Little Collins St, Melbourne VIC 3000', 'Hector’s Deli, 61 Little Collins St, Melbourne VIC 3000'],
  ['📌 only', 'Weekend plans\n📌 Tipo 00, Little Bourke St', 'Tipo 00, Little Bourke St'],
  ['📍 beats a 📌 heading', '📌 Details:\n📍 Pho Bar, Richmond', 'Pho Bar, Richmond'],
  ['"Location:" label is dropped', '📍 Location: Chin Chin, Flinders Lane', 'Chin Chin, Flinders Lane'],
  ['"Address:" label is dropped', '📍Address: 125 Flinders Ln, Melbourne VIC 3000', '125 Flinders Ln, Melbourne VIC 3000'],
  ['no space after the pin', '📍Frenchie, Collingwood', 'Frenchie, Collingwood'],
  ['pin mid-sentence ends at the full stop', 'my new quest to 📍Frenchie. all I can say is wow', 'Frenchie'],
  ['pin in brackets stops at the bracket', 'Dinner at (📍@smithandsons) was unreal', '@smithandsons'],
  ['@handle after the pin', '📍 @lunecroissanterie', '@lunecroissanterie'],
  ['hashtags after the venue are cut', '📍 Gimlet, Russell St #melbournefood #datenight', 'Gimlet, Russell St'],
  ['🏷 tag after the venue is cut', '📍 Gimlet 🏷 @gimlet', 'Gimlet'],
  ['address line beats a date line', '📍 Flinders Shop: 17–18 Oct\n📍 Smolbitez, 12 Flinders St', 'Smolbitez, 12 Flinders St'],
  ['address line beats a promo line', '📍 Pop-up: 3 days only\n📌 Bar Liberty, Johnston St', 'Bar Liberty, Johnston St'],
  ['a lone date-only pin is still used', '📍 Sat 28/10', 'Sat 28/10'],
  ['heading-only pin with no venue gives nothing', '📌 Details:', ''],
  ['no pin at all gives nothing', 'Such a good night out with the crew 🍜🍜', ''],
  ['empty caption gives nothing', '', ''],
  ['null caption gives nothing', null, ''],
  ['venue on a later line with emojis around it', 'Ramen night 🍜🔥\n\n📍 Hakata Gensuke, 168 Russell St\n\nWould go back!', 'Hakata Gensuke, 168 Russell St'],
  ['postcode counts as an address', '📍 Market Lane 3181\n📍 Open till late', 'Market Lane 3181'],
  ['"Where:" label is dropped', '📍 Where: Higher Ground, Little Bourke St', 'Higher Ground, Little Bourke St'],
  ['exclamation ends the venue', '📍Dumpling Story! the best dumplings', 'Dumpling Story'],
];

describe('captionVenue: the place after a pin', () => {
  it.each(VENUE_CASES)('%s', (_style, caption, expected) => {
    expect(apiCaptionVenue(caption)).toBe(expected);
  });

  it.each(VENUE_CASES)('app copy agrees: %s', (_style, caption) => {
    expect(appCaptionVenue(caption)).toBe(apiCaptionVenue(caption));
  });
});

const LIST_POST = `Melbourne's best lunch spots 🥪
🥪 Hector's Deli, 61 Little Collins Street
🥟 Shanghai Street, 146/148 Little Bourke Street
🍜 Hakata Gensuke - 168 Russell St
#melbourne #food`;

const LIST_POST_NO_INTRO = `🥪 Hector's Deli, 61 Little Collins Street
🥟 Shanghai Street, 146/148 Little Bourke Street
🍜 Hakata Gensuke - 168 Russell St`;

describe('captionPlaceList: list posts (one place per slide)', () => {
  it('reads every place line with its name and address', () => {
    expect(captionPlaceList(LIST_POST)).toEqual([
      { line: "Hector's Deli, 61 Little Collins Street", name: "Hector's Deli", address: '61 Little Collins Street' },
      { line: 'Shanghai Street, 146/148 Little Bourke Street', name: 'Shanghai Street', address: '146/148 Little Bourke Street' },
      { line: 'Hakata Gensuke - 168 Russell St', name: 'Hakata Gensuke', address: '168 Russell St' },
    ]);
  });

  it('numbered emoji lists (1️⃣ 2️⃣) count too', () => {
    const list = captionPlaceList('1️⃣ Tipo 00, Little Bourke St\n2️⃣ Gimlet, Russell St');
    expect(list.map((p) => p.name)).toEqual(['Tipo 00', 'Gimlet']);
  });

  it('a normal caption is not a list', () => {
    expect(captionPlaceList('So good 😍\n📍 Gimlet, Russell St')).toEqual([]);
  });

  it('hashtag lines are not places', () => {
    expect(captionPlaceList('🔥 #melbourne, #food\n🔥 #eats, #yum')).toEqual([]);
  });
});

describe('captionPlaceForSlide: the place on the shared slide', () => {
  it('no slide → the first place', () => {
    expect(captionPlaceForSlide(LIST_POST, null)?.name).toBe("Hector's Deli");
  });

  it('with an intro, slide 1 is the cover, so slide 3 is the second place', () => {
    expect(captionPlaceForSlide(LIST_POST, 3)?.name).toBe('Shanghai Street');
  });

  it('without an intro, slide 2 is the second place', () => {
    expect(captionPlaceForSlide(LIST_POST_NO_INTRO, 2)?.name).toBe('Shanghai Street');
  });

  it('a slide past the end gives the last place', () => {
    expect(captionPlaceForSlide(LIST_POST, 20)?.name).toBe('Hakata Gensuke');
  });

  it('two lines only count as a list when a slide was shared', () => {
    const two = '🥪 Hector’s Deli, Little Collins St\n🥟 Shanghai Street, Little Bourke St';
    expect(captionPlaceForSlide(two, null)).toBeNull();
    expect(captionPlaceForSlide(two, 2)?.name).toBe('Shanghai Street');
  });
});

describe('reelPlaceHints: names to match against Google results', () => {
  it('tagged place first, then the 📍 venue, then the location', () => {
    expect(reelPlaceHints({ placeName: '@gimlet', caption: '📍 Gimlet at Cavendish House, Russell St', location: 'Melbourne, Victoria' }))
      .toEqual(['gimlet', 'Gimlet at Cavendish House', 'Melbourne']);
  });

  it('skips what is missing', () => {
    expect(reelPlaceHints({ caption: 'no pin here' })).toEqual([]);
  });
});

describe('Reel links', () => {
  it.each([
    ['https://www.instagram.com/reel/ABC123/?igsh=xyz', 'https://www.instagram.com/reel/ABC123/'],
    ['https://instagram.com/reels/ABC123', 'https://www.instagram.com/reel/ABC123/'],
    ['https://www.instagram.com/someone/reel/ABC123/', 'https://www.instagram.com/reel/ABC123/'],
    ['https://www.instagram.com/p/XYZ789/?img_index=3', 'https://www.instagram.com/p/XYZ789/'],
    ['http://www.instagram.com/reel/ABC123/', null],
    ['https://www.tiktok.com/@a/video/1', null],
    ['not a link', null],
  ])('%s → %s', (input, expected) => {
    expect(canonicalInstagramUrl(input)).toBe(expected);
  });

  it('reads the carousel slide from img_index', () => {
    expect(instagramSlide('https://www.instagram.com/p/X/?img_index=3')).toBe(3);
    expect(instagramSlide('https://www.instagram.com/p/X/')).toBeNull();
    expect(instagramSlide('https://www.instagram.com/p/X/?img_index=99')).toBeNull();
  });
});
