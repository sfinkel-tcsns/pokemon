# Calendar command bar — setup (free)

The Calendar tab has a command bar: type a plain instruction and it edits your
Google Calendar instantly. It runs **entirely free** — the site parses your
command itself and writes the change straight to Google using your existing
login. No API keys, no per-command cost.

## The only step: reconnect once

The site currently has **read-only** calendar access. To let it make changes,
re-approve with the write permission:

1. Make sure your Worker is running the latest `backend/worker.js` (the one that
   added the `calendar.events` scope — if the command bar is visible, you have it).
2. On the dashboard: **Disconnect**, then **Connect Google Calendar** again, and
   approve the Google screen (it now asks for calendar **edit** access).

That's it. If a command ever returns "Reconnect the dashboard to grant calendar
edit access," you skipped this — reconnect and retry.

## What it understands

Give it a clear instruction. Examples:

- `add dentist Friday 2pm`
- `add coffee with Eric tomorrow 11:30am`
- `schedule gym at 6pm`
- `move gym to 6pm tomorrow`
- `reschedule Clickster time to 2pm`
- `rename gym to workout`
- `cancel Lunch + read` / `delete my dentist appointment`

Patterns: **add / schedule** `<title> <day> <time>` · **move / reschedule**
`<event> to <day/time>` · **rename** `<event> to <new title>` · **cancel /
delete** `<event>`. Days can be `today`, `tomorrow`, a weekday (`friday`,
`next monday`), or a date (`aug 20`, `8/20`). Times like `2pm`, `11:30am`,
`noon`, `15:00`. New events default to 1 hour.

Because it's a pattern parser (not an AI), keep commands reasonably structured —
loose phrasing like "push my afternoon around" won't work. It finds existing
events by matching the words you use against your upcoming calendar.

> Prefer full natural-language freedom? The Worker also has an optional AI route
> (`/calendar/act`) — add an `ANTHROPIC_API_KEY` and it'll handle any phrasing
> for a fraction of a cent per command. The free parser above needs neither.
