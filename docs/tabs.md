# Tabs: making the hub yours without writing code

A **tab** is a name plus what it points at. You add one to `hub.config.json`, you
restart the hub, and it is in the nav next to TODAY and the WALL. You write no
code, you clone no template, and you edit none of the hub's own files except your
config.

That is the only way this version lets you add a surface. Why, and what is coming
instead, is at the bottom of this page. It is worth reading before you go looking
for the plugin folder.

```jsonc
"tabs": [
  { "name": "YouTube", "url": "https://youtube.com" },
  { "name": "Notes",   "dir": "~/notes" }
]
```

**Editing the config takes effect on the next restart.** The whole file is read
once when the hub starts.

If you would rather not edit JSON at all, hand [`prompt.txt`](../prompt.txt) to
the AI command-line tool you already use. It reads `hub.config.example.json`,
interviews you, and writes your config. That prompt works with any tool, because
the specification it follows is the comments in the example file rather than
anything about a particular vendor.

## The two kinds

### A web page: `url`

```jsonc
{ "name": "YouTube", "url": "https://youtube.com" }
```

The address has to start with `http://` or `https://`.

A `url` tab renders through the **browser pane**, which is a real browser on this
machine, mirrored into the page, with your clicks forwarded to it. That is the
same mechanism the WALL's browser panes use, so a `url` tab added nothing new to
how the hub reaches the network: **the hub itself still fetches nothing.** Your
browser does, as it always did.

Two consequences worth knowing before you add one:

- It needs the browser pane set up once: a seeded profile in `browser.profiles`
  and the sidecar running (`npm run browser`). See
  [browser-pane.md](browser-pane.md). With nothing seeded, the tab opens and says
  so rather than showing you a blank rectangle.
- You get real logins, and sites that refuse to be framed work, because nothing
  here is an iframe. [ADR-0006](adr/0006-browser-pane-mirrors-a-real-browser.md)
  explains why that distinction is the whole design.

### A folder: `dir`

```jsonc
{ "name": "Notes", "dir": "~/notes" }
```

The tab lists the folder, folders first, then files, and hides nothing: a dotfile
in your notes folder is a file in your notes folder. Clicking a folder walks into
it. Clicking a file opens it **in the hub**, with markdown rendered as markdown,
which is the same promise the attention feed makes about the documents an item
points at: nothing throws you out of the hub.

A path may start with `~`. A relative path resolves against the hub's own folder.

Limits, all of them honest rather than silent:

- Files up to 512KB open in place. A bigger one says how big it is.
- A file that is not text (a screenshot, a database) says so instead of showing
  you a screenful of noise.
- A folder with more than 500 entries shows the first 500 and says how many there
  are.
- **A tab only ever shows you what it points at.** The folder comes from your
  config; the path inside it comes from the page you clicked. A path that would
  leave the folder is refused, symlinks included, so a link inside your notes
  folder cannot be used to read the rest of your disk.

## The rules

- **One or the other, never both.** A row with a `url` and a `dir`, or with
  neither, is reported as a mistake that names the row (`tabs[0]`). A tab points
  at one thing, and picking one for you would put a surface on screen that is not
  the one you described.
- **The name becomes the address.** `"Notes"` lives at `/tab/notes`. Add an `"id"`
  (a lowercase slug) when you want a fixed address that survives a rename, when
  two tabs would otherwise want the same one, or when the name is not written in
  the Latin alphabet.
- **Config order is nav order.**
- **No tabs is an honest empty state.** The nav says you have none and offers the
  page that explains them. It never shows you a sample tab.
- **A tab that points at a folder that is not there stays in the nav**, and its
  room tells you which key in `hub.config.json` to fix. A tab that quietly
  vanished would teach you that the hub is unreliable, when what happened is that
  your config has a typo.

## Recipes

**The thing you keep glancing at.** A dashboard, a docs site, a video you are
half-watching.

```jsonc
{ "name": "Docs", "url": "https://nextjs.org/docs" }
```

**Today's notes.** A folder of markdown, read in place, in the hub, next to the
work it is about.

```jsonc
{ "name": "Notes", "dir": "~/notes" }
```

**One project's plan.** Point at the folder, not the file: you will want the
neighbours.

```jsonc
{ "name": "Plan", "id": "plan", "dir": "~/work/thing/docs" }
```

**A second account's inbox**, if you have the browser pane set up with more than
one profile. The pane's own picker chooses the profile, and it remembers your
choice per tab.

```jsonc
{ "name": "Mail", "url": "https://mail.example.com" }
```

**Your own hub's repo**, so a `git pull` is one glance away.

```jsonc
{ "name": "Hub", "dir": "." }
```

## Where these docs stop, and why

**A tab owns no data and has nothing running behind it.** That is what makes it
safe to ship now: there is no lifecycle to manage, no state to migrate, and
nothing of yours for an update to break.

A surface with **code of its own** is a different thing. That is a **module**, it
lives in `user/`, and it is not built yet. So this page does not tell you to have
your AI edit the hub's source, and that omission is deliberate:

- **Updates in this version are a plain `git pull`.** There is no update channel
  yet, and no patching mechanism.
- **`user/` does not ship until the module system does.** Today there is no folder
  in this repo that an update is guaranteed not to touch, other than the three
  things already gitignored: your `hub.config.json`, your `data` folder, and
  anything you put in `user` yourself.
- So an edit to `src/` is an edit to a tracked file that the next release also
  edits, which is a merge conflict with your name on it. Teaching that would make
  the first support issues this project ever received self-inflicted.

If you want a surface a tab cannot give you, the useful thing to do is say so:
the hub's TODAY page carries a "not built yet" list where the module system is
the top row, and each row files a prefilled issue. What gets asked for gets
built, and reactions on those issues are the only vote count there is.

## When the module system lands, tabs keep working

This is written down here as well as in the code, because it is an obligation
rather than an intention.

A tab is a supported surface **from day one**. A release that gives someone
modules and quietly stops reading their `tabs` would break the config they wrote
on their first day, on the update that was supposed to give them more. So the
module system grows this shape rather than replacing it, and a `tabs` array
written today keeps meaning what it means now.

The interface is `HubTab` in [`src/lib/config.ts`](../src/lib/config.ts) and
`tabsView` / `tabRoom` in [`src/lib/tabs.ts`](../src/lib/tabs.ts). Both carry the
same note. The decision behind all of it is
[ADR-0003](adr/0003-tab-seam-over-module-system-for-v1.md).
