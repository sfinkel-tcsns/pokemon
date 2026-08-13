# Permanent login (stay connected forever)

This sets up a tiny **auth backend** so you log in **once** and stay connected
forever on your device — including Safari, where the in-browser login can't
persist. It's free (Cloudflare Workers free tier). ~15 minutes, one time.

**How it stays private:** your Google *client secret* and the encryption key
live only in the Worker. Your browser only ever holds an **encrypted** token it
can't read. Nothing is stored on any server.

You'll need the OAuth **Client ID** and **Client secret** from the Google project
you already made.

---

## Part 1 — Create the Cloudflare Worker

1. Go to **https://dash.cloudflare.com** and sign up / log in (free).
2. Left sidebar → **Workers & Pages** → **Create** → **Create Worker**.
3. Name it **`lifeos-auth`** → **Deploy**.
4. Click **Edit code**. Select all the sample code and delete it. Open
   **`backend/worker.js`** from this repo, copy its entire contents, paste it in,
   then click **Deploy**.
5. Copy your Worker URL — it looks like
   **`https://lifeos-auth.<your-name>.workers.dev`**. You'll need it a few times.

## Part 2 — Add the Worker's secrets

In the Worker → **Settings** → **Variables and Secrets** → add these four
(click **Encrypt** on each where offered), then **Deploy**:

| Name | Value |
|------|-------|
| `GOOGLE_CLIENT_ID` | your client ID (`…apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | your client **secret** (from Google Credentials) |
| `ENC_SECRET` | a long random string you invent (30+ chars — mash the keyboard) |
| `SITE_ORIGIN` | `https://sfinkel-tcsns.github.io` |

> **Where's the client secret?** Google Cloud → **APIs & Services → Credentials**
> → click your **Life OS Web** client → the **Client secret** is shown on the right.

## Part 3 — Tell Google about the backend

Google Cloud → **Credentials** → **Life OS Web** client → **Authorized redirect
URIs** → **+ Add URI**, paste your Worker URL **+ `/auth/callback`**:

```
https://lifeos-auth.<your-name>.workers.dev/auth/callback
```

Click **Save**.

## Part 4 — Publish the app (so the login never expires)

Google keeps logins for **Testing** apps alive only ~7 days. To stay connected
forever:

- Google Cloud → **OAuth consent screen** (a.k.a. **Google Auth Platform** →
  **Audience**) → **Publish app** → confirm.
- You'll still see the "Google hasn't verified this app" screen when you connect
  (normal for a personal app) — just click **Advanced → Continue**.

## Part 5 — Point the site at the backend

Set `backendUrl` in **`config.js`** to your Worker URL (no trailing slash):

```js
backendUrl: "https://lifeos-auth.<your-name>.workers.dev",
```

(Or just send the URL to Claude and it'll set it for you.)

Then open the site, click **Connect** once, approve, and you're done — it stays
connected on that device from now on. **Disconnect** on the site fully logs out.

---

## Notes

- One login covers **both** Calendar and YouTube (same Google account/scopes).
- If a connect ever fails with a popup-blocked message, allow popups for the site.
- To rotate access, click **Disconnect** on the site (clears the stored token),
  or change `ENC_SECRET` in the Worker (invalidates all stored tokens).
- The Worker only ever returns short-lived access tokens to your browser; the
  long-lived refresh token stays encrypted.
