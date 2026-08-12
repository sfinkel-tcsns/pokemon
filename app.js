/* ===========================================================
   Life OS — calendar dashboard
   Reads window.CALENDAR_DATA (seeded from Google Calendar).
   =========================================================== */

const DATA = window.CALENDAR_DATA || { events: [], timeZone: "America/Chicago" };
const TZ = DATA.timeZone || "America/Chicago";

/* ---------- categorization ---------- */
const CATEGORIES = {
  work:     { label: "Work",     color: "var(--c-work)" },
  health:   { label: "Health",   color: "var(--c-health)" },
  meal:     { label: "Meals",    color: "var(--c-meal)" },
  rest:     { label: "Rest",     color: "var(--c-rest)" },
  travel:   { label: "Travel",   color: "var(--c-travel)" },
  brief:    { label: "Briefs",   color: "var(--c-brief)" },
  personal: { label: "Personal", color: "var(--c-personal)" },
};

function categorize(ev) {
  const t = (ev.title || "").toLowerCase();
  if (ev.allDay) return "brief";
  if (/sleep|wind down|wind-down/.test(t)) return "rest";
  if (/gym|s\.a\.v\.e\.r\.s|savers|shower|workout|run\b/.test(t)) return "health";
  if (/dinner|lunch|breakfast|meal|eat|coffee/.test(t)) return "meal";
  if (/drive|🚗|commute|uber|flight|travel/.test(t)) return "travel";
  if (/clickster|admin|work|portal|laptop|forms?|email|meeting|call|excel|triage/.test(t)) return "work";
  return "personal";
}

/* ---------- time helpers (wall-clock, calendar TZ) ---------- */
// Display uses the wall-clock time embedded in the ISO string so it always
// matches the calendar's own timezone regardless of the viewer's location.
function wallTime(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  let h = +m[1];
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}
function dayKey(iso) { return String(iso).slice(0, 10); }

// current wall-clock time in the calendar's timezone, formatted like "12:27 PM"
function nowWall() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit",
  }).format(new Date());
}

function durationLabel(ev) {
  if (ev.allDay) return "all day";
  const a = new Date(ev.start), b = new Date(ev.end);
  const mins = Math.round((b - a) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), r = mins % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// "today" resolved in the calendar's timezone
function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function prettyDate(key) {
  const [y, mo, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

/* ---------- data prep ---------- */
const EVENTS = (DATA.events || [])
  .map((e) => ({ ...e, cat: categorize(e), key: dayKey(e.start) }))
  .sort((a, b) => String(a.start).localeCompare(String(b.start)));

const BY_DAY = {};
for (const e of EVENTS) (BY_DAY[e.key] ||= []).push(e);

const TODAY = todayKey();
// If today has no data (viewing later), anchor to the first day that does.
const DAY_KEYS = Object.keys(BY_DAY).sort();
const ANCHOR = BY_DAY[TODAY] ? TODAY : (DAY_KEYS.find((k) => k >= TODAY) || DAY_KEYS[0] || TODAY);

/* ---------- render helpers ---------- */
function catColor(cat) { return CATEGORIES[cat].color; }

function statusOf(ev) {
  if (ev.allDay) return "";
  const now = new Date(), s = new Date(ev.start), e = new Date(ev.end);
  if (e < now) return "past";
  if (s <= now && now <= e) return "current";
  return "";
}

function eventRow(ev) {
  const st = statusOf(ev);
  return `
    <div class="event ${st}">
      <div class="event-time">
        ${ev.allDay ? "all day" : wallTime(ev.start)}
        <span class="dur">${durationLabel(ev)}</span>
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

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function firstLine(s) { return String(s).split("\n")[0]; }

/* ---------- stats ---------- */
function renderStats(view) {
  const el = document.getElementById("stats");
  const todays = (BY_DAY[ANCHOR] || []).filter((e) => !e.allDay);
  const now = new Date();
  const next = EVENTS.find((e) => !e.allDay && new Date(e.start) > now);

  const busyMins = todays.reduce((sum, e) => {
    if (e.cat === "rest") return sum;
    return sum + Math.max(0, (new Date(e.end) - new Date(e.start)) / 60000);
  }, 0);
  const focusMins = todays
    .filter((e) => e.cat === "work")
    .reduce((s, e) => s + (new Date(e.end) - new Date(e.start)) / 60000, 0);

  const nextLabel = next
    ? `${escapeHtml(truncate(next.title, 22))}`
    : "Nothing scheduled";
  const nextSub = next ? `${wallTime(next.start)} · ${prettyDate(next.key) === prettyDate(ANCHOR) ? "today" : shortDate(next.key)}` : "—";

  const cards = [
    { label: "Events", value: todays.length, sub: prettyDate(ANCHOR) },
    { label: "Focus / work", value: hoursLabel(focusMins), sub: "deep-work blocks" },
    { label: "Scheduled load", value: hoursLabel(busyMins), sub: "excludes sleep" },
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
  return h >= 1 ? `${(Math.round(h * 10) / 10)}h` : `${Math.round(mins)}m`;
}
function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function shortDate(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/* ---------- views ---------- */
function renderToday() {
  const view = document.getElementById("view");
  const list = BY_DAY[ANCHOR] || [];
  const allday = list.filter((e) => e.allDay);
  const timed = list.filter((e) => !e.allDay);

  if (!list.length) { view.innerHTML = `<div class="empty">No events for this day.</div>`; return; }

  const now = new Date();
  const nextIdx = timed.findIndex((e) => new Date(e.start) > now);
  const showNowLine = ANCHOR === TODAY && nextIdx > 0;

  let html = "";
  if (allday.length) {
    html += `<div class="allday-strip">` +
      allday.map((e) => `<div class="allday">${escapeHtml(e.title)}</div>`).join("") +
      `</div>`;
  }
  html += `<div class="timeline">`;
  timed.forEach((e, i) => {
    if (showNowLine && i === nextIdx) {
      html += `<div class="tl-now"><span class="tl-now-dot"></span>Now · ${nowWall()}</div>`;
    }
    html += eventRow(e);
  });
  html += `</div>`;
  view.innerHTML = html;
}

function renderWeek() {
  const view = document.getElementById("view");
  // 7 days starting from the Monday of the anchor week
  const [y, mo, d] = ANCHOR.split("-").map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d));
  const dow = (base.getUTCDay() + 6) % 7; // 0 = Monday
  base.setUTCDate(base.getUTCDate() - dow);

  let html = `<div class="week">`;
  for (let i = 0; i < 7; i++) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    const evs = (BY_DAY[key] || []);
    const isToday = key === TODAY;
    const shown = evs.slice(0, 6);
    html += `
      <div class="day-col ${isToday ? "is-today" : ""}">
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
  html += `</div>`;
  view.innerHTML = html;
}

function renderUpcoming() {
  const view = document.getElementById("view");
  const keys = DAY_KEYS.filter((k) => k >= TODAY);
  const use = keys.length ? keys : DAY_KEYS;
  if (!use.length) { view.innerHTML = `<div class="empty">No upcoming events.</div>`; return; }

  view.innerHTML = use.map((key) => `
    <div class="up-group">
      <div class="up-date">${prettyDate(key)}${key === TODAY ? " · Today" : ""}</div>
      <div class="timeline">
        ${BY_DAY[key].map(eventRow).join("")}
      </div>
    </div>`).join("");
}

/* ---------- legend ---------- */
function renderLegend() {
  document.getElementById("legend").innerHTML = Object.values(CATEGORIES)
    .map((c) => `<span class="legend-item"><span class="legend-dot" style="background:${c.color}"></span>${c.label}</span>`)
    .join("");
}

/* ---------- view switching ---------- */
const VIEWS = {
  today:    { title: "Today",    sub: () => prettyDate(ANCHOR) + (ANCHOR !== TODAY ? " (next day with events)" : ""), render: renderToday },
  week:     { title: "This Week", sub: () => "7-day overview", render: renderWeek },
  upcoming: { title: "Upcoming", sub: () => `${EVENTS.filter(e => e.key >= TODAY).length || EVENTS.length} events ahead`, render: renderUpcoming },
};

function switchView(name) {
  const v = VIEWS[name];
  document.getElementById("viewTitle").textContent = v.title;
  document.getElementById("viewSub").textContent = v.sub();
  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  renderStats(name);
  v.render();
}

/* ---------- boot ---------- */
function boot() {
  renderLegend();

  // sync label
  if (DATA.syncedAt) {
    const d = new Date(DATA.syncedAt);
    document.getElementById("syncLabel").textContent =
      "synced " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  // theme
  const saved = localStorage.getItem("lifeos-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("lifeos-theme", cur);
  });

  switchView("today");
}

boot();
