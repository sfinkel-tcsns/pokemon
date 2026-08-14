# Calendar command bar — setup

The Calendar tab has an **AI command bar**: type plain English ("move gym to 6pm
tomorrow", "add dentist Friday 2pm", "cancel my 3pm") and it edits your Google
Calendar on the spot. The Worker sends your words to Claude, which turns them
into a calendar action and applies it; the view refreshes.

Three one-time steps:

## 1. Get an Anthropic API key
1. Go to **https://console.anthropic.com** → **API Keys** → create one.
2. Add a little credit (each command is a fraction of a cent — Haiku is cheap).

## 2. Add it to the Worker + deploy
1. Worker → **Settings → Variables and Secrets** → add:
   - `ANTHROPIC_API_KEY` = your key **(Secret)**
   - *(optional)* `ANTHROPIC_MODEL` = a model id to override the default
2. Paste the latest `backend/worker.js` and **Deploy** (it adds the `/calendar/act`
   route and the calendar **write** scope). Your other setup is untouched.

## 3. Reconnect once (to grant calendar editing)
The site currently only has **read** access to your calendar. To let it make
changes, you have to re-approve with the new permission:
- On the dashboard, **Disconnect**, then **Connect Google Calendar** again, and
  approve the Google consent screen (it'll now ask for calendar edit access).
- That's it — the command bar goes live.

### Notes
- If a command returns "Reconnect the dashboard to grant calendar edit access,"
  you skipped step 3 — reconnect and retry.
- It reads your events for the next ~3 weeks to know which one you mean when you
  say "move my 3pm" — so it can move/rename/delete existing events, not just add.
- Everything runs through your Worker; your Google tokens never touch the browser
  in the clear, same as the rest of the app.
