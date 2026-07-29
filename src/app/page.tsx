// TODAY. The room you land in: what needs you, then what is running.
//
// On a fresh install both are empty, and this page says that in plain words.
// There is no sample data anywhere in it. A dashboard that greets a new user
// with invented rows teaches them not to trust it.
import AttentionCard from "@/components/AttentionCard";
import DegradedNote from "@/components/DegradedNote";
import JobsStrip from "@/components/JobsStrip";
import { loadConfig } from "@/lib/config";
import { safeLedgerSnapshot } from "@/lib/stream";
import { todayLabel } from "@/lib/time";
import { hubVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

interface Setup {
  /** A plain-language reason the hub is not fully set up yet, or null. */
  note: string | null;
  /** True when the config file could not be read at all. */
  broken: boolean;
}

function setupState(): Setup {
  try {
    const config = loadConfig();
    if (config.adapters.default === null) {
      return {
        note: "No AI tool is configured yet. Name the command-line tool you already use under \"adapters\" in hub.config.json, and the rooms that need one will switch on.",
        broken: false,
      };
    }
    return { note: null, broken: false };
  } catch (err) {
    return { note: err instanceof Error ? err.message : String(err), broken: true };
  }
}

export default function Today() {
  const initial = safeLedgerSnapshot();
  const setup = setupState();

  return (
    <>
      <div className="room-head">
        <h1>Today</h1>
        <span className="room-date">{todayLabel()}</span>
      </div>

      {/* A database the hub cannot read is NOT an empty hub, and this is the
          seam that says so. Without it, a broken install renders exactly like a
          healthy fresh one and the user believes nothing is happening. */}
      <DegradedNote initial={initial} />

      <AttentionCard initial={initial} />
      <JobsStrip initial={initial} />

      {setup.note !== null ? (
        <section className={setup.broken ? "card note bad" : "card note"}>
          <span className="hd">{setup.broken ? "Config problem" : "Not set up yet"}</span>
          <p className="empty">{setup.note}</p>
        </section>
      ) : null}

      <p className="version">
        Attention Hub v{hubVersion()}. Running on this machine only. No telemetry:
        the database in your data folder is yours and nothing in it is sent anywhere.
      </p>
    </>
  );
}
