# The owner's Chrome walk: the numbered list, so it is cheap

**This is the one verification pass no agent can do.** The browser extension
needs a human to pick the browser, so everything below is the half of v1 that
has never been seen by a person driving a page. Everything underneath it has been
driven and measured by machine, and each section says which walk covered it.

Print this, or keep it open on a phone. **Tick as you go, and where something is
wrong, write the exact words the surface put on your screen**, because that
sentence is the bug report.

- **Time:** about 45 minutes, more if a seed or a sidecar misbehaves.
- **You need:** this machine, Chrome (or Chromium), tmux, and a phone on the same
  private network for section 8, which is optional.
- **The rule while you walk:** if a surface says something that is not true, that
  is the finding. This product's whole claim is that it does not lie to you about
  its own state.

---

## 0. Before you start

1. [ ] `git status` is clean, and you are on the branch you mean to walk.
2. [ ] `cp hub.config.example.json hub.config.json` if you do not have one, or
       back up the one you have: this walk edits it several times.
3. [ ] `npm ci`
4. [ ] `./start.sh` and wait for the address it prints.
5. [ ] Open that address in Chrome. **Not Brave, not Safari:** the extension work
       later in this walk is Chrome's.

## 1. The shell, and the thing every page owes

6. [ ] The topbar reads your hub name, then TODAY, WALL, BOARD, SESSIONS, JOBS.
7. [ ] BOARD, SESSIONS and JOBS are dim and unclickable, and hovering says
       "Not built yet."
8. [ ] SETUP is at the far right of the nav.
9. [ ] The footer reads: your hub name, then "free and open source, by Andrew
       Detwiler / buildwithamemory.com", then the version.
10. [ ] The footer link opens buildwithamemory.com in a new tab.
11. [ ] Resize the window narrow (or open it on a phone-width viewport). The nav
        wraps rather than pushing the counts off the edge.

## 2. TODAY, and the attention feed you can actually see

Machine-verified: filing, answering, reading back, the ledger rows, the refusals
(see the machine pass, items 34 to 47). **What you are checking is the part a
person sees.**

12. [ ] TODAY says "Nothing needs you right now" and shows no sample data.
13. [ ] In a terminal:
        `node scripts/hub.mjs ask "Which empty state reads better?" --option "Nothing saved yet" --option "Your drafts live here" --from "the walk"`
14. [ ] **Within about a second and a half, without touching the page**, a toast
        appears in the corner. This is the product's whole promise. If you have to
        refresh, that is a finding.
15. [ ] The toast says who asked and what it wants, and offers the two options.
16. [ ] The item is also at the top of TODAY, in the WAITING FOR YOU card.
17. [ ] Click one option **in the toast**. It disappears, and the card updates
        without a refresh.
18. [ ] Back in the terminal: `node scripts/hub.mjs get <the id it printed>`
        prints the answer you clicked, and exits 0.
19. [ ] File another one and answer it **from the card** this time. Same result.
20. [ ] File a REPORT: `node scripts/hub.mjs ask "The nightly run went red"`.
        It appears labelled as a report, never as asking you a question, and it
        offers a way to mark it handled rather than an answer box.
21. [ ] File one with a document:
        `node scripts/hub.mjs review "Read this" --link docs/terminal.md`.
        Clicking it opens the markdown **inside the hub**, rendered as markdown,
        with a way back. Nothing opens a new tab or downloads a file.
22. [ ] **The pager**: file a long markdown file the same way and scroll it. The
        float scrolls, the page behind it does not, and Escape closes it.
23. [ ] Turn quiet hours on from the card. File another item. **No toast**, and it
        is still on the list. Turn quiet hours off: nothing back-fires as a pile
        of toasts.
24. [ ] Open the hub in a second tab, answer an item in one, and watch the other
        tab update on its own.

## 3. The setup page

25. [ ] Open SETUP. The first card says you are past the hard part.
26. [ ] The badges match your actual config (they read your file, so a wrong one
        is a finding): the AI tool, the tab count, browser profiles, terminal off.
27. [ ] The roadmap card is near the top, and says local only, single user, and
        that more than one person is being built with no date.
28. [ ] **The terminal warning has its own red-edged card**, and you cannot miss
        it while scrolling past.
29. [ ] Read it as a stranger would. Does it stop you? That is the only test it
        has to pass.
30. [ ] The two kinds of pane are described before it: an account pane, and a
        shell in a folder.
31. [ ] **Press a Copy button.** It says "Copied", and pasting into a text editor
        gives the whole prompt.
32. [ ] Compare the config prompt on screen against `prompt.txt` in the repo. They
        must be the same text, because the page reads that file. (If they ever
        differ, something has embedded a second copy and `test/setup.test.mjs`
        should have failed.)
33. [ ] Every step has a manual fallback under the prompt.
34. [ ] The issue link at the bottom opens a GitHub new-issue form.

## 4. The tab seam (owed since slice 14)

35. [ ] Add to `hub.config.json`:
        `"tabs": [ { "name": "YouTube", "url": "https://youtube.com" }, { "name": "Notes", "dir": "~/notes" } ]`
36. [ ] Restart the hub. Both are in the nav, after the hub's rooms, in that
        order.
37. [ ] NOTES lists your folder, folders first, and clicking a markdown file
        renders it in the hub.
38. [ ] **YOUTUBE opens the browser pane on youtube.com**, not on the configured
        home page. This is slice 14's owed hop, and it needs section 5 done first.
39. [ ] Remove the tabs from your config and restart: the nav shows `+ TAB`, and
        clicking it lands on the tabs section of SETUP.
40. [ ] Put a deliberately broken tab in (both a `url` and a `dir`) and restart:
        the nav says `TABS?` and SETUP names `tabs[0]`.

## 5. The browser pane (owed since slice 13, and it needs you three times)

41. [ ] **Quit Chrome completely.** The seed script refuses while it is open, and
        it is right to.
42. [ ] `node scripts/seed-browser-profile.mjs` and follow what it prints. **This
        has never been run against real browser data**, only against an empty
        scratch directory. Watch what it says.
43. [ ] It copied your profile into the hub's own data directory, and told you the
        config row to add.
44. [ ] Add that row to `browser.profiles`, with a port no other profile uses.
45. [ ] `npm run browser:install` once, then `npm run browser`.
46. [ ] Restart the hub, open `/browser`, press OPEN. A browser window opens and
        **parks off the side of the screen** rather than minimizing.
47. [ ] The pane shows the page, moving, at a readable size.
48. [ ] Click a link in the pane. The real browser follows.
49. [ ] Type in the address box, press go. It navigates.
50. [ ] Type a phrase rather than an address: it searches with the engine in your
        config.
51. [ ] **You are signed in.** Open a site you have a login for and confirm the
        session is really there. That is the whole reason for the seed.
52. [ ] Press WINDOW. The real browser comes forward, so you can reach an
        extension popup or a download. Send it back.
53. [ ] **THE CONNECT HANDSHAKE.** In that browser, connect your AI browser
        session (the extension asks you to pick the browser, which is why no
        agent can do this). Confirm it attaches to the hub's copy and not to your
        everyday one.
54. [ ] With FOLLOW on, ask that session to open a tab. It lands in the pane
        rather than on your desktop.
55. [ ] Leave the pane for half an hour and come back. The browser is still there
        with its tabs, and the pane reopens on it. Nothing killed the browser.

## 6. The terminal (owed since slice 11, and the most important section)

**Read the warning on the setup page first, and mean it.**

56. [ ] `tmux -V` prints a version. If it does not, install tmux first.
57. [ ] Set `"terminal": { "enabled": true }` and add a pane:
        `{ "id": "shell", "kind": "terminal", "label": "SHELL", "cwd": "~/some-project" }`
58. [ ] `cd pty && npm install && npm start`
59. [ ] Restart the hub, open the WALL. The pane says it is ready to attach and
        does NOT connect on its own.
60. [ ] Press ATTACH. **xterm renders**: the prompt is legible, the colours are
        right, and the text is not clipped at the edges.
61. [ ] Run something long: `npm run dev` or `tail -f` a log. It streams.
62. [ ] Navigate to TODAY and back to the WALL. **The session is still running**
        and the pane replays its history rather than showing a blank screen.
63. [ ] **THE KEYSTROKE TRAP:** with the terminal focused, type a line containing
        digits, for example `echo 12345`. **The wall's number keys must not steal
        those digits to zoom panes.** The characters land in the shell. This is
        the single most likely defect in the whole walk.
64. [ ] Press Escape or click outside, then press `2`. NOW the wall zooms pane 2.
65. [ ] Press `0`. All panes come back, and the terminal **re-fits** to its new
        size rather than staying the old shape.
66. [ ] Press `F` for fullscreen. The terminal re-fits again, and the content is
        not cut off.
67. [ ] In a real terminal: `tmux ls` lists your session, and
        `tmux attach -t hub-shell` joins it. **The hub can never trap a process**,
        and this is the proof.
68. [ ] Detach (`Ctrl-b d`). The pane keeps working.
69. [ ] Kill the sidecar (`Ctrl-c` where you ran `npm start`). The pane says the
        sidecar is not running, in plain words. Start it again and re-attach: the
        session is still there with your long-running command in it.
70. [ ] Install a service file from `pty/deploy/`, replacing every placeholder
        path, and reboot. **The terminal comes back with everything else.**
71. [ ] Turn the module off again in config and restart. The pane says the module
        is off and names the key. No dead button.

## 7. Everything at once

72. [ ] Configure the wall the way you actually want it: your accounts, a browser
        pane, a terminal.
73. [ ] Open the WALL. Every pane renders, the grid takes its shape from the
        count, and nothing overlaps.
74. [ ] File an attention item from a terminal. **The toast appears over the
        wall**, and answering it does not disturb any pane.
75. [ ] Leave it running for a working day. At the end: the browser is still
        mirroring, the terminal session is still alive, and nothing has grown a
        spinner that never stops.

## 8. From your phone, optional but worth it

76. [ ] Set up Tailscale as the setup page describes, preferring
        `tailscale serve` so the bind stays on loopback.
77. [ ] Open the hub from your phone. It loads, and clicking things works. **If
        the page loads and every click is dead, the hostname is missing from
        `bind.allowedDevOrigins`**, which is the failure that costs an hour.
78. [ ] The copy buttons on SETUP work over `serve` (a real certificate) and fall
        back to selecting the text if you reached it over plain http.
79. [ ] Attach to a terminal session from the phone. **The desk layout does not
        collapse**: the phone shows part of the big session rather than reflowing
        it. Measured both ways in slice 11, never seen by a person.

## 9. The last look, as a stranger

80. [ ] Read the README top to bottom. Does anything claim something you did not
        just see?
81. [ ] Read the setup page the same way.
82. [ ] Anything that overclaims is the finding. Everything in this product is
        allowed to be missing. Nothing in it is allowed to lie.

---

## What to do with the findings

- A surface saying something untrue: fix it, and it is a release blocker.
- Something not built: it belongs on the not-built list, not in an apology.
- Something that needed a step nobody documented: that step belongs on the setup
  page, because that is the page's whole job.
- File the walk itself as a dated file in this folder, whether it went well or
  not. This folder is what "what was actually walked" means in this repo.
