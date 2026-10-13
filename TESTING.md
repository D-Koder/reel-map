# Testing Reel Map

Three layers. Run the fast one all the time, the others before a release.

| Layer | Command (in `frontend/`) | Needs | Time |
|---|---|---|---|
| 1. Unit | `npm test` | nothing | ~2 s |
| 2. Database | `npm run test:db` | TEST Supabase project | ~2 min |
| 3. Browser | `npm run test:e2e` | TEST project + Mapbox token | ~3 min |

`npm run test:watch` re-runs unit tests every time you save.

## How the tests are shaped

- **Database and browser tests are journeys.** One test walks a whole flow, e.g.
  add → edit → vote → copy → move → delete. Fewer logins, fewer set-ups, much faster.
- **Every step has a name.** A failure says where it broke, e.g. `[6. move the copy from Later to Dates] …`
  (browser tests show the step in the report: `npx playwright show-report`).
- **Unit tests stay small and table-driven.** They take milliseconds, so combining them saves nothing,
  and one-line cases (like the caption list) make it obvious which input broke.

---

## One-time setup (layers 2 and 3)

1. Install root packages once: `PUPPETEER_SKIP_DOWNLOAD=1 npm ci` (in the repo root).
2. Rebuild the TEST project: `bash supabase/scripts/reset-test-project.sh`
   (makes `test01@gmail.com` and `test02@gmail.com`).
3. `cp frontend/.env.test.example frontend/.env.test.local` and fill it in.
   Add `TEST_SUPABASE_SERVICE_ROLE_KEY` to run the sign-up and delete-account journeys.
4. For browser tests, point `frontend/.env.local` at the **TEST** project and add `VITE_MAPBOX_TOKEN`.

Safety: the tests refuse to run against the live project. Everything they create is named `t-…`
and deleted afterwards. Accounts that get deleted are always throwaway ones, never test01/test02.
Note: the Shortcut journey resets test01's Shortcut key.

---

## What is covered

### Unit (`tests/unit/`)
| File | Covers |
|---|---|
| `caption.test.js` | 24 caption styles (📍/📌, labels, @handles, hashtags, dates vs addresses…), list posts, slides, Reel links. Server and app parsers must agree. |
| `reelPipeline.test.js` | **Reel → place pipeline**: Name:/Address: lines, "Venue – Suburb", TikTok links + page, like counts, server vs app Google matching, the shared lookup cache, carousel slides, background lookups, bad links. **iPhone Shortcut endpoint**: connect, save, duplicate, wrong key, rate limit, no link, Supabase down. |
| `collectionFile.test.js` | Export JSON/CSV, import (incl. Google Takeout), limits, bad files. |
| `upNext.test.js` | Up Next priority: booking → event → keen → maybe. |
| `alerts.test.js` | Nearby alerts (200 m, once a day, 15 min cooldown); tapping each notification type. |
| `places.test.js` | Votes, duplicates, pins at one spot, Maps links, invite codes, collection order, hours. |
| `device.test.js` | Friday pick only picks unbooked places; log out clears only my saved data. |

### Database journeys (`tests/db/`)
| Journey | Steps |
|---|---|
| Profile | wrong password → edit name/avatar → blank name refused → can't edit others |
| New account | sign up → starter collections → TBD can't be deleted → delete everything |
| Delete account that shares | "keep" leaves the collection for friends; "everything" removes it |
| iPhone Shortcut | key → connect → share → duplicate → bad key/no link → private → reset key |
| Collection life | create → rename → share → member limits → kick → rejoin by code → leave → expired invite → lock → **lock blocks sharing** → unlock → delete |
| Transfer ownership | only owner, only to a member → roles swap → new owner runs it → old owner can't delete |
| Export → import | JSON and CSV round trips |
| Reorder | place order, per person; collection order on profile |
| Place life | add → edit → others can't edit/move → vote → copy → move → delete → delete last copy |
| Booking | event date → book → second booking refused → done |
| Live updates | other member sees new places and votes without refreshing |
| Alerts | all 8 notification types reach the right person; I only see mine |
| Security | strangers and logged-out visitors can't read or change anything; guessed invites fail |

### Browser journeys (`tests/e2e/`)
| Journey | Steps |
|---|---|
| Home | Up Next → modal → live update from Test Two → vote → edit → copy → move → delete (Undo) → collapse survives reload |
| Add from reel | paste link → form filled → pick collection + vibe → saved with pin, reel and vote |
| Map | pins → category filter → collection filter → tap pin → search → Shown places → open |
| Offline | banner → places still there → reload with no signal → back online |
| Sign up / forgot password | both screens send their email (or hit Supabase's email limit) |

---

## Still check by hand (phones only)
- [ ] Push notification arrives on a locked iPhone (Friday pick)
- [ ] Nearby alert pops up when walking past a keen place
- [ ] iPhone Shortcut from the real share sheet → lands in TBD
