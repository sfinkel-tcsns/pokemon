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
function renderToday() {
  const view = document.getElementById("view");
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
  const view = document.getElementById("view");
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
  const view = document.getElementById("view");
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

/* ---------- Morning brief view ---------- */
function loadDone() { try { return JSON.parse(localStorage.getItem("lifeos-done") || "{}"); } catch (e) { return {}; } }
function saveDone(d) { localStorage.setItem("lifeos-done", JSON.stringify(d)); }

// Keep the "Needs you" badge in sync with how many items are still un-done.
function updateNeedCount() {
  const el = document.getElementById("needCount");
  const B = window.BRIEF_DATA;
  if (!el || !B || !B.needsYou) return;
  const done = loadDone();
  const n = (B.needsYou.items || []).filter((i) => !done[i.url || i.title]).length;
  el.textContent = n;
  el.style.display = n ? "" : "none";
}

// A checkable to-do row (used by "Needs you" and "School"). Tapping the box
// crosses it out; the done state persists in localStorage.
function needRow(o) {
  const done = !!loadDone()[o.key];
  return `
    <div class="need-item ${o.extraClass || ""} ${done ? "done" : ""}" data-key="${escapeHtml(o.key)}">
      <button class="need-check" aria-checked="${done}" aria-label="Mark done" title="Mark done"></button>
      <a class="need-body" href="${escapeHtml(o.url || "#")}" target="_blank" rel="noopener">
        <div class="need-title">${o.titleHtml || escapeHtml(o.title)}</div>
        ${o.why ? `<div class="need-why">${escapeHtml(o.why)}</div>` : ""}
        ${o.from ? `<div class="need-from">${escapeHtml(o.from)} ↗</div>` : ""}
      </a>
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
// A near-term "Do now" task — checkable, crosses out and persists like a to-do.
function taskRow(w) {
  const key = w.url || w.title;
  const done = !!loadDone()[key];
  const when = whenLabel(w);
  return `
    <div class="need-item task ${done ? "done" : ""}" data-key="${escapeHtml(key)}">
      <button class="need-check" aria-checked="${done}" aria-label="Mark done" title="Mark done"></button>
      <a class="need-body" href="${escapeHtml(w.url || "#")}" target="_blank" rel="noopener">
        <div class="need-title">${escapeHtml(w.title)}${when ? ` <span class="task-when">${escapeHtml(when)}</span>` : ""}</div>
        ${w.note ? `<div class="need-why">${escapeHtml(w.note)}</div>` : ""}
      </a>
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

  const forYou = (B.forYou || []).map((f) => `
    <div class="fy-card">
      <span class="fy-tag" style="background:${f.color}22;color:${f.color}">${escapeHtml(f.tag)}</span>
      <div class="fy-text">${escapeHtml(f.text)}</div>
      <div class="fy-action">→ ${escapeHtml(f.action)}</div>
      ${f.url ? `<a class="fy-src" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
    </div>`).join("");

  const ny = B.needsYou || { count: 0, items: [] };
  const needs = (ny.items || []).map((i) => needRow({
    key: i.url || i.title, url: i.url, title: i.title, why: i.why, from: i.from,
  })).join("");
  const undoneNeeds = (ny.items || []).filter((i) => !loadDone()[i.url || i.title]).length;

  const watchAll = B.watch || [];
  const doNow = watchAll.filter(isNow);
  const keepEye = watchAll.filter((w) => !isNow(w));

  view.innerHTML = `
    <div class="brief">
      <div class="quote-card">
        <div class="quote-text">“${escapeHtml(B.quote.text)}”</div>
        <div class="quote-author">— ${escapeHtml(B.quote.author)}</div>
      </div>
      <div class="brief-grid">
        <div class="brief-main">
          <div class="sec-label">Today's headline</div>
          <a class="headline-card" href="${escapeHtml(B.headline.url)}" target="_blank" rel="noopener">
            <div class="headline-title">${escapeHtml(B.headline.title)}</div>
            <div class="headline-sum">${escapeHtml(B.headline.summary)}</div>
            <div class="headline-src">${escapeHtml(B.headline.source)} ↗</div>
          </a>
          <div class="sec-label">For you</div>
          <div class="fy-grid">${forYou}</div>
        </div>
        <div class="brief-side">
          <div class="sec-label">Needs you <span class="need-count" id="needCount"${undoneNeeds ? "" : ' style="display:none"'}>${undoneNeeds}</span></div>
          ${ny.count ? `<div class="needs">${needs}</div>` : `<div class="soon-card">Inbox clear — nothing needs you ✨</div>`}
          ${ny.filtered ? `<div class="need-filtered">${ny.filtered} newsletters &amp; receipts filtered out</div>` : ""}
          ${doNow.length ? `<div class="sec-label">Do now ✅</div><div class="needs">${doNow.map(taskRow).join("")}</div>` : ""}
          <div class="sec-label">School ${canSchool ? '<span class="live-dot"></span>' : ""}</div>
          ${canSchool
            ? `<div id="schoolCard" class="soon-card">Loading assignments…</div>`
            : `<div class="soon-card">📚 ${escapeHtml((B.school && B.school.note) || "Outlook + Canvas — coming next.")}</div>`}
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
async function fillSchool() {
  const el = document.getElementById("schoolCard");
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

/* ---------- view switching ---------- */
let CURRENT = "morning";
const MORNING_TITLE = "Good morning" + (window.BRIEF_DATA && window.BRIEF_DATA.greetingName ? ", " + window.BRIEF_DATA.greetingName : "");
const VIEWS = {
  morning:  { title: MORNING_TITLE, sub: () => (window.BRIEF_DATA ? new Date(window.BRIEF_DATA.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : ""), render: renderMorning },
  today:    { title: "Today",     sub: () => prettyDate(STATE.anchor) + (STATE.anchor !== STATE.today ? " (next day with events)" : ""), render: renderToday },
  week:     { title: "This Week", sub: () => "7-day overview", render: renderWeek },
  upcoming: { title: "Upcoming",  sub: () => `${STATE.events.filter((e) => e.key >= STATE.today).length || STATE.events.length} events ahead`, render: renderUpcoming },
  youtube:  { title: "YouTube",   sub: () => (window.YOUTUBE_DATA ? window.YOUTUBE_DATA.channel.title + " · analytics + daily ideas" : ""), render: renderYouTube },
  money:    { title: "Money",     sub: () => (window.MONEY_DATA ? "Net worth · budget · subscriptions" : ""), render: renderMoney },
};
function render() {
  const v = VIEWS[CURRENT];
  document.getElementById("viewTitle").textContent = v.title;
  document.getElementById("viewSub").textContent = v.sub();
  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === CURRENT));

  if (CURRENT === "morning" || CURRENT === "youtube" || CURRENT === "money") {
    document.getElementById("legend").innerHTML = "";
    if (CURRENT === "money") document.getElementById("stats").innerHTML = "";
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
  // Opening Money with banks connected → quietly pull fresh numbers.
  if (name === "money" && window.LifeOSPlaid && window.LifeOSPlaid.hasItems()) refreshMoney();
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

  // Show last-known live money instantly; a refresh happens when the tab opens.
  if (window.LifeOSPlaid && window.LifeOSPlaid.cache()) LIVE_MONEY = window.LifeOSPlaid.cache();

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

  loadData(window.CALENDAR_DATA || { events: [] });   // start from snapshot
  renderConn("snapshot");

  // Reuse a remembered session so refreshes don't require reconnecting.
  if (backendActive()) {
    // Permanent backend login — one session, no popups, ever.
    refreshCalendar().catch(() => {});
    if (window.LifeOSYouTube) refreshYouTube().catch(() => {});
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
