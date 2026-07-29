import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The config file is read directly here rather than through src/lib/config.ts:
// next.config.ts is loaded before the app's module graph exists, and it must
// not drag the TypeScript loader (or better-sqlite3) in with it.
function devOrigins(): string[] {
  for (const file of ["hub.config.json", "hub.config.example.json"]) {
    try {
      // turbopackIgnore: a runtime read, not a static import. Without the marker
      // the tracer treats the whole repo as a dependency of every route.
      const raw: unknown = JSON.parse(
        readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), file), "utf8"),
      );
      if (typeof raw !== "object" || raw === null) continue;
      const bind: unknown = (raw as Record<string, unknown>)["bind"];
      if (typeof bind !== "object" || bind === null) continue;
      const list: unknown = (bind as Record<string, unknown>)["allowedDevOrigins"];
      if (Array.isArray(list)) return list.filter((h): h is string => typeof h === "string");
    } catch {
      // fall through to the next candidate, then to the empty default
    }
  }
  return [];
}

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module. It must stay external to the server
  // bundle or the app fails at runtime.
  serverExternalPackages: ["better-sqlite3"],

  // Next dev BLOCKS cross-origin dev resources by default. If you reach the hub
  // through any hostname other than the bind address (a reverse proxy, a VPN
  // name, a custom domain), chunks load and React boots but no fiber ever
  // attaches: the page renders and every click is dead. Loopback never
  // reproduces it, because loopback is same-origin. So the list comes from YOUR
  // config (bind.allowedDevOrigins), never from a name we hardcoded.
  allowedDevOrigins: devOrigins(),

  // `next build` and `next dev` share .next, so building in this checkout kills
  // the instance currently serving you. The self-build channel needs the hub to
  // survive building itself, so a build can be pointed at a scratch dist.
  distDir: process.env["HUB_DIST_DIR"] ?? ".next",
};

export default nextConfig;
