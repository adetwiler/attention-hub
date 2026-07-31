"use client";
// REACHING YOU WHEN THE TAB IS NOT IN FRONT.
//
// The toast stack (AttentionToasts) is the interrupt channel while you are LOOKING at the
// hub. This is the one for when you are not, which is most of the time and is the whole
// reason the feed exists: you find out about something while you are doing something else.
//
// SRP, and it is why this is a module rather than a few lines in a component: OsAlerts
// decides WHAT to announce and WHEN (and obeys quiet hours doing it). This decides HOW it
// travels, and knows nothing about the feed.
//
// EVERY FAILURE MODE HERE IS SILENT BY NATURE - no permission, no secure context, a browser
// without the API - so every one of them is named as its own state rather than collapsed into
// a boolean. A UI that cannot tell "you said no" from "this browser cannot" will describe
// both as broken, and you will go looking in the wrong place.

/** Web notification permission, plus the two states the Notification API does not name.
 * `insecure`: a plain HTTP origin is not a secure context, so the API is absent BY DESIGN.
 * (Written out rather than as a scheme on purpose: the network gate reads shapes, not intent,
 * and a marker suppressing it would be a permanent claim about a line that is only prose.)
 * Reaching the hub at 127.0.0.1, or over https, is the fix - not a code change. */
export type AlertPermission = "granted" | "denied" | "default" | "unsupported" | "insecure";

export interface Alert {
  title: string;
  body: string;
}

export function webPermission(): AlertPermission {
  if (typeof window === "undefined") return "unsupported";
  // Order matters: an insecure context has no Notification at all in Chromium, so checking
  // for the API first would report "unsupported" and send someone hunting a browser bug
  // instead of reading the address bar.
  if (!window.isSecureContext) return "insecure";
  if (typeof Notification === "undefined") return "unsupported";
  const p = Notification.permission;
  return p === "granted" || p === "denied" ? p : "default";
}

/** Ask once. A browser only ever shows the prompt for a "default" origin, and Safari requires
 * a user gesture, which is why this is called from a button and never on mount. */
export async function requestWebAlerts(): Promise<AlertPermission> {
  if (webPermission() !== "default") return webPermission();
  try {
    await Notification.requestPermission();
  } catch {
    // Denied, dismissed, or a browser that rejects a non-gesture call. The next read of
    // permission is the truth either way, and there is nothing useful to report.
  }
  return webPermission();
}

const BODY_MAX = 200;

/** An OS banner truncates around here anyway, and a wall of text in a notification is worse
 * than a short one: it is the same content the card already holds in full. */
function trim(text: string): string {
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text;
}

async function show(alert: Alert): Promise<void> {
  const options: NotificationOptions = {
    body: trim(alert.body),
    // NO ICON, deliberately: this template ships no branding assets, and pointing `icon` at a
    // file that is not there is a 404 on every banner. Without it the browser uses its own,
    // which is correct and never broken. Add `icon` here if you give your fork a mark.
    //
    // NO TAG, also deliberately. A tag collapses banners that share it, so two things needing
    // you would arrive as one, and the count on your screen would disagree with the count in
    // the notification center.
  };
  // THE SERVICE WORKER FIRST: page-level `new Notification()` is unreliable once the hub is
  // installed as an app, and only a worker notification survives the page being backgrounded.
  // sw.js owns the click, because a worker notification's activation cannot be handled here.
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg !== undefined && typeof reg.showNotification === "function") {
      await reg.showNotification(alert.title, options);
      return;
    }
  } catch {
    // Fall through to the page-level constructor.
  }
  try {
    const n = new Notification(alert.title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // A browser that refuses must never take the hub down with it. The toast already showed.
  }
}

/**
 * Raise one OS banner per alert. A no-op unless permission has been granted, so callers do
 * not have to check first and cannot forget to.
 *
 * IF YOU EMBED THIS HUB IN A NATIVE SHELL (a WebView wrapper with its own notification
 * entitlement), this is the one function to widen: prefer the host's bridge here and leave
 * every caller untouched. That is deliberately not done in the template, because a bridge
 * with no host is an untested code path.
 */
export function deliver(alerts: readonly Alert[]): void {
  if (webPermission() !== "granted") return;
  for (const a of alerts) void show(a);
}

/**
 * The app-icon badge: how many things are waiting, on the Dock or taskbar icon.
 *
 * IT TRACKS THE QUEUE, NOT ARRIVALS. A badge fed by arrivals counts up and never comes down,
 * so answering everything would leave a number sitting on the icon forever, which is exactly
 * how people learn to stop believing a badge.
 *
 * Honored by Chromium browsers on an installed app. Absent elsewhere, where this is a no-op.
 */
export function setQueueBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const n = navigator as Navigator & {
    setAppBadge?: (c?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void n.setAppBadge?.(count).catch(() => undefined);
    else void n.clearAppBadge?.().catch(() => undefined);
  } catch {
    // Unsupported. Nothing to do and nothing to say.
  }
}
