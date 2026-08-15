# Morning brief feed (dispatch → Worker → site)

The **calendar and YouTube update themselves** (pulled live in the browser). The
**morning brief** — news, "for you", needs-you, quote, music, "watch/do now" —
is *generated* content, so it only changes when something regenerates it. That's
your morning run's job.

Each morning, dispatch builds a fresh brief and POSTs it to the Worker; the site
loads it in place of the committed seed. No commits, updates on every device.
Until a fresh one is pushed, the site shows the last brief with a small
"showing your brief from <date>" note so it's never silently stale.

## Prerequisite (one-time)

Same store as everything else: the `LIFEOS_KV` binding from `SYNC-SETUP.md` and
the latest `backend/worker.js` deployed (it has the `/brief` route).

## How dispatch pushes it (each morning)

On the dashboard tab (already open), after generating the brief:

```js
await window.LifeOSSession.putBrief({ /* brief object — shape below */ });
```

Reads the permanent session from `localStorage` and POSTs it — the token never
leaves the browser. Read the current one with `await window.LifeOSSession.getBrief()`.

## Brief shape

Canonical example lives in `data/brief.json` (the committed seed). Match its
keys. Summary:

```jsonc
{
  "date": "2026-08-14",              // MUST be today — drives the header + stale check
  "greetingName": "Simon",
  "creator": {                       // the MORNING HERO — first thing he sees
    "latest": {                      // how his newest upload is doing
      "title": "…", "url": "https://youtu.be/…", "publishedAt": "2026-08-15",
      "views": 3800, "likes": 340, "comments": 51, "ctr": 9.1, "impressions": 42000,
      "note": "One-line verdict vs his averages (CTR 8.3% / RPM ~$0.9) and where traffic's coming from."
    },
    "today": {                       // the video he should make TODAY (next in his cadence)
      "title": "Becoming Spider-Man in VR for 24 Hours",
      "titles": ["Option A title", "Option B title"],   // A/B pair to test
      "thumbnailText": ["24 HOURS AS SPIDER-MAN", "VR BROKE ME"],  // punchy 2–4 word overlays
      "thumbnailConcepts": ["SPLIT — …", "CLOSE-UP — …", "POV — …"],  // 2–3 described compositions
      "thumbnailImage": "https://…",   // OPTIONAL generated reference image URL (must be public https)
      "angle": "…", "hook": "…", "thumbnailIdea": "…",
      "why": "why it fits his analytics (Spider-Man is his #1 lane with new viewers)",
      "guides": [ "3–4 concrete production tips grounded in his data (TV thumbnails, retention checkpoints…)" ],
      "references": [ { "title": "…", "url": "https://…" } ]
    }
  },
  "quote": { "text": "…", "author": "Jake the Dog · Adventure Time" },
  "headline": { "title": "…", "summary": "…", "source": "…", "url": "https://…" },
  "forYou": [                        // 3 cards: YouTube / AI / Career, tuned to Simon
    { "tag": "YouTube", "color": "#e0454f", "text": "…", "action": "→ …", "url": "https://…" }
  ],
  "needsYou": {                      // real Gmail items that need a human reply/action
    "count": 1, "filtered": 24,      // filtered = newsletters/receipts ignored
    "items": [ { "title": "…", "from": "…", "why": "…", "url": "https://mail.google.com/…" } ]
  },
  "school": { "status": "coming", "note": "…" },   // fallback note; Canvas is fetched LIVE by the site
  "schoolEmail": [                   // important OUTLOOK / Chapman emails you scraped (checkable)
    { "title": "…", "why": "…", "from": "Outlook · Chapman", "url": "https://outlook.office.com/…" }
  ],
  "watch": [                         // "Keep an eye on"; add "now": true to push an item into "Do now"
    { "title": "…", "now": true, "when": "this week", "note": "…", "url": "https://…" },
    { "title": "…", "date": "2026-09-25", "note": "…", "url": "https://…" }
  ],
  "music": {
    "vibe": "Fresh finds",
    "songs": [ { "title": "…", "artist": "…", "note": "…" } ],   // 2 new discoveries
    "score": { "title": "…", "artist": "…", "note": "movie/show score" },
    "album": { "title": "…", "artist": "…", "note": "an album to try" }
  }
}
```

### Rules dispatch should follow
- **`date` = today.** That's what un-sticks the header and clears the stale note.
- **needs-you = only things that actually need Simon** (replies, signatures,
  deadlines). Filter out newsletters, receipts, promos — count them in `filtered`.
- **music = discovery**, not his usual rotation: 2 new songs he'd like, 1 score
  (he loves *Her* / *Luca*), 1 album to try.
- **watch/do-now:** near-term actionable → `"now": true`; longer-horizon → leave
  it (optionally with a `"date"`). The site auto-sorts dated items within 7 days
  into "Do now" too.
- **Outlook / Chapman email:** the site does NOT read Outlook — scan it in the
  browser and put important school emails in `schoolEmail` (they show in the
  School section, alongside the live Canvas assignments). Gmail needs-you stays
  in `needsYou`.
- **Canvas assignments** are fetched **live by the site** on its own — do NOT put
  them in the brief.
- Checked-off items already sync via `/state`; don't reset them.
