// The boot script's verdict on a config file, checked against the app loader's
// verdict on the SAME file.
//
// Why this suite exists: there were two parsers with two sets of defaults and
// two opinions. Write "port": "3000" (a string, the most common JSON config
// mistake there is) and the boot script silently substituted its own default,
// printed an address you did not ask for, and started the server there, while
// the app's loader threw on the same value and rendered a config-problem card
// on a port you were not looking at. Nothing anywhere said what happened.
//
// The boot script is a separate process, so this drives it as one: spawn it,
// read what it says, and assert it refuses exactly what the loader refuses.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** A throwaway copy of just the boot scripts, with the config under test. */
function bootWith(t, config) {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-serve-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "scripts"));
  for (const file of ["serve.mjs", "next-run.mjs"]) {
    cpSync(path.join(repoRoot, "scripts", file), path.join(dir, "scripts", file));
  }
  if (config !== null) {
    writeFileSync(path.join(dir, "hub.config.json"), typeof config === "string" ? config : JSON.stringify(config));
  }
  try {
    // Next is not installed in the throwaway copy, so a config that PASSES
    // validation reaches "Next.js is not installed" and stops there. That is
    // the success signal: validation got out of the way.
    const out = execFileSync(process.execPath, [path.join(dir, "scripts", "serve.mjs"), "dev"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("scripts/serve.mjs config validation", () => {
  test("no config file boots on the documented defaults", (t) => {
    const { out } = bootWith(t, null);
    assert.match(out, /dev on http:\/\/127\.0\.0\.1:2886/);
    assert.match(out, /Local only/);
  });

  test("a valid port is used, not a default", (t) => {
    const { out } = bootWith(t, { bind: { port: 4321 } });
    assert.match(out, /dev on http:\/\/127\.0\.0\.1:4321/);
  });

  // The whole point. Each of these used to fall back to the default and print
  // an address the user never asked for.
  const refusals = [
    [{ bind: { port: "3000" } }, /expected a whole number at "bind\.port"/],
    [{ bind: { port: 1.5 } }, /expected a whole number at "bind\.port"/],
    [{ bind: { port: 0 } }, /between 1 and 65535 at "bind\.port"/],
    [{ bind: { port: 99999 } }, /between 1 and 65535 at "bind\.port"/],
    [{ bind: { host: "" } }, /expected a non-empty string at "bind\.host"/],
    [{ bind: { host: 8080 } }, /expected a non-empty string at "bind\.host"/],
    [{ bind: [] }, /expected an object at "bind"/],
    ["[]", /expected an object at "\(root\)"/],
    ["{ not json", /is not valid JSON/],
  ];

  for (const [config, expected] of refusals) {
    test(`refuses ${typeof config === "string" ? config : JSON.stringify(config)} instead of substituting a default`, (t) => {
      const { ok, out } = bootWith(t, config);
      assert.equal(ok, false, "expected a non-zero exit");
      assert.match(out, expected);
      assert.doesNotMatch(out, /on http:/, "it must not announce an address it is not going to bind");
    });
  }

  test("the error names hub.config.json, the file the user actually edited", (t) => {
    const { out } = bootWith(t, { bind: { port: "3000" } });
    assert.match(out, /hub\.config\.json: expected/);
  });

  test("a mode that is not start or dev is refused, not guessed", (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-serve-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(path.join(dir, "scripts"));
    for (const file of ["serve.mjs", "next-run.mjs"]) {
      cpSync(path.join(repoRoot, "scripts", file), path.join(dir, "scripts", file));
    }
    assert.throws(
      () => execFileSync(process.execPath, [path.join(dir, "scripts", "serve.mjs"), "prod"], { stdio: "pipe" }),
      /unknown mode/,
    );
  });
});
