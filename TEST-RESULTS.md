# 🧪 Test results

_Last run 14 Oct, 12:16 am · made by `npm run test:all` in `frontend/` · don't edit by hand_

**✅ 33 passed · ❌ 0 failed · ⚠️ 0 known bugs · ⏭️ 15 skipped**

> Not run yet: Database.

**Key:** ✅ passed · ❌ failed · ⚠️ known bug (expected to fail) · ⏭️ skipped

## ✅ Passed (33)

### Quick checks

<details>
<summary>✅ <b>🔔 Alerts › nearby alerts: which places count</b> · 7 of 7 passed</summary>

`tests/unit/alerts.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | distance is right to within a few metres | ✅ |
| 2 | only keen places within 200 m, nearest first | ✅ |
| 3 | maybe / meh / other people’s keen do not alert | ✅ |
| 4 | places already done do not alert, booked-but-not-done still do | ✅ |
| 5 | a place in two collections alerts once | ✅ |
| 6 | places with no pin are ignored | ✅ |
| 7 | cooldown is 15 minutes | ✅ |

</details>

<details>
<summary>✅ <b>🔔 Alerts › nearby alerts: the hook (once per place per day, 15 min cooldown)</b> · 2 of 2 passed</summary>

`tests/unit/alerts.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | alerts once, then stays quiet for 15 minutes, then can alert a different place | ✅ |
| 2 | does nothing when turned off | ✅ |

</details>

<details>
<summary>✅ <b>🔔 Alerts › tapping a notification opens the right thing</b> · 11 of 11 passed</summary>

`tests/unit/alerts.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | place_added with ids | ✅ |
| 2 | place_reacted with ids | ✅ |
| 3 | place_booked with ids | ✅ |
| 4 | place_done with ids | ✅ |
| 5 | place_removed with ids | ✅ |
| 6 | collection_joined opens the collection | ✅ |
| 7 | collection_left opens the collection | ✅ |
| 8 | collection_private opens the collection | ✅ |
| 9 | with no ids, finds the longest place and collection named in the message | ✅ |
| 10 | a removed place never opens the place itself | ✅ |
| 11 | nothing matches → null | ✅ |

</details>

<details>
<summary>✅ <b>🔤 Captions › captionVenue: the place after a pin</b> · 48 of 48 passed</summary>

`tests/unit/caption.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | plain 📍 line | ✅ |
| 2 | 📍 with name and suburb | ✅ |
| 3 | 📍 with full street address | ✅ |
| 4 | 📌 only | ✅ |
| 5 | 📍 beats a 📌 heading | ✅ |
| 6 | "Location:" label is dropped | ✅ |
| 7 | "Address:" label is dropped | ✅ |
| 8 | no space after the pin | ✅ |
| 9 | pin mid-sentence ends at the full stop | ✅ |
| 10 | pin in brackets stops at the bracket | ✅ |
| 11 | @handle after the pin | ✅ |
| 12 | hashtags after the venue are cut | ✅ |
| 13 | 🏷 tag after the venue is cut | ✅ |
| 14 | address line beats a date line | ✅ |
| 15 | address line beats a promo line | ✅ |
| 16 | a lone date-only pin is still used | ✅ |
| 17 | heading-only pin with no venue gives nothing | ✅ |
| 18 | no pin at all gives nothing | ✅ |
| 19 | empty caption gives nothing | ✅ |
| 20 | null caption gives nothing | ✅ |
| 21 | venue on a later line with emojis around it | ✅ |
| 22 | postcode counts as an address | ✅ |
| 23 | "Where:" label is dropped | ✅ |
| 24 | exclamation ends the venue | ✅ |
| 25 | app copy agrees: plain 📍 line | ✅ |
| 26 | app copy agrees: 📍 with name and suburb | ✅ |
| 27 | app copy agrees: 📍 with full street address | ✅ |
| 28 | app copy agrees: 📌 only | ✅ |
| 29 | app copy agrees: 📍 beats a 📌 heading | ✅ |
| 30 | app copy agrees: "Location:" label is dropped | ✅ |
| 31 | app copy agrees: "Address:" label is dropped | ✅ |
| 32 | app copy agrees: no space after the pin | ✅ |
| 33 | app copy agrees: pin mid-sentence ends at the full stop | ✅ |
| 34 | app copy agrees: pin in brackets stops at the bracket | ✅ |
| 35 | app copy agrees: @handle after the pin | ✅ |
| 36 | app copy agrees: hashtags after the venue are cut | ✅ |
| 37 | app copy agrees: 🏷 tag after the venue is cut | ✅ |
| 38 | app copy agrees: address line beats a date line | ✅ |
| 39 | app copy agrees: address line beats a promo line | ✅ |
| 40 | app copy agrees: a lone date-only pin is still used | ✅ |
| 41 | app copy agrees: heading-only pin with no venue gives nothing | ✅ |
| 42 | app copy agrees: no pin at all gives nothing | ✅ |
| 43 | app copy agrees: empty caption gives nothing | ✅ |
| 44 | app copy agrees: null caption gives nothing | ✅ |
| 45 | app copy agrees: venue on a later line with emojis around it | ✅ |
| 46 | app copy agrees: postcode counts as an address | ✅ |
| 47 | app copy agrees: "Where:" label is dropped | ✅ |
| 48 | app copy agrees: exclamation ends the venue | ✅ |

</details>

<details>
<summary>✅ <b>🔤 Captions › captionPlaceList: list posts (one place per slide)</b> · 4 of 4 passed</summary>

`tests/unit/caption.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | reads every place line with its name and address | ✅ |
| 2 | numbered emoji lists (1️⃣ 2️⃣) count too | ✅ |
| 3 | a normal caption is not a list | ✅ |
| 4 | hashtag lines are not places | ✅ |

</details>

<details>
<summary>✅ <b>🔤 Captions › captionPlaceForSlide: the place on the shared slide</b> · 5 of 5 passed</summary>

`tests/unit/caption.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | no slide → the first place | ✅ |
| 2 | with an intro, slide 1 is the cover, so slide 3 is the second place | ✅ |
| 3 | without an intro, slide 2 is the second place | ✅ |
| 4 | a slide past the end gives the last place | ✅ |
| 5 | two lines only count as a list when a slide was shared | ✅ |

</details>

<details>
<summary>✅ <b>🔤 Captions › reelPlaceHints: names to match against Google results</b> · 2 of 2 passed</summary>

`tests/unit/caption.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | tagged place first, then the 📍 venue, then the location | ✅ |
| 2 | skips what is missing | ✅ |

</details>

<details>
<summary>✅ <b>🔤 Captions › Reel links</b> · 8 of 8 passed</summary>

`tests/unit/caption.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | https://www.instagram.com/reel/ABC123/?igsh=xyz → https://www.instagram.com/reel/ABC123/ | ✅ |
| 2 | https://instagram.com/reels/ABC123 → https://www.instagram.com/reel/ABC123/ | ✅ |
| 3 | https://www.instagram.com/someone/reel/ABC123/ → https://www.instagram.com/reel/ABC123/ | ✅ |
| 4 | https://www.instagram.com/p/XYZ789/?img_index=3 → https://www.instagram.com/p/XYZ789/ | ✅ |
| 5 | http://www.instagram.com/reel/ABC123/ → null | ✅ |
| 6 | https://www.tiktok.com/@a/video/1 → null | ✅ |
| 7 | not a link → null | ✅ |
| 8 | reads the carousel slide from img_index | ✅ |

</details>

<details>
<summary>✅ <b>📦 Import / export › export</b> · 3 of 3 passed</summary>

`tests/unit/collectionFile.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | JSON keeps everything needed to rebuild the collection | ✅ |
| 2 | votes are never exported | ✅ |
| 3 | CSV quotes cells with commas and quotes | ✅ |

</details>

<details>
<summary>✅ <b>📦 Import / export › import</b> · 10 of 10 passed</summary>

`tests/unit/collectionFile.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | JSON export → import gives the same places back | ✅ |
| 2 | CSV export → import gives the same places back, named after the file | ✅ |
| 3 | reads a Google Takeout saved list (Title, Note, URL) | ✅ |
| 4 | a URL that is not a Maps link becomes the website | ✅ |
| 5 | guesses cafe and event from the name | ✅ |
| 6 | rows with no name are skipped and counted | ✅ |
| 7 | stops at 300 places and says how many were cut | ✅ |
| 8 | a spreadsheet without a name column is refused | ✅ |
| 9 | a JSON file that is not ours is refused | ✅ |
| 10 | drops links that are not http(s) | ✅ |

</details>

<details>
<summary>✅ <b>📦 Import / export › coordsFromMapsUrl</b> · 5 of 5 passed</summary>

`tests/unit/collectionFile.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | https://www.google.com/maps/place/X/@-37.81,144.96,17z | ✅ |
| 2 | https://www.google.com/maps/place/X/data=!3d-37.8!4d144.9 | ✅ |
| 3 | https://www.google.com/maps/search/?api=1&query=-37.8,144.9 | ✅ |
| 4 | https://www.google.com/maps/place/X | ✅ |
| 5 | https://www.google.com/maps/@200,500,17z | ✅ |

</details>

<details>
<summary>✅ <b>📱 Phone › journey: Friday pick only suggests places nobody has booked</b> · 2 of 2 passed</summary>

`tests/unit/device.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | every pick is from my collections and unbooked; each unbooked place can come up | ✅ |
| 2 | nothing to suggest → no notification | ✅ |

</details>

<details>
<summary>✅ <b>📱 Phone › journey: log out clears my saved data, and only mine</b> · 2 of 2 passed</summary>

`tests/unit/device.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | my places cache, inbox, alerts and order go; the other account and other apps stay | ✅ |
| 2 | storage that is full or blocked never breaks the app | ✅ |

</details>

<details>
<summary>✅ <b>🧩 Extras › journey: a reel nobody can read → the person picks the place</b> · 1 of 1 passed</summary>

`tests/unit/extras.test.js` · ran 14 Oct, 12:16 am · 0.2 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | Instagram says no and Chrome fails → 200 with "pick the place yourself", nothing cached | ✅ |

</details>

<details>
<summary>✅ <b>🧩 Extras › Add to calendar (.ics file)</b> · 1 of 1 passed</summary>

`tests/unit/extras.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | makes a 2-hour event with the place, address and reel, and escapes commas | ✅ |

</details>

<details>
<summary>✅ <b>🧩 Extras › Google Maps link goes to the right spot</b> · 4 of 4 passed</summary>

`tests/unit/extras.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | address within 300 m of the pin → search by name and address | ✅ |
| 2 | address somewhere else → the saved pin instead | ✅ |
| 3 | lookup fails → still the name and address search | ✅ |
| 4 | a saved Google Maps page is used as it is, with no lookup | ✅ |

</details>

<details>
<summary>✅ <b>🧩 Extras › journey: Friday pick push → notification → tap opens the place</b> · 3 of 3 passed</summary>

`tests/unit/extras.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | shows the title, body and icon from the push | ✅ |
| 2 | a push with no data still shows something | ✅ |
| 3 | tapping reuses an open app window, else opens a new one | ✅ |

</details>

<details>
<summary>✅ <b>🧩 Extras › journey: Friday pick sender → each device gets its pick → dead devices removed</b> · 1 of 1 passed</summary>

`tests/unit/extras.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | two devices for one user share a pick; a gone (410) device is removed; a server error (500) is kept | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › votes (getVibe)</b> · 6 of 6 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | {} → no-votes | ✅ |
| 2 | { a: 'keen', b: 'keen' } → both-in | ✅ |
| 3 | { a: 'meh', b: 'meh' } → no-consensus | ✅ |
| 4 | { a: 'keen', b: 'maybe' } → mixed-vibes | ✅ |
| 5 | { a: 'keen' } → mixed-vibes | ✅ |
| 6 | votes from people who left the collection do not count | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › duplicate warning</b> · 2 of 2 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | flags the same reel twice and two places at the same spot | ✅ |
| 2 | events at one venue are not duplicates | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › pins at one spot (tapping a pin)</b> · 1 of 1 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | lists each saved place at that spot once | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › Google Maps link for a place</b> · 3 of 3 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | uses the saved Maps page when there is one | ✅ |
| 2 | searches name + address otherwise | ✅ |
| 3 | falls back to the pin, then to nothing | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › bestPlaceMatch (choosing the Google result for a reel)</b> · 5 of 5 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | one result is picked | ✅ |
| 2 | whole words win over letters inside a word | ✅ |
| 3 | a name written inside the hint | ✅ |
| 4 | a tie asks the user (null) | ✅ |
| 5 | no results → null | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › invite links and codes</b> · 2 of 2 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | shows 8-letter codes as XXXX-XXXX | ✅ |
| 2 | reads the invite id from a pasted link | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › collection order</b> · 2 of 2 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | my order first, collections I have not placed keep their usual order after | ✅ |
| 2 | no saved order keeps the list as it is | ✅ |

</details>

<details>
<summary>✅ <b>📍 Places › opening hours on the place card</b> · 8 of 8 passed</summary>

`tests/unit/places.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | 2026-10-12T12:00:00 | ✅ |
| 2 | 2026-10-12T09:00:00 | ✅ |
| 3 | 2026-10-12T23:00:00 | ✅ |
| 4 | 2026-10-13T12:00:00 | ✅ |
| 5 | 2026-10-17T00:30:00 | ✅ |
| 6 | 2026-10-17T16:00:00 | ✅ |
| 7 | no hours → nothing shown | ✅ |
| 8 | suburb from an address | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › reading a caption on the server</b> · 20 of 20 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | "Name:" and "Address:" lines win | ✅ |
| 2 | "Venue - Suburb" splits in two | ✅ |
| 3 | "Venue – Suburb" with an en dash | ✅ |
| 4 | no dash: it is all location | ✅ |
| 5 | Name only, location from the pin | ✅ |
| 6 | nothing at all | ✅ |
| 7 | like count 1,234 → 1234 | ✅ |
| 8 | like count 12.5K → 12500 | ✅ |
| 9 | like count 3M → 3000000 | ✅ |
| 10 | like count 1.2b → 1200000000 | ✅ |
| 11 | like count  → null | ✅ |
| 12 | like count lots → null | ✅ |
| 13 | https://www.instagram.com/reel/ABC/ → instagram true, tiktok false | ✅ |
| 14 | https://instagram.com/someone/p/ABC → instagram true, tiktok false | ✅ |
| 15 | https://www.tiktok.com/@foodie/video/7300000000000000000 → instagram false, tiktok true | ✅ |
| 16 | https://vm.tiktok.com/ZMabc123/ → instagram false, tiktok true | ✅ |
| 17 | https://www.tiktok.com/@foodie → instagram false, tiktok false | ✅ |
| 18 | http://www.instagram.com/reel/ABC/ → instagram false, tiktok false | ✅ |
| 19 | https://youtube.com/shorts/abc → instagram false, tiktok false | ✅ |
| 20 | flips the caption so its end (usually the venue) comes first | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › TikTok page</b> · 1 of 1 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.1 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | reads the caption, creator, counts and hashtags from the page | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › choosing the Google result: server and app agree</b> · 5 of 5 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | [{"name":"Yoarthi"},{"name":"Yo Art Frozen Yoghurt (The Glen)"}] with hints ["YoArt"] | ✅ |
| 2 | [{"name":"Frenchie"},{"name":"Le Bon"}] with hints ["the restaurant is called Frenchie"] | ✅ |
| 3 | [{"name":"Pho Bar"},{"name":"Pho Bar"}] with hints ["Pho Bar"] | ✅ |
| 4 | [{"name":"Gimlet at Cavendish House"},{"name":"Gimletto Pizza"}] with hints ["gimlet"] | ✅ |
| 5 | [{"name":"Tipo 00"},{"name":"Tipo Pasta"}] with hints ["abc"] | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › journey: Instagram reel → caption → Google result → details, from the shared cache</b> · 6 of 6 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | picks the clear match, reads its details, and keeps the link that was shared | ✅ |
| 2 | each carousel slide has its own cache entry | ✅ |
| 3 | the place the person tapped wins over the guess | ✅ |
| 4 | no clear match → the person chooses (candidates, no details) | ✅ |
| 5 | a background lookup (iPhone Shortcut) never guesses between two results | ✅ |
| 6 | a link that is not a reel is refused, and GET is not allowed | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › journey: reading a fresh Instagram reel through oEmbed</b> · 2 of 2 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | Name/Address lines, creator and hashtags come back without starting Chrome | ✅ |
| 2 | bad links are refused before anything is fetched | ✅ |

</details>

<details>
<summary>✅ <b>🎬 Reels › journey: iPhone Shortcut → /api/save-reel</b> · 7 of 7 passed</summary>

`tests/unit/reelPipeline.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | connect → save → duplicate, with the reel looked up in the background | ✅ |
| 2 | {"url":"https://www.instagram.com/p/X/"} → null | ✅ |
| 3 | {"key":"abc"} → null | ✅ |
| 4 | {"key":"wrong","url":"https://www.instagram.com/p/X/"} → { code: '28000' } | ✅ |
| 5 | {"key":"abc","url":"no link here"} → { code: '22023' } | ✅ |
| 6 | {"key":"abc","url":"https://www.instagram.com/p/X/"} → { code: '54000' } | ✅ |
| 7 | Supabase down → "Could not reach", GET → 405 | ✅ |

</details>

<details>
<summary>✅ <b>⏭️ Up Next › pickUpNext priority</b> · 11 of 11 passed</summary>

`tests/unit/upNext.test.js` · ran 14 Oct, 12:16 am · 0.0 s

| # | Step | Result |
|:-:|---|:-:|
| 1 | nothing saved → no card | ✅ |
| 2 | 1. a booking beats everything, soonest first | ✅ |
| 3 | a booking earlier today still counts; one from yesterday does not | ✅ |
| 4 | a booking marked done is skipped | ✅ |
| 5 | 2. with no booking, the soonest event in the next 3 months | ✅ |
| 6 | events today count, past events and ones over 3 months away do not | ✅ |
| 7 | 3. then food/cafe I am keen on, the one with the most keen votes first | ✅ |
| 8 | places only someone else is keen on are not picked | ✅ |
| 9 | 4. last, a maybe — the same one all day | ✅ |
| 10 | "meh" places are never picked | ✅ |
| 11 | the card links to the right place entry (collection:id) | ✅ |

</details>

## ⏭️ Skipped (15)

### Browser

<details>
<summary>⏭️ <b>➕ Adding places › Add a place by hand</b> · skipped</summary>

`tests/e2e/add.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>➕ Adding places › Choose between Google matches</b> · skipped</summary>

`tests/e2e/add.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>➕ Adding places › Duplicates</b> · skipped</summary>

`tests/e2e/add.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>🏠 App › Home</b> · skipped</summary>

`tests/e2e/app.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>🏠 App › Add a place from a reel link</b> · skipped</summary>

`tests/e2e/app.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>🏠 App › Offline</b> · skipped</summary>

`tests/e2e/app.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>🏠 App › Sign up and reset my password</b> · skipped</summary>

`tests/e2e/app.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>🏠 App › Map › Find a place on the map</b> · skipped</summary>

`tests/e2e/app.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>📥 Shared reels › Share reels into the app</b> · skipped</summary>

`tests/e2e/inbox.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>📥 Shared reels › Friday pick</b> · skipped</summary>

`tests/e2e/inbox.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>📥 Shared reels › Nearby alert › Walk past places I am keen on</b> · skipped</summary>

`tests/e2e/inbox.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>💘 Planning › Plan a date</b> · skipped</summary>

`tests/e2e/plan.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>💘 Planning › Tidy up</b> · skipped</summary>

`tests/e2e/plan.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>👯 Sharing › Share with a friend</b> · skipped</summary>

`tests/e2e/social.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>

<details>
<summary>⏭️ <b>👯 Sharing › Settings</b> · skipped</summary>

`tests/e2e/social.spec.js` · ran 14 Oct, 12:16 am

⏭️ Didn't run. Usually this means the TEST project login isn't filled in (see TESTING.md → One-time setup).

</details>
