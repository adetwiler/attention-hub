// The stylesheet's braces must balance, and this test exists because they did not.
//
// WHAT HAPPENED (2026-07-29). Merging two slices that had both appended to
// globals.css dropped ONE closing brace, on `.doc hr`. Everything after it, about
// three thousand lines covering the wall, the browser pane, the terminal, the tab
// seam and the setup page, became NESTED inside that rule. Modern CSS nesting is
// real, so the browser did not complain: it dutifully computed selectors like
// `.doc hr .wishes` and matched nothing. The page rendered with default list
// bullets and run-together text.
//
// WHY NOTHING ELSE CAUGHT IT. `tsc` does not read CSS. The unit tests do not read
// CSS. `next build` compiled it happily, because it IS valid CSS, just nested
// somewhere useless. `check-paths` looks for absolute paths. Five green gates and
// a large part of the product's styling was dead. A brace is one character and it
// silently disabled a third of the stylesheet.
//
// So this is the cheapest possible check for the most expensive kind of mistake,
// and it names the unclosed selector rather than just reporting a count, because
// "depth 1 at EOF" tells you nothing about where to look.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every .css file we ship, found rather than listed, so a new one is covered the
 * day it lands instead of the day someone remembers this file exists. */
function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/** Walk the text tracking brace depth, ignoring comments and strings, and return
 * the stack of blocks still open at the end. */
function unclosed(src) {
  const stack = [];
  let i = 0;
  let lineNo = 1;
  let lineStart = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\n") {
      lineNo += 1;
      lineStart = i + 1;
      i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const skipped = src.slice(i, end === -1 ? src.length : end + 2);
      lineNo += skipped.split("\n").length - 1;
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < src.length && src[i] !== ch) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === "{") {
      // The selector is whatever precedes the brace back to the last delimiter.
      const before = src.slice(0, i);
      const cut = Math.max(before.lastIndexOf("}"), before.lastIndexOf(";"), before.lastIndexOf("*/"));
      const selector = before.slice(cut + 1).trim().replace(/\s+/g, " ");
      stack.push({ line: lineNo, selector: selector.slice(0, 80) });
    } else if (ch === "}") {
      stack.pop();
    }
    i += 1;
  }
  return stack;
}

describe("stylesheet braces", () => {
  const files = cssFiles(path.join(repoRoot, "src"));

  test("there is at least one stylesheet to check", () => {
    assert.ok(files.length > 0, "found no .css under src/, so this test is not testing anything");
  });

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    test(`${rel} closes every block it opens`, () => {
      const open = unclosed(readFileSync(file, "utf8"));
      const detail = open.map((b) => `  line ${b.line}: ${b.selector} {`).join("\n");
      assert.equal(
        open.length,
        0,
        `${rel} ends with ${open.length} block(s) still open, so every rule after the first one is nested inside it and matches nothing:\n${detail}`,
      );
    });
  }
});
