// The settings table: small, named pieces of LIVE STATE that belong to this
// install and are not registry.
//
// The split this file exists to hold (ADR-0002, and the config loader's header
// says the same thing from the other side): hub.config.json is what EXISTS, and
// SQLite is what is HAPPENING. Quiet hours are the worked example. Which files
// the hub reads is registry, so it is config. Whether you have muted yourself
// right now is state you change from the UI ten times a day, so it is a row,
// and an update replacing every tracked file cannot disturb it.
//
// One key-value table rather than a column per feature, because every future
// toggle would otherwise be a migration against a database in the wild.
import { getDb } from "./db";

/** A setting's value, or null when it has never been set. */
export function settingGet(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** Write a setting. Upsert, so a caller never has to know whether it existed. */
export function settingSet(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value);
}
