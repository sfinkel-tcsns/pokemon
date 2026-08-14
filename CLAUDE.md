# Life OS — orientation for any Claude working here

Personal "Life OS" dashboard for Simon. Read this before assuming how it works —
it's caught more than one agent out.

## What this is (and is NOT)

- A **static site** — plain HTML/CSS/vanilla JS, **no build step** — hosted on
  **GitHub Pages**, plus a **Cloudflare Worker** for auth + permanent login +
  proxying. That's it.
- It does **NOT** read any local files, filesystem, or Obsidian vault. There is
  no chokidar, no "watch a folder," no path from your machine into the page. If
  the data looks frozen, that is **not** a broken file-sync — see below.

## Where data actually comes from

1. **Live, in the browser** — Google/YouTube OAuth (Calendar, YouTube Analytics
   + Data API), Canvas (.ics via the Worker), Plaid (bank data via the Worker).
   Fetched on page load when signed in. This is the real "sync."
2. **Seed fallback** — baked into `data/*.js` (`window.CALENDAR_DATA`,
   `YOUTUBE_DATA`, `BRIEF_DATA`, `MONEY_DATA`). Shown before/without login. When
   the YouTube view looks stale, you're seeing the seed, not a sync failure.

For anything the browser can't fetch itself (e.g. YouTube **Studio-only**
metrics — CTR, impressions, RPM, revenue, retention), the pattern is
**POST it to the Worker**, and the site merges it in. Never "edit a file to
sync"; the site is static and can't see your files.

## Deploy

- GitHub Pages serves branch **`claude/life-management-website-0i5exw`** of the
  `sfinkel-tcsns/pokemon` repo. **Not `master`** (that's an unrelated old
  notebook). **Push to that branch = deploy.** Do not stack work on `master`.

## File map

- `index.html` — shell + script order
- `config.js` — client ID, backend URL, calendar settings
- `app.js` — all views, rendering, connection logic, merges
- `session.js` — permanent-login backend session (token, `/state`, `/youtube`, `/canvas`)
- `google.js` / `ytstudio.js` — Calendar + YouTube OAuth/live fetch
- `plaid.js` — bank connect (Money tab)
- `data/*.js` — seed fallbacks
- `backend/worker.js` — the Cloudflare Worker (all endpoints)

## The morning YouTube feed → see `YOUTUBE-FEED.md`

Simon's morning browser run ("dispatch") is the courier for Studio-only metrics.
It scrapes Studio (behind his login) and POSTs the numbers to the Worker's
`/youtube` route; the site merges them over the live API data. **Do not rebuild
the site to do this** — the API genuinely cannot provide those fields, and the
static site + Worker already exist and work. Dispatch's job is the feed, not
re-architecting the dashboard. Full payload shape + the one-line browser call
are in `YOUTUBE-FEED.md`. The **morning brief** (news/needs-you/quote/music)
works the same way via the `/brief` route — the site pulls the freshest brief on
load and shows a "as of <date>" note until a new one is pushed. See `BRIEF-FEED.md`.

## Setup docs

- `SETUP.md` / `BACKEND-SETUP.md` — Google OAuth + the permanent-login Worker
- `SYNC-SETUP.md` — `LIFEOS_KV` binding (powers to-do sync + the YouTube & brief feeds)
- `MONEY-SETUP.md` — Plaid bank sync
- `YOUTUBE-FEED.md` — the morning Studio-metrics feed
- `BRIEF-FEED.md` — the morning brief feed (news / needs-you / music / quote)

## Guardrails

- Secrets (Google client secret, `ENC_SECRET`, Plaid secret) live **only** in
  the Worker's env vars — never in the repo, never echoed back. Simon pastes
  them into Cloudflare himself.
- **Do not change `ENC_SECRET`** — it re-keys the encryption and logs him out
  on every device.
- Build features one at a time; keep it working on his phone (Safari) with
  permanent login as the baseline.
