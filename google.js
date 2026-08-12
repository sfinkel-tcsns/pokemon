/* ===========================================================
   Life OS — Google Calendar live sync
   Uses Google Identity Services (browser OAuth, no backend) +
   the Calendar REST API. Read-only. Fetches every calendar and
   returns a unified event list in the app's own shape.
   =========================================================== */
window.LifeOSGoogle = (function () {
  const CFG = window.LIFEOS_CONFIG || {};
  const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
  const API = "https://www.googleapis.com/calendar/v3";

  let tokenClient = null;
  let accessToken = null;

  function isConfigured() {
    return !!(CFG.googleClientId && CFG.googleClientId.trim());
  }

  // Wait for the async-loaded Google Identity Services library.
  function gisReady() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - started > 8000) {
          return reject(new Error(
            "Google sign-in library didn't load. Serve the page over http(s) " +
            "(e.g. http://localhost:8000), not by opening the file directly, and check your connection."
          ));
        }
        setTimeout(check, 100);
      })();
    });
  }

  async function ensureClient() {
    if (!isConfigured()) {
      throw new Error("No Client ID configured yet. Add googleClientId in config.js (see SETUP.md).");
    }
    await gisReady();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId.trim(),
        scope: SCOPE,
        callback: () => {}, // set per request
      });
    }
  }

  function requestToken() {
    return new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        if (resp && resp.error) return reject(new Error(resp.error_description || resp.error));
        accessToken = resp.access_token;
        resolve(accessToken);
      };
      try {
        tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
      } catch (e) { reject(e); }
    });
  }

  async function getToken(force) {
    await ensureClient();
    if (accessToken && !force) return accessToken;
    return requestToken();
  }

  async function apiGet(url, retry) {
    const token = await getToken(false);
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (resp.status === 401 && !retry) {
      accessToken = null;                 // token expired — get a fresh one once
      await getToken(true);
      return apiGet(url, true);
    }
    if (!resp.ok) throw new Error("Calendar API " + resp.status + ": " + (await resp.text()).slice(0, 200));
    return resp.json();
  }

  function normalize(ev) {
    const start = ev.start && (ev.start.dateTime || ev.start.date);
    const end = ev.end && (ev.end.dateTime || ev.end.date);
    if (!start) return null;
    return {
      id: ev.id,
      title: ev.summary || "(no title)",
      start,
      end: end || start,
      allDay: !(ev.start && ev.start.dateTime),
      location: ev.location || null,
    };
  }

  // Fetch all calendars, merge into one unified event list.
  async function fetchAll() {
    await getToken(false);

    const list = await apiGet(API + "/users/me/calendarList?minAccessRole=reader&maxResults=250");
    const exclude = (CFG.excludeCalendars || []).map((s) => String(s).toLowerCase());
    const cals = (list.items || []).filter((c) => !exclude.includes(String(c.summary || "").toLowerCase()));

    const now = Date.now();
    const timeMin = new Date(now - (CFG.daysBehind ?? 1) * 86400000).toISOString();
    const timeMax = new Date(now + (CFG.daysAhead ?? 60) * 86400000).toISOString();

    const results = await Promise.all(cals.map(async (c) => {
      const url = API + "/calendars/" + encodeURIComponent(c.id) + "/events"
        + "?singleEvents=true&orderBy=startTime&maxResults=250"
        + "&timeMin=" + encodeURIComponent(timeMin)
        + "&timeMax=" + encodeURIComponent(timeMax);
      try {
        const data = await apiGet(url);
        return (data.items || [])
          .filter((ev) => ev.status !== "cancelled")
          .map(normalize)
          .filter(Boolean);
      } catch (e) {
        console.warn("Skipping calendar", c.summary, e.message);
        return [];
      }
    }));

    const events = results.flat().sort((a, b) => String(a.start).localeCompare(String(b.start)));
    return {
      generatedFor: "google-live",
      timeZone: CFG.timeZone || "America/Chicago",
      syncedAt: new Date().toISOString(),
      live: true,
      events,
    };
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) {}
    }
    accessToken = null;
  }

  return { isConfigured, fetchAll, disconnect };
})();
