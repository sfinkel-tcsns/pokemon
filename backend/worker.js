/* ===========================================================
   Life OS — auth backend (Cloudflare Worker)
   Stateless "stay logged in forever" for a static site.

   Flow:
     /auth/start     -> redirects you to Google (offline access, consent)
     /auth/callback  -> exchanges the code for a REFRESH token, encrypts it,
                        and hands it back to the website (postMessage / hash)
     POST /token     -> website sends the encrypted refresh token; we decrypt
                        it, mint a fresh ACCESS token from Google, return it

   Nothing is stored server-side. The encrypted refresh token lives in the
   website's localStorage (first-party -> survives Safari's cookie blocking).
   The Google client secret + encryption secret live ONLY here as env vars.

   Required environment variables (set in the Worker's Settings > Variables):
     GOOGLE_CLIENT_ID       your OAuth client ID
     GOOGLE_CLIENT_SECRET   your OAuth client secret
     ENC_SECRET             any long random string (used to encrypt the token)
     SITE_ORIGIN            e.g. https://sfinkel-tcsns.github.io
   =========================================================== */

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// Some Canvas/Instructure hosts 403 requests that don't look like a browser.
const CANVAS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/calendar, text/plain, */*",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const site = env.SITE_ORIGIN || "*";

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), site);

    // 1) Kick off Google login
    if (url.pathname === "/auth/start") {
      const p = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: url.origin + "/auth/callback",
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      });
      return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + p, 302);
    }

    // 2) Google redirects back here with a code
    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return page("Missing authorization code.");
      const tok = await postForm("https://oauth2.googleapis.com/token", {
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: url.origin + "/auth/callback",
        grant_type: "authorization_code",
      });
      if (!tok.refresh_token) {
        return page("No refresh token returned. Publish the OAuth app and remove prior access, then try again. " +
          (tok.error_description || tok.error || ""));
      }
      const session = await encrypt(tok.refresh_token, env.ENC_SECRET);
      const body = "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:2rem\">" +
        "Connected ✓ You can close this window." +
        "<script>(function(){var s=" + JSON.stringify(session) + ";try{if(window.opener){window.opener.postMessage({type:'lifeos-session',session:s}," +
        JSON.stringify(site) + ");setTimeout(function(){window.close();},300);return;}}catch(e){}" +
        "location.replace(" + JSON.stringify(site) + "+'/#lifeos_session='+encodeURIComponent(s));})();</script></body>";
      return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // 3) Website asks for a fresh access token
    if (url.pathname === "/token" && request.method === "POST") {
      let session;
      try { session = (await request.json()).session; } catch (e) {}
      if (!session) return cors(json({ error: "no session" }, 400), site);
      let refresh;
      try { refresh = await decrypt(session, env.ENC_SECRET); } catch (e) { return cors(json({ error: "bad session" }, 400), site); }
      const tok = await postForm("https://oauth2.googleapis.com/token", {
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh,
        grant_type: "refresh_token",
      });
      if (tok.error) return cors(json({ error: tok.error_description || tok.error }, 401), site);
      return cors(json({ access_token: tok.access_token, expires_in: tok.expires_in }), site);
    }

    // 3b) Canvas diagnostic — visit in a browser to see what's wrong.
    //     Reveals the URL scheme + fetch status WITHOUT exposing the feed URL.
    if (url.pathname === "/canvas/status") {
      const feed = env.CANVAS_ICS_URL;
      if (!feed) return json({ configured: false });
      const scheme = feed.slice(0, Math.max(0, feed.indexOf(":")));
      let feedOk = false, status = 0, upcoming = 0, err = null;
      try {
        const r = await fetch(feed, { headers: CANVAS_HEADERS });
        status = r.status; feedOk = r.ok;
        if (r.ok) { const t = await r.text(); upcoming = parseICS(t).filter((e) => e.start && e.start.getTime() > Date.now() - 12 * 3600 * 1000).length; }
      } catch (e) { err = String((e && e.message) || e); }
      return json({ configured: true, scheme, feedOk, status, upcoming, err });
    }

    // 4) Canvas homework (optional) — reads your personal Canvas Calendar Feed
    //    (.ics), which needs NO admin token. Gated behind a valid Life OS session.
    //    Needs env var: CANVAS_ICS_URL
    if (url.pathname === "/canvas" && request.method === "POST") {
      let session;
      try { session = (await request.json()).session; } catch (e) {}
      if (!session) return cors(json({ error: "no session" }, 400), site);
      try { await decrypt(session, env.ENC_SECRET); } catch (e) { return cors(json({ error: "unauthorized" }, 401), site); }

      const feed = env.CANVAS_ICS_URL;
      if (!feed) return cors(json({ error: "Canvas not configured" }, 400), site);
      const text = await fetch(feed, { headers: CANVAS_HEADERS }).then((r) => (r.ok ? r.text() : null));
      if (!text) return cors(json({ error: "Canvas feed error" }, 502), site);

      const now = Date.now();
      const assignments = parseICS(text)
        .filter((e) => e.start && e.start.getTime() > now - 12 * 3600 * 1000) // today onward
        .sort((a, b) => a.start - b.start)
        .slice(0, 12)
        .map((e) => ({ title: e.title, course: e.course, dueAt: e.start.toISOString(), url: e.url, type: "assignment", missing: false }));
      return cors(json({ assignments }), site);
    }

    return new Response("Life OS auth backend is running.", { status: 200 });
  },
};

/* ---------- iCalendar parsing (for the Canvas feed) ---------- */
function parseICS(text) {
  text = text.replace(/\r?\n[ \t]/g, ""); // unfold wrapped lines
  const out = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const b of blocks) {
    const body = b.split("END:VEVENT")[0];
    const get = (k) => { const m = new RegExp("^" + k + "[^:\\r\\n]*:(.*)$", "m").exec(body); return m ? m[1].trim() : null; };
    const dt = get("DTSTART");
    if (!dt) continue;
    const start = parseICSDate(dt);
    if (!start) continue;
    const summary = unescapeICS(get("SUMMARY") || "");
    const urlv = get("URL") || "";
    let title = summary, course = "";
    const m = /^(.*)\s\[(.+?)\]\s*$/.exec(summary);
    if (m) { title = m[1].trim(); course = m[2].trim(); }
    out.push({ title, course, start, url: urlv });
  }
  return out;
}
function parseICSDate(s) {
  const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(s);
  if (!m) return null;
  const Y = +m[1], Mo = +m[2] - 1, D = +m[3];
  if (m[4] == null) return new Date(Date.UTC(Y, Mo, D));
  return new Date(Date.UTC(Y, Mo, D, +m[4], +m[5], +m[6])); // treat as UTC (feed uses Z)
}
function unescapeICS(s) {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/* ---------- helpers ---------- */
async function postForm(u, obj) {
  const r = await fetch(u, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(obj),
  });
  return r.json();
}
function cors(resp, site) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", site);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type");
  h.set("Vary", "Origin");
  return new Response(resp.body, { status: resp.status, headers: h });
}
function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json" } });
}
function page(msg) {
  return new Response("<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:2rem\">" + msg + "</body>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}
async function aesKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(text, secret) {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return b64url(out);
}
async function decrypt(b64, secret) {
  const key = await aesKey(secret);
  const buf = unb64url(b64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}
function b64url(bytes) {
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
