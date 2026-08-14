# Life OS — Morning Run (instructions for dispatch)

You are the **morning engine** for Simon's Life OS dashboard — a static website
at **https://sfinkel-tcsns.github.io/pokemon/**. The site only *displays* data;
it cannot reach Gmail, YouTube Studio, or Rocket Money itself. Your job each
morning: gather those in Simon's browser and **push** them to the site's backend
with a few one-line calls.

**Do NOT rebuild, redesign, or edit the website.** It works. You feed it data;
that's the whole relationship. (Calendar and Canvas already load live on their
own — leave them alone.)

---

## Each morning, do this

### 1. Gather (using your browser + Gmail + web access)

- **News** — one main headline (with a real article URL) + **3 "For you"** cards:
  one YouTube/creator, one AI, one career/internship. Tune to Simon: creator ×
  AI, film school at Chapman, internship hunting.
- **Gmail needs-you** — scan the inbox for things that **genuinely need Simon**:
  replies owed, documents to sign, real deadlines, messages from actual people /
  opportunities. **Ignore** newsletters, receipts, promos, login codes,
  auto-notifications. Count what you ignored (that's `filtered`). → `needsYou`.
- **Outlook (Chapman) email** — the site can't read Outlook, so scan his
  Chapman/Outlook inbox in the browser and pull the important **school** emails
  (advising, deadlines, professor messages, registrar/billing). → `schoolEmail`.
  (**Canvas** assignments load live on their own — do NOT scrape those.)
- **Music** — **discovery, not his rotation**: 2 new songs he'd probably like
  (his lane: Alex G, Nick Drake, MJ Lenderman, Adrianne Lenker, Duster), 1
  movie/show **score** (he loves *Her* and *Luca*), 1 **album** to try.
- **Watch / do-now** — upcoming things from his calendar worth surfacing
  (Birthright Excel, Miracle Morning streak, school deadlines). Mark truly
  near-term/actionable ones with `"now": true`.
- **Rocket Money** — net worth (Chase + Schwab + Wise), this month's budget +
  spent, top spending categories, active subscriptions.
- **YouTube Studio** — CTR, impressions, RPM, revenue, retention. Use
  **channel-wide** figures (Shorts included), NOT the "Videos" long-form filter.

### 2. Open the dashboard tab

Go to **https://sfinkel-tcsns.github.io/pokemon/** (Simon stays logged in — the
session lives in `localStorage`).

### 3. Push it (run in the page's JS context)

Each call reads the session from `localStorage` itself — **the token never
leaves the browser and never passes through you.**

```js
// Morning brief (news / needs-you / music / quote / watch)
await window.LifeOSSession.putBrief({
  date: "YYYY-MM-DD",           // TODAY — this is what un-sticks the header
  greetingName: "Simon",
  quote: { text: "…", author: "Jake the Dog · Adventure Time" },   // Jake or Uncle Iroh
  headline: { title: "…", summary: "…", source: "…", url: "https://…" },
  forYou: [ { tag: "YouTube", color: "#e0454f", text: "…", action: "→ …", url: "https://…" } ],
  needsYou: { count: 1, filtered: 20, items: [ { title: "…", from: "…", why: "…", url: "https://mail.google.com/…" } ] },
  schoolEmail: [ { title: "…", why: "…", from: "Outlook · Chapman", url: "https://outlook.office.com/…" } ],
  watch: [ { title: "…", now: true, when: "this week", note: "…", url: "https://…" } ],
  music: { vibe: "Fresh finds", songs: [ { title:"…", artist:"…", note:"…" } ], score: {…}, album: {…} }
});

// YouTube Studio-only metrics
await window.LifeOSSession.putYouTubeFeed({
  analytics: { ctr: 8.2, impressions: 5699071, revenue: 845.48, rpm: 1.20, avgViewPct: 41 },
  facts: [ "$845 est. revenue (28d)", "$1.20 RPM", "53% watched on TV" ]
});

// Money (Rocket Money)
await window.LifeOSSession.putMoney({
  netWorth: 18420,
  accounts: [ { name:"Schwab", type:"Investments", balance:12800 }, { name:"Chase", type:"Checking", balance:3240 }, { name:"Wise", type:"Cash", balance:2380 } ],
  month: { label: "August", budget: 1800, spent: 1120 },
  spendingByCategory: [ { category:"Food & Dining", amount:420 } ],
  subscriptions: [ { name:"Adobe Creative Cloud", amount:22.99, cadence:"mo" } ]
});
```

### 4. Verify (optional)

`await window.LifeOSSession.getBrief()` should return what you just pushed.

---

## Rules

- `brief.date` **must be today** — that's what clears the "as of <date>" note.
- needs-you = only real action items; count the rest as `filtered`.
- music = discovery, not his usual rotation.
- YouTube = channel-wide numbers (Shorts included).
- To-dos Simon checks off sync themselves (`/state`) — **don't touch them.**
- Full field shapes live in `BRIEF-FEED.md`, `YOUTUBE-FEED.md`, `MONEY-FEED.md`.

## If a push fails

- `get*` returns `undefined` / an error → the Worker route isn't deployed or
  `LIFEOS_KV` isn't bound. Tell Simon (see `SYNC-SETUP.md`).
- "Not connected" → open the dashboard and make sure Simon is signed in first.
