// Two phones at once: Test One shares a collection and Test Two joins, gets alerts, is removed,
// rejoins by link, and is locked out. Then Settings: import/export, avatar photo, collection order.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, memberIds, ok, signIn, unique } from '../db/helpers.js';
import { blockRealWorld, board, logIn, newCollection, openSettings, secondPhone, settingsRow, toast } from './helpers.js';

test.skip(!hasDb, 'Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_ACCOUNT_PASSWORD');
test.beforeEach(({ page }) => blockRealWorld(page));

let one;
let two;
let shared;

test.beforeAll(async () => {
  one = await signIn(ACCOUNTS.one);
  two = await signIn(ACCOUNTS.two);
  shared = await newCollection(one, 'e2e-social', '👯');
  await addPlace(one.client, shared.id, { name: unique('Social Spot') });
});
test.afterAll(() => cleanUp(one, two));

test('share → join by code → alerts → kick → rejoin by link → lock → unlock', async ({ page, context, browser }) => {
  test.setTimeout(180000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const phone2 = await secondPhone(browser);
  const page2 = phone2.page;
  await blockRealWorld(page2);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  let code;
  let link;

  try {
    await test.step('Test One opens Share: there is a code; Copy code and Copy link work', async () => {
      await logIn(page);
      await openSettings(page);
      await settingsRow(page, shared.name).getByRole('button', { name: 'Share' }).click();
      code = (await page.locator('.invite-code').textContent()).trim();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      await page.getByRole('button', { name: 'Copy code' }).click();
      expect(await clipboard()).toBe(code);
      await page.getByRole('button', { name: 'Copy link' }).click();
      link = await clipboard();
      expect(link).toMatch(/\?invite=[0-9a-f-]{36}$/);
    });

    await test.step('opening Share again reuses the same code', async () => {
      await page.getByRole('button', { name: 'Close' }).click();
      await settingsRow(page, shared.name).getByRole('button', { name: 'Share' }).click();
      await expect(page.locator('.invite-code')).toHaveText(code);
      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Close settings' }).click();
    });

    await test.step('Test Two types the code (lower case) in Settings → joins', async () => {
      await logIn(page2, ACCOUNTS.two);
      await openSettings(page2);
      await page2.locator('#join-code').fill(code.toLowerCase());
      await page2.getByRole('button', { name: 'Join' }).click();
      await expect(page2.getByRole('status').filter({ hasText: 'You joined' })).toBeVisible();
      await page2.getByRole('button', { name: 'Close settings' }).click();
      await expect(board(page2, shared.id)).toBeVisible();
    });

    await test.step("Test One sees the member count go to 2 without refreshing", async () => {
      await expect(board(page, shared.id).locator('.collection-toggle')).toContainText('2 ·', { timeout: 15000 });
    });

    await test.step('a member has a way to leave (soft check)', async () => {
      await openSettings(page2);
      expect.soft(await settingsRow(page2, shared.name).getByRole('button', { name: /Leave/ }).count(),
        'no Leave button: a member cannot leave a collection from the app').toBeGreaterThan(0);
      await page2.getByRole('button', { name: 'Close settings' }).click();
    });

    const added = unique('Two Added');
    await test.step('Test Two adds a place → Test One gets a notification badge', async () => {
      await addPlace(two.client, shared.id, { name: added });
      await expect(page.getByRole('button', { name: 'Notifications' })).toContainText(/\d/, { timeout: 15000 });
    });

    await test.step('open notifications (badge clears) → tap it → the place opens', async () => {
      await page.getByRole('button', { name: 'Notifications' }).click();
      const item = page.locator('.notification-panel.open .notification-item', { hasText: added });
      await expect(item).toBeVisible();
      await expect(page.getByRole('button', { name: 'Notifications' })).not.toContainText(/\d/);
      await item.click();
      await expect(page.getByRole('dialog', { name: added })).toBeVisible();
      await page.keyboard.press('Escape');
    });

    await test.step('Clear all empties the list for good', async () => {
      await page.getByRole('button', { name: 'Notifications' }).click();
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expect(page.getByText('No notifications yet')).toBeVisible();
      expect(await ok(one.client.from('notifications').select('id').eq('user_id', one.userId))).toHaveLength(0);
      await page.getByRole('button', { name: 'Close notifications' }).click();
    });

    await test.step('Test One removes Test Two in Manage collection → their board goes', async () => {
      page.once('dialog', (dialog) => dialog.accept());
      await openSettings(page);
      await settingsRow(page, shared.name).getByRole('button', { name: 'Manage collection' }).click();
      await settingsRow(page, shared.name).getByRole('button', { name: /^Remove / }).click();
      await expect.poll(() => memberIds(one.client, shared.id)).toEqual([one.userId]);
      await expect(board(page2, shared.id)).toHaveCount(0, { timeout: 15000 });
    });

    await test.step('Test Two opens the invite link → back in', async () => {
      await page2.goto(link.replace(/^https?:\/\/[^/?]+/, ''));
      await expect(board(page2, shared.id)).toBeVisible({ timeout: 15000 });
      expect(await memberIds(one.client, shared.id)).toHaveLength(2);
    });

    await test.step('Make private (confirm) → Test Two is removed, lock shows', async () => {
      page.once('dialog', (dialog) => dialog.accept());
      await settingsRow(page, shared.name).getByRole('button', { name: 'Make private' }).click();
      await toast(page, 'Now private · removed 1');
      await expect(board(page2, shared.id)).toHaveCount(0, { timeout: 15000 });
      await page.getByRole('button', { name: 'Close settings' }).click();
      await expect(board(page, shared.id).getByLabel('Private')).toBeVisible();
    });

    await test.step('Make shared again', async () => {
      await openSettings(page);
      await settingsRow(page, shared.name).getByRole('button', { name: 'Make shared' }).click();
      await toast(page, 'Now shared');
    });
  } finally {
    await phone2.context.close();
  }
});

test('Settings: import (and too-big files) → export CSV/JSON (and empty) → avatar photo → collection order', async ({ page }) => {
  const imported = unique('imported');
  const empty = await newCollection(one, 'e2e-empty', '🫙');
  const json = JSON.stringify({
    kind: 'reel-map-collection', version: 1, collection: { name: imported, emoji: '📥' },
    places: [{ name: 'Gimlet', category: 'food', lat: -37.8155, lng: 144.9714 }, { name: 'Lune', category: 'cafe' }],
  });
  let importedId;
  const orderNow = async () => (await ok(one.client.from('profiles').select('collection_order').eq('id', one.userId).single())).collection_order ?? [];
  const fileInput = () => page.locator('.settings-drawer.open input[type="file"][accept*=".json"]');

  await test.step('log in and open Settings', async () => {
    await logIn(page);
    await openSettings(page);
  });

  await test.step('a file over 2 MB is refused', async () => {
    await fileInput().setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2.1 * 1024 * 1024, 'a') });
    await toast(page, 'That file is too big (2 MB max)');
  });

  await test.step('import a Reel Map file → confirm → new collection with both places', async () => {
    page.once('dialog', (dialog) => dialog.accept());
    await fileInput().setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await toast(page, `Imported 2 places into "${imported}"`);
    const { data: made } = await one.client.from('collections').select('id').eq('name', imported).single();
    importedId = made.id;
    expect((await entriesIn(one.client, made.id)).map((p) => p.name).sort()).toEqual(['Gimlet', 'Lune']);
  });

  await test.step('export it as CSV and JSON: the files hold the places', async () => {
    await settingsRow(page, imported).getByRole('button', { name: 'Share' }).click();
    for (const [label, ext] of [['Spreadsheet', 'csv'], ['Reel Map file', 'json']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: new RegExp(label) }).click()]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`-reel-map\\.${ext}$`));
      const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString());
      expect(text).toContain('Gimlet');
      expect(text).toContain('Lune');
    }
    await page.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('exporting an empty collection says so', async () => {
    await settingsRow(page, empty.name).getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: /Reel Map file/ }).click();
    await toast(page, 'Nothing to export yet');
    await page.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('move a collection up → it is one place higher in my saved order', async () => {
    const row = settingsRow(page, imported);
    const before = await page.locator('.settings-drawer.open .collection-item').allTextContents();
    const at = before.findIndex((text) => text.includes(imported));
    await row.getByRole('button', { name: `Move ${imported} up` }).click();
    await expect.poll(async () => (await orderNow()).indexOf(importedId)).toBe(at - 1);
  });

  await test.step('upload a profile photo → saved → put back', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const before = await ok(one.client.from('profiles').select('avatar_url').eq('id', one.userId).single());
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('dialog', { name: 'Edit profile' }).locator('input[type="file"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
    await expect.poll(async () => (await ok(one.client.from('profiles').select('avatar_url').eq('id', one.userId).single())).avatar_url, { timeout: 15000 })
      .toMatch(/profile-avatars\/.+\.png$/);
    // Put it back and remove the uploaded file.
    const { avatar_url: url } = await ok(one.client.from('profiles').select('avatar_url').eq('id', one.userId).single());
    await one.client.storage.from('profile-avatars').remove([url.split('/profile-avatars/')[1]]);
    await one.client.from('profiles').update({ avatar_url: before.avatar_url }).eq('id', one.userId);
  });

  // The imported collection is named t-…, so afterAll removes it.
});
