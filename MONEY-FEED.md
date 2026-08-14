# Money feed (dispatch → Worker → site)

Rocket Money has no API, but your morning run can **read it in the browser** and
push the numbers to the site — no Plaid, no bank-connection setup, no
screenshots to hand-type. Same pattern as the brief and YouTube feeds.

## Prerequisite (one-time)

The `LIFEOS_KV` binding from `SYNC-SETUP.md` and the latest `backend/worker.js`
deployed (it has the `/money` route).

## How dispatch pushes it (each morning)

On the dashboard tab, after reading Rocket Money:

```js
await window.LifeOSSession.putMoney({ /* money object — shape below */ });
```

Reads the permanent session from `localStorage` and POSTs it — the token never
leaves the browser. Read the current one with `await window.LifeOSSession.getMoney()`.

## Money shape

Matches `data/money.json` (the committed sample). Summary:

```jsonc
{
  "updatedAt": "2026-08-14",        // the Worker stamps today's date if omitted
  "netWorth": 18420,                // Chase + Schwab + Wise combined
  "accounts": [                     // rendered as the net-worth bars
    { "name": "Schwab", "type": "Investments", "balance": 12800 },
    { "name": "Chase",  "type": "Checking",    "balance": 3240 },
    { "name": "Wise",   "type": "Cash",        "balance": 2380 }
  ],
  "month": { "label": "August", "budget": 1800, "spent": 1120 },
  "spendingByCategory": [           // top categories this month
    { "category": "Food & Dining", "amount": 420 },
    { "category": "Shopping",      "amount": 260 }
  ],
  "subscriptions": [                // cadence "mo" or "yr"
    { "name": "Adobe Creative Cloud", "amount": 22.99, "cadence": "mo" },
    { "name": "Apple Music",          "amount": 10.99, "cadence": "mo" }
  ]
}
```

Once pushed, the Money tab shows a green "live" banner with the date instead of
the "sample data" note. `live: true` is added automatically.

### Notes for dispatch
- **Exclude transfers from `spent` and `spendingByCategory`.** Zelle/Venmo to
  people (e.g. money to his dad), payments to his own accounts, credit-card
  payments, and investment contributions are **not spending** — counting them
  makes the tab render a scary red over-budget number that misdescribes his
  actual spending. `spent` should be real purchases only.
- `budget` is Simon's monthly target — keep it steady unless he changes it.
- Everything is optional; send what you scraped. Whatever you send fully
  replaces the previous money snapshot (it is not merged).
