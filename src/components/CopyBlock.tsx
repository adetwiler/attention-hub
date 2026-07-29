"use client";
// A block of text with a button that copies it. Used by the setup page for the
// one-paste prompts, which are the whole point of that page: the user hands the
// text to their own AI tool and it does the step for them.
//
// THE HONEST FAILURE IS THE REASON THIS IS A COMPONENT AND NOT A ONE LINER. The
// clipboard API only exists in a SECURE CONTEXT. Loopback counts as one, so it
// works on this machine, and a plain http address on a private network does NOT,
// which is exactly the setup the reach-it-from-your-phone section recommends
// people move to. So a copy button that silently does nothing is a real state
// this page will meet, and it says so and tells you what to do instead rather
// than looking like it worked.
import { useRef, useState } from "react";

interface CopyBlockProps {
  /** The text to show and to copy. */
  text: string;
  /** What the button says before it is pressed. */
  label?: string;
}

type Result = "idle" | "copied" | "failed";

export default function CopyBlock({ text, label = "Copy" }: CopyBlockProps) {
  const [result, setResult] = useState<Result>("idle");
  const pre = useRef<HTMLPreElement>(null);

  async function copy(): Promise<void> {
    try {
      // navigator.clipboard is undefined outside a secure context, which is a
      // throw here rather than a silent no-op, and that is what we want.
      await navigator.clipboard.writeText(text);
      setResult("copied");
      window.setTimeout(() => setResult("idle"), 2000);
    } catch {
      // Select the text instead, so the next keystroke is a working copy.
      const node = pre.current;
      if (node !== null) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setResult("failed");
    }
  }

  return (
    <div className="copyblock">
      <div className="copyhead">
        <button className="btn" type="button" onClick={() => void copy()}>
          {result === "copied" ? "Copied" : label}
        </button>
        {result === "failed" ? (
          <span className="copywarn">
            Your browser would not let this page use the clipboard, which is normal when the hub is
            not on 127.0.0.1 or https. The text is selected: copy it yourself.
          </span>
        ) : null}
      </div>
      <pre className="doc-raw" ref={pre}>
        {text}
      </pre>
    </div>
  );
}
