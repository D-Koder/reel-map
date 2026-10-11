# Cover timing

Measures how long the cheap cover-only route takes: Instagram's oEmbed request, then downloading the cover image.

```bash
node tools/cover-timing/timing.mjs "https://www.instagram.com/reel/XXXX/" "https://www.instagram.com/reel/YYYY/"
```

Needs Node 18 or newer. Run it on your own network. Instagram may block requests from some cloud or sandbox networks.

## Reading the output

- `oembedStatus`: 200 is good. 403 or 429 means Instagram is blocking you.
- `oembedMs` / `imageMs` / `totalMs`: how long each step took, in milliseconds.
- `imageKB`: size of the cover image.
- `hasCaption` / `hasCover`: whether the metadata came back.

## Checks worth doing

- Run 10 or more Reels, including one that has been deleted, if you have one.
- Run it once one-at-a-time, then try five in parallel. If the parallel run slows down or returns 429, lower the concurrency limit.
- Note the cover URLs and try them again in a few days to see how long they last.
