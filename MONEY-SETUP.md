# Money tab — automatic bank sync (Plaid)

Your Money tab can pull **net worth, spending, and subscriptions straight from
your banks** — no screenshots. It uses Plaid, the same aggregator Rocket Money
runs on under the hood. You connect each bank once through Plaid's secure popup;
after that the dashboard refreshes on its own.

Nothing sensitive lives in your browser: the Worker encrypts each bank's access
token (with your `ENC_SECRET`) and only hands your site the ciphertext — exactly
like your Google login.

---

## 1. Make a Plaid account (free)

1. Go to **https://dashboard.plaid.com/signup** and sign up.
2. You'll land in **Sandbox** mode automatically — perfect for testing with fake
   banks before touching real money.
3. Open **Team Settings → Keys** (https://dashboard.plaid.com/developers/keys).
   You'll see:
   - **client_id**
   - **Sandbox secret**

## 2. Add them to your Cloudflare Worker

In the Worker (the `lifeos-auth` one), open **Settings → Variables and Secrets**
and add:

| Name              | Value                          | Type   |
| ----------------- | ------------------------------ | ------ |
| `PLAID_CLIENT_ID` | your client_id                 | Text   |
| `PLAID_SECRET`    | your **Sandbox** secret        | Secret |
| `PLAID_ENV`       | `sandbox`                      | Text   |

Then paste the updated `backend/worker.js` from this repo into the Worker and
**Deploy** (it already has the Plaid endpoints; your Google + Canvas setup is
untouched).

> Don't touch `ENC_SECRET` — changing it logs you out of Google.

## 3. Test it (sandbox)

1. Open your site → **Money** tab → **🔗 Connect a bank**.
2. Pick any bank (e.g. "First Platypus Bank").
3. Login with Plaid's test credentials:
   - username **`user_good`**
   - password **`pass_good`**
   - if asked for a code: **`1234`**
4. The tab fills in with sample-but-live data flowing through the real pipes.
   Add another bank to see multiple accounts combine into one net worth.

Spending & subscriptions can take ~30–60s to appear on first connect (Plaid is
still pulling history) — the tab tells you and you can hit **Refresh**.

---

## 4. Going live with your real banks (Chase, Schwab, Wise)

Sandbox uses fake data. For your real accounts you request **Production access**
(free to apply):

1. In the Plaid dashboard, request **Production** access and fill out the short
   use-case form ("personal finance dashboard for my own accounts"). Approval is
   usually quick for personal use.
2. Once approved, grab your **Production secret** from the Keys page.
3. In the Worker, change:
   - `PLAID_SECRET` → your **Production** secret
   - `PLAID_ENV` → `production`
4. **Chase uses OAuth**, so in Production it needs a redirect URL:
   - Add a Worker variable `PLAID_REDIRECT_URI` = `https://sfinkel-tcsns.github.io/`
   - Register that **exact** URL in Plaid: **Team Settings → API →
     Allowed redirect URIs**.
   - (Schwab investments and Wise are covered too — Schwab balances flow through
     the same connection; if a specific Schwab brokerage needs a dedicated
     connector we can add SnapTrade later.)
5. Reconnect each bank on the Money tab. Done — it's your real money, auto-updating.

### Notes
- Plaid Production is free at low volume; heavy use can incur per-connection
  costs, but a personal dashboard stays well within the free tier.
- You can disconnect anytime from the Money tab ("Disconnect") — it wipes the
  stored tokens from your browser.
- Monthly budget defaults to $1,800; tell me your real number and I'll set it.
