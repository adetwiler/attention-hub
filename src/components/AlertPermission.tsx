"use client";
// THE ONE-TIME ASK that lets the hub raise an OS banner (see lib/alert-channel.ts).
//
// A browser only grants notification permission to an origin in response to a real gesture,
// so parity with "it just interrupts you" needs exactly one button, pressed once, ever.
//
// IT RENDERS NOTHING UNLESS IT CAN DO SOMETHING. Already granted, already denied, no API, or
// a plain-http origin: null. That is not tidiness, it is the rule that makes it impossible
// for this hub to show a control that cannot work - which matters more than usual here,
// because every failure mode of notifications is silent, and a dead button would look exactly
// like a broken feature.
//
// DENIED IS DELIBERATELY SILENT rather than nagging: a browser will not re-prompt an origin it
// has denied, so a button would be a lie. `alertHint` carries that state in words for any
// surface that wants to explain itself, and the setup page is the place for it.
import { useCallback, useEffect, useState } from "react";
import { type AlertPermission as Perm, requestWebAlerts, webPermission } from "@/lib/alert-channel";

/** One sentence per state, in plain words. Exported so a settings or setup surface describes
 * this the same way the button does, instead of inventing a second vocabulary for it. */
export function alertHint(perm: Perm | null): string {
  switch (perm) {
    case "granted":
      return "On: the hub raises a system notification when something needs you, quiet hours included.";
    case "default":
      return "Off: turn this on and the hub can reach you when the tab is not in front.";
    case "denied":
      return "Blocked for this site. Re-allow notifications in your browser's site settings, from the padlock beside the address.";
    case "insecure":
      return "Not available over plain http. Reach the hub at 127.0.0.1, or over https, and this turns on.";
    case "unsupported":
      return "This browser has no notification support.";
    default:
      return "Checking...";
  }
}

export default function AlertPermission() {
  // SSR renders nothing and the client corrects on mount: Notification.permission does not
  // exist on the server, and guessing would flash a button at someone who granted long ago.
  const [perm, setPerm] = useState<Perm | null>(null);

  useEffect(() => {
    setPerm(webPermission());
    // Granting from the browser's OWN UI has to retire this button too, not just granting
    // through it. The Permissions API reports that; where it is missing we keep whatever the
    // request returned, which is the common path anyway.
    let status: PermissionStatus | null = null;
    const onChange = () => setPerm(webPermission());
    void navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => undefined);
    return () => status?.removeEventListener("change", onChange);
  }, []);

  const ask = useCallback(() => {
    void requestWebAlerts().then(setPerm);
  }, []);

  if (perm !== "default") return null;
  return (
    <button type="button" className="tab alerts" title={alertHint(perm)} onClick={ask}>
      ALERTS
    </button>
  );
}
