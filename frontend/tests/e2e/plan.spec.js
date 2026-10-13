// Planning: the place card's details and buttons, nudging, booking with the checklist, the calendar
// file, marking done (🎉), and tidying up: Undo, Select → Move, and drag to reorder.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, ok, shareWith, signIn, unique } from '../db/helpers.js';
import { board, logIn, newCollection, toast } from './helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');

let one;
let two;
let plan;
let tidy;
let target;
const names = { bistro: unique('Plan Bistro'), diner: unique('Done Diner'), a: unique('Order A'), b: unique('Order B'), c: unique('Order C') };
const ids = {};
const allDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((days) => ({ days, time: 'Open 24 hours' }));

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  two = await signIn(ACCOUNTS.two);
  plan = await newCollection(one, 'e2e-plan', '💘');
  tidy = await newCollection(one, 'e2e-tidy', '🧹');
  target = await newCollection(one, 'e2e-target', '🎯');
  ids.bistro = await addPlace(one.client, plan.id, {
    name: names.bistro, phone: '+61 3 9000 0000', bookingUrl: 'https://www.opentable.com.au/r/plan-bistro', hours: allDay,
  });
  ids.diner = await addPlace(one.client, plan.id, { name: names.diner, lat: -37.83, lng: 144.97 });
  // Booked two hours ago, so "Mark as Done" is open (it unlocks an hour after the booking).
  await ok(one.client.from('bookings').insert({ collection_id: plan.id, place_id: ids.diner, planned_at: new Date(Date.now() - 2 * 3600000).toISOString() }));
  // Test Two is in the plan collection and hasn't voted, so the Nudge shows.
  await shareWith(one, two, plan.id);
  for (const key of ['a', 'b', 'c']) ids[key] = await addPlace(one.client, tidy.id, { name: names[key], lat: -37.84 - Math.random() / 100, lng: 144.9 });
});
test.afterAll(() => cleanUp(one, two));

test('plan a date: open now → call / reserve → nudge → book → calendar file → mark done → 🎉', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // No share sheet in the test browser, so the Nudge falls back to copying.
  await page.addInitScript(() => { delete Navigator.prototype.share; });
  const modal = page.getByRole('dialog', { name: names.bistro });

  await test.step('open the place: hours say it is open', async () => {
    await logIn(page);
    await board(page, plan.id).getByText(names.bistro).click();
    await expect(modal).toContainText('Open 24 hours');
  });
  await test.step('Call and Reserve links are right', async () => {
    await expect(modal.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+61390000000');
    await expect(modal.getByRole('link', { name: /Reserve a table/ })).toHaveAttribute('href', 'https://www.opentable.com.au/r/plan-bistro');
  });
  await test.step('Nudge Test Two: the message is copied', async () => {
    await modal.getByRole('button', { name: /Nudge/ }).click();
    await toast(page, 'Nudge copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Are you keen on ${names.bistro}?`);
  });
  await test.step('checklist: hours OK → pick a date → Save booking', async () => {
    await modal.getByRole('button', { name: 'Yes, proceed' }).click();
    await modal.locator('input[type="datetime-local"]').fill('2026-12-05T19:30');
    await modal.getByRole('button', { name: 'Save booking →' }).click();
    await expect.poll(async () => (await entriesIn(one.client, plan.id)).find((p) => p.id === ids.bistro)?.booking?.planned_at).toBeTruthy();
  });
  await test.step('Add to Calendar downloads a .ics file', async () => {
    const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await modal.getByRole('button', { name: 'Add to Calendar' }).click();
    const file = await download;
    expect.soft(file?.suggestedFilename(), 'no calendar file: the button only shows a toast (PinModal.jsx shadows lib/calendar.js)').toBe('reel-map-event.ics');
    await expect(modal).toContainText('All steps completed');
  });
  await test.step('mark another place done → celebration → saved', async () => {
    await page.keyboard.press('Escape');
    await board(page, plan.id).getByText(names.diner).click();
    await page.getByRole('dialog', { name: names.diner }).getByRole('button', { name: 'Mark as Done' }).click();
    const party = page.getByRole('dialog', { name: `You went to ${names.diner}!` });
    await expect(party).toBeVisible();
    await party.getByRole('button', { name: /Nice/ }).click();
    await expect(party).toBeHidden();
    await expect.poll(async () => (await entriesIn(one.client, plan.id)).find((p) => p.id === ids.diner)?.booking?.done_at).toBeTruthy();
  });
});

test('tidy up: delete → Undo brings it back → drag to reorder → Select everything → Move', async ({ page }) => {
  const placeIn = async (collectionId, id) => (await entriesIn(one.client, collectionId)).find((p) => p.id === id);
  await test.step('log in', () => logIn(page));

  await test.step('delete then Undo: it comes back and stays', async () => {
    await board(page, tidy.id).getByText(names.a).click();
    await page.getByRole('dialog', { name: names.a }).getByRole('button', { name: 'Delete place' }).click();
    await expect(board(page, tidy.id).getByText(names.a)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await toast(page, 'Restored');
    await expect(board(page, tidy.id).getByText(names.a)).toBeVisible();
    // Deletes are sent after 5 s; wait past that.
    await page.waitForTimeout(6500);
    expect(await placeIn(tidy.id, ids.a)).toBeTruthy();
  });

  await test.step('drag the first place down one (keyboard drag) → my order is saved', async () => {
    const rows = board(page, tidy.id).locator('.drag-handle');
    const firstName = (await rows.first().getAttribute('aria-label')).replace(/^Move /, '');
    await rows.first().focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    const moved = Object.entries(names).find(([, n]) => n === firstName)?.[0];
    await expect.poll(async () => {
      const rowsSaved = await ok(one.client.from('place_order').select('place_id, position').eq('user_id', one.userId).eq('collection_id', tidy.id));
      return rowsSaved.find((r) => r.place_id === ids[moved])?.position;
    }).toBe(1);
    await page.reload();
    await expect(board(page, tidy.id).locator('.drag-handle').nth(1)).toHaveAttribute('aria-label', `Move ${firstName}`);
  });

  await test.step('Select → Everything → Move to… another collection', async () => {
    await board(page, tidy.id).getByRole('button', { name: 'Select' }).click();
    await board(page, tidy.id).getByRole('button', { name: 'Everything' }).click();
    await expect(page.getByRole('region', { name: 'Selected places' })).toContainText('3 selected');
    await page.getByRole('button', { name: 'Move to…' }).click();
    await page.locator('.move-option', { hasText: target.name }).click();
    for (const key of ['a', 'b', 'c']) await expect.poll(() => placeIn(target.id, ids[key])).toBeTruthy();
    expect(await entriesIn(one.client, tidy.id)).toHaveLength(0);
  });
});
