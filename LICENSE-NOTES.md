# Licensing, in plain words

**[LICENSE](LICENSE) is the operative document.** This file explains it and
records the one deliberate exception. Nothing here changes the terms.

## Everything in this repository: MIT

All code, modules, docs, and assets are MIT. Run it, fork it, sell it if you
want to. See [LICENSE](LICENSE) for the full text.

## The one exception, the setup prompt: CC0 1.0, public domain

The copy-paste agent instructions this repo ships for setup (the setup prompt,
also mirrored on [buildwithamemory.com](https://buildwithamemory.com)) are
released under **CC0 1.0**. They are meant to be copied. Paste them, change
them, ship them in your own tool. No attribution and no permission needed.

Full text: <https://creativecommons.org/publicdomain/zero/1.0/>

**Why the carve-out:** the prompt is a thing you are TOLD to copy. Attaching
even MIT's attribution requirement to text whose entire purpose is to be pasted
into someone else's repo would be a trap rather than a licence. So it is public
domain, and that rule is inherited from the site it mirrors: the thing you are
told to copy is public domain.

## Why LICENSE is the bare MIT text

It used to open with these explanatory headings, and GitHub's licence detector
could not parse it, so the repository publicly displayed **no licence at all**.
For an MIT giveaway that is the worst possible outcome: no licence reads as all
rights reserved, which blocks exactly the reuse the project wants, and it is the
first thing an employer's software review looks at.

So `LICENSE` is now the bare, detectable text, and the explanation lives here.
**Keep it that way.** If you add anything to `LICENSE`, re-check that GitHub
still shows "MIT" on the repository page afterwards, and do not trust that the
file looks fine locally.

Decision record: [docs/adr/0001-mit-license-cc0-setup-prompt.md](docs/adr/0001-mit-license-cc0-setup-prompt.md).
