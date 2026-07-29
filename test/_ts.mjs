// Load a TypeScript module under test, or say honestly that this Node cannot.
//
// Node strips types natively from 22.6 behind a flag and from 23.6 by default.
// This project supports Node 20, where a .ts import simply fails. The choice is
// between adding a loader dependency (against the dependency rule), adding a
// build step for tests (more moving parts than the tests are worth), and
// skipping loudly on old Node. This is the third.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * @param {string} relative path from the repo root, e.g. "src/lib/migrate.ts"
 * @returns {Promise<Record<string, unknown> | null>} null when this Node cannot load TypeScript
 */
export async function loadTs(relative) {
  try {
    return await import(pathToFileURL(path.join(repoRoot, relative)).href);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Unknown file extension|typescript|strip-types|ERR_UNSUPPORTED/i.test(message)) return null;
    throw err;
  }
}

/** The reason printed when a suite skips, so nobody reads a skip as a pass. */
export const NO_TS = `this Node (${process.version}) cannot import TypeScript directly, see test/README.md`;
