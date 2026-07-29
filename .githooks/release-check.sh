#!/usr/bin/env bash
#
# release-check.sh: the one command to run before this repo ships anywhere
# public (a batch push, a release). It answers the questions the per-commit hook
# cannot answer alone:
#
#   SAFE:     does the whole tracked tree contain anything it should not
#             (denylisted terms, emails, home paths, em dashes)?
#   HONEST:   does src/ still take every path and port from config, do the three
#             copies of the default port agree, and does every path to Next.js
#             still run through the one boot script that disables telemetry?
#   ACCURATE: do the docs still point at files that exist?
#
#   bash .githooks/release-check.sh
#   bash .githooks/release-check.sh --generic-only   (CI: skips the denylist half)
#
# SCOPE NOTE: git grep only sees TRACKED files. Green means "what would ship is
# clean", not "the working directory is clean".
#
# Every check here is OFFLINE on purpose. A gate that needs the network is a
# gate that gets skipped, and this is a product whose promise is that it does
# not make network calls.

set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

generic_only=""
[ "${1:-}" = "--generic-only" ] && generic_only="--generic-only"

fail=0
say_fail() { echo "FAIL: $*"; fail=1; }

# --- 1. Content audit --------------------------------------------------------
if bash .githooks/content-audit.sh $generic_only; then :; else say_fail "content audit found matches (see above)"; fi

# --- 2. Whole-tree em-dash scan ----------------------------------------------
# Em dash only (en dash is legit typography for ranges). Byte escape so this
# file never contains the character it bans.
EMDASH="$(printf '\342\200\224')"
dash_hits="$(git grep -I -n -F -e "$EMDASH" -- . 2>/dev/null || true)"
if [ -n "$dash_hits" ]; then
  say_fail "em dash in the tracked tree:"
  printf '%s\n' "$dash_hits" | sed 's/^/  /'
fi

# --- 3. Config-first check ---------------------------------------------------
# Same rule the pre-commit hook enforces per commit, run over the whole tree.
if command -v node >/dev/null 2>&1; then
  if node scripts/check-paths.mjs; then :; else say_fail "check-paths found hardcoded paths or ports (see above)"; fi
else
  echo "NOTE: node not found, skipped the config-first check."
fi

# --- 4. Dead relative markdown links ----------------------------------------
# Links inside fenced code blocks are examples, not links; skip those lines.
dead_links=""
while IFS= read -r md; do
  targets="$(awk '/^```/ { fence = !fence; next } !fence { print }' "$md" \
    | grep -oE '\]\([^)#]+[^)]*\)' | sed 's/^](//; s/)$//; s/#.*//' || true)"
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    case "$t" in http://*|https://*|mailto:*) continue ;; esac
    dir="$(dirname "$md")"
    if [ ! -e "$dir/$t" ] && [ ! -e "$t" ]; then dead_links="${dead_links}
  $md -> $t"; fi
  done <<< "$targets"
done < <(git ls-files '*.md')
if [ -n "$dead_links" ]; then say_fail "dead relative links:${dead_links}"; fi

# --- 5. Config example agreement --------------------------------------------
# hub.config.json is gitignored (it is the user's file). The tracked example is
# what a fresh install reads, so it must at least be valid JSON with the keys
# the loader documents. This gates the CONTENT of the artifact, not its mtime:
# a freshness check would pass on a file whose every key had been renamed.
if command -v node >/dev/null 2>&1; then
  if node -e '
    const fs = require("node:fs");
    const raw = JSON.parse(fs.readFileSync("hub.config.example.json", "utf8"));
    const required = ["bind", "dataDir", "hub", "update", "modules", "adapters"];
    const missing = required.filter((k) => !(k in raw));
    if (missing.length > 0) { console.error("hub.config.example.json is missing keys: " + missing.join(", ")); process.exit(1); }
    if (typeof raw.bind.host !== "string" || raw.bind.host !== "127.0.0.1") { console.error("hub.config.example.json must ship bind.host = 127.0.0.1 (local only by default)"); process.exit(1); }
    if (raw.update.enabled !== false && raw.update.enabled !== true) { console.error("hub.config.example.json update.enabled must be a boolean"); process.exit(1); }

    // The default port is written in three files on purpose (the boot script
    // must know it before the TypeScript loader exists, and the example config
    // must show it). Three copies drift, so this asserts they agree. A drift
    // here binds one port while the app believes another, which presents as
    // "the page never loads" and has no error anywhere.
    const port = raw.bind.port;
    if (!Number.isInteger(port)) { console.error("hub.config.example.json bind.port must be a whole number"); process.exit(1); }
    const sources = { "scripts/serve.mjs": /DEFAULT_PORT\s*=\s*(\d+)/, "src/lib/config.ts": /BIND_PORT_DEFAULT\s*=\s*(\d+)/ };
    for (const [file, re] of Object.entries(sources)) {
      const m = re.exec(fs.readFileSync(file, "utf8"));
      if (m === null) { console.error("could not find the default port constant in " + file); process.exit(1); }
      if (Number(m[1]) !== port) { console.error(file + " default port " + m[1] + " disagrees with hub.config.example.json bind.port " + port); process.exit(1); }
    }

    // THE BROWSER SIDECAR PORT IS THE SAME PROBLEM AGAIN. It is written in three
    // places for the same reason: the sidecar (chrome/server.mjs) boots without the
    // TypeScript loader, so it cannot import the constant, and the example config
    // has to show the value. A drift here means the hub probes one port while the
    // sidecar listens on another, and the symptom is a pane that says the sidecar is
    // not running while it is running perfectly.
    const browserPort = raw.browser === undefined ? undefined : raw.browser.sidecarPort;
    if (browserPort !== undefined) {
      if (!Number.isInteger(browserPort)) { console.error("hub.config.example.json browser.sidecarPort must be a whole number"); process.exit(1); }
      if (browserPort === port) { console.error("hub.config.example.json browser.sidecarPort must differ from bind.port, or the two servers fight over one port"); process.exit(1); }
      const browserSources = { "src/lib/config.ts": /BROWSER_PORT_DEFAULT\s*=\s*(\d+)/, "chrome/server.mjs": /sidecarPort\s*\?\?\s*(\d+)/ };
      for (const [file, re] of Object.entries(browserSources)) {
        const m = re.exec(fs.readFileSync(file, "utf8"));
        if (m === null) { console.error("could not find the sidecar port default in " + file); process.exit(1); }
        if (Number(m[1]) !== browserPort) { console.error(file + " sidecar port " + m[1] + " disagrees with hub.config.example.json browser.sidecarPort " + browserPort); process.exit(1); }
      }
    }

    // THE BROWSER PROFILE LIST MUST SHIP EMPTY. It names data directories and
    // debugging ports on a machine we know nothing about, and a shipped row would be
    // invented data in the file a fresh clone actually reads: the pane would offer a
    // profile that does not exist. The worked example lives beside it under a $ key,
    // which the loader ignores.
    if (raw.browser !== undefined && Array.isArray(raw.browser.profiles) && raw.browser.profiles.length > 0) {
      console.error("hub.config.example.json browser.profiles must ship EMPTY (use $profilesExample for the worked example)");
      process.exit(1);
    }
  '; then :; else say_fail "hub.config.example.json failed its shape check"; fi
fi

# --- 5b. The terminal sidecar's port and its OFF switch ----------------------
# The sidecar's port is written in three places for the same reason the hub's is
# (a plain .mjs that runs before any TypeScript exists, plus the example config a
# fresh install reads), so the same assertion applies: a drift here has the
# sidecar listening on a port the app never points at, which presents as "the
# terminal never connects" with no error anywhere.
#
# The second half is the one that matters more. terminal.enabled MUST ship false.
# A stranger's first install cannot come with a browser shell already open, and
# that is a permanent rule, not a default someone may tidy up later.
if command -v node >/dev/null 2>&1; then
  if node -e '
    const fs = require("node:fs");
    const raw = JSON.parse(fs.readFileSync("hub.config.example.json", "utf8"));
    const terminal = raw.terminal;
    if (typeof terminal !== "object" || terminal === null) { console.error("hub.config.example.json has no terminal section"); process.exit(1); }
    if (terminal.enabled !== false) { console.error("hub.config.example.json must ship terminal.enabled = false: a first install never comes with a browser shell open"); process.exit(1); }
    const port = terminal.port;
    if (!Number.isInteger(port)) { console.error("hub.config.example.json terminal.port must be a whole number"); process.exit(1); }
    const sources = { "pty/server.mjs": /DEFAULT_PORT\s*=\s*(\d+)/, "src/lib/config.ts": /TERMINAL_PORT_DEFAULT\s*=\s*(\d+)/ };
    for (const [file, re] of Object.entries(sources)) {
      const m = re.exec(fs.readFileSync(file, "utf8"));
      if (m === null) { console.error("could not find the sidecar port constant in " + file); process.exit(1); }
      if (Number(m[1]) !== port) { console.error(file + " sidecar port " + m[1] + " disagrees with hub.config.example.json terminal.port " + port); process.exit(1); }
    }
    // The permanent owner-only rule lives in the module manifest in code, so the
    // gate reads it there rather than trusting a sentence in a doc.
    const lib = fs.readFileSync("src/lib/terminal.ts", "utf8");
    if (!/ownerOnly:\s*true/.test(lib)) { console.error("src/lib/terminal.ts: TERMINAL_MODULE.ownerOnly must stay true. It is a permanent rule, not a v1 limitation."); process.exit(1); }
    if (!/enabledByDefault:\s*false/.test(lib)) { console.error("src/lib/terminal.ts: TERMINAL_MODULE.enabledByDefault must stay false."); process.exit(1); }
  '; then :; else say_fail "the terminal module failed its port and default check"; fi
fi

# --- 6. Nothing spawns Next.js outside the one boot path ---------------------
# scripts/next-run.mjs is where NEXT_TELEMETRY_DISABLED is set. A package.json
# script that calls `next` directly bypasses it and phones Vercel on the exact
# command the README tells users to run. That is not hypothetical: `"build":
# "next build"` shipped in the first draft of this repo while four other entry
# points closed the switch correctly, and the product's headline promise is
# that it sends nothing.
if command -v node >/dev/null 2>&1; then
  if node -e '
    const fs = require("node:fs");
    const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
    const bad = Object.entries(scripts).filter(([, cmd]) => /(^|[^-\w])next\s/.test(cmd));
    if (bad.length > 0) {
      console.error("package.json scripts invoke next directly, bypassing the telemetry switch:");
      for (const [name, cmd] of bad) console.error("  " + name + ": " + cmd);
      console.error("Route it through scripts/next-run.mjs (see scripts/build.mjs).");
      process.exit(1);
    }
  '; then :; else say_fail "a package.json script bypasses the Next.js boot path"; fi
fi

# --- 7. The test script runs on every supported Node ------------------------
# `node --test test/` accepts a directory on Node 20 and 22 and REFUSES it on
# Node 24, where positional arguments became globs: it reports
# "Cannot find module .../test" and every test stops running. That shipped here,
# because the verify walk ran bare `node --test` and never ran `npm test`.
# Bare `node --test` finds the same files on 20 through 24, so the rule is that
# the test script passes no positional path at all.
if command -v node >/dev/null 2>&1; then
  if node -e '
    const fs = require("node:fs");
    const cmd = (JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {}).test ?? "";
    const rest = cmd.replace(/^node\s+/, "").split(/\s+/).filter((a) => a !== "" && !a.startsWith("-"));
    if (rest.length > 0) {
      console.error("the test script passes a positional path to node --test: " + cmd);
      console.error("Node 24 reads it as a glob and matches nothing, so the suite silently stops running.");
      console.error("Use bare `node --test`, which resolves the same files on Node 20 through 24.");
      process.exit(1);
    }
  '; then :; else say_fail "the test script does not run on every supported Node"; fi
fi

echo ""
if [ "$fail" -ne 0 ]; then
  echo "RELEASE CHECK FAILED. Fix the items above before anything ships."
  exit 1
fi
echo "Release check clean: tree is safe, src is config-first, links resolve."
exit 0
