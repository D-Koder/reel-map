// Shared bits for the browser journeys.
import { devices, expect } from '@playwright/test';
import { ACCOUNTS, env, ok, unique } from '../db/helpers.js';

export const BASE_URL = 'http://localhost:5173';

export async function logIn(page, email = ACCOUNTS.one, password = env.password) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
}

// A second phone, for journeys with two people. Same settings as the main one.
export async function secondPhone(browser) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: BASE_URL,
    geolocation: { latitude: -37.8183, longitude: 144.9671 },
    permissions: ['geolocation'],
  });
  return { context, page: await context.newPage() };
}

export const board = (page, id) => page.locator(`#collection-${id}`);
export const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name }).click();
export const toast = (page, text) => expect(page.getByText(text).first()).toBeVisible({ timeout: 15000 });

export async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.settings-drawer.open')).toBeVisible();
  return page.locator('.settings-drawer.open');
}
export const settingsRow = (page, name) => page.locator('.settings-drawer.open .collection-item', { hasText: name });

export async function newCollection(user, label, emoji = '🧪') {
  const name = unique(label);
  return { name, id: await ok(user.client.rpc('create_collection', { p_name: name, p_emoji: emoji })) };
}

// Fakes /api/enrich-reel with what a lookup would return.
export function fakeReelLookup(page, reply) {
  return page.route('**/api/enrich-reel', (route) => route.fulfill({ json: { success: true, hashtags: [], caption: '', ...reply } }));
}

// Fakes /api/scrape-location: `search` → candidates, `details` → one place's Google details.
export function fakeGoogleMaps(page, { candidates = [], details = {} }) {
  return page.route('**/api/scrape-location', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'search') return route.fulfill({ json: { success: true, candidates } });
    return route.fulfill({ json: details[body.placeUrl] ?? { name: body.placeName, address: body.placeAddress } });
  });
}

export const googlePlace = (name, lat, lng) => ({
  name,
  address: `${Math.abs(Math.round(lat * 1000))} Test St, Melbourne VIC 3000`,
  url: `https://www.google.com/maps/place/${encodeURIComponent(name)}/data=!3d${lat}!4d${lng}`,
});
export const googleDetails = (place, lat, lng, extra = {}) => ({
  name: place.name, address: place.address, latitude: lat, longitude: lng, mapsUrl: place.url, source: 'google_maps', ...extra,
});

// Safety net for every browser test: nothing leaves the test. Pop-ups (booking sites, reels, Maps)
// don't open, and phone, text and email links do nothing, even if a test taps one by mistake.
export async function blockRealWorld(page) {
  await page.addInitScript(() => {
    window.open = () => null;
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (link && /^(tel|sms|mailto):/i.test(link.getAttribute('href'))) event.preventDefault();
    }, true);
  });
}
