// THE SETUP FORM'S WRITER. The one place in the hub that edits hub.config.json,
// so the things worth asserting are the things a bad edit would cost you.
//
//   IT EDITS, IT DOES NOT REGENERATE. Every key the form does not own survives a
//   save, including the $comment keys that are the only documentation most of
//   that file has. A form that rewrote the file from what the form knows would
//   quietly delete the terminal section, the browser section and every comment
//   in there, and the user would find out on the next restart.
//
//   THE PICKER CANNOT NAME A NEW BINARY. adapters.default may only become an
//   agent the config already declares. An adapter entry carries `bin`, so a form
//   that could write a new one would be a route through which a local page picks
//   a program the hub later runs. This is the security assertion in this file.
//
//   BROKEN IS NOT EMPTY. A file that will not parse yields a problem, never a
//   set of plausible blank values with a Save button next to them.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/setup-config.ts");
const skip = mod === null ? NO_TS : false;

/** The documented defaults arrive from the caller in the real code (the loaded
 * config supplies them), so the tests pass their own and assert nothing about
 * what src/lib/config.ts happens to hold. */
const FALLBACKS = { name: "Fallback Hub", dataDir: "data", port: 1234, agent: null };

/** A config with a comment key, a section the form does not own, and two agents. */
const SAMPLE = {
  $comment: "the documentation most of this file has",
  hub: { $comment: "what the topbar shows", name: "My Hub", actor: "me" },
  dataDir: "data",
  bind: { host: "127.0.0.1", port: 2886, allowedDevOrigins: [] },
  adapters: {
    default: "one",
    agents: {
      $comment: "one entry per AI tool",
      one: { bin: "one-cli", label: "Tool One" },
      two: { bin: "two-cli", label: "Tool Two", untested: true },
    },
  },
  terminal: { enabled: false, sessionPrefix: "hub" },
};

function withDir(run) {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-setup-config-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeConfig(dir, file, value) {
  writeFileSync(path.join(dir, file), typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

describe("reading what the form should show", { skip }, () => {
  const { readSetupValues, parseSetupValues, CONFIG_FILE, CONFIG_EXAMPLE_FILE } = mod ?? {};

  test("the user's own file wins over the example", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_EXAMPLE_FILE, { ...SAMPLE, hub: { name: "The Example" } });
      writeConfig(dir, CONFIG_FILE, SAMPLE);
      const read = readSetupValues(dir, FALLBACKS);
      assert.equal(read.own, true);
      assert.equal(read.file, CONFIG_FILE);
      assert.equal(read.values.name, "My Hub");
    });
  });

  test("no config of your own falls back to the example, and says so", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_EXAMPLE_FILE, SAMPLE);
      const read = readSetupValues(dir, FALLBACKS);
      assert.equal(read.own, false, "own must be false so the form can say it is about to create the file");
      assert.equal(read.file, CONFIG_EXAMPLE_FILE);
      assert.equal(read.problem, null);
    });
  });

  test("neither file is a broken install, not a blank form", () => {
    withDir((dir) => {
      const read = readSetupValues(dir, FALLBACKS);
      assert.equal(read.values, null);
      assert.match(read.problem, /nothing to edit/);
    });
  });

  test("BROKEN IS NOT EMPTY: a file that will not parse yields a problem", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_FILE, "{ this is not json");
      const read = readSetupValues(dir, FALLBACKS);
      assert.equal(read.values, null);
      assert.match(read.problem, /not valid JSON/);
    });
  });

  test("keys the file leaves out come from the caller's defaults, never from this module", () => {
    const parsed = parseSetupValues("{}", FALLBACKS);
    assert.deepEqual(parsed.values, FALLBACKS);
  });

  test("the agents offered are the ones the config declares, comments skipped", () => {
    const parsed = parseSetupValues(JSON.stringify(SAMPLE), FALLBACKS);
    assert.deepEqual(
      parsed.agents.map((a) => a.key),
      ["one", "two"],
    );
    assert.equal(parsed.agents[1].untested, true);
    assert.equal(parsed.agents[0].label, "Tool One");
  });

  test("an adapters.default naming an agent that is not declared reads as none", () => {
    // The loader refuses that config in plainer words than a form could. The
    // picker must not invent an option for a tool that does not exist.
    const parsed = parseSetupValues(JSON.stringify({ ...SAMPLE, adapters: { default: "ghost", agents: {} } }), FALLBACKS);
    assert.equal(parsed.values.agent, null);
  });
});

describe("what a save may and may not do", { skip }, () => {
  const { applySetupValues, checkSetupValues } = mod ?? {};
  const agents = [
    { key: "one", label: "Tool One", untested: false },
    { key: "two", label: "Tool Two", untested: true },
  ];

  test("THE PICKER CANNOT NAME A NEW BINARY", () => {
    // An adapter entry carries `bin`, so the form choosing an undeclared tool
    // would be a local page picking a program the hub later runs.
    const refusal = checkSetupValues({ name: "Hub", dataDir: "data", port: 2886, agent: "curl" }, agents);
    assert.match(refusal, /already declares/);

    const applied = applySetupValues(JSON.stringify(SAMPLE), {
      name: "Hub",
      dataDir: "data",
      port: 2886,
      agent: "/usr/bin/curl",
    });
    assert.equal(applied.text, null, "an undeclared tool must not be written");
  });

  test("null is always allowed: none yet is a real answer", () => {
    assert.equal(checkSetupValues({ name: "Hub", dataDir: "data", port: 2886, agent: null }, agents), null);
    assert.equal(checkSetupValues({ name: "Hub", dataDir: "data", port: 2886, agent: null }, []), null);
  });

  test("each field is refused in plain words that name it", () => {
    const base = { name: "Hub", dataDir: "data", port: 2886, agent: null };
    assert.match(checkSetupValues({ ...base, name: "  " }, agents), /name/i);
    assert.match(checkSetupValues({ ...base, name: "x".repeat(200) }, agents), /topbar/i);
    assert.match(checkSetupValues({ ...base, dataDir: "" }, agents), /folder/i);
    assert.match(checkSetupValues({ ...base, port: 0 }, agents), /between 1 and 65535/);
    assert.match(checkSetupValues({ ...base, port: 70000 }, agents), /between 1 and 65535/);
    assert.match(checkSetupValues({ ...base, port: 80.5 }, agents), /whole number/);
  });

  test("EDIT, NEVER REGENERATE: everything the form does not own survives", () => {
    const applied = applySetupValues(JSON.stringify(SAMPLE, null, 2), {
      name: "Renamed",
      dataDir: "~/hub-data",
      port: 3000,
      agent: "two",
    });
    assert.equal(applied.problem, null);
    const after = JSON.parse(applied.text);

    // The four the form owns.
    assert.equal(after.hub.name, "Renamed");
    assert.equal(after.dataDir, "~/hub-data");
    assert.equal(after.bind.port, 3000);
    assert.equal(after.adapters.default, "two");

    // Everything else, including the comments, which are the only documentation
    // most of that file has.
    assert.equal(after.$comment, SAMPLE.$comment);
    assert.equal(after.hub.$comment, SAMPLE.hub.$comment);
    assert.equal(after.hub.actor, "me");
    assert.equal(after.bind.host, "127.0.0.1");
    assert.deepEqual(after.adapters.agents, SAMPLE.adapters.agents);
    assert.deepEqual(after.terminal, SAMPLE.terminal);
  });

  test("a name and a folder are trimmed, because a trailing space in a path is a bug", () => {
    const applied = applySetupValues(JSON.stringify(SAMPLE), {
      name: "  Spaced  ",
      dataDir: "  data  ",
      port: 2886,
      agent: null,
    });
    const after = JSON.parse(applied.text);
    assert.equal(after.hub.name, "Spaced");
    assert.equal(after.dataDir, "data");
  });

  test("a source that will not parse changes nothing and says so", () => {
    const applied = applySetupValues("{ nope", { name: "Hub", dataDir: "data", port: 2886, agent: null });
    assert.equal(applied.text, null);
    assert.match(applied.problem, /not valid JSON/);
  });
});

describe("writing the file", { skip }, () => {
  const { writeSetupValues, CONFIG_FILE, CONFIG_EXAMPLE_FILE } = mod ?? {};

  test("a first save creates your config from the example and says which", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_EXAMPLE_FILE, SAMPLE);
      const written = writeSetupValues(dir, { name: "Mine", dataDir: "data", port: 2886, agent: "one" });
      assert.equal(written.ok, true);
      assert.equal(written.file, CONFIG_FILE);
      assert.match(written.message, /created/);

      const after = JSON.parse(readFileSync(path.join(dir, CONFIG_FILE), "utf8"));
      assert.equal(after.hub.name, "Mine");
      // The example's own sections came along, which is the point of starting
      // from it rather than from nothing.
      assert.deepEqual(after.terminal, SAMPLE.terminal);
      // And the example itself was not touched. It is tracked; the user's is not.
      assert.deepEqual(JSON.parse(readFileSync(path.join(dir, CONFIG_EXAMPLE_FILE), "utf8")), SAMPLE);
    });
  });

  test("a later save edits your own file", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_EXAMPLE_FILE, SAMPLE);
      writeConfig(dir, CONFIG_FILE, { ...SAMPLE, hub: { name: "Before", actor: "me" } });
      const written = writeSetupValues(dir, { name: "After", dataDir: "data", port: 2886, agent: null });
      assert.equal(written.ok, true);
      assert.match(written.message, /saved/);
      const after = JSON.parse(readFileSync(path.join(dir, CONFIG_FILE), "utf8"));
      assert.equal(after.hub.name, "After");
      assert.equal(after.adapters.default, null);
    });
  });

  test("a refused save leaves the file exactly as it was", () => {
    withDir((dir) => {
      const before = { ...SAMPLE, hub: { name: "Untouched", actor: "me" } };
      writeConfig(dir, CONFIG_FILE, before);
      const written = writeSetupValues(dir, { name: "", dataDir: "data", port: 2886, agent: null });
      assert.equal(written.ok, false);
      assert.deepEqual(JSON.parse(readFileSync(path.join(dir, CONFIG_FILE), "utf8")), before);
    });
  });

  test("the file it writes ends in a newline and parses", () => {
    withDir((dir) => {
      writeConfig(dir, CONFIG_EXAMPLE_FILE, SAMPLE);
      writeSetupValues(dir, { name: "Mine", dataDir: "data", port: 2886, agent: null });
      const text = readFileSync(path.join(dir, CONFIG_FILE), "utf8");
      assert.ok(text.endsWith("\n"), "a config file with no trailing newline is a diff that never ends");
      assert.doesNotThrow(() => JSON.parse(text));
    });
  });
});
