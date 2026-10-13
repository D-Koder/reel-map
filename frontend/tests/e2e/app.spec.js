// The app in a phone-sized browser: Up Next card, collapsing collections, map pins, the pin modal,
// map search, and the "Shown places" list. Seeds its own collection first, and deletes it after.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, cleanUp, env, hasDb, ok, signIn, unique } from '../db/helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');

let one;
let collection;
const names = { booked: unique('Booked Bistro'), keen: unique('Keen Cafe'), far: unique('Far Diner') };

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  collection = { name: unique('e2e'), id: null };
  collection.id = await ok(one.client.rpc('create_collection', { p_name: collection.name, p_emoji: '🧪' }));
  const booked = await addPlace(one.client, collection.id, { name: names.booked, lat: -37.8155, lng: 144.9714, note: 'Booth by the window' });
  const keen = await addPlace(one.client, collection.id, { name: names.keen, category: 'cafe', lat: -37.8136, lng: 144.9631 });
  await addPlace(one.client, collection.id, { name: names.far, lat: -37.8500, lng: 144.9900 });
  await ok(one.client.from('bookings').insert({
    collection_id: collection.id, place_id: booked, planned_at: new Date(Date.now() + 2 * 86400000).toISOString(),
  }));
  await ok(one.client.from('reactions').insert({ collection_id: collection.id, place_id: keen, user_id: one.userId, feeling: 'keen' }));
});

test.afterAll(() => cleanUp(one));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(ACCOUNTS.one);
  await page.getByLabel('Password').fill(env.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

const board = (page) => page.locator(`#collection-${collection.id}`);
const toMap = (page) => page.locator('.bottom-nav').getByRole('button', { name: 'Map' }).click();

test.describe('Home', () => {
  test('Up Next shows the booking first, with its details, and opens the place', async ({ page }) => {
    const ticket = page.locator('.ticket');
    // Other test data may own the card; this checks ours whenever it is the soonest booking.
    await expect(ticket).toBeVisible();
    await expect(ticket.locator('.ticket-tag')).toContainText('Booked');
    if (await ticket.locator('.ticket-title').textContent() === names.booked) {
      await expect(ticket.locator('.ticket-when')).toContainText(collection.name);
      await ticket.click();
      await expect(page.getByRole('dialog', { name: names.booked })).toBeVisible();
    }
  });

  test('a collection shows its place count and collapses / expands', async ({ page }) => {
    const header = board(page).locator('.collection-toggle');
    await expect(header).toContainText('3 places');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(board(page).locator('.collection-body')).toHaveCount(0);
    // Stays closed after a reload (saved on this device).
    await page.reload();
    await expect(board(page).locator('.collection-toggle')).toHaveAttribute('aria-expanded', 'false');
    await board(page).locator('.collection-toggle').click();
    await expect(board(page).locator('.collection-body')).toBeVisible();
  });
});

test.describe('Map', () => {
  test.skip(!process.env.VITE_MAPBOX_TOKEN && !env.mapbox, 'Needs VITE_MAPBOX_TOKEN in frontend/.env.local');

  test('pins show up for saved places', async ({ page }) => {
    await toMap(page);
    for (const name of Object.values(names)) {
      await expect(page.locator(`.mapbox-pin[aria-label="${name}"]`)).toHaveCount(1, { timeout: 20000 });
    }
  });

  test('tapping a pin opens the place modal with its details', async ({ page }) => {
    await toMap(page);
    const pin = page.locator(`.mapbox-pin[aria-label="${names.booked}"]`);
    await pin.click({ force: true });
    const modal = page.getByRole('dialog', { name: names.booked });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Russell St');
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toBeHidden();
  });

  test('search finds an address and shows results', async ({ page }) => {
    await toMap(page);
    await page.getByLabel('Search a place or address').fill('Flinders Street Station');
    const results = page.locator('.map-search-results .map-search-result');
    await expect(results.first()).toBeVisible({ timeout: 15000 });
    await results.first().click();
    await expect(page.locator('.map-search-results')).toHaveCount(0);
  });

  test('clicking a shown place goes to it on the map', async ({ page }) => {
    await toMap(page);
    await page.locator('.map-place-list-title').click();
    await page.locator('.map-place-item', { hasText: names.far }).click();
    await expect(page.locator('.map-focus-label strong')).toHaveText(names.far);
    await expect(page.locator(`.mapbox-pin[aria-label="${names.far}"]`)).toHaveClass(/map-pin-focused/);
    await page.locator('.map-focus-open').click();
    await expect(page.getByRole('dialog', { name: names.far })).toBeVisible();
  });
});
