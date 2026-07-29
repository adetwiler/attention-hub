// QUIET HOURS: one flag, computed here, obeyed by every surface that would
// otherwise grab your attention.
//
// THE RULE IS THAT IT SUPPRESSES SURFACES AND NEVER DATA. Quiet does not filter
// the attention queue, does not hide a row, and does not delay a write. It
// answers exactly one question, `quietNow`, and the only thing that reads it is
// the toast stack. The morning queue is the same list it would have been, in
// the same order, which is what makes it safe to turn on: nothing is lost while
// it is quiet, so nothing has to back-fire as a storm when it lifts.
//
// PURE, like src/lib/feed.ts, and for the same reason: the midnight wrap is the
// kind of arithmetic that is wrong for six months without anyone noticing, so
// it earns a unit test that loads no database (test/quiet.test.mjs). The stored
// values are read and written by src/lib/settings.ts; this file just decides.

/** Defaults first: 10pm to 6am, live on a database with no settings rows at
 * all. Setup is never a prerequisite for the feature working. */
export const QUIET_DEFAULT = { start: "22:00", end: "06:00" } as const;

/** 24 hour "HH:MM". Anything else is refused with the value named, never
 * silently replaced by a default the user did not ask for. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface QuietState {
  /** The manual toggle. Sticky: only a manual flip clears it. */
  manual: boolean;
  /** The live schedule, local 24 hour times. */
  start: string;
  end: string;
  /** The clock is inside the scheduled window right now. */
  scheduled: boolean;
  /** manual OR scheduled. THE one flag attention-grabbing surfaces obey. */
  quietNow: boolean;
}

/** The stored values, as read out of the settings table. Nulls are absent keys. */
export interface QuietSettings {
  manual: string | null;
  start: string | null;
  end: string | null;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** Inside [start, end), handling the midnight wrap that the default 22:00 to
 * 06:00 window needs. start === end is a zero length window, which is never
 * quiet, and the verb that sets it says so out loud rather than leaving someone
 * to discover that their "always quiet" setting means "never". */
export function inWindow(nowMinutes: number, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? nowMinutes >= s && nowMinutes < e : nowMinutes >= s || nowMinutes < e;
}

/**
 * The live quiet state.
 *
 * @param stored the three settings values, any of which may be absent
 * @param now the LOCAL clock. Quiet hours are somebody's evening, not UTC's.
 */
export function computeQuiet(stored: QuietSettings, now = new Date()): QuietState {
  // A stored value that is not a valid time falls back rather than throwing:
  // this runs inside the snapshot every 1.5 seconds, and a hand-edited database
  // must not be able to take the whole hub down. The setter is where a bad
  // value is refused, which is the moment a human is there to read the refusal.
  const start = stored.start !== null && TIME_RE.test(stored.start) ? stored.start : QUIET_DEFAULT.start;
  const end = stored.end !== null && TIME_RE.test(stored.end) ? stored.end : QUIET_DEFAULT.end;
  const manual = stored.manual === "1";
  const scheduled = inWindow(now.getHours() * 60 + now.getMinutes(), start, end);
  return { manual, start, end, scheduled, quietNow: manual || scheduled };
}
