// Markdown to HTML, for documents the hub shows you in place.
//
// SAFE BY CONSTRUCTION, not by a list of bad things. The documents rendered
// here are written by agents, scripts and other people's tools, and they are
// rendered inside the hub's own page, so a `<script>` in one of them would be
// running with the hub's own privileges against the hub's own API. Two
// mechanisms, both structural:
//
//   1. EVERY `<` IN THE SOURCE IS ESCAPED BEFORE PARSING. Markdown allows raw
//      HTML and this deliberately does not. The consequence is honest and worth
//      knowing: HTML inside a document shows up as text, because it was text.
//      A filter that tries to allow "safe" HTML is a filter someone has to keep
//      winning at forever, and this product has one maintainer.
//   2. The only tags in the output are the ones the parser emits, so link and
//      image targets are the one remaining hole, and any scheme that is not
//      http, https, mailto or a relative path is dropped.
//
// The parser is `marked`, which was already a dependency of this repo with no
// consumer. This is its first one.
import { marked } from "marked";

/** A leading YAML frontmatter block. Metadata for tools, noise for a reader. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** href/src values the browser would treat as code or as an inline payload. */
const UNSAFE_TARGET = /\s(href|src)\s*=\s*"(?!https?:|mailto:|#|\/|\.)[^"]*"/gi;

/** Render a markdown document to HTML the hub can put on a page. */
export function renderMarkdown(source: string): string {
  const body = source.replace(FRONTMATTER, "");
  // The escape happens BEFORE the parser sees the text, so there is no window
  // in which a tag exists in the tree and has to be removed again.
  const escaped = body.replace(/</g, "&lt;");
  const html = marked.parse(escaped, { async: false, gfm: true, breaks: false });
  return html.replace(UNSAFE_TARGET, "");
}
