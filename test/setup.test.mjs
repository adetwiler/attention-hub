// SETUP: the steps, their prompts, and what the badges claim about your config.
//
// Three things are worth a test here and the third is the reason the file exists.
//
//   THE STEPS ARE WELL FORMED. A step with no prompt and no manual fallback is a
//   step that helps nobody, and this page is the one a stranger meets first.
//
//   THE BADGES TELL THE TRUTH. "on" when it is on, "off" when it is off, and
//   UNKNOWN when the config could not be read. That last one is BROKEN IS NOT
//   EMPTY applied to setup: a config the hub cannot parse must never render as a
//   tidy "not set up yet", because the user would go and set up what is already
//   set up.
//
//   THE HERO PROMPT HAS EXACTLY ONE COPY. readSetupPrompt reads prompt.txt off
//   disk at request time, and nothing in the tree embeds that text. That is the
//   reason this repo needs no prompt-sync gate: there is nothing to sync. If a
//   second copy ever appears, the last test in here is the one that should have
//   stopped it.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, NO_TS } from "./_ts.mjs";

const setupMod = await loadTs("src/lib/setup.ts");
const skip = setupMod === null ? NO_TS : false;

// The repo root: this file's own parent's parent, the same rule test/_ts.mjs uses.
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** A config object with only the fields setupStates reads. Hand built rather
 * than loaded, so this suite says nothing about the loader and everything about
 * the page's claims. */
function fakeConfig(over = {}) {
  return {
    adapters: { default: null, agents: {} },
    tabs: [],
    browser: { profiles: [] },
    terminal: { enabled: false },
    bind: { allowedDevOrigins: [] },
    email: { enabled: false, to: null, from: null, apiKeyFile: null },
    ...over,
  };
}

describe("setup steps", { skip }, () => {
  const { SETUP_STEPS } = setupMod ?? {};

  test("every step has a title, a lede and a manual fallback", () => {
    for (const step of SETUP_STEPS) {
      assert.ok(step.title.length > 0, `${step.id} has no title`);
      assert.ok(step.lede.length > 20, `${step.id} has no lede`);
      assert.ok(step.manual.length > 0, `${step.id} has no manual fallback`);
    }
  });

  test("every step except the config one carries its own prompt", () => {
    for (const step of SETUP_STEPS) {
      if (step.id === "config") {
        // Deliberately empty: its prompt is prompt.txt, read at request time.
        assert.equal(step.prompt, "");
        continue;
      }
      assert.ok(step.prompt.length > 100, `${step.id} has no prompt`);
    }
  });

  test("exactly one step is required, and it is the config", () => {
    const required = SETUP_STEPS.filter((step) => step.required);
    assert.deepEqual(
      required.map((step) => step.id),
      ["config"],
    );
  });

  test("no prompt contains a scheme-bearing URL", () => {
    // The network gate reads one line at a time and a marker cannot live inside
    // a template literal, so a scheme in this file would have to be excused by a
    // marker that lies about the line. Bare domains say the same thing and are
    // also more honest: nothing here is fetched.
    for (const step of SETUP_STEPS) {
      assert.ok(!/https?:\/\//.test(step.prompt), `${step.id}'s prompt contains a URL scheme`);
    }
  });

  test("the terminal prompt refuses to switch anything on without a yes", () => {
    const terminal = SETUP_STEPS.find((step) => step.id === "terminal");
    assert.match(terminal.prompt, /real shell/i);
    assert.match(terminal.prompt, /wait for me to say/i);
    assert.match(terminal.prompt, /macOS and Linux only/i);
  });

  test("the email prompt puts the key in a file and never in the config", () => {
    const email = SETUP_STEPS.find((step) => step.id === "email");
    assert.match(email.prompt, /never into hub\.config\.json/i);
    assert.match(email.prompt, /apiKeyFile/);
    assert.match(email.prompt, /dry-run/);
  });

  test("the reach prompt bans the two things that would open the hub up", () => {
    const reach = SETUP_STEPS.find((step) => step.id === "reach");
    assert.match(reach.prompt, /0\.0\.0\.0/);
    assert.match(reach.prompt, /funnel/);
  });
});

describe("setup states", { skip }, () => {
  const { setupStates } = setupMod ?? {};

  test("a fresh config is off everywhere, and says so in plain words", () => {
    const states = setupStates(fakeConfig());
    assert.deepEqual(
      states.map((s) => s.state),
      ["off", "off", "off", "off", "off", "off"],
    );
    for (const state of states) assert.ok(state.note.length > 0);
  });

  test("BROKEN IS NOT EMPTY: an unreadable config is unknown, never off", () => {
    const states = setupStates(null);
    for (const state of states) {
      assert.equal(state.state, "unknown");
      assert.match(state.note, /could not be read/);
    }
  });

  test("each step reads the key that actually decides it", () => {
    const on = setupStates(
      fakeConfig({
        adapters: { default: "your-tool", agents: {} },
        tabs: [{ slug: "notes" }],
        browser: { profiles: [{ id: "work" }] },
        terminal: { enabled: true },
        bind: { allowedDevOrigins: ["hub.example"] },
        email: { enabled: true, to: "you@example.com", from: "hub@example.com", apiKeyFile: "/tmp/k" },
      }),
    );
    assert.deepEqual(
      on.map((s) => s.state),
      ["on", "on", "on", "on", "on", "on"],
    );
    assert.match(on.find((s) => s.id === "config").note, /your-tool/);
    assert.match(on.find((s) => s.id === "email").note, /you@example\.com/);
  });

  test("an enabled email digest with nothing to send to says INCOMPLETE", () => {
    const states = setupStates(fakeConfig({ email: { enabled: true, to: null, from: null, apiKeyFile: null } }));
    const email = states.find((s) => s.id === "email");
    assert.equal(email.state, "on");
    assert.match(email.note, /incomplete/i);
  });
});

describe("the hero prompt has exactly one copy", { skip }, () => {
  const { readSetupPrompt, SETUP_PROMPT_FILE } = setupMod ?? {};

  test("it is read from the file, not embedded", () => {
    const text = readSetupPrompt(repoRoot);
    assert.ok(text !== null, `${SETUP_PROMPT_FILE} should exist at the top of the repo`);
    assert.match(text, /hub\.config\.example\.json/);
  });

  test("a missing file is null, never an empty string", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-setup-"));
    try {
      assert.equal(readSetupPrompt(dir), null);
      writeFileSync(path.join(dir, SETUP_PROMPT_FILE), "   \n");
      assert.equal(readSetupPrompt(dir), null, "a whitespace-only prompt is also nothing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NOTHING IN THE TRACKED TREE EMBEDS THE PROMPT TEXT", () => {
    // The gate this repo would otherwise need, as a test. A distinctive line of
    // prompt.txt must appear in exactly one tracked file: prompt.txt itself.
    // Add a second copy anywhere (a component, a doc, the site mock) and this
    // fails, which is the moment to either read the file instead or port a real
    // prompt-sync gate.
    const needle = "NEVER edit hub.config.example.json";
    let out = "";
    try {
      out = execFileSync("git", ["grep", "-l", "-F", needle], { cwd: repoRoot, encoding: "utf8" });
    } catch (err) {
      // git grep exits 1 when nothing matches, which would mean prompt.txt does
      // not contain the line any more. That is a real failure, not a skip.
      if (err.status === 1) assert.fail(`no tracked file contains "${needle}"`);
      return; // no git available: this assertion cannot be made, and says so by not making it
    }
    const files = out.split("\n").filter((line) => line.length > 0);
    assert.deepEqual(files, ["prompt.txt"], `the prompt text is duplicated in: ${files.join(", ")}`);
  });
});
