# Live scraper logs

A local page that runs the app's real Instagram and Google Maps scrapers and streams their logs live.

It calls the same handlers as the app:
- `api/scrape-reel.js` (Instagram reel)
- `api/scrape-location.js` (Google Maps search and place details)
- `api/enrich-reel.js` (the full Instagram + Maps pipeline)

## Run it

```bash
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm run scraper:live
```

Then open http://127.0.0.1:4174.

- `PORT` changes the port.
- `REEL_ENRICHMENT_VISIBLE=1` opens Chrome visibly instead of headless.
- Set `PUPPETEER_EXECUTABLE_PATH` to a Chrome or Chromium binary, since local runs don't use the Vercel bundled Chromium.

## Notes

- Binds to 127.0.0.1 only. It launches real scrapers, so don't expose it.
- Runs go one at a time. Extra requests show as "Queued".
- Log lines are the same text the handlers print, so they match what the app's API log shows.
