// The browser section of the config, which decides which browser is launched, on which port,
// against which data directory. Every rule in here exists because getting it wrong is either
// silent or actively misleading, and two of them are scars:
//
//   A DUPLICATE PORT points two profiles at ONE browser, and it presents as the wrong
//   profile's tabs under the right label, which reads as a rendering bug rather than a config
//   one. It cost real time upstream, where the port used to be derived from list position and
//   reordering the list silently repointed every profile.
//
//   A PROFILE ID BECOMES A DIRECTORY NAME under userDataDir, so it is held to a slug rather
//   than merely checked for separators.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/config.ts");

describe("browser config", { skip: mod === null ? NO_TS : false }, () => {
  const { loadConfig, resetConfigCache } = mod ?? {};

  const originalCwd = process.cwd();
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hub-browser-"));
    process.chdir(dir);
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    resetConfigCache();
  });

  const write = (obj) => writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(obj));
  const profile = (over = {}) => ({ id: "work", label: "WORK", dir: "Default", port: 2890, ...over });

  test("no browser section at all still boots, with no profiles", () => {
    write({});
    const { browser } = loadConfig();
    assert.deepEqual(browser.profiles, []);
    // HONEST ABSENCE, and it is load bearing: the install paths live in
    // hub.config.example.json only, so absent here means absent, in the app AND in the
    // sidecar, rather than the two disagreeing about whether a browser exists.
    assert.deepEqual(browser.browsers, {});
    assert.equal(browser.sidecarPort > 0, true);
  });

  test("a profile parses, and browser defaults to chrome", () => {
    write({ browser: { profiles: [profile()] } });
    const [first] = loadConfig().browser.profiles;
    assert.equal(first.id, "work");
    assert.equal(first.browser, "chrome");
    assert.equal(first.port, 2890);
    assert.equal(first.account, "");
  });

  test("the data directory is absolute, expanded from a tilde", () => {
    write({ browser: { userDataDir: "~/somewhere/browsers" } });
    assert.equal(path.isAbsolute(loadConfig().browser.userDataDir), true);
  });

  test("seedFrom picks THIS platform out of the map", () => {
    write({
      browser: {
        browsers: { chrome: { bin: ["/x"], names: ["y"], seedFrom: { darwin: "/mac/path", linux: "/linux/path" } } },
      },
    });
    const expected = { darwin: "/mac/path", linux: "/linux/path" }[process.platform] ?? "";
    assert.equal(loadConfig().browser.browsers.chrome.seedFrom, expected);
  });

  test("a platform the config does not mention yields an empty seedFrom, not a guess", () => {
    write({ browser: { browsers: { chrome: { bin: [], names: [], seedFrom: { plan9: "/x" } } } } });
    assert.equal(loadConfig().browser.browsers.chrome.seedFrom, "");
  });

  test("a plain string seedFrom is accepted for a one-machine setup", () => {
    write({ browser: { browsers: { chrome: { bin: [], names: [], seedFrom: "/only/here" } } } });
    assert.equal(loadConfig().browser.browsers.chrome.seedFrom, "/only/here");
  });

  test("comment keys inside browsers are ignored, not parsed as a browser", () => {
    write({ browser: { browsers: { $comment: "a note", chrome: { bin: [], names: [], seedFrom: "" } } } });
    assert.deepEqual(Object.keys(loadConfig().browser.browsers), ["chrome"]);
  });

  // Each of these is a message a non-developer has to be able to act on, and it names the
  // exact place in the file.
  const rejects = [
    [{ browser: { profiles: [profile({ id: "Work" })] } }, /at "browser\.profiles\[0\]\.id"/],
    [{ browser: { profiles: [profile({ id: "-work" })] } }, /at "browser\.profiles\[0\]\.id"/],
    [{ browser: { profiles: [profile({ id: "a/b" })] } }, /at "browser\.profiles\[0\]\.id"/],
    [{ browser: { profiles: [profile(), profile({ port: 2891 })] } }, /already used \("work" appears twice\)/],
    [{ browser: { profiles: [profile(), profile({ id: "other" })] } }, /already used \(2890 appears twice\)/],
    [{ browser: { profiles: [profile({ dir: "a/b" })] } }, /plain folder name .* at "browser\.profiles\[0\]\.dir"/],
    [{ browser: { profiles: [profile({ dir: ".." })] } }, /plain folder name .* at "browser\.profiles\[0\]\.dir"/],
    [{ browser: { profiles: [profile({ port: "2890" })] } }, /at "browser\.profiles\[0\]\.port"/],
    [{ browser: { profiles: [profile({ port: 80 })] } }, /at "browser\.profiles\[0\]\.port"/],
    [{ browser: { profiles: [profile({ port: 70000 })] } }, /at "browser\.profiles\[0\]\.port"/],
    [{ browser: { profiles: [{ label: "no id", dir: "Default", port: 2890 }] } }, /at "browser\.profiles\[0\]\.id"/],
    [{ browser: { profiles: [{ id: "work", dir: "Default", port: 2890 }] } }, /at "browser\.profiles\[0\]\.label"/],
    [{ browser: { profiles: "not a list" } }, /a list of profiles at "browser\.profiles"/],
    [{ browser: { profiles: ["not an object"] } }, /an object at "browser\.profiles\[0\]"/],
    [{ browser: { quality: 0 } }, /between 1 and 100 at "browser\.quality"/],
    [{ browser: { quality: 101 } }, /between 1 and 100 at "browser\.quality"/],
    [{ browser: { sidecarPort: "2887" } }, /a whole number at "browser\.sidecarPort"/],
    [{ browser: { windowSize: [1440] } }, /exactly two numbers at "browser\.windowSize"/],
    [{ browser: { windowPosition: ["x", 0] } }, /exactly two numbers at "browser\.windowPosition"/],
    [{ browser: { browsers: { chrome: { bin: "one string" } } } }, /a list of strings at "browser\.browsers\.chrome\.bin"/],
  ];

  for (const [config, expected] of rejects) {
    test(`refuses ${JSON.stringify(config).slice(0, 88)}`, () => {
      write(config);
      assert.throws(() => loadConfig(), expected);
    });
  }
});
