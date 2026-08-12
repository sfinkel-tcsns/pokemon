// Merges the primary calendar + secondary calendars into ONE unified list.
// Everything lands in a single "Personal" calendar; the app colors events by
// life-category (work/health/social/...), not by source.
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(__dirname + '/primary.json', 'utf8'));
const sec  = JSON.parse(fs.readFileSync(__dirname + '/secondary.json', 'utf8'));

const events = base.events.map((e) => ({
  id: e.id, title: e.title, start: e.start, end: e.end,
  allDay: e.allDay, location: e.location || null,
}));

let n = 0;
for (const arr of Object.values(sec)) {
  for (const [title, start, end] of arr) {
    events.push({
      id: `x-${n++}`, title, start, end,
      allDay: start.length === 10, location: null,
    });
  }
}

events.sort((a, b) => String(a.start).localeCompare(String(b.start)));

const merged = {
  generatedFor: base.generatedFor,
  timeZone: base.timeZone || 'America/Chicago',
  syncedAt: base.syncedAt,
  events,
};

fs.writeFileSync(__dirname + '/events.json', JSON.stringify(merged, null, 2));
fs.writeFileSync(__dirname + '/events.js', 'window.CALENDAR_DATA = ' + JSON.stringify(merged, null, 2) + ';\n');
console.log('unified events:', events.length);
