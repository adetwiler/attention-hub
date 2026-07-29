// What the browser pane's address box means by what you typed.
//
// It earns a test because it is pure, because it is full of edge cases, and because it is the
// one piece of the browser pane that BOTH the server and the client run. A disagreement here
// would mean opening a pane and navigating in one sent you to two different places.
//
// src/lib/weburl.ts imports nothing, deliberately: Node's native type stripping does not
// resolve an extensionless relative import the way the bundler does, so a runtime
// project-internal import in a module under test takes the whole suite file down with
// ERR_MODULE_NOT_FOUND. See test/README.md.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/weburl.ts");

describe("resolveInput", { skip: mod === null ? NO_TS : false }, () => {
  const { resolveInput } = mod ?? {};
  const targets = { homeUrl: "https://home.example", searchUrl: "https://search.example/?q={}" };

  test("empty input goes home", () => {
    assert.equal(resolveInput("", targets), targets.homeUrl);
    assert.equal(resolveInput("   ", targets), targets.homeUrl);
  });

  test("a full URL is passed through untouched", () => {
    for (const url of [
      "https://example.com/a/b?c=d#e",
      "http://example.com",
      "file:///tmp/notes.html",
      "about:blank",
      "view-source:https://example.com",
    ]) {
      assert.equal(resolveInput(url, targets), url);
    }
  });

  test("the scheme test is case insensitive, because address bars are", () => {
    assert.equal(resolveInput("HTTPS://Example.com", targets), "HTTPS://Example.com");
  });

  test("a bare host becomes https", () => {
    assert.equal(resolveInput("example.com", targets), "https://example.com");
    assert.equal(resolveInput("example.com/path", targets), "https://example.com/path");
    assert.equal(resolveInput("sub.example.co.uk?a=1", targets), "https://sub.example.co.uk?a=1");
  });

  test("a phrase is searched, not turned into a hostname", () => {
    assert.equal(resolveInput("how do i park a window", targets), "https://search.example/?q=how%20do%20i%20park%20a%20window");
  });

  test("a single word with no dot is a search, not a host", () => {
    // "localhost" typed alone is ambiguous and a search is the safer read: a wrong guess at a
    // hostname is a DNS error, while a wrong guess at a search is one extra click.
    assert.equal(resolveInput("roadmap", targets), "https://search.example/?q=roadmap");
  });

  test("a dotted thing WITH spaces is a search, not a host", () => {
    // "example.com and friends" is a phrase. Splicing it into a URL produced a request for a
    // host nobody has, which is the exact failure the address box used to show.
    assert.equal(resolveInput("example.com and friends", targets).startsWith("https://search.example/?q="), true);
  });

  test("a query is url encoded, including the characters that break a URL", () => {
    assert.equal(resolveInput("a&b=c d#e", targets), "https://search.example/?q=a%26b%3Dc%20d%23e");
  });

  test("input is trimmed before anything else looks at it", () => {
    assert.equal(resolveInput("  example.com  ", targets), "https://example.com");
  });

  test("javascript: is NOT treated as a scheme to relay", () => {
    // The address box is a place a human types, and a scheme that executes in the page is not
    // something to hand to a browser on their behalf. It falls through to a search.
    const out = resolveInput("javascript:alert(1)", targets);
    assert.equal(out.startsWith("https://search.example/?q="), true);
    assert.equal(out.includes("javascript%3A"), true);
  });

  test("the search template is honoured wherever the placeholder sits", () => {
    assert.equal(
      resolveInput("cats", { homeUrl: "x", searchUrl: "https://s.example/find/{}/results" }),
      "https://s.example/find/cats/results",
    );
  });
});
