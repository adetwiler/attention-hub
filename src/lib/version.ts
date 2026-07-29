// The running version, read from package.json at request time on the server.
//
// Server only: it reads a file. It is a plain string by the time it reaches a
// client component. The self-check in a later slice compares this against what
// the docs claim, which is why there is exactly one place that knows it.
import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/** The hub's version, or "unknown" if package.json cannot be read. Honest, never faked. */
export function hubVersion(): string {
  if (cached !== null) return cached;
  try {
    const raw: unknown = JSON.parse(
      // turbopackIgnore: a runtime read, not a static import. See src/lib/config.ts.
      readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "package.json"), "utf8"),
    );
    const version =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)["version"]
        : undefined;
    cached = typeof version === "string" ? version : "unknown";
  } catch {
    cached = "unknown";
  }
  return cached;
}
