// SETUP. The page that gets a stranger from "it is running" to "it is mine".
//
// It leads with AGENT INSTRUCTIONS, every time: a block of text you hand to the
// AI command-line tool you already use, which does the step for you. The manual
// version of the same step sits under it. That ordering is the product's own
// premise applied to its own setup, and it is the bar this page was written to:
// someone who does not know how to get things going should be able to get going.
//
// FOUR THINGS THIS PAGE OWES THE READER, and all four are here on purpose:
//
//   THE TERMINAL WARNING, in its own section, not a footnote. It is the most
//   powerful surface in the product and the one that can hurt you.
//
//   THE ROADMAP, near the top. Local only today, and teams is not built.
//
//   HOW TO REACH IT FROM YOUR PHONE without putting a login-less hub on the
//   internet.
//
//   WHAT PLATFORM YOU ARE ON, honestly, including the parts of this release that
//   were written from documentation and never run.
//
// It absorbed the old /tab page (slice 14 left that call open): the tab seam is
// one step of setup, and two pages explaining the same seam is two copies of the
// same words waiting to disagree. /tab now redirects here.
import CopyBlock from "@/components/CopyBlock";
import { loadConfig } from "@/lib/config";
import type { HubConfig } from "@/lib/config";
import { readSetupPrompt, setupStates, SETUP_STEPS } from "@/lib/setup";
import type { SetupStep, StepId, StepState } from "@/lib/setup";
import { tabsViewWith } from "@/lib/tabs";

export const dynamic = "force-dynamic";

/** The one channel for feedback, per the README. */
const ISSUES_NEW = "https://github.com/adetwiler/attention-hub/issues/new"; // hub-no-request: the address of a link the USER clicks. Nothing in this file fetches anything.

/** Everything the page needs about the config, gathered once, never throwing:
 * the setup page is the page you land on WHEN your config is wrong, so it can
 * never be the page a bad config takes down. */
function readConfig(): { config: HubConfig | null; problem: string | null } {
  try {
    return { config: loadConfig(), problem: null };
  } catch (err) {
    return { config: null, problem: err instanceof Error ? err.message : String(err) };
  }
}

function stepById(id: StepId): SetupStep {
  const found = SETUP_STEPS.find((step) => step.id === id);
  // The array is a constant in this repo, so this cannot happen at runtime. It
  // is here because a lookup that can return undefined must say what it does.
  if (found === undefined) throw new Error(`no setup step called ${id}`);
  return found;
}

function Badge({ state }: { state: StepState }) {
  const text = state.state === "unknown" ? "config problem" : state.note;
  return <span className={`setup-badge ${state.state}`}>{text}</span>;
}

interface StepProps {
  step: SetupStep;
  state: StepState;
  /** The prompt to show. Separate from the step so the config step can render
   * the file's contents rather than a copy of them. */
  prompt: string | null;
  /** Anything this step needs that the others do not. */
  children?: React.ReactNode;
}

function Step({ step, state, prompt, children }: StepProps) {
  return (
    <section className="card setup-step" id={step.id}>
      <span className="hd">
        {step.title}
        <span className="count">{step.required ? "needed" : "optional"}</span>
      </span>
      <Badge state={state} />
      <p className="empty">{step.lede}</p>
      {children}
      <span className="setup-sub">Hand this to your AI tool</span>
      {prompt === null ? (
        <p className="empty">
          The prompt file is missing from this install. It should be <code>prompt.txt</code> at the
          top of the hub folder. A <code>git pull</code> puts it back, and the manual steps below do
          the same job without it.
        </p>
      ) : (
        <CopyBlock text={prompt} label="Copy the prompt" />
      )}
      <span className="setup-sub">Or do it yourself</span>
      <ol className="setup-manual">
        {step.manual.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

export default function SetupRoom() {
  const { config, problem } = readConfig();
  const states = setupStates(config);
  const stateById = (id: StepId): StepState =>
    states.find((state) => state.id === id) ?? { id, state: "unknown", note: "unknown" };

  // Read from the ONE copy, at request time. Nothing in the tree duplicates this
  // text, so there is nothing to keep in sync. See src/lib/setup.ts.
  const configPrompt = readSetupPrompt(process.cwd());

  // What this machine is. Said plainly, because two of this release's modules
  // are POSIX shaped and one of the three platforms cannot run them.
  const platform = process.platform;
  const platformName =
    platform === "darwin" ? "macOS" : platform === "linux" ? "Linux" : platform === "win32" ? "Windows" : platform;

  const tabs = tabsViewWith(loadConfig);

  return (
    <>
      <div className="room-head">
        <h1>Setup</h1>
        <span className="room-date">{platformName}</span>
      </div>

      {problem !== null ? (
        <section className="card note bad">
          <span className="hd">Your config could not be read</span>
          <p className="empty">{problem}</p>
          <p className="empty">
            The hub is running on its documented defaults until that is fixed, which is why this
            page still works. Nothing you configured is being used.
          </p>
        </section>
      ) : null}

      <section className="card note">
        <span className="hd">You are already past the hard part</span>
        <p className="empty">
          The hub is running, on this machine, against a database in your own data folder. Nothing
          below is required to keep it running: every step is something you switch on when you want
          it, and anything you skip stays honestly switched off rather than half configured.
        </p>
        {platform === "win32" ? (
          <p className="empty">
            <b>This release supports macOS and Linux.</b> You are on Windows, so the terminal module
            and the browser pane will not work here: the terminal keeps sessions alive with tmux and
            browser discovery looks in POSIX locations. The rest of the hub runs. Nothing here will
            pretend otherwise, and there is a wishlist row for Windows if you want it.
          </p>
        ) : platform === "linux" ? (
          <p className="empty">
            <b>Linux is supported and parts of it are untested.</b> The browser discovery paths and
            the service files for both sidecars were written from documented locations and have
            never been run on a real Linux install by the maintainer. They should work. If one does
            not, that is worth an issue, and it is not you.
          </p>
        ) : null}
      </section>

      {/* THE ROADMAP, near the top rather than buried at the bottom, because
          what a product cannot do is the thing a stranger most needs to know
          before they invest an afternoon in it. */}
      <section className="card">
        <span className="hd">Where this is going</span>
        <p className="empty">
          <b>Today it is local only, and it is single user.</b> There is no hosted version, no
          account and no sign-in, and the whole of it runs on this machine.
        </p>
        <p className="empty">
          <b>More than one person is being built.</b> It is not here, no part of it is here, and
          there is no date. When it exists it will be said plainly in the same places this sentence
          is.
        </p>
        <p className="empty">
          Everything else that is missing is named on TODAY, at the bottom, with a link that files
          the request. What gets asked for gets built, and the count of people asking is the only
          thing deciding the order.
        </p>
      </section>

      <Step step={stepById("config")} state={stateById("config")} prompt={configPrompt}>
        <p className="empty">
          Every path and every port the hub uses comes from <code>hub.config.json</code>, and every
          key in the example carries a comment explaining what it does. Your copy is gitignored, so
          an update can never touch it. Editing it takes effect on the next restart.
        </p>
      </Step>

      <Step step={stepById("tabs")} state={stateById("tabs")} prompt={stepById("tabs").prompt}>
        {tabs.problem !== null ? (
          <p className="empty">Your tabs could not be read: {tabs.problem}</p>
        ) : tabs.tabs.length === 0 ? (
          <p className="empty">
            You have none yet. Nothing is missing and nothing is broken: a tab is something you add,
            and the hub never invents one for you.
          </p>
        ) : (
          <ul className="tabdir">
            {tabs.tabs.map((tab) => (
              <li key={tab.slug} className="tabrow">
                <a className="link" href={tab.href}>
                  {tab.name}
                </a>
                <span className="tabkind">{tab.kind === "url" ? "a web page" : "a folder"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="empty">
          Tabs are the only surface you can add to this version without writing code. Something with
          code of its own is a module, it lives in a folder an update never touches, and it is not
          built yet. The rules and the recipes are in <code>docs/tabs.md</code>.
        </p>
      </Step>

      <Step step={stepById("browser")} state={stateById("browser")} prompt={stepById("browser").prompt}>
        <p className="empty">
          It is not an iframe and it never could have been: whether a page may be framed is the
          site&apos;s decision, so a framed pane could show you almost nothing. This mirrors a real
          browser, which is why real logins work.
        </p>
      </Step>

      {/* THE TERMINAL WARNING. Its own section, above the step, in the loudest
          words the page has. Everything in it is a mechanism except the last
          bullet, and the last bullet is the one no mechanism can hold. */}
      <section className="card note bad" id="terminal-warning">
        <span className="hd">Before you turn on the terminal, read this</span>
        <p className="empty">
          <b>A terminal pane is a real shell on this machine</b>, running as you, reached from a
          browser tab. It can read your keys and your databases, and it can push your code. That is
          not a flaw in it. That is what a shell is.
        </p>
        <p className="empty">
          <b>It is off until you turn it on</b>, and turning it on is four deliberate steps: set{" "}
          <code>&quot;terminal&quot;: {"{"} &quot;enabled&quot;: true {"}"}</code> in your config,
          add a pane of kind <code>terminal</code>, install and run the sidecar (
          <code>cd pty &amp;&amp; npm install &amp;&amp; npm start</code>), and install a service
          file from <code>pty/deploy/</code> so it survives a reboot.
        </p>
        <p className="empty">
          <b>Never put the hub on the open internet.</b> The hub has no login. With this module on,
          exposing it is handing out a shell. Reach it from a phone through a private network, never
          through a port forward.
        </p>
        <p className="empty">
          <b>macOS and Linux only</b>, because the sidecar keeps sessions alive with tmux. There is
          no Windows version and none is faked.
        </p>
        <p className="empty">
          <b>Owner only, permanently.</b> When installs with more than one person exist, no role but
          the owner will ever get a shell. That is a permanent rule, not a limitation of this
          version.
        </p>
      </section>

      <Step step={stepById("terminal")} state={stateById("terminal")} prompt={stepById("terminal").prompt}>
        <p className="empty">
          Sessions live in tmux, so a dev server you start here survives leaving the page, restarting
          the sidecar, updating the hub and closing your laptop, and you can always pick it up from a
          real terminal with <code>tmux attach</code>. The hub has no way to kill a session, on
          purpose: it must never be the thing that traps a process. Everything about it, including
          four traps that all fail silently, is in <code>docs/terminal.md</code>.
        </p>
      </Step>

      <Step step={stepById("reach")} state={stateById("reach")} prompt={stepById("reach").prompt}>
        <p className="empty">
          The hub listens on <code>127.0.0.1</code>, which means this machine and nothing else, and
          it has no login. Those two facts are a pair. The safe way to reach it from your phone is a
          private network in front of it, so the hub is never on an address a stranger can reach.
        </p>
        <p className="empty">
          <b>Tailscale is what this page recommends</b>, and the free plan is enough for a household:
          the Personal plan covers <b>up to 6 users and 100 devices</b>, and signing up with an
          ordinary address (a Gmail one, for example) enrols you in it automatically. Those are the
          published numbers as of July 2026: see tailscale.com/pricing and the pricing change at
          tailscale.com/blog/pricing-v4. Invite the people in your house from your admin console and
          they cost nothing.
        </p>
        <p className="empty">
          <b>Prefer <code>tailscale serve</code> to changing the bind address.</b> It proxies your
          machine&apos;s tailnet name to the hub&apos;s loopback port, so the bind stays on this
          machine, nothing on your local network can reach the hub, and you get a real certificate.
          The certificate matters for more than tidiness: a browser only allows features like the
          copy buttons on this page in a secure context, which a plain http address on a private
          network is not.
        </p>
        <p className="empty">
          <b>Split DNS</b> is what you set up when you want the hub to answer on a name of your own
          rather than the tailnet name: your tailnet resolves that one domain through a nameserver
          you choose, and it is a setting in the Tailscale admin console rather than anything in this
          hub. <b>Shared DNS</b> is the other half of the same idea for a household: everyone you
          invited resolves the same names, so the address you tell them is the address that works.
          Neither is required, and neither changes anything about how the hub binds.
        </p>
        <p className="empty">
          <b>Never use <code>tailscale funnel</code>.</b> Serve is your tailnet. Funnel is the public
          internet, and this hub has no login.
        </p>
      </Step>

      <Step step={stepById("email")} state={stateById("email")} prompt={stepById("email").prompt}>
        <p className="empty">
          <b>The hub still calls nothing on its own.</b> This is a command you schedule yourself,
          with your own scheduler, that reads your feed and sends one message through a provider you
          chose, with a key that is yours. Off until you set it up, and the only exception to the
          promise on the front page. What the provider can see is written down rather than skipped
          over, in <code>docs/email-digest.md</code>.
        </p>
      </Step>

      <section className="card">
        <span className="hd">If something is wrong</span>
        <p className="empty">
          Feedback happens through GitHub issues, and that is the only channel. Nothing in this hub
          reports anything to anyone, so if you do not say it, nobody knows it.
        </p>
        <p className="empty">
          <a className="link" href={ISSUES_NEW} target="_blank" rel="noreferrer">
            Open a new issue
          </a>{" "}
          and say what you did, what happened, and what you expected. The exact words a surface put
          on your screen are worth more than a description of them.
        </p>
      </section>

      <p className="version">
        Attention Hub, free and open source, by Andrew Detwiler. This page is the whole of setup:
        there is no wizard, no account step, and nothing here talks to a server we run.
      </p>
    </>
  );
}
