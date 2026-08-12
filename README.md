# Life OS

A personal life-management dashboard — starting with your calendar as the backbone,
with room to grow into tasks, habits, notes, and money.

This first version is a **calendar dashboard** seeded with your real Google Calendar
events. No build step, no server required.

## Run it

Just open `index.html` in a browser (double-click it, or drag it into a tab).

Prefer a local server (nicer, and required later when we add live data)?

```bash
cd pokemon
python3 -m http.server 8000
# then visit http://localhost:8000
```

## What's here

- **Today** — a timeline of your day with a live "now" line, all-day briefs pinned on
  top, and events auto-color-coded by type.
- **Week** — a 7-day grid; today is highlighted.
- **Upcoming** — everything ahead, grouped by day.
- **Stat strip** — event count, deep-work hours, scheduled load, and what's up next.
- Dark/light theme toggle (remembers your choice).

Events are auto-categorized into **Work · Health · Meals · Rest · Travel · Briefs ·
Personal** from their titles (see `categorize()` in `app.js` to tweak the rules).

## Data & refreshing

The calendar data lives in two files:

- `data/events.json` — the canonical snapshot (handy for tooling).
- `data/events.js` — the same data wrapped so the page loads with zero setup
  (`file://` can't `fetch` a local JSON file).

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
| `app.js` | Rendering + view logic |
| `data/events.json` | Calendar snapshot (canonical) |
| `data/events.js` | Same data, loadable without a server |
