/* ===========================================================
   Life OS — configuration
   Edit this file to turn on live Google Calendar sync.
   =========================================================== */
window.LIFEOS_CONFIG = {
  // 1) Paste your OAuth Client ID from Google Cloud Console here.
  //    See SETUP.md for the 10-minute walkthrough.
  //    Looks like: "1234567890-abcdef.apps.googleusercontent.com"
  googleClientId: "",

  // 2) Calendars to leave OUT of the merged view (matched by name).
  excludeCalendars: ["Phases of the Moon"],

  // 3) How far to load, in days.
  daysBehind: 1,
  daysAhead: 60,

  // 4) Your timezone (used to place events on the right day).
  timeZone: "America/Chicago",
};
