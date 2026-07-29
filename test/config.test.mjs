// The config loader. Every branch of it had exactly one hand-run exercise
// before this file existed, and it is the single piece of code that decides
// where a user's database lives and what port their hub answers on.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/config.ts");

describe("loadConfig", { skip: mod === null ? NO_TS : false }, () => {
  const { loadConfig, resetConfigCache, expandPath } = mod ?? {};

  const originalCwd = process.cwd();
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hub-config-"));
    process.chdir(dir);
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    resetConfigCache();
  });

  const write = (obj) => writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(obj));

  test("no config file at all still boots on the documented defaults", () => {
    const config = loadConfig();
    assert.equal(config.bind.host, "127.0.0.1");
    assert.equal(config.hub.name, "Attention Hub");
    assert.equal(config.adapters.default, null);
    assert.equal(path.isAbsolute(config.dataDir), true);
  });

  test("an empty object is the same as no file", () => {
    write({});
    assert.equal(loadConfig().bind.host, "127.0.0.1");
  });

  test("comment keys are ignored, not parsed", () => {
    write({ $comment: "hello", hub: { $comment: "also me", name: "My Hub" } });
    assert.equal(loadConfig().hub.name, "My Hub");
  });

  test("a relative dataDir resolves against the working directory", () => {
    write({ dataDir: "somewhere" });
    // process.cwd(), not `dir`: on macOS the temp directory is reached through
    // a symlink and the two spellings are not the same string.
    assert.equal(loadConfig().dataDir, path.join(process.cwd(), "somewhere"));
  });

  test("invalid JSON names the file, not the key", () => {
    writeFileSync(path.join(dir, "hub.config.json"), "{ not json");
    assert.throws(() => loadConfig(), /hub\.config\.json is not valid JSON/);
  });

  // The vocabulary of this loader is "name the exact place in the file". Each
  // of these is a message a non-developer has to be able to act on.
  const rejects = [
    [{ bind: { port: "3000" } }, /expected a whole number at "bind\.port"/],
    [{ bind: { port: 1.5 } }, /expected a whole number at "bind\.port"/],
    [{ bind: { port: 0 } }, /between 1 and 65535 at "bind\.port"/],
    [{ bind: { port: 70000 } }, /between 1 and 65535 at "bind\.port"/],
    [{ bind: { host: "" } }, /expected a non-empty string at "bind\.host"/],
    [{ bind: { host: 127 } }, /expected a non-empty string at "bind\.host"/],
    [{ bind: [] }, /expected an object at "bind"/],
    [{ bind: { allowedDevOrigins: "hub.local" } }, /expected a list of strings at "bind\.allowedDevOrigins"/],
    [{ bind: { allowedDevOrigins: [1] } }, /expected a non-empty string at "bind\.allowedDevOrigins\[0\]"/],
    [{ update: { enabled: "yes" } }, /expected true or false at "update\.enabled"/],
    [{ update: { repo: "not-a-slug" } }, /repository slug at "update\.repo"/],
    [{ adapters: { default: "claude" } }, /the name of a configured agent/],
    [{ adapters: { agents: { claude: {} } } }, /expected a non-empty string at "adapters\.agents\.claude\.bin"/],
    [{ modules: { enabled: [""] } }, /expected a non-empty string at "modules\.enabled\[0\]"/],
  ];

  for (const [config, expected] of rejects) {
    test(`refuses ${JSON.stringify(config)}`, () => {
      write(config);
      assert.throws(() => loadConfig(), expected);
    });
  }

  test("a configured adapter resolves and reports untested honestly", () => {
    write({
      adapters: {
        default: "mytool",
        agents: { mytool: { bin: "mytool", args: ["--print"], label: "My Tool", untested: true } },
      },
    });
    const adapters = loadConfig().adapters;
    assert.equal(adapters.default, "mytool");
    assert.equal(adapters.agents.mytool.untested, true);
    assert.deepEqual(adapters.agents.mytool.args, ["--print"]);
  });

  test("the error names the file that was actually read", () => {
    // No hub.config.json here, only the example: telling someone to fix a key
    // in a file they do not have is worse than a generic message.
    writeFileSync(path.join(dir, "hub.config.example.json"), JSON.stringify({ bind: { port: "3000" } }));
    assert.throws(() => loadConfig(), /hub\.config\.example\.json: expected a whole number/);
  });
});

describe("expandPath", { skip: mod === null ? NO_TS : false }, () => {
  const { expandPath } = mod ?? {};

  test("a bare tilde is the home directory", () => {
    assert.equal(expandPath("~"), homedir());
  });

  test("tilde-slash expands, on both slash styles", () => {
    assert.equal(expandPath("~/hub"), path.join(homedir(), "hub"));
    assert.equal(expandPath("~\\hub"), path.join(homedir(), "hub"));
  });

  test("a tilde that is not a home reference is left alone", () => {
    assert.equal(expandPath("~notauser/hub"), "~notauser/hub");
    assert.equal(expandPath("data"), "data");
  });
});
