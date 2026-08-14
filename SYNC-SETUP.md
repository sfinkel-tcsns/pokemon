# Cross-device sync (checked-off to-dos)

Checkboxes (Needs-you / Do-now / School items) now sync across every device
you're signed into with the same Google account — check it on your laptop, it's
checked on your phone.

It's stored in a small **Cloudflare KV** namespace attached to your Worker,
keyed to your Google account. One-time setup (~2 min):

## 1. Create a KV namespace
1. Cloudflare dashboard → **Storage & Databases → KV**.
2. **Create namespace**, name it e.g. `lifeos-state` → **Add**.

## 2. Bind it to your Worker
1. Open your `lifeos-auth` Worker → **Settings → Bindings** (or *Variables and
   Bindings*).
2. **Add binding → KV namespace**:
   - **Variable name:** `LIFEOS_KV`  ← must be exactly this
   - **KV namespace:** pick `lifeos-state`
3. Save.

## 3. Deploy the updated Worker
Paste the latest `backend/worker.js` from this repo into the Worker and
**Deploy** (your Google / Canvas / Plaid setup is untouched).

That's it. Nothing to change on the website. The first device you open after
this seeds the shared copy from whatever it already had checked; every other
device then picks it up on load and when you return to the tab.

> If you skip this, nothing breaks — checkboxes just stay per-device (as before).
> `ENC_SECRET` is untouched, so you stay logged in.
