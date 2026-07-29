// Time formatting. Client safe, no dependencies, one formatter shared by every
// surface rather than three that disagree by a minute.
//
// `nowMs` is a parameter, not a default nobody passes. Every caller inside a
// client component passes the snapshot's server clock, so the server render and
// the hydration render produce the same string. See src/components/JobsStrip.tsx.

/** "just now" / "4m ago" / "3h ago" / "6d ago" / "2026-07-01" */
export function relTime(msSinceEpoch: number, nowMs = Date.now()): string {
  const sec = Math.max(0, Math.round((nowMs - msSinceEpoch) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(msSinceEpoch).toISOString().slice(0, 10);
}

/** Same, from a SQLite `datetime('now')` string, which is UTC without a zone marker. */
export function relTimeFromSqlite(stamp: string | null, nowMs = Date.now()): string {
  if (stamp === null) return "";
  const ms = Date.parse(`${stamp.replace(" ", "T")}Z`);
  if (Number.isNaN(ms)) return "";
  return relTime(ms, nowMs);
}

/** "Tuesday 28 July" for the TODAY heading. Rendered server side per request. */
export function todayLabel(now = new Date()): string {
  return now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
