# Testing Reel Map

| Layer | Command (in `frontend/`) | Needs | Time |
|---|---|---|---|
| Unit | `npm test` | nothing | ~5 s |
| Database | `npm run test:db` | TEST Supabase project | ~2 min |
| Browser | `npm run test:e2e` | TEST project + Mapbox token | ~6 min |
| Live (opt-in) | `npm run test:live` | real reel links + Chrome | ~2 min |

📝 **Every run writes [`TEST-RESULTS.md`](TEST-RESULTS.md)**: each flow step by step (✅ ❌ ⚠️). Failed flows are open; passed ones are folded (tap to open). `npm run test:report` rebuilds it from the last runs.

`npm run test:watch` re-runs unit tests on save. `npx playwright show-report` shows browser runs step by step.

## 📱 Run them from your phone (GitHub Actions)
1. **One time:** GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**. Add, all from the **TEST** project:
   `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_MAPBOX_TOKEN`.
2. Every push to the `testing` branch runs everything. To run again without a push: GitHub app → repo → **Actions** →
   **Tests** → open the latest `testing` run → **Re-run all jobs**. (Once this is on `main`, **Run workflow** works too.)
3. When it finishes, open the run → **Summary**: the results are right there. `TEST-RESULTS.md` is also saved to the branch,
   and screenshots are in the **test-report** download.

Pushes to other branches run the quick checks (and the database tests once the secrets are set).

## How the tests are shaped
- **Database and browser tests are journeys**: one test walks a whole flow (*Add, copy, move and delete a place*).
- **Every step is named**, so a failure says where: `[I move the copy from Later to Dates] …`. Steps read as a story: "I …" is Test One, "Test Two …" the friend.
- **Unit tests stay small and table-driven**: they take milliseconds, and one line per case shows which input broke.
- **Soft checks** (`expect.soft`) flag a known bug without stopping the rest of the journey.

## One-time setup
1. Repo root: `PUPPETEER_SKIP_DOWNLOAD=1 npm ci` (for `test:live`, plain `npm ci` so Chrome is downloaded).
2. Build the TEST project's tables (phone-friendly, no computer needed):
   - LIVE project → SQL Editor → run `supabase/scripts/export-schema.sql`. It only reads: it writes out the
     structure (tables, functions, security rules) as SQL, with no data, no keys and no push sender.
   - Copy the one result cell → TEST project → SQL Editor → paste → Run. Do this once, on an empty project.
   - (`supabase/migrations` is behind live, so building from the migrations fails. Use the export.)
3. `cp frontend/.env.test.example frontend/.env.test.local` and fill in the URL, anon key and service role key.
   No accounts needed: **each run makes two throwaway accounts** ("Test One" and "Test Two", made-up
   @example.com emails, random password) and deletes them at the end.
4. Browser tests: `frontend/.env.local` must point at the **TEST** project, with `VITE_MAPBOX_TOKEN`.
   Add `http://localhost:5173` to Supabase → Auth → Redirect URLs (password reset journey).
5. Browser tests run on a real build (`vite build && vite preview`) so offline mode works like on a phone.

**Safety:** the tests refuse the live project unless `TEST_ALLOW_LIVE=yes` (GitHub sets it: the owner is the only live user and allowed it). Either way they only touch two throwaway accounts per run and things named `t-…`; a crashed run's leftovers are swept up by the next run. They never call, text, email or book anyone for real: phone and email links are blocked, pop-ups (booking sites, reels) never open, the test phone number is one reserved for fiction, and "Save booking" only writes to the TEST database. The only emails sent go to made-up @example.com addresses. Everything they make is named `t-…` and deleted after,
and every account they use is a throwaway one made for that run.

## 🐞 Known problems the tests are expected to catch
| Test | Problem |
|---|---|
| DB › Share, lock and delete a collection, step 10 (known bug) | A locked (private) collection can still be joined by invite |
| DB › Hand a collection over to a friend, step 4 (known bug) | New owner can't rename: `collections.owner_id` isn't moved |
| DB › Delete an account that shares a collection, step 3 (known bug) | "Keep shared collections" still deletes them (profile delete cascades) |
| DB › Sign up and delete my account, step 4 (known bug) | TBD can be deleted: only the app hides the button |
| Web › Plan a date, "I tap Add to Calendar…" (soft, known bug) | No .ics file: `PinModal.jsx` defines its own `addToCalendar`, hiding `lib/calendar.js` |
| Web › Share with a friend, "Test Two finds a way to leave…" (soft, known bug) | There is no Leave button for members |

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
| Paste link → form filled → saved with pin, reel, vote | 🧪 | W › app › *Add a place from a reel link* |
| Several Google matches → choose one | 🧪 | W › add › *Choose between Google matches* |
| Manual add, Verify location, new collection from the sheet | 🧪 | W › add › *Add a place by hand* |

### Duplicates
| Test | | Where › journey |
|---|---|---|
| Duplicate rules (same reel, same spot, events exempt) | ✅ | U › places › *duplicate warning* |
| "Duplicate" pill on the cards | ✅ | W › add › *Duplicates*, step 1 |
| Warning when adding a spot the collection has | 🧪 | same, step 2 |
| Warning when copying into a collection that has it | ✅ | same, step 3 |
| Shared reel already saved → "Already saved in …" | ✅ | same, step 4 |

### Account
| Test | | Where › journey |
|---|---|---|
| Wrong password, edit name/avatar, blank name, others' profiles | ✅ | DB › account › *Log in and edit my profile* |
| Sign up → country kept → starter collections → sample places | ✅ | DB › account › *Sign up and delete my account* + W › app › *Sign up and reset my password* |
| Forgot password email; reset link → new password works | ✅ | W › app › *Sign up and reset my password* |
| Upload an avatar photo | ✅ | W › social › *Settings*, last step |
| Delete account: everything / keep shared | ✅ 🐞 | DB › account › *Sign up and delete my account*, *Delete an account that shares a collection* |
| Log out clears only my saved data | ✅ | U › device › *journey: log out clears…* |

### Invites & sharing
| Test | | Where › journey |
|---|---|---|
| Invite link join, joining twice, typed code, expired, owner-only, guesses | ✅ | DB › collections › *Share, lock and delete a collection* + DB › security › *Guessing invites doesn't work* |
| Share sheet: code shown, Copy code, Copy link, same code next time | ✅ | W › social › *Share with a friend*, steps 1–2 |
| Join by code in Settings | ✅ | same, step 3 |
| Opening a `?invite=` link joins | ✅ | same, "Test Two opens the invite link and is back in" |

### Collections
| Test | | Where › journey |
|---|---|---|
| Create, rename, blank name, member limits, kick, leave, lock, unlock, delete | ✅ 🐞 | DB › collections › *Share, lock and delete a collection* |
| Member count live on screen | ✅ | W › social, step 4 + W › app › *Home* |
| Kick / lock / unlock buttons in Settings | ✅ | W › social, last 3 steps |
| Leave button for members | ✅ soft 🐞 | W › social, "Test Two finds a way to leave the collection" |
| Transfer ownership | ✅ 🐞 | DB › collections › *Hand a collection over to a friend* |
| TBD can't be deleted | ✅ 🐞 | DB › account › *Sign up and delete my account*, step 4 |
| Collapse a panel, survives reload | ✅ | W › app › *Home*, last step |
| Reorder places (drag) and collections (up/down) | ✅ | W › plan › *Tidy up* + W › social › *Settings* + DB › *Reorder places and collections* |

### Import / export
| Test | | Where › journey |
|---|---|---|
| JSON/CSV round trips, Takeout, limits, bad files, votes not exported | ✅ | U › collectionFile + DB › *Export and import a collection* |
| Import from Settings (confirm, progress, toast) | ✅ | W › social › *Settings* |
| Too big (2 MB) and "Nothing to export yet" | ✅ | same |
| Download CSV / JSON from the share sheet | ✅ | same |

### Places
| Test | | Where › journey |
|---|---|---|
| Add, edit, others can't edit/move, vote, copy, move, delete | ✅ | DB › places › *Add, copy, move and delete a place* + W › app › *Home* |
| Undo really brings it back | ✅ | W › plan › *Tidy up*, step 2 |
| Select → Everything → Move | ✅ | W › plan › *Tidy up*, last step |
| Event date, book, double booking refused, done, streak | ✅ | DB › places › *Book a place and mark it done* |
| Booking checklist on screen | ✅ | W › plan › *Plan a date* |
| 🎉 Celebration on done | ✅ | same, last step |
| Calendar file contents | ✅ | U › extras › *Add to calendar* |
| Calendar file downloads from the place card | ✅ soft 🐞 | W › plan › *Plan a date*, "I tap Add to Calendar…" |
| Call / Reserve links, open-now status on the card | ✅ | W › plan › *Plan a date*, steps 1–2 |
| Nudge copies a message | ✅ | same, step 3 |
| Google Maps link: 300 m address check | ✅ | U › extras › *Google Maps link goes to the right spot* |
| Hours rules, suburb | ✅ | U › places › *opening hours* |

### Alerts
| Test | | Where › journey |
|---|---|---|
| All 8 notification types to the right person, never yourself, only mine | ✅ | DB › places › *Alerts* › *Each action alerts the right person* |
| Tapping each type opens the right thing | ✅ | U › alerts + W › social, "I open notifications, tap one and the place opens" |
| Unread badge, mark read on open, Clear all | ✅ | W › social, notification steps |
| Nearby rules (keen, 200 m, once a day, 15 min) | ✅ | U › alerts |
| Nearby alert on a walk → Open | 🧪 fake GPS | W › inbox › *Nearby alert* › *Walk past places I am keen on* |
| Friday pick: only unbooked; one pick per user; dead devices removed | ✅ | U › device + U › extras › *Friday pick sender* |
| Friday card shows; "Not now" hides it for good | ✅ | W › inbox › *Friday pick* |
| Push shows a notification; tapping opens the place | 🧪 fake push | U › extras › *Friday pick push* + W › inbox › *Friday pick*, last step |
| Push arrives on a real locked iPhone | 👋 | Phone |

### Map
| Test | | Where › journey |
|---|---|---|
| Pins, category filter, collection filter, tap pin, search, Shown places → Open | ✅ | W › app › *Map* |
| Several places at one spot → picker | ✅ | same, "I tap a '2 places here' pin…" |
| Blue dot and "Go to my location" | ✅ | same, "I see my blue dot…" |

### Up Next card
| Test | | Where › journey |
|---|---|---|
| Priority, skips done/past/meh, same maybe all day | ✅ | U › upNext |
| Card shows the right details and opens the place | ✅ | W › app › *Home*, step 2 |

### iPhone Shortcut & shared reels
| Test | | Where › journey |
|---|---|---|
| Key → connect → save → duplicate → bad key/no link/rate limit → reset | ✅ | DB › account › *Save reels with the iPhone Shortcut* + U › reelPipeline › *journey: iPhone Shortcut* |
| App picks up Shortcut reels when it opens | 🧪 | W › inbox › *Share reels into the app*, last step |
| Share sheet into the app (`?url=`) → TBD | 🧪 | same, step 1 |
| "Needs a place" → Finish | 🧪 | same, step 2 |
| Shared offline → saved when back online | 🧪 | same, step 3 |
| The real iOS share sheet → Shortcut | 👋 | Phone |

### Security, offline, live updates
| Test | | Where › journey |
|---|---|---|
| Strangers and logged-out visitors read nothing / change nothing | ✅ | DB › security › *Strangers can't read my things*, *Strangers can't change my things* |
| Live updates (places, votes, members) | ✅ | DB › places › *Live updates* + W › app › *Home* + W › social |
| Offline banner, saved places, reload with no signal | ✅ | W › app › *Offline* |

**Still by hand (2):** a push on a real locked iPhone, and the real iOS share sheet → Shortcut.
Everything up to the phone itself is automated.
