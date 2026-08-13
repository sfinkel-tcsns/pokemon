/* ===========================================================
   Life OS — direct YouTube connection (no vidIQ)
   Uses Google Identity Services OAuth + YouTube's official
   Analytics API + Data API. Read-only. Pulls the same numbers
   YouTube Studio shows (CTR/impressions excluded — no API
   exposes those; that's handled by the Studio extension).
   =========================================================== */
window.LifeOSYouTube = (function () {
  const CFG = window.LIFEOS_CONFIG || {};
  const SCOPES = [
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");
  const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
  const DATA = "https://www.googleapis.com/youtube/v3";

  let tokenClient = null;
  let accessToken = null;
  let tokenExp = 0;

  const TOKEN_KEY = "lifeos-yt-token";
  const REMEMBER_KEY = "lifeos-yt-remember";

  function isConfigured() { return !!(CFG.googleClientId && CFG.googleClientId.trim()); }

  function cacheToken() {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: accessToken, e: tokenExp }));
      localStorage.setItem(REMEMBER_KEY, "1");
    } catch (e) {}
  }
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
      if (c && c.t) { accessToken = c.t; tokenExp = c.e || 0; }
    } catch (e) {}
  }
  function clearCache() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
  }
  function tokenValid() { return accessToken && Date.now() < tokenExp; }

  function gisReady() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - started > 8000) return reject(new Error("Google sign-in library didn't load. Serve over http(s), not file://."));
        setTimeout(check, 100);
      })();
    });
  }
  async function ensureClient() {
    if (!isConfigured()) throw new Error("Add googleClientId in config.js first.");
    await gisReady();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId.trim(), scope: SCOPES, callback: () => {},
      });
    }
  }
  function requestToken(silent) {
    return new Promise((resolve, reject) => {
      tokenClient.callback = (r) => {
        if (r && r.error) return reject(new Error(r.error_description || r.error));
        accessToken = r.access_token;
        tokenExp = Date.now() + ((+r.expires_in || 3600) - 60) * 1000;
        cacheToken();
        resolve(accessToken);
      };
      try { tokenClient.requestAccessToken({ prompt: silent ? "" : (accessToken ? "" : "consent") }); }
      catch (e) { reject(e); }
    });
  }
  async function getToken(force) {
    // Permanent-login backend takes over when configured + connected.
    if (window.LifeOSSession && LifeOSSession.enabled() && LifeOSSession.hasSession()) {
      return LifeOSSession.getToken(force);
    }
    await ensureClient();
    if (!force && tokenValid()) return accessToken;
    if (!force) { loadCache(); if (tokenValid()) return accessToken; }
    return requestToken(false);
  }

  // Reuse a stored session on load — no click if a valid token is cached,
  // silent re-auth if it expired. Never forces the consent popup.
  async function tryResume() {
    if (localStorage.getItem(REMEMBER_KEY) !== "1") return null;
    try { await ensureClient(); } catch (e) { return null; }
    loadCache();
    if (tokenValid()) { try { return await fetchAll(); } catch (e) { accessToken = null; } }
    try { await requestToken(true); return await fetchAll(); } catch (e) { return null; }
  }
  async function apiGet(url, retry) {
    const token = await getToken(false);
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (resp.status === 401 && !retry) { accessToken = null; await getToken(true); return apiGet(url, true); }
    if (!resp.ok) {
      let msg = "YouTube API " + resp.status;
      try { const j = await resp.json(); if (j.error && j.error.message) msg += ": " + j.error.message; } catch (e) {}
      throw new Error(msg);
    }
    return resp.json();
  }

  // date helpers (YYYY-MM-DD, UTC)
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

  function rowsToObjects(res) {
    const cols = (res.columnHeaders || []).map((c) => c.name);
    return (res.rows || []).map((r) => {
      const o = {}; cols.forEach((c, i) => (o[c] = r[i])); return o;
    });
  }

  const TRAFFIC_LABELS = {
    SUBSCRIBER: "Subscribers", YT_SEARCH: "YouTube Search", RELATED_VIDEO: "Suggested",
    YT_CHANNEL: "Channel page", SHORTS: "Shorts feed", PLAYLIST: "Playlists",
    EXT_URL: "External", NOTIFICATION: "Notifications", END_SCREEN: "End screens",
    YT_OTHER_PAGE: "Other YouTube", NO_LINK_OTHER: "Direct / other", HASHTAGS: "Hashtags",
    SOUND_PAGE: "Sound page", SHORTS_CONTENT_LINKS: "Shorts links",
  };
  const COUNTRY_NAMES = {
    US: "United States", IN: "India", PH: "Philippines", GB: "United Kingdom", ID: "Indonesia",
    BR: "Brazil", ZA: "South Africa", CA: "Canada", DE: "Germany", FR: "France", MY: "Malaysia",
    TH: "Thailand", AU: "Australia", MX: "Mexico", PK: "Pakistan", PL: "Poland", IT: "Italy",
    KE: "Kenya", VN: "Vietnam", TR: "Türkiye", BD: "Bangladesh", JP: "Japan", NG: "Nigeria", NL: "Netherlands",
  };
  const AGE_LABEL = { "age13-17": "13–17", "age18-24": "18–24", "age25-34": "25–34", "age35-44": "35–44", "age45-54": "45–54", "age55-64": "55–64", "age65-": "65+" };

  async function report(params) {
    const q = new URLSearchParams(Object.assign({ ids: "channel==MINE" }, params));
    return apiGet(ANALYTICS + "?" + q.toString());
  }

  async function fetchAll() {
    await getToken(false);
    const startDate = ymd(daysAgo(28));
    const endDate = ymd(new Date());
    const base = { startDate, endDate };

    // channel meta + lifetime stats
    const chanRes = await apiGet(DATA + "/channels?part=snippet,statistics&mine=true");
    const ch = (chanRes.items || [])[0];
    if (!ch) throw new Error("No channel found for this Google account. Connect with the account that manages the channel.");
    const channel = {
      title: ch.snippet.title,
      channelId: ch.id,
      subscribers: +ch.statistics.subscriberCount || 0,
      views: +ch.statistics.viewCount || 0,
      videos: +ch.statistics.videoCount || 0,
    };

    // 28-day summary
    const sum = rowsToObjects(await report(Object.assign({ metrics: "views,estimatedMinutesWatched,subscribersGained,likes,comments" }, base)))[0] || {};
    const analytics = {
      period: "last 28 days", startDate, endDate,
      views: sum.views || 0,
      watchHours: Math.round((sum.estimatedMinutesWatched || 0) / 60),
      subsGained: sum.subscribersGained || 0,
      likes: sum.likes || 0, comments: sum.comments || 0,
    };

    // traffic sources
    const traffRows = rowsToObjects(await report(Object.assign({ dimensions: "insightTrafficSourceType", metrics: "views", sort: "-views" }, base)));
    const traffTotal = traffRows.reduce((s, r) => s + (r.views || 0), 0) || 1;
    const traffic = traffRows.slice(0, 5).map((r) => ({
      label: TRAFFIC_LABELS[r.insightTrafficSourceType] || r.insightTrafficSourceType,
      pct: Math.round((r.views || 0) / traffTotal * 100),
    }));

    // demographics
    const demo = rowsToObjects(await report(Object.assign({ dimensions: "ageGroup,gender", metrics: "viewerPercentage" }, base)));
    const genderTotals = {};
    const ageTotals = {};
    demo.forEach((r) => {
      genderTotals[r.gender] = (genderTotals[r.gender] || 0) + (r.viewerPercentage || 0);
      const label = r.ageGroup === "age55-64" || r.ageGroup === "age65-" ? "55+" : (AGE_LABEL[r.ageGroup] || r.ageGroup);
      ageTotals[label] = (ageTotals[label] || 0) + (r.viewerPercentage || 0);
    });
    const ageOrder = ["13–17", "18–24", "25–34", "35–44", "45–54", "55+"];
    const audience = {
      gender: [
        { label: "Male", pct: Math.round(genderTotals.male || 0) },
        { label: "Female", pct: Math.round(genderTotals.female || 0) },
      ],
      age: ageOrder.filter((g) => ageTotals[g] != null).map((g) => ({ group: g, pct: Math.round(ageTotals[g]) })),
      geography: [], format: [],
    };

    // geography
    const geoRows = rowsToObjects(await report(Object.assign({ dimensions: "country", metrics: "views", sort: "-views", maxResults: "8" }, base)));
    const geoTotal = geoRows.reduce((s, r) => s + (r.views || 0), 0) || 1;
    audience.geography = geoRows.slice(0, 5).map((r) => ({
      country: COUNTRY_NAMES[r.country] || r.country,
      pct: Math.round((r.views || 0) / geoTotal * 100),
    }));

    // format split (Shorts vs long) — not always available; best-effort
    try {
      const fmt = rowsToObjects(await report(Object.assign({ dimensions: "creatorContentType", metrics: "views,estimatedMinutesWatched" }, base)));
      const totV = fmt.reduce((s, r) => s + (r.views || 0), 0) || 1;
      const totW = fmt.reduce((s, r) => s + (r.estimatedMinutesWatched || 0), 0) || 1;
      const NAME = { videoOnDemand: "Long-form", shorts: "Shorts", liveStream: "Live" };
      audience.format = fmt
        .filter((r) => ["videoOnDemand", "shorts"].includes(r.creatorContentType))
        .map((r) => ({
          label: NAME[r.creatorContentType] || r.creatorContentType,
          viewsPct: Math.round((r.views || 0) / totV * 100),
          watchPct: Math.round((r.estimatedMinutesWatched || 0) / totW * 100),
        }));
    } catch (e) { console.warn("format split unavailable", e.message); }

    // top videos (+ titles)
    let topRecent = [];
    try {
      const vids = rowsToObjects(await report(Object.assign({ dimensions: "video", metrics: "views", sort: "-views", maxResults: "6" }, base)));
      const ids = vids.map((v) => v.video).filter(Boolean);
      let titles = {};
      if (ids.length) {
        const meta = await apiGet(DATA + "/videos?part=snippet&id=" + ids.join(","));
        (meta.items || []).forEach((it) => (titles[it.id] = it.snippet.title));
      }
      topRecent = vids.map((v) => ({ title: titles[v.video] || v.video, views: v.views || 0 }));
    } catch (e) { console.warn("top videos unavailable", e.message); }

    return { channel, analytics, traffic, audience, topRecent, live: true, syncedAt: new Date().toISOString() };
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) {}
    }
    accessToken = null; tokenExp = 0;
    clearCache();
  }

  return { isConfigured, fetchAll, disconnect, tryResume };
})();
