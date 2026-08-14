# Morning YouTube feed (dispatch → Worker → site)

The site pulls **live** YouTube data itself (views, watch hours, subs, traffic,
demographics) via the official API. But the API **cannot** give:

- impressions, CTR
- revenue, RPM, CPM
- retention (avg view %, avg duration)
- search terms, suggested-video sources, device split, viewer-activity times

Those only exist inside **YouTube Studio, behind your login** — which is exactly
what your morning browser run ("dispatch") can read. This is how it hands them
to the site: it POSTs them to your Worker, the site merges them on top of the
live API data. No git, no push access, no branch problems.

## Prerequisite (one-time)

The feed shares the same store as to-do sync, so it needs the KV binding from
`SYNC-SETUP.md`:
- A KV namespace bound to the Worker as **`LIFEOS_KV`**, and the latest
  `backend/worker.js` deployed (it has the `/youtube` route).

## How dispatch sends the data (each morning)

The dashboard is already open in the browser for the Studio scrape. On that tab
(origin `https://sfinkel-tcsns.github.io`), after scraping Studio, run:

```js
await window.LifeOSSession.putYouTubeFeed({
  analytics: {
    ctr: 8.2,            // channel-wide %
    impressions: 5699071,
    revenue: 845.48,     // 28-day est.
    rpm: 1.20,
    cpm: 5.10,           // optional
    subsGained: 2584,    // optional — overrides the API's number if you send it
    avgViewPct: 41,      // optional retention %
    avgViewDuration: "3:12" // optional
  },
  facts: [
    "$845 est. revenue (28d)",
    "$1.20 RPM",
    "53% watched on TV",
    "94% non-subscriber watch time"
  ],
  updatedAt: "2026-08-14"   // optional; the Worker stamps one if omitted
});
```

That reads your permanent session from `localStorage` and POSTs it — **your
token never leaves the browser, and never passes through any AI.** The site
picks it up on next load (and when you return to the tab).

### Notes for dispatch
- Send **channel-wide** figures (Shorts included) — the Shorts drag is the real
  revenue story. The current seed shows the "Videos" (long-form) filter, which
  reads high on CTR/RPM.
- Everything in the payload is optional; send whatever you scraped. Provided
  keys win over both the seed and the live API. `analytics` / `channel` /
  `audience` **merge** (so you can add `audience.device` without wiping
  age/gender); `facts` / `traffic` / `insight` / `ideasToday` **replace**.
- To read what's currently stored: `await window.LifeOSSession.getYouTubeFeed()`.

## Raw-fetch alternative (no helper)

```js
await fetch("https://lifeos-auth.thesimonfinkel.workers.dev/youtube", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    session: localStorage.getItem("lifeos-backend-session"),
    metrics: { /* same payload as above */ }
  })
});
```
