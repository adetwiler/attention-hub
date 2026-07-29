// SETUP: the steps, the one-paste prompts, and what your config says about each.
//
// The bar this page is held to, in the owner's words, is that someone who does
// not know how to get things going should be able to get going. So every step
// LEADS WITH A PROMPT you hand to the AI command-line tool you already use, and
// the manual instructions sit underneath it for the people who would rather do
// it themselves. That ordering is the feature: the product's whole premise is
// that you already have an AI tool, so setup is a thing you delegate.
//
// THE PROMPTS LIVE HERE AS DATA, and each one is the ONLY copy of itself. The
// whole-config prompt is the exception and it is NOT in this file: it lives in
// prompt.txt at the top of the repo, once, and the setup page READS THAT FILE at
// request time (readSetupPrompt below). That is deliberate. A second copy of the
// hero prompt embedded in a component would need a gate keeping the two in step,
// and two drifting copies of the prompt a stranger is told to paste is the most
// embarrassing inaccuracy this repo could ship. One copy, read from disk, cannot
// drift at all. See OPEN.md and ADR-0001 (the prompt is CC0).
//
// NO URL SCHEMES IN THIS FILE. The prompt text below names bare domains on
// purpose: the pre-commit network gate reads one line at a time and a marker
// cannot live inside a template literal, so a scheme here would either fail the
// gate or force a marker that lies about what the line is. It also happens to be
// the more honest rendering: nothing in this file is fetched by anything.
//
// TESTABLE BY CONSTRUCTION. The config import is TYPE ONLY and the config
// arrives as an argument, exactly as in src/lib/wall.ts and src/lib/tabs.ts.
// Node's type stripping erases a type import but does not resolve an
// extensionless runtime one, so a `loadConfig` import here would take the whole
// test file down with it.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { HubConfig } from "./config";

/** The file the whole-config prompt lives in, at the top of the repo. */
export const SETUP_PROMPT_FILE = "prompt.txt";

/** One step of setup. */
export interface SetupStep {
  id: StepId;
  /** The heading. */
  title: string;
  /** One or two sentences: what this step gets you, and whether you need it. */
  lede: string;
  /** True when nothing works until you do this. Everything else is optional and
   * says so, because a required-looking optional step is how a setup page turns
   * a five minute job into an afternoon. */
  required: boolean;
  /** The one-paste prompt. Hand it to your own AI tool. */
  prompt: string;
  /** The same job by hand, for people who would rather. */
  manual: string[];
}

export type StepId = "config" | "tabs" | "browser" | "terminal" | "reach" | "email";

/** What your config says about one step right now. Never a guess: an unreadable
 * config produces `unknown`, which the page renders as a problem rather than as
 * a tidy "not set up yet". BROKEN IS NOT EMPTY applies to setup too. */
export interface StepState {
  id: StepId;
  state: "on" | "off" | "unknown";
  /** Plain words for the badge: what is true right now. */
  note: string;
}

// ---------------------------------------------------------------- the prompts

const TABS_PROMPT = `Add a tab to my Attention Hub.

You are standing in my Attention Hub clone. Read the "$tabs" comment in
hub.config.example.json first: that comment is the specification, and if your
recollection disagrees with it, the comment is right.

1. Ask me what I want in my nav. For each one, get a NAME and either a web
   address or a folder on this machine, never both.
2. Add the rows to "tabs" in hub.config.json (create the file from
   hub.config.example.json if it does not exist yet). Never edit
   hub.config.example.json, and never edit anything under src/ or scripts/:
   updates to this hub are a plain "git pull" and a source edit would collide
   with my next update.
3. Check the file parses as JSON, then tell me to restart the hub.

A folder tab can only ever show me what I pointed it at, so point it at the
folder I actually want, not at my home directory.`;

const BROWSER_PROMPT = `Set up the Attention Hub's browser pane on this machine.

You are standing in my Attention Hub clone. Read the "browser" section of
hub.config.example.json before you do anything: its "$comment", "$constraint"
and "$profiles" keys are the specification. Read docs/browser-pane.md too.

The constraint that decides the whole job: since Chrome 136, a browser started
with a remote debugging port IGNORES it when the data directory is the default
one, so the hub can never drive the browser I already have open. It drives its
own seeded copy.

1. Ask me which browser (chrome or chromium) and which of its profiles I want
   mirrored, and what to call it.
2. Tell me to QUIT that browser completely. The seed script refuses to run while
   it is open, and it is right to.
3. Run: node scripts/seed-browser-profile.mjs
   Follow what it prints. Do not invent flags for it.
4. Add my profile to "browser.profiles" in hub.config.json with a unique "port"
   that no other profile uses. Write the port down in the row; never derive one
   from a position in the list.
5. Start the sidecar in its own terminal: npm run browser
   (First time only: npm run browser:install)
6. Tell me to restart the hub, open the WALL, and press CONNECT on the pane.

Never edit hub.config.example.json, and never edit anything under src/, scripts/
or chrome/. If something does not work, tell me exactly what the pane says
rather than guessing at a fix.`;

const TERMINAL_PROMPT = `Turn on the Attention Hub's terminal module, but READ ME THE WARNING FIRST.

Before you change anything, tell me this in your own words and wait for me to say
yes:

  A terminal pane is a real shell on this machine, running as me, reached from a
  browser tab. It can read my keys and my databases and it can push my code.
  The hub has no login. If the hub is ever reachable from the open internet with
  this on, I am handing out a shell. It works on macOS and Linux only.

If I say yes:

1. Read docs/terminal.md and the "terminal" section of hub.config.example.json.
   Those two are the specification.
2. Set "terminal": { "enabled": true } in hub.config.json, and add a pane of
   kind "terminal" to "wall.panes" with a "cwd" I name. The folder has to exist.
3. Install and start the sidecar:
     cd pty
     npm install
     npm start
   Check that tmux is installed first (tmux -V). Without it, sessions do not
   survive anything, and the pane says so.
4. Install a service file from pty/deploy/ so the sidecar comes back after a
   reboot. Every path in those files is a placeholder I have to replace. Without
   this, the terminal is dead after every restart while the rest of the hub comes
   back, which reads as the hub being broken.
5. Tell me to restart the hub, open the WALL, and press ATTACH.

Never edit hub.config.example.json and never edit anything under src/, scripts/
or pty/. Do not switch this on without my explicit yes.`;

const REACH_PROMPT = `Let me reach my Attention Hub from my phone, privately.

You are standing in my Attention Hub clone.

TWO RULES YOU MAY NOT BREAK, whatever I ask for:
  - Never set bind.host to 0.0.0.0, and never set up a port forward or a router
    rule. The hub has no login. Reachable without a login is a hole.
  - Never use tailscale funnel. That is the one Tailscale feature that puts a
    machine on the PUBLIC internet.

1. Check whether Tailscale is installed (tailscale version). If it is not, tell
   me the install command for this machine and wait for my yes. Signing up with
   an ordinary address such as a Gmail one puts me on the free Personal plan.
2. Bring it up (tailscale up) and print this machine's tailnet name and address
   (tailscale status, tailscale ip -4).
3. PREFER tailscale serve over changing the bind address. Run
   "tailscale serve --help" and read it rather than trusting a remembered flag,
   then set it up so my tailnet name proxies to the hub's loopback port. This
   keeps bind.host at 127.0.0.1, which means the hub is reachable ONLY through
   the private network, and it gives me a real certificate, which is what makes
   copy buttons and other browser features work away from this machine.
4. If serve is not available, the fallback is to set bind.host to this machine's
   Tailscale IP (the 100.x address), never 0.0.0.0. That interface is only
   reachable on my tailnet.
5. Add the hostname I will actually type to "bind.allowedDevOrigins" in
   hub.config.json. Leave it out and the page loads while every click is dead,
   which is a very confusing failure.
6. Tell me the exact address to open on my phone, and remind me that anyone on my
   tailnet can reach the hub, so I should only invite people I would hand this
   machine to.

Never edit hub.config.example.json and never edit anything under src/ or
scripts/.`;

const EMAIL_PROMPT = `Set up the Attention Hub's email digest, which is off by default.

You are standing in my Attention Hub clone. Read docs/email-digest.md and the
"email" section of hub.config.example.json first. They are the specification.

Understand what you are switching on before you explain it to me: the hub itself
still calls nothing. A command I schedule (hub digest) reads my attention feed
and posts one message to the email provider I chose, with my own key. It is the
only outbound call in this product, it only happens because I set it up, and the
provider can see who I email and what the digest says.

1. Ask me whether I want it at all. If I say no, stop here and change nothing.
2. Ask for the address to send TO, and for a Resend API key. WRITE THE KEY TO ITS
   OWN FILE, never into hub.config.json: the config is a file I might paste into
   a bug report one day. Put it somewhere private, for example
   ~/.attention-hub/resend.key, and chmod 600 it.
3. Fill in the "email" section of hub.config.json: enabled, to, from, and
   apiKeyFile pointing at that file. The "from" address has to be one my provider
   has verified for me.
4. Test it without sending anything: node scripts/hub.mjs digest --dry-run
   Show me what it printed.
5. Send one for real when I say so: node scripts/hub.mjs digest
6. Schedule it with MY scheduler, not with the hub: a cron line or a launchd
   agent that runs "hub digest" as often as I want it. Show me the line before
   you install it. Quiet hours do not apply, because the schedule is mine.

Never put the key in hub.config.json, never commit it anywhere, and never send
the digest anywhere except the address I gave you.`;

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "config",
    title: "Your config",
    lede: "One file decides every path and every port in the hub, and every key in it carries a comment explaining what it does. This prompt reads those comments, interviews you, and writes the file. It is the only step that is not optional, and even this one has a working default: the hub runs before you do it.",
    required: true,
    prompt: "", // read from prompt.txt at request time, see readSetupPrompt
    manual: [
      "Copy hub.config.example.json to hub.config.json. Yours is gitignored, so an update can never touch it.",
      "Edit hub.config.json. Every key has a $comment above it that says what it does and what happens if you leave it out. Anything you leave out falls back to the documented default.",
      "Restart the hub. The whole file is read once at startup.",
    ],
  },
  {
    id: "tabs",
    title: "Your tabs",
    lede: "A tab is a name plus what it points at: a web page, or a folder on this machine. It appears in the nav next to the hub's own rooms, you write no code, and it is the whole of making this hub yours in this version.",
    required: false,
    prompt: TABS_PROMPT,
    manual: [
      'Add a row to "tabs" in hub.config.json: { "name": "Notes", "dir": "~/notes" } for a folder, or { "name": "Docs", "url": "..." } for a web page. One or the other, never both.',
      "Restart the hub. The tab is in the nav, in config order.",
      "The full rules, the limits and the recipes are in docs/tabs.md.",
    ],
  },
  {
    id: "browser",
    title: "The browser pane",
    lede: "A real browser on this machine, mirrored into a pane and driven from it, so real logins work and so do sites that refuse to be framed. Optional. A tab pointing at a web page needs it, and so does a browser pane on the wall.",
    required: false,
    prompt: BROWSER_PROMPT,
    manual: [
      "Quit the browser you want to mirror. The seed script refuses while it is open.",
      "Run: node scripts/seed-browser-profile.mjs and follow what it prints. It copies one of your profiles into the hub's own data directory, once, because a browser started on its default data directory ignores a debugging port.",
      'Add your profile to "browser.profiles" in hub.config.json, with a port no other profile uses.',
      "Install and start the sidecar: npm run browser:install once, then npm run browser.",
      "Restart the hub and press CONNECT on the pane. The traps, all of them measured, are in docs/browser-pane.md.",
    ],
  },
  {
    id: "terminal",
    title: "The terminal",
    lede: "A real shell on this machine, in a folder you name, reached from a browser tab. It is the most powerful thing here and the most dangerous, it ships switched off, and the section below is what to read before you switch it on. macOS and Linux only.",
    required: false,
    prompt: TERMINAL_PROMPT,
    manual: [
      'Set "terminal": { "enabled": true } in hub.config.json.',
      'Add a pane of kind "terminal" to "wall.panes", with a "cwd" that exists.',
      "Install and start the sidecar: cd pty, npm install, npm start. Install tmux first, or nothing survives leaving the page.",
      "Install a service file from pty/deploy/ so it comes back after a reboot, replacing every placeholder path in it.",
      "Restart the hub, open the WALL, press ATTACH. Read docs/terminal.md before any of this.",
    ],
  },
  {
    id: "reach",
    title: "Reaching it from your phone",
    lede: "The hub listens on this machine only, and it has no login. That is a pair: the second one is safe because of the first. To reach it from another device, put a private network in front of it. Never a port forward.",
    required: false,
    prompt: REACH_PROMPT,
    manual: [
      "Install Tailscale on this machine and on your phone, and sign in to the same account on both.",
      "Prefer tailscale serve, which proxies your tailnet name to the hub's loopback port. The bind address stays 127.0.0.1, so nothing on your local network can reach the hub, and you get a real certificate.",
      "If you bind an address instead, bind this machine's Tailscale IP (the 100.x one). Never 0.0.0.0.",
      'Add the hostname you type into "bind.allowedDevOrigins", or the page will load with every click dead.',
      "Never use tailscale funnel. That is the feature that puts a machine on the public internet, which is the one thing this hub must not be.",
    ],
  },
  {
    id: "email",
    title: "The email digest",
    lede: "Off, until you turn it on. A command you schedule yourself emails you what is waiting, through an email provider you choose, with your own key. It is the only outbound call in the product and it exists because a hub that only talks to you on the machine you left cannot tell you anything while you are out.",
    required: false,
    prompt: EMAIL_PROMPT,
    manual: [
      "Put your provider API key in its own file, not in hub.config.json. The config is a file people paste into bug reports.",
      'Fill in "email" in hub.config.json: enabled, to, from, and apiKeyFile.',
      "Check it without sending: node scripts/hub.mjs digest --dry-run",
      "Schedule it with your own cron or launchd. The hub has no scheduler and deliberately does not grow one for this.",
      "The whole contract, including what the provider can see, is in docs/email-digest.md.",
    ],
  },
];

// ---------------------------------------------------------------- state

/** Read the whole-config prompt from its ONE home.
 *
 * @param hubRoot the directory holding prompt.txt (the caller passes
 *   process.cwd(); this module never assumes it, so a test can point it
 *   anywhere).
 * @returns the prompt text, or null when the file is not there. Null renders as
 *   "the file is missing and here is its name", never as an empty box, because a
 *   copy button that copies nothing is worse than an honest gap.
 */
export function readSetupPrompt(hubRoot: string): string | null {
  try {
    // turbopackIgnore: a runtime read, not a static import. Same as src/lib/version.ts.
    const text = readFileSync(path.join(/*turbopackIgnore: true*/ hubRoot, SETUP_PROMPT_FILE), "utf8");
    return text.trim().length === 0 ? null : text;
  } catch {
    return null;
  }
}

/** What each step's config says right now.
 *
 * @param config the loaded config, or null when it could not be read at all.
 */
export function setupStates(config: HubConfig | null): StepState[] {
  if (config === null) {
    return SETUP_STEPS.map((step) => ({
      id: step.id,
      state: "unknown" as const,
      note: "your config could not be read",
    }));
  }
  const states: Record<StepId, StepState> = {
    config: {
      id: "config",
      state: config.adapters.default === null ? "off" : "on",
      note:
        config.adapters.default === null
          ? "no AI tool named yet"
          : `your AI tool is ${config.adapters.default}`,
    },
    tabs: {
      id: "tabs",
      state: config.tabs.length === 0 ? "off" : "on",
      note:
        config.tabs.length === 0
          ? "no tabs yet"
          : `${config.tabs.length} ${config.tabs.length === 1 ? "tab" : "tabs"} in your nav`,
    },
    browser: {
      id: "browser",
      state: config.browser.profiles.length === 0 ? "off" : "on",
      note:
        config.browser.profiles.length === 0
          ? "no browser profile seeded"
          : `${config.browser.profiles.length} browser ${config.browser.profiles.length === 1 ? "profile" : "profiles"}`,
    },
    terminal: {
      id: "terminal",
      state: config.terminal.enabled ? "on" : "off",
      note: config.terminal.enabled ? "switched ON in your config" : "off, which is the default",
    },
    reach: {
      id: "reach",
      // allowedDevOrigins is the only thing in config that says "I reach this
      // from somewhere else". A loopback bind with no extra origins is the
      // untouched default, and saying so is more useful than saying nothing.
      state: config.bind.allowedDevOrigins.length === 0 ? "off" : "on",
      note:
        config.bind.allowedDevOrigins.length === 0
          ? "this machine only, which is the default"
          : `${config.bind.allowedDevOrigins.length} other ${config.bind.allowedDevOrigins.length === 1 ? "origin" : "origins"} allowed`,
    },
    email: {
      id: "email",
      state: config.email.enabled ? "on" : "off",
      // An enabled digest with nothing to send to is a mistake worth naming
      // here, because the alternative is finding out the first time you are
      // away from the machine and no email arrives.
      note: !config.email.enabled
        ? "off, which is the default"
        : config.email.to === null || config.email.from === null || config.email.apiKeyFile === null
          ? "ON, but incomplete: it needs to, from and apiKeyFile"
          : `on, to ${config.email.to}`,
    },
  };
  return SETUP_STEPS.map((step) => states[step.id]);
}
