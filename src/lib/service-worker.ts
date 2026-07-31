"use client";
// REGISTERING sw.js, in one place.
//
// It is its own module rather than a line inside whichever component happened to need it
// first, because of a real and expensive mistake in the build this hub came from: the
// registration lived inside an INSTALL button, the install button lived in the top bar, and
// one display mode rendered no top bar. The worker therefore never registered in the mode
// people actually used, and nothing errored, logged, or failed a typecheck.
//
// THE RULE THAT AVOIDS IT: register from a component that ALWAYS mounts, never from one that
// a layout or a preference can hide. Registration is idempotent (the same script for the same
// scope returns the same registration), so more than one caller is fine and cheap.
/** Register the network-only service worker. Safe from anywhere, any number of times. Never
 * throws: a browser without service workers is a smaller hub rather than a broken one. */
export function ensureServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
