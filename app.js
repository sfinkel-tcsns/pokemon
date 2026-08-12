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

/* ---------- view switching ---------- */
let CURRENT = "today";
const VIEWS = {
  today:    { title: "Today",     sub: () => prettyDate(STATE.anchor) + (STATE.anchor !== STATE.today ? " (next day with events)" : ""), render: renderToday },
  week:     { title: "This Week", sub: () => "7-day overview", render: renderWeek },
  upcoming: { title: "Upcoming",  sub: () => `${STATE.events.filter((e) => e.key >= STATE.today).length || STATE.events.length} events ahead`, render: renderUpcoming },
};
function render() {
  const v = VIEWS[CURRENT];
  document.getElementById("viewTitle").textContent = v.title;
  document.getElementById("viewSub").textContent = v.sub();
  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === CURRENT));
  renderStats();
  v.render();
}
function switchView(name) { CURRENT = name; render(); }

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

async function goConnect() {
  renderConn("connecting");
  try {
    const data = await LifeOSGoogle.fetchAll();
    loadData(data);                 // rebuilds + re-renders as live
    renderConn("live");
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
  loadData(window.CALENDAR_DATA || { events: [] });   // back to snapshot
  renderConn("snapshot");
}

/* ---------- boot ---------- */
function boot() {
  renderLegend();

  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  const saved = localStorage.getItem("lifeos-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("lifeos-theme", cur);
  });

  loadData(window.CALENDAR_DATA || { events: [] });   // start from snapshot
  renderConn("snapshot");
}
boot();
