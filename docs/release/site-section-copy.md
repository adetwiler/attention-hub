# Staged: the buildwithamemory.com section, and the release notes

**Nothing in this file has been applied anywhere.** The live site is the owner's,
the release is deferred behind another giveaway, and the repo stays private until
its turn. This is the copy waiting for that trigger, written down so the edit is a
paste rather than a fresh act of judgment at the moment of shipping.

The design is settled and is not in question:
[docs/mocks/buildwithamemory-front-page.html](../mocks/buildwithamemory-front-page.html)
is owner-approved design truth, and the release-time edit ports it. **What is in
question is three lines of its COPY, which were written before v1 was cut down.**

## 1. THE MOCK'S COPY IS PRE-CUT, IN THREE PLACES

Read this before porting anything out of that file. The layout, the tokens and the
hub screenshot are truth. These three claims are not, as of 2026-07-29.

| Where in the mock | What it says | What is true in v1 |
|---|---|---|
| `.fineprint`, first sentence | "The only network call it makes is checking GitHub for updates, and you can turn that off." | **Zero outbound calls.** The update check is post-v1 and is not built. The stronger sentence is the true one. |
| `.hub-copy .more`, last sentence | "And when you want the hub itself to do something new, you press one key and your own AI builds it." | Self-build is post-v1. v1's second beat is the TAB SEAM: a name plus what it points at, in config, no code. |
| `.hub-copy .more`, middle | "Your GitHub issues on a board." | The board is not built. It is a named row on the wishlist. |
| `.chips` | "It can build itself" | Same as above. The honest chip is "Make it yours in one config line" or similar. |
| `.hubprompt` `<pre>` | A DRAFT prompt, labelled as one | Still a draft, and it is a DIFFERENT artifact from `prompt.txt` (that one writes a config inside a clone; this one sets the hub up from nothing). Whichever text ships, **the moment it is a copy of `prompt.txt` the prompt-sync gate has to exist**, and `test/setup.test.mjs` is where the repo half of that lives. |

## 2. The copy that is true today

Paste-ready, in the voice the mock already uses.

**Eyebrow:** New, and free

**Heading:** Your memory network gets a face.

**Lede:** Attention Hub is a free command center that runs on your machine. It
watches the work you and your agents have in flight, and tells you when something
actually needs you.

**Body:** Honestly, you can do all of this from a terminal. The hub is for the
moments between sessions. An agent hits a question and you answer it from a
notification, in one click. Your accounts, your shells and a real browser, side by
side on one screen. And the things you keep glancing at sitting in the nav next to
it, because you added a line to a config file.

**Chips (four):**

- No telemetry, none
- The database is yours
- Any AI command line tool
- Make it yours without code

**Roadline:** Local only today. macOS and Linux. Teams is being built.

**Buttons:** Get Attention Hub / Read the setup guide

**Fineprint:** Free. Runs on your machine, with your own AI subscription or keys.
It makes no network calls at all: nothing about you leaves your computer, because
there is nowhere for it to go. If something breaks, file an issue on GitHub. There
is no tracking to tell us for you.

## 3. What must NOT appear on the site

- Any claim that the hub can build itself, that a board exists, or that more than
  one person is supported.
- Any softening of the platform line. macOS and Linux, said once, without a date
  for Windows.
- Any wording that implies the hub emails you. That module was built and cut.
- A prompt block that duplicates `prompt.txt` without the sync gate.

## 4. The release notes, drafted and NOT published

For whenever the tag happens. **No tag exists, and creating one is the owner's.**

**Title:** Attention Hub v1.0.0

**Body:**

The first release. It runs on your machine, it makes no network calls, and it is
honest about what it does not do yet.

What is in it:

- **TODAY**, and the attention feed behind it. Anything on your machine can put a
  question in front of you by appending a line to a file, and read your answer
  back. It works with the hub closed.
- **The wall.** Every pane on one screen: your accounts, a real browser mirrored
  into a pane, and a real shell in a folder. Number keys zoom one, F is
  fullscreen, and the layout you leave is the layout you come back to.
- **The browser pane.** Not an iframe: a real browser on this machine, mirrored,
  so your logins work and so do sites that refuse to be framed.
- **The terminal.** Off by default, tmux backed, owner only, and it can never trap
  a process. Read the warning before you switch it on.
- **Tabs.** A name plus what it points at, in your config, in the nav. No code.
- **A setup page** that hands you a prompt for your own AI tool at every step.

What is not in it, named rather than implied: the module system, the hub building
itself, the board, more than one person, an email digest, and the update check.
Each one has a row in the hub that files a request. What gets asked for gets
built.

macOS and Linux. Windows is not supported in this release.

## 5. The trigger list, so nothing fires early

- [ ] The owner's Chrome walk ([the checklist](../verification/2026-07-29-owner-chrome-walk-checklist.md)) passes.
- [ ] The giveaway slot is free (one release in flight at a time).
- [ ] `bash .githooks/release-check.sh` on the merged `main`.
- [ ] Tag `v1.0.0` and push the tag. **Owner only.**
- [ ] The GitHub Release, with section 4 above as the body. **Owner only.**
- [ ] Make the repo public. **Owner only.**
- [ ] Port the site section, using section 2 above. **Owner only.**
