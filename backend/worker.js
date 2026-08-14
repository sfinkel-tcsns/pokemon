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

   Optional (cross-device to-do sync + morning YouTube-Studio feed):
     LIFEOS_KV              a KV namespace binding (Workers → Settings → Bindings)
                            powers POST /state (to-dos) and POST /youtube (Studio metrics)

   Optional (Money tab — automatic bank sync via Plaid):
     PLAID_CLIENT_ID        from dashboard.plaid.com
     PLAID_SECRET           the secret for the env you're using
     PLAID_ENV              "sandbox" (default) or "production"
     PLAID_REDIRECT_URI     only for OAuth banks in production (e.g. Chase):
                            https://sfinkel-tcsns.github.io/  (also register it in Plaid)

   Plaid flow (same stateless, Safari-proof pattern as Google):
     POST /plaid/link-token -> mint a Link token to open the Plaid popup
     POST /plaid/exchange   -> swap the public_token for a permanent access
                              token, AES-encrypt it, hand ciphertext to the site
     POST /plaid/data       -> site sends its encrypted item tokens; we decrypt,
                              call Plaid, return net worth + spending + subs
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

    // 5) Cross-device app state (checked-off to-dos). Stored in Cloudflare KV,
    //    keyed to your Google account so every signed-in device shares it.
    //    Needs a KV namespace bound as LIFEOS_KV.
    //      POST /state { session }          -> load  -> { state: <obj|null> }
    //      POST /state { session, state }   -> save  -> { ok: true }
    if (url.pathname === "/state" && request.method === "POST") {
      if (!env.LIFEOS_KV) return cors(json({ error: "State store not configured" }, 400), site);
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!body.session) return cors(json({ error: "no session" }, 400), site);
      const uid = await accountId(env, body.session);
      if (!uid) return cors(json({ error: "unauthorized" }, 401), site);
      const key = "state:" + uid;
      if (body.state !== undefined) {
        await env.LIFEOS_KV.put(key, JSON.stringify(body.state));
        return cors(json({ ok: true }), site);
      }
      const raw = await env.LIFEOS_KV.get(key);
      return cors(json({ state: raw ? JSON.parse(raw) : null }), site);
    }

    // 6) YouTube "Studio-only" metrics feed. Your morning browser run POSTs the
    //    numbers no API exposes (CTR, impressions, RPM, revenue, retention…);
    //    the site GETs them and merges over the live API data. KV-backed,
    //    keyed to your Google account. Needs LIFEOS_KV.
    //      POST /youtube { session }            -> { metrics: <obj|null> }
    //      POST /youtube { session, metrics }   -> { ok: true }
    if (url.pathname === "/youtube" && request.method === "POST") {
      if (!env.LIFEOS_KV) return cors(json({ error: "State store not configured" }, 400), site);
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!body.session) return cors(json({ error: "no session" }, 400), site);
      const uid = await accountId(env, body.session);
      if (!uid) return cors(json({ error: "unauthorized" }, 401), site);
      const key = "youtube:" + uid;
      if (body.metrics !== undefined) {
        const rec = Object.assign({}, body.metrics);
        if (!rec.updatedAt) rec.updatedAt = new Date().toISOString();
        await env.LIFEOS_KV.put(key, JSON.stringify(rec));
        return cors(json({ ok: true }), site);
      }
      const raw = await env.LIFEOS_KV.get(key);
      return cors(json({ metrics: raw ? JSON.parse(raw) : null }), site);
    }

    /* ---------- Money: Plaid bank sync ---------- */

    // P1) Mint a Link token — opens the Plaid popup on the site.
    if (url.pathname === "/plaid/link-token" && request.method === "POST") {
      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return cors(json({ error: "Plaid not configured" }, 400), site);
      const body = {
        user: { client_user_id: "lifeos-user" },
        client_name: "Life OS",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      };
      if (env.PLAID_REDIRECT_URI) body.redirect_uri = env.PLAID_REDIRECT_URI;
      const r = await plaidPost(env, "/link/token/create", body);
      if (!r.link_token) return cors(json({ error: r.error_message || r.error_code || "link_token failed" }, 400), site);
      return cors(json({ link_token: r.link_token }), site);
    }

    // P2) Exchange the public_token for a permanent access token, encrypt it.
    if (url.pathname === "/plaid/exchange" && request.method === "POST") {
      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return cors(json({ error: "Plaid not configured" }, 400), site);
      let public_token;
      try { public_token = (await request.json()).public_token; } catch (e) {}
      if (!public_token) return cors(json({ error: "no public_token" }, 400), site);
      const ex = await plaidPost(env, "/item/public_token/exchange", { public_token });
      if (!ex.access_token) return cors(json({ error: ex.error_message || "exchange failed" }, 400), site);
      let institution = "Bank";
      try {
        const it = await plaidPost(env, "/item/get", { access_token: ex.access_token });
        const instId = it.item && it.item.institution_id;
        if (instId) {
          const inst = await plaidPost(env, "/institutions/get_by_id", { institution_id: instId, country_codes: ["US"] });
          institution = (inst.institution && inst.institution.name) || institution;
        }
      } catch (e) {}
      const enc = await encrypt(ex.access_token, env.ENC_SECRET);
      return cors(json({ item: enc, institution }), site);
    }

    // P3) Aggregate all connected items into the Money-tab shape.
    if (url.pathname === "/plaid/data" && request.method === "POST") {
      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return cors(json({ error: "Plaid not configured" }, 400), site);
      let items, budget;
      try { const b = await request.json(); items = b.items; budget = b.budget; } catch (e) {}
      if (!Array.isArray(items) || !items.length) return cors(json({ error: "no items" }, 400), site);
      const tokens = [];
      for (const enc of items) { try { tokens.push(await decrypt(enc, env.ENC_SECRET)); } catch (e) {} }
      if (!tokens.length) return cors(json({ error: "bad items" }, 400), site);
      try {
        const money = await buildMoney(env, tokens, budget);
        return cors(json(money), site);
      } catch (e) {
        return cors(json({ error: String((e && e.message) || e) }, 502), site);
      }
    }

    return new Response("Life OS auth backend is running.", { status: 200 });
  },
};

/* ---------- account identity ---------- */
// Resolve a stable per-account id (Google "sub") from an encrypted session,
// used to key per-user KV data. Returns null if the session is invalid.
async function accountId(env, session) {
  let refresh;
  try { refresh = await decrypt(session, env.ENC_SECRET); } catch (e) { return null; }
  const tok = await postForm("https://oauth2.googleapis.com/token", {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  if (!tok.access_token) return null;
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + tok.access_token },
  }).then((r) => r.json()).catch(() => ({}));
  return info.sub || info.email || null;
}

/* ---------- Plaid helpers ---------- */
function plaidBase(env) { return "https://" + (env.PLAID_ENV || "sandbox") + ".plaid.com"; }
async function plaidPost(env, path, body) {
  const r = await fetch(plaidBase(env) + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET }, body)),
  });
  return r.json();
}
function ymd(d) { return d.toISOString().slice(0, 10); }
function titleCase(s) {
  return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
// Build the Money-tab payload (netWorth, accounts, month, spendingByCategory,
// subscriptions) from one or more Plaid access tokens.
async function buildMoney(env, tokens, budget) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  const accounts = [];
  let netWorth = 0;
  const txns = [];
  const subs = [];
  let syncing = false;

  for (const access_token of tokens) {
    // Balances → accounts + net worth
    const bal = await plaidPost(env, "/accounts/balance/get", { access_token });
    for (const a of (bal.accounts || [])) {
      const cur = (a.balances && (a.balances.current != null ? a.balances.current : a.balances.available)) || 0;
      const liability = a.type === "credit" || a.type === "loan";
      netWorth += liability ? -cur : cur;
      accounts.push({
        name: a.name || a.official_name || titleCase(a.subtype || a.type),
        type: titleCase(a.subtype || a.type),
        balance: cur,
        liability,
      });
    }

    // Transactions this month → spent + categories
    const tx = await plaidPost(env, "/transactions/get", {
      access_token,
      start_date: ymd(monthStart),
      end_date: ymd(now),
      options: { count: 250, offset: 0 },
    });
    if (tx.error_code === "PRODUCT_NOT_READY") { syncing = true; }
    for (const t of (tx.transactions || [])) txns.push(t);

    // Recurring outflows → subscriptions (best effort)
    try {
      const rec = await plaidPost(env, "/transactions/recurring/get", { access_token });
      for (const s of (rec.outflow_streams || [])) {
        if (s.is_active === false) continue;
        const amt = Math.abs((s.average_amount && s.average_amount.amount) || (s.last_amount && s.last_amount.amount) || 0);
        if (!amt) continue;
        const yearly = /ANNUAL/i.test(s.frequency || "");
        subs.push({ name: s.merchant_name || s.description || "Subscription", amount: amt, cadence: yearly ? "yr" : "mo" });
      }
    } catch (e) {}
  }

  // Spending: money out of account (positive amount in Plaid), excluding transfers.
  const catMap = {};
  let spent = 0;
  for (const t of txns) {
    const primary = (t.personal_finance_category && t.personal_finance_category.primary) || (t.category && t.category[0]) || "OTHER";
    if (/TRANSFER|LOAN_PAYMENTS/i.test(primary)) continue;
    if (!(t.amount > 0)) continue; // negatives are inflow/refunds
    spent += t.amount;
    const label = titleCase(primary);
    catMap[label] = (catMap[label] || 0) + t.amount;
  }
  const spendingByCategory = Object.keys(catMap)
    .map((category) => ({ category, amount: Math.round(catMap[category]) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // De-dupe subscriptions by name (across items), keep the larger amount.
  const subMap = {};
  for (const s of subs) {
    const k = s.name.toLowerCase();
    if (!subMap[k] || s.amount > subMap[k].amount) subMap[k] = s;
  }
  const subscriptions = Object.values(subMap).sort((a, b) => b.amount - a.amount);

  return {
    updatedAt: ymd(now),
    live: true,
    syncing,
    netWorth: Math.round(netWorth),
    accounts: accounts.map((a) => ({ name: a.name, type: a.type, balance: Math.round(a.balance) })),
    month: { label: monthLabel, budget: Number(budget) || 1800, spent: Math.round(spent) },
    spendingByCategory,
    subscriptions,
  };
}

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
