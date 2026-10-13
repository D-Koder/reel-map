// Browser journeys on a phone-sized screen, signed in as Test One. Each journey taps through the real
// app, then checks the database to make sure the change really saved. Seeds its own collections first
// and deletes them after. The reel lookup (/api/enrich-reel) is faked, so no Instagram or Google.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, admin, cleanUp, entriesIn, env, hasDb, ok, shareWith, signIn, unique } from '../db/helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');

let one;
let two;
const seed = {};
const names = { booked: unique('Booked Bistro'), keen: unique('Keen Cafe'), far: unique('Far Diner'), live: unique('Live Ramen') };

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

test('Home: Up Next → place modal → vote → edit → copy → move → delete, plus live updates and collapsing', async ({ page }) => {
  await test.step('log in', () => logIn(page));

  await test.step('Up Next shows the booking with its collection, and opens it', async () => {
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

  await test.step('collection shows member count and place count', async () => {
    await expect(board(page).locator('.collection-toggle')).toContainText('2 · 3 places');
  });

  await test.step('a place Test Two adds appears live, without a refresh', async () => {
    seed.live = await addPlace(two.client, seed.main.id, { name: names.live, lat: -37.812, lng: 144.966 });
    await expect(board(page).getByText(names.live)).toBeVisible({ timeout: 15000 });
    await expect(board(page).locator('.collection-toggle')).toContainText('4 places');
  });

  const modal = page.getByRole('dialog', { name: names.far });
  await test.step('open a place and vote Maybe', async () => {
    await board(page).getByText(names.far).click();
    await expect(modal).toBeVisible();
    const maybe = modal.getByRole('radio', { name: /Maybe/ });
    await maybe.click();
    await expect(maybe).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await placeIn(seed.main.id, seed.far))?.reactions[one.userId]).toBe('maybe');
  });

  const renamed = `${names.far} 2`;
  const sheet = page.getByRole('dialog', { name: new RegExp(`^Edit ${names.far}`) });
  await test.step('edit: rename it', async () => {
    await modal.getByRole('button', { name: 'Edit place' }).click();
    await sheet.getByLabel('Name').fill(renamed);
    await sheet.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(async () => (await placeIn(seed.main.id, seed.far))?.name).toBe(renamed);
  });

  await test.step('copy it to Later', async () => {
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

  await test.step('move a different place (Keen Cafe) to Later', async () => {
    await page.keyboard.press('Escape');
    await board(page).getByText(names.keen).click();
    await page.getByRole('dialog', { name: names.keen }).getByRole('button', { name: 'Edit place' }).click();
    const edit = page.getByRole('dialog', { name: `Edit ${names.keen}` });
    await edit.locator('.field', { hasText: 'Move to another collection' }).locator('select').selectOption(seed.later.id);
    await edit.getByRole('button', { name: 'Move' }).click();
    await expect.poll(() => placeIn(seed.later.id, seed.keen)).toBeTruthy();
    await expect.poll(() => placeIn(seed.main.id, seed.keen)).toBeUndefined();
  });

  await test.step('delete the copy from Later (Undo toast first, then it is gone)', async () => {
    await page.keyboard.press('Escape');
    await board(page, seed.later.id).getByText(renamed).click();
    await page.getByRole('dialog', { name: renamed }).getByRole('button', { name: 'Delete place' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect.poll(() => placeIn(seed.later.id, seed.far), { timeout: 20000 }).toBeUndefined();
    // Still in the main collection.
    expect(await placeIn(seed.main.id, seed.far)).toBeTruthy();
  });

  await test.step('collapse a collection: stays closed after reload, opens again', async () => {
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

test('Add a place by pasting a reel link → it is saved with the Google details', async ({ page }) => {
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

  await test.step('log in', () => logIn(page));
  await test.step('paste the link and confirm', async () => {
    await page.locator('.bottom-nav').getByRole('button', { name: 'Add a place' }).click();
    await page.getByPlaceholder('Instagram reel or TikTok video link…').fill(reelUrl);
    await page.getByRole('button', { name: 'Confirm' }).click();
  });
  await test.step('the form is filled from the reel', async () => {
    await expect(page.getByLabel('Name *')).toHaveValue(placeName);
  });
  await test.step('pick the collection, vote Keen, add', async () => {
    await page.locator('label.field', { hasText: 'Collection' }).locator('select').selectOption(seed.main.id);
    await page.getByRole('radiogroup', { name: 'Your vibe' }).getByRole('radio', { name: /Keen/ }).click();
    await page.getByRole('button', { name: 'Add place' }).click();
  });
  await test.step('it shows on Home and is saved with its pin, reel and vote', async () => {
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

  test('pins → filters → tap a pin → search → shown places list → open place', async ({ page }) => {
    const pin = (name) => page.locator(`.mapbox-pin[aria-label="${name}"]`);

    await test.step('log in and open the map', async () => {
      await logIn(page);
      await toMap(page);
    });
    await test.step('pins show up for saved places', async () => {
      await expect(pin(names.booked)).toHaveCount(1, { timeout: 20000 });
      await expect(pin(names.live)).toHaveCount(1);
    });
    await test.step('category filter: hide Food, the food pins go', async () => {
      const food = page.getByRole('toolbar', { name: 'Filter pins' }).getByRole('button', { name: 'Food' });
      await food.click();
      await expect(food).toHaveAttribute('aria-pressed', 'false');
      await expect(pin(names.booked)).toHaveCount(0);
      await page.getByRole('toolbar', { name: 'Filter pins' }).getByRole('button', { name: 'All' }).click();
      await expect(pin(names.booked)).toHaveCount(1);
    });
    await test.step('collection filter: hide the test collection, its pins go', async () => {
      const toolbar = page.getByRole('toolbar', { name: 'Filter by collection' });
      await toolbar.getByRole('button', { name: new RegExp(seed.main.name) }).click();
      await expect(pin(names.booked)).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'All collections' }).click();
      await expect(pin(names.booked)).toHaveCount(1);
    });
    await test.step('tap a pin: the place modal opens with its details', async () => {
      await pin(names.booked).click({ force: true });
      const modal = page.getByRole('dialog', { name: names.booked });
      await expect(modal).toContainText('Russell St');
      await modal.getByRole('button', { name: 'Close' }).click();
      await expect(modal).toBeHidden();
    });
    await test.step('search an address: results show, choosing one closes them', async () => {
      await page.getByLabel('Search a place or address').fill('Flinders Street Station');
      const results = page.locator('.map-search-results .map-search-result');
      await expect(results.first()).toBeVisible({ timeout: 15000 });
      await results.first().click();
      await expect(page.locator('.map-search-results')).toHaveCount(0);
    });
    await test.step('Shown places: tap one → map goes to it → Open place', async () => {
      await page.locator('.map-place-list-title').click();
      await page.locator('.map-place-item', { hasText: names.booked }).click();
      await expect(page.locator('.map-focus-label strong')).toHaveText(names.booked);
      await expect(pin(names.booked)).toHaveClass(/map-pin-focused/);
      await page.locator('.map-focus-open').click();
      await expect(page.getByRole('dialog', { name: names.booked })).toBeVisible();
    });
  });
});

test('Offline: banner shows, saved places stay, banner goes when back online', async ({ page, context }) => {
  await test.step('log in', () => logIn(page));
  await test.step('go offline', async () => {
    await context.setOffline(true);
    await expect(page.locator('.offline-banner')).toBeVisible();
    await expect(board(page).getByText(names.booked)).toBeVisible();
  });
  await test.step('reload with no signal: the app still opens from its saved copy', async () => {
    await page.reload().catch(() => {});
    await expect(page.locator('.offline-banner')).toBeVisible({ timeout: 15000 });
    await expect(board(page).getByText(names.booked)).toBeVisible();
  });
  await test.step('back online', async () => {
    await context.setOffline(false);
    await expect(page.locator('.offline-banner')).toHaveCount(0);
  });
});

test('Sign up and forgot password screens', async ({ page }) => {
  const email = `${unique('signup')}@example.com`;
  // Supabase only sends a few emails an hour on its built-in mailer, so "rate limit" also counts as reached.
  const sent = /check your email|reset link is on its way|rate limit/i;

  await test.step('create an account', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: /Create an account/ }).click();
    await page.getByLabel('Your name').fill('E2E Signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(env.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    // Either "check your email", or straight in when email confirmation is off.
    await expect(page.locator('.auth-message').or(page.getByRole('button', { name: 'Settings' }))).toBeVisible();
    if (await page.locator('.auth-message').isVisible()) await expect(page.locator('.auth-message')).toHaveText(sent);
  });

  await test.step('forgot password', async () => {
    await page.goto('/');
    if (await page.getByRole('button', { name: 'Settings' }).isVisible()) return; // Signed straight in.
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(ACCOUNTS.two);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.auth-message')).toHaveText(sent);
  });

  await test.step('clean up the new account', async () => {
    const service = admin();
    if (!service) return;
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    const user = data?.users?.find((u) => u.email === email);
    if (user) await service.auth.admin.deleteUser(user.id);
  });
});
