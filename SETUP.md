# Turning on live Google Calendar sync

This connects Life OS to your real Google Calendar so it always shows current
data. It's a one-time setup (~10 minutes). Everything runs in your browser —
there's no server and no password stored anywhere. Access is **read-only**.

You'll do three things: (A) create a Google project, (B) get a Client ID,
(C) paste it in and run the app.

---

## A. Create a project + enable the Calendar API

1. Go to **https://console.cloud.google.com** and sign in with your Google account.
2. Top bar → project dropdown → **New Project**. Name it `Life OS` → **Create**.
   Make sure it's selected afterward.
3. Go to **APIs & Services → Library** (or search "Library" in the top search bar).
4. Search **Google Calendar API** → open it → **Enable**.

## B. Set up consent + create a Client ID

5. Go to **APIs & Services → OAuth consent screen** (newer consoles call this
   **Google Auth Platform**). Choose **External** and click **Create**.
6. Fill the required fields:
   - **App name:** `Life OS`
   - **User support email:** your email
   - **Developer contact email:** your email
   - Save and continue through the Scopes step (you can skip adding scopes).
7. On the **Audience / Test users** step, click **Add users** and add **your own
   Google email**. Save. (Leave the app in "Testing" — that's all you need for
   personal use.)
8. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - **Application type:** **Web application**
   - **Name:** `Life OS Web`
   - Under **Authorized JavaScript origins**, click **Add URI** and add BOTH:
     - `http://localhost:8000`
     - `http://127.0.0.1:8000`
   - (You don't need a redirect URI.) Click **Create**.
9. Copy the **Client ID** it shows you. It ends in
   `.apps.googleusercontent.com`.

## C. Paste it in and run

10. Open `config.js` and paste your Client ID:
    ```js
    googleClientId: "PASTE-YOUR-ID-HERE.apps.googleusercontent.com",
    ```
11. Serve the folder on port **8000** (the origin must match what you registered):
    ```bash
    cd pokemon
    python3 -m http.server 8000
    ```
12. Open **http://localhost:8000**, click **Connect Google Calendar** in the
    sidebar, pick your account, and allow read-only access.
    - You'll likely see an **"unverified app"** warning — that's normal for a
      personal app in Testing mode. Click **Advanced → Go to Life OS (unsafe)**.
    - The dashboard reloads with your live calendars merged into one view.
    - Hit **↻ Refresh** any time; **Disconnect** returns to the offline snapshot.

---

## Notes & troubleshooting

- **Must be served over http, not file://.** Google sign-in won't run from a
  `file://` page. Use the `python3 -m http.server 8000` command above (or any
  static server) and open the `localhost` URL.
- **"redirect_uri_mismatch" / "origin" error:** the origin you're viewing must
  exactly match an Authorized JavaScript origin. If you serve on a different
  port, add that `http://localhost:PORT` in step 8.
- **Only you can connect** while the app is in Testing mode — that's intended.
- **Which calendars show?** All of them, merged into one. To hide any (e.g. the
  moon phases), add its name to `excludeCalendars` in `config.js`.
- **How far ahead?** `daysAhead` in `config.js` (default 60).
- Access tokens are short-lived and never stored; you may re-approve occasionally.

## Later: a real hosted URL

When you want this live at a permanent web address instead of `localhost`,
host the folder on any static host and add that `https://…` domain as an
Authorized JavaScript origin (step 8). No code changes needed.
