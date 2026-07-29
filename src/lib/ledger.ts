// The ledger runner. EVERY mutation the hub performs goes through this one
// function: insert a running action_ledger row, execute, settle done or failed
// with the artifacts and the resulting commits.
//
// This is what makes the one-table rule in db.ts actually hold instead of being
// a comment somebody ignores. If you are about to write a mutation that does
// not call runThroughLedger, that is the bug.
import { getDb } from "./db";
import { loadConfig } from "./config";

export interface LedgerOutcome {
  ok: boolean;
  /** Plain language for a human ("committed abc1234, pushed"). */
  message: string;
  /** Output paths and URLs recorded on the row: the never-hunt-for-it links. */
  artifacts: string[];
  /** Resulting "repo@sha" strings. Undo is a git revert of exactly these. */
  commits?: string[];
}

export interface LedgerRun extends LedgerOutcome {
  /** The action_ledger row this execution wrote. */
  ledgerId: number;
}

/** Run a mutation through the ledger: insert running, execute, settle. */
export async function runThroughLedger(
  verb: string,
  target: string,
  undoable: boolean,
  fn: () => Promise<LedgerOutcome>,
): Promise<LedgerRun> {
  const db = getDb();
  const actor = loadConfig().hub.actor;
  const inserted = db
    .prepare(
      `INSERT INTO action_ledger (actor, verb, target, undoable, state, started_at)
       VALUES (?, ?, ?, ?, 'running', datetime('now'))`,
    )
    .run(actor, verb, target, undoable ? 1 : 0);
  const ledgerId = Number(inserted.lastInsertRowid);

  let outcome: LedgerOutcome;
  try {
    outcome = await fn();
  } catch (err) {
    // A thrown error is a failed row, never a lost one. The point of the ledger
    // is that nothing the hub did is invisible afterwards.
    outcome = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      artifacts: [],
    };
  }

  db.prepare(
    `UPDATE action_ledger
     SET state = ?, ended_at = datetime('now'), artifacts = ?, commits = ?
     WHERE id = ?`,
  ).run(
    outcome.ok ? "done" : "failed",
    JSON.stringify(outcome.artifacts),
    JSON.stringify(outcome.commits ?? []),
    ledgerId,
  );

  return { ...outcome, ledgerId };
}
