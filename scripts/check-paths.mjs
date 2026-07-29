#!/usr/bin/env node
// check-paths: the mechanism behind "every path and port comes from config".
//
// A dependency-free lint wired into three places: the `check` npm script, the
// pre-commit hook, and .githooks/release-check.sh. (Unit tests live in test/
// and run on node:test, which ships with Node and costs no dependency.)
//
// It scans src/ and scripts/ for:
//   1. absolute home paths on any of the three platforms,
//   2. absolute volume roots,
//   3. port numbers written into code instead of read from hub.config.json.
//
// Exit 0 clean, exit 1 with a report. Run: node scripts/check-paths.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOTS = ["src", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx", ".css"]);

// A line carrying this marker is a deliberate, reviewed exception.
const ALLOW = "check-paths-allow:";

const RULES = [
  {
    label: "absolute home path",
    // Split so this file does not trip its own scan.
    re: new RegExp("/" + "Users/[A-Za-z0-9._-]+|/" + "home/[A-Za-z0-9._-]+|[A-Za-z]:[\\\\/]+Users[\\\\/]+", "i"),
    why: "Read it from hub.config.json and expand ~ with expandPath().",
  },
  {
    label: "absolute volume root",
    re: new RegExp("/" + "Volumes/|/" + "mnt/[a-z]/", "i"),
    why: "Read it from hub.config.json.",
  },
  {
    label: "hardcoded port",
    // A port in a URL, or a port-shaped number assigned to ANY identifier whose
    // name contains "port".
    //
    // The identifier half used to read \bport\s*[:=]\s*\d{2,5}, which cannot
    // match a constant like DEFAULT_PORT or BIND_PORT_DEFAULT, because
    // underscore is a word character so \b never lands before PORT. The script
    // therefore printed "no hardcoded ports" over a tree that had the default
    // port number written into it twice, in the two files that matter. A
    // gate that greens on its own counterexample is worse than no gate: it
    // manufactures confidence. The two legitimate default constants now carry
    // the check-paths-allow marker, which is what that marker is for.
    re: /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}|[A-Za-z_]*port[A-Za-z_]*\s*[:=]\s*\d{2,5}/i,
    why: "Read it from hub.config.json (config.bind.port).",
  },
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // an optional root that does not exist yet is not a failure
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const root of ROOTS) walk(path.join(repoRoot, root), files);

const findings = [];
for (const file of files) {
  const rel = path.relative(repoRoot, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ rel, line: i + 1, label: rule.label, why: rule.why, text: line.trim() });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("check-paths FAILED. Code must take every path and port from config.");
  console.error("");
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  [${f.label}]`);
    console.error(`    ${f.text}`);
    console.error(`    ${f.why}`);
  }
  console.error("");
  console.error(`A reviewed exception carries the marker: ${ALLOW} <why>`);
  process.exit(1);
}

console.log(`check-paths clean: ${files.length} files, no absolute paths or hardcoded ports.`);
