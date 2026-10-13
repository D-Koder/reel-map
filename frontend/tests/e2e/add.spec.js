// Adding places: manual + Verify + a new collection, a reel with several Google matches,
// and every duplicate warning (pill, adding, copying).
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, signIn, unique } from '../db/helpers.js';
import {
  board, fakeGoogleMaps, fakeReelLookup, googleDetails, googlePlace, logIn, nav, newCollection, toast,
} from './helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');

let one;
let main;
let other;
const sameReel = `https://www.instagram.com/reel/${unique('DUP')}/`;
const spot = { lat: -37.8001, lng: 144.9001 };

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  main = await newCollection(one, 'e2e-add');
  other = await newCollection(one, 'e2e-add-other', '📦');
  // The same reel saved twice in one collection → both get the Duplicate pill.
  await addPlace(one.client, main.id, { name: unique('Dup A'), reelUrl: sameReel, lat: -37.81, lng: 144.95 });
  await addPlace(one.client, main.id, { name: unique('Dup B'), reelUrl: sameReel, lat: -37.82, lng: 144.94 });
  // A place at `spot` in both collections, for the add and copy warnings.
  main.spotName = unique('Spot Main');
  other.spotName = unique('Spot Other');
  await addPlace(one.client, main.id, { name: main.spotName, ...spot });
  other.spotId = await addPlace(one.client, other.id, { name: other.spotName, ...spot });
});
test.afterAll(() => cleanUp(one));

const openAdd = async (page) => {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Add a place' }).click();
};
const chooseCollection = (page, id) => page.locator('label.field', { hasText: 'Collection' }).locator('select').selectOption(id);

test('manual add → Verify picks from Google → into a brand-new collection', async ({ page }) => {
  const first = googlePlace(unique('Verify Cafe'), -37.7901, 144.9801);
  const second = googlePlace(unique('Verify Cafe Two'), -37.7902, 144.9802);
  await fakeGoogleMaps(page, { candidates: [first, second], details: { [second.url]: googleDetails(second, -37.7902, 144.9802, { phone: '+61 3 9000 0000' }) } });
  const newName = unique('Made in sheet');
  const typed = unique('Typed name');

  await test.step('log in, open Add, choose Manual', async () => {
    await logIn(page);
    await openAdd(page);
    await page.getByRole('button', { name: 'Manual' }).click();
  });
  await test.step('type a name and an address, then Verify', async () => {
    await page.getByLabel('Name *').fill(typed);
    await page.getByLabel('Address').fill('Somewhere St, Melbourne');
    await page.getByRole('button', { name: 'Verify' }).click();
  });
  await test.step('two Google matches: pick the second and confirm', async () => {
    const dialog = page.getByRole('dialog', { name: 'Verify location' });
    await expect(dialog).toBeVisible();
    await dialog.getByText(second.name).click();
    await dialog.getByRole('button', { name: 'Confirm place' }).click();
    await expect(page.getByLabel('Address')).toHaveValue(second.address);
    // The name I typed is kept.
    await expect(page.getByLabel('Name *')).toHaveValue(typed);
  });
  await test.step('"+ New collection" makes one and selects it', async () => {
    await page.locator('label.field', { hasText: 'Collection' }).locator('select').selectOption({ label: '+ New collection' });
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await dialog.getByPlaceholder('e.g. Date nights').fill(newName);
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toBeHidden();
  });
  await test.step('add: saved in the new collection with the Google pin', async () => {
    await page.getByRole('button', { name: 'Add place' }).click();
    await nav(page, 'Home');
    await expect(page.getByText(typed)).toBeVisible({ timeout: 15000 });
    const { data: made } = await one.client.from('collections').select('id').eq('name', newName).single();
    const [saved] = await entriesIn(one.client, made.id);
    expect(saved).toMatchObject({ name: typed, lat: -37.7902, lng: 144.9802 });
    // "Made in sheet" isn't named t-…, so remove it here.
    await one.client.from('collections').delete().eq('id', made.id);
  });
});

test('reel with several Google matches → I choose → saved', async ({ page }) => {
  const a = googlePlace(unique('Pho Bar Richmond'), -37.8201, 144.9901);
  const b = googlePlace(unique('Pho Bar CBD'), -37.8202, 144.9902);
  const reelUrl = `https://www.instagram.com/reel/${unique('MANY')}/`;
  await fakeReelLookup(page, { reelUrl, placeName: '', location: 'Melbourne', venue: 'pho night', maps: { success: true, candidates: [a, b], selectedCandidate: null, details: null } });
  await fakeGoogleMaps(page, { details: { [b.url]: googleDetails(b, -37.8202, 144.9902) } });

  await test.step('paste the reel', async () => {
    await logIn(page);
    await openAdd(page);
    await page.getByPlaceholder('Instagram reel or TikTok video link…').fill(reelUrl);
    await page.getByRole('button', { name: 'Confirm' }).click();
  });
  await test.step('both matches are listed; choose the CBD one', async () => {
    const matches = page.getByRole('group', { name: 'Google Maps matches' });
    await expect(matches.getByRole('button')).toHaveCount(2);
    await matches.getByText(b.name).click();
    await expect(page.getByLabel('Name *')).toHaveValue(b.name);
  });
  await test.step('add it', async () => {
    await chooseCollection(page, main.id);
    await page.getByRole('button', { name: 'Add place' }).click();
    await expect.poll(async () => (await entriesIn(one.client, main.id)).find((p) => p.name === b.name)?.lat).toBe(-37.8202);
  });
});

test('duplicates: pill → add warning → copy warning → shared reel already saved', async ({ page }) => {
  await test.step('the same reel twice shows the Duplicate pill on both', async () => {
    await logIn(page);
    await expect(board(page, main.id).getByTitle('Saved more than once in this collection')).toHaveCount(2);
  });

  await test.step('adding a place at a spot this collection has → warning → Cancel adds nothing', async () => {
    const twin = googlePlace(unique('Twin'), spot.lat, spot.lng);
    await fakeReelLookup(page, { reelUrl: 'https://www.instagram.com/reel/TWIN/', placeName: twin.name, maps: { success: true, candidates: [], details: googleDetails(twin, spot.lat, spot.lng) } });
    await openAdd(page);
    await page.getByPlaceholder('Instagram reel or TikTok video link…').fill('https://www.instagram.com/reel/TWIN/');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByLabel('Name *')).toHaveValue(twin.name);
    await chooseCollection(page, main.id);
    await page.getByRole('button', { name: 'Add place' }).click();
    const warning = page.getByRole('dialog', { name: 'This collection already has this location' });
    await expect(warning).toContainText(main.spotName);
    await warning.getByRole('button', { name: 'Cancel' }).click();
    expect((await entriesIn(one.client, main.id)).some((p) => p.name === twin.name)).toBe(false);
    await page.keyboard.press('Escape');
  });

  await test.step('copying into a collection that has the spot → warning → Cancel copies nothing', async () => {
    await board(page, other.id).getByText(other.spotName).click();
    await page.getByRole('dialog', { name: other.spotName }).getByRole('button', { name: 'Edit place' }).click();
    const edit = page.getByRole('dialog', { name: `Edit ${other.spotName}` });
    await edit.locator('.field', { hasText: 'Copy to another collection' }).locator('select').selectOption(main.id);
    await edit.getByRole('button', { name: 'Copy' }).click();
    const warning = page.getByRole('dialog', { name: 'That collection already has this location' });
    await expect(warning).toContainText(main.spotName);
    await warning.getByRole('button', { name: 'Cancel' }).click();
    expect((await entriesIn(one.client, main.id)).some((p) => p.id === other.spotId)).toBe(false);
  });

  await test.step('sharing a reel that is already saved says where it is', async () => {
    await page.goto(`/?url=${encodeURIComponent(sameReel)}`);
    await toast(page, `Already saved in ${main.name}`);
  });
});
