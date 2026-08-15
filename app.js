/* ===========================================================
   Life OS — calendar dashboard (single unified calendar)
   Data source: live Google Calendar (when connected) or the
   seeded snapshot in data/events.js (fallback / zero-setup).
   Events are colored by life-category, derived from the title.
   =========================================================== */

/* ---------- categories ---------- */
const CATEGORIES = {
  work:     { label: "Work",     color: "var(--c-work)" },
  health:   { label: "Health",   color: "var(--c-health)" },
  meal:     { label: "Meals",    color: "var(--c-meal)" },
  social:   { label: "Social",   color: "var(--c-social)" },
  travel:   { label: "Travel",   color: "var(--c-travel)" },
  rest:     { label: "Rest",     color: "var(--c-rest)" },
  brief:    { label: "Briefs",   color: "var(--c-brief)" },
  personal: { label: "Personal", color: "var(--c-personal)" },
};

function categorize(ev) {
  const t = (ev.title || "").toLowerCase();
  if (ev.allDay) return "brief"; // holidays, birthdays, news/coach briefs, all-day markers
  if (/sleep|wind down|wind-down/.test(t)) return "rest";
  if (/gym|s\.a\.v\.e\.r\.s|savers|shower|workout|run\b/.test(t)) return "health";
  if (/dinner|lunch|breakfast|meal|eat\b|coffee/.test(t)) return "meal";
  if (/drive|🚗|commute|uber|flight/.test(t)) return "travel";
  if (/chapter|rush|o-week|oweek|greek|pref dinner|bid |voting|country music|friends|movie|odyssey| @ |eagles|ravens|patriots|bengals|commanders|titans|bears|rams|jaguars|nebraska|cornhusker|texas|longhorn/.test(t)) return "social";
  if (/clickster|admin|work|portal|laptop|forms?|email|meeting|call|excel|triage|bridge center|accommodation/.test(t)) return "work";
  return "personal";
}

/* ---------- time helpers (wall-clock, calendar TZ) ---------- */
let TZ = "America/Chicago";
function wallTime(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  let h = +m[1]; const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}
function dayKey(iso) { return String(iso).slice(0, 10); }
function nowWall() {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date());
}
function durationLabel(ev) {
  if (ev.allDay) return "all day";
  const mins = Math.round((new Date(ev.end) - new Date(ev.start)) / 60000);
  if (isNaN(mins) || mins <= 0) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), r = mins % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function prettyDate(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}
function shortDate(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/* ---------- app state (rebuilt whenever data source changes) ---------- */
const STATE = { events: [], byDay: {}, dayKeys: [], today: "", anchor: "", live: false };

function loadData(data) {
  TZ = (data && data.timeZone) || "America/Chicago";
  const events = (data && data.events || [])
    .map((e) => ({ ...e, cat: categorize(e), key: dayKey(e.start) }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const byDay = {};
  for (const e of events) (byDay[e.key] ||= []).push(e);
  const dayKeys = Object.keys(byDay).sort();
  const today = todayKey();

  STATE.events = events;
  STATE.byDay = byDay;
  STATE.dayKeys = dayKeys;
  STATE.today = today;
  STATE.anchor = byDay[today] ? today : (dayKeys.find((k) => k >= today) || dayKeys[0] || today);
  STATE.live = !!(data && data.live);

  setSync(STATE.live ? "live" : "snapshot", data && data.syncedAt);
  render();
}

/* ---------- render helpers ---------- */
function catColor(cat) { return CATEGORIES[cat].color; }
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function firstLine(s) { return String(s).split("\n")[0]; }

function statusOf(ev) {
  if (ev.allDay) return "";
  const now = new Date(), s = new Date(ev.start), e = new Date(ev.end);
  if (e < now) return "past";
  if (s <= now && now <= e) return "current";
  return "";
}
function eventRow(ev) {
  const dur = durationLabel(ev);
  return `
    <div class="event ${statusOf(ev)}">
      <div class="event-time">
        ${ev.allDay ? "all day" : wallTime(ev.start)}
        ${dur ? `<span class="dur">${dur}</span>` : ""}
      </div>
      <div class="event-body">
        <span class="event-bar" style="background:${catColor(ev.cat)}"></span>
        <div>
          <div class="event-title">${escapeHtml(ev.title)}</div>
          ${ev.location ? `<div class="event-loc">📍 ${escapeHtml(firstLine(ev.location))}</div>` : ""}
          <div class="event-cat">${CATEGORIES[ev.cat].label}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- stats ---------- */
function renderStats() {
  const el = document.getElementById("stats");
  const anchor = STATE.anchor;
  const todays = (STATE.byDay[anchor] || []).filter((e) => !e.allDay);
  const now = new Date();
  const next = STATE.events.find((e) => !e.allDay && new Date(e.start) > now);

  const focusMins = todays.filter((e) => e.cat === "work")
    .reduce((s, e) => s + (new Date(e.end) - new Date(e.start)) / 60000, 0);
  const loadMins = todays.filter((e) => e.cat !== "rest")
    .reduce((s, e) => s + (new Date(e.end) - new Date(e.start)) / 60000, 0);

  const nextLabel = next ? escapeHtml(truncate(next.title, 22)) : "Nothing scheduled";
  const nextSub = next
    ? `${next.allDay ? "all day" : wallTime(next.start)} · ${next.key === anchor ? "today" : shortDate(next.key)}`
    : "—";

  const cards = [
    { label: "Events", value: (STATE.byDay[anchor] || []).length, sub: prettyDate(anchor) },
    { label: "Focus / work", value: hoursLabel(focusMins), sub: "deep-work blocks" },
    { label: "Scheduled load", value: hoursLabel(loadMins), sub: "excludes sleep" },
    { label: "Up next", value: nextLabel, sub: nextSub, accent: true, small: true },
  ];
  el.innerHTML = cards.map((c) => `
    <div class="stat">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.accent ? "accent" : ""}" ${c.small ? 'style="font-size:17px"' : ""}>${c.value}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>`).join("");
}
function hoursLabel(mins) {
  const h = mins / 60;
  return h >= 1 ? `${Math.round(h * 10) / 10}h` : `${Math.round(mins)}m`;
}
function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/* ---------- views ---------- */
// Calendar sub-views render into #calBody (inside the Calendar tab) when present.
function calBodyEl() { return document.getElementById("calBody") || document.getElementById("view"); }
function renderToday() {
  const view = calBodyEl();
  const list = STATE.byDay[STATE.anchor] || [];
  if (!list.length) { view.innerHTML = `<div class="empty">No events for this day.</div>`; return; }

  const allday = list.filter((e) => e.allDay);
  const timed = list.filter((e) => !e.allDay);
  const now = new Date();
  const nextIdx = timed.findIndex((e) => new Date(e.start) > now);
  const showNow = STATE.anchor === STATE.today && nextIdx > 0;

  let html = "";
  if (allday.length) {
    html += `<div class="allday-strip">` +
      allday.map((e) => `<div class="allday" style="border-left-color:${catColor(e.cat)}">${escapeHtml(e.title)}</div>`).join("") +
      `</div>`;
  }
  html += `<div class="timeline">`;
  timed.forEach((e, i) => {
    if (showNow && i === nextIdx) html += `<div class="tl-now"><span class="tl-now-dot"></span>Now · ${nowWall()}</div>`;
    html += eventRow(e);
  });
  view.innerHTML = html + `</div>`;
}

function renderWeek() {
  const view = calBodyEl();
  const [y, mo, d] = STATE.anchor.split("-").map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d));
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7)); // Monday

  let html = `<div class="week">`;
  for (let i = 0; i < 7; i++) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    const evs = STATE.byDay[key] || [];
    const shown = evs.slice(0, 6);
    html += `
      <div class="day-col ${key === STATE.today ? "is-today" : ""}">
        <div class="day-head">
          <div class="day-dow">${day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</div>
          <div class="day-num">${day.getUTCDate()}</div>
        </div>
        <div class="day-events">
          ${shown.map((e) => `
            <div class="chip">
              <span class="chip-dot" style="background:${catColor(e.cat)}"></span>
              ${e.allDay ? "" : `<span class="chip-time">${wallTime(e.start).replace(":00", "")}</span>`}
              <span class="chip-title">${escapeHtml(e.title)}</span>
            </div>`).join("")}
          ${evs.length > 6 ? `<div class="day-more">+${evs.length - 6} more</div>` : ""}
          ${evs.length === 0 ? `<div class="day-more">—</div>` : ""}
        </div>
      </div>`;
  }
  view.innerHTML = html + `</div>`;
}

function renderUpcoming() {
  const view = calBodyEl();
  const keys = STATE.dayKeys.filter((k) => k >= STATE.today);
  const use = keys.length ? keys : STATE.dayKeys;
  if (!use.length) { view.innerHTML = `<div class="empty">No upcoming events.</div>`; return; }
  view.innerHTML = use.map((key) => `
    <div class="up-group">
      <div class="up-date">${prettyDate(key)}${key === STATE.today ? " · Today" : ""}</div>
      <div class="timeline">${STATE.byDay[key].map(eventRow).join("")}</div>
    </div>`).join("");
}

/* ---------- legend ---------- */
function renderLegend() {
  document.getElementById("legend").innerHTML = Object.values(CATEGORIES)
    .map((c) => `<span class="legend-item"><span class="legend-dot" style="background:${c.color}"></span>${c.label}</span>`)
    .join("");
}

/* ---------- YouTube view ---------- */
let YT_DATA = window.YOUTUBE_DATA;   // swapped for live data on Connect

function fmtNum(n) {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}
function renderYouTube() {
  const YT = YT_DATA;
  const stats = document.getElementById("stats");
  const view = document.getElementById("view");
  if (!YT) { stats.innerHTML = ""; view.innerHTML = `<div class="empty">No YouTube data yet.</div>`; return; }

  const a = YT.analytics || {};
  const pillarColor = (p) => (YT.pillars && YT.pillars[p]) || "var(--c-personal)";

  stats.innerHTML = [
    { label: "Subscribers", value: fmtNum(YT.channel.subscribers), sub: a.subsGained ? "+" + fmtNum(a.subsGained) + " · " + (a.period || "") : YT.channel.title },
    { label: "Views", value: fmtNum(a.views), sub: a.period || "" },
    { label: "CTR", value: a.ctr != null ? a.ctr + "%" : "—", sub: a.impressions ? fmtNum(a.impressions) + " impressions" : "from Studio", accent: true },
    { label: "Watch time", value: fmtNum(a.watchHours) + " hrs", sub: a.period || "" },
  ].map((c) => `
    <div class="stat">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.accent ? "accent" : ""}">${c.value}</div>
      <div class="stat-sub">${escapeHtml(c.sub)}</div>
    </div>`).join("");

  const sheetBtn = YT.sheetUrl
    ? `<a class="sheet-btn" href="${escapeHtml(YT.sheetUrl)}" target="_blank" rel="noopener">📄 Open ideas sheet</a>` : "";

  const configured = window.LifeOSYouTube && LifeOSYouTube.isConfigured();
  const statusHtml = YT.live
    ? `<span class="yt-status live">● live · ${YT.syncedAt ? new Date(YT.syncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "now"}</span>`
    : `<span class="yt-status">Updated ${YT.updatedAt ? new Date(YT.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} · snapshot</span>`;
  let connControls = "";
  if (configured && YT.live) {
    connControls = `<button class="conn-btn ghost sm" id="ytRefresh">↻ Refresh</button><button class="conn-btn ghost sm" id="ytDisc">Disconnect</button>`;
  } else if (configured) {
    connControls = `<button class="conn-btn primary sm" id="ytConnect">Connect YouTube (live)</button>`;
  }

  const traffic = (YT.traffic || []).map((t) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(t.label)}</span>
      <span class="bar"><span class="bar-fill" style="width:${t.pct}%"></span></span>
      <span class="traffic-pct">${t.pct}%</span>
    </div>`).join("");

  const ideaCard = (it) => `
    <div class="idea">
      <span class="pill" style="background:${pillarColor(it.pillar)}22;color:${pillarColor(it.pillar)}">${escapeHtml(it.pillar)}</span>
      <div class="idea-title">${escapeHtml(it.title)}</div>
      <div class="idea-hook">${escapeHtml(it.hook)}</div>
      <div class="idea-basis">↳ ${escapeHtml(it.basis)}</div>
    </div>`;

  const pipeRow = (p) => `
    <div class="pipe-row">
      <span class="pipe-day">${escapeHtml(p.day)}</span>
      <span class="pipe-dot" style="background:${pillarColor(p.pillar)}"></span>
      <span class="pipe-title">${escapeHtml(p.title)}</span>
      <span class="status-badge status-${p.status.toLowerCase()}">${escapeHtml(p.status)}</span>
    </div>`;

  // ----- audience section -----
  const aud = YT.audience || {};
  const maxAge = Math.max(1, ...(aud.age || []).map((a) => a.pct));
  const ageCard = (aud.age || []).map((a) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(a.group)}</span>
      <span class="bar"><span class="bar-fill" style="width:${Math.round(a.pct / maxAge * 100)}%"></span></span>
      <span class="traffic-pct">${a.pct}%</span>
    </div>`).join("");
  const genderCard = (aud.gender || []).map((g) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(g.label)}</span>
      <span class="bar"><span class="bar-fill" style="width:${g.pct}%"></span></span>
      <span class="traffic-pct">${g.pct}%</span>
    </div>`).join("");
  const geoCard = (aud.geography || []).map((c) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(c.country)}</span>
      <span class="bar"><span class="bar-fill" style="width:${Math.round(c.pct / (aud.geography[0].pct || 100) * 100)}%"></span></span>
      <span class="traffic-pct">${c.pct}%</span>
    </div>`).join("");
  const formatCard = (aud.format || []).map((f) => `
    <div class="fmt-row">
      <span class="fmt-label">${escapeHtml(f.label)}</span>
      <span class="fmt-nums">${f.viewsPct}% views · <b>${f.watchPct}% watch</b></span>
    </div>`).join("");
  const deviceCard = (aud.device || []).map((d) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(d.label)}</span>
      <span class="bar"><span class="bar-fill" style="width:${Math.round(d.pct / ((aud.device[0] || {}).pct || 100) * 100)}%"></span></span>
      <span class="traffic-pct">${d.pct}%</span>
    </div>`).join("");

  const audienceHtml = aud.age ? `
    <div class="yt-section-title">Who's watching · ${escapeHtml((YT.analytics || {}).period || "recent")}</div>
    <div class="aud-grid">
      <div class="aud-card"><div class="aud-h">Age</div>${ageCard}</div>
      <div class="aud-card"><div class="aud-h">Gender</div>${genderCard}</div>
      <div class="aud-card"><div class="aud-h">Top countries</div>${geoCard}</div>
      ${aud.device && aud.device.length ? `<div class="aud-card"><div class="aud-h">Device</div>${deviceCard}</div>` : ""}
      <div class="aud-card"><div class="aud-h">Format</div>${formatCard}</div>
    </div>` : "";

  const factsHtml = (YT.facts && YT.facts.length)
    ? `<div class="yt-facts">${YT.facts.map((f) => `<span class="fact">${escapeHtml(f)}</span>`).join("")}</div>` : "";

  view.innerHTML = `
    <div class="yt-toolbar">
      <div class="yt-toolbar-left">${statusHtml}${connControls}</div>
      ${sheetBtn}
    </div>
    <div class="conn-err" id="ytErr"></div>
    ${factsHtml}
    ${YT.insight ? `<div class="insight">💡 ${escapeHtml(YT.insight)}</div>` : ""}
    ${audienceHtml}
    <div class="yt-grid">
      <div class="yt-col">
        <div class="yt-section-title">Today's ideas</div>
        <div class="ideas-grid">${(YT.today || []).map(ideaCard).join("")}</div>
        <div class="yt-section-title">This week's pipeline</div>
        <div class="pipe">${(YT.pipeline || []).map(pipeRow).join("")}</div>
      </div>
      <div class="yt-side">
        <div class="yt-section-title">Traffic sources</div>
        <div class="traffic">${traffic}</div>
        <div class="yt-section-title">Top videos · ${escapeHtml(a.period || "recent")}</div>
        <div class="topvids">
          ${(YT.topRecent || []).map((v) => `
            <div class="topvid">
              <span class="topvid-title">${escapeHtml(v.title)}</span>
              <span class="topvid-views">${fmtNum(v.views)}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>`;

  const byId = (id) => document.getElementById(id);
  if (byId("ytConnect")) byId("ytConnect").addEventListener("click", ytConnect);
  if (byId("ytRefresh")) byId("ytRefresh").addEventListener("click", ytRefresh);
  if (byId("ytDisc")) byId("ytDisc").addEventListener("click", ytDisconnect);
}

// overlay live API numbers but keep Studio-only fields (CTR, impressions,
// revenue, facts, device split) the API can't provide, then re-render.
let STUDIO = null;   // Studio-only metrics fed in each morning (CTR/impressions/RPM/…)

// Merge the morning Studio feed on top of whatever YouTube data we have.
// Studio wins for the fields the API can't provide; sub-objects merge so it
// fills gaps (e.g. adds device split) instead of wiping age/gender.
function applyStudioOver(yt) {
  if (!STUDIO || !yt) return yt;
  ["analytics", "channel", "audience"].forEach((k) => {
    if (STUDIO[k] && typeof STUDIO[k] === "object") yt[k] = Object.assign({}, yt[k], STUDIO[k]);
  });
  ["facts", "traffic", "topRecent", "insight", "ideasToday", "pipeline"].forEach((k) => {
    if (STUDIO[k] !== undefined) yt[k] = STUDIO[k];
  });
  if (STUDIO.updatedAt) yt.studioAt = STUDIO.updatedAt;
  return yt;
}

// Pull the stored Studio feed and re-render (backend session required).
async function fetchStudio() {
  if (!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getYouTubeFeed)) return;
  let m;
  try { m = await LifeOSSession.getYouTubeFeed(); } catch (e) { return; }
  if (m === undefined) return;   // request failed — leave current data
  STUDIO = m;                    // null (none yet) or the payload object
  applyStudioOver(YT_DATA);
  if (CURRENT === "youtube") renderYouTube();
}

// Pull the freshest morning brief pushed by your morning run (backend session
// required). Falls back silently to the committed seed if none is stored.
async function fetchBrief() {
  if (!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getBrief)) return;
  let b;
  try { b = await LifeOSSession.getBrief(); } catch (e) { return; }
  if (!b || typeof b !== "object") return;   // null/none → keep seed
  window.BRIEF_DATA = b;
  updateNeedCount();
  if (CURRENT === "morning") render();       // render() also refreshes the date subtitle
}

// Pull the money data pushed by your morning run (Rocket Money). Falls back to
// Plaid (if connected) or the sample seed when none is stored.
async function fetchMoney() {
  if (!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getMoney)) return;
  let m;
  try { m = await LifeOSSession.getMoney(); } catch (e) { return; }
  if (!m || typeof m !== "object") return;   // null/none → keep Plaid/sample
  LIVE_MONEY = m;
  try { localStorage.setItem("lifeos-money-fed", JSON.stringify(m)); } catch (e) {}
  if (CURRENT === "money") renderMoney();
}

function applyLiveYT(live) {
  const snap = window.YOUTUBE_DATA || {};
  const mergedAudience = Object.assign({}, snap.audience, {
    gender: live.audience.gender, age: live.audience.age, geography: live.audience.geography,
  });
  if (live.audience.format && live.audience.format.length) mergedAudience.format = live.audience.format;
  YT_DATA = Object.assign({}, snap, {
    channel: live.channel,
    analytics: Object.assign({}, snap.analytics, live.analytics),
    traffic: live.traffic,
    audience: mergedAudience,
    topRecent: live.topRecent,
    live: true, syncedAt: live.syncedAt,
  });
  applyStudioOver(YT_DATA);   // Studio-only fields win over both seed and API
  if (CURRENT === "youtube") renderYouTube();
}

async function ytConnect() {
  const btn = document.getElementById("ytConnect");
  if (btn) { btn.textContent = "Connecting…"; btn.disabled = true; }
  try {
    if (window.LifeOSSession && LifeOSSession.enabled() && !LifeOSSession.hasSession()) {
      await LifeOSSession.connect();   // one backend login covers Calendar + YouTube
    }
    applyLiveYT(await LifeOSYouTube.fetchAll());
    fetchStudio();
    if (backendActive()) refreshCalendar().catch(() => {});
  } catch (e) {
    const el = document.getElementById("ytErr");
    if (el) el.textContent = e.message;
    if (btn) { btn.textContent = "Connect YouTube (live)"; btn.disabled = false; }
  }
}
async function ytRefresh() {
  const btn = document.getElementById("ytRefresh");
  if (btn) { btn.textContent = "Refreshing…"; btn.disabled = true; }
  try { await ytConnect(); } catch (e) {}
}
function ytDisconnect() {
  try { LifeOSYouTube.disconnect(); } catch (e) {}
  try { if (window.LifeOSSession && LifeOSSession.enabled()) LifeOSSession.disconnect(); } catch (e) {}
  YT_DATA = window.YOUTUBE_DATA;
  renderYouTube();
  if (window.LifeOSSession && LifeOSSession.enabled() && !LifeOSSession.hasSession()) {
    loadData(window.CALENDAR_DATA || { events: [] });   // backend logout covers Calendar too
    renderConn("snapshot");
  }
}

/* ---------- Tasks: done / dismissed / user-added (synced via /state) ---------- */
function loadDone() { try { return JSON.parse(localStorage.getItem("lifeos-done") || "{}"); } catch (e) { return {}; } }
function loadDismissed() { try { return JSON.parse(localStorage.getItem("lifeos-dismissed") || "{}"); } catch (e) { return {}; } }
function loadUserTasks() { try { return JSON.parse(localStorage.getItem("lifeos-tasks") || "[]"); } catch (e) { return []; } }
function saveDone(d) { localStorage.setItem("lifeos-done", JSON.stringify(d)); pushStateCloud(); }
function saveDismissed(d) { localStorage.setItem("lifeos-dismissed", JSON.stringify(d)); pushStateCloud(); }
function saveUserTasks(t) { localStorage.setItem("lifeos-tasks", JSON.stringify(t)); pushStateCloud(); }

// Add a user-created task (shows in My tasks on Morning + Tasks). Persists + syncs.
function addUserTask(title) {
  title = String(title || "").trim();
  if (!title) return;
  const tasks = loadUserTasks();
  tasks.unshift({ id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), title });
  saveUserTasks(tasks);
  if (CURRENT === "tasks") renderTasks();
  else if (CURRENT === "morning") renderMorning();
}
// Delete a task entirely. User tasks are removed; fed items (needs/do-now/school)
// are added to a dismissed set so they stay hidden even after the next feed.
function deleteTask(key, isUser) {
  if (isUser) saveUserTasks(loadUserTasks().filter((t) => t.id !== key));
  else { const d = loadDismissed(); d[key] = true; saveDismissed(d); }
  const dn = loadDone(); if (dn[key]) { delete dn[key]; localStorage.setItem("lifeos-done", JSON.stringify(dn)); }
}

// --- Cross-device sync (done + dismissed + user tasks) via the backend session ---
function doneSyncable() { return !!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.putState); }
function stateBlob() { return { v: 2, done: loadDone(), dismissed: loadDismissed(), tasks: loadUserTasks() }; }
function stateHasLocal() { return Object.keys(loadDone()).length || Object.keys(loadDismissed()).length || loadUserTasks().length; }
let _statePushTimer = null;
function pushStateCloud() {
  if (!doneSyncable()) return;                 // stays local-only until you're logged in
  clearTimeout(_statePushTimer);
  _statePushTimer = setTimeout(() => { LifeOSSession.putState(stateBlob()).catch(() => {}); }, 700);
}
// Pull the account's saved state and adopt it. First device seeds the cloud from
// its local copy; every other device then adopts the shared copy.
async function pullStateCloud() {
  if (!doneSyncable()) return;
  let cloud;
  try { cloud = await LifeOSSession.getState(); } catch (e) { return; }
  if (cloud === undefined) return;             // request failed — leave local as-is
  if (cloud === null) {                        // never saved yet → seed from this device
    if (stateHasLocal()) LifeOSSession.putState(stateBlob()).catch(() => {});
    return;
  }
  if (cloud && cloud.v === 2) {
    localStorage.setItem("lifeos-done", JSON.stringify(cloud.done || {}));
    localStorage.setItem("lifeos-dismissed", JSON.stringify(cloud.dismissed || {}));
    localStorage.setItem("lifeos-tasks", JSON.stringify(cloud.tasks || []));
  } else {
    localStorage.setItem("lifeos-done", JSON.stringify(cloud));  // legacy: plain done-map
  }
  updateNeedCount();
  if (CURRENT === "morning") renderMorning();
  else if (CURRENT === "tasks") renderTasks();
}

// Keep the "Needs you" badge in sync (excludes done + deleted).
function updateNeedCount() {
  const el = document.getElementById("needCount");
  const B = window.BRIEF_DATA;
  if (!el || !B || !B.needsYou) return;
  const done = loadDone(), dm = loadDismissed();
  const n = (B.needsYou.items || []).filter((i) => { const k = i.url || i.title; return !done[k] && !dm[k]; }).length;
  el.textContent = n;
  el.style.display = n ? "" : "none";
}

// A checkable, deletable to-do row. Checkbox crosses it out (persists); the ×
// removes it entirely. Used by Needs-you, Do-now, School, and user tasks.
function needRow(o) {
  const done = !!loadDone()[o.key];
  const tag = o.url ? "a" : "div";
  const attr = o.url ? ` href="${escapeHtml(o.url)}" target="_blank" rel="noopener"` : "";
  return `
    <div class="need-item ${o.extraClass || ""} ${done ? "done" : ""}" data-key="${escapeHtml(o.key)}"${o.user ? ' data-user="1"' : ""}>
      <button class="need-check" aria-checked="${done}" aria-label="Mark done" title="Mark done"></button>
      <${tag} class="need-body"${attr}>
        <div class="need-title">${o.titleHtml || escapeHtml(o.title)}${o.when ? ` <span class="task-when">${escapeHtml(o.when)}</span>` : ""}</div>
        ${o.why ? `<div class="need-why">${escapeHtml(o.why)}</div>` : ""}
        ${o.from ? `<div class="need-from">${escapeHtml(o.from)} ↗</div>` : ""}
      </${tag}>
      <button class="need-del" aria-label="Remove" title="Remove">×</button>
    </div>`;
}
// Add-a-task input row.
function taskAddBox(ph, big) {
  return `<div class="task-add${big ? " big" : ""}">
    <input class="task-add-input" type="text" placeholder="${escapeHtml(ph || "Add a task…")}" aria-label="Add a task" />
    <button class="task-add-btn">+ Add</button>
  </div>`;
}

function daysUntil(dateStr) {
  const a = new Date(todayKey() + "T00:00:00Z");
  const b = new Date(String(dateStr) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}
function whenLabel(w) {
  if (w.date) {
    const d = daysUntil(w.date);
    return d === 0 ? "today" : d === 1 ? "tomorrow" : d > 1 ? "in " + d + " days" : shortDate(w.date);
  }
  return w.when || "";
}
// True for near-term, actionable items → they belong in "Do now" tasks.
function isNow(w) {
  if (w.now != null) return !!w.now;
  if (w.date != null) { const d = daysUntil(w.date); return d >= 0 && d <= 7; }
  return false;
}
function watchRow(w) {
  const when = whenLabel(w);
  const soon = w.date != null && daysUntil(w.date) >= 0 && daysUntil(w.date) <= 7;
  return `
    <a class="watch-item" href="${escapeHtml(w.url || "#")}" target="_blank" rel="noopener">
      <div class="watch-main">
        <div class="watch-title">${escapeHtml(w.title)}</div>
        ${w.note ? `<div class="watch-note">${escapeHtml(w.note)}</div>` : ""}
      </div>
      <div class="watch-when ${soon ? "soon" : ""}">${escapeHtml(when)}</div>
    </a>`;
}
// A near-term "Do now" task — checkable + deletable.
function taskRow(w) {
  return needRow({ key: w.url || w.title, url: w.url, extraClass: "task", title: w.title, why: w.note, when: whenLabel(w) });
}

function timeAgo(ymd) { const d = -daysUntil(ymd); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + "d ago"; }
function crStat(val, label) { return val == null ? "" : `<span class="cr-stat"><b>${escapeHtml(String(val))}</b> ${escapeHtml(label)}</span>`; }
// The creator command center: how your latest video is doing + what to make today.
function creatorHero(c) {
  if (!c) return "";
  const L = c.latest, T = c.today;
  const latest = L ? `
    <a class="cr-card cr-latest" href="${escapeHtml(L.url || "#")}" target="_blank" rel="noopener">
      <div class="cr-kicker">▶ Your latest${L.publishedAt ? " · posted " + timeAgo(L.publishedAt) : ""}</div>
      <div class="cr-title">${escapeHtml(L.title || "")}</div>
      <div class="cr-stats">
        ${crStat(L.views != null ? fmtNum(L.views) : null, "views")}
        ${crStat(L.ctr != null ? L.ctr + "%" : null, "CTR")}
        ${crStat(L.likes != null ? fmtNum(L.likes) : null, "likes")}
        ${crStat(L.comments != null ? fmtNum(L.comments) : null, "comments")}
      </div>
      ${L.note ? `<div class="cr-note">${escapeHtml(L.note)}</div>` : ""}
    </a>` : "";
  const today = T ? `
    <div class="cr-card cr-today">
      <div class="cr-kicker make">🎬 Make today</div>
      <div class="cr-title">${escapeHtml(T.title || "")}</div>
      ${T.hook ? `<div class="cr-hook">“${escapeHtml(T.hook)}”</div>` : ""}
      ${T.angle ? `<div class="cr-line"><b>Angle</b> ${escapeHtml(T.angle)}</div>` : ""}
      ${T.thumbnailIdea ? `<div class="cr-line"><b>Thumbnail</b> ${escapeHtml(T.thumbnailIdea)}</div>` : ""}
      ${T.why ? `<div class="cr-why">${escapeHtml(T.why)}</div>` : ""}
    </div>` : "";
  return (latest || today) ? `<div class="creator-hero">${latest}${today}</div>` : "";
}

// News tab — moved out of the morning landing.
function renderNews() {
  const B = window.BRIEF_DATA;
  const stats = document.getElementById("stats");
  const view = document.getElementById("view");
  stats.innerHTML = "";
  if (!B || !B.headline) { view.innerHTML = `<div class="empty">No news yet — it arrives with your morning run.</div>`; return; }
  const forYou = (B.forYou || []).map((f) => `
    <div class="fy-card">
      <span class="fy-tag" style="background:${f.color}22;color:${f.color}">${escapeHtml(f.tag)}</span>
      <div class="fy-text">${escapeHtml(f.text)}</div>
      <div class="fy-action">→ ${escapeHtml(f.action)}</div>
      ${f.url ? `<a class="fy-src" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
    </div>`).join("");
  view.innerHTML = `
    <div class="news-wrap">
      <div class="sec-label">Today's headline</div>
      <a class="headline-card" href="${escapeHtml(B.headline.url)}" target="_blank" rel="noopener">
        <div class="headline-title">${escapeHtml(B.headline.title)}</div>
        <div class="headline-sum">${escapeHtml(B.headline.summary)}</div>
        <div class="headline-src">${escapeHtml(B.headline.source)} ↗</div>
      </a>
      <div class="sec-label">For you</div>
      <div class="fy-grid">${forYou}</div>
    </div>`;
}

function renderMorning() {
  const B = window.BRIEF_DATA;
  document.getElementById("stats").innerHTML = "";
  const view = document.getElementById("view");
  if (!B) { view.innerHTML = `<div class="empty">No brief yet — ask Claude to run your morning brief.</div>`; return; }
  const canSchool = !!(window.LifeOSSession && LifeOSSession.enabled() && LifeOSSession.hasSession() && LifeOSSession.getCanvas);

  const music = B.music || {};
  const mpick = (p) => {
    const q = encodeURIComponent(p.title + " " + p.artist);
    return `<a class="music-pick" href="https://music.apple.com/us/search?term=${q}" target="_blank" rel="noopener">
      <span class="music-play">▶</span>
      <span class="music-meta"><span class="music-title">${escapeHtml(p.title)}</span><span class="music-artist">${escapeHtml(p.artist)}${p.note ? " · " + escapeHtml(p.note) : ""}</span></span>
      <span class="music-open">Apple Music ↗</span>
    </a>`;
  };
  let musicHtml;
  if (music.songs || music.score || music.album) {
    const parts = [];
    if (music.songs && music.songs.length) parts.push(`<div class="music-sub">New songs to try</div><div class="music-list">${music.songs.map(mpick).join("")}</div>`);
    if (music.score) parts.push(`<div class="music-sub">Score to try 🎬</div><div class="music-list">${mpick(music.score)}</div>`);
    if (music.album) parts.push(`<div class="music-sub">Album to try 💿</div><div class="music-list">${mpick(music.album)}</div>`);
    musicHtml = parts.join("") + (music.note ? `<div class="music-note">${escapeHtml(music.note)}</div>` : "");
  } else if (music.picks && music.picks.length) {
    musicHtml = `<div class="music-list">${music.picks.map(mpick).join("")}</div>` + (music.note ? `<div class="music-note">${escapeHtml(music.note)}</div>` : "");
  } else {
    musicHtml = `<div class="soon-card">🎧 ${escapeHtml(music.note || "Apple Music — coming.")}</div>`;
  }

  const creator = creatorHero(B.creator);

  const dm = loadDismissed();
  const ny = B.needsYou || { count: 0, items: [] };
  const needsItems = (ny.items || []).filter((i) => !dm[i.url || i.title]);
  const needs = needsItems.map((i) => needRow({
    key: i.url || i.title, url: i.url, title: i.title, why: i.why, from: i.from,
  })).join("");
  const undoneNeeds = needsItems.filter((i) => !loadDone()[i.url || i.title]).length;

  const userTasks = loadUserTasks();
  const myTasks = userTasks.map((t) => needRow({ key: t.id, title: t.title, user: true })).join("");

  const watchAll = B.watch || [];
  const doNow = watchAll.filter((w) => isNow(w) && !dm[w.url || w.title]);
  const keepEye = watchAll.filter((w) => !isNow(w));

  const stale = B.date && B.date < todayKey();
  const td = (B.creator && B.creator.today) || null;
  view.innerHTML = `
    <div class="brief">
      ${stale ? `<div class="brief-stale">📅 Showing your brief from ${prettyDate(B.date)} — today's arrives with your morning run.</div>` : ""}
      ${creator}
      <div class="brief-grid">
        <div class="brief-main">
          ${td && (td.guides || td.references || td.titles || td.thumbnailText) ? `
          <div class="sec-label">Make it — starter kit</div>
          <div class="make-card">
            ${(td.titles || []).length ? `<div class="make-sub">Title · A/B test</div><div class="make-titles">${(td.titles || []).slice(0, 2).map((t, i) => `<div class="make-title"><span class="ab">${i === 0 ? "A" : "B"}</span>${escapeHtml(t)}</div>`).join("")}</div>` : ""}
            ${(td.thumbnailText || []).length ? `<div class="make-sub">Thumbnail text</div><div class="thumb-texts">${(td.thumbnailText || []).map((t) => `<span class="thumb-text">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
            ${(td.guides || []).length ? `<div class="make-sub">How to make it</div><ul class="make-guides">${(td.guides || []).map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>` : ""}
            ${(td.references || []).length ? `<div class="make-refs">${(td.references || []).map((r) => `<a href="${escapeHtml(r.url || "#")}" target="_blank" rel="noopener">🔗 ${escapeHtml(r.title || r.url)}</a>`).join("")}</div>` : ""}
            <div class="make-note">You'll do your own thing — this is just a starting point.</div>
          </div>` : ""}
          <div class="quote-card small">
            <div class="quote-text">“${escapeHtml(B.quote.text)}”</div>
            <div class="quote-author">— ${escapeHtml(B.quote.author)}</div>
          </div>
        </div>
        <div class="brief-side">
          <div class="sec-label">My tasks <a class="sec-link" data-view="tasks">all ↗</a></div>
          ${taskAddBox("Add a task…")}
          ${myTasks ? `<div class="needs">${myTasks}</div>` : ""}
          <div class="sec-label">Needs you <span class="need-count" id="needCount"${undoneNeeds ? "" : ' style="display:none"'}>${undoneNeeds}</span></div>
          ${needs ? `<div class="needs">${needs}</div>` : `<div class="soon-card">Inbox clear — nothing needs you ✨</div>`}
          ${ny.filtered ? `<div class="need-filtered">${ny.filtered} newsletters &amp; receipts filtered out</div>` : ""}
          ${doNow.length ? `<div class="sec-label">Do now ✅</div><div class="needs">${doNow.map(taskRow).join("")}</div>` : ""}
          <div class="sec-label">School ${canSchool ? '<span class="live-dot"></span>' : ""}</div>
          ${(B.schoolEmail || []).filter((i) => !dm[i.url || i.title]).length
            ? `<div class="needs">${(B.schoolEmail || []).filter((i) => !dm[i.url || i.title]).map((i) => needRow({ key: i.url || i.title, url: i.url, extraClass: "school", title: i.title, why: i.why, from: i.from || "Outlook · Chapman" })).join("")}</div>`
            : ""}
          ${canSchool
            ? `<div id="schoolCard" class="soon-card">Loading assignments…</div>`
            : (B.schoolEmail && B.schoolEmail.length ? "" : `<div class="soon-card">📚 ${escapeHtml((B.school && B.school.note) || "Outlook + Canvas — coming next.")}</div>`)}
          ${keepEye.length ? `<div class="sec-label">Keep an eye on 👀</div><div class="watch-list">${keepEye.map(watchRow).join("")}</div>` : ""}
          <div class="sec-label">Music to try ${music.vibe ? `· <span class="music-vibe">${escapeHtml(music.vibe)}</span>` : ""}</div>
          ${musicHtml}
        </div>
      </div>
    </div>`;

  if (canSchool) fillSchool();
}

function fmtDue(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return day + " · " + time;
}
function fillSchool() { return loadCanvasInto("schoolCard"); }

// Load live Canvas assignments into a given element id (used by the morning
// brief and the School tab).
async function loadCanvasInto(elId) {
  const el = document.getElementById(elId);
  if (!el || !window.LifeOSSession || !LifeOSSession.getCanvas) return;
  const a = await LifeOSSession.getCanvas();
  if (a == null) { el.textContent = "Canvas not connected yet."; return; }
  if (!a.length) { el.outerHTML = `<div class="soon-card">✅ No assignments due — you're clear.</div>`; return; }
  el.outerHTML = `<div class="needs">` + a.map((x) => needRow({
    key: x.url || x.title, url: x.url, extraClass: "school",
    titleHtml: escapeHtml(x.title) + (x.missing ? ' <span class="miss">missing</span>' : ""),
    why: x.course, from: "due " + fmtDue(x.dueAt),
  })).join("") + `</div>`;
}

/* ---------- Money view ---------- */
function fmtMoney(n, dec) {
  dec = dec || 0;
  return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
let LIVE_MONEY = null;   // last good Plaid payload (also cached in localStorage)
let MONEY_BUSY = false;  // guards against overlapping refreshes

function moneyControls() {
  const P = window.LifeOSPlaid;
  if (!P || !P.configured()) return "";
  if (P.hasItems()) {
    const insts = P.institutions();
    return `<div class="money-ctl">
      <span class="money-conn"><span class="live-dot"></span>${insts.length} connected${insts.length ? " · " + insts.map(escapeHtml).join(", ") : ""}</span>
      <span class="money-btns">
        <button class="mbtn" id="moneyRefresh">↻ Refresh</button>
        <button class="mbtn" id="moneyAdd">+ Add bank</button>
        <button class="mbtn ghost" id="moneyDisc">Disconnect</button>
      </span>
    </div>`;
  }
  return `<div class="money-ctl">
    <span class="money-conn">Connect your banks for automatic net worth, spending &amp; subscriptions.</span>
    <span class="money-btns"><button class="mbtn accent" id="moneyConnect">🔗 Connect a bank</button></span>
  </div>`;
}

function renderMoney() {
  const M = LIVE_MONEY || window.MONEY_DATA;
  const stats = document.getElementById("stats");
  const view = document.getElementById("view");
  const ctl = moneyControls();
  if (!M) {
    stats.innerHTML = "";
    view.innerHTML = ctl + `<div class="empty">${window.LifeOSPlaid && window.LifeOSPlaid.configured() ? "Connect a bank above to see your money automatically." : "No money data yet — send your Rocket Money screenshots."}</div>`;
    wireMoney();
    return;
  }

  const subsTotal = (M.subscriptions || []).reduce((s, x) => s + (x.cadence === "yr" ? x.amount / 12 : x.amount), 0);
  const budgetLeft = (M.month ? M.month.budget - M.month.spent : 0);

  stats.innerHTML = [
    { label: "Net worth", value: fmtMoney(M.netWorth), sub: "across your accounts", accent: true },
    { label: "Spent · " + (M.month ? M.month.label : "month"), value: fmtMoney(M.month ? M.month.spent : 0), sub: "of " + fmtMoney(M.month ? M.month.budget : 0) + " budget" },
    { label: "Budget left", value: fmtMoney(budgetLeft), sub: budgetLeft >= 0 ? "on track" : "over budget" },
    { label: "Subscriptions", value: fmtMoney(subsTotal) + "/mo", sub: (M.subscriptions || []).length + " active" },
  ].map((c) => `
    <div class="stat">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.accent ? "accent" : ""}">${c.value}</div>
      <div class="stat-sub">${escapeHtml(c.sub)}</div>
    </div>`).join("");

  const maxBal = Math.max(1, ...(M.accounts || []).map((a) => a.balance));
  const accounts = (M.accounts || []).map((a) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(a.name)} <span class="acct-type">${escapeHtml(a.type || "")}</span></span>
      <span class="bar"><span class="bar-fill" style="width:${Math.round(a.balance / maxBal * 100)}%"></span></span>
      <span class="acct-bal">${fmtMoney(a.balance)}</span>
    </div>`).join("");

  const pct = M.month && M.month.budget ? Math.min(100, Math.round(M.month.spent / M.month.budget * 100)) : 0;
  const over = M.month && M.month.spent > M.month.budget;
  const budget = M.month ? `
    <div class="budget">
      <div class="budget-head"><span>${fmtMoney(M.month.spent)} spent</span><span>${fmtMoney(M.month.budget)} budget</span></div>
      <div class="budget-bar"><span class="budget-fill ${over ? "over" : ""}" style="width:${pct}%"></span></div>
    </div>` : "";

  const maxCat = Math.max(1, ...(M.spendingByCategory || []).map((c) => c.amount));
  const cats = (M.spendingByCategory || []).map((c) => `
    <div class="traffic-row">
      <span class="traffic-label">${escapeHtml(c.category)}</span>
      <span class="bar"><span class="bar-fill" style="width:${Math.round(c.amount / maxCat * 100)}%"></span></span>
      <span class="acct-bal">${fmtMoney(c.amount)}</span>
    </div>`).join("");

  const subs = (M.subscriptions || []).slice().sort((a, b) => b.amount - a.amount).map((s) => `
    <div class="sub-row">
      <span class="sub-name">${escapeHtml(s.name)}</span>
      <span class="sub-amt">${fmtMoney(s.amount, s.amount % 1 ? 2 : 0)}<span class="sub-cad">/${escapeHtml(s.cadence || "mo")}</span></span>
    </div>`).join("");

  const banner = M.live
    ? (M.syncing
        ? `<div class="insight">⏳ Bank connected — transactions are still syncing on Plaid's side. Balances are live; spending &amp; subscriptions fill in within a minute. Hit Refresh shortly.</div>`
        : `<div class="insight ok">✅ Live from your banks${M.updatedAt ? ` · updated ${escapeHtml(M.updatedAt)}` : ""}.</div>`)
    : (M.sample ? `<div class="insight">💡 Sample data — connect a bank above (or send Rocket Money screenshots) for your real numbers.</div>` : "");

  view.innerHTML = `
    ${ctl}
    ${banner}
    <div class="yt-grid">
      <div class="yt-col">
        <div class="yt-section-title">This month · ${escapeHtml(M.month ? M.month.label : "")}</div>
        ${budget}
        <div class="yt-section-title">Spending by category</div>
        <div class="traffic money">${cats || `<div class="acct-empty">No categorized spending yet.</div>`}</div>
      </div>
      <div class="yt-side">
        <div class="yt-section-title">Net worth</div>
        <div class="traffic money">${accounts || `<div class="acct-empty">No accounts yet.</div>`}</div>
        <div class="yt-section-title">Subscriptions · ${fmtMoney(subsTotal)}/mo</div>
        <div class="subs">${subs || `<div class="acct-empty">No recurring charges detected yet.</div>`}</div>
      </div>
    </div>`;
  wireMoney();
}

// Refresh live money data from Plaid and re-render.
async function refreshMoney() {
  const P = window.LifeOSPlaid;
  if (!P || !P.hasItems() || MONEY_BUSY) return;
  MONEY_BUSY = true;
  const btn = document.getElementById("moneyRefresh");
  if (btn) { btn.textContent = "↻ Syncing…"; btn.disabled = true; }
  try {
    const data = await P.fetchData();
    if (data) { LIVE_MONEY = data; if (CURRENT === "money") renderMoney(); }
  } catch (e) {
    const b = document.querySelector(".money-conn");
    if (b) b.innerHTML = `<span style="color:var(--danger,#e0454f)">Sync failed: ${escapeHtml(String(e.message || e))}</span>`;
  } finally {
    MONEY_BUSY = false;
    const b2 = document.getElementById("moneyRefresh");
    if (b2) { b2.textContent = "↻ Refresh"; b2.disabled = false; }
  }
}

// Attach handlers to whatever money controls are currently on screen.
function wireMoney() {
  const P = window.LifeOSPlaid;
  if (!P) return;
  const connectFlow = async (btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = "Opening…"; }
    try {
      await P.connect();
      await refreshMoney();
      if (CURRENT === "money") renderMoney();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || "Connect"; }
      if (!(e && e.cancelled)) alert("Couldn't connect: " + (e.message || e));
    }
  };
  const c = document.getElementById("moneyConnect");
  if (c) c.onclick = () => connectFlow("moneyConnect");
  const a = document.getElementById("moneyAdd");
  if (a) a.onclick = () => connectFlow("moneyAdd");
  const r = document.getElementById("moneyRefresh");
  if (r) r.onclick = () => refreshMoney();
  const d = document.getElementById("moneyDisc");
  if (d) d.onclick = () => {
    if (!confirm("Disconnect all banks? Your dashboard will fall back to sample data.")) return;
    P.disconnect();
    LIVE_MONEY = null;
    renderMoney();
  };
}

/* ---------- School / Academic planner view ---------- */
let SCHOOL_LIVE = null;   // /school feed override

const DAYMAP = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
const DAYORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function courseDays(d) { const out = []; for (const ch of String(d || "")) if (DAYMAP[ch]) out.push(DAYMAP[ch]); return out; }
function fmtClassTime(t) {
  if (!t) return "";
  const p = String(t).split(":"); const h = +p[0], m = +p[1] || 0;
  if (isNaN(h)) return t;
  const ap = h >= 12 ? "pm" : "am", hh = ((h + 11) % 12) + 1;
  return hh + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
}
// Does this course advance a requirement Simon still needs?
function reqStatus(course, requirements) {
  const fills = course.fills;
  if (!fills) return { ok: false, label: "Not mapped — verify with advisor" };
  const r = (requirements || []).find((x) => String(x.category).toLowerCase() === String(fills).toLowerCase());
  if (r) {
    return r.done < r.needed
      ? { ok: true, label: "Counts toward " + fills + " (still needed)" }
      : { ok: false, label: fills + " already satisfied — overflow, check with advisor" };
  }
  return { ok: true, label: "Counts as " + fills };
}

async function fetchSchool() {
  if (!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getSchool)) return;
  let s;
  try { s = await LifeOSSession.getSchool(); } catch (e) { return; }
  if (!s || typeof s !== "object") return;
  SCHOOL_LIVE = s;
  try { localStorage.setItem("lifeos-school-fed", JSON.stringify(s)); } catch (e) {}
  if (CURRENT === "school") renderSchool();
}

function renderSchool() {
  const S = SCHOOL_LIVE || window.SCHOOL_DATA;
  const stats = document.getElementById("stats");
  const view = document.getElementById("view");
  if (!S) { stats.innerHTML = ""; view.innerHTML = `<div class="empty">No academic data yet — dispatch will fill this from your Chapman records.</div>`; return; }

  const c = S.credits || {};
  const done = c.completed || 0, need = c.required || 0, prog = c.inProgress || 0;
  const left = Math.max(0, need - done - prog);
  const pctDone = need ? Math.min(100, Math.round(done / need * 100)) : 0;
  const pctProg = need ? Math.min(100 - pctDone, Math.round(prog / need * 100)) : 0;

  stats.innerHTML = [
    { label: "Credits done", value: done + "/" + need, sub: pctDone + "% of degree", accent: true },
    { label: "In progress", value: prog, sub: "this term" },
    { label: "Credits left", value: left, sub: "to graduate" },
    { label: "GPA", value: (S.gpa != null ? S.gpa : "—"), sub: S.standing || "" },
  ].map((s) => `
    <div class="stat">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.accent ? "accent" : ""}">${escapeHtml(String(s.value))}</div>
      <div class="stat-sub">${escapeHtml(s.sub)}</div>
    </div>`).join("");

  const reqs = (S.requirements || []).map((r) => {
    const p = r.needed ? Math.min(100, Math.round(r.done / r.needed * 100)) : 0;
    return `<div class="traffic-row">
      <span class="traffic-label">${escapeHtml(r.category)}</span>
      <span class="bar"><span class="bar-fill" style="width:${p}%"></span></span>
      <span class="acct-bal">${r.done}/${r.needed}</span>
    </div>`;
  }).join("");

  const taken = (S.taken || []).map((x) => `
    <div class="course-row">
      <span class="course-code">${escapeHtml(x.code || "")}</span>
      <span class="course-title">${escapeHtml(x.title || "")}<span class="course-term">${escapeHtml(x.term || "")}</span></span>
      <span class="course-grade">${escapeHtml(x.grade || "")}</span>
      <span class="course-cr">${x.credits || 0}</span>
    </div>`).join("");

  const remaining = (S.remaining || []).map((x) => `
    <div class="course-row">
      <span class="course-code">${escapeHtml(x.code || "")}</span>
      <span class="course-title">${escapeHtml(x.title || "")}<span class="course-term">${escapeHtml(x.category || "")}</span></span>
      <span class="course-cr">${x.credits || 0}</span>
    </div>`).join("");

  const ab = S.abroad;
  const abroad = ab ? `
    <div class="abroad-card">
      <div class="abroad-head">✈️ Study abroad · ${escapeHtml(ab.term || "")}</div>
      <div class="abroad-loc">${escapeHtml(ab.location || "")}${ab.program ? " · " + escapeHtml(ab.program) : ""}</div>
      ${ab.credits ? `<div class="abroad-credits">${ab.credits} credits</div>` : ""}
      <div class="abroad-courses">${(ab.courses || []).map((co) => `
        <div class="course-row">
          <span class="course-code">${escapeHtml(co.code || "")}</span>
          <span class="course-title">${escapeHtml(co.title || "")}<span class="course-term">${escapeHtml(co.countsAs || "")}</span></span>
          <span class="course-cr">${co.credits || 0}</span>
        </div>`).join("")}</div>
      ${ab.note ? `<div class="abroad-note">${escapeHtml(ab.note)}</div>` : ""}
    </div>` : "";

  // Emails to respond (Outlook, pushed via the brief) + live Canvas homework.
  const emails = (S.emails || (window.BRIEF_DATA && window.BRIEF_DATA.schoolEmail) || []);
  const emailHtml = emails.length
    ? `<div class="needs">${emails.map((i) => needRow({ key: i.url || i.title, url: i.url, extraClass: "school", title: i.title, why: i.why, from: i.from || "Outlook · Chapman" })).join("")}</div>`
    : `<div class="acct-empty">No school emails flagged.</div>`;
  const canSchool = !!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getCanvas);

  // This-term schedule + requirement checker.
  const ct = S.currentTerm;
  let scheduleSection = "";
  if (ct && ct.courses && ct.courses.length) {
    const byDay = {}; DAYORDER.forEach((d) => (byDay[d] = []));
    ct.courses.forEach((co) => courseDays(co.days).forEach((d) => byDay[d] && byDay[d].push(co)));
    const daysWith = DAYORDER.filter((d) => byDay[d].length);
    const gridDays = daysWith.length ? daysWith : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const grid = gridDays.map((d) => `
      <div class="cl-day">
        <div class="cl-day-h">${d}</div>
        ${byDay[d].slice().sort((a, b) => String(a.start || "").localeCompare(String(b.start || ""))).map((co) => `
          <div class="cl-block">
            <div class="cl-code">${escapeHtml(co.code || "")}</div>
            <div class="cl-time">${escapeHtml(fmtClassTime(co.start))}${co.end ? "–" + escapeHtml(fmtClassTime(co.end)) : ""}</div>
            ${co.room ? `<div class="cl-room">${escapeHtml(co.room)}</div>` : ""}
          </div>`).join("") || `<div class="cl-empty">—</div>`}
      </div>`).join("");
    const checks = ct.courses.map((co) => ({ co, st: reqStatus(co, S.requirements) }));
    const okCount = checks.filter((x) => x.st.ok).length;
    const checkRows = checks.map(({ co, st }) => `
      <div class="check-row ${st.ok ? "ok" : "warn"}">
        <span class="check-ico">${st.ok ? "✅" : "⚠️"}</span>
        <span class="check-body"><span class="check-course">${escapeHtml(co.code || "")} · ${escapeHtml(co.title || "")}</span><span class="check-label">${escapeHtml(st.label)}</span></span>
        <span class="check-cr">${co.credits || 0} cr</span>
      </div>`).join("");
    const allOk = okCount === checks.length;
    const summary = allOk
      ? `✓ All ${checks.length} classes count toward requirements you still need.`
      : `${okCount}/${checks.length} count toward needs — review the ${checks.length - okCount} flagged below.`;
    scheduleSection = `
      <div class="yt-section-title">This term${ct.label ? " · " + escapeHtml(ct.label) : ""}</div>
      <div class="cl-week">${grid}</div>
      <div class="yt-section-title">Requirement check</div>
      <div class="check-summary ${allOk ? "ok" : "warn"}">${summary}</div>
      <div class="checks">${checkRows}</div>`;
  }

  // Advising / action items surfaced from the degree audit (dispatch pushes these).
  const flags = (S.flags || []);
  const flagHtml = flags.length ? `<div class="school-flags">${flags.map((f) => {
    const now = f.urgency === "now";
    const tag = f.url ? "a" : "div";
    return `<${tag} class="school-flag ${now ? "now" : ""}" ${f.url ? `href="${escapeHtml(f.url)}" target="_blank" rel="noopener"` : ""}>
      <span class="flag-ico">${now ? "⚠️" : "📌"}</span>
      <span class="flag-body"><span class="flag-title">${escapeHtml(f.title || "")}</span>${f.why ? `<span class="flag-why">${escapeHtml(f.why)}</span>` : ""}</span>
    </${tag}>`;
  }).join("")}</div>` : "";

  view.innerHTML = `
    ${S.sample ? `<div class="insight">🎓 Sample plan — dispatch will fill this with your real Chapman records (courses, credits, degree audit). ${escapeHtml(S.school || "")}</div>` : `<div class="insight ok">🎓 ${escapeHtml(S.major || "")}${S.school ? " · " + escapeHtml(S.school) : ""}${S.updatedAt ? " · updated " + escapeHtml(S.updatedAt) : ""}</div>`}
    ${flagHtml}
    <div class="degree">
      <div class="degree-head"><span>${done + prog} of ${need} credits ${prog ? `(${done} done · ${prog} in progress)` : "done"}</span><span>${left} to go</span></div>
      <div class="degree-bar"><span class="degree-fill" style="width:${pctDone}%"></span><span class="degree-fill prog" style="width:${pctProg}%"></span></div>
    </div>
    ${scheduleSection}
    <div class="yt-grid">
      <div class="yt-col">
        <div class="yt-section-title">Requirements</div>
        <div class="traffic school">${reqs || `<div class="acct-empty">No requirement breakdown yet.</div>`}</div>
        <div class="yt-section-title">Still to take</div>
        <div class="courses">${remaining || `<div class="acct-empty">Nothing outstanding.</div>`}</div>
        <div class="yt-section-title">Classes taken</div>
        <div class="courses">${taken || `<div class="acct-empty">No coursework yet.</div>`}</div>
      </div>
      <div class="yt-side">
        ${abroad}
        <div class="yt-section-title">Emails to respond</div>
        ${emailHtml}
        <div class="yt-section-title">Homework ${canSchool ? '<span class="live-dot"></span>' : ""}</div>
        ${canSchool ? `<div id="schoolHW" class="soon-card">Loading assignments…</div>` : `<div class="acct-empty">Sign in to pull Canvas.</div>`}
      </div>
    </div>`;

  if (canSchool) loadCanvasInto("schoolHW");
}

/* ---------- Tasks view (unified hub — everything actionable, from every tab) ---------- */
function renderTasks() {
  const stats = document.getElementById("stats");
  const view = document.getElementById("view");
  stats.innerHTML = "";
  const dm = loadDismissed(), done = loadDone();
  const live = (k) => !dm[k];
  const B = window.BRIEF_DATA || {};
  const S = SCHOOL_LIVE || window.SCHOOL_DATA || {};

  const userTasks = loadUserTasks();
  const needs  = ((B.needsYou && B.needsYou.items) || []).filter((i) => live(i.url || i.title));
  const now    = (B.watch || []).filter((w) => isNow(w) && live(w.url || w.title));
  const keep   = (B.watch || []).filter((w) => !isNow(w) && live(w.url || w.title));
  const flags  = (S.flags || []).filter((f) => live(f.url || f.title));
  const emails = (B.schoolEmail || []).filter((i) => live(i.url || i.title));
  const canSchool = !!(window.LifeOSSession && LifeOSSession.hasSession && LifeOSSession.hasSession() && LifeOSSession.getCanvas);

  const sec = (label, html) => html ? `<div class="sec-label">${label}</div><div class="needs">${html}</div>` : "";
  const rows = {
    user:   userTasks.map((t) => needRow({ key: t.id, title: t.title, user: true })).join(""),
    needs:  needs.map((i) => needRow({ key: i.url || i.title, url: i.url, title: i.title, why: i.why, from: i.from })).join(""),
    now:    now.map(taskRow).join(""),
    flags:  flags.map((f) => needRow({ key: f.url || f.title, url: f.url, extraClass: "school", title: f.title, why: f.why, when: f.urgency === "now" ? "now" : (f.urgency || "") })).join(""),
    emails: emails.map((i) => needRow({ key: i.url || i.title, url: i.url, extraClass: "school", title: i.title, why: i.why, from: i.from || "Outlook · Chapman" })).join(""),
    keep:   keep.map((w) => needRow({ key: w.url || w.title, url: w.url, title: w.title, why: w.note, when: whenLabel(w) })).join(""),
  };
  const allKeys = [].concat(
    userTasks.map((t) => t.id),
    needs.map((i) => i.url || i.title),
    now.map((w) => w.url || w.title),
    flags.map((f) => f.url || f.title),
    emails.map((i) => i.url || i.title),
    keep.map((w) => w.url || w.title),
  );
  const openCount = allKeys.filter((k) => !done[k]).length;

  view.innerHTML = `
    <div class="tasks-wrap">
      <div class="tasks-count">${openCount} open ${openCount === 1 ? "task" : "tasks"}</div>
      ${taskAddBox("Add a task…", true)}
      ${rows.user ? sec("My tasks", rows.user) : `<div class="sec-label">My tasks</div><div class="soon-card">Nothing yet — add one above.</div>`}
      ${sec("Needs you · Gmail", rows.needs)}
      ${sec("Do now", rows.now)}
      ${sec("School · to-dos", rows.flags)}
      ${sec("Emails to respond · school", rows.emails)}
      ${canSchool ? `<div class="sec-label">Homework <span class="live-dot"></span></div><div id="tasksHW" class="soon-card">Loading assignments…</div>` : ""}
      ${sec("Keep an eye on", rows.keep)}
    </div>`;

  if (canSchool) loadCanvasInto("tasksHW");
}

/* ---------- Calendar (Today / Week / Upcoming under one tab) ---------- */
let CAL_MODE = "today";
const CAL_MODES = [["today", "Today"], ["week", "Week"], ["upcoming", "Upcoming"]];
/* ---------- Calendar command: free client-side parser ---------- */
const CAL_TZ = (window.LIFEOS_CONFIG && window.LIFEOS_CONFIG.timeZone) || "America/Chicago";
const CAL_WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CAL_MON = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function ymdAdd(ymd, n) { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function ymdDow(ymd) { return new Date(ymd + "T00:00:00Z").getUTCDay(); }
function fmtHM(hm) { const [h, m] = hm.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; const hh = ((h + 11) % 12) + 1; return hh + (m ? ":" + String(m).padStart(2, "0") : "") + ap; }
// Add ms to a wall-clock (date, "HH:MM") without touching the browser timezone.
function wallAdd(ymd, hm, ms) {
  const [Y, Mo, D] = ymd.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const d = new Date(Date.UTC(Y, Mo - 1, D, h, mi, 0)); d.setTime(d.getTime() + ms);
  return d.toISOString().slice(0, 16);
}
function parseTimeToken(s) {
  s = s.toLowerCase();
  if (/\bnoon\b/.test(s)) return "12:00";
  if (/\bmidnight\b/.test(s)) return "00:00";
  const m = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/.exec(s)
    || /\bat\s+(\d{1,2})(?::(\d{2}))?\b/.exec(s)
    || /\b(\d{1,2}):(\d{2})\b/.exec(s);
  if (!m) return null;
  let h = +m[1], min = m[2] ? +m[2] : 0; const ap = (m[3] || "")[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}
function parseDateToken(s) {
  s = s.toLowerCase(); const today = todayKey();
  if (/\btoday\b|\btonight\b/.test(s)) return today;
  if (/\btomorrow\b|\btmrw\b/.test(s)) return ymdAdd(today, 1);
  const nextPref = /\bnext\s/.test(s);
  for (let i = 0; i < 7; i++) {
    if (new RegExp("\\b" + CAL_WD[i].slice(0, 3) + "[a-z]*\\b").test(s)) {
      const cur = ymdDow(today); let diff = (i - cur + 7) % 7; if (diff === 0) diff = 7;
      if (nextPref && diff < 7) diff += 7;
      return ymdAdd(today, diff);
    }
  }
  let m = /\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(s);
  if (m) { const mi = CAL_MON.findIndex((x) => x.startsWith(m[1])); if (mi >= 0) { const y = +today.slice(0, 4); let d = `${y}-${String(mi + 1).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; if (d < today) d = `${y + 1}-${String(mi + 1).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; return d; } }
  m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(s);
  if (m) { const y = +today.slice(0, 4); let d = `${y}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; if (d < today) d = `${y + 1}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; return d; }
  return null;
}
function cleanQuery(s) { return s.replace(/\b(my|the|event|meeting|appt|appointment)\b/gi, " ").replace(/\s+/g, " ").trim(); }
function buildCreate(rest) {
  const time = parseTimeToken(rest), date = parseDateToken(rest);
  if (!time && !date) return { error: "When? Try “add dentist Friday 2pm”." };
  const monRe = new RegExp("\\b(?:" + CAL_MON.map((mm) => mm.slice(0, 3)).join("|") + ")[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?\\b", "gi");
  let title = rest
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b/gi, " ")   // "at 3", "at 3:30pm"
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b/gi, " ")          // "3pm", "11:30am"
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")                                          // "15:00"
    .replace(/\b(noon|midnight)\b/gi, " ")
    .replace(monRe, " ")                                                          // "aug 20"
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, " ")                                       // "8/20"
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, " ")
    .replace(/\b(today|tonight|tomorrow|tmrw|next|on|from|this)\b/gi, " ")
    .replace(/\s+/g, " ").trim().replace(/^(a|an|the)\s+/i, "");
  if (!title) title = "Event";
  return { action: "create", title: title.charAt(0).toUpperCase() + title.slice(1), time, date };
}
function parseCalCommand(text) {
  const t = text.trim(); let m;
  if ((m = /^(?:delete|cancel|remove|clear)\s+(.+)/i.exec(t))) return { action: "delete", query: cleanQuery(m[1]) };
  if ((m = /^rename\s+(.+?)\s+to\s+(.+)/i.exec(t))) return { action: "update", query: cleanQuery(m[1]), newTitle: m[2].trim() };
  if ((m = /^(?:move|reschedule|resched|push|shift|change)\s+(.+?)\s+to\s+(.+)/i.exec(t))) {
    const time = parseTimeToken(m[2]), date = parseDateToken(m[2]);
    if (!time && !date) return { error: "Move it to when? e.g. “move gym to 6pm tomorrow”." };
    return { action: "update", query: cleanQuery(m[1]), time, date };
  }
  if ((m = /^(?:add|create|schedule|new|book|set\s?up|put)\s+(.+)/i.exec(t))) return buildCreate(m[1]);
  if (parseTimeToken(t) || parseDateToken(t)) return buildCreate(t);
  return { error: "Try “add dentist Friday 2pm”, “move gym to 6pm”, or “cancel lunch”." };
}
async function findCalEvent(CAL, H, query) {
  const timeMin = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const u = CAL + "?singleEvents=true&orderBy=startTime&maxResults=25&q=" + encodeURIComponent(query) +
    "&timeMin=" + encodeURIComponent(timeMin) + "&timeMax=" + encodeURIComponent(timeMax);
  const r = await fetch(u, { headers: H });
  if (!r.ok) return null;
  const items = (await r.json()).items || [];
  const q = query.toLowerCase();
  return items.find((e) => (e.summary || "").toLowerCase().includes(q)) || items[0] || null;
}
// Minutes-from-midnight of an ISO time, in the calendar's timezone.
function localMinutes(iso) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CAL_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    return (+parts.find((p) => p.type === "hour").value) * 60 + (+parts.find((p) => p.type === "minute").value);
  } catch (e) { return -1; }
}
function hmToMin(hm) { return (+hm.slice(0, 2)) * 60 + (+hm.slice(3, 5)); }
// First existing event on `dayK` that overlaps [sMin,eMin) — for conflict warnings.
function calConflict(dayK, sMin, eMin, excludeTitle) {
  const evs = (STATE.byDay && STATE.byDay[dayK]) || [];
  for (const e of evs) {
    if (e.allDay) continue;
    if (excludeTitle && (e.title || "").toLowerCase() === excludeTitle.toLowerCase()) continue;
    const s = localMinutes(e.start), en = localMinutes(e.end);
    if (s >= 0 && s < eMin && en > sMin) return e;
  }
  return null;
}

// Parse + apply a calendar command directly against Google Calendar (free).
// `force` skips the conflict check (used by the "Do it anyway" confirm).
async function runCalCommand(text, force) {
  const p = parseCalCommand(text);
  if (p.error) return { ok: false, message: p.error };
  let token;
  try { token = await LifeOSSession.getToken(); } catch (e) { return { ok: false, message: "Sign in first." }; }
  const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const H = { Authorization: "Bearer " + token };
  const HJ = Object.assign({ "content-type": "application/json" }, H);
  const scope403 = "Reconnect the dashboard (Disconnect → Connect) to grant calendar edit access, then retry.";
  try {
    if (p.action === "create") {
      let start, end;
      if (p.date && !p.time) { start = { date: p.date }; end = { date: ymdAdd(p.date, 1) }; }
      else {
        const d = p.date || todayKey(), tm = p.time || "09:00";
        if (!force) { const c = calConflict(d, hmToMin(tm), hmToMin(tm) + 60); if (c) return { conflict: true, message: `${fmtHM(tm)} overlaps “${c.title || "an event"}”. Add anyway?` }; }
        start = { dateTime: `${d}T${tm}:00`, timeZone: CAL_TZ }; end = { dateTime: wallAdd(d, tm, 3600000) + ":00", timeZone: CAL_TZ };
      }
      const r = await fetch(CAL, { method: "POST", headers: HJ, body: JSON.stringify({ summary: p.title, start, end }) });
      if (r.status === 403) return { ok: false, message: scope403 };
      if (!r.ok) return { ok: false, message: "Calendar rejected that (" + r.status + ")." };
      return { ok: true, message: `Added “${p.title}”${p.date ? " " + p.date : ""}${p.time ? " at " + fmtHM(p.time) : ""}.` };
    }
    const ev = await findCalEvent(CAL, H, p.query);
    if (!ev) return { ok: false, message: `Couldn't find an event matching “${p.query}”.` };
    if (p.action === "delete") {
      const r = await fetch(CAL + "/" + encodeURIComponent(ev.id), { method: "DELETE", headers: H });
      if (r.status === 403) return { ok: false, message: scope403 };
      if (!r.ok && r.status !== 410) return { ok: false, message: "Couldn't delete (" + r.status + ")." };
      return { ok: true, message: `Deleted “${ev.summary || "event"}”.` };
    }
    const body = {};
    if (p.newTitle) body.summary = p.newTitle;
    if (p.time || p.date) {
      const timed = !!(ev.start && ev.start.dateTime);
      const curDate = ev.start && (timed ? ev.start.dateTime.slice(0, 10) : ev.start.date) || todayKey();
      const curTime = timed ? ev.start.dateTime.slice(11, 16) : "09:00";
      const nd = p.date || curDate, nt = p.time || curTime;
      let durMs = 3600000;
      if (timed && ev.end && ev.end.dateTime) durMs = new Date(ev.end.dateTime) - new Date(ev.start.dateTime);
      if (!force) { const durMin = Math.max(15, Math.round(durMs / 60000)); const c = calConflict(nd, hmToMin(nt), hmToMin(nt) + durMin, ev.summary); if (c) return { conflict: true, message: `${fmtHM(nt)} overlaps “${c.title || "an event"}”. Move anyway?` }; }
      body.start = { dateTime: `${nd}T${nt}:00`, timeZone: CAL_TZ };
      body.end = { dateTime: wallAdd(nd, nt, durMs) + ":00", timeZone: CAL_TZ };
    }
    const r = await fetch(CAL + "/" + encodeURIComponent(ev.id), { method: "PATCH", headers: HJ, body: JSON.stringify(body) });
    if (r.status === 403) return { ok: false, message: scope403 };
    if (!r.ok) return { ok: false, message: "Couldn't update (" + r.status + ")." };
    return { ok: true, message: `Updated “${p.newTitle || ev.summary || "event"}”.` };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

function calCmdBar() {
  const can = window.LifeOSSession && LifeOSSession.enabled() && LifeOSSession.hasSession() && LifeOSSession.getToken;
  if (!can) return "";
  return `<form class="cal-cmd" id="calCmd" autocomplete="off">
    <span class="cal-cmd-spark">✨</span>
    <input class="cal-cmd-input" id="calCmdInput" type="text" placeholder="Tell your calendar what to do — “move gym to 6pm tomorrow”, “add dentist Friday 2pm”…" aria-label="Calendar command" />
    <button class="cal-cmd-btn" type="submit">Go</button>
  </form>
  <div class="cal-cmd-status" id="calCmdStatus"></div>`;
}
function renderCalendar() {
  const view = document.getElementById("view");
  view.innerHTML = `${calCmdBar()}<div class="cal-seg">${CAL_MODES.map(([m, l]) => `<button class="cal-seg-btn ${CAL_MODE === m ? "active" : ""}" data-cal="${m}">${l}</button>`).join("")}</div><div id="calBody"></div>`;
  ({ today: renderToday, week: renderWeek, upcoming: renderUpcoming }[CAL_MODE] || renderToday)();
}
// Send a natural-language calendar command, then refresh the view.
let CAL_CMD_BUSY = false;
function setCalStatus(content, cls, isHtml) {
  const st = document.getElementById("calCmdStatus");
  if (!st) return null;
  if (isHtml) st.innerHTML = content; else st.textContent = content;
  st.className = "cal-cmd-status " + (cls || "");
  return st;
}
function calCmdEnable(text) {
  const i = document.getElementById("calCmdInput");
  if (i) { i.disabled = false; if (text != null) i.value = text; i.focus(); }
  const b = document.querySelector("#calCmd .cal-cmd-btn");
  if (b) { b.disabled = false; b.textContent = "Go"; }
}
function submitCalCmd() {
  const inp = document.getElementById("calCmdInput");
  const text = inp && inp.value.trim();
  if (!text) return;
  runAndReport(text, false);
}
function runAndReport(text, force) {
  if (CAL_CMD_BUSY) return;
  CAL_CMD_BUSY = true;
  const inp = document.getElementById("calCmdInput");
  const btn = document.querySelector("#calCmd .cal-cmd-btn");
  if (inp) inp.disabled = true;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  setCalStatus("Working on it…", "working");
  runCalCommand(text, force).then(async (res) => {
    if (res.conflict && !force) {
      const st = setCalStatus("⚠️ " + escapeHtml(res.message) + ' <button class="cal-cmd-force" type="button">Do it anyway</button>', "warn", true);
      if (st) st.dataset.text = text;
      calCmdEnable(text);
      return;
    }
    if (res.ok) {
      await refreshCalendar().catch(() => {});   // reload events + rebuild the bar
      setCalStatus("✓ " + (res.message || "Done."), "ok");
    } else {
      setCalStatus("⚠️ " + (res.message || "Couldn't do that."), "err");
      calCmdEnable(text);
    }
  }).catch((err) => {
    setCalStatus("⚠️ " + (err.message || err), "err");
    calCmdEnable(text);
  }).finally(() => { CAL_CMD_BUSY = false; });
}
function calSub() {
  if (CAL_MODE === "today") return prettyDate(STATE.anchor) + (STATE.anchor !== STATE.today ? " (next day with events)" : "");
  if (CAL_MODE === "week") return "7-day overview";
  return `${STATE.events.filter((e) => e.key >= STATE.today).length || STATE.events.length} events ahead`;
}

/* ---------- view switching ---------- */
let CURRENT = "morning";
const MORNING_TITLE = "Good morning" + (window.BRIEF_DATA && window.BRIEF_DATA.greetingName ? ", " + window.BRIEF_DATA.greetingName : "");
const VIEWS = {
  morning:  { title: MORNING_TITLE, sub: () => (window.BRIEF_DATA ? new Date(window.BRIEF_DATA.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : ""), render: renderMorning },
  news:     { title: "News",      sub: () => "Headlines + what pertains to you", render: renderNews },
  calendar: { title: () => ({ today: "Today", week: "This Week", upcoming: "Upcoming" }[CAL_MODE]), sub: calSub, render: renderCalendar },
  youtube:  { title: "YouTube",   sub: () => (window.YOUTUBE_DATA ? window.YOUTUBE_DATA.channel.title + " · analytics + daily ideas" : ""), render: renderYouTube },
  money:    { title: "Money",     sub: () => (window.MONEY_DATA ? "Net worth · budget · subscriptions" : ""), render: renderMoney },
  tasks:    { title: "Tasks",     sub: () => "Everything that needs you, in one place", render: renderTasks },
  school:   { title: "School",    sub: () => { const S = SCHOOL_LIVE || window.SCHOOL_DATA; return S ? (S.major || "Academic planner") + (S.standing ? " · " + S.standing : "") : "Academic planner"; }, render: renderSchool },
};
function render() {
  const v = VIEWS[CURRENT];
  document.getElementById("viewTitle").textContent = typeof v.title === "function" ? v.title() : v.title;
  document.getElementById("viewSub").textContent = v.sub();
  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === CURRENT));

  if (CURRENT === "morning" || CURRENT === "youtube" || CURRENT === "money" || CURRENT === "school" || CURRENT === "tasks" || CURRENT === "news") {
    document.getElementById("legend").innerHTML = "";
    if (CURRENT === "money" || CURRENT === "tasks" || CURRENT === "news") document.getElementById("stats").innerHTML = "";
    v.render();
    return;
  }
  renderLegend();
  renderStats();
  v.render();
}
function switchView(name) {
  CURRENT = name;
  render();
  // Opening Money → pull the dispatch feed (and Plaid, if connected).
  if (name === "money") {
    fetchMoney();
    if (window.LifeOSPlaid && window.LifeOSPlaid.hasItems()) refreshMoney();
  }
  if (name === "school") fetchSchool();
}

/* ---------- sync label + connection UI ---------- */
function setSync(mode, syncedAt) {
  const dot = document.getElementById("syncDot");
  const label = document.getElementById("syncLabel");
  if (mode === "live") {
    dot.style.background = "var(--c-health)";
    const t = syncedAt ? new Date(syncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "now";
    label.textContent = "live · " + t;
  } else {
    dot.style.background = "var(--text-faint)";
    const t = syncedAt ? new Date(syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
    label.textContent = "snapshot · " + t;
  }
}

function renderConn(mode, msg) {
  const el = document.getElementById("conn");
  const configured = window.LifeOSGoogle && LifeOSGoogle.isConfigured();

  if (!configured) {
    el.innerHTML = `<div class="conn-hint">Add your Client ID in <code>config.js</code> for live sync · see SETUP.md</div>`;
    return;
  }
  if (mode === "connecting") {
    el.innerHTML = `<button class="conn-btn" disabled>Connecting…</button>`;
    return;
  }
  if (mode === "live") {
    el.innerHTML =
      `<button class="conn-btn" id="refreshBtn">↻ Refresh</button>
       <button class="conn-btn ghost" id="disconnectBtn">Disconnect</button>`;
    document.getElementById("refreshBtn").addEventListener("click", goRefresh);
    document.getElementById("disconnectBtn").addEventListener("click", goDisconnect);
    return;
  }
  // snapshot / error
  el.innerHTML =
    `<button class="conn-btn primary" id="connectBtn">Connect Google Calendar</button>
     ${msg ? `<div class="conn-err">${escapeHtml(msg)}</div>` : ""}`;
  document.getElementById("connectBtn").addEventListener("click", goConnect);
}

function backendActive() { return window.LifeOSSession && LifeOSSession.enabled() && LifeOSSession.hasSession(); }
function refreshCalendar() { return LifeOSGoogle.fetchAll().then((d) => { loadData(d); renderConn("live"); }); }
function refreshYouTube() { return LifeOSYouTube.fetchAll().then(applyLiveYT); }

async function goConnect() {
  renderConn("connecting");
  try {
    if (window.LifeOSSession && LifeOSSession.enabled() && !LifeOSSession.hasSession()) {
      await LifeOSSession.connect();   // one backend login covers Calendar + YouTube
    }
    await refreshCalendar();
    if (backendActive() && window.LifeOSYouTube) refreshYouTube().catch(() => {});
    pullStateCloud();                          // adopt this account's checked-off to-dos
  } catch (e) {
    setSync("snapshot", window.CALENDAR_DATA && window.CALENDAR_DATA.syncedAt);
    renderConn("error", e.message);
  }
}
async function goRefresh() {
  const btn = document.getElementById("refreshBtn");
  if (btn) { btn.textContent = "Refreshing…"; btn.disabled = true; }
  try {
    const data = await LifeOSGoogle.fetchAll();
    loadData(data);
    renderConn("live");
  } catch (e) {
    renderConn("error", e.message);
  }
}
function goDisconnect() {
  try { LifeOSGoogle.disconnect(); } catch (e) {}
  try { if (window.LifeOSSession && LifeOSSession.enabled()) LifeOSSession.disconnect(); } catch (e) {}
  loadData(window.CALENDAR_DATA || { events: [] });   // back to snapshot
  renderConn("snapshot");
  YT_DATA = window.YOUTUBE_DATA;                       // backend logout covers YouTube too
  if (CURRENT === "youtube") renderYouTube();
}

/* ---------- boot ---------- */
function boot() {
  renderLegend();

  // Show last-known money instantly; a refresh happens when the tab opens.
  // Prefer the dispatch-fed cache, then Plaid's.
  try { const f = JSON.parse(localStorage.getItem("lifeos-money-fed")); if (f) LIVE_MONEY = f; } catch (e) {}
  if (!LIVE_MONEY && window.LifeOSPlaid && window.LifeOSPlaid.cache()) LIVE_MONEY = window.LifeOSPlaid.cache();
  try { const sf = JSON.parse(localStorage.getItem("lifeos-school-fed")); if (sf) SCHOOL_LIVE = sf; } catch (e) {}

  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  const saved = localStorage.getItem("lifeos-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("lifeos-theme", cur);
  });

  // Check off a "Needs you" / "School" item (persists across reloads).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".need-check");
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const row = btn.closest(".need-item");
    if (!row) return;
    const key = row.dataset.key;
    const d = loadDone();
    if (d[key]) delete d[key]; else d[key] = true;
    saveDone(d);
    const on = !!d[key];
    row.classList.toggle("done", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
    updateNeedCount();
  });

  // Delete a task entirely (× button).
  document.addEventListener("click", (e) => {
    const del = e.target.closest && e.target.closest(".need-del");
    if (!del) return;
    e.preventDefault(); e.stopPropagation();
    const row = del.closest(".need-item");
    if (!row) return;
    deleteTask(row.dataset.key, !!row.dataset.user);
    row.remove();
    updateNeedCount();
    if (CURRENT === "tasks") renderTasks();
  });

  // Add a task (+ Add button or Enter in the input).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".task-add-btn");
    if (!btn) return;
    const inp = btn.closest(".task-add") && btn.closest(".task-add").querySelector(".task-add-input");
    if (inp) { addUserTask(inp.value); inp.value = ""; inp.focus(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const inp = e.target.closest && e.target.closest(".task-add-input");
    if (!inp) return;
    e.preventDefault(); addUserTask(inp.value); inp.value = "";
  });
  // "all ↗" link → Tasks tab.
  document.addEventListener("click", (e) => {
    const lnk = e.target.closest && e.target.closest(".sec-link[data-view]");
    if (!lnk) return;
    e.preventDefault(); switchView(lnk.dataset.view);
  });

  // Calendar sub-view toggle (Today / Week / Upcoming).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".cal-seg-btn");
    if (!btn) return;
    CAL_MODE = btn.dataset.cal;
    render();
  });

  // Natural-language calendar command bar.
  document.addEventListener("submit", (e) => {
    if (!(e.target && e.target.id === "calCmd")) return;
    e.preventDefault();
    submitCalCmd();
  });
  // "Do it anyway" — apply despite a conflict warning.
  document.addEventListener("click", (e) => {
    const f = e.target.closest && e.target.closest(".cal-cmd-force");
    if (!f) return;
    const st = document.getElementById("calCmdStatus");
    const text = st && st.dataset.text;
    if (text) runAndReport(text, true);
  });

  loadData(window.CALENDAR_DATA || { events: [] });   // start from snapshot
  renderConn("snapshot");

  // Reuse a remembered session so refreshes don't require reconnecting.
  if (backendActive()) {
    // Permanent backend login — one session, no popups, ever.
    refreshCalendar().catch(() => {});
    if (window.LifeOSYouTube) refreshYouTube().catch(() => {});
    fetchBrief();                             // freshest morning brief
    fetchStudio();                            // morning Studio-only metrics feed
    fetchMoney();                             // Rocket Money feed
    fetchSchool();                            // academic planner feed
    pullStateCloud();                          // sync checked-off to-dos across devices
  } else {
    if (window.LifeOSGoogle && LifeOSGoogle.isConfigured()) {
      LifeOSGoogle.tryResume().then((data) => { if (data) { loadData(data); renderConn("live"); } }).catch(() => {});
    }
    if (window.LifeOSYouTube && LifeOSYouTube.isConfigured()) {
      LifeOSYouTube.tryResume().then((live) => { if (live) applyLiveYT(live); }).catch(() => {});
    }
  }

  // Re-connect automatically when returning to the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (backendActive()) {
      if (!STATE.live) refreshCalendar().catch(() => {});
      if (!(YT_DATA && YT_DATA.live)) refreshYouTube().catch(() => {});
      fetchBrief();                           // refresh the brief
      fetchStudio();                          // refresh Studio metrics
      fetchMoney();                           // refresh money
      fetchSchool();                          // refresh academic planner
      pullStateCloud();                        // pick up checks made on other devices
      return;
    }
    if (window.LifeOSGoogle && LifeOSGoogle.isConfigured() && !STATE.live) {
      LifeOSGoogle.tryResume().then((data) => { if (data) { loadData(data); renderConn("live"); } }).catch(() => {});
    }
    if (window.LifeOSYouTube && LifeOSYouTube.isConfigured() && !(YT_DATA && YT_DATA.live)) {
      LifeOSYouTube.tryResume().then((live) => { if (live) applyLiveYT(live); }).catch(() => {});
    }
  });
}
boot();
