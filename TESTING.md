# Testing Reel Map

Three layers. Run the fast one all the time, the others before a release.

| Layer | Command (in `frontend/`) | Needs | Time |
|---|---|---|---|
| 1. Unit | `npm test` | nothing | ~2 s |
| 2. Database | `npm run test:db` | TEST Supabase project | ~1 min |
| 3. Browser | `npm run test:e2e` | TEST project + Mapbox token | ~2 min |

`npm run test:watch` re-runs unit tests every time you save.

---

## One-time setup (layers 2 and 3)

1. Rebuild the TEST project: `bash supabase/scripts/reset-test-project.sh`
   (makes `test01@gmail.com` and `test02@gmail.com`).
2. `cp frontend/.env.test.example frontend/.env.test.local` and fill it in.
3. For browser tests, point `frontend/.env.local` at the **TEST** project and add `VITE_MAPBOX_TOKEN`.
4. Install the root packages once: `npm ci` (the dev server needs them).

Safety: the tests refuse to run if the URL is the live project.
Everything they create is named `t-…` and deleted afterwards.

---

## What is covered

### Caption locations — `tests/unit/caption.test.js`
24 caption styles: 📍 vs 📌, `Location:` / `Address:` / `Where:` labels, no space after the pin,
pin mid-sentence, pin in brackets, `@handle`, hashtags and 🏷 cut off, address beats date/promo lines,
postcode, empty/none. Plus list posts (one place per slide), `?img_index=` slides, and Reel links.
Every case runs on **both** copies of the parser (server + app) and checks they agree.

**Add a new caption:** add one line to `VENUE_CASES`: `['what it is', 'the caption', 'expected venue']`.

### Account — `tests/db/account.test.js`
Create (with starter collections) · delete · wrong password · profile name/avatar update ·
can't edit someone else · invite link send + join · join by typed code · expired invite · only owner invites.

### Collections — `tests/db/collections.test.js` + `tests/unit/collectionFile.test.js`
Create · edit name (owner yes, member no) · member count 1 → 2 → 1 · share · kick · member can't kick owner ·
leave · lock removes members · **lock blocks sharing** · unlock · delete · export → import (JSON + CSV,
Google Takeout lists, 300-place limit, bad files refused).
Collapse panels → browser tests.

### Places — `tests/db/places.test.js` + `tests/unit/places.test.js`
Add · edit (owner only) · event date · vote / change vote / can't vote as someone else · copy · move
(owner only) · delete (stays in other collections) · book + done · duplicate warning · Google match · hours.

### Alerts — `tests/db/places.test.js` + `tests/unit/alerts.test.js`
Notifications for every type: `place_added`, `place_reacted`, `place_booked`, `place_done`,
`place_removed`, `collection_joined`, `collection_left`, `collection_private` — the other member gets it,
the person who did it doesn't. Tapping each type opens the right place/collection.
Nearby alerts: keen only, within 200 m, nearest first, once per place per day, 15-minute cooldown.

### Up Next card — `tests/unit/upNext.test.js` + browser test
Priority: booking → event (3 months) → keen (most votes) → maybe (same one all day).
Done / past / "meh" are skipped. Card links to `collection:place` and shows the right details.

### Map — `tests/e2e/app.spec.js`
Pins show up · tapping a pin opens the place modal · search shows results ·
clicking a shown place focuses it on the map and opens it.

---

## Still check by hand (phones only)
- [ ] Push notification arrives on a locked iPhone (Friday pick)
- [ ] Nearby alert pops up when walking past a keen place
- [ ] iPhone Shortcut: share a reel → lands in TBD
