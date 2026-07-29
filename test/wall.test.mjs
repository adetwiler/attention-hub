// The wall's pane list. Two rules are load-bearing enough to pin here:
//
//   HONEST EMPTY: no profiles means no panes, and never a sample one.
//   BROKEN IS NOT EMPTY: a configDir that is not there becomes a pane-level
//   problem naming the key to fix, and the pane STAYS on the wall. A pane that
//   silently disappears teaches the user the hub is unreliable rather than that
//   their config has a typo.
//
// The pane-config parsing lives in src/lib/config.ts and is exercised from here
// too, so the whole pane seam has one test file.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const wallMod = await loadTs("src/lib/wall.ts");
const configMod = await loadTs("src/lib/config.ts");
const skip = wallMod === null || configMod === null ? NO_TS : false;

describe("wallView", { skip }, () => {
  const { wallView } = wallMod ?? {};
  const { loadConfig, resetConfigCache } = configMod ?? {};

  const originalCwd = process.cwd();
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hub-wall-"));
    process.chdir(dir);
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    resetConfigCache();
  });

  const write = (obj) => writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(obj));
  /** A real directory inside the temp config root, referenced relatively. */
  const realDir = (name) => {
    mkdirSync(path.join(dir, name), { recursive: true });
    return name;
  };

  test("no profiles is an honest empty wall, not an error", () => {
    write({});
    const view = wallView();
    assert.equal(view.problem, null);
    assert.deepEqual(view.panes, []);
  });

  test("one pane per profile, in config order, labelled from the profile", () => {
    write({
      profiles: {
        work: { label: "WORK", configDir: realDir("work") },
        side: { configDir: realDir("side") },
      },
    });
    const view = wallView();
    assert.equal(view.problem, null);
    assert.deepEqual(
      view.panes.map((p) => [p.id, p.label, p.kind, p.problem]),
      [
        ["work", "WORK", "placeholder", null],
        // No label configured: the profile NAME is the fallback, never a blank chip.
        ["side", "side", "placeholder", null],
      ],
    );
  });

  test("four profiles give four panes, and eight give eight", () => {
    const profiles = {};
    for (let i = 0; i < 8; i += 1) profiles[`p${i}`] = { configDir: realDir(`p${i}`) };
    write({ profiles });
    assert.equal(wallView().panes.length, 8);
  });

  test("a configDir that does not exist is a problem on the pane, and the pane stays", () => {
    write({ profiles: { work: { configDir: "nope-not-here" } } });
    const view = wallView();
    assert.equal(view.panes.length, 1);
    const problem = view.panes[0].problem;
    assert.match(problem, /does not exist/);
    assert.match(problem, /profiles\.work\.configDir/);
  });

  test("a configDir that is a file, not a folder, says which", () => {
    writeFileSync(path.join(dir, "afile"), "x");
    write({ profiles: { work: { configDir: "afile" } } });
    assert.match(wallView().panes[0].problem, /is not a folder/);
  });

  test("a profile with no configDir is fine: a pane need not be tied to an account", () => {
    write({ profiles: { notes: {} } });
    const pane = wallView().panes[0];
    assert.equal(pane.problem, null);
    assert.equal(pane.detail, null);
  });

  test("an unreadable config is a wall-level problem, never a thrown room", () => {
    writeFileSync(path.join(dir, "hub.config.json"), "{ not json");
    const view = wallView();
    assert.deepEqual(view.panes, []);
    assert.match(view.problem, /not valid JSON/);
  });

  test("an explicit pane list replaces the derived one, labels and kinds included", () => {
    write({
      profiles: { work: { label: "WORK", configDir: realDir("work") } },
      wall: {
        panes: [
          { id: "left", profile: "work" },
          { id: "right", profile: "work", label: "SECOND LOOK" },
          { id: "loose", kind: "terminal" },
        ],
      },
    });
    const view = wallView();
    assert.deepEqual(
      view.panes.map((p) => [p.id, p.label, p.kind]),
      [
        ["left", "WORK", "placeholder"],
        ["right", "SECOND LOOK", "placeholder"],
        // Not tied to a profile: the id is the last label fallback.
        ["loose", "loose", "terminal"],
      ],
    );
  });

  test("wall.paneKind sets the kind derived panes get", () => {
    write({ profiles: { work: { configDir: realDir("work") } }, wall: { paneKind: "terminal" } });
    assert.equal(wallView().panes[0].kind, "terminal");
  });

  // The loader's vocabulary is "name the exact place in the file". Each message
  // below is one a non-developer has to be able to act on.
  const rejects = [
    [{ profiles: { "Not A Slug": {} } }, /lowercase name .* at "profiles\.Not A Slug"/],
    [{ profiles: { work: "~/somewhere" } }, /expected an object at "profiles\.work"/],
    [{ profiles: { work: { configDir: 3 } } }, /non-empty string at "profiles\.work\.configDir"/],
    [{ wall: { paneKind: "hologram" } }, /one of: placeholder, terminal, browser at "wall\.paneKind"/],
    [{ wall: { panes: {} } }, /expected a list of panes at "wall\.panes"/],
    [{ wall: { panes: [{}] } }, /non-empty string at "wall\.panes\[0\]\.id"/],
    [{ wall: { panes: [{ id: "a" }, { id: "a" }] } }, /id no other pane uses at "wall\.panes\[1\]\.id"/],
    [{ wall: { panes: [{ id: "a", kind: "hologram" }] } }, /one of: placeholder/],
    [{ wall: { panes: [{ id: "a", profile: "ghost" }] } }, /configured profile \(have: none\) at "wall\.panes\[0\]\.profile"/],
  ];

  for (const [config, expected] of rejects) {
    test(`refuses ${JSON.stringify(config)}`, () => {
      write(config);
      assert.throws(() => loadConfig(), expected);
    });
  }

  test("the shipped example config parses, and ships no invented panes", () => {
    // The example is what a fresh clone runs on, and its $comment keys are the
    // spec the setup prompt reads. A typo in it is a broken first run. It is
    // COPIED into the temp root rather than read in place, so this asserts
    // against the tracked file and never against whatever local config the
    // machine running the tests happens to have.
    copyFileSync(
      path.join(originalCwd, "hub.config.example.json"),
      path.join(dir, "hub.config.example.json"),
    );
    resetConfigCache();
    const config = loadConfig();
    assert.deepEqual(config.wall.panes, []);
    assert.equal(config.wall.paneKind, "placeholder");
    // $example is a comment key, so the quad in it must NOT become real panes.
    assert.deepEqual(Object.keys(config.profiles), []);
  });
});
