/**
 * Turns a date + time typed in a named timezone into a Unix timestamp, so Discord can show it
 * in every viewer's own timezone with <t:UNIX:F>.
 */

/** How far ahead of UTC (in ms) `timeZone` is at the given instant. DST-aware. */
function zoneOffsetMs(timeZone, instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(instant);
  const get = type => Number(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Wall-clock time in `timeZone` -> Unix seconds. */
function zonedToUnix(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - zoneOffsetMs(timeZone, new Date(guess));
  utc = guess - zoneOffsetMs(timeZone, new Date(utc)); // second pass covers DST changeovers
  return Math.floor(utc / 1000);
}

/** "21/11/2026", "21-11-26", "21.11.2026" (day first). Returns {year, month, day} or null. */
function parseDate(input) {
  const m = String(input).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** "20:00", "8pm", "8:30 pm", "08.30". Returns {hour, minute} or null. */
function parseTime(input) {
  const m = String(input).trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const mer = m[3];
  if (minute > 59) return null;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    if (mer === 'pm' && hour !== 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

module.exports = { zonedToUnix, parseDate, parseTime };
