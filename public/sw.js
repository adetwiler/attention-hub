// THE HUB'S SERVICE WORKER - DELIBERATELY NETWORK-ONLY. It caches NOTHING.
//
// It exists for one reason: notifications. `registration.showNotification()` is the reliable
// way to raise an OS-level banner (page-level `new Notification()` is unreliable once the hub
// is installed as an app), and a notification shown by a worker can only have its CLICK
// handled here, in the worker.
//
// WHY NO CACHE, EXPLICITLY: a hub is useless offline, and a caching worker is how you end up
// staring at a version of the UI that no longer exists with no obvious way to tell. That is a
// far worse failure than the offline support it would buy. If you fork this and want caching,
// that is your decision to make deliberately, not one to inherit by accident.
//
// skipWaiting + clients.claim mean a NEW worker takes over immediately rather than waiting
// for every window to close, so this file can never pin an old one either.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Belt and braces: if any earlier version of this file ever cached anything, drop it.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Pass straight through. Present so the worker is well-formed; does nothing else, on purpose.
self.addEventListener("fetch", () => {});

// CLICKING A BANNER HAS TO LAND YOU IN THE HUB, and it must focus an EXISTING window before
// opening a new one. The hub is a thing you keep open; a click that spawns a second copy is
// worse than a click that does nothing.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
