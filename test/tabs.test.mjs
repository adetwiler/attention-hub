// TABS: the extension seam. Two things are covered here and both are load-bearing.
//
//   THE LOADER'S VERDICT on a `tabs` list, because these messages are the first
//   ones a non-developer will ever see from this product: adding a tab is the
//   first thing it asks anyone to do to their config.
//
//   CONTAINMENT. A tab's folder comes from config and the path inside it comes
//   from the request, and the second must never be able to leave the first. That
//   is asserted here against a real symlink, not reasoned about in a comment.
//
// The tab-config parsing lives in src/lib/config.ts and is exercised from here
// too, so the whole seam has one test file (the same arrangement as the wall).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const tabsMod = await loadTs("src/lib/tabs.ts");
const configMod = await loadTs("src/lib/config.ts");
const skip = tabsMod === null || configMod === null ? NO_TS : false;

describe("tabs", { skip }, () => {
  const { tabsViewWith, tabRoomWith } = tabsMod ?? {};
  const { loadConfig, resetConfigCache } = configMod ?? {};

  const originalCwd = process.cwd();
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hub-tabs-"));
    process.chdir(dir);
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    resetConfigCache();
  });

  const write = (obj) => writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(obj));
  const nav = () => tabsViewWith(loadConfig);
  const room = (slug, at = "") => tabRoomWith(loadConfig, slug, at);

  // --------------------------------------------------------------- the config

  test("no tabs is an honest empty nav, not a problem", () => {
    write({});
    const view = nav();
    assert.equal(view.problem, null);
    assert.deepEqual(view.tabs, []);
  });

  test("a name and a url is the whole of a tab, and the name becomes the address", () => {
    write({ tabs: [{ name: "YouTube", url: "https://youtube.example" }] });
    const view = nav();
    assert.equal(view.problem, null);
    assert.deepEqual(view.tabs, [
      { slug: "youtube", name: "YouTube", href: "/tab/youtube", kind: "url" },
    ]);
  });

  test("config order is nav order", () => {
    write({
      tabs: [
        { name: "One", url: "https://one.example" },
        { name: "Two", dir: "." },
        { name: "Three", url: "https://three.example" },
      ],
    });
    assert.deepEqual(
      nav().tabs.map((t) => t.name),
      ["One", "Two", "Three"],
    );
  });

  test("a two-word name becomes one slug, and an explicit id wins", () => {
    write({
      tabs: [
        { name: "My Notes!", dir: "." },
        { name: "Second Notes", id: "notes2", dir: "." },
      ],
    });
    assert.deepEqual(
      nav().tabs.map((t) => t.slug),
      ["my-notes", "notes2"],
    );
  });

  test("~ in a tab dir is expanded, and a relative one resolves against the hub", () => {
    write({ tabs: [{ name: "Home", dir: "~" }, { name: "Here", dir: "sub" }] });
    const tabs = loadConfig().tabs;
    assert.equal(path.isAbsolute(tabs[0].dir), true);
    assert.equal(tabs[1].dir, path.join(process.cwd(), "sub"));
  });

  // Every one of these is a sentence someone who has never written code has to
  // be able to act on, so the exact wording is pinned.
  const rejects = [
    [{ tabs: {} }, /expected a list of tabs at "tabs"/],
    [{ tabs: ["nope"] }, /expected an object at "tabs\[0\]"/],
    [{ tabs: [{ url: "https://x.example" }] }, /expected a non-empty name .* at "tabs\[0\]\.name"/],
    [{ tabs: [{ name: "" }] }, /expected a non-empty string at "tabs\[0\]\.name"/],
    // Both, and neither: a tab points at one thing.
    [
      { tabs: [{ name: "X", url: "https://x.example", dir: "~/x" }] },
      /never both \(a tab points at one thing\) at "tabs\[0\]"/,
    ],
    [{ tabs: [{ name: "X" }] }, /expected either a "url" .* or a "dir" .* at "tabs\[0\]"/],
    // A url that is not a web address would silently never open.
    [{ tabs: [{ name: "X", url: "youtube.com" }] }, /starting with http:\/\/ or https:\/\/ at "tabs\[0\]\.url"/],
    [{ tabs: [{ name: "X", url: "file:///etc" }] }, /starting with http:\/\/ or https:\/\/ at "tabs\[0\]\.url"/],
    // Two tabs at one address: the second would be unreachable.
    [
      { tabs: [{ name: "Notes", dir: "." }, { name: "notes", dir: "." }] },
      /already taken, so give this one an "id"\) at "tabs\[1\]"/,
    ],
    // A name with nothing an address can be made of, and the message offers the id.
    [{ tabs: [{ name: "!!!", dir: "." }] }, /a letter or a number in it, or an "id"/],
    [{ tabs: [{ name: "X", id: "Not A Slug", dir: "." }] }, /lowercase name of letters/],
  ];

  for (const [config, pattern] of rejects) {
    test(`refuses ${JSON.stringify(config)}`, () => {
      write(config);
      assert.throws(() => loadConfig(), pattern);
      // And the NAV reports it rather than throwing, because the nav is on the
      // page that explains the mistake.
      resetConfigCache();
      const view = nav();
      assert.equal(view.tabs.length, 0);
      assert.match(view.problem, pattern);
    });
  }

  // ----------------------------------------------------------------- the room

  test("an address that is not one of your tabs is reported, not thrown", () => {
    write({ tabs: [{ name: "Notes", dir: "." }] });
    const view = room("nope");
    assert.equal(view.tab, null);
    assert.equal(view.problem, null);
  });

  test("a url tab carries its address and reads no filesystem", () => {
    write({ tabs: [{ name: "YouTube", url: "https://youtube.example" }] });
    const view = room("youtube");
    assert.equal(view.url, "https://youtube.example");
    assert.deepEqual(view.entries, []);
    assert.equal(view.problem, null);
  });

  test("BROKEN IS NOT EMPTY: a folder that is not there names the key to fix", () => {
    write({ tabs: [{ name: "Notes", dir: "not-here" }] });
    const view = room("notes");
    // The tab still exists, so it stays in the nav.
    assert.equal(view.tab.name, "Notes");
    assert.match(view.problem, /does not exist/);
    assert.match(view.problem, /"tabs\[0\]\.dir"/);
    assert.deepEqual(view.entries, []);
  });

  test("a dir that is a file says so, and still names the key", () => {
    writeFileSync(path.join(dir, "notes"), "not a folder");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    assert.match(room("notes").problem, /is not a folder.*"tabs\[0\]\.dir"/s);
  });

  test("folders first, then files, and nothing is hidden", () => {
    mkdirSync(path.join(dir, "notes", "sub"), { recursive: true });
    writeFileSync(path.join(dir, "notes", "b.md"), "# b");
    writeFileSync(path.join(dir, "notes", "a.txt"), "a");
    writeFileSync(path.join(dir, "notes", ".hidden"), "still yours");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes");
    assert.equal(view.problem, null);
    assert.deepEqual(
      view.entries.map((e) => [e.name, e.kind]),
      [
        ["sub", "dir"],
        [".hidden", "file"],
        ["a.txt", "file"],
        ["b.md", "file"],
      ],
    );
    assert.equal(view.up, null); // at the tab's own root there is no up
  });

  test("an empty folder is empty, and that is not a problem", () => {
    mkdirSync(path.join(dir, "notes"));
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes");
    assert.deepEqual(view.entries, []);
    assert.equal(view.problem, null);
  });

  test("walking into a subfolder gives a way back up", () => {
    mkdirSync(path.join(dir, "notes", "sub", "deep"), { recursive: true });
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    assert.equal(room("notes", "sub").up, "/tab/notes");
    assert.equal(room("notes", "sub/deep").up, "/tab/notes?path=sub");
  });

  test("a markdown file is reported as markdown, and rendering is the page's job", () => {
    mkdirSync(path.join(dir, "notes"));
    writeFileSync(path.join(dir, "notes", "note.md"), "# hello");
    writeFileSync(path.join(dir, "notes", "plain.txt"), "hello");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    assert.deepEqual(
      [room("notes", "note.md").file.markdown, room("notes", "plain.txt").file.markdown],
      [true, false],
    );
    assert.equal(room("notes", "note.md").file.text, "# hello");
  });

  test("a file that is not text says so rather than showing you noise", () => {
    mkdirSync(path.join(dir, "notes"));
    writeFileSync(path.join(dir, "notes", "shot.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes", "shot.png");
    assert.equal(view.file, null);
    assert.match(view.problem, /not a text file/);
  });

  // --------------------------------------------------------- containment

  test("a path that climbs out of the folder reads nothing", () => {
    mkdirSync(path.join(dir, "notes"));
    writeFileSync(path.join(dir, "secret.txt"), "not yours");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    for (const attempt of ["../secret.txt", "sub/../../secret.txt", "..", "../"]) {
      const view = room("notes", attempt);
      assert.equal(view.file, null, attempt);
      assert.match(view.problem, /outside/, attempt);
    }
  });

  test("an absolute path in the request is not an address the tab honours", () => {
    mkdirSync(path.join(dir, "notes"));
    writeFileSync(path.join(dir, "secret.txt"), "not yours");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes", path.join(dir, "secret.txt"));
    assert.equal(view.file, null);
    assert.match(view.problem, /outside/);
  });

  test("a SIBLING folder whose name STARTS WITH the tab's name is still outside", () => {
    // The classic containment bug: comparing with a bare string prefix lets
    // /notes-private through for a tab rooted at /notes, because the first is
    // literally prefixed by the second. Comparing against root + separator is
    // what makes this pass, so it is worth pinning rather than assuming.
    mkdirSync(path.join(dir, "notes"));
    mkdirSync(path.join(dir, "notes-private"));
    writeFileSync(path.join(dir, "notes-private", "secret.txt"), "not yours");
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes", "../notes-private/secret.txt");
    assert.equal(view.file, null);
    assert.match(view.problem, /outside/);
  });

  test("a SYMLINK out of the folder is refused, because the check is real", () => {
    mkdirSync(path.join(dir, "notes"));
    writeFileSync(path.join(dir, "secret.txt"), "not yours");
    symlinkSync(path.join(dir, "secret.txt"), path.join(dir, "notes", "escape.txt"));
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes", "escape.txt");
    assert.equal(view.file, null);
    assert.match(view.problem, /outside/);
  });

  test("a missing file inside the folder is a miss, not an escape", () => {
    mkdirSync(path.join(dir, "notes"));
    write({ tabs: [{ name: "Notes", dir: "notes" }] });
    const view = room("notes", "gone.md");
    assert.equal(view.file, null);
    assert.match(view.problem, /is not in/);
  });
});
