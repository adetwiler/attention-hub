#!/usr/bin/env node
// KEEP THE HUB ITSELF RUNNING, across a logout and a reboot.
//
// Usage:
//   node deploy/hub/install.mjs            install and start it
//   node deploy/hub/install.mjs --print    show the unit file and change nothing
//   node deploy/hub/install.mjs --remove   stop it and take it away
//
// Optional, and deliberately so: `./start.sh` in a terminal is the whole product. This exists
// because a hand-started hub dies with whatever terminal or login session started it, and the
// hub is a thing you want waiting for you rather than a thing you remember to launch.
//
// This is the sibling of deploy/browser/install.mjs, which covers the browser sidecar only.
// Labels sit next to each other on purpose: `attention-hub` and `attention-hub-browser`.
//
// IT IS A USER SERVICE, NEVER A SYSTEM ONE. The hub reads and writes files in your home
// directory as you, and it is reached at loopback on your own machine. A root service would
// own its data as root and hand you a database you cannot write. So: launchd LaunchAgent on
// macOS, systemd --user unit on Linux, no sudo either way.
//
// The paths are computed HERE, at install time, from where this repo actually is, and written
// into the generated file. That is why this is a script and not a checked-in plist: a service
// definition needs absolute paths, and absolute paths are exactly what must never be committed
// to this repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const LABEL = "attention-hub";
const mode = process.argv.includes("--remove") ? "remove" : process.argv.includes("--print") ? "print" : "install";

function die(message) {
  console.error(`[install] ${message}`);
  process.exit(1);
}

/** The node that is running this is the node the service should run, absolute, because a
 * service manager's PATH does not include a version manager's shims. */
const nodeBin = process.execPath;

/** The major from an engines range like ">=22". Null if unreadable. Same parse as serve.mjs. */
function requiredNodeMajor() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
    const range = pkg?.engines?.node;
    if (typeof range !== "string") return null;
    const match = range.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Where the hub will answer, for the closing message. Never used to bind: serve.mjs does that. */
function hubAddress() {
  for (const file of ["hub.config.json", "hub.config.example.json"]) {
    const full = path.join(appRoot, file);
    if (!existsSync(full)) continue;
    try {
      const raw = JSON.parse(readFileSync(full, "utf8"));
      const host = typeof raw?.bind?.host === "string" ? raw.bind.host : null;
      const port = Number.isInteger(raw?.bind?.port) ? raw.bind.port : null;
      if (host || port) return { host, port };
    } catch {
      // fall through
    }
  }
  return { host: null, port: null };
}

// Refuse to install a service that cannot run. A supervisor restarting something that segfaults
// on every request is the exact failure this whole change exists to stop, and installing it into
// that state would be the worst possible time to find out.
const floor = requiredNodeMajor();
const running = Number(process.versions.node.split(".")[0]);
if (floor !== null && running < floor) {
  die(
    `this node is ${process.versions.node} and the hub needs ${floor} or newer. ` +
      `Installing now would supervise a process that crashes on every request. ` +
      `Switch node, run: npm rebuild better-sqlite3, then install.`,
  );
}

// A production start builds on demand, but a service is a bad place to discover that: the first
// boot would sit there compiling while the supervisor decides it is unhealthy.
if (!existsSync(path.join(appRoot, ".next", "BUILD_ID"))) {
  console.log("[install] note: there is no production build yet, so the first start will build");
  console.log("[install] one, which takes a minute. Run `npm run build` first if you would");
  console.log("[install] rather that not happen under the supervisor.");
  console.log("");
}

const { host, port } = hubAddress();
console.log(`[install] hub at ${appRoot}`);
console.log(`[install] node   ${nodeBin}`);
console.log(`[install] serves http://${host ?? "127.0.0.1"}:${port ?? 2886}`); // check-paths-allow: printed for the user, never bound here
console.log("");

// A version-manager node is pinned to one version, and the next upgrade deletes the directory
// out from under the service. It keeps working until it silently does not, so say it out loud.
if (/\/\.(nvm|asdf|fnm|volta|nodenv|n)\//.test(nodeBin) || /\/versions\/node\//.test(nodeBin)) {
  console.log("[install] WARNING: that node path belongs to a version manager, so it is pinned to");
  console.log("[install] one version. When you next upgrade Node that directory disappears, the");
  console.log("[install] service fails to start, and the supervisor retries something that cannot");
  console.log("[install] succeed. Nothing will warn you at the time.");
  console.log("[install] Either re-run this installer after every Node upgrade, or install against");
  console.log("[install] a stable path such as a system or Homebrew node.");
  console.log("");
}

// ------------------------------------------------------------------ macOS

const plist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- The Attention Hub. A LaunchAGENT, not a daemon: it reads and writes your files as you,
     and it answers on loopback on this machine. Run as root it would own its own database
     as root and hand you one you cannot write. Generated by deploy/hub/install.mjs; edit
     that, not this. The server binds loopback itself, from hub.config.json. -->
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${nodeBin}</string>
    <string>${path.join(appRoot, "scripts", "serve.mjs")}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>${appRoot}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${path.dirname(nodeBin)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(os.homedir(), "Library", "Logs", `${LABEL}.log`)}</string>
  <key>StandardErrorPath</key><string>${path.join(os.homedir(), "Library", "Logs", `${LABEL}.log`)}</string>
</dict></plist>
`;

const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

function macos() {
  const domain = `gui/${process.getuid?.() ?? ""}`;
  if (mode === "print") {
    console.log(plist());
    console.log(`[install] would be written to ${plistPath}`);
    return;
  }
  // bootout first, always. A hand-started hub still holding the port makes the managed copy
  // die on EADDRINUSE, and KeepAlive then respawns it into the same wall forever.
  spawnSync("launchctl", ["bootout", `${domain}/${LABEL}`], { stdio: "ignore" });
  if (mode === "remove") {
    if (existsSync(plistPath)) unlinkSync(plistPath);
    console.log("[install] removed. Your data folder is untouched: it is yours and it stays.");
    return;
  }
  mkdirSync(path.dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, plist());
  const out = spawnSync("launchctl", ["bootstrap", domain, plistPath], { encoding: "utf8" });
  if (out.status !== 0) die(`launchctl bootstrap failed: ${out.stderr || out.stdout}`);
  console.log(`[install] loaded ${LABEL}. Log: ~/Library/Logs/${LABEL}.log`);
}

// ------------------------------------------------------------------ Linux

const unit = () => `[Unit]
Description=Attention Hub
Documentation=file://${path.join(appRoot, "README.md")}
After=default.target

[Service]
Type=simple
WorkingDirectory=${appRoot}
ExecStart=${nodeBin} ${path.join(appRoot, "scripts", "serve.mjs")} start
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
`;

const unitPath = path.join(
  process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config"),
  "systemd",
  "user",
  `${LABEL}.service`,
);

function linux() {
  if (mode === "print") {
    console.log(unit());
    console.log(`[install] would be written to ${unitPath}`);
    return;
  }
  if (mode === "remove") {
    spawnSync("systemctl", ["--user", "disable", "--now", `${LABEL}.service`], { stdio: "ignore" });
    if (existsSync(unitPath)) unlinkSync(unitPath);
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    console.log("[install] removed. Your data folder is untouched: it is yours and it stays.");
    return;
  }
  mkdirSync(path.dirname(unitPath), { recursive: true });
  writeFileSync(unitPath, unit());
  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  const out = spawnSync("systemctl", ["--user", "enable", "--now", `${LABEL}.service`], { encoding: "utf8" });
  if (out.status !== 0) die(`systemctl failed: ${out.stderr || out.stdout}`);
  console.log(`[install] enabled ${LABEL}.service. Log: journalctl --user -u ${LABEL} -f`);
  // A user service normally stops at logout, which is the wrong shape for something that is
  // supposed to be there after a reboot. Say so rather than silently needing it.
  console.log("[install] note: a user service stops when you log out. To keep it across a");
  console.log(`[install] reboot without logging in: sudo loginctl enable-linger ${os.userInfo().username}`);
}

// ------------------------------------------------------------------

if (process.platform === "darwin") macos();
else if (process.platform === "linux") linux();
else die(`this release runs on macOS and Linux, and this machine is ${process.platform}.`);

if (mode === "install") {
  console.log("");
  console.log("[install] a supervised hub reports RUNNING even when every request fails, because");
  console.log("[install] a crash gets restarted. If something looks wrong, read the log above");
  console.log("[install] rather than the service state, and see docs/setup-troubleshooting.md");
}
