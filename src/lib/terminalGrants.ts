// The grant store: the one place a permission to open a shell is written, and
// the one place it is spent.
//
// SEPARATE FROM src/lib/terminal.ts ON PURPOSE. That module is the rules and has
// no I/O, so a test can drive every refusal it makes. This module is the I/O and
// nothing else: two statements and a prune.
//
// A grant is SPENT BY AN UPDATE, not by a read followed by a write. `redeemed_at
// IS NULL` in the WHERE clause is what makes it single use: two sidecars racing
// on the same token means one UPDATE reports a change and the other reports
// none, decided by SQLite rather than by our ordering.
//
// This is state, never history. Who attached a terminal is an action_ledger row,
// and ledger_id points at it. Rows here expire in seconds and get pruned.
import { getDb } from "./db";
import { grantExpiry, hashToken, type TerminalGrant } from "./terminal";

/** A redeemed grant, exactly as it was minted. */
export interface RedeemedGrant extends TerminalGrant {
  /** The action_ledger row that recorded the attach, so the sidecar's session
   * row can point back at it. */
  ledgerId: number | null;
}

/** The shape SQLite hands back. Its own row type, because the column names are
 * snake_case and the app's are not. */
interface GrantRow {
  pane_id: string;
  session: string;
  cwd: string;
  shell: string | null;
  tmux: number;
  scrollback: number;
  idle_minutes: number;
  ledger_id: number | null;
  expires_at: string;
  redeemed_at: string | null;
}

/** Store a grant against the hash of its token. The token itself is returned to
 * the caller and never written anywhere. */
export function insertGrant(token: string, grant: TerminalGrant, ledgerId: number | null): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO terminal_grants
       (token_hash, pane_id, session, cwd, shell, tmux, scrollback, idle_minutes, ledger_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashToken(token),
    grant.paneId,
    grant.session,
    grant.cwd,
    grant.shell,
    grant.tmux ? 1 : 0,
    grant.scrollback,
    grant.idleMinutes,
    ledgerId,
    grantExpiry(Date.now()),
  );
}

/** Spend a token. Returns the grant, or the reason it is no good.
 *
 * The three refusals are deliberately distinguishable in the log the sidecar
 * prints (unknown, already used, expired) because they mean three different
 * things when something is wrong: a bad client, a replay, or a slow one. */
export function redeemGrant(token: string): { grant: RedeemedGrant; problem: null } | { grant: null; problem: string } {
  const db = getDb();
  const hash = hashToken(token);
  return db.transaction((): { grant: RedeemedGrant; problem: null } | { grant: null; problem: string } => {
    const row = db
      .prepare(
        `SELECT pane_id, session, cwd, shell, tmux, scrollback, idle_minutes, ledger_id, expires_at, redeemed_at
           FROM terminal_grants WHERE token_hash = ?`,
      )
      .get(hash) as GrantRow | undefined;
    if (row === undefined) return { grant: null, problem: "that grant does not exist" };
    if (row.redeemed_at !== null) return { grant: null, problem: "that grant was already used once" };

    const spent = db
      .prepare(
        `UPDATE terminal_grants SET redeemed_at = datetime('now')
          WHERE token_hash = ? AND redeemed_at IS NULL AND expires_at > datetime('now')`,
      )
      .run(hash);
    if (spent.changes !== 1) return { grant: null, problem: "that grant expired before it was used" };

    return {
      grant: {
        paneId: row.pane_id,
        session: row.session,
        cwd: row.cwd,
        shell: row.shell,
        tmux: row.tmux === 1,
        scrollback: row.scrollback,
        idleMinutes: row.idle_minutes,
        ledgerId: row.ledger_id,
      },
      problem: null,
    };
  })();
}

/** Drop grants that can no longer be used. Called on mint, so the table stays
 * small without a scheduler: an hour of grace leaves a failed attach inspectable
 * while it is still the thing you are debugging. */
export function pruneGrants(): void {
  getDb().prepare("DELETE FROM terminal_grants WHERE expires_at < datetime('now', '-1 hour')").run();
}
