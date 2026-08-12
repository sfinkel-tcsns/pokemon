# Life OS

A personal life-management dashboard — starting with your calendar as the backbone,
with room to grow into tasks, habits, notes, and money.

It's a **calendar dashboard** that runs two ways:

- **Live** — connect your Google account and it shows current data, self-refreshing.
- **Snapshot** — a seeded copy of your calendar that works offline with zero setup,
  and is the automatic fallback when you're not connected.

No build step, no backend.

## Run it

**Quick look (snapshot):** open `index.html` in a browser (double-click it).

**Live sync (recommended):** do the one-time Google setup in **[SETUP.md](SETUP.md)**,
then serve the folder and open the localhost URL:

```bash
cd pokemon
python3 -m http.server 8000
# then visit http://localhost:8000 and click "Connect Google Calendar"
```

Live sync must be served over http (not `file://`) — that's a Google sign-in
requirement. The footer shows which mode you're in: **live · <time>** or
**snapshot · <date>**.

## What's here

- **Today** — a timeline of your day with a live "now" line, all-day briefs pinned on
  top, and events color-coded by type.
- **Week** — a 7-day grid; today is highlighted.
- **Upcoming** — everything ahead, grouped by day.
- **Stat strip** — event count, deep-work hours, scheduled load, and what's up next.
- Dark/light theme toggle (remembers your choice).

All of your calendars — primary, Delt, Eagles, Nebraska, Texas, and holidays — are
merged into **one** unified calendar so the view stays calm. Each event is colored by
life-**category**, auto-derived from its title (see `categorize()` in `app.js`):

**Work · Health · Meals · Social · Travel · Rest · Briefs · Personal**

- **Social** covers Delt (chapter, rush, O-week), game days, and friend time.
- **Briefs** covers all-day items — holidays, birthdays, and the news/coach cards.
- **Work / Rest** drive the "focus / work" and "scheduled load" stats.

## Live sync

When you click **Connect Google Calendar**, the page uses Google Identity Services
(browser OAuth, read-only) to pull every calendar via the Calendar API and merge them
into the same unified view — no server involved. `google.js` handles auth + fetching;
`config.js` holds your Client ID and options. Setup steps are in **[SETUP.md](SETUP.md)**.

## Snapshot data & refreshing

The offline snapshot is assembled by `data/build.js` from two files into what the page
loads as a fallback:

- `data/primary.json` — your primary Google Calendar snapshot.
- `data/secondary.json` — the other calendars (Delt, sports, holidays), compact form.
- `data/build.js` — merges them into one unified list → writes:
  - `data/events.json` — the canonical merged snapshot (handy for tooling).
  - `data/events.js` — the same data wrapped so the page loads with zero setup
    (`file://` can't `fetch` a local JSON file).

Re-run the merge any time with `node data/build.js`.

This is a **snapshot**, so it goes stale. To refresh, just ask Claude in a session
with your Google Calendar connected:

> "Refresh my Life OS calendar data."

Claude re-pulls your events and regenerates both files. (Future step: wire up Google
OAuth so the page refreshes itself live.)

## Roadmap

The sidebar shows where this is heading. The calendar is the working core; these are next:

- [ ] **Tasks** — to-dos that can drop onto calendar time blocks
- [ ] **Habits** — streaks tied to recurring events (S.A.V.E.R.S, Gym, wind-down)
- [ ] **Notes** — a daily journal, linked to the day
- [ ] **Money** — lightweight budget / spend tracking
- [ ] **Live sync** — Google OAuth so data refreshes itself
- [ ] **Multi-calendar** — Family, Delt, sports calendars layered in with toggles

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell + layout |
| `styles.css` | Design system (tokens, dark/light) |
| `app.js` | Rendering + view logic (snapshot or live) |
| `config.js` | Your Google Client ID + options |
| `google.js` | Google OAuth + live Calendar fetch |
| `SETUP.md` | One-time live-sync setup guide |
| `data/build.js` | Merges the snapshots into the unified dataset |
| `data/primary.json` | Primary calendar snapshot |
| `data/secondary.json` | Other calendars (Delt, sports, holidays) |
| `data/events.json` | Unified merged snapshot (canonical) |
| `data/events.js` | Same data, loadable without a server |
