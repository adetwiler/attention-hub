// The one relative-time formatter every surface shares. Small, but it is the
// text a user reads to decide whether something is stuck.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/time.ts");

describe("relTime", { skip: mod === null ? NO_TS : false }, () => {
  const { relTime } = mod ?? {};
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const ago = (ms) => relTime(now - ms, now);

  test("under a minute is 'just now'", () => {
    assert.equal(ago(0), "just now");
    assert.equal(ago(59_000), "just now");
  });

  test("minutes, hours and days", () => {
    assert.equal(ago(4 * 60_000), "4m ago");
    assert.equal(ago(3 * 3_600_000), "3h ago");
    assert.equal(ago(6 * 86_400_000), "6d ago");
  });

  test("past two weeks it becomes a date", () => {
    assert.equal(ago(30 * 86_400_000), "2026-06-28");
  });

  test("a future timestamp does not read as negative", () => {
    assert.equal(relTime(now + 60_000, now), "just now");
  });
});

describe("relTimeFromSqlite", { skip: mod === null ? NO_TS : false }, () => {
  const { relTimeFromSqlite } = mod ?? {};
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);

  test("a SQLite datetime('now') string is read as UTC", () => {
    assert.equal(relTimeFromSqlite("2026-07-28 11:00:00", now), "1h ago");
  });

  test("null and garbage produce nothing, never NaN on screen", () => {
    assert.equal(relTimeFromSqlite(null, now), "");
    assert.equal(relTimeFromSqlite("not a date", now), "");
  });
});

describe("todayLabel", { skip: mod === null ? NO_TS : false }, () => {
  const { todayLabel } = mod ?? {};

  // Built from local components so the assertion holds in every timezone, and
  // matched loosely because the separator is ICU's business, not ours.
  test("reads as a heading, not a machine stamp", () => {
    assert.match(todayLabel(new Date(2026, 6, 28, 12, 0, 0)), /^Tuesday,? 28 July$/);
  });
});
