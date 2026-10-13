// Browser journeys on a phone-sized screen, signed in as Test One. Each journey taps through the real
// app, then checks the database to make sure the change really saved. Seeds its own collections first
// and deletes them after. The reel lookup (/api/enrich-reel) is faked, so no Instagram or Google.
import { expect, test } from '@playwright/test';
import { blockRealWorld } from './helpers.js';
import { ACCOUNTS, addPlace, admin, cleanUp, entriesIn, env, hasDb, ok, shareWith, signIn, tempUser, unique } from '../db/helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');
test.beforeEach(({ page }) => blockRealWorld(page));

let one;
let two;
const seed = {};
const names = { booked: unique('Booked Bistro'), keen: unique('Keen Cafe'), far: unique('Far Diner'), live: unique('Live Ramen'), twinA: unique('Twin A'), twinB: unique('Twin B') };

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  two = await signIn(ACCOUNTS.two);
  seed.main = { name: unique('e2e'), id: null };
  seed.later = { name: unique('e2e-later'), id: null };
  seed.main.id = await ok(one.client.rpc('create_collection', { p_name: seed.main.name, p_emoji: '🧪' }));
  seed.later.id = await ok(one.client.rpc('create_collection', { p_name: seed.later.name, p_emoji: '📦' }));
  seed.booked = await addPlace(one.client, seed.main.id, { name: names.booked, lat: -37.8155, lng: 144.9714, note: 'Booth by the window' });
  seed.keen = await addPlace(one.client, seed.main.id, { name: names.keen, category: 'cafe', lat: -37.8136, lng: 144.9631 });
  seed.far = await addPlace(one.client, seed.main.id, { name: names.far, lat: -37.85, lng: 144.99 });
  await ok(one.client.from('bookings').insert({
    collection_id: seed.main.id, place_id: seed.booked, planned_at: new Date(Date.now() + 2 * 86400000).toISOString(),
  }));
  await ok(one.client.from('reactions').insert({ collection_id: seed.main.id, place_id: seed.keen, user_id: one.userId, feeling: 'keen' }));
  await shareWith(one, two, seed.main.id);
  // Two places at one spot (in Later, so Home's counts for the main collection don't change).
  await addPlace(one.client, seed.later.id, { name: names.twinA, lat: -37.817, lng: 144.95 });
  await addPlace(one.client, seed.later.id, { name: names.twinB, lat: -37.817, lng: 144.95 });
});

test.afterAll(() => cleanUp(one, two));

async function logIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(ACCOUNTS.one);
  await page.getByLabel('Password').fill(env.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
}

const board = (page, id = seed.main.id) => page.locator(`#collection-${id}`);
const toMap = (page) => page.locator('.bottom-nav').getByRole('button', { name: 'Map' }).click();
const toHome = (page) => page.locator('.bottom-nav').getByRole('button', { name: 'Home' }).click();
const placeIn = async (collectionId, placeId) => (await entriesIn(one.client, collectionId)).find((p) => p.id === placeId);

test('Home', async ({ page }) => {
  await test.step('I log in', () => logIn(page));

  await test.step('I see my booking in Up Next and open it', async () => {
    const ticket = page.locator('.ticket');
    await expect(ticket).toBeVisible();
    await expect(ticket.locator('.ticket-tag')).toContainText('Booked');
    // Other test data can own the card; ours is checked whenever it is the soonest booking.
    if (await ticket.locator('.ticket-title').textContent() === names.booked) {
      await expect(ticket.locator('.ticket-when')).toContainText(seed.main.name);
      await ticket.click();
      const modal = page.getByRole('dialog', { name: names.booked });
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Russell St');
      await modal.getByRole('button', { name: 'Close' }).click();
    }
  });

  await test.step('I see the member count and place count on a collection', async () => {
    await expect(board(page).locator('.collection-toggle')).toContainText('2 · 3 places');
  });

  await test.step('Test Two adds a place and I see it without refreshing', async () => {
    seed.live = await addPlace(two.client, seed.main.id, { name: names.live, lat: -37.812, lng: 144.966 });
    await expect(board(page).getByText(names.live)).toBeVisible({ timeout: 15000 });
    await expect(board(page).locator('.collection-toggle')).toContainText('4 places');
  });

  const modal = page.getByRole('dialog', { name: names.far });
  await test.step('I open a place and vote Maybe', async () => {
    await board(page).getByText(names.far).click();
    await expect(modal).toBeVisible();
    const maybe = modal.getByRole('radio', { name: /Maybe/ });
    await maybe.click();
    await expect(maybe).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await placeIn(seed.main.id, seed.far))?.reactions[one.userId]).toBe('maybe');
  });

  const renamed = `${names.far} 2`;
  const sheet = page.getByRole('dialog', { name: new RegExp(`^Edit ${names.far}`) });
  await test.step('I rename it', async () => {
    await modal.getByRole('button', { name: 'Edit place' }).click();
    await sheet.getByLabel('Name').fill(renamed);
    await sheet.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(async () => (await placeIn(seed.main.id, seed.far))?.name).toBe(renamed);
  });

  await test.step('I copy it to Later', async () => {
    // Saving may close the edit sheet; open it again from wherever we are.
    const edit = page.getByRole('dialog', { name: /^Edit / });
    if (!(await edit.isVisible())) {
      const open = page.getByRole('dialog', { name: renamed });
      if (!(await open.isVisible())) await board(page).getByText(renamed).click();
      await open.getByRole('button', { name: 'Edit place' }).click();
    }
    await edit.locator('.field', { hasText: 'Copy to another collection' }).locator('select').selectOption(seed.later.id);
    await edit.getByRole('button', { name: 'Copy' }).click();
    await expect.poll(() => placeIn(seed.later.id, seed.far)).toBeTruthy();
    await edit.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('I move a different place (Keen Cafe) to Later', async () => {
    await page.keyboard.press('Escape');
    await board(page).getByText(names.keen).click();
    await page.getByRole('dialog', { name: names.keen }).getByRole('button', { name: 'Edit place' }).click();
    const edit = page.getByRole('dialog', { name: `Edit ${names.keen}` });
    await edit.locator('.field', { hasText: 'Move to another collection' }).locator('select').selectOption(seed.later.id);
    await edit.getByRole('button', { name: 'Move' }).click();
    await expect.poll(() => placeIn(seed.later.id, seed.keen)).toBeTruthy();
    await expect.poll(() => placeIn(seed.main.id, seed.keen)).toBeUndefined();
  });

  await test.step('I delete the copy from Later; Undo shows, then it is gone', async () => {
    await page.keyboard.press('Escape');
    await board(page, seed.later.id).getByText(renamed).click();
    await page.getByRole('dialog', { name: renamed }).getByRole('button', { name: 'Delete place' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect.poll(() => placeIn(seed.later.id, seed.far), { timeout: 20000 }).toBeUndefined();
    // Still in the main collection.
    expect(await placeIn(seed.main.id, seed.far)).toBeTruthy();
  });

  await test.step('I collapse a collection, reload, and open it again', async () => {
    const header = board(page).locator('.collection-toggle');
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(board(page).locator('.collection-body')).toHaveCount(0);
    await page.reload();
    await expect(board(page).locator('.collection-toggle')).toHaveAttribute('aria-expanded', 'false');
    await board(page).locator('.collection-toggle').click();
    await expect(board(page).locator('.collection-body')).toBeVisible();
  });
});

test('Add a place from a reel link', async ({ page }) => {
  const reelUrl = `https://www.instagram.com/reel/${unique('E2E')}/`;
  const placeName = unique('Reel Gimlet');
  await page.route('**/api/enrich-reel', (route) => route.fulfill({
    json: {
      success: true, reelUrl, caption: `Date night 🍸\n📍 ${placeName}, Russell St`, creator: 'melbfoodie',
      placeName: '', location: `${placeName}, Russell St`, hashtags: [], venue: `${placeName}, Russell St`,
      maps: {
        success: true, candidates: [], selectedCandidate: null,
        details: { name: placeName, address: '33 Russell St, Melbourne VIC 3000', latitude: -37.8111, longitude: 144.9688, mapsUrl: 'https://www.google.com/maps/place/Gimlet', source: 'google_maps' },
      },
    },
  }));

  await test.step('I log in', () => logIn(page));
  await test.step('I paste the link and confirm', async () => {
    await page.locator('.bottom-nav').getByRole('button', { name: 'Add a place' }).click();
    await page.getByPlaceholder('Instagram reel or TikTok video link…').fill(reelUrl);
    await page.getByRole('button', { name: 'Confirm' }).click();
  });
  await test.step('I see the form filled in from the reel', async () => {
    await expect(page.getByLabel('Name *')).toHaveValue(placeName);
  });
  await test.step('I pick the collection, vote Keen and tap Add', async () => {
    await page.locator('label.field', { hasText: 'Collection' }).locator('select').selectOption(seed.main.id);
    await page.getByRole('radiogroup', { name: 'Your vibe' }).getByRole('radio', { name: /Keen/ }).click();
    await page.getByRole('button', { name: 'Add place' }).click();
  });
  await test.step('I see it on Home, saved with its pin, reel and vote', async () => {
    await toHome(page);
    await expect(board(page).getByText(placeName)).toBeVisible({ timeout: 15000 });
    const saved = (await entriesIn(one.client, seed.main.id)).find((p) => p.name === placeName);
    expect(saved).toMatchObject({ lat: -37.8111, lng: 144.9688, reactions: { [one.userId]: 'keen' } });
    const { data } = await one.client.from('places').select('reel_url').eq('id', saved.id).single();
    expect(data.reel_url).toBe(reelUrl);
  });
});

test.describe('Map', () => {
  test.skip(!env.mapbox, 'Needs VITE_MAPBOX_TOKEN in frontend/.env.local');

  test('Find a place on the map', async ({ page }) => {
    const pin = (name) => page.locator(`.mapbox-pin[aria-label="${name}"]`);

    await test.step('I log in and open the map', async () => {
      await logIn(page);
      await toMap(page);
    });
    await test.step('I see pins for my saved places', async () => {
      await expect(pin(names.booked)).toHaveCount(1, { timeout: 20000 });
      await expect(pin(names.live)).toHaveCount(1);
    });
    await test.step('I hide Food and the food pins go', async () => {
      const food = page.getByRole('toolbar', { name: 'Filter pins' }).getByRole('button', { name: 'Food' });
      await food.click();
      await expect(food).toHaveAttribute('aria-pressed', 'false');
      await expect(pin(names.booked)).toHaveCount(0);
      await page.getByRole('toolbar', { name: 'Filter pins' }).getByRole('button', { name: 'All' }).click();
      await expect(pin(names.booked)).toHaveCount(1);
    });
    await test.step('I hide the test collection and its pins go', async () => {
      const toolbar = page.getByRole('toolbar', { name: 'Filter by collection' });
      await toolbar.getByRole('button', { name: new RegExp(seed.main.name) }).click();
      await expect(pin(names.booked)).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'All collections' }).click();
      await expect(pin(names.booked)).toHaveCount(1);
    });
    await test.step('I tap a pin and the place opens with its details', async () => {
      await pin(names.booked).click({ force: true });
      const modal = page.getByRole('dialog', { name: names.booked });
      await expect(modal).toContainText('Russell St');
      await modal.getByRole('button', { name: 'Close' }).click();
      await expect(modal).toBeHidden();
    });
    await test.step('I search an address and choose a result', async () => {
      await page.getByLabel('Search a place or address').fill('Flinders Street Station');
      const results = page.locator('.map-search-results .map-search-result');
      await expect(results.first()).toBeVisible({ timeout: 15000 });
      await results.first().click();
      await expect(page.locator('.map-search-results')).toHaveCount(0);
    });
    await test.step('I tap a "2 places here" pin and choose one', async () => {
      const shared = page.locator(`.mapbox-pin[aria-label="${names.twinA}, 2 places here"], .mapbox-pin[aria-label="${names.twinB}, 2 places here"]`);
      await expect(shared).toHaveCount(1);
      await shared.click({ force: true });
      const picker = page.getByRole('dialog', { name: 'Places at this location' });
      await expect(picker).toContainText('2 places saved here');
      await picker.getByText(names.twinB).click();
      await expect(page.getByRole('dialog', { name: names.twinB })).toBeVisible();
      await page.keyboard.press('Escape');
    });
    await test.step('I see my blue dot and tap "Go to my location"', async () => {
      await expect(page.locator('.my-location-dot')).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Go to my location' }).click();
      await expect(page.getByText("Can't find your location yet")).toHaveCount(0);
    });
    await test.step('I tap a place in Shown places, then Open place', async () => {
      await page.locator('.map-place-list-title').click();
      await page.locator('.map-place-item', { hasText: names.booked }).click();
      await expect(page.locator('.map-focus-label strong')).toHaveText(names.booked);
      await expect(pin(names.booked)).toHaveClass(/map-pin-focused/);
      await page.locator('.map-focus-open').click();
      await expect(page.getByRole('dialog', { name: names.booked })).toBeVisible();
    });
  });
});

test('Offline', async ({ page, context }) => {
  await test.step('I log in', () => logIn(page));
  await test.step('I go offline and see the banner', async () => {
    await context.setOffline(true);
    await expect(page.locator('.offline-banner')).toBeVisible();
    await expect(board(page).getByText(names.booked)).toBeVisible();
  });
  await test.step('I reload with no signal and the app still opens', async () => {
    await page.reload().catch(() => {});
    await expect(page.locator('.offline-banner')).toBeVisible({ timeout: 15000 });
    await expect(board(page).getByText(names.booked)).toBeVisible();
  });
  await test.step('I come back online and the banner goes', async () => {
    await context.setOffline(false);
    await expect(page.locator('.offline-banner')).toHaveCount(0);
  });
});

test('Sign up and reset my password', async ({ page }) => {
  const email = `${unique('signup')}@example.com`;
  // Supabase only sends a few emails an hour on its built-in mailer, so "rate limit" also counts as reached.
  const sent = /check your email|reset link is on its way|rate limit/i;

  await test.step('I create an account', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: /Create an account/ }).click();
    await page.getByLabel('Your name').fill('E2E Signup');
    await page.getByLabel('Country (optional)').fill('Australia');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(env.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    // Either "check your email", or straight in when email confirmation is off.
    await expect(page.locator('.auth-message').or(page.getByRole('button', { name: 'Settings' }))).toBeVisible();
    if (await page.locator('.auth-message').isVisible()) await expect(page.locator('.auth-message')).toHaveText(sent);
  });

  await test.step('I tap Forgot password', async () => {
    await page.goto('/');
    if (await page.getByRole('button', { name: 'Settings' }).isVisible()) return; // Signed straight in.
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    // A made-up address: no real inbox gets an email.
    await page.getByLabel('Email').fill(`${unique('nobody')}@example.com`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.auth-message')).toHaveText(sent);
  });

  await test.step('I see my country was kept, then the new account is removed', async () => {
    const service = admin();
    if (!service) return;
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    const user = data?.users?.find((u) => u.email === email);
    expect(user?.user_metadata?.country).toBe('Australia');
    if (user) await service.auth.admin.deleteUser(user.id);
  });

  await test.step('I open the reset link, set a new password and log in', async () => {
    const service = admin();
    if (!service) return;
    const resetter = await tempUser('reset');
    try {
      // The same link the email holds. http://localhost:5173 must be in Supabase → Auth → Redirect URLs.
      const { data, error } = await service.auth.admin.generateLink({ type: 'recovery', email: resetter.email, options: { redirectTo: 'http://localhost:5173' } });
      expect(error).toBeNull();
      await page.goto(data.properties.action_link);
      await page.getByLabel('New password').fill(`${env.password}-new`);
      await page.getByRole('button', { name: 'Save password' }).click();
      await expect(page.getByText('Password updated')).toBeVisible();
      await expect(signIn(resetter.email, `${env.password}-new`)).resolves.toBeTruthy();
    } finally {
      await resetter.remove();
    }
  });
});
