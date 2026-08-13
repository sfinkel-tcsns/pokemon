/* ===========================================================
   Life OS — backend session (permanent login)
   When config.js has a backendUrl, the app gets access tokens from the
   backend instead of Google Identity Services, so you stay logged in
   forever on the device (Safari-proof — uses localStorage, not cookies).
   Dormant when backendUrl is empty.
   =========================================================== */
window.LifeOSSession = (function () {
  const CFG = window.LIFEOS_CONFIG || {};
  const KEY = "lifeos-backend-session";
  let accessToken = null, tokenExp = 0;

  function base() { return String(CFG.backendUrl || "").replace(/\/+$/, ""); }
  function enabled() { return !!base(); }
  function hasSession() { return enabled() && !!localStorage.getItem(KEY); }
  function clear() { localStorage.removeItem(KEY); accessToken = null; tokenExp = 0; }

  // Capture a session handed back via redirect fallback (#lifeos_session=...)
  (function captureHash() {
    const m = /lifeos_session=([^&]+)/.exec(location.hash || "");
    if (m) {
      try { localStorage.setItem(KEY, decodeURIComponent(m[1])); } catch (e) {}
      history.replaceState(null, "", location.pathname + location.search);
    }
  })();

  function connect() {
    return new Promise((resolve, reject) => {
      if (!enabled()) return reject(new Error("No backend configured."));
      const w = window.open(base() + "/auth/start", "lifeos-auth", "width=500,height=680");
      if (!w) return reject(new Error("Popup blocked — allow popups for this site and try again."));
      let done = false;
      function onMsg(e) {
        if (e.data && e.data.type === "lifeos-session" && e.data.session) {
          done = true;
          window.removeEventListener("message", onMsg);
          try { localStorage.setItem(KEY, e.data.session); } catch (err) {}
          resolve(true);
        }
      }
      window.addEventListener("message", onMsg);
      const poll = setInterval(() => {
        if (w.closed) {
          clearInterval(poll);
          if (!done) {
            window.removeEventListener("message", onMsg);
            hasSession() ? resolve(true) : reject(new Error("Sign-in window closed before finishing."));
          }
        }
      }, 500);
    });
  }

  async function getToken(force) {
    if (!hasSession()) throw new Error("Not connected.");
    if (!force && accessToken && Date.now() < tokenExp) return accessToken;
    const r = await fetch(base() + "/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: localStorage.getItem(KEY) }),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.error) {
      if (r.status === 400 || r.status === 401) clear(); // stale/invalid session
      throw new Error(j.error || ("token request failed (" + r.status + ")"));
    }
    accessToken = j.access_token;
    tokenExp = Date.now() + ((+j.expires_in || 3600) - 60) * 1000;
    return accessToken;
  }

  function disconnect() { clear(); }

  return { enabled, hasSession, connect, getToken, disconnect };
})();
