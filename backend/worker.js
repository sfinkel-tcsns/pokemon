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

    // 4) Canvas homework (optional) — proxied so the token stays server-side
    //    and CORS works. Gated behind a valid Life OS session.
    //    Needs env vars: CANVAS_BASE_URL, CANVAS_TOKEN
    if (url.pathname === "/canvas" && request.method === "POST") {
      let session;
      try { session = (await request.json()).session; } catch (e) {}
      if (!session) return cors(json({ error: "no session" }, 400), site);
      try { await decrypt(session, env.ENC_SECRET); } catch (e) { return cors(json({ error: "unauthorized" }, 401), site); }

      const base = String(env.CANVAS_BASE_URL || "").replace(/\/+$/, "");
      if (!base || !env.CANVAS_TOKEN) return cors(json({ error: "Canvas not configured" }, 400), site);

      const today = new Date().toISOString().slice(0, 10);
      const r = await fetch(base + "/api/v1/planner/items?start_date=" + today + "&per_page=50",
        { headers: { Authorization: "Bearer " + env.CANVAS_TOKEN } });
      if (!r.ok) return cors(json({ error: "Canvas API " + r.status }, 502), site);

      const items = await r.json();
      const assignments = (Array.isArray(items) ? items : [])
        .filter((it) => ["assignment", "quiz", "discussion_topic"].includes(it.plannable_type))
        .map((it) => ({ it, due: (it.plannable && it.plannable.due_at) || it.plannable_date }))
        .filter((x) => x.due && !(x.it.submissions && (x.it.submissions.submitted || x.it.submissions.graded || x.it.submissions.excused)))
        .map((x) => ({
          title: (x.it.plannable && x.it.plannable.title) || x.it.plannable_type,
          course: x.it.context_name || "",
          dueAt: x.due,
          url: x.it.html_url ? (x.it.html_url.startsWith("http") ? x.it.html_url : base + x.it.html_url) : base,
          type: x.it.plannable_type,
          missing: !!(x.it.submissions && x.it.submissions.missing),
        }))
        .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
        .slice(0, 12);
      return cors(json({ assignments }), site);
    }

    return new Response("Life OS auth backend is running.", { status: 200 });
  },
};

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
