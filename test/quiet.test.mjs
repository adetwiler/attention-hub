// Quiet hours, and the midnight wrap in particular.
//
// This suite exists because the default window (22:00 to 06:00) crosses
// midnight, which means the obvious implementation is wrong for eight hours a
// day and right for the other sixteen. That is the kind of bug that survives for
// months: the person who would notice is asleep.
//
// src/lib/quiet.ts takes the stored settings as an argument rather than reading
// them, which is what lets this run with no database at all.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadTs, NO_TS } from "./_ts.mjs";

const quiet = await loadTs("src/lib/quiet.ts");

/** A local Date at a given hour and minute today, because quiet hours are
 * somebody's evening and the code reads the LOCAL clock on purpose. */
function at(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe("quiet hours", { skip: quiet === null ? NO_TS : false }, () => {
  const { computeQuiet, inWindow, isValidTime, QUIET_DEFAULT } = quiet ?? {};
  const unset = { manual: null, start: null, end: null };

  test("it works with no settings rows at all, on the documented default", () => {
    const state = computeQuiet(unset, at(12));
    assert.equal(state.start, QUIET_DEFAULT.start);
    assert.equal(state.end, QUIET_DEFAULT.end);
    assert.equal(state.quietNow, false);
  });

  test("the default window crosses midnight in both directions", () => {
    assert.equal(computeQuiet(unset, at(23, 30)).scheduled, true, "late evening is quiet");
    assert.equal(computeQuiet(unset, at(2)).scheduled, true, "the small hours are quiet");
    assert.equal(computeQuiet(unset, at(6)).scheduled, false, "the end of the window is exclusive");
    assert.equal(computeQuiet(unset, at(22)).scheduled, true, "the start of the window is inclusive");
    assert.equal(computeQuiet(unset, at(21, 59)).scheduled, false);
  });

  test("a window inside one day does not wrap", () => {
    assert.equal(inWindow(13 * 60, "09:00", "17:00"), true);
    assert.equal(inWindow(8 * 60, "09:00", "17:00"), false);
    assert.equal(inWindow(17 * 60, "09:00", "17:00"), false, "the end is exclusive here too");
  });

  test("start equal to end is a window with no length, never always-quiet", () => {
    // The trap it avoids: reading 00:00 to 00:00 as "the whole day" would make a
    // careless save silence the hub permanently, which is the one failure mode
    // this feature must not have.
    assert.equal(inWindow(0, "00:00", "00:00"), false);
    assert.equal(inWindow(13 * 60, "12:00", "12:00"), false);
  });

  test("the manual toggle is independent of the clock, and either one is enough", () => {
    const midday = computeQuiet({ manual: "1", start: null, end: null }, at(12));
    assert.equal(midday.scheduled, false);
    assert.equal(midday.quietNow, true, "manual alone is quiet");

    const night = computeQuiet({ manual: "0", start: null, end: null }, at(23));
    assert.equal(night.manual, false);
    assert.equal(night.quietNow, true, "the schedule alone is quiet");
  });

  test("a stored value that is not a time falls back instead of throwing", () => {
    // This runs inside the snapshot every 1.5 seconds. A hand edited database
    // must not be able to take the page down; the SETTER is where a bad value is
    // refused, because that is the moment a human is there to read the refusal.
    const state = computeQuiet({ manual: null, start: "yesterday", end: "25:99" }, at(12));
    assert.equal(state.start, QUIET_DEFAULT.start);
    assert.equal(state.end, QUIET_DEFAULT.end);
  });

  test("isValidTime accepts 24 hour times and nothing else", () => {
    for (const good of ["00:00", "09:05", "22:00", "23:59"]) assert.equal(isValidTime(good), true, good);
    for (const bad of ["24:00", "9:05", "22:60", "22.00", "10pm", "", "220:0"]) {
      assert.equal(isValidTime(bad), false, bad);
    }
  });
});
