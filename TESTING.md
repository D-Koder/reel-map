# Testing Reel Map

| Layer | Command (in `frontend/`) | Needs | Time |
|---|---|---|---|
| Unit | `npm test` | nothing | ~5 s |
| Database | `npm run test:db` | TEST Supabase project | ~2 min |
| Browser | `npm run test:e2e` | TEST project + Mapbox token | ~6 min |
| Live (opt-in) | `npm run test:live` | real reel links + Chrome | ~2 min |

`npm run test:watch` re-runs unit tests on save. `npx playwright show-report` shows browser runs step by step.

## How the tests are shaped
- **Database and browser tests are journeys**: one test walks a whole flow (add → edit → copy → move → delete).
- **Every step is named**, so a failure says where: `[6. move the copy from Later to Dates] …`.
- **Unit tests stay small and table-driven**: they take milliseconds, and one line per case shows which input broke.
- **Soft checks** (`expect.soft`) flag a known gap without stopping the rest of the journey.

## One-time setup
1. Repo root: `PUPPETEER_SKIP_DOWNLOAD=1 npm ci` (for `test:live`, plain `npm ci` so Chrome is downloaded).
2. Rebuild the TEST project: `bash supabase/scripts/reset-test-project.sh` (makes test01 / test02).
3. `cp frontend/.env.test.example frontend/.env.test.local` and fill it in. Add `TEST_SUPABASE_SERVICE_ROLE_KEY`
   for the sign-up, delete-account and password-reset journeys.
4. Browser tests: `frontend/.env.local` must point at the **TEST** project, with `VITE_MAPBOX_TOKEN`.
   Add `http://localhost:5173` to Supabase → Auth → Redirect URLs (password reset journey).
5. Browser tests run on a real build (`vite build && vite preview`) so offline mode works like on a phone.

**Safety:** the tests refuse the live project. Everything they make is named `t-…` and deleted after; places
they put in TBD are removed. Deleted accounts are always throwaway ones. The Shortcut journeys reset
test01's Shortcut key.

## 🐞 Known problems the tests are expected to catch
| Test | Problem |
|---|---|
| DB › Collection life, step 10 | A locked (private) collection can still be joined by invite |
| DB › Transfer ownership, step 4 | New owner can't rename: `collections.owner_id` isn't moved |
| DB › Deleting an account that shares…, step 3 | "Keep shared collections" still deletes them (profile delete cascades) |
| DB › New account, step 3 | TBD can be deleted: only the app hides the button |
| Web › Plan a date, "Add to Calendar" (soft) | No .ics file: `PinModal.jsx` defines its own `addToCalendar`, hiding `lib/calendar.js` |
| Web › Share → join… "a member has a way to leave" (soft) | There is no Leave button for members |

---

## Full checklist

✅ automated · 🧪 automated with a stand-in (fake GPS, fake push, fake reel lookup) · 👋 by hand only

Where: **U** = `tests/unit`, **DB** = `tests/db`, **W** = `tests/e2e`, **L** = `tests/live`.

### Captions → finding the place
| Test | | Where › journey |
|---|---|---|
| 24 caption styles (📍/📌, labels, mid-sentence, brackets, @handles, hashtags, 🏷, date vs address, empty) | ✅ | U › caption › *captionVenue* |
| Server and app parsers agree | ✅ | U › caption › *app copy agrees* |
| List posts, one place per slide, `?img_index=` | ✅ | U › caption › *captionPlaceList / ForSlide* |
| `Name:` / `Address:` lines, "Venue – Suburb" | ✅ | U › reelPipeline › *reading a caption on the server* |
| TikTok links, TikTok page, like counts | ✅ | U › reelPipeline › *TikTok page* |
| Real Instagram / TikTok / Google still readable | ✅ opt-in | L › *live Instagram / live TikTok* |

### Reel → Google match → saved
| Test | | Where › journey |
|---|---|---|
| Clear match auto-picked, tapped place wins, unclear → you choose | ✅ | U › reelPipeline › *journey: Instagram reel → … shared cache* |
| One cache entry per reel; per carousel slide; background lookup never guesses | ✅ | same |
| Server and app matchers agree | ✅ | U › reelPipeline › *choosing the Google result* |
| Bad links refused; oEmbed read without Chrome | ✅ | U › reelPipeline › *journey: … through oEmbed* |
| Unreadable reel → "pick it yourself", nothing cached | ✅ | U › extras › *journey: a reel nobody can read* |
| Paste link → form filled → saved with pin, reel, vote | 🧪 | W › app › *Add a place by pasting a reel link* |
| Several Google matches → choose one | 🧪 | W › add › *reel with several Google matches* |
| Manual add, Verify location, new collection from the sheet | 🧪 | W › add › *manual add → Verify → brand-new collection* |

### Duplicates
| Test | | Where › journey |
|---|---|---|
| Duplicate rules (same reel, same spot, events exempt) | ✅ | U › places › *duplicate warning* |
| "Duplicate" pill on the cards | ✅ | W › add › *duplicates*, step 1 |
| Warning when adding a spot the collection has | 🧪 | same, step 2 |
| Warning when copying into a collection that has it | ✅ | same, step 3 |
| Shared reel already saved → "Already saved in …" | ✅ | same, step 4 |

### Account
| Test | | Where › journey |
|---|---|---|
| Wrong password, edit name/avatar, blank name, others' profiles | ✅ | DB › account › *sign in → edit profile…* |
| Sign up → country kept → starter collections → sample places | ✅ | DB › account › *new account…* + W › app › *Sign up…* |
| Forgot password email; reset link → new password works | ✅ | W › app › *Sign up and forgot password* |
| Upload an avatar photo | ✅ | W › social › *Settings…* last step |
| Delete account: everything / keep shared | ✅ 🐞 | DB › account › *new account…*, *deleting an account that shares…* |
| Log out clears only my saved data | ✅ | U › device › *journey: log out clears…* |

### Invites & sharing
| Test | | Where › journey |
|---|---|---|
| Invite link join, joining twice, typed code, expired, owner-only, guesses | ✅ | DB › collections › *Collection life* + DB › security |
| Share sheet: code shown, Copy code, Copy link, same code next time | ✅ | W › social › *share → join by code…*, steps 1–2 |
| Join by code in Settings | ✅ | same, step 3 |
| Opening a `?invite=` link joins | ✅ | same, "rejoin by link" |

### Collections
| Test | | Where › journey |
|---|---|---|
| Create, rename, blank name, member limits, kick, leave, lock, unlock, delete | ✅ 🐞 | DB › collections › *Collection life* |
| Member count live on screen | ✅ | W › social, step 4 + W › app › *Home* |
| Kick / lock / unlock buttons in Settings | ✅ | W › social, last 3 steps |
| Leave button for members | ✅ soft 🐞 | W › social, "a member has a way to leave" |
| Transfer ownership | ✅ 🐞 | DB › collections › *transfer ownership…* |
| TBD can't be deleted | ✅ 🐞 | DB › account › *new account…* step 3 |
| Collapse a panel, survives reload | ✅ | W › app › *Home*, last step |
| Reorder places (drag) and collections (up/down) | ✅ | W › plan › *tidy up* + W › social › *Settings* + DB › *reorder* |

### Import / export
| Test | | Where › journey |
|---|---|---|
| JSON/CSV round trips, Takeout, limits, bad files, votes not exported | ✅ | U › collectionFile + DB › *export → import* |
| Import from Settings (confirm, progress, toast) | ✅ | W › social › *Settings* |
| Too big (2 MB) and "Nothing to export yet" | ✅ | same |
| Download CSV / JSON from the share sheet | ✅ | same |

### Places
| Test | | Where › journey |
|---|---|---|
| Add, edit, others can't edit/move, vote, copy, move, delete | ✅ | DB › places › *Place life* + W › app › *Home* |
| Undo really brings it back | ✅ | W › plan › *tidy up*, step 1 |
| Select → Everything → Move | ✅ | W › plan › *tidy up*, last step |
| Event date, book, double booking refused, done, streak | ✅ | DB › places › *event date → book…* |
| Booking checklist on screen | ✅ | W › plan › *plan a date* |
| 🎉 Celebration on done | ✅ | same, last step |
| Calendar file contents | ✅ | U › extras › *Add to calendar* |
| Calendar file downloads from the place card | ✅ soft 🐞 | W › plan › *plan a date*, "Add to Calendar" |
| Call / Reserve links, open-now status on the card | ✅ | W › plan › *plan a date*, steps 1–2 |
| Nudge copies a message | ✅ | same, step 3 |
| Google Maps link: 300 m address check | ✅ | U › extras › *Google Maps link goes to the right spot* |
| Hours rules, suburb | ✅ | U › places › *opening hours* |

### Alerts
| Test | | Where › journey |
|---|---|---|
| All 8 notification types to the right person, never yourself, only mine | ✅ | DB › places › *alerts journey* |
| Tapping each type opens the right thing | ✅ | U › alerts + W › social, "tap it → the place opens" |
| Unread badge, mark read on open, Clear all | ✅ | W › social, notification steps |
| Nearby rules (keen, 200 m, once a day, 15 min) | ✅ | U › alerts |
| Nearby alert on a walk → Open | 🧪 fake GPS | W › inbox › *nearby alert on a walk* |
| Friday pick: only unbooked; one pick per user; dead devices removed | ✅ | U › device + U › extras › *Friday pick sender* |
| Friday card shows; "Not now" hides it for good | ✅ | W › inbox › *Friday pick* |
| Push shows a notification; tapping opens the place | 🧪 fake push | U › extras › *Friday pick push* + W › inbox › *Friday pick*, last step |
| Push arrives on a real locked iPhone | 👋 | Phone |

### Map
| Test | | Where › journey |
|---|---|---|
| Pins, category filter, collection filter, tap pin, search, Shown places → Open | ✅ | W › app › *Map* |
| Several places at one spot → picker | ✅ | same, "two places at one spot" |
| Blue dot and "Go to my location" | ✅ | same, "my location" |

### Up Next card
| Test | | Where › journey |
|---|---|---|
| Priority, skips done/past/meh, same maybe all day | ✅ | U › upNext |
| Card shows the right details and opens the place | ✅ | W › app › *Home*, step 2 |

### iPhone Shortcut & shared reels
| Test | | Where › journey |
|---|---|---|
| Key → connect → save → duplicate → bad key/no link/rate limit → reset | ✅ | DB › account › *iPhone Shortcut* + U › reelPipeline › *journey: iPhone Shortcut* |
| App picks up Shortcut reels when it opens | 🧪 | W › inbox › *shared reels*, last step |
| Share sheet into the app (`?url=`) → TBD | 🧪 | same, step 1 |
| "Needs a place" → Finish | 🧪 | same, step 2 |
| Shared offline → saved when back online | 🧪 | same, step 3 |
| The real iOS share sheet → Shortcut | 👋 | Phone |

### Security, offline, live updates
| Test | | Where › journey |
|---|---|---|
| Strangers and logged-out visitors read nothing / change nothing | ✅ | DB › security |
| Live updates (places, votes, members) | ✅ | DB › places › *live updates* + W › app › *Home* + W › social |
| Offline banner, saved places, reload with no signal | ✅ | W › app › *Offline* |

**Still by hand (2):** a push on a real locked iPhone, and the real iOS share sheet → Shortcut.
Everything up to the phone itself is automated.
