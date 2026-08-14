# School / Academic planner feed (dispatch → Worker → site)

The **School** tab is Simon's academic planner: degree progress, classes taken,
what's left, and his **Prague** semester. The site can't see his Chapman records,
so dispatch reads them (Student Center / degree audit / transcript) and pushes
them via `/school`. Unlike the brief, this is **occasional** — update it when the
records change (new grades post, schedule changes, advising updates), not daily.

Emails-to-respond come from the brief's `schoolEmail` (already fed daily), and
homework comes **live from Canvas** — neither belongs in this payload.

## Prerequisite

`LIFEOS_KV` bound + latest `backend/worker.js` deployed (has the `/school` route).

## How dispatch pushes it

```js
await window.LifeOSSession.putSchool({ /* shape below */ });
```

Reads the session from `localStorage`; token never leaves the browser. Read the
current one with `await window.LifeOSSession.getSchool()`.

## Shape (matches `data/school.json`)

```jsonc
{
  "school": "Chapman University · Dodge College",
  "major": "Film Production (BFA)",
  "standing": "Junior",
  "gpa": 3.5,
  "credits": { "completed": 66, "required": 120, "inProgress": 15 },
  "abroad": {
    "location": "Prague, Czech Republic",
    "program": "FAMU International",
    "term": "Spring 2027",
    "credits": 15,
    "note": "…advisor caveat…",
    "courses": [ { "code": "FAMU 301", "title": "Directing for Film & TV", "credits": 4, "countsAs": "Major — Directing" } ]
  },
  "flags": [                          // advising / action items — shown at the TOP of the tab
    { "urgency": "now",  "title": "Register ENG 208 (in cart, not enrolled)", "why": "Satisfies Written Inquiry GE; classes start Aug 24.", "url": "https://studentcenter.chapman.edu/…" },
    { "urgency": "soon", "title": "Raise upper-division credits with advising", "why": "Need 42 upper-div (30 at Chapman); constrains which term you can go abroad." }
  ],
  "requirements": [ { "category": "Major core", "done": 27, "needed": 45 } ],
  "taken":     [ { "code": "FILM 101", "title": "Intro to Visual Storytelling", "credits": 3, "grade": "A", "term": "Fa 2024" } ],
  "remaining": [ { "code": "FILM 480", "title": "Senior Thesis Production", "credits": 4, "category": "Major core" } ]
}
```

### Notes
- **`flags`** = the payoff of this tab: things to act on that the audit surfaces —
  in-cart-not-enrolled courses, unmet GE buckets, upper-division shortfalls,
  advising deadlines. `urgency: "now"` renders red, `"soon"` amber. Put the real,
  checked findings here; don't invent them.
- `abroad`: if there's **no enrollment**, leave `courses` empty and use `note`
  to state the real status (advising appt, deadline) — don't fabricate a plan.
- Pull from his **degree audit** where possible — it already knows requirement
  buckets and what's outstanding.
- `abroad.courses[].countsAs` should say which Dodge requirement each FAMU/Prague
  course fills — that's the thing he actually needs to confirm with his advisor.
- Whatever you send fully replaces the previous plan (not merged).
- Once pushed, the tab drops the "sample plan" banner and shows the real records.
