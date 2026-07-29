// The root layout. Every room renders inside the one shell, and the shell's
// first paint is seeded server-side from the same snapshot the SSE stream
// emits, so the page is never blank before the stream connects.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { loadConfig } from "@/lib/config";
import { safeLedgerSnapshot } from "@/lib/stream";
import { hubVersion } from "@/lib/version";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attention Hub",
  description: "A local-only command center for AI-assisted work. Your machine, your data.",
};

// Everything here is per-request. The counts must never be baked at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  // A broken or absent config must not stop the hub from rendering a page that
  // explains itself, so the name falls back rather than throwing the layout.
  let hubName = "Attention Hub";
  try {
    hubName = loadConfig().hub.name;
  } catch {
    // the room says so honestly on the page itself
  }

  return (
    <html lang="en">
      <body>
        <Shell hubName={hubName} version={hubVersion()} initial={safeLedgerSnapshot()}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
