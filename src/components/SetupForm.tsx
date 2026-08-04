"use client";
// THE FORM. The first thing on /setup, and the reason that page is no longer a
// reading assignment.
//
// It carries four fields with working defaults already in them, and Save writes
// hub.config.json. No copying, no JSON, and no AI tool required to finish. The
// prompts are still there, further down and behind a disclosure, for the people
// who would rather delegate the whole thing.
//
// THREE THINGS IT REFUSES TO PRETEND.
//
//   A CONFIG IT COULD NOT READ IS NOT A BLANK FORM. Blank fields plus a Save
//   button is a machine for destroying a config someone spent an evening on, so
//   an unreadable file disables the form and says which file and what is wrong.
//
//   IT DOES NOT RESTART THE HUB FOR YOU, and it says so instead of implying it
//   saved and applied. The hub reads its config once at startup; it is also the
//   process that would have to exit, and nothing would necessarily bring it
//   back. A settings form that can leave you with no hub and no UI to fix it
//   from is a worse bargain than a printed command. See OPEN.md.
//
//   IT NAMES THE FILE. "Your settings" meaning a file you have never seen is how
//   a config becomes frightening. Everything this form writes is in one plain
//   file you own, and the form says its name and, on a first save, that it is
//   about to create it from the shipped example.
import { useState } from "react";
import type { AgentChoice, SetupValues } from "@/lib/setup-config";

interface SetupFormProps {
  /** Which file the values below came from. */
  file: string;
  /** True when the user already has their own hub.config.json. */
  own: boolean;
  /** Null when the config could not be read: the form then refuses to save. */
  values: SetupValues | null;
  /** The AI tools the config declares. The picker offers these and no others. */
  agents: AgentChoice[];
  /** Why the values are null, in plain words. */
  problem: string | null;
  /** Where dataDir actually lands right now, resolved by the loader. A relative
   * name in the field is honest and portable, and seeing the absolute path it
   * becomes is what stops someone wondering where their database went. */
  resolvedDataDir: string;
}

type Result = { ok: boolean; message: string } | null;

export default function SetupForm({ file, own, values, agents, problem, resolvedDataDir }: SetupFormProps) {
  const [name, setName] = useState(values?.name ?? "");
  const [dataDir, setDataDir] = useState(values?.dataDir ?? "");
  const [port, setPort] = useState(values === null ? "" : String(values.port));
  const [agent, setAgent] = useState(values?.agent ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (values === null) {
    return (
      <section className="card note bad" id="settings">
        <span className="hd">Your settings cannot be edited here yet</span>
        <p className="empty">
          <code>{file}</code>: {problem}
        </p>
        <p className="empty">
          Fix that file by hand, or hand the prompt in the config step below to your AI tool, and
          this form comes back. It will not write over a file it could not read.
        </p>
      </section>
    );
  }

  async function save(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/setup", { // hub-allow-network: same-origin POST to this hub's own route. Nothing leaves the machine.
        method: "POST",
        headers: { "content-type": "application/json" },
        // The port leaves as a number. The field is text so a half-typed value
        // is not silently read as zero, and Number() happens once, here.
        body: JSON.stringify({ name, dataDir, port: Number(port), agent: agent === "" ? null : agent }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; problem?: string };
      if (data.ok === true) setResult({ ok: true, message: data.message ?? "Saved." });
      else setResult({ ok: false, message: data.problem ?? "The hub refused that, and did not say why." });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const portNumber = Number(port);
  const ready =
    name.trim() !== "" &&
    dataDir.trim() !== "" &&
    Number.isInteger(portNumber) &&
    portNumber > 0 &&
    portNumber < 65536;

  return (
    <section className="card setup-form" id="settings">
      <span className="hd">
        Your settings
        <span className="count">{own ? file : "not saved yet"}</span>
      </span>
      <p className="empty">
        The hub is already running on these. Change what you want and press save: it writes{" "}
        <code>hub.config.json</code>
        {own ? "" : `, which you do not have yet, starting from the shipped ${file}`}. Everything
        else on this page is optional and stays switched off until you ask for it.
      </p>

      <div className="setup-field">
        <label htmlFor="setup-name">What to call this hub</label>
        <input
          id="setup-name"
          className="answer-input"
          value={name}
          disabled={busy}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="setup-help">Shown in the topbar. It is yours, so name it after the work.</span>
      </div>

      <div className="setup-field">
        <label htmlFor="setup-data">Where your data lives</label>
        <input
          id="setup-data"
          className="answer-input"
          value={dataDir}
          disabled={busy}
          onChange={(e) => setDataDir(e.target.value)}
        />
        <span className="setup-help">
          Your database and working files. A plain name is a folder inside the hub folder, and a
          path starting with ~ is your home directory. Right now this resolves to{" "}
          <code>{resolvedDataDir}</code>.
        </span>
      </div>

      <div className="setup-field">
        <label htmlFor="setup-port">Which port it answers on</label>
        <input
          id="setup-port"
          className="answer-input short"
          value={port}
          disabled={busy}
          inputMode="numeric"
          onChange={(e) => setPort(e.target.value)}
        />
        <span className="setup-help">
          The hub listens on this machine only. Change this if something else on your machine
          already has this port.
        </span>
      </div>

      <div className="setup-field">
        <label htmlFor="setup-agent">Which AI tool you use</label>
        <select
          id="setup-agent"
          className="answer-input"
          value={agent}
          disabled={busy}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">None yet</option>
          {agents.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
              {choice.untested ? " (built to spec, never run here)" : ""}
            </option>
          ))}
        </select>
        <span className="setup-help">
          {agents.length === 0
            ? "Your config declares no tools yet. Adding one is an adapters.agents entry, which the config step below does for you."
            : "Only tools your config already declares. Adding a new one names a program on your machine, so it stays a config edit rather than something a web form can do."}
        </span>
      </div>

      <div className="answer-row">
        <button type="button" className="btn go" disabled={busy || !ready} onClick={() => void save()}>
          {busy ? "saving..." : "Save"}
        </button>
        <span className="answer-hint">Nothing here is sent anywhere. It writes one file on this machine.</span>
      </div>

      {result !== null ? (
        <p className={result.ok ? "setup-saved" : "answer-err"}>
          {result.ok ? `Saved: ${result.message}. Restart the hub to pick it up, with ./start.sh. The config is read once at startup.` : result.message}
        </p>
      ) : null}
    </section>
  );
}
