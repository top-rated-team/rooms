# Promo animations

Built by `npx tsx scripts/build-promo-video.ts`. Do not edit the MP4s by hand:
a price or a door name that is painted in pixels will be last month's the day
the row in `shared/pricing.ts` or `shared/doors.ts` moves.

| File | Language |
|---|---|
| `site.mp4` | This site's paper, clay accent, Outfit and Newsreader |
| `upwork.mp4` | Marketplace green and a tight grotesque. No Upwork logo |

Both are 1920×1080, 16:9, 45 seconds, MP4, no audio. The script prints the
duration, the dimensions and the byte size when it finishes.

## What Upwork accepts

Written from their pages, not guessed. Full URLs are in the header of
`scripts/build-promo-video.ts`.

- **Profile introduction** — a YouTube URL. 16:9, 1920×1080 recommended.
  Their script guide says 30–60 seconds; the help article says two to three
  minutes. No file-size cap on Upwork itself.
- **That field also asks for a video of you.** These files are animations.
  They are not a substitute for a talking-head in the introduction slot.
- **Project Catalog** — MP4, 60 seconds, 100 MB.
- **Portfolio from disk** — 100 MB.

## What is on screen

Door headlines from `VISIBLE_DOORS`, price rows from `PRICES` (price, what it
buys, and the condition that makes the row true), the measured
`STATS.accountsProcessed` figure. Hidden doors stay off. No result, no named
client, no company logo we do not own.

Node holds the clock. Headless Chrome throttles page timers, so the capture
script calls `show()` at each beat rather than trusting a timer in the page.
