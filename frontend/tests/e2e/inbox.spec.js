// Reels that arrive from outside the app (share sheet, iPhone Shortcut, offline), the Friday pick card
// and notification tap, and a walk past a place I'm keen on (nearby alert).
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, anonClient, cleanUp, entriesIn, hasTestProject, ok, signIn, unique } from '../db/helpers.js';
import { blockRealWorld, fakeReelLookup, googleDetails, googlePlace, logIn, newCollection, toast } from './helpers.js';

test.skip(!hasTestProject, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY');
test.beforeEach(({ page }) => blockRealWorld(page));

let one;
let inboxId;
const savedToTbd = [];

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  const [tbd] = await ok(one.client.from('collections').select('id').eq('owner_id', one.userId).eq('is_inbox', true));
  inboxId = tbd?.id;
});
// TBD isn't named t-…, so only the places these tests put there are removed.
test.afterAll(async () => {
  for (const placeId of savedToTbd) await one.client.rpc('delete_place', { p_collection_id: inboxId, p_place_id: placeId });
  await cleanUp(one);
});

// A lookup that finds the place, so the reel saves itself into TBD.
function lookupFinds(page, label, lat, lng) {
  const place = googlePlace(unique(label), lat, lng);
  const reelUrl = `https://www.instagram.com/reel/${unique('IN')}/`;
  return { place, reelUrl, ready: fakeReelLookup(page, { reelUrl, placeName: place.name, maps: { success: true, candidates: [place], details: googleDetails(place, lat, lng) } }) };
}
const inTbd = async (name) => {
  const found = (await entriesIn(one.client, inboxId)).find((p) => p.name === name);
  if (found && !savedToTbd.includes(found.id)) savedToTbd.push(found.id);
  return found;
};

test('Share reels into the app', async ({ page, context }) => {
  test.skip(!inboxId, 'This account has no TBD collection');
  test.setTimeout(120000);

  await test.step('I share a reel and it saves to TBD as Keen, no taps', async () => {
    const { place, reelUrl, ready } = lookupFinds(page, 'Shared Sheet', -37.751, 144.851);
    await ready;
    await logIn(page);
    await page.goto(`/?url=${encodeURIComponent(reelUrl)}`);
    await toast(page, `"${place.name}" saved to`);
    await expect.poll(() => inTbd(place.name)).toMatchObject({ reactions: { [one.userId]: 'keen' } });
    await page.unroute('**/api/enrich-reel');
  });

  await test.step('I tap Finish on a reel with no clear place and pick it', async () => {
    const guess = unique('Guess Name');
    await fakeReelLookup(page, { reelUrl: 'https://www.instagram.com/reel/NOPLACE/', placeName: guess, maps: { success: false, candidates: [] } });
    await page.goto(`/?url=${encodeURIComponent(`https://www.instagram.com/reel/${unique('NP')}/`)}`);
    const card = page.locator('.inbox-card.needs-place');
    await expect(card).toContainText("couldn't tell which place");
    await card.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByLabel('Name *')).toHaveValue(guess);
    await page.getByRole('button', { name: 'Add place' }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(() => inTbd(guess)).toBeTruthy();
    await page.unroute('**/api/enrich-reel');
  });

  await test.step('I share a reel offline and it saves when I am back online', async () => {
    const { place, reelUrl, ready } = lookupFinds(page, 'Offline Share', -37.752, 144.852);
    await ready;
    // One more load online, so the offline copy of the app is saved.
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await context.setOffline(true);
    await page.goto(`/?url=${encodeURIComponent(reelUrl)}`).catch(() => {});
    await expect(page.locator('.inbox-card.offline')).toContainText("when you're back online", { timeout: 15000 });
    await context.setOffline(false);
    await expect.poll(() => inTbd(place.name), { timeout: 20000 }).toBeTruthy();
    await page.unroute('**/api/enrich-reel');
  });

  await test.step('I open the app and it picks up a reel from my Shortcut', async () => {
    const { place, reelUrl, ready } = lookupFinds(page, 'Shortcut Share', -37.753, 144.853);
    await ready;
    const key = await ok(one.client.rpc('get_shortcut_key'));
    expect(await ok(anonClient().rpc('save_shared_reel', { p_key: key, p_url: reelUrl }))).toBe('saved');
    await page.reload();
    await expect.poll(() => inTbd(place.name), { timeout: 20000 }).toBeTruthy();
    expect(await ok(one.client.from('shared_reels').select('id').eq('url', reelUrl))).toHaveLength(0);
  });
});

test('Friday pick', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  const spot = await newCollection(one, 'e2e-friday');
  const ids = [];
  for (let i = 0; i < 3; i += 1) ids.push(await addPlace(one.client, spot.id, { name: unique(`Friday ${i}`) }));

  await test.step('I see the Friday pick card', async () => {
    await logIn(page);
    await expect(page.getByRole('region', { name: 'Friday pick' })).toBeVisible({ timeout: 15000 });
  });
  await test.step('I tap "Not now" and it stays hidden after a reload', async () => {
    await page.getByRole('region', { name: 'Friday pick' }).getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('region', { name: 'Friday pick' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Friday pick' })).toHaveCount(0);
  });
  await test.step('I tap the push and that place opens', async () => {
    const { data } = await one.client.from('collection_places').select('custom_name').eq('place_id', ids[1]).single();
    await page.goto(`/?pick=${ids[1]}`);
    await expect(page.getByRole('dialog', { name: data.custom_name })).toBeVisible();
  });
});

test.describe('Nearby alert', () => {
  // Start 11 km away, with nearby alerts switched on.
  test.use({ geolocation: { latitude: -37.6, longitude: 144.8 } });

  test('Walk past places I am keen on', async ({ page, context }) => {
    const walk = await newCollection(one, 'e2e-walk', '🚶');
    const first = unique('Keen Corner');
    const second = unique('Keen Next Door');
    const firstId = await addPlace(one.client, walk.id, { name: first, lat: -37.7, lng: 144.8 });
    const secondId = await addPlace(one.client, walk.id, { name: second, lat: -37.71, lng: 144.8 });
    for (const id of [firstId, secondId]) {
      await ok(one.client.from('reactions').insert({ collection_id: walk.id, place_id: id, user_id: one.userId, feeling: 'keen' }));
    }
    await page.addInitScript(() => localStorage.setItem('reelmap:near-alerts', 'true'));

    await test.step('I log in far away and get no alert', async () => {
      await logIn(page);
      await page.waitForTimeout(1500);
      await expect(page.getByText("You're keen on it!")).toHaveCount(0);
    });
    await test.step('I walk to the first place, get an alert and tap Open', async () => {
      await context.setGeolocation({ latitude: -37.70003, longitude: 144.8 });
      await toast(page, `You're right by ${first}. You're keen on it!`);
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(page.getByRole('dialog', { name: first })).toBeVisible();
      await page.keyboard.press('Escape');
    });
    await test.step('I walk on to the second place and get no alert (15 min gap)', async () => {
      await context.setGeolocation({ latitude: -37.71003, longitude: 144.8 });
      await page.waitForTimeout(3000);
      await expect(page.getByText(`${second}. You're keen on it!`)).toHaveCount(0);
    });
  });
});
